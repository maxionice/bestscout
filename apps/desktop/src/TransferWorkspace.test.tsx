// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TransferWorkspace, type TransferGateway } from "./TransferWorkspace";
import { demoPlayers } from "./demo";
import type {
  AppliedTransaction, DatabaseSnapshot, EditTransaction, FutureTransfer,
  PreparedTransferAction, TransferActionRequest,
} from "./types";

afterEach(cleanup);

const snapshot: DatabaseSnapshot = {
  schema_version: 1,
  source: "synthetic",
  game_date: { year: 2026, month: 7, day: 22 },
  players: demoPlayers,
  staff: [],
  clubs: [{
    id: "club-nordhafen", name: "Sportverein Nordhafen", short_name: "SV Nordhafen", nation: "Deutschland",
    competition: "Nordliga", reputation: 4800,
  }, {
    id: "club-suedstadt", name: "Fußballclub Südstadt", short_name: "FC Südstadt", nation: "Deutschland",
    competition: "Nordliga", reputation: 4200,
  }],
  competitions: [],
};

describe("transfer center", () => {
  it("prepares and commits a future transfer through the shared journal", async () => {
    const transaction = transferTransaction();
    const edited = structuredClone(snapshot);
    if (edited.players[0].details) edited.players[0].details.future_transfer = futureTransfer();
    const prepared: PreparedTransferAction = {
      command: { kind: "arrange_future", player_id: "101", transfer: futureTransfer() },
      transaction,
      preview: applied(transaction, edited),
    };
    const prepare = vi.fn(async (_snapshot: DatabaseSnapshot, _request: TransferActionRequest) => prepared);
    const apply = vi.fn(async (_journal: string, _snapshot: DatabaseSnapshot, _transaction: EditTransaction) => applied(transaction, edited));
    const onSnapshotChange = vi.fn();

    render(<TransferWorkspace snapshot={snapshot} onSnapshotChange={onSnapshotChange} gateway={gatewayWith({ prepare, apply })} />);
    fireEvent.click(screen.getByRole("button", { name: "Transferziel Fußballclub Südstadt" }));
    fireEvent.click(screen.getByRole("button", { name: "Transfervorschau erstellen" }));

    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    expect(prepare.mock.calls[0][1].command).toMatchObject({
      kind: "arrange_future",
      player_id: "101",
      transfer: { from_club_id: "club-nordhafen", to_club_id: "club-suedstadt", kind: "permanent" },
    });
    expect(await screen.findByText("Vorschau konfliktfrei")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mit Backup & Journal anwenden" }));

    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    expect(apply.mock.calls[0][0]).toBe("transfers-synthetic-workspace-v1");
    expect(apply.mock.calls[0][2]).toEqual(transaction);
    expect(onSnapshotChange).toHaveBeenCalledWith(edited);
  });

  it("keeps preview disabled until a destination club is explicit", () => {
    render(<TransferWorkspace snapshot={snapshot} onSnapshotChange={() => undefined} gateway={gatewayWith()} />);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Transfervorschau erstellen" }).disabled).toBe(true);
  });

  it("prepares cancellation only for the selected existing agreement", async () => {
    const planned = structuredClone(snapshot);
    if (planned.players[0].details) planned.players[0].details.future_transfer = futureTransfer();
    const transaction: EditTransaction = {
      schema_version: 1,
      id: "cancel-transfer-test",
      created_at_utc: "2026-07-22T12:00:00Z",
      reason: "Cancel future transfer for 101",
      operations: [{ entity_kind: "player", entity_id: "101", field: "details.future_transfer", expected_before: { mode: "exact", value: futureTransfer() }, after: null }],
    };
    const prepared: PreparedTransferAction = {
      command: { kind: "cancel_future", player_id: "101" },
      transaction,
      preview: applied(transaction, snapshot),
    };
    const prepare = vi.fn(async (_snapshot: DatabaseSnapshot, _request: TransferActionRequest) => prepared);

    render(<TransferWorkspace snapshot={planned} onSnapshotChange={() => undefined} gateway={gatewayWith({ prepare })} />);
    fireEvent.click(screen.getByRole("button", { name: "Vereinbarung stornieren" }));

    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    expect(prepare.mock.calls[0][1].command).toEqual({ kind: "cancel_future", player_id: "101" });
  });
});

function futureTransfer(): FutureTransfer {
  return {
    id: "future-101-test",
    kind: "permanent",
    from_club_id: "club-nordhafen",
    to_club_id: "club-suedstadt",
    arranged_on: { year: 2026, month: 7, day: 22 },
    effective_on: { year: 2026, month: 8, day: 1 },
    fee: 0,
    loan_end: null,
    wage_contribution_percent: null,
    swap_player_id: null,
    status: "agreed",
  };
}

function transferTransaction(): EditTransaction {
  return {
    schema_version: 1,
    id: "transfer-test-1",
    created_at_utc: "2026-07-22T12:00:00Z",
    reason: "Arrange future transfer for 101",
    operations: [{ entity_kind: "player", entity_id: "101", field: "details.future_transfer", expected_before: { mode: "exact", value: null }, after: futureTransfer() }],
  };
}

function gatewayWith(overrides: Partial<TransferGateway> = {}): TransferGateway {
  return {
    prepare: vi.fn(async () => { throw new Error("not used"); }),
    apply: vi.fn(async () => { throw new Error("not used"); }),
    ...overrides,
  };
}

function applied(transaction: EditTransaction, edited: DatabaseSnapshot): AppliedTransaction {
  return {
    snapshot: edited,
    journal_entry: {
      schema_version: 1,
      transaction_id: transaction.id,
      created_at_utc: transaction.created_at_utc,
      reason: transaction.reason,
      reverts_transaction_id: null,
      snapshot_before_hash: "a".repeat(64),
      snapshot_after_hash: "b".repeat(64),
      changes: transaction.operations.map((operation) => ({
        entity_kind: operation.entity_kind,
        entity_id: operation.entity_id,
        field: operation.field,
        before: operation.expected_before.mode === "exact" ? operation.expected_before.value : null,
        after: operation.after,
      })),
    },
  };
}
