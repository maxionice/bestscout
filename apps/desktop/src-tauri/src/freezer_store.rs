use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use bestscout_core::{FreezePlan, validate_freeze_plan};

const MAXIMUM_PLAN_FILE_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Clone)]
pub struct FreezerStore {
    root: PathBuf,
    gate: Arc<Mutex<()>>,
}

impl FreezerStore {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            gate: Arc::new(Mutex::new(())),
        }
    }

    pub fn list(&self) -> Result<Vec<FreezePlan>, String> {
        let _guard = self
            .gate
            .lock()
            .map_err(|_| "Freezer-Speicher ist nicht verfügbar".to_owned())?;
        let entries = match fs::read_dir(&self.root) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => {
                return Err(format!(
                    "Freezer-Verzeichnis kann nicht gelesen werden: {error}"
                ));
            }
        };
        let mut plans = Vec::new();
        for entry in entries {
            let entry = entry.map_err(|error| format!("Freezer-Eintrag ist ungültig: {error}"))?;
            let file_type = entry
                .file_type()
                .map_err(|error| format!("Freezer-Dateityp kann nicht gelesen werden: {error}"))?;
            if !file_type.is_file()
                || entry.path().extension().and_then(|value| value.to_str()) != Some("json")
            {
                continue;
            }
            let metadata = entry
                .metadata()
                .map_err(|error| format!("Freezer-Datei kann nicht geprüft werden: {error}"))?;
            if metadata.len() > MAXIMUM_PLAN_FILE_BYTES {
                return Err(format!(
                    "Freezer-Datei {} überschreitet das Größenlimit",
                    entry.path().display()
                ));
            }
            let contents = fs::read(entry.path())
                .map_err(|error| format!("Freezer-Plan kann nicht gelesen werden: {error}"))?;
            let plan: FreezePlan = serde_json::from_slice(&contents)
                .map_err(|error| format!("Freezer-Plan ist ungültig: {error}"))?;
            validate_freeze_plan(&plan).map_err(|error| error.to_string())?;
            let expected_name = format!("{}.json", plan.id);
            if entry.file_name().to_str() != Some(expected_name.as_str()) {
                return Err("Freezer-Plan stimmt nicht mit seinem Dateinamen überein".to_owned());
            }
            plans.push(plan);
        }
        plans.sort_by(|left, right| {
            right
                .updated_at_utc
                .cmp(&left.updated_at_utc)
                .then_with(|| left.id.cmp(&right.id))
        });
        Ok(plans)
    }

    pub fn upsert(&self, plan: &FreezePlan) -> Result<(), String> {
        let _guard = self
            .gate
            .lock()
            .map_err(|_| "Freezer-Speicher ist nicht verfügbar".to_owned())?;
        validate_freeze_plan(plan).map_err(|error| error.to_string())?;
        let contents = serde_json::to_vec_pretty(plan)
            .map_err(|error| format!("Freezer-Plan kann nicht serialisiert werden: {error}"))?;
        if contents.len() as u64 > MAXIMUM_PLAN_FILE_BYTES {
            return Err("Freezer-Plan überschreitet das Größenlimit".to_owned());
        }
        atomic_write(&self.path_for(&plan.id)?, &contents)
    }

    pub fn delete(&self, plan_id: &str) -> Result<(), String> {
        let _guard = self
            .gate
            .lock()
            .map_err(|_| "Freezer-Speicher ist nicht verfügbar".to_owned())?;
        let path = self.path_for(plan_id)?;
        match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("Freezer-Plan kann nicht gelöscht werden: {error}")),
        }
    }

    fn path_for(&self, plan_id: &str) -> Result<PathBuf, String> {
        validate_plan_id(plan_id)?;
        Ok(self.root.join(format!("{plan_id}.json")))
    }
}

fn validate_plan_id(plan_id: &str) -> Result<(), String> {
    if plan_id.is_empty()
        || plan_id.len() > 128
        || !plan_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("Freezer-Plan-ID ist ungültig".to_owned());
    }
    Ok(())
}

fn atomic_write(path: &Path, contents: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Freezer-Speicherpfad hat kein Elternverzeichnis".to_owned())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Freezer-Verzeichnis kann nicht erstellt werden: {error}"))?;
    secure_directory(parent)?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = parent.join(format!(
        ".bestscout-freezer-{}-{nonce}.tmp",
        std::process::id()
    ));
    write_private_file(&temporary, contents)?;
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        return Err(format!(
            "Freezer-Plan kann nicht atomar ersetzt werden: {error}"
        ));
    }
    Ok(())
}

#[cfg(unix)]
fn secure_directory(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
        .map_err(|error| format!("Freezer-Verzeichnis kann nicht abgesichert werden: {error}"))
}

#[cfg(not(unix))]
fn secure_directory(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(unix)]
fn write_private_file(path: &Path, contents: &[u8]) -> Result<(), String> {
    use std::{io::Write, os::unix::fs::OpenOptionsExt};
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(path)
        .map_err(|error| format!("Temporäre Freezer-Datei kann nicht erstellt werden: {error}"))?;
    file.write_all(contents)
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("Freezer-Datei kann nicht geschrieben werden: {error}"))
}

#[cfg(not(unix))]
fn write_private_file(path: &Path, contents: &[u8]) -> Result<(), String> {
    fs::write(path, contents)
        .map_err(|error| format!("Freezer-Datei kann nicht geschrieben werden: {error}"))
}

#[cfg(test)]
mod tests {
    use bestscout_core::{
        EditEntityKind, FREEZER_SCHEMA_VERSION, FreezePolicy, FreezeRule, SnapshotSource,
    };
    use serde_json::json;

    use super::*;

    fn plan(id: &str, updated_at_utc: &str) -> FreezePlan {
        FreezePlan {
            schema_version: FREEZER_SCHEMA_VERSION,
            id: id.to_owned(),
            name: format!("Plan {id}"),
            created_at_utc: "2026-07-22T09:00:00Z".to_owned(),
            updated_at_utc: updated_at_utc.to_owned(),
            snapshot_source: SnapshotSource::Synthetic,
            enabled: true,
            rules: vec![FreezeRule {
                entity_kind: EditEntityKind::Player,
                entity_id: "player-ada".to_owned(),
                field: "attributes.passing".to_owned(),
                baseline: json!(17),
                policy: FreezePolicy::AllowIncrease,
            }],
        }
    }

    #[test]
    fn atomically_persists_lists_updates_and_deletes_private_plans() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("bestscout-freezer-store-{unique}"));
        let store = FreezerStore::new(root.clone());
        assert!(store.list().unwrap().is_empty());

        store
            .upsert(&plan("older", "2026-07-22T09:00:00Z"))
            .unwrap();
        store
            .upsert(&plan("newer", "2026-07-22T10:00:00Z"))
            .unwrap();
        assert_eq!(
            store
                .list()
                .unwrap()
                .iter()
                .map(|plan| plan.id.as_str())
                .collect::<Vec<_>>(),
            vec!["newer", "older"]
        );

        let updated = plan("older", "2026-07-22T11:00:00Z");
        store.upsert(&updated).unwrap();
        assert_eq!(store.list().unwrap()[0], updated);

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(store.path_for("older").unwrap())
                .unwrap()
                .permissions()
                .mode()
                & 0o777;
            assert_eq!(mode, 0o600);
        }

        store.delete("newer").unwrap();
        assert_eq!(store.list().unwrap().len(), 1);
        store.delete("newer").unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_path_traversal_identifiers() {
        let store = FreezerStore::new(std::env::temp_dir());
        assert!(store.delete("../editor").is_err());
    }
}
