use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use bestscout_core::{
    AppliedTransaction, DatabaseSnapshot, EditTransaction, SnapshotBackup, TransactionJournal,
    apply_transaction, create_backup, restore_backup, undo_transaction,
};

#[derive(Clone)]
pub struct EditorStore {
    root: PathBuf,
    gate: Arc<Mutex<()>>,
}

impl EditorStore {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            gate: Arc::new(Mutex::new(())),
        }
    }

    pub fn apply(
        &self,
        journal_id: &str,
        snapshot: &DatabaseSnapshot,
        transaction: &EditTransaction,
    ) -> Result<AppliedTransaction, String> {
        let _guard = self
            .gate
            .lock()
            .map_err(|_| "Editor-Speicher ist nicht verfügbar".to_owned())?;
        validate_journal_id(journal_id)?;
        let applied =
            apply_transaction(snapshot, transaction).map_err(|error| error.to_string())?;
        let backup = create_backup(snapshot, transaction.created_at_utc.clone())
            .map_err(|error| error.to_string())?;
        self.persist_backup(&backup)?;
        let mut journal = self.load_journal(journal_id)?;
        journal
            .append(applied.journal_entry.clone())
            .map_err(|error| error.to_string())?;
        self.persist_journal(journal_id, &journal)?;
        Ok(applied)
    }

    pub fn undo(
        &self,
        journal_id: &str,
        snapshot: &DatabaseSnapshot,
        transaction_id: &str,
        undo_id: &str,
        created_at_utc: &str,
    ) -> Result<AppliedTransaction, String> {
        let _guard = self
            .gate
            .lock()
            .map_err(|_| "Editor-Speicher ist nicht verfügbar".to_owned())?;
        validate_journal_id(journal_id)?;
        let mut journal = self.load_journal(journal_id)?;
        let entry = journal
            .entries
            .iter()
            .find(|entry| entry.transaction_id == transaction_id)
            .cloned()
            .ok_or_else(|| format!("Transaktion {transaction_id} wurde nicht gefunden"))?;
        let applied = undo_transaction(snapshot, &entry, undo_id, created_at_utc)
            .map_err(|error| error.to_string())?;
        let backup = create_backup(snapshot, created_at_utc).map_err(|error| error.to_string())?;
        self.persist_backup(&backup)?;
        journal
            .append(applied.journal_entry.clone())
            .map_err(|error| error.to_string())?;
        self.persist_journal(journal_id, &journal)?;
        Ok(applied)
    }

    pub fn history(&self, journal_id: &str) -> Result<TransactionJournal, String> {
        let _guard = self
            .gate
            .lock()
            .map_err(|_| "Editor-Speicher ist nicht verfügbar".to_owned())?;
        validate_journal_id(journal_id)?;
        self.load_journal(journal_id)
    }

    pub fn restore(&self, snapshot_hash: &str) -> Result<DatabaseSnapshot, String> {
        let _guard = self
            .gate
            .lock()
            .map_err(|_| "Editor-Speicher ist nicht verfügbar".to_owned())?;
        if snapshot_hash.len() != 64
            || !snapshot_hash
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        {
            return Err("Backup-Hash ist ungültig".to_owned());
        }
        let contents = fs::read(self.backup_path(snapshot_hash))
            .map_err(|error| format!("Backup kann nicht gelesen werden: {error}"))?;
        let backup: SnapshotBackup = serde_json::from_slice(&contents)
            .map_err(|error| format!("Backup ist ungültig: {error}"))?;
        restore_backup(&backup).map_err(|error| error.to_string())
    }

    fn load_journal(&self, journal_id: &str) -> Result<TransactionJournal, String> {
        let path = self.journal_path(journal_id);
        match fs::read(path) {
            Ok(contents) => {
                let journal: TransactionJournal = serde_json::from_slice(&contents)
                    .map_err(|error| format!("Transaktionsjournal ist ungültig: {error}"))?;
                journal.validate().map_err(|error| error.to_string())?;
                Ok(journal)
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(TransactionJournal::default())
            }
            Err(error) => Err(format!(
                "Transaktionsjournal kann nicht gelesen werden: {error}"
            )),
        }
    }

    fn persist_journal(
        &self,
        journal_id: &str,
        journal: &TransactionJournal,
    ) -> Result<(), String> {
        let contents = serde_json::to_vec_pretty(journal).map_err(|error| {
            format!("Transaktionsjournal kann nicht serialisiert werden: {error}")
        })?;
        atomic_write(&self.journal_path(journal_id), &contents)
    }

    fn persist_backup(&self, backup: &SnapshotBackup) -> Result<(), String> {
        let path = self.backup_path(&backup.snapshot_hash);
        if path.exists() {
            let contents = fs::read(&path).map_err(|error| {
                format!("Vorhandenes Backup kann nicht gelesen werden: {error}")
            })?;
            let existing: SnapshotBackup = serde_json::from_slice(&contents)
                .map_err(|error| format!("Vorhandenes Backup ist ungültig: {error}"))?;
            restore_backup(&existing).map_err(|error| error.to_string())?;
            if existing.snapshot_hash != backup.snapshot_hash {
                return Err(
                    "Vorhandenes Backup stimmt nicht mit seinem Dateinamen überein".to_owned(),
                );
            }
            return Ok(());
        }
        let contents = serde_json::to_vec_pretty(backup)
            .map_err(|error| format!("Backup kann nicht serialisiert werden: {error}"))?;
        atomic_write(&path, &contents)
    }

    fn journal_path(&self, journal_id: &str) -> PathBuf {
        self.root
            .join("journals")
            .join(format!("{journal_id}.json"))
    }

    fn backup_path(&self, snapshot_hash: &str) -> PathBuf {
        self.root
            .join("backups")
            .join(format!("{snapshot_hash}.json"))
    }
}

fn validate_journal_id(journal_id: &str) -> Result<(), String> {
    if journal_id.is_empty()
        || journal_id.len() > 128
        || !journal_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("Journal-ID ist ungültig".to_owned());
    }
    Ok(())
}

fn atomic_write(path: &Path, contents: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Speicherpfad hat kein Elternverzeichnis".to_owned())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Editor-Verzeichnis kann nicht erstellt werden: {error}"))?;
    secure_directory(parent)?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = parent.join(format!(".bestscout-{}-{nonce}.tmp", std::process::id()));
    write_private_file(&temporary, contents)?;
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        return Err(format!(
            "Editor-Datei kann nicht atomar ersetzt werden: {error}"
        ));
    }
    Ok(())
}

#[cfg(unix)]
fn secure_directory(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
        .map_err(|error| format!("Editor-Verzeichnis kann nicht abgesichert werden: {error}"))
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
        .map_err(|error| format!("Temporäre Editor-Datei kann nicht erstellt werden: {error}"))?;
    file.write_all(contents)
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("Editor-Datei kann nicht geschrieben werden: {error}"))
}

#[cfg(not(unix))]
fn write_private_file(path: &Path, contents: &[u8]) -> Result<(), String> {
    fs::write(path, contents)
        .map_err(|error| format!("Editor-Datei kann nicht geschrieben werden: {error}"))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use bestscout_core::{
        EDITOR_SCHEMA_VERSION, EditEntityKind, EditOperation, FieldExpectation, snapshot_hash,
        synthetic_snapshot,
    };

    #[test]
    fn persists_a_private_journal_backup_and_verified_undo() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("bestscout-editor-store-{unique}"));
        let store = EditorStore::new(root.clone());
        let snapshot = synthetic_snapshot();
        let transaction = EditTransaction {
            schema_version: EDITOR_SCHEMA_VERSION,
            id: "tx-store".to_owned(),
            created_at_utc: "2026-07-21T20:00:00Z".to_owned(),
            reason: None,
            operations: vec![EditOperation {
                entity_kind: EditEntityKind::Player,
                entity_id: "player-ada".to_owned(),
                field: "potential_ability".to_owned(),
                expected_before: FieldExpectation::Exact(json!(174)),
                after: json!(180),
            }],
        };

        let applied = store
            .apply("save-fixture", &snapshot, &transaction)
            .unwrap();
        let history = store.history("save-fixture").unwrap();
        assert_eq!(history.entries.len(), 1);
        let restored = store
            .restore(&applied.journal_entry.snapshot_before_hash)
            .unwrap();
        assert_eq!(restored, snapshot);

        let undone = store
            .undo(
                "save-fixture",
                &applied.snapshot,
                "tx-store",
                "tx-store-undo",
                "2026-07-21T20:01:00Z",
            )
            .unwrap();
        assert_eq!(
            snapshot_hash(&undone.snapshot).unwrap(),
            snapshot_hash(&snapshot).unwrap()
        );
        assert_eq!(store.history("save-fixture").unwrap().entries.len(), 2);

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let journal_mode = fs::metadata(store.journal_path("save-fixture"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777;
            let backup_mode =
                fs::metadata(store.backup_path(&applied.journal_entry.snapshot_before_hash))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777;
            assert_eq!(journal_mode, 0o600);
            assert_eq!(backup_mode, 0o600);
        }

        fs::remove_dir_all(root).unwrap();
    }
}
