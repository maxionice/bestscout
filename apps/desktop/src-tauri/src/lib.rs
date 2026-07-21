use bestscout_core::ImportResult;

#[tauri::command]
fn parse_csv(contents: String) -> Result<ImportResult, String> {
    bestscout_core::import_players(&contents).map_err(|error| error.to_string())
}

#[tauri::command]
fn detect_fm26() -> bestscout_live::LiveEnvironment {
    bestscout_live::discover_environment()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![parse_csv, detect_fm26])
        .run(tauri::generate_context!())
        .expect("failed to run BestScout");
}
