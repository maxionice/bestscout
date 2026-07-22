use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::{
    AppliedTransaction, Club, ClubFacilities, ClubFinances, DatabaseSnapshot,
    EDITOR_SCHEMA_VERSION, EditEntityKind, EditOperation, EditTransaction, FieldExpectation,
    TransactionError, apply_transaction, editor::entity_value, editor::value_at_path,
    validate_snapshot,
};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ClubCommand {
    UpdateIdentity {
        club_id: String,
        name: String,
        short_name: Option<String>,
        nation: Option<String>,
        competition_id: Option<String>,
        reputation: Option<u16>,
        professional_status: Option<String>,
    },
    UpdateStadium {
        club_id: String,
        stadium: Option<String>,
        stadium_capacity: Option<u32>,
        average_attendance: Option<u32>,
    },
    UpdateFinances {
        club_id: String,
        finances: ClubFinances,
    },
    UpdateFacilities {
        club_id: String,
        facilities: ClubFacilities,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ClubActionRequest {
    pub transaction_id: String,
    pub created_at_utc: String,
    pub command: ClubCommand,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PreparedClubAction {
    pub command: ClubCommand,
    pub transaction: EditTransaction,
    pub preview: AppliedTransaction,
}

#[derive(Debug, Error)]
pub enum ClubError {
    #[error("competition {0} was not found")]
    CompetitionNotFound(String),
    #[error("club action would not change the canonical snapshot")]
    NoChanges,
    #[error(transparent)]
    Transaction(#[from] TransactionError),
}

pub fn prepare_club_action(
    snapshot: &DatabaseSnapshot,
    request: &ClubActionRequest,
) -> Result<PreparedClubAction, ClubError> {
    let validation = validate_snapshot(snapshot);
    if !validation.valid {
        return Err(TransactionError::InvalidSnapshot(validation.issues.len()).into());
    }

    let mut operations = Vec::new();
    match &request.command {
        ClubCommand::UpdateIdentity {
            club_id,
            name,
            short_name,
            nation,
            competition_id,
            reputation,
            professional_status,
        } => {
            club(snapshot, club_id)?;
            let competition_name = competition_id
                .as_deref()
                .map(|id| competition_name(snapshot, id))
                .transpose()?;
            add_serialized_change(snapshot, &mut operations, club_id, "name", name)?;
            add_serialized_change(snapshot, &mut operations, club_id, "short_name", short_name)?;
            add_serialized_change(snapshot, &mut operations, club_id, "nation", nation)?;
            add_serialized_change(
                snapshot,
                &mut operations,
                club_id,
                "competition",
                &competition_name,
            )?;
            add_serialized_change(
                snapshot,
                &mut operations,
                club_id,
                "competition_id",
                competition_id,
            )?;
            add_serialized_change(snapshot, &mut operations, club_id, "reputation", reputation)?;
            add_serialized_change(
                snapshot,
                &mut operations,
                club_id,
                "professional_status",
                professional_status,
            )?;
        }
        ClubCommand::UpdateStadium {
            club_id,
            stadium,
            stadium_capacity,
            average_attendance,
        } => {
            club(snapshot, club_id)?;
            add_serialized_change(snapshot, &mut operations, club_id, "stadium", stadium)?;
            add_serialized_change(
                snapshot,
                &mut operations,
                club_id,
                "stadium_capacity",
                stadium_capacity,
            )?;
            add_serialized_change(
                snapshot,
                &mut operations,
                club_id,
                "average_attendance",
                average_attendance,
            )?;
        }
        ClubCommand::UpdateFinances { club_id, finances } => {
            club(snapshot, club_id)?;
            add_serialized_change(
                snapshot,
                &mut operations,
                club_id,
                "finances.balance",
                &finances.balance,
            )?;
            add_serialized_change(
                snapshot,
                &mut operations,
                club_id,
                "finances.transfer_budget",
                &finances.transfer_budget,
            )?;
            add_serialized_change(
                snapshot,
                &mut operations,
                club_id,
                "finances.wage_budget",
                &finances.wage_budget,
            )?;
            add_serialized_change(
                snapshot,
                &mut operations,
                club_id,
                "finances.debt",
                &finances.debt,
            )?;
        }
        ClubCommand::UpdateFacilities {
            club_id,
            facilities,
        } => {
            club(snapshot, club_id)?;
            add_serialized_change(
                snapshot,
                &mut operations,
                club_id,
                "facilities.training",
                &facilities.training,
            )?;
            add_serialized_change(
                snapshot,
                &mut operations,
                club_id,
                "facilities.youth",
                &facilities.youth,
            )?;
            add_serialized_change(
                snapshot,
                &mut operations,
                club_id,
                "facilities.youth_recruitment",
                &facilities.youth_recruitment,
            )?;
            add_serialized_change(
                snapshot,
                &mut operations,
                club_id,
                "facilities.junior_coaching",
                &facilities.junior_coaching,
            )?;
        }
    }

    if operations.is_empty() {
        return Err(ClubError::NoChanges);
    }
    let transaction = EditTransaction {
        schema_version: EDITOR_SCHEMA_VERSION,
        id: request.transaction_id.clone(),
        created_at_utc: request.created_at_utc.clone(),
        reason: Some(command_reason(&request.command)),
        operations,
    };
    let preview = apply_transaction(snapshot, &transaction)?;
    Ok(PreparedClubAction {
        command: request.command.clone(),
        transaction,
        preview,
    })
}

fn club<'a>(snapshot: &'a DatabaseSnapshot, club_id: &str) -> Result<&'a Club, ClubError> {
    snapshot
        .clubs
        .iter()
        .find(|club| club.id == club_id)
        .ok_or_else(|| {
            TransactionError::EntityNotFound {
                entity_kind: EditEntityKind::Club,
                entity_id: club_id.to_owned(),
            }
            .into()
        })
}

fn competition_name(
    snapshot: &DatabaseSnapshot,
    competition_id: &str,
) -> Result<String, ClubError> {
    snapshot
        .competitions
        .iter()
        .find(|competition| competition.id == competition_id)
        .map(|competition| competition.name.clone())
        .ok_or_else(|| ClubError::CompetitionNotFound(competition_id.to_owned()))
}

fn add_serialized_change<T: Serialize>(
    snapshot: &DatabaseSnapshot,
    operations: &mut Vec<EditOperation>,
    club_id: &str,
    field: &str,
    after: &T,
) -> Result<(), ClubError> {
    let entity = entity_value(snapshot, EditEntityKind::Club, club_id)?;
    let before = value_at_path(&entity, field)
        .cloned()
        .ok_or_else(|| TransactionError::FieldNotFound(field.to_owned()))?;
    let after = serde_json::to_value(after).map_err(TransactionError::SnapshotSerialization)?;
    if before != after {
        operations.push(EditOperation {
            entity_kind: EditEntityKind::Club,
            entity_id: club_id.to_owned(),
            field: field.to_owned(),
            expected_before: FieldExpectation::Exact(before),
            after,
        });
    }
    Ok(())
}

fn command_reason(command: &ClubCommand) -> String {
    let (action, club_id) = match command {
        ClubCommand::UpdateIdentity { club_id, .. } => ("identity", club_id),
        ClubCommand::UpdateStadium { club_id, .. } => ("stadium", club_id),
        ClubCommand::UpdateFinances { club_id, .. } => ("finances", club_id),
        ClubCommand::UpdateFacilities { club_id, .. } => ("facilities", club_id),
    };
    format!("Update club {action} for {club_id}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{FieldExpectation, apply_transaction, synthetic_snapshot};

    fn request(command: ClubCommand) -> ClubActionRequest {
        ClubActionRequest {
            transaction_id: "club-test-1".into(),
            created_at_utc: "2026-07-22T20:00:00Z".into(),
            command,
        }
    }

    #[test]
    fn updates_identity_and_competition_reference_atomically() {
        let mut snapshot = synthetic_snapshot();
        let mut competition = snapshot.competitions[0].clone();
        competition.id = "competition-cup".into();
        competition.name = "Nordpokal".into();
        snapshot.competitions.push(competition);
        let prepared = prepare_club_action(
            &snapshot,
            &request(ClubCommand::UpdateIdentity {
                club_id: "club-nordhafen".into(),
                name: "SV Nordhafen 1908".into(),
                short_name: Some("Nordhafen".into()),
                nation: Some("Deutschland".into()),
                competition_id: Some("competition-cup".into()),
                reputation: Some(5_200),
                professional_status: Some("professional".into()),
            }),
        )
        .unwrap();

        assert!(
            prepared.transaction.operations.iter().all(|operation| {
                matches!(operation.expected_before, FieldExpectation::Exact(_))
            })
        );
        let club = &prepared.preview.snapshot.clubs[0];
        assert_eq!(club.name, "SV Nordhafen 1908");
        assert_eq!(club.competition.as_deref(), Some("Nordpokal"));
        assert_eq!(club.competition_id.as_deref(), Some("competition-cup"));
        assert_eq!(club.reputation, Some(5_200));
    }

    #[test]
    fn updates_finances_and_facilities_through_validated_previews() {
        let snapshot = synthetic_snapshot();
        let finances = ClubFinances {
            balance: Some(-500_000.0),
            transfer_budget: Some(2_000_000.0),
            wage_budget: Some(350_000.0),
            debt: Some(8_000_000.0),
        };
        let prepared = prepare_club_action(
            &snapshot,
            &request(ClubCommand::UpdateFinances {
                club_id: "club-nordhafen".into(),
                finances: finances.clone(),
            }),
        )
        .unwrap();
        assert_eq!(prepared.preview.snapshot.clubs[0].finances, finances);

        let facilities = ClubFacilities {
            training: Some(20),
            youth: Some(19),
            youth_recruitment: Some(18),
            junior_coaching: Some(17),
        };
        let prepared = prepare_club_action(
            &prepared.preview.snapshot,
            &request(ClubCommand::UpdateFacilities {
                club_id: "club-nordhafen".into(),
                facilities: facilities.clone(),
            }),
        )
        .unwrap();
        assert_eq!(prepared.preview.snapshot.clubs[0].facilities, facilities);
    }

    #[test]
    fn rejects_invalid_stadiums_unknown_references_missing_clubs_and_no_ops() {
        let snapshot = synthetic_snapshot();
        assert!(matches!(
            prepare_club_action(
                &snapshot,
                &request(ClubCommand::UpdateStadium {
                    club_id: "club-nordhafen".into(),
                    stadium: Some("Hafenpark".into()),
                    stadium_capacity: Some(10_000),
                    average_attendance: Some(12_000),
                }),
            ),
            Err(ClubError::Transaction(TransactionError::InvalidSnapshot(_)))
        ));
        assert!(matches!(
            prepare_club_action(
                &snapshot,
                &request(ClubCommand::UpdateIdentity {
                    club_id: "club-nordhafen".into(),
                    name: "Sportverein Nordhafen".into(),
                    short_name: Some("SV Nordhafen".into()),
                    nation: Some("Deutschland".into()),
                    competition_id: Some("missing-competition".into()),
                    reputation: Some(4_800),
                    professional_status: Some("professional".into()),
                }),
            ),
            Err(ClubError::CompetitionNotFound(id)) if id == "missing-competition"
        ));
        assert!(matches!(
            prepare_club_action(
                &snapshot,
                &request(ClubCommand::UpdateFacilities {
                    club_id: "missing-club".into(),
                    facilities: ClubFacilities::default(),
                }),
            ),
            Err(ClubError::Transaction(
                TransactionError::EntityNotFound { .. }
            ))
        ));
        assert!(matches!(
            prepare_club_action(
                &snapshot,
                &request(ClubCommand::UpdateFinances {
                    club_id: "club-nordhafen".into(),
                    finances: snapshot.clubs[0].finances.clone(),
                }),
            ),
            Err(ClubError::NoChanges)
        ));
    }

    #[test]
    fn rejects_a_stale_club_preview_without_partial_application() {
        let snapshot = synthetic_snapshot();
        let prepared = prepare_club_action(
            &snapshot,
            &request(ClubCommand::UpdateFinances {
                club_id: "club-nordhafen".into(),
                finances: ClubFinances {
                    balance: Some(20_000_000.0),
                    ..snapshot.clubs[0].finances.clone()
                },
            }),
        )
        .unwrap();
        let mut stale = snapshot;
        stale.clubs[0].finances.balance = Some(19_000_000.0);
        let before = stale.clone();
        assert!(matches!(
            apply_transaction(&stale, &prepared.transaction),
            Err(TransactionError::Conflict { field }) if field == "finances.balance"
        ));
        assert_eq!(stale, before);
    }
}
