use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

use crate::{
    AppliedTransaction, Contract, DatabaseSnapshot, EDITOR_SCHEMA_VERSION, EditEntityKind,
    EditOperation, EditTransaction, FieldExpectation, FutureTransfer, TransactionError,
    TransferKind, TransferStatus, apply_transaction, editor::entity_value, editor::value_at_path,
    validate_snapshot,
};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TransferCommand {
    MoveNow {
        player_id: String,
        destination_club_id: String,
        contract: Contract,
    },
    ArrangeFuture {
        player_id: String,
        transfer: FutureTransfer,
    },
    CancelFuture {
        player_id: String,
    },
    CompleteFuture {
        player_id: String,
        contract: Contract,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TransferActionRequest {
    pub transaction_id: String,
    pub created_at_utc: String,
    pub command: TransferCommand,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PreparedTransferAction {
    pub command: TransferCommand,
    pub transaction: EditTransaction,
    pub preview: AppliedTransaction,
}

#[derive(Debug, Error)]
pub enum TransferError {
    #[error("transfer destination club {0} was not found")]
    DestinationNotFound(String),
    #[error("transfer destination must differ from the player's current contract club")]
    SameClub,
    #[error("future transfer origin does not match the player's current contract club")]
    OriginMismatch,
    #[error("future transfer must be agreed or confirmed before it can be arranged")]
    InvalidFutureStatus,
    #[error("player has no future transfer to cancel or complete")]
    NoFutureTransfer,
    #[error("future transfer cannot be completed before its effective in-game date")]
    EffectiveDateNotReached,
    #[error("future transfer completion requires a canonical in-game date")]
    MissingGameDate,
    #[error("swap completion requires the reciprocal two-player action")]
    SwapRequiresReciprocalAction,
    #[error("loan completion requires a loan contract")]
    LoanContractRequired,
    #[error("transfer action would not change the canonical snapshot")]
    NoChanges,
    #[error(transparent)]
    Transaction(#[from] TransactionError),
}

pub fn prepare_transfer_action(
    snapshot: &DatabaseSnapshot,
    request: &TransferActionRequest,
) -> Result<PreparedTransferAction, TransferError> {
    let validation = validate_snapshot(snapshot);
    if !validation.valid {
        return Err(TransactionError::InvalidSnapshot(validation.issues.len()).into());
    }

    let mut operations = Vec::new();
    match &request.command {
        TransferCommand::MoveNow {
            player_id,
            destination_club_id,
            contract,
        } => {
            let player = player(snapshot, player_id)?;
            if player
                .details
                .contract
                .as_ref()
                .and_then(|item| item.club_id.as_deref())
                == Some(destination_club_id)
            {
                return Err(TransferError::SameClub);
            }
            let destination_name = destination_name(snapshot, destination_club_id)?;
            let contract = contract_for(destination_club_id, contract);
            add_change(
                snapshot,
                &mut operations,
                player_id,
                "club",
                Value::String(destination_name),
            )?;
            add_change(
                snapshot,
                &mut operations,
                player_id,
                "details.contract",
                serde_json::to_value(contract).map_err(TransactionError::SnapshotSerialization)?,
            )?;
            add_change(
                snapshot,
                &mut operations,
                player_id,
                "details.future_transfer",
                Value::Null,
            )?;
        }
        TransferCommand::ArrangeFuture {
            player_id,
            transfer,
        } => {
            let player = player(snapshot, player_id)?;
            destination_name(snapshot, &transfer.to_club_id)?;
            if transfer.from_club_id.as_deref()
                != player
                    .details
                    .contract
                    .as_ref()
                    .and_then(|item| item.club_id.as_deref())
            {
                return Err(TransferError::OriginMismatch);
            }
            if !matches!(
                transfer.status,
                TransferStatus::Agreed | TransferStatus::Confirmed
            ) {
                return Err(TransferError::InvalidFutureStatus);
            }
            add_change(
                snapshot,
                &mut operations,
                player_id,
                "details.future_transfer",
                serde_json::to_value(transfer).map_err(TransactionError::SnapshotSerialization)?,
            )?;
        }
        TransferCommand::CancelFuture { player_id } => {
            let player = player(snapshot, player_id)?;
            if player.details.future_transfer.is_none() {
                return Err(TransferError::NoFutureTransfer);
            }
            add_change(
                snapshot,
                &mut operations,
                player_id,
                "details.future_transfer",
                Value::Null,
            )?;
        }
        TransferCommand::CompleteFuture {
            player_id,
            contract,
        } => {
            let player = player(snapshot, player_id)?;
            let transfer = player
                .details
                .future_transfer
                .as_ref()
                .ok_or(TransferError::NoFutureTransfer)?;
            if !matches!(
                transfer.status,
                TransferStatus::Agreed | TransferStatus::Confirmed
            ) {
                return Err(TransferError::InvalidFutureStatus);
            }
            if transfer.kind == TransferKind::Swap {
                return Err(TransferError::SwapRequiresReciprocalAction);
            }
            let game_date = snapshot.game_date.ok_or(TransferError::MissingGameDate)?;
            if game_date < transfer.effective_on {
                return Err(TransferError::EffectiveDateNotReached);
            }
            if transfer.kind == TransferKind::Loan
                && contract.contract_type != crate::ContractType::Loan
            {
                return Err(TransferError::LoanContractRequired);
            }
            let destination_name = destination_name(snapshot, &transfer.to_club_id)?;
            let contract = contract_for(&transfer.to_club_id, contract);
            add_change(
                snapshot,
                &mut operations,
                player_id,
                "club",
                Value::String(destination_name),
            )?;
            add_change(
                snapshot,
                &mut operations,
                player_id,
                "details.contract",
                serde_json::to_value(contract).map_err(TransactionError::SnapshotSerialization)?,
            )?;
            add_change(
                snapshot,
                &mut operations,
                player_id,
                "details.future_transfer",
                Value::Null,
            )?;
        }
    }
    if operations.is_empty() {
        return Err(TransferError::NoChanges);
    }

    let transaction = EditTransaction {
        schema_version: EDITOR_SCHEMA_VERSION,
        id: request.transaction_id.clone(),
        created_at_utc: request.created_at_utc.clone(),
        reason: Some(command_reason(&request.command)),
        operations,
    };
    let preview = apply_transaction(snapshot, &transaction)?;
    Ok(PreparedTransferAction {
        command: request.command.clone(),
        transaction,
        preview,
    })
}

fn player<'a>(
    snapshot: &'a DatabaseSnapshot,
    player_id: &str,
) -> Result<&'a crate::Player, TransferError> {
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

fn destination_name(snapshot: &DatabaseSnapshot, club_id: &str) -> Result<String, TransferError> {
    snapshot
        .clubs
        .iter()
        .find(|club| club.id == club_id)
        .map(|club| club.name.clone())
        .ok_or_else(|| TransferError::DestinationNotFound(club_id.to_owned()))
}

fn contract_for(destination_club_id: &str, contract: &Contract) -> Contract {
    let mut contract = contract.clone();
    contract.club_id = Some(destination_club_id.to_owned());
    contract
}

fn add_change(
    snapshot: &DatabaseSnapshot,
    operations: &mut Vec<EditOperation>,
    player_id: &str,
    field: &str,
    after: Value,
) -> Result<(), TransferError> {
    let entity = entity_value(snapshot, EditEntityKind::Player, player_id)?;
    let before = value_at_path(&entity, field)
        .cloned()
        .ok_or_else(|| TransactionError::FieldNotFound(field.to_owned()))?;
    if before != after {
        operations.push(EditOperation {
            entity_kind: EditEntityKind::Player,
            entity_id: player_id.to_owned(),
            field: field.to_owned(),
            expected_before: FieldExpectation::Exact(before),
            after,
        });
    }
    Ok(())
}

fn command_reason(command: &TransferCommand) -> String {
    match command {
        TransferCommand::MoveNow { player_id, .. } => format!("Immediate transfer for {player_id}"),
        TransferCommand::ArrangeFuture { player_id, .. } => {
            format!("Arrange future transfer for {player_id}")
        }
        TransferCommand::CancelFuture { player_id } => {
            format!("Cancel future transfer for {player_id}")
        }
        TransferCommand::CompleteFuture { player_id, .. } => {
            format!("Complete future transfer for {player_id}")
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::{ContractType, GameDate, TransferKind, TransferStatus, synthetic_snapshot};

    use super::*;

    fn snapshot_with_destination() -> DatabaseSnapshot {
        synthetic_snapshot()
    }

    fn transfer() -> FutureTransfer {
        FutureTransfer {
            id: "transfer-ada-1".into(),
            kind: TransferKind::Permanent,
            from_club_id: Some("club-nordhafen".into()),
            to_club_id: "club-suedstadt".into(),
            arranged_on: GameDate::new(2026, 7, 22),
            effective_on: GameDate::new(2026, 8, 1).unwrap(),
            fee: Some(15_000_000.0),
            loan_end: None,
            wage_contribution_percent: None,
            swap_player_id: None,
            status: TransferStatus::Agreed,
        }
    }

    #[test]
    fn arranges_a_validated_future_transfer_with_one_exact_operation() {
        let snapshot = snapshot_with_destination();
        let prepared = prepare_transfer_action(
            &snapshot,
            &TransferActionRequest {
                transaction_id: "transfer-action-1".into(),
                created_at_utc: "2026-07-22T12:00:00Z".into(),
                command: TransferCommand::ArrangeFuture {
                    player_id: "player-ada".into(),
                    transfer: transfer(),
                },
            },
        )
        .unwrap();
        assert_eq!(prepared.transaction.operations.len(), 1);
        assert_eq!(
            prepared.transaction.operations[0].field,
            "details.future_transfer"
        );
        assert_eq!(
            prepared.preview.snapshot.players[0]
                .details
                .future_transfer
                .as_ref()
                .map(|item| item.to_club_id.as_str()),
            Some("club-suedstadt")
        );
    }

    #[test]
    fn completes_only_due_transfers_and_updates_club_contract_atomically() {
        let mut snapshot = snapshot_with_destination();
        snapshot.players[0].details.future_transfer = Some(transfer());
        let request = TransferActionRequest {
            transaction_id: "transfer-action-2".into(),
            created_at_utc: "2026-07-22T12:00:00Z".into(),
            command: TransferCommand::CompleteFuture {
                player_id: "player-ada".into(),
                contract: Contract {
                    starts_on: GameDate::new(2026, 8, 1),
                    expires_on: GameDate::new(2030, 6, 30),
                    contract_type: ContractType::FullTime,
                    wage: Some(45_000.0),
                    ..Default::default()
                },
            },
        };
        assert!(matches!(
            prepare_transfer_action(&snapshot, &request),
            Err(TransferError::EffectiveDateNotReached)
        ));

        snapshot.game_date = GameDate::new(2026, 8, 1);
        let prepared = prepare_transfer_action(&snapshot, &request).unwrap();
        let player = &prepared.preview.snapshot.players[0];
        assert_eq!(player.club.as_deref(), Some("Fußballclub Südstadt"));
        assert_eq!(
            player
                .details
                .contract
                .as_ref()
                .and_then(|item| item.club_id.as_deref()),
            Some("club-suedstadt")
        );
        assert!(player.details.future_transfer.is_none());
        assert_eq!(prepared.transaction.operations.len(), 3);
    }

    #[test]
    fn rejects_invalid_origins_and_same_club_moves() {
        let snapshot = snapshot_with_destination();
        let mut invalid = transfer();
        invalid.from_club_id = None;
        let arrange = TransferActionRequest {
            transaction_id: "transfer-action-3".into(),
            created_at_utc: "2026-07-22T12:00:00Z".into(),
            command: TransferCommand::ArrangeFuture {
                player_id: "player-ada".into(),
                transfer: invalid,
            },
        };
        assert!(matches!(
            prepare_transfer_action(&snapshot, &arrange),
            Err(TransferError::OriginMismatch)
        ));

        let move_now = TransferActionRequest {
            transaction_id: "transfer-action-4".into(),
            created_at_utc: "2026-07-22T12:00:00Z".into(),
            command: TransferCommand::MoveNow {
                player_id: "player-ada".into(),
                destination_club_id: "club-nordhafen".into(),
                contract: Contract::default(),
            },
        };
        assert!(matches!(
            prepare_transfer_action(&snapshot, &move_now),
            Err(TransferError::SameClub)
        ));
    }

    #[test]
    fn rejects_structurally_invalid_loan_terms_during_preview_validation() {
        let snapshot = snapshot_with_destination();
        let mut invalid = transfer();
        invalid.kind = TransferKind::Loan;
        invalid.loan_end = None;
        let request = TransferActionRequest {
            transaction_id: "transfer-action-5".into(),
            created_at_utc: "2026-07-22T12:00:00Z".into(),
            command: TransferCommand::ArrangeFuture {
                player_id: "player-ada".into(),
                transfer: invalid,
            },
        };
        assert!(matches!(
            prepare_transfer_action(&snapshot, &request),
            Err(TransferError::Transaction(
                TransactionError::InvalidSnapshot(_)
            ))
        ));
    }
}
