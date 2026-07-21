use bestscout_core::ImportResult;

#[tauri::command]
fn parse_csv(contents: String) -> Result<ImportResult, String> {
    bestscout_core::import_players(&contents).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![parse_csv])
        .run(tauri::generate_context!())
        .expect("failed to run BestScout");
}
