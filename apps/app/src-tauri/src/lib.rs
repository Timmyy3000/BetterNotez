/// Opens the library folder in the system file manager. The path is passed as an argument, never through a shell.
#[tauri::command]
async fn reveal_folder(path: String) -> Result<(), String> {
    let opener = if cfg!(target_os = "windows") {
        "explorer"
    } else if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };
    // Some file managers exit with a failure status even when the folder opens, so the status is not checked.
    std::process::Command::new(opener)
        .arg(&path)
        .status()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![reveal_folder])
        .run(tauri::generate_context!())
        .expect("error while running BetterNotez");
}
