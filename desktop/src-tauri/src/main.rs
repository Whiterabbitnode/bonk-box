// Bonk Box for the desktop: a small always-on-top window with the toy inside,
// a menu-bar stickman for showing and hiding it, and a hotkey to summon it.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WebviewWindow,
};

fn toggle(window: &WebviewWindow) {
    match window.is_visible() {
        Ok(true) => {
            let _ = window.hide();
        }
        _ => {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let show_hide = MenuItem::with_id(app, "toggle", "Show / Hide", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Bonk Box", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_hide, &quit])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .icon_as_template(true)
                .tooltip("Bonk Box")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "toggle" => {
                        if let Some(window) = app.get_webview_window("main") {
                            toggle(&window);
                        }
                    }
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
                        if let Some(window) = handle.get_webview_window("main") {
                            toggle(&window);
                        }
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
