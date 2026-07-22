use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

use crate::{
    AppliedTransaction, DatabaseSnapshot, EDITOR_SCHEMA_VERSION, EditEntityKind, EditOperation,
    EditTransaction, FieldExpectation, SnapshotSource, TransactionError, apply_transaction,
    editor::{entity_value, is_editable_field, value_at_path},
    snapshot_hash, validate_snapshot,
};

pub const FREEZER_SCHEMA_VERSION: u32 = 1;
const MAXIMUM_RULES: usize = 5_000;
const MAXIMUM_IDENTIFIER_BYTES: usize = 128;
const MAXIMUM_NAME_BYTES: usize = 200;
const MAXIMUM_BASELINE_BYTES: usize = 4_096;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FreezePolicy {
    Exact,
    AllowIncrease,
    MonitorOnly,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FreezeRule {
    pub entity_kind: EditEntityKind,
    pub entity_id: String,
    pub field: String,
    pub baseline: Value,
    pub policy: FreezePolicy,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FreezePlan {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub created_at_utc: String,
    pub updated_at_utc: String,
    pub snapshot_source: SnapshotSource,
    pub enabled: bool,
    pub rules: Vec<FreezeRule>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FreezeObservationState {
    Unchanged,
    AllowedIncrease,
    ObservedChange,
    Violation,
    MissingEntity,
    MissingField,
    TypeMismatch,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FreezeObservation {
    pub entity_kind: EditEntityKind,
    pub entity_id: String,
    pub field: String,
    pub baseline: Value,
    pub current: Option<Value>,
    pub policy: FreezePolicy,
    pub state: FreezeObservationState,
    pub numeric_delta: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FreezeReport {
    pub schema_version: u32,
    pub plan_id: String,
    pub checked_at_utc: String,
    pub snapshot_hash: String,
    pub total_rules: usize,
    pub unchanged_count: usize,
    pub allowed_increase_count: usize,
    pub monitored_change_count: usize,
    pub violation_count: usize,
    pub unresolved_count: usize,
    pub observations: Vec<FreezeObservation>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PreparedFreezeCorrection {
    pub report: FreezeReport,
    pub transaction: Option<EditTransaction>,
    pub preview: Option<AppliedTransaction>,
}

#[derive(Debug, Error)]
pub enum FreezerError {
    #[error("freezer schema version is unsupported")]
    UnsupportedSchema,
    #[error("freezer plan metadata is invalid")]
    InvalidMetadata,
    #[error("freezer plan must contain between 1 and {MAXIMUM_RULES} rules")]
    InvalidRuleCount,
    #[error("freezer plan contains the same entity field more than once")]
    DuplicateRule,
    #[error("field {field} is not editable for {entity_kind:?}")]
    UnsupportedField {
        entity_kind: EditEntityKind,
        field: String,
    },
    #[error("freezer baseline for field {0} is invalid or too large")]
    InvalidBaseline(String),
    #[error("allow-increase policy requires a numeric baseline in field {0}")]
    NumericBaselineRequired(String),
    #[error("freezer plan is disabled")]
    PlanDisabled,
    #[error("freezer plan belongs to a different snapshot source")]
    SnapshotSourceMismatch,
    #[error("freezer correction is blocked by {0} unresolved rule(s)")]
    UnresolvedRules(usize),
    #[error(transparent)]
    Transaction(#[from] TransactionError),
}

pub fn validate_freeze_plan(plan: &FreezePlan) -> Result<(), FreezerError> {
    if plan.schema_version != FREEZER_SCHEMA_VERSION {
        return Err(FreezerError::UnsupportedSchema);
    }
    if !valid_identifier(&plan.id)
        || plan.name.trim().is_empty()
        || plan.name.len() > MAXIMUM_NAME_BYTES
        || !valid_timestamp(&plan.created_at_utc)
        || !valid_timestamp(&plan.updated_at_utc)
    {
        return Err(FreezerError::InvalidMetadata);
    }
    if plan.rules.is_empty() || plan.rules.len() > MAXIMUM_RULES {
        return Err(FreezerError::InvalidRuleCount);
    }

    let mut unique = HashSet::with_capacity(plan.rules.len());
    for rule in &plan.rules {
        if rule.entity_id.trim().is_empty()
            || rule.entity_id.len() > MAXIMUM_IDENTIFIER_BYTES
            || rule.field.trim().is_empty()
            || rule.field.len() > MAXIMUM_IDENTIFIER_BYTES
        {
            return Err(FreezerError::InvalidMetadata);
        }
        if !is_editable_field(rule.entity_kind, &rule.field) {
            return Err(FreezerError::UnsupportedField {
                entity_kind: rule.entity_kind,
                field: rule.field.clone(),
            });
        }
        let baseline_size = serde_json::to_vec(&rule.baseline)
            .map_err(TransactionError::SnapshotSerialization)?
            .len();
        if baseline_size > MAXIMUM_BASELINE_BYTES {
            return Err(FreezerError::InvalidBaseline(rule.field.clone()));
        }
        if rule.policy == FreezePolicy::AllowIncrease
            && rule
                .baseline
                .as_f64()
                .is_none_or(|value| !value.is_finite())
        {
            return Err(FreezerError::NumericBaselineRequired(rule.field.clone()));
        }
        if !unique.insert((
            rule.entity_kind,
            rule.entity_id.as_str(),
            rule.field.as_str(),
        )) {
            return Err(FreezerError::DuplicateRule);
        }
    }
    Ok(())
}

pub fn evaluate_freeze_plan(
    snapshot: &DatabaseSnapshot,
    plan: &FreezePlan,
    checked_at_utc: impl Into<String>,
) -> Result<FreezeReport, FreezerError> {
    validate_freeze_plan(plan)?;
    if snapshot.source != plan.snapshot_source {
        return Err(FreezerError::SnapshotSourceMismatch);
    }
    let checked_at_utc = checked_at_utc.into();
    if !valid_timestamp(&checked_at_utc) {
        return Err(FreezerError::InvalidMetadata);
    }
    let validation = validate_snapshot(snapshot);
    if !validation.valid {
        return Err(TransactionError::InvalidSnapshot(validation.issues.len()).into());
    }

    let mut observations = Vec::with_capacity(plan.rules.len());
    for rule in &plan.rules {
        let entity = match entity_value(snapshot, rule.entity_kind, &rule.entity_id) {
            Ok(entity) => entity,
            Err(TransactionError::EntityNotFound { .. }) => {
                observations.push(observation(
                    rule,
                    None,
                    FreezeObservationState::MissingEntity,
                ));
                continue;
            }
            Err(error) => return Err(error.into()),
        };
        let Some(current) = value_at_path(&entity, &rule.field).cloned() else {
            observations.push(observation(
                rule,
                None,
                FreezeObservationState::MissingField,
            ));
            continue;
        };
        let state = classify(rule, &current);
        observations.push(observation(rule, Some(current), state));
    }

    Ok(FreezeReport {
        schema_version: FREEZER_SCHEMA_VERSION,
        plan_id: plan.id.clone(),
        checked_at_utc,
        snapshot_hash: snapshot_hash(snapshot)?,
        total_rules: observations.len(),
        unchanged_count: count_state(&observations, FreezeObservationState::Unchanged),
        allowed_increase_count: count_state(&observations, FreezeObservationState::AllowedIncrease),
        monitored_change_count: count_state(&observations, FreezeObservationState::ObservedChange),
        violation_count: count_state(&observations, FreezeObservationState::Violation),
        unresolved_count: observations
            .iter()
            .filter(|item| {
                matches!(
                    item.state,
                    FreezeObservationState::MissingEntity
                        | FreezeObservationState::MissingField
                        | FreezeObservationState::TypeMismatch
                )
            })
            .count(),
        observations,
    })
}

pub fn prepare_freeze_correction(
    snapshot: &DatabaseSnapshot,
    plan: &FreezePlan,
    transaction_id: impl Into<String>,
    created_at_utc: impl Into<String>,
) -> Result<PreparedFreezeCorrection, FreezerError> {
    if !plan.enabled {
        return Err(FreezerError::PlanDisabled);
    }
    let transaction_id = transaction_id.into();
    let created_at_utc = created_at_utc.into();
    let report = evaluate_freeze_plan(snapshot, plan, created_at_utc.clone())?;
    if report.unresolved_count > 0 {
        return Err(FreezerError::UnresolvedRules(report.unresolved_count));
    }
    let mut operations = Vec::with_capacity(report.violation_count);
    for item in report
        .observations
        .iter()
        .filter(|item| item.state == FreezeObservationState::Violation)
    {
        let current = item
            .current
            .clone()
            .ok_or(FreezerError::UnresolvedRules(1))?;
        operations.push(EditOperation {
            entity_kind: item.entity_kind,
            entity_id: item.entity_id.clone(),
            field: item.field.clone(),
            expected_before: FieldExpectation::Exact(current),
            after: item.baseline.clone(),
        });
    }
    if operations.is_empty() {
        return Ok(PreparedFreezeCorrection {
            report,
            transaction: None,
            preview: None,
        });
    }
    let transaction = EditTransaction {
        schema_version: EDITOR_SCHEMA_VERSION,
        id: transaction_id,
        created_at_utc,
        reason: Some(format!("Freezer {}", plan.name)),
        operations,
    };
    let preview = apply_transaction(snapshot, &transaction)?;
    Ok(PreparedFreezeCorrection {
        report,
        transaction: Some(transaction),
        preview: Some(preview),
    })
}

fn observation(
    rule: &FreezeRule,
    current: Option<Value>,
    state: FreezeObservationState,
) -> FreezeObservation {
    let numeric_delta = current
        .as_ref()
        .and_then(Value::as_f64)
        .zip(rule.baseline.as_f64())
        .map(|(current, baseline)| current - baseline);
    FreezeObservation {
        entity_kind: rule.entity_kind,
        entity_id: rule.entity_id.clone(),
        field: rule.field.clone(),
        baseline: rule.baseline.clone(),
        current,
        policy: rule.policy,
        state,
        numeric_delta,
    }
}

fn classify(rule: &FreezeRule, current: &Value) -> FreezeObservationState {
    if current == &rule.baseline {
        return FreezeObservationState::Unchanged;
    }
    match rule.policy {
        FreezePolicy::Exact => FreezeObservationState::Violation,
        FreezePolicy::MonitorOnly => FreezeObservationState::ObservedChange,
        FreezePolicy::AllowIncrease => {
            let Some((current, baseline)) = current.as_f64().zip(rule.baseline.as_f64()) else {
                return FreezeObservationState::TypeMismatch;
            };
            if !current.is_finite() || !baseline.is_finite() {
                FreezeObservationState::TypeMismatch
            } else if current >= baseline {
                FreezeObservationState::AllowedIncrease
            } else {
                FreezeObservationState::Violation
            }
        }
    }
}

fn count_state(observations: &[FreezeObservation], state: FreezeObservationState) -> usize {
    observations
        .iter()
        .filter(|item| item.state == state)
        .count()
}

fn valid_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAXIMUM_IDENTIFIER_BYTES
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn valid_timestamp(value: &str) -> bool {
    !value.trim().is_empty() && value.len() <= MAXIMUM_IDENTIFIER_BYTES
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::{Attribute, synthetic_snapshot};

    fn plan(rules: Vec<FreezeRule>) -> FreezePlan {
        FreezePlan {
            schema_version: FREEZER_SCHEMA_VERSION,
            id: "first-team".to_owned(),
            name: "Erste Mannschaft".to_owned(),
            created_at_utc: "2026-07-22T08:00:00Z".to_owned(),
            updated_at_utc: "2026-07-22T08:00:00Z".to_owned(),
            snapshot_source: SnapshotSource::Synthetic,
            enabled: true,
            rules,
        }
    }

    fn rule(field: &str, baseline: Value, policy: FreezePolicy) -> FreezeRule {
        FreezeRule {
            entity_kind: EditEntityKind::Player,
            entity_id: "player-ada".to_owned(),
            field: field.to_owned(),
            baseline,
            policy,
        }
    }

    #[test]
    fn classifies_exact_increase_and_monitor_rules_independently() {
        let mut snapshot = synthetic_snapshot();
        snapshot.players[0].current_ability = Some(127);
        snapshot.players[0]
            .attributes
            .insert(Attribute::Passing, 18);
        snapshot.players[0].value = Some(13_000_000.0);
        let report = evaluate_freeze_plan(
            &snapshot,
            &plan(vec![
                rule("current_ability", json!(128), FreezePolicy::Exact),
                rule("attributes.passing", json!(17), FreezePolicy::AllowIncrease),
                rule("value", json!(12_500_000.0), FreezePolicy::MonitorOnly),
                rule("potential_ability", json!(174), FreezePolicy::Exact),
            ]),
            "2026-07-22T08:01:00Z",
        )
        .unwrap();

        assert_eq!(report.total_rules, 4);
        assert_eq!(report.violation_count, 1);
        assert_eq!(report.allowed_increase_count, 1);
        assert_eq!(report.monitored_change_count, 1);
        assert_eq!(report.unchanged_count, 1);
        assert_eq!(report.unresolved_count, 0);
        assert_eq!(report.observations[1].numeric_delta, Some(1.0));
    }

    #[test]
    fn prepares_an_exact_conflict_checked_correction_for_violations_only() {
        let mut snapshot = synthetic_snapshot();
        snapshot.players[0].current_ability = Some(124);
        snapshot.players[0]
            .attributes
            .insert(Attribute::Passing, 19);
        let prepared = prepare_freeze_correction(
            &snapshot,
            &plan(vec![
                rule("current_ability", json!(128), FreezePolicy::Exact),
                rule("attributes.passing", json!(17), FreezePolicy::AllowIncrease),
            ]),
            "freeze-correction-1",
            "2026-07-22T08:02:00Z",
        )
        .unwrap();

        let transaction = prepared.transaction.unwrap();
        assert_eq!(transaction.operations.len(), 1);
        assert_eq!(transaction.operations[0].field, "current_ability");
        assert_eq!(
            transaction.operations[0].expected_before,
            FieldExpectation::Exact(json!(124))
        );
        assert_eq!(transaction.operations[0].after, json!(128));
        assert_eq!(
            prepared.preview.unwrap().snapshot.players[0].current_ability,
            Some(128)
        );
    }

    #[test]
    fn treats_a_decrease_as_a_violation_when_increases_are_allowed() {
        let mut snapshot = synthetic_snapshot();
        snapshot.players[0]
            .attributes
            .insert(Attribute::Passing, 15);
        let report = evaluate_freeze_plan(
            &snapshot,
            &plan(vec![rule(
                "attributes.passing",
                json!(17),
                FreezePolicy::AllowIncrease,
            )]),
            "2026-07-22T08:03:00Z",
        )
        .unwrap();
        assert_eq!(report.violation_count, 1);
        assert_eq!(report.observations[0].numeric_delta, Some(-2.0));
    }

    #[test]
    fn blocks_partial_corrections_when_a_rule_cannot_be_resolved() {
        let snapshot = synthetic_snapshot();
        let mut stale = rule("current_ability", json!(150), FreezePolicy::Exact);
        stale.entity_id = "removed-player".to_owned();
        let error = prepare_freeze_correction(
            &snapshot,
            &plan(vec![stale]),
            "freeze-correction-2",
            "2026-07-22T08:04:00Z",
        )
        .unwrap_err();
        assert!(matches!(error, FreezerError::UnresolvedRules(1)));
    }

    #[test]
    fn rejects_duplicate_targets_and_non_numeric_increase_policies() {
        let duplicate = rule("name", json!("Ada Beispiel"), FreezePolicy::Exact);
        assert!(matches!(
            validate_freeze_plan(&plan(vec![duplicate.clone(), duplicate])),
            Err(FreezerError::DuplicateRule)
        ));
        assert!(matches!(
            validate_freeze_plan(&plan(vec![rule(
                "name",
                json!("Ada Beispiel"),
                FreezePolicy::AllowIncrease
            )])),
            Err(FreezerError::NumericBaselineRequired(_))
        ));
    }

    #[test]
    fn rejects_a_plan_captured_from_another_snapshot_source() {
        let snapshot = synthetic_snapshot();
        let mut foreign = plan(vec![rule(
            "current_ability",
            json!(128),
            FreezePolicy::Exact,
        )]);
        foreign.snapshot_source = SnapshotSource::Live;
        assert!(matches!(
            evaluate_freeze_plan(&snapshot, &foreign, "2026-07-22T08:05:00Z"),
            Err(FreezerError::SnapshotSourceMismatch)
        ));
    }
}
