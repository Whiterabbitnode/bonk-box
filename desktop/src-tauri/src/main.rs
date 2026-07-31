// Bonk Box for the desktop: a small always-on-top window with the toy inside,
// a menu-bar stickman for showing and hiding it, and a hotkey to summon it.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};

// On macOS, hiding the only window also tucks the application away, and
// window.show() on its own will not bring it back - the app has to be unhidden
// first or the hotkey looks like it only works once.
fn toggle(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        #[cfg(target_os = "macos")]
        let _ = app.show();
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
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
                use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

                let summon = Shortcut::new(Some(Modifiers::ALT | Modifiers::SUPER), Code::KeyB);
                let handle = app.handle().clone();
                let registered = app.global_shortcut().on_shortcut(summon, move |_app, _sc, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle(&handle);
                    }
                });
                if let Err(err) = registered {
                    eprintln!("Bonk Box: Opt+Cmd+B is already spoken for, carrying on without it ({err})");
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Bonk Box could not open its page");
}
