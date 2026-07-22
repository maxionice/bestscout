use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::{
    AppliedTransaction, Competition, CompetitionFixture, CompetitionStage, CompetitionStanding,
    DatabaseSnapshot, EDITOR_SCHEMA_VERSION, EditEntityKind, EditOperation, EditTransaction,
    FieldExpectation, TransactionError, apply_transaction, editor::entity_value,
    editor::value_at_path, validate_snapshot,
};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CompetitionCommand {
    UpdateProfile {
        competition_id: String,
        name: String,
        short_name: Option<String>,
        nation: Option<String>,
        reputation: Option<u16>,
        current_champion_club_id: Option<String>,
        level: Option<u8>,
    },
    SetStages {
        competition_id: String,
        stages: Vec<CompetitionStage>,
    },
    UpsertFixture {
        competition_id: String,
        fixture: CompetitionFixture,
    },
    RemoveFixture {
        competition_id: String,
        fixture_id: String,
    },
    SetStandings {
        competition_id: String,
        standings: Vec<CompetitionStanding>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CompetitionActionRequest {
    pub transaction_id: String,
    pub created_at_utc: String,
    pub command: CompetitionCommand,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PreparedCompetitionAction {
    pub command: CompetitionCommand,
    pub transaction: EditTransaction,
    pub preview: AppliedTransaction,
}

#[derive(Debug, Error)]
pub enum CompetitionError {
    #[error("champion club {0} was not found")]
    ChampionNotFound(String),
    #[error("fixture {0} was not found")]
    FixtureNotFound(String),
    #[error("competition action would not change the canonical snapshot")]
    NoChanges,
    #[error(transparent)]
    Transaction(#[from] TransactionError),
}

pub fn prepare_competition_action(
    snapshot: &DatabaseSnapshot,
    request: &CompetitionActionRequest,
) -> Result<PreparedCompetitionAction, CompetitionError> {
    let validation = validate_snapshot(snapshot);
    if !validation.valid {
        return Err(TransactionError::InvalidSnapshot(validation.issues.len()).into());
    }

    let mut operations = Vec::new();
    match &request.command {
        CompetitionCommand::UpdateProfile {
            competition_id,
            name,
            short_name,
            nation,
            reputation,
            current_champion_club_id,
            level,
        } => {
            competition(snapshot, competition_id)?;
            let champion_name = current_champion_club_id
                .as_deref()
                .map(|id| champion_name(snapshot, id))
                .transpose()?;
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Competition,
                competition_id,
                "name",
                name,
            )?;
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Competition,
                competition_id,
                "short_name",
                short_name,
            )?;
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Competition,
                competition_id,
                "nation",
                nation,
            )?;
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Competition,
                competition_id,
                "reputation",
                reputation,
            )?;
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Competition,
                competition_id,
                "current_champion",
                &champion_name,
            )?;
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Competition,
                competition_id,
                "current_champion_club_id",
                current_champion_club_id,
            )?;
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Competition,
                competition_id,
                "level",
                level,
            )?;
            for club in snapshot
                .clubs
                .iter()
                .filter(|club| club.competition_id.as_deref() == Some(competition_id))
            {
                add_serialized_change(
                    snapshot,
                    &mut operations,
                    EditEntityKind::Club,
                    &club.id,
                    "competition",
                    &Some(name.clone()),
                )?;
            }
        }
        CompetitionCommand::SetStages {
            competition_id,
            stages,
        } => {
            competition(snapshot, competition_id)?;
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Competition,
                competition_id,
                "stages",
                stages,
            )?;
        }
        CompetitionCommand::UpsertFixture {
            competition_id,
            fixture,
        } => {
            let competition = competition(snapshot, competition_id)?;
            let mut fixtures = competition.fixtures.clone();
            if let Some(existing) = fixtures.iter_mut().find(|item| item.id == fixture.id) {
                *existing = fixture.clone();
            } else {
                fixtures.push(fixture.clone());
            }
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Competition,
                competition_id,
                "fixtures",
                &fixtures,
            )?;
        }
        CompetitionCommand::RemoveFixture {
            competition_id,
            fixture_id,
        } => {
            let competition = competition(snapshot, competition_id)?;
            if !competition
                .fixtures
                .iter()
                .any(|fixture| fixture.id == *fixture_id)
            {
                return Err(CompetitionError::FixtureNotFound(fixture_id.clone()));
            }
            let fixtures = competition
                .fixtures
                .iter()
                .filter(|fixture| fixture.id != *fixture_id)
                .cloned()
                .collect::<Vec<_>>();
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Competition,
                competition_id,
                "fixtures",
                &fixtures,
            )?;
        }
        CompetitionCommand::SetStandings {
            competition_id,
            standings,
        } => {
            competition(snapshot, competition_id)?;
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Competition,
                competition_id,
                "standings",
                standings,
            )?;
        }
    }

    if operations.is_empty() {
        return Err(CompetitionError::NoChanges);
    }
    let transaction = EditTransaction {
        schema_version: EDITOR_SCHEMA_VERSION,
        id: request.transaction_id.clone(),
        created_at_utc: request.created_at_utc.clone(),
        reason: Some(command_reason(&request.command)),
        operations,
    };
    let preview = apply_transaction(snapshot, &transaction)?;
    Ok(PreparedCompetitionAction {
        command: request.command.clone(),
        transaction,
        preview,
    })
}

fn competition<'a>(
    snapshot: &'a DatabaseSnapshot,
    competition_id: &str,
) -> Result<&'a Competition, CompetitionError> {
    snapshot
        .competitions
        .iter()
        .find(|competition| competition.id == competition_id)
        .ok_or_else(|| {
            TransactionError::EntityNotFound {
                entity_kind: EditEntityKind::Competition,
                entity_id: competition_id.to_owned(),
            }
            .into()
        })
}

fn champion_name(snapshot: &DatabaseSnapshot, club_id: &str) -> Result<String, CompetitionError> {
    snapshot
        .clubs
        .iter()
        .find(|club| club.id == club_id)
        .map(|club| club.name.clone())
        .ok_or_else(|| CompetitionError::ChampionNotFound(club_id.to_owned()))
}

fn add_serialized_change<T: Serialize>(
    snapshot: &DatabaseSnapshot,
    operations: &mut Vec<EditOperation>,
    entity_kind: EditEntityKind,
    entity_id: &str,
    field: &str,
    after: &T,
) -> Result<(), CompetitionError> {
    let entity = entity_value(snapshot, entity_kind, entity_id)?;
    let before = value_at_path(&entity, field)
        .cloned()
        .ok_or_else(|| TransactionError::FieldNotFound(field.to_owned()))?;
    let after = serde_json::to_value(after).map_err(TransactionError::SnapshotSerialization)?;
    if before != after {
        operations.push(EditOperation {
            entity_kind,
            entity_id: entity_id.to_owned(),
            field: field.to_owned(),
            expected_before: FieldExpectation::Exact(before),
            after,
        });
    }
    Ok(())
}

fn command_reason(command: &CompetitionCommand) -> String {
    let (action, competition_id) = match command {
        CompetitionCommand::UpdateProfile { competition_id, .. } => ("profile", competition_id),
        CompetitionCommand::SetStages { competition_id, .. } => ("stages", competition_id),
        CompetitionCommand::UpsertFixture { competition_id, .. } => ("fixture", competition_id),
        CompetitionCommand::RemoveFixture { competition_id, .. } => ("fixture", competition_id),
        CompetitionCommand::SetStandings { competition_id, .. } => ("standings", competition_id),
    };
    format!("Update competition {action} for {competition_id}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        CompetitionStageKind, FieldExpectation, FixtureStatus, GameDate, apply_transaction,
        synthetic_snapshot,
    };

    fn request(command: CompetitionCommand) -> CompetitionActionRequest {
        CompetitionActionRequest {
            transaction_id: "competition-test-1".into(),
            created_at_utc: "2026-07-22T20:00:00Z".into(),
            command,
        }
    }

    #[test]
    fn updates_profile_champion_and_dependent_club_names_atomically() {
        let snapshot = synthetic_snapshot();
        let prepared = prepare_competition_action(
            &snapshot,
            &request(CompetitionCommand::UpdateProfile {
                competition_id: "competition-nordliga".into(),
                name: "Nordliga Eins".into(),
                short_name: Some("NL1".into()),
                nation: Some("Deutschland".into()),
                reputation: Some(6_500),
                current_champion_club_id: Some("club-suedstadt".into()),
                level: Some(1),
            }),
        )
        .unwrap();

        assert!(
            prepared.transaction.operations.iter().all(|operation| {
                matches!(operation.expected_before, FieldExpectation::Exact(_))
            })
        );
        let competition = &prepared.preview.snapshot.competitions[0];
        assert_eq!(competition.name, "Nordliga Eins");
        assert_eq!(
            competition.current_champion.as_deref(),
            Some("Fußballclub Südstadt")
        );
        assert_eq!(
            competition.current_champion_club_id.as_deref(),
            Some("club-suedstadt")
        );
        assert!(
            prepared
                .preview
                .snapshot
                .clubs
                .iter()
                .all(|club| { club.competition.as_deref() == Some("Nordliga Eins") })
        );
    }

    #[test]
    fn replaces_stages_and_upserts_removes_fixtures_through_validated_previews() {
        let snapshot = synthetic_snapshot();
        let stages = vec![CompetitionStage {
            id: "stage-nordliga-2026".into(),
            name: "Finalrunde".into(),
            kind: CompetitionStageKind::Final,
            order: 1,
            starts_on: GameDate::new(2027, 5, 30),
            ends_on: GameDate::new(2027, 5, 31),
            current: true,
        }];
        let prepared = prepare_competition_action(
            &snapshot,
            &request(CompetitionCommand::SetStages {
                competition_id: "competition-nordliga".into(),
                stages: stages.clone(),
            }),
        )
        .unwrap();
        assert_eq!(prepared.preview.snapshot.competitions[0].stages, stages);

        let mut fixture = prepared.preview.snapshot.competitions[0].fixtures[0].clone();
        fixture.stage_id = Some("stage-nordliga-2026".into());
        fixture.status = FixtureStatus::Played;
        fixture.home_score = Some(2);
        fixture.away_score = Some(1);
        let prepared = prepare_competition_action(
            &prepared.preview.snapshot,
            &request(CompetitionCommand::UpsertFixture {
                competition_id: "competition-nordliga".into(),
                fixture: fixture.clone(),
            }),
        )
        .unwrap();
        assert_eq!(
            prepared.preview.snapshot.competitions[0].fixtures[0],
            fixture
        );

        let prepared = prepare_competition_action(
            &prepared.preview.snapshot,
            &request(CompetitionCommand::RemoveFixture {
                competition_id: "competition-nordliga".into(),
                fixture_id: "fixture-nordliga-opening".into(),
            }),
        )
        .unwrap();
        assert!(
            prepared.preview.snapshot.competitions[0]
                .fixtures
                .is_empty()
        );
    }

    #[test]
    fn replaces_a_consistent_standing_and_rejects_invalid_actions() {
        let snapshot = synthetic_snapshot();
        let mut standings = snapshot.competitions[0].standings.clone();
        standings[0].played = 1;
        standings[0].won = 1;
        standings[0].goals_for = 3;
        standings[0].goals_against = 1;
        standings[0].goal_difference = 2;
        standings[0].points = 3;
        standings[1].played = 1;
        standings[1].lost = 1;
        standings[1].goals_for = 1;
        standings[1].goals_against = 3;
        standings[1].goal_difference = -2;
        let prepared = prepare_competition_action(
            &snapshot,
            &request(CompetitionCommand::SetStandings {
                competition_id: "competition-nordliga".into(),
                standings: standings.clone(),
            }),
        )
        .unwrap();
        assert_eq!(
            prepared.preview.snapshot.competitions[0].standings,
            standings
        );

        let missing = prepare_competition_action(
            &snapshot,
            &request(CompetitionCommand::RemoveFixture {
                competition_id: "competition-nordliga".into(),
                fixture_id: "missing-fixture".into(),
            }),
        );
        assert!(matches!(missing, Err(CompetitionError::FixtureNotFound(_))));
        let no_op = prepare_competition_action(
            &snapshot,
            &request(CompetitionCommand::SetStages {
                competition_id: "competition-nordliga".into(),
                stages: snapshot.competitions[0].stages.clone(),
            }),
        );
        assert!(matches!(no_op, Err(CompetitionError::NoChanges)));

        standings[0].played = 2;
        let invalid = prepare_competition_action(
            &snapshot,
            &request(CompetitionCommand::SetStandings {
                competition_id: "competition-nordliga".into(),
                standings,
            }),
        );
        assert!(matches!(invalid, Err(CompetitionError::Transaction(_))));
    }

    #[test]
    fn stale_competition_preview_rejects_without_partial_application() {
        let snapshot = synthetic_snapshot();
        let prepared = prepare_competition_action(
            &snapshot,
            &request(CompetitionCommand::UpdateProfile {
                competition_id: "competition-nordliga".into(),
                name: "Nordliga Neu".into(),
                short_name: Some("NL".into()),
                nation: Some("Deutschland".into()),
                reputation: Some(6_000),
                current_champion_club_id: Some("club-nordhafen".into()),
                level: Some(1),
            }),
        )
        .unwrap();
        let mut changed = snapshot.clone();
        changed.competitions[0].name = "Extern geändert".into();
        for club in &mut changed.clubs {
            club.competition = Some("Extern geändert".into());
        }

        let result = apply_transaction(&changed, &prepared.transaction);
        assert!(matches!(result, Err(TransactionError::Conflict { .. })));
        assert_eq!(changed.competitions[0].name, "Extern geändert");
    }
}
