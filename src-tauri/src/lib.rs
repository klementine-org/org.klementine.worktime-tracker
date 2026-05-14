use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconEvent,
    Emitter, Manager,
};

use tauri_plugin_notification::NotificationExt;

#[tauri::command]
fn send_notification(app: tauri::AppHandle, title: String, body: String) {
    let _ = app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show();
}

#[tauri::command]
fn update_tray(app: tauri::AppHandle, title: String) {
    if let Some(tray) = app.tray_by_id("main") {
        if title.is_empty() {
            let _ = tray.set_tooltip(Some("Worktime"));
            let _ = tray.set_title(None::<&str>);
        } else {
            let tooltip = format!("Worktime — {}", title);
            let _ = tray.set_tooltip(Some(&tooltip));
            let _ = tray.set_title(Some(&title));
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![update_tray, send_notification])
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Show Worktime", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            let tray = app.tray_by_id("main").expect("tray not found");
            tray.set_menu(Some(menu))?;
            tray.set_tooltip(Some("Worktime"))?;

            tray.on_menu_event(|app, event| match event.id().as_ref() {
                "show" => {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.unminimize();
                        let _ = w.set_focus();
                    }
                }
                "quit" => {
                    let _ = app.emit("app://before-quit", ());
                    let handle = app.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(300));
                        handle.exit(0);
                    });
                }
                _ => {}
            });

            tray.on_tray_icon_event(|tray, event| {
                if matches!(event, TrayIconEvent::Click { .. }) {
                    let app = tray.app_handle();
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.unminimize();
                        let _ = w.set_focus();
                    }
                }
            });

            // Set window icon for the taskbar/dock on Linux
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(icon) = Image::from_bytes(include_bytes!("../icons/128x128.png")) {
                    let _ = window.set_icon(icon);
                }
            }

            // Intercept window close → just hide to tray (tracking continues)
            if let Some(window) = app.get_webview_window("main") {
                let w = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = w.hide();
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
