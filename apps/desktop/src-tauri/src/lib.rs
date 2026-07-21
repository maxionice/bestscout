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

#[tauri::command]
fn search_database(
    snapshot: bestscout_core::DatabaseSnapshot,
    query: bestscout_core::GlobalSearchQuery,
) -> Vec<bestscout_core::SearchHit> {
    bestscout_core::global_search(&snapshot, &query)
}

#[tauri::command]
fn query_players(
    players: Vec<bestscout_core::Player>,
    query: bestscout_core::PlayerQuery,
) -> bestscout_core::PlayerQueryResult {
    bestscout_core::query_players(&players, &query)
}

#[tauri::command]
fn load_synthetic_snapshot() -> bestscout_core::DatabaseSnapshot {
    bestscout_core::synthetic_snapshot()
}

#[tauri::command]
fn validate_snapshot(
    snapshot: bestscout_core::DatabaseSnapshot,
) -> bestscout_core::SnapshotValidationReport {
    bestscout_core::validate_snapshot(&snapshot)
}

#[tauri::command]
fn list_roles() -> Vec<bestscout_core::RoleProfile> {
    bestscout_core::builtin_roles().to_vec()
}

#[tauri::command]
fn find_similar_players(
    players: Vec<bestscout_core::Player>,
    reference_id: String,
    role_id: Option<String>,
    limit: usize,
) -> Result<Vec<bestscout_core::SimilarPlayer>, String> {
    let reference = players
        .iter()
        .find(|player| player.id == reference_id)
        .ok_or_else(|| format!("reference player {reference_id} was not found"))?;
    Ok(bestscout_core::find_similar_players(
        reference,
        &players,
        role_id.as_deref(),
        limit,
    ))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            parse_csv,
            detect_fm26,
            inspect_fm26_process,
            search_database,
            query_players,
            load_synthetic_snapshot,
            validate_snapshot,
            list_roles,
            find_similar_players
        ])
        .run(tauri::generate_context!())
        .expect("failed to run BestScout");
}
