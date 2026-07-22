use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::{DatabaseSnapshot, GameDate, Player};

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
    if snapshot
        .game_date
        .is_some_and(|date| GameDate::new(date.year, date.month, date.day) != Some(date))
    {
        issue(
            &mut issues,
            "invalid_date",
            "snapshot",
            "root",
            "game_date",
            "game date is not a valid calendar date",
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
    let competition_ids: HashSet<_> = snapshot
        .competitions
        .iter()
        .map(|competition| competition.id.as_str())
        .collect();
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
        if player.age.is_some_and(|age| age > 120) {
            issue(
                &mut issues,
                "age_out_of_range",
                "player",
                &player.id,
                "age",
                "age must not exceed 120",
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
        for (field, reputation) in [
            ("details.reputation", player.details.reputation),
            (
                "details.international_reputation",
                player.details.international_reputation,
            ),
        ] {
            validate_reputation(&mut issues, "player", &player.id, field, reputation);
        }
        if player
            .details
            .date_of_birth
            .is_some_and(|date| GameDate::new(date.year, date.month, date.day) != Some(date))
        {
            issue(
                &mut issues,
                "invalid_date",
                "player",
                &player.id,
                "details.date_of_birth",
                "date of birth is not a valid calendar date",
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
        validate_player_availability(&mut issues, player, &competition_ids);
        if let Some(contract) = &player.details.contract {
            validate_contract(
                &mut issues,
                "player",
                &player.id,
                contract.club_id.as_deref(),
                contract.starts_on,
                contract.expires_on,
                contract.wage,
                contract.release_clause,
                &club_ids,
            );
        }
    }

    for staff in &snapshot.staff {
        if staff.name.trim().is_empty() {
            issue(
                &mut issues,
                "empty_name",
                "staff",
                &staff.id,
                "name",
                "staff name must not be empty",
            );
        }
        if staff.age.is_some_and(|age| age > 120) {
            issue(
                &mut issues,
                "age_out_of_range",
                "staff",
                &staff.id,
                "age",
                "age must not exceed 120",
            );
        }
        validate_abilities(
            &mut issues,
            "staff",
            &staff.id,
            staff.current_ability,
            staff.potential_ability,
        );
        validate_reputation(
            &mut issues,
            "staff",
            &staff.id,
            "reputation",
            staff.reputation,
        );
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
                contract.release_clause,
                &club_ids,
            );
        }
    }

    for club in &snapshot.clubs {
        if club.name.trim().is_empty() {
            issue(
                &mut issues,
                "empty_name",
                "club",
                &club.id,
                "name",
                "club name must not be empty",
            );
        }
        validate_reputation(&mut issues, "club", &club.id, "reputation", club.reputation);
        validate_finite_money(
            &mut issues,
            "club",
            &club.id,
            "finances.balance",
            club.finances.balance,
        );
        for (field, value) in [
            ("finances.transfer_budget", club.finances.transfer_budget),
            ("finances.wage_budget", club.finances.wage_budget),
            ("finances.debt", club.finances.debt),
        ] {
            validate_nonnegative_money(&mut issues, "club", &club.id, field, value);
        }
        for (field, value) in [
            ("facilities.training", club.facilities.training),
            ("facilities.youth", club.facilities.youth),
            (
                "facilities.youth_recruitment",
                club.facilities.youth_recruitment,
            ),
            (
                "facilities.junior_coaching",
                club.facilities.junior_coaching,
            ),
        ] {
            if value.is_some_and(|value| !(1..=20).contains(&value)) {
                issue(
                    &mut issues,
                    "facility_out_of_range",
                    "club",
                    &club.id,
                    field,
                    "facility value must be between 1 and 20",
                );
            }
        }
    }

    for competition in &snapshot.competitions {
        if competition.name.trim().is_empty() {
            issue(
                &mut issues,
                "empty_name",
                "competition",
                &competition.id,
                "name",
                "competition name must not be empty",
            );
        }
        validate_reputation(
            &mut issues,
            "competition",
            &competition.id,
            "reputation",
            competition.reputation,
        );
        if competition.level == Some(0) {
            issue(
                &mut issues,
                "level_out_of_range",
                "competition",
                &competition.id,
                "level",
                "competition level must be greater than zero",
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

fn validate_player_availability(
    issues: &mut Vec<SnapshotIssue>,
    player: &Player,
    competition_ids: &HashSet<&str>,
) {
    for (field, value) in [
        (
            "details.fitness.condition",
            player.details.fitness.condition,
        ),
        (
            "details.fitness.match_fitness",
            player.details.fitness.match_fitness,
        ),
        ("details.fitness.fatigue", player.details.fitness.fatigue),
        (
            "details.fitness.jadedness",
            player.details.fitness.jadedness,
        ),
    ] {
        if value.is_some_and(|value| value > 100) {
            issue(
                issues,
                "fitness_out_of_range",
                "player",
                &player.id,
                field,
                "fitness percentage must be between 0 and 100",
            );
        }
    }
    for (field, value) in [
        ("details.morale", player.details.morale),
        ("details.happiness", player.details.happiness),
    ] {
        if value.is_some_and(|value| !(1..=20).contains(&value)) {
            issue(
                issues,
                "wellbeing_out_of_range",
                "player",
                &player.id,
                field,
                "morale and happiness must be between 1 and 20",
            );
        }
    }

    if player.details.injuries.len() > 64 {
        issue(
            issues,
            "too_many_injuries",
            "player",
            &player.id,
            "details.injuries",
            "a player may contain at most 64 injury records",
        );
    }
    let mut injury_ids = HashSet::new();
    for (index, injury) in player.details.injuries.iter().enumerate() {
        let prefix = format!("details.injuries.{index}");
        if injury.id.trim().is_empty()
            || injury.id.len() > 128
            || !injury_ids.insert(injury.id.as_str())
        {
            issue(
                issues,
                "invalid_injury_id",
                "player",
                &player.id,
                format!("{prefix}.id"),
                "injury ID must be non-empty, bounded and unique per player",
            );
        }
        if injury.name.trim().is_empty() || injury.name.len() > 256 {
            issue(
                issues,
                "invalid_injury_name",
                "player",
                &player.id,
                format!("{prefix}.name"),
                "injury name must be non-empty and at most 256 bytes",
            );
        }
        validate_date_range(
            issues,
            "player",
            &player.id,
            &prefix,
            ("started_on", injury.started_on),
            ("expected_return", injury.expected_return),
        );
        if injury.days_remaining.is_some_and(|days| days > 3_650) {
            issue(
                issues,
                "injury_duration_out_of_range",
                "player",
                &player.id,
                format!("{prefix}.days_remaining"),
                "injury duration may not exceed 3650 days",
            );
        }
    }

    if player.details.bans.len() > 64 {
        issue(
            issues,
            "too_many_bans",
            "player",
            &player.id,
            "details.bans",
            "a player may contain at most 64 ban records",
        );
    }
    let mut ban_ids = HashSet::new();
    for (index, ban) in player.details.bans.iter().enumerate() {
        let prefix = format!("details.bans.{index}");
        if ban.id.trim().is_empty() || ban.id.len() > 128 || !ban_ids.insert(ban.id.as_str()) {
            issue(
                issues,
                "invalid_ban_id",
                "player",
                &player.id,
                format!("{prefix}.id"),
                "ban ID must be non-empty, bounded and unique per player",
            );
        }
        if ban.reason.trim().is_empty() || ban.reason.len() > 256 {
            issue(
                issues,
                "invalid_ban_reason",
                "player",
                &player.id,
                format!("{prefix}.reason"),
                "ban reason must be non-empty and at most 256 bytes",
            );
        }
        if ban
            .competition_id
            .as_deref()
            .is_some_and(|id| !competition_ids.contains(id))
        {
            issue(
                issues,
                "unknown_competition_reference",
                "player",
                &player.id,
                format!("{prefix}.competition_id"),
                "ban references a competition that is not in the snapshot",
            );
        }
        validate_date_range(
            issues,
            "player",
            &player.id,
            &prefix,
            ("starts_on", ban.starts_on),
            ("ends_on", ban.ends_on),
        );
        if ban.matches_remaining.is_some_and(|matches| matches > 1_000) {
            issue(
                issues,
                "ban_length_out_of_range",
                "player",
                &player.id,
                format!("{prefix}.matches_remaining"),
                "ban length may not exceed 1000 matches",
            );
        }
    }
}

fn validate_date_range(
    issues: &mut Vec<SnapshotIssue>,
    entity_kind: &str,
    entity_id: &str,
    prefix: &str,
    start: (&str, Option<GameDate>),
    end: (&str, Option<GameDate>),
) {
    let (start_field, starts_on) = start;
    let (end_field, ends_on) = end;
    for (field, date) in [(start_field, starts_on), (end_field, ends_on)] {
        if date.is_some_and(|date| GameDate::new(date.year, date.month, date.day) != Some(date)) {
            issue(
                issues,
                "invalid_date",
                entity_kind,
                entity_id,
                format!("{prefix}.{field}"),
                "date is not a valid calendar date",
            );
        }
    }
    if starts_on
        .zip(ends_on)
        .is_some_and(|(start, end)| start > end)
    {
        issue(
            issues,
            "invalid_date_range",
            entity_kind,
            entity_id,
            format!("{prefix}.{end_field}"),
            "end date must not be before start date",
        );
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
    release_clause: Option<f64>,
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
    validate_nonnegative_money(
        issues,
        entity_kind,
        entity_id,
        "contract.release_clause",
        release_clause,
    );
}

fn validate_abilities(
    issues: &mut Vec<SnapshotIssue>,
    entity_kind: &str,
    entity_id: &str,
    current_ability: Option<u16>,
    potential_ability: Option<u16>,
) {
    for (field, value) in [
        ("current_ability", current_ability),
        ("potential_ability", potential_ability),
    ] {
        if value.is_some_and(|value| value > 200) {
            issue(
                issues,
                "ability_out_of_range",
                entity_kind,
                entity_id,
                field,
                "ability must not exceed 200",
            );
        }
    }
}

fn validate_reputation(
    issues: &mut Vec<SnapshotIssue>,
    entity_kind: &str,
    entity_id: &str,
    field: &str,
    reputation: Option<u16>,
) {
    if reputation.is_some_and(|reputation| reputation > 10_000) {
        issue(
            issues,
            "reputation_out_of_range",
            entity_kind,
            entity_id,
            field,
            "reputation must not exceed 10000",
        );
    }
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

fn validate_finite_money(
    issues: &mut Vec<SnapshotIssue>,
    entity_kind: &str,
    entity_id: &str,
    field: &str,
    value: Option<f64>,
) {
    if value.is_some_and(|value| !value.is_finite()) {
        issue(
            issues,
            "invalid_money",
            entity_kind,
            entity_id,
            field,
            "money value must be finite",
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
        snapshot.staff[0].reputation = Some(10_001);
        snapshot.clubs[0].facilities.training = Some(21);
        snapshot.competitions[0].level = Some(0);
        let report = validate_snapshot(&snapshot);
        assert!(!report.valid);
        for code in [
            "duplicate_id",
            "ability_out_of_range",
            "attribute_out_of_range",
            "unknown_club_reference",
            "reputation_out_of_range",
            "facility_out_of_range",
            "level_out_of_range",
        ] {
            assert!(report.issues.iter().any(|issue| issue.code == code));
        }
    }
}
