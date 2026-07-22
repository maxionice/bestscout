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
    SwapNow {
        player_id: String,
        swap_player_id: String,
        player_contract: Contract,
        swap_player_contract: Contract,
    },
    ArrangeFutureSwap {
        player_id: String,
        swap_player_id: String,
        transfer: FutureTransfer,
        reciprocal_transfer: FutureTransfer,
    },
    CompleteFutureSwap {
        player_id: String,
        swap_player_id: String,
        player_contract: Contract,
        swap_player_contract: Contract,
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
    #[error("a player cannot be swapped with themselves")]
    SameSwapPlayer,
    #[error("swap player {0} requires a current contract club")]
    SwapClubRequired(String),
    #[error("swap players must belong to different contract clubs")]
    SameSwapClub,
    #[error("swap agreements must be reciprocal and match both player routes")]
    InvalidReciprocalSwap,
    #[error("reciprocal swap agreements must use the same dates and lifecycle status")]
    SwapAgreementMismatch,
    #[error(
        "swap execution requires two complete permanent target contracts starting on the transfer date"
    )]
    InvalidSwapContract,
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
            add_change(
                snapshot,
                &mut operations,
                player_id,
                "details.registrations",
                Value::Array(Vec::new()),
            )?;
        }
        TransferCommand::ArrangeFuture {
            player_id,
            transfer,
        } => {
            let player = player(snapshot, player_id)?;
            if transfer.kind == TransferKind::Swap {
                return Err(TransferError::SwapRequiresReciprocalAction);
            }
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
            let transfer = player
                .details
                .future_transfer
                .as_ref()
                .ok_or(TransferError::NoFutureTransfer)?;
            if transfer.kind == TransferKind::Swap {
                let swap_player_id = transfer
                    .swap_player_id
                    .as_deref()
                    .ok_or(TransferError::InvalidReciprocalSwap)?;
                let swap = swap_players(snapshot, player_id, swap_player_id)?;
                let (transfer, reciprocal_transfer) = current_swap_agreements(&swap)?;
                validate_swap_agreements(&swap, transfer, reciprocal_transfer)?;
                add_change(
                    snapshot,
                    &mut operations,
                    swap_player_id,
                    "details.future_transfer",
                    Value::Null,
                )?;
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
            add_change(
                snapshot,
                &mut operations,
                player_id,
                "details.registrations",
                Value::Array(Vec::new()),
            )?;
        }
        TransferCommand::SwapNow {
            player_id,
            swap_player_id,
            player_contract,
            swap_player_contract,
        } => {
            let swap = swap_players(snapshot, player_id, swap_player_id)?;
            let game_date = snapshot.game_date.ok_or(TransferError::MissingGameDate)?;
            validate_swap_contract(player_contract, game_date)?;
            validate_swap_contract(swap_player_contract, game_date)?;
            add_swap_completion(
                snapshot,
                &mut operations,
                &swap,
                player_contract,
                swap_player_contract,
            )?;
        }
        TransferCommand::ArrangeFutureSwap {
            player_id,
            swap_player_id,
            transfer,
            reciprocal_transfer,
        } => {
            let swap = swap_players(snapshot, player_id, swap_player_id)?;
            validate_swap_agreements(&swap, transfer, reciprocal_transfer)?;
            add_change(
                snapshot,
                &mut operations,
                player_id,
                "details.future_transfer",
                serde_json::to_value(transfer).map_err(TransactionError::SnapshotSerialization)?,
            )?;
            add_change(
                snapshot,
                &mut operations,
                swap_player_id,
                "details.future_transfer",
                serde_json::to_value(reciprocal_transfer)
                    .map_err(TransactionError::SnapshotSerialization)?,
            )?;
        }
        TransferCommand::CompleteFutureSwap {
            player_id,
            swap_player_id,
            player_contract,
            swap_player_contract,
        } => {
            let swap = swap_players(snapshot, player_id, swap_player_id)?;
            let (transfer, reciprocal_transfer) = current_swap_agreements(&swap)?;
            validate_swap_agreements(&swap, transfer, reciprocal_transfer)?;
            let game_date = snapshot.game_date.ok_or(TransferError::MissingGameDate)?;
            if game_date < transfer.effective_on {
                return Err(TransferError::EffectiveDateNotReached);
            }
            validate_swap_contract(player_contract, transfer.effective_on)?;
            validate_swap_contract(swap_player_contract, transfer.effective_on)?;
            add_swap_completion(
                snapshot,
                &mut operations,
                &swap,
                player_contract,
                swap_player_contract,
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

struct SwapPlayers<'a> {
    player: &'a crate::Player,
    swap_player: &'a crate::Player,
    player_club_id: &'a str,
    swap_player_club_id: &'a str,
}

fn swap_players<'a>(
    snapshot: &'a DatabaseSnapshot,
    player_id: &str,
    swap_player_id: &str,
) -> Result<SwapPlayers<'a>, TransferError> {
    if player_id == swap_player_id {
        return Err(TransferError::SameSwapPlayer);
    }
    let primary_player = player(snapshot, player_id)?;
    let swap_player = player(snapshot, swap_player_id)?;
    let player_club_id = primary_player
        .details
        .contract
        .as_ref()
        .and_then(|contract| contract.club_id.as_deref())
        .ok_or_else(|| TransferError::SwapClubRequired(player_id.to_owned()))?;
    let swap_player_club_id = swap_player
        .details
        .contract
        .as_ref()
        .and_then(|contract| contract.club_id.as_deref())
        .ok_or_else(|| TransferError::SwapClubRequired(swap_player_id.to_owned()))?;
    if player_club_id == swap_player_club_id {
        return Err(TransferError::SameSwapClub);
    }
    destination_name(snapshot, player_club_id)?;
    destination_name(snapshot, swap_player_club_id)?;
    Ok(SwapPlayers {
        player: primary_player,
        swap_player,
        player_club_id,
        swap_player_club_id,
    })
}

fn validate_swap_agreements(
    swap: &SwapPlayers<'_>,
    transfer: &FutureTransfer,
    reciprocal_transfer: &FutureTransfer,
) -> Result<(), TransferError> {
    let reciprocal = transfer.kind == TransferKind::Swap
        && reciprocal_transfer.kind == TransferKind::Swap
        && transfer.id != reciprocal_transfer.id
        && transfer.swap_player_id.as_deref() == Some(swap.swap_player.id.as_str())
        && reciprocal_transfer.swap_player_id.as_deref() == Some(swap.player.id.as_str())
        && transfer.from_club_id.as_deref() == Some(swap.player_club_id)
        && transfer.to_club_id == swap.swap_player_club_id
        && reciprocal_transfer.from_club_id.as_deref() == Some(swap.swap_player_club_id)
        && reciprocal_transfer.to_club_id == swap.player_club_id;
    if !reciprocal {
        return Err(TransferError::InvalidReciprocalSwap);
    }
    if transfer.arranged_on != reciprocal_transfer.arranged_on
        || transfer.effective_on != reciprocal_transfer.effective_on
        || transfer.status != reciprocal_transfer.status
    {
        return Err(TransferError::SwapAgreementMismatch);
    }
    if !matches!(
        transfer.status,
        TransferStatus::Agreed | TransferStatus::Confirmed
    ) {
        return Err(TransferError::InvalidFutureStatus);
    }
    Ok(())
}

fn current_swap_agreements<'a>(
    swap: &'a SwapPlayers<'a>,
) -> Result<(&'a FutureTransfer, &'a FutureTransfer), TransferError> {
    let transfer = swap
        .player
        .details
        .future_transfer
        .as_ref()
        .ok_or(TransferError::NoFutureTransfer)?;
    let reciprocal_transfer = swap
        .swap_player
        .details
        .future_transfer
        .as_ref()
        .ok_or(TransferError::InvalidReciprocalSwap)?;
    Ok((transfer, reciprocal_transfer))
}

fn validate_swap_contract(
    contract: &Contract,
    starts_on: crate::GameDate,
) -> Result<(), TransferError> {
    let valid_type = matches!(
        contract.contract_type,
        crate::ContractType::FullTime | crate::ContractType::PartTime | crate::ContractType::Youth
    );
    let valid_expiry = contract.expires_on.is_some_and(|expires_on| {
        crate::GameDate::new(expires_on.year, expires_on.month, expires_on.day) == Some(expires_on)
            && expires_on >= starts_on
    });
    let valid_money = [contract.wage, contract.release_clause]
        .into_iter()
        .flatten()
        .all(|value| value.is_finite() && (0.0..=1_000_000_000_000.0).contains(&value));
    if !valid_type || contract.starts_on != Some(starts_on) || !valid_expiry || !valid_money {
        return Err(TransferError::InvalidSwapContract);
    }
    Ok(())
}

fn add_swap_completion(
    snapshot: &DatabaseSnapshot,
    operations: &mut Vec<EditOperation>,
    swap: &SwapPlayers<'_>,
    player_contract: &Contract,
    swap_player_contract: &Contract,
) -> Result<(), TransferError> {
    let player_destination = destination_name(snapshot, swap.swap_player_club_id)?;
    let swap_player_destination = destination_name(snapshot, swap.player_club_id)?;
    let player_contract = contract_for(swap.swap_player_club_id, player_contract);
    let swap_player_contract = contract_for(swap.player_club_id, swap_player_contract);
    for (player_id, club, contract) in [
        (swap.player.id.as_str(), player_destination, player_contract),
        (
            swap.swap_player.id.as_str(),
            swap_player_destination,
            swap_player_contract,
        ),
    ] {
        add_change(snapshot, operations, player_id, "club", Value::String(club))?;
        add_change(
            snapshot,
            operations,
            player_id,
            "details.contract",
            serde_json::to_value(contract).map_err(TransactionError::SnapshotSerialization)?,
        )?;
        add_change(
            snapshot,
            operations,
            player_id,
            "details.future_transfer",
            Value::Null,
        )?;
        add_change(
            snapshot,
            operations,
            player_id,
            "details.registrations",
            Value::Array(Vec::new()),
        )?;
    }
    Ok(())
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
        TransferCommand::SwapNow {
            player_id,
            swap_player_id,
            ..
        } => format!("Immediate reciprocal swap for {player_id} and {swap_player_id}"),
        TransferCommand::ArrangeFutureSwap {
            player_id,
            swap_player_id,
            ..
        } => format!("Arrange reciprocal swap for {player_id} and {swap_player_id}"),
        TransferCommand::CompleteFutureSwap {
            player_id,
            swap_player_id,
            ..
        } => format!("Complete reciprocal swap for {player_id} and {swap_player_id}"),
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

    fn snapshot_with_swap_partner() -> DatabaseSnapshot {
        let mut snapshot = synthetic_snapshot();
        snapshot.players[1].club = Some("Fußballclub Südstadt".into());
        snapshot.players[1].details.contract = Some(Contract {
            club_id: Some("club-suedstadt".into()),
            starts_on: GameDate::new(2024, 7, 1),
            expires_on: GameDate::new(2029, 6, 30),
            contract_type: ContractType::FullTime,
            wage: Some(24_000.0),
            ..Default::default()
        });
        let mut registration = snapshot.players[0].details.registrations[0].clone();
        registration.id = "registration-milo-nordliga".into();
        registration.club_id = "club-suedstadt".into();
        snapshot.players[1].details.registrations = vec![registration];
        snapshot
    }

    fn target_contract(starts_on: GameDate, expires_on: GameDate, wage: f64) -> Contract {
        Contract {
            starts_on: Some(starts_on),
            expires_on: Some(expires_on),
            contract_type: ContractType::FullTime,
            wage: Some(wage),
            squad_status: Some("First team".into()),
            ..Default::default()
        }
    }

    fn reciprocal_transfers() -> (FutureTransfer, FutureTransfer) {
        let effective_on = GameDate::new(2026, 8, 1).unwrap();
        (
            FutureTransfer {
                id: "swap-ada-milo-a".into(),
                kind: TransferKind::Swap,
                from_club_id: Some("club-nordhafen".into()),
                to_club_id: "club-suedstadt".into(),
                arranged_on: GameDate::new(2026, 7, 22),
                effective_on,
                fee: Some(2_000_000.0),
                loan_end: None,
                wage_contribution_percent: None,
                swap_player_id: Some("player-milo".into()),
                status: TransferStatus::Agreed,
            },
            FutureTransfer {
                id: "swap-ada-milo-b".into(),
                kind: TransferKind::Swap,
                from_club_id: Some("club-suedstadt".into()),
                to_club_id: "club-nordhafen".into(),
                arranged_on: GameDate::new(2026, 7, 22),
                effective_on,
                fee: Some(0.0),
                loan_end: None,
                wage_contribution_percent: None,
                swap_player_id: Some("player-ada".into()),
                status: TransferStatus::Agreed,
            },
        )
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
        assert!(player.details.registrations.is_empty());
        assert_eq!(prepared.transaction.operations.len(), 4);
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

    #[test]
    fn swaps_two_players_immediately_in_one_exact_transaction() {
        let snapshot = snapshot_with_swap_partner();
        let game_date = snapshot.game_date.unwrap();
        let prepared = prepare_transfer_action(
            &snapshot,
            &TransferActionRequest {
                transaction_id: "swap-now-1".into(),
                created_at_utc: "2026-07-22T12:00:00Z".into(),
                command: TransferCommand::SwapNow {
                    player_id: "player-ada".into(),
                    swap_player_id: "player-milo".into(),
                    player_contract: target_contract(
                        game_date,
                        GameDate::new(2030, 6, 30).unwrap(),
                        45_000.0,
                    ),
                    swap_player_contract: target_contract(
                        game_date,
                        GameDate::new(2029, 6, 30).unwrap(),
                        30_000.0,
                    ),
                },
            },
        )
        .unwrap();

        assert_eq!(prepared.transaction.operations.len(), 6);
        assert!(
            prepared.transaction.operations.iter().all(|operation| {
                matches!(operation.expected_before, FieldExpectation::Exact(_))
            })
        );
        let ada = player(&prepared.preview.snapshot, "player-ada").unwrap();
        let milo = player(&prepared.preview.snapshot, "player-milo").unwrap();
        assert_eq!(ada.club.as_deref(), Some("Fußballclub Südstadt"));
        assert_eq!(milo.club.as_deref(), Some("Sportverein Nordhafen"));
        assert_eq!(
            ada.details
                .contract
                .as_ref()
                .and_then(|contract| contract.club_id.as_deref()),
            Some("club-suedstadt")
        );
        assert_eq!(
            milo.details
                .contract
                .as_ref()
                .and_then(|contract| contract.club_id.as_deref()),
            Some("club-nordhafen")
        );
        assert!(ada.details.registrations.is_empty());
        assert!(milo.details.registrations.is_empty());
    }

    #[test]
    fn arranges_cancels_and_completes_reciprocal_future_swaps_atomically() {
        let snapshot = snapshot_with_swap_partner();
        let (transfer, reciprocal_transfer) = reciprocal_transfers();
        let arranged = prepare_transfer_action(
            &snapshot,
            &TransferActionRequest {
                transaction_id: "swap-future-1".into(),
                created_at_utc: "2026-07-22T12:00:00Z".into(),
                command: TransferCommand::ArrangeFutureSwap {
                    player_id: "player-ada".into(),
                    swap_player_id: "player-milo".into(),
                    transfer: transfer.clone(),
                    reciprocal_transfer: reciprocal_transfer.clone(),
                },
            },
        )
        .unwrap();
        assert_eq!(arranged.transaction.operations.len(), 2);
        assert_eq!(
            player(&arranged.preview.snapshot, "player-milo")
                .unwrap()
                .details
                .future_transfer
                .as_ref()
                .and_then(|item| item.swap_player_id.as_deref()),
            Some("player-ada")
        );

        let cancelled = prepare_transfer_action(
            &arranged.preview.snapshot,
            &TransferActionRequest {
                transaction_id: "swap-cancel-1".into(),
                created_at_utc: "2026-07-22T12:01:00Z".into(),
                command: TransferCommand::CancelFuture {
                    player_id: "player-ada".into(),
                },
            },
        )
        .unwrap();
        assert_eq!(cancelled.transaction.operations.len(), 2);
        assert!(
            cancelled
                .preview
                .snapshot
                .players
                .iter()
                .all(|item| item.details.future_transfer.is_none())
        );

        let completion_request = TransferActionRequest {
            transaction_id: "swap-complete-1".into(),
            created_at_utc: "2026-08-01T12:00:00Z".into(),
            command: TransferCommand::CompleteFutureSwap {
                player_id: "player-ada".into(),
                swap_player_id: "player-milo".into(),
                player_contract: target_contract(
                    transfer.effective_on,
                    GameDate::new(2030, 6, 30).unwrap(),
                    45_000.0,
                ),
                swap_player_contract: target_contract(
                    transfer.effective_on,
                    GameDate::new(2029, 6, 30).unwrap(),
                    30_000.0,
                ),
            },
        };
        let mut due = snapshot;
        due.players[0].details.future_transfer = Some(transfer.clone());
        due.players[1].details.future_transfer = Some(reciprocal_transfer);
        assert!(matches!(
            prepare_transfer_action(&due, &completion_request),
            Err(TransferError::EffectiveDateNotReached)
        ));
        due.game_date = Some(transfer.effective_on);
        let completed = prepare_transfer_action(&due, &completion_request).unwrap();
        assert_eq!(completed.transaction.operations.len(), 8);
        assert!(
            completed
                .preview
                .snapshot
                .players
                .iter()
                .all(|item| item.details.future_transfer.is_none())
        );
        assert!(
            completed
                .preview
                .snapshot
                .players
                .iter()
                .all(|item| item.details.registrations.is_empty())
        );
    }

    #[test]
    fn rejects_incomplete_or_invalid_swap_inputs_without_mutating_the_snapshot() {
        let snapshot = snapshot_with_swap_partner();
        let game_date = snapshot.game_date.unwrap();
        let contract = target_contract(game_date, GameDate::new(2030, 6, 30).unwrap(), 45_000.0);
        let missing = TransferActionRequest {
            transaction_id: "swap-invalid-1".into(),
            created_at_utc: "2026-07-22T12:00:00Z".into(),
            command: TransferCommand::SwapNow {
                player_id: "player-ada".into(),
                swap_player_id: "missing-player".into(),
                player_contract: contract.clone(),
                swap_player_contract: contract.clone(),
            },
        };
        assert!(matches!(
            prepare_transfer_action(&snapshot, &missing),
            Err(TransferError::Transaction(
                TransactionError::EntityNotFound { .. }
            ))
        ));

        let mut same_club = snapshot.clone();
        same_club.players[1]
            .details
            .contract
            .as_mut()
            .unwrap()
            .club_id = Some("club-nordhafen".into());
        same_club.players[1].details.registrations[0].club_id = "club-nordhafen".into();
        assert!(matches!(
            prepare_transfer_action(
                &same_club,
                &TransferActionRequest {
                    transaction_id: "swap-invalid-2".into(),
                    created_at_utc: "2026-07-22T12:00:00Z".into(),
                    command: TransferCommand::SwapNow {
                        player_id: "player-ada".into(),
                        swap_player_id: "player-milo".into(),
                        player_contract: contract.clone(),
                        swap_player_contract: contract.clone(),
                    },
                },
            ),
            Err(TransferError::SameSwapClub)
        ));

        let mut invalid_contract = contract.clone();
        invalid_contract.expires_on = GameDate::new(2025, 6, 30);
        assert!(matches!(
            prepare_transfer_action(
                &snapshot,
                &TransferActionRequest {
                    transaction_id: "swap-invalid-3".into(),
                    created_at_utc: "2026-07-22T12:00:00Z".into(),
                    command: TransferCommand::SwapNow {
                        player_id: "player-ada".into(),
                        swap_player_id: "player-milo".into(),
                        player_contract: invalid_contract,
                        swap_player_contract: contract,
                    },
                },
            ),
            Err(TransferError::InvalidSwapContract)
        ));
        assert_eq!(snapshot, snapshot_with_swap_partner());
    }

    #[test]
    fn stale_swap_preview_rejects_the_whole_transaction() {
        let snapshot = snapshot_with_swap_partner();
        let game_date = snapshot.game_date.unwrap();
        let prepared = prepare_transfer_action(
            &snapshot,
            &TransferActionRequest {
                transaction_id: "swap-stale-1".into(),
                created_at_utc: "2026-07-22T12:00:00Z".into(),
                command: TransferCommand::SwapNow {
                    player_id: "player-ada".into(),
                    swap_player_id: "player-milo".into(),
                    player_contract: target_contract(
                        game_date,
                        GameDate::new(2030, 6, 30).unwrap(),
                        45_000.0,
                    ),
                    swap_player_contract: target_contract(
                        game_date,
                        GameDate::new(2029, 6, 30).unwrap(),
                        30_000.0,
                    ),
                },
            },
        )
        .unwrap();
        let mut stale = snapshot;
        stale.players[1].details.contract.as_mut().unwrap().wage = Some(99_000.0);
        assert!(matches!(
            apply_transaction(&stale, &prepared.transaction),
            Err(TransactionError::Conflict { field }) if field == "details.contract"
        ));
        assert_eq!(
            stale.players[0]
                .details
                .contract
                .as_ref()
                .and_then(|item| item.club_id.as_deref()),
            Some("club-nordhafen")
        );
    }
}
