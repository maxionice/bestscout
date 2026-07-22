mod editor_store;
mod freezer_store;

use bestscout_core::ImportResult;
use tauri::Manager;

use editor_store::EditorStore;
use freezer_store::FreezerStore;

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
async fn load_live_snapshot() -> Result<bestscout_core::DatabaseSnapshot, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let environment = bestscout_live::discover_environment();
        if !environment.reader_allowed {
            return Err(
                "Live-Domänendaten sind erst nach übereinstimmender Build- und Bridge-Freigabe verfügbar"
                    .to_owned(),
            );
        }
        let installation = environment
            .installations
            .first()
            .ok_or_else(|| "FM26-Installation wurde nicht gefunden".to_owned())?;
        bestscout_live::BridgeClient::from_installation(&installation.root)
            .map_err(|error| error.to_string())?
            .read_snapshot()
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Live-Snapshot-Aufgabe fehlgeschlagen: {error}"))?
}

#[tauri::command]
async fn apply_snapshot_transaction(
    store: tauri::State<'_, EditorStore>,
    journal_id: String,
    snapshot: bestscout_core::DatabaseSnapshot,
    transaction: bestscout_core::EditTransaction,
) -> Result<bestscout_core::AppliedTransaction, String> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || store.apply(&journal_id, &snapshot, &transaction))
        .await
        .map_err(|error| format!("Editor-Aufgabe fehlgeschlagen: {error}"))?
}

#[tauri::command]
async fn preview_snapshot_transaction(
    snapshot: bestscout_core::DatabaseSnapshot,
    transaction: bestscout_core::EditTransaction,
) -> Result<bestscout_core::AppliedTransaction, String> {
    tauri::async_runtime::spawn_blocking(move || {
        bestscout_core::apply_transaction(&snapshot, &transaction)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Editor-Vorschau fehlgeschlagen: {error}"))?
}

#[tauri::command]
async fn prepare_mass_edit(
    snapshot: bestscout_core::DatabaseSnapshot,
    request: bestscout_core::MassEditRequest,
) -> Result<bestscout_core::PreparedMassEdit, String> {
    tauri::async_runtime::spawn_blocking(move || {
        bestscout_core::prepare_mass_edit(&snapshot, &request).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Masseneditor-Vorschau fehlgeschlagen: {error}"))?
}

#[tauri::command]
async fn undo_snapshot_transaction(
    store: tauri::State<'_, EditorStore>,
    journal_id: String,
    snapshot: bestscout_core::DatabaseSnapshot,
    transaction_id: String,
    undo_id: String,
    created_at_utc: String,
) -> Result<bestscout_core::AppliedTransaction, String> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        store.undo(
            &journal_id,
            &snapshot,
            &transaction_id,
            &undo_id,
            &created_at_utc,
        )
    })
    .await
    .map_err(|error| format!("Editor-Undo-Aufgabe fehlgeschlagen: {error}"))?
}

#[tauri::command]
fn editor_history(
    store: tauri::State<'_, EditorStore>,
    journal_id: String,
) -> Result<bestscout_core::TransactionJournal, String> {
    store.history(&journal_id)
}

#[tauri::command]
fn restore_snapshot_backup(
    store: tauri::State<'_, EditorStore>,
    snapshot_hash: String,
) -> Result<bestscout_core::DatabaseSnapshot, String> {
    store.restore(&snapshot_hash)
}

#[tauri::command]
fn list_freeze_plans(
    store: tauri::State<'_, FreezerStore>,
) -> Result<Vec<bestscout_core::FreezePlan>, String> {
    store.list()
}

#[tauri::command]
fn upsert_freeze_plan(
    store: tauri::State<'_, FreezerStore>,
    plan: bestscout_core::FreezePlan,
) -> Result<(), String> {
    store.upsert(&plan)
}

#[tauri::command]
fn delete_freeze_plan(
    store: tauri::State<'_, FreezerStore>,
    plan_id: String,
) -> Result<(), String> {
    store.delete(&plan_id)
}

#[tauri::command]
async fn evaluate_freeze_plan(
    snapshot: bestscout_core::DatabaseSnapshot,
    plan: bestscout_core::FreezePlan,
    checked_at_utc: String,
) -> Result<bestscout_core::FreezeReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        bestscout_core::evaluate_freeze_plan(&snapshot, &plan, checked_at_utc)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Freezer-Prüfung fehlgeschlagen: {error}"))?
}

#[tauri::command]
async fn prepare_freeze_correction(
    snapshot: bestscout_core::DatabaseSnapshot,
    plan: bestscout_core::FreezePlan,
    transaction_id: String,
    created_at_utc: String,
) -> Result<bestscout_core::PreparedFreezeCorrection, String> {
    tauri::async_runtime::spawn_blocking(move || {
        bestscout_core::prepare_freeze_correction(&snapshot, &plan, transaction_id, created_at_utc)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Freezer-Korrekturvorschau fehlgeschlagen: {error}"))?
}

#[tauri::command]
async fn analyse_player_availability(
    snapshot: bestscout_core::DatabaseSnapshot,
    criteria: bestscout_core::AvailabilityCriteria,
) -> Result<bestscout_core::AvailabilityReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        bestscout_core::analyse_player_availability(&snapshot, criteria)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Verfügbarkeitsanalyse fehlgeschlagen: {error}"))?
}

#[tauri::command]
async fn prepare_availability_action(
    snapshot: bestscout_core::DatabaseSnapshot,
    request: bestscout_core::AvailabilityActionRequest,
) -> Result<bestscout_core::PreparedAvailabilityAction, String> {
    tauri::async_runtime::spawn_blocking(move || {
        bestscout_core::prepare_availability_action(&snapshot, &request)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Verfügbarkeitsvorschau fehlgeschlagen: {error}"))?
}

#[tauri::command]
async fn prepare_transfer_action(
    snapshot: bestscout_core::DatabaseSnapshot,
    request: bestscout_core::TransferActionRequest,
) -> Result<bestscout_core::PreparedTransferAction, String> {
    tauri::async_runtime::spawn_blocking(move || {
        bestscout_core::prepare_transfer_action(&snapshot, &request)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Transfervorschau fehlgeschlagen: {error}"))?
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

#[tauri::command]
fn analyse_squad(
    players: Vec<bestscout_core::Player>,
    as_of: bestscout_core::GameDate,
) -> bestscout_core::SquadAnalysis {
    bestscout_core::analyse_squad(&players, as_of)
}

#[tauri::command]
fn analyse_scout_intelligence(
    snapshot: bestscout_core::DatabaseSnapshot,
    criteria: bestscout_core::IntelligenceCriteria,
) -> bestscout_core::ScoutIntelligenceReport {
    bestscout_core::analyse_scout_intelligence(&snapshot, &criteria)
}

#[tauri::command]
fn export_shortlist(
    document: bestscout_core::ShortlistDocument,
    players: Vec<bestscout_core::Player>,
    format: bestscout_core::ShortlistFormat,
) -> Result<String, String> {
    bestscout_core::export_shortlist(document, &players, format).map_err(|error| error.to_string())
}

#[tauri::command]
fn import_shortlist(
    contents: String,
    format: bestscout_core::ShortlistFormat,
) -> Result<bestscout_core::ShortlistDocument, String> {
    bestscout_core::import_shortlist(&contents, format).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let root = app.path().app_data_dir()?.join("editor");
            app.manage(EditorStore::new(root));
            let freezer_root = app.path().app_data_dir()?.join("freezer").join("plans");
            app.manage(FreezerStore::new(freezer_root));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            parse_csv,
            detect_fm26,
            load_live_snapshot,
            preview_snapshot_transaction,
            prepare_mass_edit,
            apply_snapshot_transaction,
            undo_snapshot_transaction,
            editor_history,
            restore_snapshot_backup,
            list_freeze_plans,
            upsert_freeze_plan,
            delete_freeze_plan,
            evaluate_freeze_plan,
            prepare_freeze_correction,
            analyse_player_availability,
            prepare_availability_action,
            prepare_transfer_action,
            inspect_fm26_process,
            search_database,
            query_players,
            load_synthetic_snapshot,
            validate_snapshot,
            list_roles,
            find_similar_players,
            analyse_squad,
            analyse_scout_intelligence,
            export_shortlist,
            import_shortlist
        ])
        .run(tauri::generate_context!())
        .expect("failed to run BestScout");
}
