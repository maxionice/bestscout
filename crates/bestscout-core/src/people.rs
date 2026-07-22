use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

use crate::{
    AppliedTransaction, Contract, DatabaseSnapshot, EDITOR_SCHEMA_VERSION, EditEntityKind,
    EditOperation, EditTransaction, FieldExpectation, LanguageSkill, PersonRelationship,
    PlayerRegistration, StaffQualification, StaffResponsibility, StaffRole, TransactionError,
    apply_transaction, editor::entity_value, editor::value_at_path, validate_snapshot,
};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PeopleCommand {
    UpdateStaffAssignment {
        staff_id: String,
        roles: Vec<StaffRole>,
        responsibilities: Vec<StaffResponsibility>,
        contract: Option<Contract>,
    },
    UpdateStaffProfile {
        staff_id: String,
        date_of_birth: Option<crate::GameDate>,
        note: Option<String>,
    },
    SetPlayerLanguages {
        player_id: String,
        languages: Vec<LanguageSkill>,
    },
    SetStaffLanguages {
        staff_id: String,
        languages: Vec<LanguageSkill>,
    },
    SetStaffQualifications {
        staff_id: String,
        qualifications: Vec<StaffQualification>,
    },
    UpsertPlayerRegistration {
        player_id: String,
        registration: PlayerRegistration,
    },
    RemovePlayerRegistration {
        player_id: String,
        registration_id: String,
    },
    UpsertPlayerRelationship {
        player_id: String,
        relationship: PersonRelationship,
    },
    RemovePlayerRelationship {
        player_id: String,
        relationship_id: String,
    },
    UpsertStaffRelationship {
        staff_id: String,
        relationship: PersonRelationship,
    },
    RemoveStaffRelationship {
        staff_id: String,
        relationship_id: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PeopleActionRequest {
    pub transaction_id: String,
    pub created_at_utc: String,
    pub command: PeopleCommand,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PreparedPeopleAction {
    pub command: PeopleCommand,
    pub transaction: EditTransaction,
    pub preview: AppliedTransaction,
}

#[derive(Debug, Error)]
pub enum PeopleError {
    #[error("club {0} was not found")]
    ClubNotFound(String),
    #[error("registration {0} was not found on the selected player")]
    RegistrationNotFound(String),
    #[error("relationship {0} was not found on the selected person")]
    RelationshipNotFound(String),
    #[error("people action would not change the canonical snapshot")]
    NoChanges,
    #[error(transparent)]
    Transaction(#[from] TransactionError),
}

pub fn prepare_people_action(
    snapshot: &DatabaseSnapshot,
    request: &PeopleActionRequest,
) -> Result<PreparedPeopleAction, PeopleError> {
    let validation = validate_snapshot(snapshot);
    if !validation.valid {
        return Err(TransactionError::InvalidSnapshot(validation.issues.len()).into());
    }

    let mut operations = Vec::new();
    match &request.command {
        PeopleCommand::UpdateStaffAssignment {
            staff_id,
            roles,
            responsibilities,
            contract,
        } => {
            staff(snapshot, staff_id)?;
            let club = contract
                .as_ref()
                .and_then(|contract| contract.club_id.as_deref())
                .map(|club_id| club_name(snapshot, club_id))
                .transpose()?
                .map(Value::String)
                .unwrap_or(Value::Null);
            add_change(
                snapshot,
                &mut operations,
                EditEntityKind::Staff,
                staff_id,
                "club",
                club,
            )?;
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Staff,
                staff_id,
                "roles",
                roles,
            )?;
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Staff,
                staff_id,
                "details.responsibilities",
                responsibilities,
            )?;
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Staff,
                staff_id,
                "contract",
                contract,
            )?;
        }
        PeopleCommand::UpdateStaffProfile {
            staff_id,
            date_of_birth,
            note,
        } => {
            staff(snapshot, staff_id)?;
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Staff,
                staff_id,
                "details.date_of_birth",
                date_of_birth,
            )?;
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Staff,
                staff_id,
                "details.note",
                note,
            )?;
        }
        PeopleCommand::SetPlayerLanguages {
            player_id,
            languages,
        } => {
            player(snapshot, player_id)?;
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Player,
                player_id,
                "details.languages",
                languages,
            )?;
        }
        PeopleCommand::SetStaffLanguages {
            staff_id,
            languages,
        } => {
            staff(snapshot, staff_id)?;
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Staff,
                staff_id,
                "details.languages",
                languages,
            )?;
        }
        PeopleCommand::SetStaffQualifications {
            staff_id,
            qualifications,
        } => {
            staff(snapshot, staff_id)?;
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Staff,
                staff_id,
                "details.qualifications",
                qualifications,
            )?;
        }
        PeopleCommand::UpsertPlayerRegistration {
            player_id,
            registration,
        } => {
            let player = player(snapshot, player_id)?;
            let registrations = upsert_by_id(&player.details.registrations, registration, |item| {
                item.id.as_str()
            });
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Player,
                player_id,
                "details.registrations",
                &registrations,
            )?;
        }
        PeopleCommand::RemovePlayerRegistration {
            player_id,
            registration_id,
        } => {
            let player = player(snapshot, player_id)?;
            let registrations =
                remove_by_id(&player.details.registrations, registration_id, |item| {
                    item.id.as_str()
                })
                .ok_or_else(|| PeopleError::RegistrationNotFound(registration_id.clone()))?;
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Player,
                player_id,
                "details.registrations",
                &registrations,
            )?;
        }
        PeopleCommand::UpsertPlayerRelationship {
            player_id,
            relationship,
        } => {
            let player = player(snapshot, player_id)?;
            let relationships = upsert_by_id(&player.details.relationships, relationship, |item| {
                item.id.as_str()
            });
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Player,
                player_id,
                "details.relationships",
                &relationships,
            )?;
        }
        PeopleCommand::RemovePlayerRelationship {
            player_id,
            relationship_id,
        } => {
            let player = player(snapshot, player_id)?;
            let relationships =
                remove_by_id(&player.details.relationships, relationship_id, |item| {
                    item.id.as_str()
                })
                .ok_or_else(|| PeopleError::RelationshipNotFound(relationship_id.clone()))?;
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Player,
                player_id,
                "details.relationships",
                &relationships,
            )?;
        }
        PeopleCommand::UpsertStaffRelationship {
            staff_id,
            relationship,
        } => {
            let staff = staff(snapshot, staff_id)?;
            let relationships = upsert_by_id(&staff.details.relationships, relationship, |item| {
                item.id.as_str()
            });
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Staff,
                staff_id,
                "details.relationships",
                &relationships,
            )?;
        }
        PeopleCommand::RemoveStaffRelationship {
            staff_id,
            relationship_id,
        } => {
            let staff = staff(snapshot, staff_id)?;
            let relationships =
                remove_by_id(&staff.details.relationships, relationship_id, |item| {
                    item.id.as_str()
                })
                .ok_or_else(|| PeopleError::RelationshipNotFound(relationship_id.clone()))?;
            add_serialized_change(
                snapshot,
                &mut operations,
                EditEntityKind::Staff,
                staff_id,
                "details.relationships",
                &relationships,
            )?;
        }
    }

    if operations.is_empty() {
        return Err(PeopleError::NoChanges);
    }
    let transaction = EditTransaction {
        schema_version: EDITOR_SCHEMA_VERSION,
        id: request.transaction_id.clone(),
        created_at_utc: request.created_at_utc.clone(),
        reason: Some(command_reason(&request.command)),
        operations,
    };
    let preview = apply_transaction(snapshot, &transaction)?;
    Ok(PreparedPeopleAction {
        command: request.command.clone(),
        transaction,
        preview,
    })
}

fn player<'a>(
    snapshot: &'a DatabaseSnapshot,
    player_id: &str,
) -> Result<&'a crate::Player, PeopleError> {
    snapshot
        .players
        .iter()
        .find(|player| player.id == player_id)
        .ok_or_else(|| {
            TransactionError::EntityNotFound {
                entity_kind: EditEntityKind::Player,
                entity_id: player_id.to_owned(),
            }
            .into()
        })
}

fn staff<'a>(
    snapshot: &'a DatabaseSnapshot,
    staff_id: &str,
) -> Result<&'a crate::Staff, PeopleError> {
    snapshot
        .staff
        .iter()
        .find(|staff| staff.id == staff_id)
        .ok_or_else(|| {
            TransactionError::EntityNotFound {
                entity_kind: EditEntityKind::Staff,
                entity_id: staff_id.to_owned(),
            }
            .into()
        })
}

fn club_name(snapshot: &DatabaseSnapshot, club_id: &str) -> Result<String, PeopleError> {
    snapshot
        .clubs
        .iter()
        .find(|club| club.id == club_id)
        .map(|club| club.name.clone())
        .ok_or_else(|| PeopleError::ClubNotFound(club_id.to_owned()))
}

fn upsert_by_id<T: Clone>(items: &[T], replacement: &T, id: impl Fn(&T) -> &str) -> Vec<T> {
    let replacement_id = id(replacement);
    let mut found = false;
    let mut result: Vec<_> = items
        .iter()
        .map(|item| {
            if id(item) == replacement_id {
                found = true;
                replacement.clone()
            } else {
                item.clone()
            }
        })
        .collect();
    if !found {
        result.push(replacement.clone());
    }
    result
}

fn remove_by_id<T: Clone>(items: &[T], target_id: &str, id: impl Fn(&T) -> &str) -> Option<Vec<T>> {
    items.iter().any(|item| id(item) == target_id).then(|| {
        items
            .iter()
            .filter(|item| id(item) != target_id)
            .cloned()
            .collect()
    })
}

fn add_serialized_change<T: Serialize>(
    snapshot: &DatabaseSnapshot,
    operations: &mut Vec<EditOperation>,
    entity_kind: EditEntityKind,
    entity_id: &str,
    field: &str,
    after: &T,
) -> Result<(), PeopleError> {
    add_change(
        snapshot,
        operations,
        entity_kind,
        entity_id,
        field,
        serde_json::to_value(after).map_err(TransactionError::SnapshotSerialization)?,
    )
}

fn add_change(
    snapshot: &DatabaseSnapshot,
    operations: &mut Vec<EditOperation>,
    entity_kind: EditEntityKind,
    entity_id: &str,
    field: &str,
    after: Value,
) -> Result<(), PeopleError> {
    let entity = entity_value(snapshot, entity_kind, entity_id)?;
    let before = value_at_path(&entity, field)
        .cloned()
        .ok_or_else(|| TransactionError::FieldNotFound(field.to_owned()))?;
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

fn command_reason(command: &PeopleCommand) -> String {
    match command {
        PeopleCommand::UpdateStaffAssignment { staff_id, .. } => {
            format!("Update staff assignment for {staff_id}")
        }
        PeopleCommand::UpdateStaffProfile { staff_id, .. } => {
            format!("Update staff profile for {staff_id}")
        }
        PeopleCommand::SetPlayerLanguages { player_id, .. } => {
            format!("Update player languages for {player_id}")
        }
        PeopleCommand::SetStaffLanguages { staff_id, .. } => {
            format!("Update staff languages for {staff_id}")
        }
        PeopleCommand::SetStaffQualifications { staff_id, .. } => {
            format!("Update staff qualifications for {staff_id}")
        }
        PeopleCommand::UpsertPlayerRegistration { player_id, .. } => {
            format!("Upsert player registration for {player_id}")
        }
        PeopleCommand::RemovePlayerRegistration { player_id, .. } => {
            format!("Remove player registration for {player_id}")
        }
        PeopleCommand::UpsertPlayerRelationship { player_id, .. } => {
            format!("Upsert player relationship for {player_id}")
        }
        PeopleCommand::RemovePlayerRelationship { player_id, .. } => {
            format!("Remove player relationship for {player_id}")
        }
        PeopleCommand::UpsertStaffRelationship { staff_id, .. } => {
            format!("Upsert staff relationship for {staff_id}")
        }
        PeopleCommand::RemoveStaffRelationship { staff_id, .. } => {
            format!("Remove staff relationship for {staff_id}")
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        ContractType, GameDate, LanguageSkill, PersonRelationship, PlayerRegistration,
        RegistrationStatus, RelationshipKind, RelationshipTargetKind, StaffResponsibility,
        StaffRole, apply_transaction, synthetic_snapshot,
    };

    use super::*;

    fn request(command: PeopleCommand) -> PeopleActionRequest {
        PeopleActionRequest {
            transaction_id: "people-test-1".into(),
            created_at_utc: "2026-07-22T12:00:00Z".into(),
            command,
        }
    }

    #[test]
    fn updates_staff_role_responsibility_club_and_contract_atomically() {
        let snapshot = synthetic_snapshot();
        let prepared = prepare_people_action(
            &snapshot,
            &request(PeopleCommand::UpdateStaffAssignment {
                staff_id: "staff-lina".into(),
                roles: vec![StaffRole::DirectorOfFootball],
                responsibilities: vec![
                    StaffResponsibility::Recruitment,
                    StaffResponsibility::ContractNegotiations,
                ],
                contract: Some(Contract {
                    club_id: Some("club-suedstadt".into()),
                    starts_on: GameDate::new(2026, 7, 22),
                    expires_on: GameDate::new(2030, 6, 30),
                    contract_type: ContractType::FullTime,
                    wage: Some(30_000.0),
                    ..Default::default()
                }),
            }),
        )
        .unwrap();
        assert_eq!(prepared.transaction.operations.len(), 4);
        assert!(
            prepared.transaction.operations.iter().all(|operation| {
                matches!(operation.expected_before, FieldExpectation::Exact(_))
            })
        );
        let staff = &prepared.preview.snapshot.staff[0];
        assert_eq!(staff.club.as_deref(), Some("Fußballclub Südstadt"));
        assert_eq!(staff.roles, vec![StaffRole::DirectorOfFootball]);
        assert_eq!(staff.details.responsibilities.len(), 2);
        assert_eq!(
            staff
                .contract
                .as_ref()
                .and_then(|item| item.club_id.as_deref()),
            Some("club-suedstadt")
        );
    }

    #[test]
    fn updates_staff_birth_date_and_note_atomically() {
        let snapshot = synthetic_snapshot();
        let birth_date = GameDate::new(1984, 5, 12);
        let prepared = prepare_people_action(
            &snapshot,
            &request(PeopleCommand::UpdateStaffProfile {
                staff_id: "staff-lina".into(),
                date_of_birth: birth_date,
                note: Some("Leitet die internationale Rekrutierung".into()),
            }),
        )
        .unwrap();

        assert_eq!(prepared.transaction.operations.len(), 2);
        assert_eq!(
            prepared.preview.snapshot.staff[0].details.date_of_birth,
            birth_date
        );
        assert_eq!(
            prepared.preview.snapshot.staff[0].details.note.as_deref(),
            Some("Leitet die internationale Rekrutierung")
        );
    }

    #[test]
    fn upserts_and_removes_a_valid_player_registration() {
        let snapshot = synthetic_snapshot();
        let registration = PlayerRegistration {
            id: "registration-ada-cup".into(),
            competition_id: "competition-nordliga".into(),
            club_id: "club-nordhafen".into(),
            status: RegistrationStatus::Pending,
            registered_on: GameDate::new(2026, 7, 22),
            expires_on: GameDate::new(2027, 6, 30),
            squad_number: Some(10),
            homegrown_at_club: true,
            homegrown_in_nation: true,
        };
        let mut without_existing = snapshot.clone();
        without_existing.players[0].details.registrations.clear();
        let prepared = prepare_people_action(
            &without_existing,
            &request(PeopleCommand::UpsertPlayerRegistration {
                player_id: "player-ada".into(),
                registration: registration.clone(),
            }),
        )
        .unwrap();
        assert_eq!(prepared.transaction.operations.len(), 1);
        assert_eq!(
            prepared.preview.snapshot.players[0].details.registrations,
            vec![registration.clone()]
        );
        let removed = prepare_people_action(
            &prepared.preview.snapshot,
            &request(PeopleCommand::RemovePlayerRegistration {
                player_id: "player-ada".into(),
                registration_id: registration.id,
            }),
        )
        .unwrap();
        assert!(
            removed.preview.snapshot.players[0]
                .details
                .registrations
                .is_empty()
        );
    }

    #[test]
    fn validates_languages_and_cross_entity_relationships_before_preview() {
        let snapshot = synthetic_snapshot();
        let languages = vec![LanguageSkill {
            language: "Französisch".into(),
            speaking: 8,
            reading: 7,
            writing: 6,
        }];
        let language_action = prepare_people_action(
            &snapshot,
            &request(PeopleCommand::SetPlayerLanguages {
                player_id: "player-ada".into(),
                languages: languages.clone(),
            }),
        )
        .unwrap();
        assert_eq!(
            language_action.preview.snapshot.players[0]
                .details
                .languages,
            languages
        );

        let relationship = PersonRelationship {
            id: "relationship-lina-suedstadt".into(),
            kind: RelationshipKind::FavoriteClub,
            target_kind: RelationshipTargetKind::Club,
            target_id: "club-suedstadt".into(),
            strength: 80,
        };
        let relationship_action = prepare_people_action(
            &snapshot,
            &request(PeopleCommand::UpsertStaffRelationship {
                staff_id: "staff-lina".into(),
                relationship: relationship.clone(),
            }),
        )
        .unwrap();
        assert!(
            relationship_action.preview.snapshot.staff[0]
                .details
                .relationships
                .contains(&relationship)
        );

        let invalid = PeopleCommand::UpsertStaffRelationship {
            staff_id: "staff-lina".into(),
            relationship: PersonRelationship {
                id: "bad-target".into(),
                kind: RelationshipKind::FavoriteClub,
                target_kind: RelationshipTargetKind::Player,
                target_id: "player-ada".into(),
                strength: 80,
            },
        };
        assert!(matches!(
            prepare_people_action(&snapshot, &request(invalid)),
            Err(PeopleError::Transaction(TransactionError::InvalidSnapshot(
                _
            )))
        ));
    }

    #[test]
    fn stale_people_preview_rejects_without_partial_application() {
        let snapshot = synthetic_snapshot();
        let prepared = prepare_people_action(
            &snapshot,
            &request(PeopleCommand::SetStaffLanguages {
                staff_id: "staff-lina".into(),
                languages: vec![LanguageSkill {
                    language: "Spanisch".into(),
                    speaking: 6,
                    reading: 5,
                    writing: 4,
                }],
            }),
        )
        .unwrap();
        let mut stale = snapshot;
        stale.staff[0].details.languages[0].speaking = 9;
        assert!(matches!(
            apply_transaction(&stale, &prepared.transaction),
            Err(TransactionError::Conflict { field }) if field == "details.languages"
        ));
        assert_eq!(stale.staff[0].details.languages[0].speaking, 9);
    }

    #[test]
    fn rejects_no_ops_missing_entities_and_unknown_remove_targets() {
        let snapshot = synthetic_snapshot();
        assert!(matches!(
            prepare_people_action(
                &snapshot,
                &request(PeopleCommand::SetPlayerLanguages {
                    player_id: "player-ada".into(),
                    languages: snapshot.players[0].details.languages.clone(),
                }),
            ),
            Err(PeopleError::NoChanges)
        ));
        assert!(matches!(
            prepare_people_action(
                &snapshot,
                &request(PeopleCommand::SetStaffLanguages {
                    staff_id: "missing-staff".into(),
                    languages: Vec::new(),
                }),
            ),
            Err(PeopleError::Transaction(TransactionError::EntityNotFound {
                entity_kind: EditEntityKind::Staff,
                ..
            }))
        ));
        assert!(matches!(
            prepare_people_action(
                &snapshot,
                &request(PeopleCommand::RemovePlayerRegistration {
                    player_id: "player-ada".into(),
                    registration_id: "missing-registration".into(),
                }),
            ),
            Err(PeopleError::RegistrationNotFound(id)) if id == "missing-registration"
        ));
        assert!(matches!(
            prepare_people_action(
                &snapshot,
                &request(PeopleCommand::RemoveStaffRelationship {
                    staff_id: "staff-lina".into(),
                    relationship_id: "missing-relationship".into(),
                }),
            ),
            Err(PeopleError::RelationshipNotFound(id)) if id == "missing-relationship"
        ));
    }
}
