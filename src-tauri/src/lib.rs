use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconEvent,
    WebviewUrl,
    Emitter, Manager,
};

fn ensure_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        return;
    }
    // Window was closed — create a new one
    if let Ok(w) = tauri::WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title("Worktime Tracker")
        .inner_size(1024.0, 720.0)
        .build()
    {
        if let Ok(icon) = Image::from_bytes(include_bytes!("../icons/128x128.png")) {
            let _ = w.set_icon(icon);
        }
    }
}

#[tauri::command]
fn send_notification(_app: tauri::AppHandle, title: String, body: String) {
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("notify-send")
            .arg("--app-name=Worktime Tracker")
            .arg(&title)
            .arg(&body)
            .spawn();
    }
    #[cfg(not(target_os = "linux"))]
    {
        use tauri_plugin_notification::NotificationExt;
        let _ = _app.notification()
            .builder()
            .title(&title)
            .body(&body)
            .show();
    }
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
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            ensure_window(app);
        }))
        .invoke_handler(tauri::generate_handler![update_tray, send_notification])
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Show Worktime", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            let tray = app.tray_by_id("main").expect("tray not found");
            tray.set_menu(Some(menu))?;
            tray.set_tooltip(Some("Worktime"))?;

            tray.on_menu_event(|app, event| match event.id().as_ref() {
                "show" => ensure_window(app),
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
                    ensure_window(tray.app_handle());
                }
            });

            if let Some(window) = app.get_webview_window("main") {
                if let Ok(icon) = Image::from_bytes(include_bytes!("../icons/128x128.png")) {
                    let _ = window.set_icon(icon);
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
