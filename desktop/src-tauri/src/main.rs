// Bonk Box for the desktop: a small always-on-top window with the toy inside,
// a menu-bar stickman for showing and hiding it, a hotkey to summon it, and a
// localhost listener so your coding agent can poke him.
//
// PRIVACY: the listener accepts an event TYPE from a short allow-list and
// nothing else. No prompt text, no file paths and no tool output ever crosses
// it, and nothing is written to disk.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddrV4, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition,
};

const FULL_W: f64 = 560.0;
const FULL_H: f64 = 460.0;
/* Ambient events open a small box in the corner rather than the whole toy -
   he should be able to say something without taking over your screen. */
const MINI_W: f64 = 380.0;
const MINI_H: f64 = 280.0;

const DEFAULT_PORT: u16 = 48222;
const PEEK_SECONDS: u64 = 8;

/// Puts the sliding flag back down on every exit path, including early
/// returns and panics.
struct SlideGuard(AppHandle);
impl Drop for SlideGuard {
    fn drop(&mut self) {
        self.0
            .state::<PeekState>()
            .sliding
            .store(false, Ordering::SeqCst);
    }
}

struct PeekState {
    sliding: AtomicBool,
    engaged: AtomicBool,
    /// True only when YOU opened him - hotkey, bonk, or clicking into a peek.
    /// Everything else is a visit he pays himself, and those must not linger.
    user_opened: AtomicBool,
    last_event: Mutex<Instant>,
}

/// Where the window rests while peeking, and where it waits out of sight.
///
/// Peeking slides the window by POSITION and never calls show, hide or focus.
/// That is the only way to be certain a peek can never take your keyboard
/// mid-sentence, which was the ruling.
struct Perch {
    shown: PhysicalPosition<i32>,
    hidden: PhysicalPosition<i32>,
}

/// NEVER ask the window which monitor it is on. `current_monitor()` returns
/// None once the window sits outside every screen - which is exactly where the
/// retreat parks it - so a perch derived from it fails precisely when it is
/// needed to bring him back. Always work from the primary screen instead.
fn primary(app: &AppHandle) -> Option<tauri::Monitor> {
    if let Ok(Some(m)) = app.primary_monitor() {
        return Some(m);
    }
    app.available_monitors().ok()?.into_iter().next()
}

fn corner() -> String {
    config_path()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|v| v.get("peekCorner").and_then(|c| c.as_str()).map(String::from))
        .unwrap_or_else(|| "top-right".into())
}

fn perch_for(app: &AppHandle) -> Option<Perch> {
    let window = app.get_webview_window("main")?;
    let monitor = primary(app)?;
    let screen = monitor.size();
    let origin = monitor.position();
    let scale = monitor.scale_factor();
    let size = window.outer_size().ok()?;
    let margin = (24.0 * scale) as i32;
    let w = size.width as i32;
    let h = size.height as i32;

    let right = origin.x + screen.width as i32 - w - margin;
    let left = origin.x + margin;
    let top = origin.y + margin;
    let bottom = origin.y + screen.height as i32 - h - margin;

    let (x, y) = match corner().as_str() {
        "top-left" => (left, top),
        "bottom-left" => (left, bottom),
        "bottom-right" => (right, bottom),
        _ => (right, top),
    };
    let off = origin.x + screen.width as i32 + margin;
    let off_left = origin.x - w - margin;
    Some(Perch {
        shown: PhysicalPosition::new(x, y),
        hidden: PhysicalPosition::new(if x <= left { off_left } else { off }, y),
    })
}

/// Ambient events get the small box; you asking for him gets the whole toy.
fn set_compact(app: &AppHandle, compact: bool) {
    let Some(window) = app.get_webview_window("main") else { return };
    let size = if compact {
        LogicalSize::new(MINI_W, MINI_H)
    } else {
        LogicalSize::new(FULL_W, FULL_H)
    };
    let _ = window.set_size(size);
    let _ = window.eval(&format!(
        "document.body.classList.toggle('compact',{})",
        compact
    ));
}

/// A clamp, not a heuristic: if the window's frame touches no screen at all,
/// put it back in the middle of the primary one. Called before every show and
/// every peek, and once at launch, because a window nobody can see makes the
/// whole feature fail silently - the worst way for it to fail.
fn ensure_on_screen(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return };
    let Ok(pos) = window.outer_position() else { return };
    let Ok(size) = window.outer_size() else { return };
    let (w, h) = (size.width as i32, size.height as i32);

    let monitors = app.available_monitors().unwrap_or_default();
    let visible = monitors.iter().any(|m| {
        let o = m.position();
        let s = m.size();
        // Any overlap at all counts as reachable.
        pos.x < o.x + s.width as i32
            && pos.x + w > o.x
            && pos.y < o.y + s.height as i32
            && pos.y + h > o.y
    });
    if visible {
        return;
    }

    if let Some(m) = primary(app) {
        let o = m.position();
        let s = m.size();
        let x = o.x + (s.width as i32 - w) / 2;
        let y = o.y + (s.height as i32 - h) / 2;
        let _ = window.set_position(PhysicalPosition::new(x.max(o.x), y.max(o.y)));
    }
}

fn config_path() -> Option<std::path::PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(std::path::Path::new(&home).join(".config/bonk-box/config.json"))
}

fn read_config() -> (u16, bool) {
    let mut port = DEFAULT_PORT;
    let mut auto_focus = false;
    if let Some(path) = config_path() {
        if let Ok(raw) = std::fs::read_to_string(path) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
                if let Some(p) = v.get("port").and_then(|p| p.as_u64()) {
                    if p > 1024 && p < 65536 {
                        port = p as u16;
                    }
                }
                // Opt-in only, and off by default: a box that grabs your
                // keyboard while you are typing is a box you uninstall.
                if let Some(f) = v.get("autoFocus").and_then(|f| f.as_bool()) {
                    auto_focus = f;
                }
            }
        }
    }
    (port, auto_focus)
}

/// ---- updates ---------------------------------------------------------
/// Ask GitHub, quietly, whether there is a newer build. Any failure at all -
/// no network, rate limit, odd JSON - is a silent skip. The toy never nags and
/// never blocks on this.
fn fetch_latest() -> Option<(String, String)> {
    let out = std::process::Command::new("curl")
        .args([
            "-fsSL",
            "--max-time",
            "6",
            "-H",
            "Accept: application/vnd.github+json",
            "https://api.github.com/repos/eddiesanjuan/bonk-box/releases/latest",
        ])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let v: serde_json::Value = serde_json::from_slice(&out.stdout).ok()?;
    let tag = v.get("tag_name")?.as_str()?.trim_start_matches('v').to_string();
    let url = v
        .get("assets")?
        .as_array()?
        .iter()
        .find(|a| {
            a.get("name")
                .and_then(|n| n.as_str())
                .map(|n| n.ends_with(".app.zip"))
                .unwrap_or(false)
        })?
        .get("browser_download_url")?
        .as_str()?
        .to_string();
    Some((tag, url))
}

fn parts(v: &str) -> (u32, u32, u32) {
    let mut it = v.split('.').map(|p| p.parse::<u32>().unwrap_or(0));
    (
        it.next().unwrap_or(0),
        it.next().unwrap_or(0),
        it.next().unwrap_or(0),
    )
}

fn is_newer(candidate: &str, running: &str) -> bool {
    parts(candidate) > parts(running)
}

/// Once a day on launch, or whenever asked from the tray.
fn should_check_today() -> bool {
    let Some(dir) = config_path().and_then(|p| p.parent().map(|d| d.to_path_buf())) else {
        return true;
    };
    let stamp = dir.join("last-update-check");
    let today = std::process::Command::new("date")
        .arg("+%Y-%m-%d")
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();
    if std::fs::read_to_string(&stamp).map(|s| s.trim() == today).unwrap_or(false) {
        return false;
    }
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::write(&stamp, &today);
    true
}

fn check_for_updates(app: AppHandle, forced: bool) {
    std::thread::spawn(move || {
        if !forced && !should_check_today() {
            return;
        }
        // Give the page a moment to exist before talking to it, or the
        // announcement lands in a webview that has not loaded yet.
        std::thread::sleep(Duration::from_millis(2500));
        let Some((tag, url)) = fetch_latest() else { return };
        let running = env!("CARGO_PKG_VERSION");
        if !is_newer(&tag, running) {
            if forced {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.eval("window.Bonk&&Bonk.Agent&&Bonk.Agent.upToDate()");
                }
            }
            return;
        }
        if let Some(w) = app.get_webview_window("main") {
            // Tag and url come from GitHub's own JSON for this one repo.
            let _ = w.eval(&format!(
                "window.Bonk&&Bonk.Agent&&Bonk.Agent.updateReady({},{})",
                serde_json::to_string(&tag).unwrap_or_default(),
                serde_json::to_string(&url).unwrap_or_default()
            ));
        }
        peek(&app, "update");
    });
}

/// Stage the whole thing before touching /Applications, so a failed download
/// can never leave you with half an app.
#[tauri::command]
fn apply_update(app: AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("https://github.com/eddiesanjuan/bonk-box/") {
        return Err("that download does not come from Bonk Box".into());
    }
    let tmp = std::env::temp_dir().join("bonk-box-update");
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    let zip = tmp.join("bonkbox.zip");

    let got = std::process::Command::new("curl")
        .args(["-fsSL", "--max-time", "120", "-o"])
        .arg(&zip)
        .arg(&url)
        .status()
        .map_err(|e| e.to_string())?;
    if !got.success() {
        return Err("the download did not finish".into());
    }

    let unpacked = tmp.join("unpacked");
    std::fs::create_dir_all(&unpacked).map_err(|e| e.to_string())?;
    let ok = std::process::Command::new("ditto")
        .args(["-x", "-k"])
        .arg(&zip)
        .arg(&unpacked)
        .status()
        .map_err(|e| e.to_string())?;
    if !ok.success() {
        return Err("could not unpack the download".into());
    }

    let staged = unpacked.join("Bonk Box.app");
    if !staged.join("Contents/MacOS").exists() {
        return Err("that download does not look like Bonk Box".into());
    }

    // A tiny helper outlives us: waits for this process to go, swaps the app,
    // and opens the new one. Standard macOS self-replace.
    let helper = tmp.join("swap.sh");
    let script = format!(
        "#!/bin/bash\nfor i in $(seq 1 60); do pgrep -f 'Bonk Box.app/Contents/MacOS' >/dev/null || break; sleep 0.5; done\nrm -rf '/Applications/Bonk Box.app'\nditto '{}' '/Applications/Bonk Box.app'\nxattr -cr '/Applications/Bonk Box.app' 2>/dev/null\nopen -a '/Applications/Bonk Box.app'\n",
        staged.display()
    );
    std::fs::write(&helper, script).map_err(|e| e.to_string())?;
    std::process::Command::new("chmod")
        .arg("+x")
        .arg(&helper)
        .status()
        .map_err(|e| e.to_string())?;
    std::process::Command::new("nohup")
        .arg("bash")
        .arg(&helper)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;

    app.exit(0);
    Ok(())
}

/// Which events are allowed to put a window on your screen.
///
/// He appears for the things you asked for and for the one thing worth
/// interrupting you about. Everything else happens quietly in a box you are
/// not looking at, which is the whole point of not being a nuisance.
/// Re-enable per event in config.json if you want the chatty version.
fn may_peek(kind: &str) -> bool {
    let allowed_by_default = matches!(kind, "heated" | "bonk" | "update");
    let key = match kind {
        "oops" => "oops",
        "cheer" => "cheer",
        "echo-absolutely-right" => "echo",
        _ => return allowed_by_default,
    };
    config_path()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|v| v.get("peekOn").and_then(|o| o.get(key)).and_then(|b| b.as_bool()))
        .unwrap_or(false)
}

/// Only these five words are ever accepted. Anything else is refused.
fn event_type_from(body: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(body).ok()?;
    let kind = v.get("type")?.as_str()?;
    match kind {
        "oops" | "cheer" | "heated" | "echo-absolutely-right" | "bonk" => Some(kind.to_string()),
        // "update" is ours, raised internally - it is not accepted over the wire.
        _ => None,
    }
}

fn respond(mut stream: TcpStream, status: &str) {
    let _ = stream.write_all(
        format!("HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").as_bytes(),
    );
    let _ = stream.flush();
}

fn serve(app: AppHandle, port: u16) {
    // Loopback only, so nothing off this machine can reach it.
    let addr = SocketAddrV4::new(Ipv4Addr::LOCALHOST, port);
    let listener = match TcpListener::bind(addr) {
        Ok(l) => l,
        Err(err) => {
            eprintln!("Bonk Box: port {port} is busy, carrying on without the listener ({err})");
            return;
        }
    };

    for stream in listener.incoming() {
        let Ok(mut stream) = stream else { continue };
        let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));

        let mut buf = [0u8; 2048];
        let read = stream.read(&mut buf).unwrap_or(0);
        let raw = String::from_utf8_lossy(&buf[..read]).to_string();
        let body = raw.split("\r\n\r\n").nth(1).unwrap_or("");

        match event_type_from(body) {
            Some(kind) => {
                respond(stream, "204 No Content");
                // Drive the reaction directly rather than relying on the JS
                // event bridge being wired up: the toy is a plain script that
                // may load before the bridge exists, and a peek with no
                // reaction is worse than no peek at all. `kind` can only be one
                // of five hard-coded words, so this is not injectable.
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.eval(&format!(
                        "window.Bonk&&Bonk.Agent&&Bonk.Agent.react('{kind}')"
                    ));
                }
                let _ = app.emit("bonk-event", kind.clone());
                if may_peek(&kind) {
                    peek(&app, &kind);
                }
            }
            None => respond(stream, "400 Bad Request"),
        }
    }
}

/// Slide him into view for a look, then slide him back out.
fn peek(app: &AppHandle, kind: &str) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    // If the app was properly hidden, bring the window back WITHOUT activating
    // it: no app.show(), no set_focus. Ordering it front is enough to be seen.
    app.state::<PeekState>()
        .user_opened
        .store(false, Ordering::SeqCst);
    // Shrink first, so the perch is computed for the small box.
    set_compact(app, true);
    if !window.is_visible().unwrap_or(false) {
        if let Some(perch) = perch_for(app) {
            let _ = window.set_position(perch.hidden);
        }
        let _ = window.show();
    }

    let (_, auto_focus) = read_config();
    if auto_focus {
        let _ = window.set_focus();
    }

    {
        let state = app.state::<PeekState>();
        if let Ok(mut t) = state.last_event.lock() {
            *t = Instant::now();
        }
        if state.sliding.swap(true, Ordering::SeqCst) {
            return; // already on screen or on its way
        }
    }
    let _ = kind;

    let app = app.clone();
    std::thread::spawn(move || {
        // Whatever happens below, the flag comes back down. Leaking it once
        // wedges every future peek into an early return, which is how the
        // feature died silently in the first place.
        let _guard = SlideGuard(app.clone());

        let Some(window) = app.get_webview_window("main") else { return };
        let Some(perch) = perch_for(&app) else { return };

        // Slide from wherever he actually is, not from a hard-coded off-screen
        // point - otherwise an event while he is already on screen yanks him
        // out of sight before bringing him back.
        let from = window
            .outer_position()
            .map(|p| p.x)
            .unwrap_or(perch.hidden.x);
        for step in 0..=14 {
            let t = step as f64 / 14.0;
            let eased = 1.0 - (1.0 - t) * (1.0 - t);
            let x = from as f64 + (perch.shown.x - from) as f64 * eased;
            let _ = window.set_position(PhysicalPosition::new(x as i32, perch.shown.y));
            std::thread::sleep(Duration::from_millis(12));
        }

        loop {
            std::thread::sleep(Duration::from_millis(250));
            let state = app.state::<PeekState>();
            if state.engaged.load(Ordering::SeqCst) {
                return; // clicked into: he stays until you send him away
            }
            let idle = state
                .last_event
                .lock()
                .map(|t| t.elapsed().as_secs())
                .unwrap_or(PEEK_SECONDS);
            if idle >= PEEK_SECONDS {
                break;
            }
        }

        for step in 0..=14 {
            let t = step as f64 / 14.0;
            let eased = t * t;
            let x = perch.shown.x as f64 + (perch.hidden.x - perch.shown.x) as f64 * eased;
            let _ = window.set_position(PhysicalPosition::new(x as i32, perch.shown.y));
            std::thread::sleep(Duration::from_millis(12));
        }
        // Actually hide, rather than leaving it parked at the edge. "Gone"
        // has to mean zero pixels, and hiding also means the window can never
        // be left living outside every screen.
        let _ = window.hide();
        let _ = app.emit("bonk-retreat", ());
    });
}

fn toggle(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let state = app.state::<PeekState>();
    if window.is_visible().unwrap_or(false) {
        state.user_opened.store(false, Ordering::SeqCst);
        let _ = window.hide();
    } else {
        state.user_opened.store(true, Ordering::SeqCst);
        // On macOS, hiding the only window also tucks the application away, and
        // window.show() on its own will not bring it back - the app has to be
        // unhidden first or the hotkey looks like it only works once. Taking
        // focus here is correct: you asked for him.
        #[cfg(target_os = "macos")]
        let _ = app.show();
        set_compact(app, false);
        if let Some(perch) = perch_for(app) {
            let _ = window.set_position(perch.shown);
        }
        ensure_on_screen(app);
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Called when you click into the peeking box, or send him away again.
/// He is finished and should leave completely. Called when the ask is answered
/// or times out. Relying on the retreat thread is not enough: clicking any
/// button also marks him engaged, which makes that thread bow out without ever
/// retreating - which is exactly why he used to linger after "I'm calm".
#[tauri::command]
fn stand_down(app: AppHandle) {
    let state = app.state::<PeekState>();
    state.engaged.store(false, Ordering::SeqCst);
    state.sliding.store(false, Ordering::SeqCst);
    state.user_opened.store(false, Ordering::SeqCst);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
        // Resize only once he is out of sight, then leave him somewhere sane
        // so a later show can never reveal a window hanging off the edge.
        set_compact(&app, false);
        if let Some(perch) = perch_for(&app) {
            let _ = window.set_position(perch.shown);
        }
        ensure_on_screen(&app);
    }
}

/// The invariant, enforced once a second: if you did not open him, and he is
/// not mid-slide and not engaged, he is not on your screen. Every dismissal
/// path already hides him; this is what makes "gone" true even down a path
/// nobody thought of, which is how the sliver survived three fixes.
fn watch_visibility(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(1000));
        let Some(window) = app.get_webview_window("main") else { return };
        let state = app.state::<PeekState>();
        if state.user_opened.load(Ordering::SeqCst)
            || state.sliding.load(Ordering::SeqCst)
            || state.engaged.load(Ordering::SeqCst)
        {
            continue;
        }
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        }
    });
}

#[tauri::command]
fn set_engaged(app: AppHandle, engaged: bool) {
    let state = app.state::<PeekState>();
    state.engaged.store(engaged, Ordering::SeqCst);
    if engaged {
        // You clicked into him, so he gets the whole box and may take focus.
        state.user_opened.store(true, Ordering::SeqCst);
        set_compact(&app, false);
        if let Some(m) = primary(&app) {
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(size) = window.outer_size() {
                    let o = m.position();
                    let s = m.size();
                    let x = o.x + (s.width as i32 - size.width as i32) / 2;
                    let y = o.y + (s.height as i32 - size.height as i32) / 2;
                    let _ = window.set_position(PhysicalPosition::new(x, y));
                }
                let _ = window.set_focus();
            }
        }
        ensure_on_screen(&app);
    } else if let Ok(mut t) = state.last_event.lock() {
        // Start the retreat countdown from now.
        *t = Instant::now() - Duration::from_secs(PEEK_SECONDS.saturating_sub(1));
    }
}

fn main() {
    let (port, _) = read_config();

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(PeekState {
            sliding: AtomicBool::new(false),
            engaged: AtomicBool::new(false),
            user_opened: AtomicBool::new(false),
            last_event: Mutex::new(Instant::now()),
        })
        .invoke_handler(tauri::generate_handler![set_engaged, apply_update, stand_down])
        .setup(move |app| {
            let show_hide = MenuItem::with_id(app, "toggle", "Show / Hide", true, None::<&str>)?;
            let updates = MenuItem::with_id(app, "updates", "Check for Updates", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Bonk Box", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_hide, &updates, &quit])?;

            // A template icon uses only its alpha channel, so this has to be
            // the bare stickman on transparency - handing it the app icon, which
            // has an opaque paper-coloured background, paints a solid blob in
            // the menu bar.
            let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;

            TrayIconBuilder::new()
                .icon(tray_icon)
                .icon_as_template(true)
                .tooltip("Bonk Box")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "toggle" => toggle(app),
                    "updates" => check_for_updates(app.clone(), true),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            // Option+Command+B summons him. If something else on the machine
            // already owns that combination we simply carry on without it -
            // a busy hotkey is never a reason for the toy to fall over.
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{
                    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
                };

                let summon = Shortcut::new(Some(Modifiers::ALT | Modifiers::SUPER), Code::KeyB);
                let handle = app.handle().clone();
                let registered =
                    app.global_shortcut()
                        .on_shortcut(summon, move |_app, _sc, event| {
                            if event.state() == ShortcutState::Pressed {
                                toggle(&handle);
                            }
                        });
                if let Err(err) = registered {
                    eprintln!("Bonk Box: Opt+Cmd+B is already spoken for, carrying on without it ({err})");
                }
            }

            // A saved position from a previous run can land off every screen.
            ensure_on_screen(&app.handle().clone());

            let handle = app.handle().clone();
            std::thread::spawn(move || serve(handle, port));

            // Launching the app IS you opening him, so the watchdog must not
            // treat the startup window as an uninvited peek and hide it.
            app.state::<PeekState>()
                .user_opened
                .store(true, Ordering::SeqCst);

            check_for_updates(app.handle().clone(), false);
            watch_visibility(app.handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Bonk Box could not open its page");
}
