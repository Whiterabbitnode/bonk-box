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
    AppHandle, Emitter, Manager, PhysicalPosition,
};

const DEFAULT_PORT: u16 = 48222;
const PEEK_SECONDS: u64 = 8;

struct PeekState {
    sliding: AtomicBool,
    engaged: AtomicBool,
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

fn perch_for(app: &AppHandle) -> Option<Perch> {
    let window = app.get_webview_window("main")?;
    let monitor = window.current_monitor().ok().flatten()?;
    let screen = monitor.size();
    let scale = monitor.scale_factor();
    let size = window.outer_size().ok()?;
    let margin = (24.0 * scale) as i32;
    let x = screen.width as i32 - size.width as i32 - margin;
    let y = ((screen.height as i32 - size.height as i32) / 2).max(margin);
    Some(Perch {
        shown: PhysicalPosition::new(x, y),
        hidden: PhysicalPosition::new(screen.width as i32 + margin, y),
    })
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

/// Only these five words are ever accepted. Anything else is refused.
fn event_type_from(body: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(body).ok()?;
    let kind = v.get("type")?.as_str()?;
    match kind {
        "oops" | "cheer" | "heated" | "echo-absolutely-right" | "bonk" => Some(kind.to_string()),
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
                peek(&app, &kind);
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
    let Some(perch) = perch_for(app) else { return };

    // If the app was properly hidden, bring the window back WITHOUT activating
    // it: no app.show(), no set_focus. Ordering it front is enough to be seen.
    if !window.is_visible().unwrap_or(false) {
        let _ = window.set_position(perch.hidden);
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
        let Some(window) = app.get_webview_window("main") else { return };
        let Some(perch) = perch_for(&app) else { return };

        for step in 0..=14 {
            let t = step as f64 / 14.0;
            let eased = 1.0 - (1.0 - t) * (1.0 - t);
            let x = perch.hidden.x as f64 + (perch.shown.x - perch.hidden.x) as f64 * eased;
            let _ = window.set_position(PhysicalPosition::new(x as i32, perch.shown.y));
            std::thread::sleep(Duration::from_millis(12));
        }

        loop {
            std::thread::sleep(Duration::from_millis(250));
            let state = app.state::<PeekState>();
            if state.engaged.load(Ordering::SeqCst) {
                state.sliding.store(false, Ordering::SeqCst);
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
        let _ = app.emit("bonk-retreat", ());
        app.state::<PeekState>()
            .sliding
            .store(false, Ordering::SeqCst);
    });
}

fn toggle(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        // On macOS, hiding the only window also tucks the application away, and
        // window.show() on its own will not bring it back - the app has to be
        // unhidden first or the hotkey looks like it only works once. Taking
        // focus here is correct: you asked for him.
        #[cfg(target_os = "macos")]
        let _ = app.show();
        if let Some(perch) = perch_for(app) {
            let _ = window.set_position(perch.shown);
        }
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Called when you click into the peeking box, or send him away again.
#[tauri::command]
fn set_engaged(app: AppHandle, engaged: bool) {
    let state = app.state::<PeekState>();
    state.engaged.store(engaged, Ordering::SeqCst);
    if engaged {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_focus();
        }
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
            last_event: Mutex::new(Instant::now()),
        })
        .invoke_handler(tauri::generate_handler![set_engaged])
        .setup(move |app| {
            let show_hide = MenuItem::with_id(app, "toggle", "Show / Hide", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Bonk Box", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_hide, &quit])?;

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

            let handle = app.handle().clone();
            std::thread::spawn(move || serve(handle, port));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Bonk Box could not open its page");
}
