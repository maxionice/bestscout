use std::collections::HashSet;

use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::Value;
use sha2::{Digest, Sha256};
use thiserror::Error;

use crate::{DatabaseSnapshot, validate_snapshot};

pub const EDITOR_SCHEMA_VERSION: u32 = 1;
const MAXIMUM_OPERATIONS: usize = 5_000;
const MAXIMUM_IDENTIFIER_BYTES: usize = 128;
const MAXIMUM_REASON_BYTES: usize = 1_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EditEntityKind {
    Player,
    Staff,
    Club,
    Competition,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(tag = "mode", content = "value", rename_all = "snake_case")]
pub enum FieldExpectation {
    #[default]
    Any,
    Exact(Value),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EditOperation {
    pub entity_kind: EditEntityKind,
    pub entity_id: String,
    pub field: String,
    #[serde(default)]
    pub expected_before: FieldExpectation,
    pub after: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EditTransaction {
    pub schema_version: u32,
    pub id: String,
    pub created_at_utc: String,
    pub reason: Option<String>,
    pub operations: Vec<EditOperation>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PresetStrategy {
    Set { value: Value },
    AddNumber { delta: f64 },
    ScaleNumber { factor: f64 },
    ClampNumber { minimum: f64, maximum: f64 },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PresetChange {
    pub field: String,
    pub strategy: PresetStrategy,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EditorPreset {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub entity_kind: EditEntityKind,
    pub changes: Vec<PresetChange>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MassEditRequest {
    pub transaction_id: String,
    pub created_at_utc: String,
    pub reason: Option<String>,
    pub entity_ids: Vec<String>,
    pub preset: EditorPreset,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PreparedMassEdit {
    pub transaction: EditTransaction,
    pub preview: AppliedTransaction,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JournalChange {
    pub entity_kind: EditEntityKind,
    pub entity_id: String,
    pub field: String,
    pub before: Value,
    pub after: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JournalEntry {
    pub schema_version: u32,
    pub transaction_id: String,
    pub created_at_utc: String,
    pub reason: Option<String>,
    pub reverts_transaction_id: Option<String>,
    pub snapshot_before_hash: String,
    pub snapshot_after_hash: String,
    pub changes: Vec<JournalChange>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AppliedTransaction {
    pub snapshot: DatabaseSnapshot,
    pub journal_entry: JournalEntry,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SnapshotBackup {
    pub schema_version: u32,
    pub created_at_utc: String,
    pub snapshot_hash: String,
    pub snapshot: DatabaseSnapshot,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TransactionJournal {
    pub schema_version: u32,
    pub entries: Vec<JournalEntry>,
}

impl Default for TransactionJournal {
    fn default() -> Self {
        Self {
            schema_version: EDITOR_SCHEMA_VERSION,
            entries: Vec::new(),
        }
    }
}

impl TransactionJournal {
    pub fn validate(&self) -> Result<(), TransactionError> {
        if self.schema_version != EDITOR_SCHEMA_VERSION
            || self
                .entries
                .iter()
                .any(|entry| entry.schema_version != EDITOR_SCHEMA_VERSION)
        {
            return Err(TransactionError::UnsupportedSchema);
        }
        let mut ids = HashSet::with_capacity(self.entries.len());
        for entry in &self.entries {
            if !ids.insert(entry.transaction_id.as_str()) {
                return Err(TransactionError::DuplicateTransactionId(
                    entry.transaction_id.clone(),
                ));
            }
        }
        if self
            .entries
            .windows(2)
            .any(|pair| pair[0].snapshot_after_hash != pair[1].snapshot_before_hash)
        {
            return Err(TransactionError::BrokenJournalChain);
        }
        Ok(())
    }

    pub fn append(&mut self, entry: JournalEntry) -> Result<(), TransactionError> {
        self.validate()?;
        if entry.schema_version != EDITOR_SCHEMA_VERSION {
            return Err(TransactionError::UnsupportedSchema);
        }
        if self
            .entries
            .iter()
            .any(|current| current.transaction_id == entry.transaction_id)
        {
            return Err(TransactionError::DuplicateTransactionId(
                entry.transaction_id,
            ));
        }
        if self
            .entries
            .last()
            .is_some_and(|previous| previous.snapshot_after_hash != entry.snapshot_before_hash)
        {
            return Err(TransactionError::BrokenJournalChain);
        }
        self.entries.push(entry);
        Ok(())
    }
}

#[derive(Debug, Error)]
pub enum TransactionError {
    #[error("editor schema version is unsupported")]
    UnsupportedSchema,
    #[error("transaction identifier or timestamp is empty or too long")]
    InvalidMetadata,
    #[error("transaction must contain between 1 and {MAXIMUM_OPERATIONS} operations")]
    InvalidOperationCount,
    #[error("editor preset metadata, targets or changes are invalid")]
    InvalidPreset,
    #[error("preset does not change any selected value")]
    NoChanges,
    #[error("preset strategy requires a finite numeric value in field {0}")]
    NumericStrategyRequired(String),
    #[error("every edit operation must include the exact value shown in its preview")]
    MissingExpectation,
    #[error("transaction contains the same entity field more than once")]
    DuplicateOperation,
    #[error("field {field} is not editable for {entity_kind:?}")]
    UnsupportedField {
        entity_kind: EditEntityKind,
        field: String,
    },
    #[error("{entity_kind:?} entity {entity_id} was not found")]
    EntityNotFound {
        entity_kind: EditEntityKind,
        entity_id: String,
    },
    #[error("field {0} does not exist in the canonical entity")]
    FieldNotFound(String),
    #[error("field {field} changed since the edit preview was created")]
    Conflict { field: String },
    #[error("edited value cannot be converted to the canonical entity: {0}")]
    InvalidValue(#[source] serde_json::Error),
    #[error("edited snapshot failed validation with {0} issue(s)")]
    InvalidSnapshot(usize),
    #[error("snapshot serialization failed: {0}")]
    SnapshotSerialization(#[source] serde_json::Error),
    #[error("current snapshot does not match the transaction being undone")]
    UndoSnapshotMismatch,
    #[error("undo did not restore the original snapshot hash")]
    UndoVerificationFailed,
    #[error("backup snapshot hash does not match its contents")]
    BackupHashMismatch,
    #[error("live read-back hash does not match the committed transaction")]
    ReadBackMismatch,
    #[error("transaction journal already contains ID {0}")]
    DuplicateTransactionId(String),
    #[error("transaction journal hash chain is broken")]
    BrokenJournalChain,
}

pub fn apply_transaction(
    snapshot: &DatabaseSnapshot,
    transaction: &EditTransaction,
) -> Result<AppliedTransaction, TransactionError> {
    apply_transaction_internal(snapshot, transaction, None)
}

pub fn prepare_mass_edit(
    snapshot: &DatabaseSnapshot,
    request: &MassEditRequest,
) -> Result<PreparedMassEdit, TransactionError> {
    validate_preset(request)?;
    let operation_count = request
        .entity_ids
        .len()
        .checked_mul(request.preset.changes.len())
        .ok_or(TransactionError::InvalidOperationCount)?;
    if operation_count == 0 || operation_count > MAXIMUM_OPERATIONS {
        return Err(TransactionError::InvalidOperationCount);
    }
    let mut operations = Vec::with_capacity(operation_count);
    for entity_id in &request.entity_ids {
        let entity = entity_value(snapshot, request.preset.entity_kind, entity_id)?;
        for change in &request.preset.changes {
            let before = value_at_path(&entity, &change.field)
                .cloned()
                .or_else(|| is_attribute_path(&change.field).then_some(Value::Null))
                .ok_or_else(|| TransactionError::FieldNotFound(change.field.clone()))?;
            let after = apply_preset_strategy(&before, &change.field, &change.strategy)?;
            if before == after {
                continue;
            }
            operations.push(EditOperation {
                entity_kind: request.preset.entity_kind,
                entity_id: entity_id.clone(),
                field: change.field.clone(),
                expected_before: FieldExpectation::Exact(before),
                after,
            });
        }
    }
    if operations.is_empty() {
        return Err(TransactionError::NoChanges);
    }
    let transaction = EditTransaction {
        schema_version: EDITOR_SCHEMA_VERSION,
        id: request.transaction_id.clone(),
        created_at_utc: request.created_at_utc.clone(),
        reason: request
            .reason
            .clone()
            .or_else(|| Some(format!("Preset {}", request.preset.name))),
        operations,
    };
    let preview = apply_transaction(snapshot, &transaction)?;
    Ok(PreparedMassEdit {
        transaction,
        preview,
    })
}

pub fn undo_transaction(
    snapshot: &DatabaseSnapshot,
    entry: &JournalEntry,
    undo_id: impl Into<String>,
    created_at_utc: impl Into<String>,
) -> Result<AppliedTransaction, TransactionError> {
    if snapshot_hash(snapshot)? != entry.snapshot_after_hash {
        return Err(TransactionError::UndoSnapshotMismatch);
    }
    let transaction = EditTransaction {
        schema_version: EDITOR_SCHEMA_VERSION,
        id: undo_id.into(),
        created_at_utc: created_at_utc.into(),
        reason: Some(format!("Undo {}", entry.transaction_id)),
        operations: entry
            .changes
            .iter()
            .rev()
            .map(|change| EditOperation {
                entity_kind: change.entity_kind,
                entity_id: change.entity_id.clone(),
                field: change.field.clone(),
                expected_before: FieldExpectation::Exact(change.after.clone()),
                after: change.before.clone(),
            })
            .collect(),
    };
    let applied =
        apply_transaction_internal(snapshot, &transaction, Some(entry.transaction_id.clone()))?;
    if applied.journal_entry.snapshot_after_hash != entry.snapshot_before_hash {
        return Err(TransactionError::UndoVerificationFailed);
    }
    Ok(applied)
}

pub fn create_backup(
    snapshot: &DatabaseSnapshot,
    created_at_utc: impl Into<String>,
) -> Result<SnapshotBackup, TransactionError> {
    ensure_snapshot_valid(snapshot)?;
    Ok(SnapshotBackup {
        schema_version: EDITOR_SCHEMA_VERSION,
        created_at_utc: created_at_utc.into(),
        snapshot_hash: snapshot_hash(snapshot)?,
        snapshot: snapshot.clone(),
    })
}

pub fn restore_backup(backup: &SnapshotBackup) -> Result<DatabaseSnapshot, TransactionError> {
    if backup.schema_version != EDITOR_SCHEMA_VERSION {
        return Err(TransactionError::UnsupportedSchema);
    }
    ensure_snapshot_valid(&backup.snapshot)?;
    if snapshot_hash(&backup.snapshot)? != backup.snapshot_hash {
        return Err(TransactionError::BackupHashMismatch);
    }
    Ok(backup.snapshot.clone())
}

pub fn verify_read_back(
    expected_snapshot_hash: &str,
    actual_snapshot: &DatabaseSnapshot,
) -> Result<(), TransactionError> {
    ensure_snapshot_valid(actual_snapshot)?;
    if snapshot_hash(actual_snapshot)? != expected_snapshot_hash {
        return Err(TransactionError::ReadBackMismatch);
    }
    Ok(())
}

pub fn snapshot_hash(snapshot: &DatabaseSnapshot) -> Result<String, TransactionError> {
    let bytes = serde_json::to_vec(snapshot).map_err(TransactionError::SnapshotSerialization)?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn apply_transaction_internal(
    snapshot: &DatabaseSnapshot,
    transaction: &EditTransaction,
    reverts_transaction_id: Option<String>,
) -> Result<AppliedTransaction, TransactionError> {
    validate_transaction(transaction)?;
    ensure_snapshot_valid(snapshot)?;
    let snapshot_before_hash = snapshot_hash(snapshot)?;
    let mut edited = snapshot.clone();
    let mut changes = Vec::with_capacity(transaction.operations.len());
    for operation in &transaction.operations {
        let before = apply_operation(&mut edited, operation)?;
        changes.push(JournalChange {
            entity_kind: operation.entity_kind,
            entity_id: operation.entity_id.clone(),
            field: operation.field.clone(),
            before,
            after: operation.after.clone(),
        });
    }
    ensure_snapshot_valid(&edited)?;
    let snapshot_after_hash = snapshot_hash(&edited)?;
    Ok(AppliedTransaction {
        snapshot: edited,
        journal_entry: JournalEntry {
            schema_version: EDITOR_SCHEMA_VERSION,
            transaction_id: transaction.id.clone(),
            created_at_utc: transaction.created_at_utc.clone(),
            reason: transaction.reason.clone(),
            reverts_transaction_id,
            snapshot_before_hash,
            snapshot_after_hash,
            changes,
        },
    })
}

fn validate_transaction(transaction: &EditTransaction) -> Result<(), TransactionError> {
    if transaction.schema_version != EDITOR_SCHEMA_VERSION {
        return Err(TransactionError::UnsupportedSchema);
    }
    if transaction.id.is_empty()
        || transaction.id.len() > MAXIMUM_IDENTIFIER_BYTES
        || transaction.created_at_utc.is_empty()
        || transaction.created_at_utc.len() > MAXIMUM_IDENTIFIER_BYTES
        || transaction
            .reason
            .as_ref()
            .is_some_and(|reason| reason.len() > MAXIMUM_REASON_BYTES)
    {
        return Err(TransactionError::InvalidMetadata);
    }
    if transaction.operations.is_empty() || transaction.operations.len() > MAXIMUM_OPERATIONS {
        return Err(TransactionError::InvalidOperationCount);
    }
    let mut unique = HashSet::with_capacity(transaction.operations.len());
    for operation in &transaction.operations {
        if operation.entity_id.is_empty()
            || operation.entity_id.len() > MAXIMUM_IDENTIFIER_BYTES
            || operation.field.is_empty()
            || operation.field.len() > MAXIMUM_IDENTIFIER_BYTES
            || !operation.field.bytes().all(|byte| {
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_' || byte == b'.'
            })
        {
            return Err(TransactionError::InvalidMetadata);
        }
        if !is_editable_field(operation.entity_kind, &operation.field) {
            return Err(TransactionError::UnsupportedField {
                entity_kind: operation.entity_kind,
                field: operation.field.clone(),
            });
        }
        if operation.expected_before == FieldExpectation::Any {
            return Err(TransactionError::MissingExpectation);
        }
        if !unique.insert((
            operation.entity_kind,
            operation.entity_id.as_str(),
            operation.field.as_str(),
        )) {
            return Err(TransactionError::DuplicateOperation);
        }
    }
    Ok(())
}

fn validate_preset(request: &MassEditRequest) -> Result<(), TransactionError> {
    let preset = &request.preset;
    if preset.schema_version != EDITOR_SCHEMA_VERSION
        || preset.id.trim().is_empty()
        || preset.id.len() > MAXIMUM_IDENTIFIER_BYTES
        || preset.name.trim().is_empty()
        || preset.name.len() > MAXIMUM_REASON_BYTES
        || request.entity_ids.is_empty()
        || request.transaction_id.trim().is_empty()
        || request.created_at_utc.trim().is_empty()
        || preset.changes.is_empty()
    {
        return Err(TransactionError::InvalidPreset);
    }
    let unique_entities: HashSet<_> = request.entity_ids.iter().collect();
    let unique_fields: HashSet<_> = preset.changes.iter().map(|change| &change.field).collect();
    if unique_entities.len() != request.entity_ids.len()
        || unique_fields.len() != preset.changes.len()
        || preset.changes.iter().any(|change| {
            !is_editable_field(preset.entity_kind, &change.field)
                || match &change.strategy {
                    PresetStrategy::Set { .. } => false,
                    PresetStrategy::AddNumber { delta } => !delta.is_finite(),
                    PresetStrategy::ScaleNumber { factor } => !factor.is_finite(),
                    PresetStrategy::ClampNumber { minimum, maximum } => {
                        !minimum.is_finite() || !maximum.is_finite() || minimum > maximum
                    }
                }
        })
    {
        return Err(TransactionError::InvalidPreset);
    }
    Ok(())
}

pub(crate) fn entity_value(
    snapshot: &DatabaseSnapshot,
    kind: EditEntityKind,
    entity_id: &str,
) -> Result<Value, TransactionError> {
    let value = match kind {
        EditEntityKind::Player => snapshot
            .players
            .iter()
            .find(|entity| entity.id == entity_id)
            .map(serde_json::to_value),
        EditEntityKind::Staff => snapshot
            .staff
            .iter()
            .find(|entity| entity.id == entity_id)
            .map(serde_json::to_value),
        EditEntityKind::Club => snapshot
            .clubs
            .iter()
            .find(|entity| entity.id == entity_id)
            .map(serde_json::to_value),
        EditEntityKind::Competition => snapshot
            .competitions
            .iter()
            .find(|entity| entity.id == entity_id)
            .map(serde_json::to_value),
    };
    value
        .ok_or_else(|| TransactionError::EntityNotFound {
            entity_kind: kind,
            entity_id: entity_id.to_owned(),
        })?
        .map_err(TransactionError::SnapshotSerialization)
}

fn apply_preset_strategy(
    before: &Value,
    field: &str,
    strategy: &PresetStrategy,
) -> Result<Value, TransactionError> {
    match strategy {
        PresetStrategy::Set { value } => Ok(value.clone()),
        PresetStrategy::AddNumber { delta } => numeric_result(before, field, |value| value + delta),
        PresetStrategy::ScaleNumber { factor } => {
            numeric_result(before, field, |value| value * factor)
        }
        PresetStrategy::ClampNumber { minimum, maximum } => {
            numeric_result(before, field, |value| value.clamp(*minimum, *maximum))
        }
    }
}

fn numeric_result(
    before: &Value,
    field: &str,
    operation: impl FnOnce(f64) -> f64,
) -> Result<Value, TransactionError> {
    let current = before
        .as_f64()
        .ok_or_else(|| TransactionError::NumericStrategyRequired(field.to_owned()))?;
    let result = operation(current);
    if !result.is_finite() {
        return Err(TransactionError::NumericStrategyRequired(field.to_owned()));
    }
    if before.as_u64().is_some() && result.fract() == 0.0 && result >= 0.0 {
        return Ok(Value::from(result as u64));
    }
    if before.as_i64().is_some() && result.fract() == 0.0 {
        return Ok(Value::from(result as i64));
    }
    serde_json::Number::from_f64(result)
        .map(Value::Number)
        .ok_or_else(|| TransactionError::NumericStrategyRequired(field.to_owned()))
}

fn apply_operation(
    snapshot: &mut DatabaseSnapshot,
    operation: &EditOperation,
) -> Result<Value, TransactionError> {
    match operation.entity_kind {
        EditEntityKind::Player => {
            let entity = snapshot
                .players
                .iter_mut()
                .find(|entity| entity.id == operation.entity_id)
                .ok_or_else(|| entity_not_found(operation))?;
            edit_entity(entity, operation)
        }
        EditEntityKind::Staff => {
            let entity = snapshot
                .staff
                .iter_mut()
                .find(|entity| entity.id == operation.entity_id)
                .ok_or_else(|| entity_not_found(operation))?;
            edit_entity(entity, operation)
        }
        EditEntityKind::Club => {
            let entity = snapshot
                .clubs
                .iter_mut()
                .find(|entity| entity.id == operation.entity_id)
                .ok_or_else(|| entity_not_found(operation))?;
            edit_entity(entity, operation)
        }
        EditEntityKind::Competition => {
            let entity = snapshot
                .competitions
                .iter_mut()
                .find(|entity| entity.id == operation.entity_id)
                .ok_or_else(|| entity_not_found(operation))?;
            edit_entity(entity, operation)
        }
    }
}

fn edit_entity<T>(entity: &mut T, operation: &EditOperation) -> Result<Value, TransactionError>
where
    T: Serialize + DeserializeOwned,
{
    let mut value =
        serde_json::to_value(&*entity).map_err(TransactionError::SnapshotSerialization)?;
    let before = value_at_path(&value, &operation.field)
        .cloned()
        .or_else(|| is_attribute_path(&operation.field).then_some(Value::Null))
        .ok_or_else(|| TransactionError::FieldNotFound(operation.field.clone()))?;
    if let FieldExpectation::Exact(expected) = &operation.expected_before
        && expected != &before
    {
        return Err(TransactionError::Conflict {
            field: operation.field.clone(),
        });
    }
    set_value_at_path(
        &mut value,
        &operation.field,
        operation.after.clone(),
        is_attribute_path(&operation.field),
    )?;
    *entity = serde_json::from_value(value).map_err(TransactionError::InvalidValue)?;
    Ok(before)
}

pub(crate) fn value_at_path<'a>(value: &'a Value, path: &str) -> Option<&'a Value> {
    path.split('.')
        .try_fold(value, |current, segment| current.get(segment))
}

fn set_value_at_path(
    value: &mut Value,
    path: &str,
    replacement: Value,
    allow_insert: bool,
) -> Result<(), TransactionError> {
    let mut segments = path.split('.').peekable();
    let mut current = value;
    while let Some(segment) = segments.next() {
        let is_last = segments.peek().is_none();
        let object = current
            .as_object_mut()
            .ok_or_else(|| TransactionError::FieldNotFound(path.to_owned()))?;
        if is_last {
            if !allow_insert && !object.contains_key(segment) {
                return Err(TransactionError::FieldNotFound(path.to_owned()));
            }
            object.insert(segment.to_owned(), replacement);
            return Ok(());
        }
        current = object
            .get_mut(segment)
            .ok_or_else(|| TransactionError::FieldNotFound(path.to_owned()))?;
    }
    Err(TransactionError::FieldNotFound(path.to_owned()))
}

fn is_attribute_path(field: &str) -> bool {
    field.starts_with("attributes.") && field.split('.').count() == 2
}

fn entity_not_found(operation: &EditOperation) -> TransactionError {
    TransactionError::EntityNotFound {
        entity_kind: operation.entity_kind,
        entity_id: operation.entity_id.clone(),
    }
}

fn ensure_snapshot_valid(snapshot: &DatabaseSnapshot) -> Result<(), TransactionError> {
    let report = validate_snapshot(snapshot);
    if report.valid {
        Ok(())
    } else {
        Err(TransactionError::InvalidSnapshot(report.issues.len()))
    }
}

pub(crate) fn is_editable_field(kind: EditEntityKind, field: &str) -> bool {
    match kind {
        EditEntityKind::Player => {
            is_attribute_path(field)
                || matches!(
                    field,
                    "name"
                        | "age"
                        | "club"
                        | "nationality"
                        | "positions"
                        | "preferred_foot"
                        | "value"
                        | "wage"
                        | "current_ability"
                        | "potential_ability"
                        | "details.date_of_birth"
                        | "details.reputation"
                        | "details.international_reputation"
                        | "details.consistency"
                        | "details.important_matches"
                        | "details.injury_proneness"
                        | "details.versatility"
                        | "details.professionalism"
                        | "details.ambition"
                        | "details.contract"
                        | "details.contract.club_id"
                        | "details.contract.starts_on"
                        | "details.contract.expires_on"
                        | "details.contract.contract_type"
                        | "details.contract.wage"
                        | "details.contract.release_clause"
                        | "details.contract.squad_status"
                        | "details.future_transfer"
                        | "details.fitness"
                        | "details.fitness.condition"
                        | "details.fitness.match_fitness"
                        | "details.fitness.fatigue"
                        | "details.fitness.jadedness"
                        | "details.morale"
                        | "details.happiness"
                        | "details.injuries"
                        | "details.bans"
                        | "details.languages"
                        | "details.relationships"
                        | "details.registrations"
                        | "details.status.transfer_listed"
                        | "details.status.loan_listed"
                        | "details.status.injured"
                        | "details.status.suspended"
                        | "details.status.unavailable"
                        | "details.tags"
                        | "details.note"
                )
        }
        EditEntityKind::Staff => {
            is_attribute_path(field)
                || matches!(
                    field,
                    "name"
                        | "age"
                        | "club"
                        | "nationality"
                        | "roles"
                        | "current_ability"
                        | "potential_ability"
                        | "reputation"
                        | "contract"
                        | "contract.club_id"
                        | "contract.starts_on"
                        | "contract.expires_on"
                        | "contract.contract_type"
                        | "contract.wage"
                        | "contract.release_clause"
                        | "contract.squad_status"
                        | "details"
                        | "details.date_of_birth"
                        | "details.languages"
                        | "details.relationships"
                        | "details.responsibilities"
                        | "details.qualifications"
                        | "details.note"
                )
        }
        EditEntityKind::Club => matches!(
            field,
            "name"
                | "short_name"
                | "nation"
                | "competition"
                | "competition_id"
                | "reputation"
                | "professional_status"
                | "stadium"
                | "stadium_capacity"
                | "average_attendance"
                | "finances.balance"
                | "finances.transfer_budget"
                | "finances.wage_budget"
                | "finances.debt"
                | "facilities.training"
                | "facilities.youth"
                | "facilities.youth_recruitment"
                | "facilities.junior_coaching"
                | "branding.primary_colour"
                | "branding.secondary_colour"
                | "branding.kits"
                | "relationships"
        ),
        EditEntityKind::Competition => matches!(
            field,
            "name"
                | "short_name"
                | "nation"
                | "reputation"
                | "current_champion"
                | "current_champion_club_id"
                | "level"
                | "stages"
                | "fixtures"
                | "standings"
        ),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::synthetic_snapshot;

    fn transaction(id: &str, operations: Vec<EditOperation>) -> EditTransaction {
        EditTransaction {
            schema_version: EDITOR_SCHEMA_VERSION,
            id: id.to_owned(),
            created_at_utc: "2026-07-21T20:00:00Z".to_owned(),
            reason: Some("Acceptance test".to_owned()),
            operations,
        }
    }

    fn operation(
        entity_kind: EditEntityKind,
        entity_id: &str,
        field: &str,
        expected_before: Value,
        after: Value,
    ) -> EditOperation {
        EditOperation {
            entity_kind,
            entity_id: entity_id.to_owned(),
            field: field.to_owned(),
            expected_before: FieldExpectation::Exact(expected_before),
            after,
        }
    }

    #[test]
    fn applies_multiple_validated_fields_atomically_and_records_hashes() {
        let snapshot = synthetic_snapshot();
        let edit = transaction(
            "tx-1",
            vec![
                operation(
                    EditEntityKind::Player,
                    "player-ada",
                    "attributes.passing",
                    json!(17),
                    json!(18),
                ),
                operation(
                    EditEntityKind::Club,
                    "club-nordhafen",
                    "finances.transfer_budget",
                    json!(6_500_000.0),
                    json!(8_000_000.0),
                ),
            ],
        );

        let applied = apply_transaction(&snapshot, &edit).unwrap();
        assert_eq!(
            snapshot.players[0].attributes[&crate::Attribute::Passing],
            17
        );
        assert_eq!(
            applied.snapshot.players[0].attributes[&crate::Attribute::Passing],
            18
        );
        assert_eq!(
            applied.snapshot.clubs[0].finances.transfer_budget,
            Some(8_000_000.0)
        );
        assert_eq!(applied.journal_entry.changes.len(), 2);
        assert_ne!(
            applied.journal_entry.snapshot_before_hash,
            applied.journal_entry.snapshot_after_hash
        );
        verify_read_back(
            &applied.journal_entry.snapshot_after_hash,
            &applied.snapshot,
        )
        .unwrap();
    }

    #[test]
    fn rejects_stale_previews_without_mutating_the_source_snapshot() {
        let snapshot = synthetic_snapshot();
        let before = snapshot.clone();
        let edit = transaction(
            "tx-stale",
            vec![operation(
                EditEntityKind::Player,
                "player-ada",
                "current_ability",
                json!(120),
                json!(150),
            )],
        );
        assert!(matches!(
            apply_transaction(&snapshot, &edit),
            Err(TransactionError::Conflict { .. })
        ));
        assert_eq!(snapshot, before);
    }

    #[test]
    fn rejects_operations_without_an_exact_preview_value() {
        let snapshot = synthetic_snapshot();
        let mut edit = transaction(
            "tx-unchecked",
            vec![operation(
                EditEntityKind::Player,
                "player-ada",
                "current_ability",
                json!(142),
                json!(150),
            )],
        );
        edit.operations[0].expected_before = FieldExpectation::Any;
        assert!(matches!(
            apply_transaction(&snapshot, &edit),
            Err(TransactionError::MissingExpectation)
        ));
    }

    #[test]
    fn rejects_values_that_break_canonical_invariants() {
        let snapshot = synthetic_snapshot();
        let edit = transaction(
            "tx-invalid",
            vec![operation(
                EditEntityKind::Player,
                "player-ada",
                "attributes.passing",
                json!(17),
                json!(21),
            )],
        );
        assert!(matches!(
            apply_transaction(&snapshot, &edit),
            Err(TransactionError::InvalidSnapshot(_))
        ));
    }

    #[test]
    fn undo_requires_the_exact_committed_snapshot_and_restores_every_byte() {
        let snapshot = synthetic_snapshot();
        let applied = apply_transaction(
            &snapshot,
            &transaction(
                "tx-edit",
                vec![operation(
                    EditEntityKind::Player,
                    "player-ada",
                    "details.status.injured",
                    json!(false),
                    json!(true),
                )],
            ),
        )
        .unwrap();
        let undone = undo_transaction(
            &applied.snapshot,
            &applied.journal_entry,
            "tx-undo",
            "2026-07-21T20:01:00Z",
        )
        .unwrap();
        assert_eq!(undone.snapshot, snapshot);
        assert_eq!(
            undone.journal_entry.reverts_transaction_id.as_deref(),
            Some("tx-edit")
        );
    }

    #[test]
    fn backup_restore_detects_tampering() {
        let snapshot = synthetic_snapshot();
        let mut backup = create_backup(&snapshot, "2026-07-21T20:00:00Z").unwrap();
        assert_eq!(restore_backup(&backup).unwrap(), snapshot);
        backup.snapshot.players[0].name = "Manipuliert".to_owned();
        assert!(matches!(
            restore_backup(&backup),
            Err(TransactionError::BackupHashMismatch)
        ));
    }

    #[test]
    fn journal_enforces_unique_ids_and_an_unbroken_hash_chain() {
        let snapshot = synthetic_snapshot();
        let first = apply_transaction(
            &snapshot,
            &transaction(
                "tx-a",
                vec![operation(
                    EditEntityKind::Competition,
                    "competition-nordliga",
                    "reputation",
                    json!(6000),
                    json!(6100),
                )],
            ),
        )
        .unwrap();
        let mut journal = TransactionJournal::default();
        journal.append(first.journal_entry.clone()).unwrap();
        assert!(matches!(
            journal.append(first.journal_entry),
            Err(TransactionError::DuplicateTransactionId(_))
        ));

        let unrelated = apply_transaction(
            &snapshot,
            &transaction(
                "tx-b",
                vec![operation(
                    EditEntityKind::Competition,
                    "competition-nordliga",
                    "level",
                    json!(1),
                    json!(2),
                )],
            ),
        )
        .unwrap();
        assert!(matches!(
            journal.append(unrelated.journal_entry),
            Err(TransactionError::BrokenJournalChain)
        ));

        journal.entries.push(JournalEntry {
            schema_version: EDITOR_SCHEMA_VERSION,
            transaction_id: "tx-tampered".to_owned(),
            created_at_utc: "2026-07-21T20:02:00Z".to_owned(),
            reason: None,
            reverts_transaction_id: None,
            snapshot_before_hash: "not-the-previous-hash".to_owned(),
            snapshot_after_hash: "not-a-real-hash".to_owned(),
            changes: Vec::new(),
        });
        assert!(matches!(
            journal.validate(),
            Err(TransactionError::BrokenJournalChain)
        ));
    }

    #[test]
    fn prepares_a_validated_atomic_mass_edit_with_exact_expectations() {
        let snapshot = synthetic_snapshot();
        let request = MassEditRequest {
            transaction_id: "mass-1".to_owned(),
            created_at_utc: "2026-07-22T01:00:00Z".to_owned(),
            reason: Some("Training preset".to_owned()),
            entity_ids: vec!["player-ada".to_owned(), "player-milo".to_owned()],
            preset: EditorPreset {
                schema_version: EDITOR_SCHEMA_VERSION,
                id: "preset-ca".to_owned(),
                name: "CA plus one".to_owned(),
                entity_kind: EditEntityKind::Player,
                changes: vec![PresetChange {
                    field: "current_ability".to_owned(),
                    strategy: PresetStrategy::AddNumber { delta: 1.0 },
                }],
            },
        };
        let prepared = prepare_mass_edit(&snapshot, &request).unwrap();
        assert_eq!(prepared.transaction.operations.len(), 2);
        assert!(
            prepared.transaction.operations.iter().all(|operation| {
                matches!(operation.expected_before, FieldExpectation::Exact(_))
            })
        );
        assert_eq!(
            prepared.preview.snapshot.players[0].current_ability,
            Some(129)
        );
        assert_eq!(
            prepared.preview.snapshot.players[1].current_ability,
            Some(120)
        );
    }

    #[test]
    fn rejects_non_numeric_strategies_and_the_entire_mass_edit() {
        let snapshot = synthetic_snapshot();
        let request = MassEditRequest {
            transaction_id: "mass-invalid".to_owned(),
            created_at_utc: "2026-07-22T01:00:00Z".to_owned(),
            reason: None,
            entity_ids: vec!["player-ada".to_owned()],
            preset: EditorPreset {
                schema_version: EDITOR_SCHEMA_VERSION,
                id: "preset-name".to_owned(),
                name: "Invalid number".to_owned(),
                entity_kind: EditEntityKind::Player,
                changes: vec![PresetChange {
                    field: "name".to_owned(),
                    strategy: PresetStrategy::AddNumber { delta: 1.0 },
                }],
            },
        };
        assert!(matches!(
            prepare_mass_edit(&snapshot, &request),
            Err(TransactionError::NumericStrategyRequired(field)) if field == "name"
        ));
        assert_eq!(snapshot.players[0].name, "Ada Beispiel");
    }

    #[test]
    fn rejects_a_mass_edit_that_would_only_create_no_op_journal_entries() {
        let snapshot = synthetic_snapshot();
        let request = MassEditRequest {
            transaction_id: "mass-no-op".to_owned(),
            created_at_utc: "2026-07-22T01:00:00Z".to_owned(),
            reason: None,
            entity_ids: vec!["player-ada".to_owned()],
            preset: EditorPreset {
                schema_version: EDITOR_SCHEMA_VERSION,
                id: "preset-same-ca".to_owned(),
                name: "Same CA".to_owned(),
                entity_kind: EditEntityKind::Player,
                changes: vec![PresetChange {
                    field: "current_ability".to_owned(),
                    strategy: PresetStrategy::Set { value: json!(128) },
                }],
            },
        };
        assert!(matches!(
            prepare_mass_edit(&snapshot, &request),
            Err(TransactionError::NoChanges)
        ));
    }
}
