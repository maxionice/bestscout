use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::{DatabaseSnapshot, GameDate};

pub const CURRENT_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IssueSeverity {
    Error,
    Warning,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotIssue {
    pub severity: IssueSeverity,
    pub code: String,
    pub entity_kind: String,
    pub entity_id: String,
    pub field: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotValidationReport {
    pub schema_version: u32,
    pub valid: bool,
    pub issues: Vec<SnapshotIssue>,
}

pub fn validate_snapshot(snapshot: &DatabaseSnapshot) -> SnapshotValidationReport {
    let mut issues = Vec::new();
    if snapshot.schema_version != CURRENT_SCHEMA_VERSION {
        issue(
            &mut issues,
            "unsupported_schema",
            "snapshot",
            "root",
            "schema_version",
            format!(
                "expected schema version {CURRENT_SCHEMA_VERSION}, found {}",
                snapshot.schema_version
            ),
        );
    }

    validate_unique_ids(
        &mut issues,
        "player",
        snapshot.players.iter().map(|entity| entity.id.as_str()),
    );
    validate_unique_ids(
        &mut issues,
        "staff",
        snapshot.staff.iter().map(|entity| entity.id.as_str()),
    );
    validate_unique_ids(
        &mut issues,
        "club",
        snapshot.clubs.iter().map(|entity| entity.id.as_str()),
    );
    validate_unique_ids(
        &mut issues,
        "competition",
        snapshot
            .competitions
            .iter()
            .map(|entity| entity.id.as_str()),
    );

    let club_ids: HashSet<_> = snapshot.clubs.iter().map(|club| club.id.as_str()).collect();
    for player in &snapshot.players {
        if player.name.trim().is_empty() {
            issue(
                &mut issues,
                "empty_name",
                "player",
                &player.id,
                "name",
                "player name must not be empty",
            );
        }
        for (attribute, value) in &player.attributes {
            if !(1..=20).contains(value) {
                issue(
                    &mut issues,
                    "attribute_out_of_range",
                    "player",
                    &player.id,
                    format!("attributes.{attribute:?}"),
                    format!("attribute must be between 1 and 20, found {value}"),
                );
            }
        }
        for (field, value) in [
            ("current_ability", player.current_ability),
            ("potential_ability", player.potential_ability),
        ] {
            if value.is_some_and(|value| value > 200) {
                issue(
                    &mut issues,
                    "ability_out_of_range",
                    "player",
                    &player.id,
                    field,
                    "ability must not exceed 200",
                );
            }
        }
        validate_nonnegative_money(&mut issues, "player", &player.id, "value", player.value);
        validate_nonnegative_money(&mut issues, "player", &player.id, "wage", player.wage);
        if player
            .details
            .reputation
            .is_some_and(|reputation| reputation > 10_000)
        {
            issue(
                &mut issues,
                "reputation_out_of_range",
                "player",
                &player.id,
                "details.reputation",
                "reputation must not exceed 10000",
            );
        }
        for (field, value) in [
            ("consistency", player.details.consistency),
            ("important_matches", player.details.important_matches),
            ("injury_proneness", player.details.injury_proneness),
            ("versatility", player.details.versatility),
            ("professionalism", player.details.professionalism),
            ("ambition", player.details.ambition),
        ] {
            if value.is_some_and(|value| !(1..=20).contains(&value)) {
                issue(
                    &mut issues,
                    "hidden_attribute_out_of_range",
                    "player",
                    &player.id,
                    format!("details.{field}"),
                    "hidden attribute must be between 1 and 20",
                );
            }
        }
        if let Some(contract) = &player.details.contract {
            validate_contract(
                &mut issues,
                "player",
                &player.id,
                contract.club_id.as_deref(),
                contract.starts_on,
                contract.expires_on,
                contract.wage,
                &club_ids,
            );
        }
    }

    for staff in &snapshot.staff {
        for (attribute, value) in &staff.attributes {
            if !(1..=20).contains(value) {
                issue(
                    &mut issues,
                    "attribute_out_of_range",
                    "staff",
                    &staff.id,
                    format!("attributes.{attribute:?}"),
                    format!("attribute must be between 1 and 20, found {value}"),
                );
            }
        }
        if let Some(contract) = &staff.contract {
            validate_contract(
                &mut issues,
                "staff",
                &staff.id,
                contract.club_id.as_deref(),
                contract.starts_on,
                contract.expires_on,
                contract.wage,
                &club_ids,
            );
        }
    }

    SnapshotValidationReport {
        schema_version: snapshot.schema_version,
        valid: issues
            .iter()
            .all(|issue| issue.severity != IssueSeverity::Error),
        issues,
    }
}

#[allow(clippy::too_many_arguments)]
fn validate_contract(
    issues: &mut Vec<SnapshotIssue>,
    entity_kind: &str,
    entity_id: &str,
    club_id: Option<&str>,
    starts_on: Option<GameDate>,
    expires_on: Option<GameDate>,
    wage: Option<f64>,
    club_ids: &HashSet<&str>,
) {
    if club_id.is_some_and(|club_id| !club_ids.contains(club_id)) {
        issue(
            issues,
            "unknown_club_reference",
            entity_kind,
            entity_id,
            "contract.club_id",
            "contract references a club that is not in the snapshot",
        );
    }
    for (field, date) in [
        ("contract.starts_on", starts_on),
        ("contract.expires_on", expires_on),
    ] {
        if date.is_some_and(|date| GameDate::new(date.year, date.month, date.day) != Some(date)) {
            issue(
                issues,
                "invalid_date",
                entity_kind,
                entity_id,
                field,
                "contract date is not a valid calendar date",
            );
        }
    }
    if starts_on
        .zip(expires_on)
        .is_some_and(|(start, expiry)| start > expiry)
    {
        issue(
            issues,
            "invalid_contract_range",
            entity_kind,
            entity_id,
            "contract.expires_on",
            "contract expiry must not be before its start date",
        );
    }
    validate_nonnegative_money(issues, entity_kind, entity_id, "contract.wage", wage);
}

fn validate_unique_ids<'a>(
    issues: &mut Vec<SnapshotIssue>,
    entity_kind: &str,
    ids: impl IntoIterator<Item = &'a str>,
) {
    let mut seen = HashSet::new();
    for id in ids {
        if id.trim().is_empty() {
            issue(
                issues,
                "empty_id",
                entity_kind,
                id,
                "id",
                "entity ID must not be empty",
            );
        } else if !seen.insert(id) {
            issue(
                issues,
                "duplicate_id",
                entity_kind,
                id,
                "id",
                "entity ID must be unique within its kind",
            );
        }
    }
}

fn validate_nonnegative_money(
    issues: &mut Vec<SnapshotIssue>,
    entity_kind: &str,
    entity_id: &str,
    field: &str,
    value: Option<f64>,
) {
    if value.is_some_and(|value| !value.is_finite() || value < 0.0) {
        issue(
            issues,
            "invalid_money",
            entity_kind,
            entity_id,
            field,
            "money value must be finite and non-negative",
        );
    }
}

fn issue(
    issues: &mut Vec<SnapshotIssue>,
    code: &str,
    entity_kind: &str,
    entity_id: &str,
    field: impl Into<String>,
    message: impl Into<String>,
) {
    issues.push(SnapshotIssue {
        severity: IssueSeverity::Error,
        code: code.to_owned(),
        entity_kind: entity_kind.to_owned(),
        entity_id: entity_id.to_owned(),
        field: field.into(),
        message: message.into(),
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Attribute, synthetic_snapshot};

    #[test]
    fn accepts_the_synthetic_reference_snapshot() {
        let report = validate_snapshot(&synthetic_snapshot());
        assert!(report.valid, "{:?}", report.issues);
        assert!(report.issues.is_empty());
    }

    #[test]
    fn reports_all_relevant_boundary_failures() {
        let mut snapshot = synthetic_snapshot();
        snapshot.players[1].id = snapshot.players[0].id.clone();
        snapshot.players[0].current_ability = Some(201);
        snapshot.players[0]
            .attributes
            .insert(Attribute::Passing, 21);
        snapshot.players[0]
            .details
            .contract
            .as_mut()
            .unwrap()
            .club_id = Some("missing-club".into());
        let report = validate_snapshot(&snapshot);
        assert!(!report.valid);
        for code in [
            "duplicate_id",
            "ability_out_of_range",
            "attribute_out_of_range",
            "unknown_club_reference",
        ] {
            assert!(report.issues.iter().any(|issue| issue.code == code));
        }
    }
}
