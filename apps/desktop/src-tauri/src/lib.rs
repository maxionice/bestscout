use bestscout_core::ImportResult;

#[tauri::command]
fn parse_csv(contents: String) -> Result<ImportResult, String> {
    bestscout_core::import_players(&contents).map_err(|error| error.to_string())
}

#[tauri::command]
async fn detect_fm26() -> Result<bestscout_live::LiveEnvironment, String> {
    tauri::async_runtime::spawn_blocking(bestscout_live::discover_environment)
        .await
        .map_err(|error| format!("FM26 detection task failed: {error}"))
}

#[tauri::command]
fn inspect_fm26_process(pid: u32) -> Result<bestscout_live::ProcessInspection, String> {
    bestscout_live::inspect_process(pid).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            parse_csv,
            detect_fm26,
            inspect_fm26_process
        ])
        .run(tauri::generate_context!())
        .expect("failed to run BestScout");
}
