use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

use crate::{
    AppliedTransaction, DatabaseSnapshot, EDITOR_SCHEMA_VERSION, EditEntityKind, EditOperation,
    EditTransaction, FieldExpectation, GameDate, Player, PlayerBan, PlayerInjury, TransactionError,
    apply_transaction, editor::entity_value, editor::value_at_path, snapshot_hash,
    validate_snapshot,
};

pub const AVAILABILITY_SCHEMA_VERSION: u32 = 1;
const MAXIMUM_ACTION_TARGETS: usize = 250;
const MAXIMUM_IDENTIFIER_BYTES: usize = 128;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct AvailabilityCriteria {
    pub as_of: GameDate,
    pub low_condition_below: u8,
    pub low_match_fitness_below: u8,
    pub high_fatigue_above: u8,
    pub high_jadedness_above: u8,
    pub low_morale_below: u8,
    pub low_happiness_below: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AvailabilityState {
    Available,
    Managed,
    Doubtful,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AvailabilityIssueKind {
    Injury,
    Ban,
    UnavailableFlag,
    LowCondition,
    LowMatchFitness,
    HighFatigue,
    HighJadedness,
    LowMorale,
    Unhappy,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AvailabilityIssue {
    pub kind: AvailabilityIssueKind,
    pub impact: AvailabilityState,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlayerAvailability {
    pub player_id: String,
    pub player_name: String,
    pub club: Option<String>,
    pub state: AvailabilityState,
    pub score: u8,
    pub condition: Option<u8>,
    pub match_fitness: Option<u8>,
    pub fatigue: Option<u8>,
    pub jadedness: Option<u8>,
    pub morale: Option<u8>,
    pub happiness: Option<u8>,
    pub active_injuries: Vec<PlayerInjury>,
    pub active_bans: Vec<PlayerBan>,
    pub issues: Vec<AvailabilityIssue>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AvailabilityReport {
    pub schema_version: u32,
    pub as_of: GameDate,
    pub snapshot_hash: String,
    pub total_players: usize,
    pub available_count: usize,
    pub managed_count: usize,
    pub doubtful_count: usize,
    pub unavailable_count: usize,
    pub players: Vec<PlayerAvailability>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AvailabilityAction {
    RestoreCondition,
    ClearInjuries,
    ClearBans,
    StabilizeMorale,
    MakeMatchReady,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AvailabilityActionRequest {
    pub transaction_id: String,
    pub created_at_utc: String,
    pub player_ids: Vec<String>,
    pub action: AvailabilityAction,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PreparedAvailabilityAction {
    pub action: AvailabilityAction,
    pub affected_player_count: usize,
    pub transaction: EditTransaction,
    pub preview: AppliedTransaction,
}

#[derive(Debug, Error)]
pub enum AvailabilityError {
    #[error("availability criteria are outside the canonical ranges")]
    InvalidCriteria,
    #[error(
        "availability action must contain between 1 and {MAXIMUM_ACTION_TARGETS} unique player targets"
    )]
    InvalidTargets,
    #[error("availability action would not change any selected player")]
    NoChanges,
    #[error(transparent)]
    Transaction(#[from] TransactionError),
}

pub fn analyse_player_availability(
    snapshot: &DatabaseSnapshot,
    criteria: AvailabilityCriteria,
) -> Result<AvailabilityReport, AvailabilityError> {
    validate_criteria(criteria)?;
    let validation = validate_snapshot(snapshot);
    if !validation.valid {
        return Err(TransactionError::InvalidSnapshot(validation.issues.len()).into());
    }

    let mut players: Vec<_> = snapshot
        .players
        .iter()
        .map(|player| analyse_player(player, criteria))
        .collect();
    players.sort_by(|left, right| {
        right
            .state
            .cmp(&left.state)
            .then_with(|| left.score.cmp(&right.score))
            .then_with(|| left.player_name.cmp(&right.player_name))
            .then_with(|| left.player_id.cmp(&right.player_id))
    });

    Ok(AvailabilityReport {
        schema_version: AVAILABILITY_SCHEMA_VERSION,
        as_of: criteria.as_of,
        snapshot_hash: snapshot_hash(snapshot)?,
        total_players: players.len(),
        available_count: count_state(&players, AvailabilityState::Available),
        managed_count: count_state(&players, AvailabilityState::Managed),
        doubtful_count: count_state(&players, AvailabilityState::Doubtful),
        unavailable_count: count_state(&players, AvailabilityState::Unavailable),
        players,
    })
}

pub fn prepare_availability_action(
    snapshot: &DatabaseSnapshot,
    request: &AvailabilityActionRequest,
) -> Result<PreparedAvailabilityAction, AvailabilityError> {
    let unique: HashSet<_> = request.player_ids.iter().map(String::as_str).collect();
    if request.player_ids.is_empty()
        || request.player_ids.len() > MAXIMUM_ACTION_TARGETS
        || unique.len() != request.player_ids.len()
        || request
            .player_ids
            .iter()
            .any(|id| id.trim().is_empty() || id.len() > MAXIMUM_IDENTIFIER_BYTES)
    {
        return Err(AvailabilityError::InvalidTargets);
    }

    let mut operations = Vec::new();
    for player_id in &request.player_ids {
        let entity = entity_value(snapshot, EditEntityKind::Player, player_id)?;
        for (field, after) in action_changes(request.action) {
            let before = value_at_path(&entity, field)
                .cloned()
                .ok_or_else(|| TransactionError::FieldNotFound(field.to_owned()))?;
            if before != after {
                operations.push(EditOperation {
                    entity_kind: EditEntityKind::Player,
                    entity_id: player_id.clone(),
                    field: field.to_owned(),
                    expected_before: FieldExpectation::Exact(before),
                    after,
                });
            }
        }
    }
    if operations.is_empty() {
        return Err(AvailabilityError::NoChanges);
    }

    let action = request.action;
    let transaction = EditTransaction {
        schema_version: EDITOR_SCHEMA_VERSION,
        id: request.transaction_id.clone(),
        created_at_utc: request.created_at_utc.clone(),
        reason: Some(format!("Availability action: {}", action_name(action))),
        operations,
    };
    let preview = apply_transaction(snapshot, &transaction)?;
    Ok(PreparedAvailabilityAction {
        action,
        affected_player_count: request.player_ids.len(),
        transaction,
        preview,
    })
}

fn validate_criteria(criteria: AvailabilityCriteria) -> Result<(), AvailabilityError> {
    let valid_date = GameDate::new(
        criteria.as_of.year,
        criteria.as_of.month,
        criteria.as_of.day,
    ) == Some(criteria.as_of);
    if !valid_date
        || criteria.low_condition_below > 100
        || criteria.low_match_fitness_below > 100
        || criteria.high_fatigue_above > 100
        || criteria.high_jadedness_above > 100
        || !(1..=20).contains(&criteria.low_morale_below)
        || !(1..=20).contains(&criteria.low_happiness_below)
    {
        return Err(AvailabilityError::InvalidCriteria);
    }
    Ok(())
}

fn analyse_player(player: &Player, criteria: AvailabilityCriteria) -> PlayerAvailability {
    let active_injuries: Vec<_> = player
        .details
        .injuries
        .iter()
        .filter(|injury| injury.is_active_on(criteria.as_of))
        .cloned()
        .collect();
    let active_bans: Vec<_> = player
        .details
        .bans
        .iter()
        .filter(|ban| ban.is_active_on(criteria.as_of))
        .cloned()
        .collect();
    let mut issues = Vec::new();

    for injury in &active_injuries {
        issues.push(issue(
            AvailabilityIssueKind::Injury,
            AvailabilityState::Unavailable,
            injury.name.clone(),
        ));
    }
    for ban in &active_bans {
        issues.push(issue(
            AvailabilityIssueKind::Ban,
            AvailabilityState::Unavailable,
            ban.reason.clone(),
        ));
    }
    if player.details.status.injured
        || player.details.status.suspended
        || player.details.status.unavailable
    {
        let mut flags = Vec::new();
        if player.details.status.injured {
            flags.push("injured");
        }
        if player.details.status.suspended {
            flags.push("suspended");
        }
        if player.details.status.unavailable {
            flags.push("unavailable");
        }
        issues.push(issue(
            AvailabilityIssueKind::UnavailableFlag,
            AvailabilityState::Unavailable,
            flags.join(", "),
        ));
    }

    add_low_issue(
        &mut issues,
        player.details.fitness.condition,
        criteria.low_condition_below,
        AvailabilityIssueKind::LowCondition,
        AvailabilityState::Doubtful,
        "condition",
    );
    add_low_issue(
        &mut issues,
        player.details.fitness.match_fitness,
        criteria.low_match_fitness_below,
        AvailabilityIssueKind::LowMatchFitness,
        AvailabilityState::Managed,
        "match fitness",
    );
    add_high_issue(
        &mut issues,
        player.details.fitness.fatigue,
        criteria.high_fatigue_above,
        AvailabilityIssueKind::HighFatigue,
        AvailabilityState::Doubtful,
        "fatigue",
    );
    add_high_issue(
        &mut issues,
        player.details.fitness.jadedness,
        criteria.high_jadedness_above,
        AvailabilityIssueKind::HighJadedness,
        AvailabilityState::Managed,
        "jadedness",
    );
    add_low_issue(
        &mut issues,
        player.details.morale,
        criteria.low_morale_below,
        AvailabilityIssueKind::LowMorale,
        AvailabilityState::Managed,
        "morale",
    );
    add_low_issue(
        &mut issues,
        player.details.happiness,
        criteria.low_happiness_below,
        AvailabilityIssueKind::Unhappy,
        AvailabilityState::Managed,
        "happiness",
    );

    let state = issues
        .iter()
        .map(|current| current.impact)
        .max()
        .unwrap_or(AvailabilityState::Available);
    let score = if state == AvailabilityState::Unavailable {
        0
    } else {
        let penalty = issues.iter().fold(0_u16, |total, current| {
            total
                + match current.impact {
                    AvailabilityState::Available => 0,
                    AvailabilityState::Managed => 10,
                    AvailabilityState::Doubtful => 25,
                    AvailabilityState::Unavailable => 100,
                }
        });
        100_u16.saturating_sub(penalty).min(100) as u8
    };

    PlayerAvailability {
        player_id: player.id.clone(),
        player_name: player.name.clone(),
        club: player.club.clone(),
        state,
        score,
        condition: player.details.fitness.condition,
        match_fitness: player.details.fitness.match_fitness,
        fatigue: player.details.fitness.fatigue,
        jadedness: player.details.fitness.jadedness,
        morale: player.details.morale,
        happiness: player.details.happiness,
        active_injuries,
        active_bans,
        issues,
    }
}

fn add_low_issue(
    issues: &mut Vec<AvailabilityIssue>,
    value: Option<u8>,
    threshold: u8,
    kind: AvailabilityIssueKind,
    impact: AvailabilityState,
    label: &str,
) {
    if let Some(value) = value.filter(|value| *value < threshold) {
        issues.push(issue(kind, impact, format!("{label}: {value}")));
    }
}

fn add_high_issue(
    issues: &mut Vec<AvailabilityIssue>,
    value: Option<u8>,
    threshold: u8,
    kind: AvailabilityIssueKind,
    impact: AvailabilityState,
    label: &str,
) {
    if let Some(value) = value.filter(|value| *value > threshold) {
        issues.push(issue(kind, impact, format!("{label}: {value}")));
    }
}

fn issue(
    kind: AvailabilityIssueKind,
    impact: AvailabilityState,
    detail: String,
) -> AvailabilityIssue {
    AvailabilityIssue {
        kind,
        impact,
        detail,
    }
}

fn count_state(players: &[PlayerAvailability], state: AvailabilityState) -> usize {
    players
        .iter()
        .filter(|player| player.state == state)
        .count()
}

fn action_name(action: AvailabilityAction) -> &'static str {
    match action {
        AvailabilityAction::RestoreCondition => "restore_condition",
        AvailabilityAction::ClearInjuries => "clear_injuries",
        AvailabilityAction::ClearBans => "clear_bans",
        AvailabilityAction::StabilizeMorale => "stabilize_morale",
        AvailabilityAction::MakeMatchReady => "make_match_ready",
    }
}

fn action_changes(action: AvailabilityAction) -> Vec<(&'static str, Value)> {
    let fitness = [
        ("details.fitness.condition", Value::from(100)),
        ("details.fitness.match_fitness", Value::from(100)),
        ("details.fitness.fatigue", Value::from(0)),
        ("details.fitness.jadedness", Value::from(0)),
    ];
    let morale = [
        ("details.morale", Value::from(20)),
        ("details.happiness", Value::from(20)),
    ];
    match action {
        AvailabilityAction::RestoreCondition => fitness.into_iter().collect(),
        AvailabilityAction::ClearInjuries => vec![
            ("details.injuries", Value::Array(Vec::new())),
            ("details.status.injured", Value::Bool(false)),
        ],
        AvailabilityAction::ClearBans => vec![
            ("details.bans", Value::Array(Vec::new())),
            ("details.status.suspended", Value::Bool(false)),
        ],
        AvailabilityAction::StabilizeMorale => morale.into_iter().collect(),
        AvailabilityAction::MakeMatchReady => fitness
            .into_iter()
            .chain(morale)
            .chain([
                ("details.injuries", Value::Array(Vec::new())),
                ("details.bans", Value::Array(Vec::new())),
                ("details.status.injured", Value::Bool(false)),
                ("details.status.suspended", Value::Bool(false)),
                ("details.status.unavailable", Value::Bool(false)),
            ])
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        BanScope, InjurySeverity, InjuryTreatment, PlayerBan, PlayerInjury, synthetic_snapshot,
    };

    use super::*;

    fn criteria() -> AvailabilityCriteria {
        AvailabilityCriteria {
            as_of: GameDate::new(2026, 7, 22).unwrap(),
            low_condition_below: 80,
            low_match_fitness_below: 75,
            high_fatigue_above: 65,
            high_jadedness_above: 60,
            low_morale_below: 8,
            low_happiness_below: 8,
        }
    }

    #[test]
    fn classifies_injuries_bans_and_wellbeing_without_inventing_missing_values() {
        let mut snapshot = synthetic_snapshot();
        let player = &mut snapshot.players[0];
        player.details.fitness.condition = Some(68);
        player.details.morale = Some(5);
        player.details.injuries.push(PlayerInjury {
            id: "injury-1".into(),
            name: "Hamstring strain".into(),
            body_area: Some("leg".into()),
            severity: InjurySeverity::Moderate,
            started_on: GameDate::new(2026, 7, 20),
            expected_return: GameDate::new(2026, 8, 5),
            days_remaining: Some(14),
            recurring: false,
            treatment: InjuryTreatment::Physio,
        });
        player.details.bans.push(PlayerBan {
            id: "ban-1".into(),
            reason: "red card".into(),
            competition_id: Some("competition-nordliga".into()),
            scope: BanScope::Domestic,
            starts_on: GameDate::new(2026, 7, 21),
            ends_on: None,
            matches_remaining: Some(1),
        });

        let report = analyse_player_availability(&snapshot, criteria()).unwrap();
        let result = report
            .players
            .iter()
            .find(|result| result.player_id == "player-ada")
            .unwrap();
        assert_eq!(result.state, AvailabilityState::Unavailable);
        assert_eq!(result.score, 0);
        assert_eq!(result.active_injuries.len(), 1);
        assert_eq!(result.active_bans.len(), 1);
        assert!(
            result
                .issues
                .iter()
                .any(|issue| issue.kind == AvailabilityIssueKind::LowCondition)
        );
        assert_eq!(report.unavailable_count, 1);
    }

    #[test]
    fn prepares_a_match_ready_transaction_with_exact_expectations() {
        let mut snapshot = synthetic_snapshot();
        snapshot.players[0].details.fitness.condition = Some(54);
        snapshot.players[0].details.status.injured = true;
        snapshot.players[0].details.injuries.push(PlayerInjury {
            id: "injury-1".into(),
            name: "Ankle sprain".into(),
            body_area: None,
            severity: InjurySeverity::Minor,
            started_on: None,
            expected_return: None,
            days_remaining: Some(5),
            recurring: false,
            treatment: InjuryTreatment::Physio,
        });

        let prepared = prepare_availability_action(
            &snapshot,
            &AvailabilityActionRequest {
                transaction_id: "availability-action-1".into(),
                created_at_utc: "2026-07-22T12:00:00Z".into(),
                player_ids: vec!["player-ada".into()],
                action: AvailabilityAction::MakeMatchReady,
            },
        )
        .unwrap();
        let edited = &prepared.preview.snapshot.players[0];
        assert_eq!(edited.details.fitness.condition, Some(100));
        assert_eq!(edited.details.fitness.fatigue, Some(0));
        assert_eq!(edited.details.morale, Some(20));
        assert!(edited.details.injuries.is_empty());
        assert!(!edited.details.status.injured);
        assert!(
            prepared
                .transaction
                .operations
                .iter()
                .all(|operation| matches!(operation.expected_before, FieldExpectation::Exact(_)))
        );
    }

    #[test]
    fn rejects_duplicate_targets_and_no_op_actions() {
        let snapshot = synthetic_snapshot();
        let duplicate = AvailabilityActionRequest {
            transaction_id: "availability-action-2".into(),
            created_at_utc: "2026-07-22T12:00:00Z".into(),
            player_ids: vec!["player-ada".into(), "player-ada".into()],
            action: AvailabilityAction::RestoreCondition,
        };
        assert!(matches!(
            prepare_availability_action(&snapshot, &duplicate),
            Err(AvailabilityError::InvalidTargets)
        ));

        let no_op = AvailabilityActionRequest {
            transaction_id: "availability-action-3".into(),
            created_at_utc: "2026-07-22T12:00:00Z".into(),
            player_ids: vec!["player-milo".into()],
            action: AvailabilityAction::ClearInjuries,
        };
        assert!(matches!(
            prepare_availability_action(&snapshot, &no_op),
            Err(AvailabilityError::NoChanges)
        ));
    }

    #[test]
    fn ignores_future_and_finished_medical_records() {
        let mut snapshot = synthetic_snapshot();
        snapshot.players[0].details.injuries.push(PlayerInjury {
            id: "future-injury".into(),
            name: "Future injury".into(),
            body_area: None,
            severity: InjurySeverity::Minor,
            started_on: GameDate::new(2026, 7, 23),
            expected_return: GameDate::new(2026, 7, 30),
            days_remaining: Some(7),
            recurring: false,
            treatment: InjuryTreatment::None,
        });
        snapshot.players[0].details.bans.push(PlayerBan {
            id: "finished-ban".into(),
            reason: "Finished ban".into(),
            competition_id: Some("competition-nordliga".into()),
            scope: BanScope::Domestic,
            starts_on: GameDate::new(2026, 7, 1),
            ends_on: GameDate::new(2026, 7, 21),
            matches_remaining: Some(1),
        });

        let report = analyse_player_availability(&snapshot, criteria()).unwrap();
        let player = report
            .players
            .iter()
            .find(|player| player.player_id == "player-ada")
            .unwrap();
        assert!(player.active_injuries.is_empty());
        assert!(player.active_bans.is_empty());
        assert_eq!(player.state, AvailabilityState::Available);
    }
}
