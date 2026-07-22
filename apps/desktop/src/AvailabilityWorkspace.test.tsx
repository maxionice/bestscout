// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AvailabilityWorkspace, type AvailabilityGateway } from "./AvailabilityWorkspace";
import { demoPlayers } from "./demo";
import type {
  AppliedTransaction, AvailabilityReport, DatabaseSnapshot, EditTransaction,
  PreparedAvailabilityAction,
} from "./types";

afterEach(cleanup);

const snapshot: DatabaseSnapshot = {
  schema_version: 1,
  source: "synthetic",
  game_date: { year: 2026, month: 7, day: 22 },
  players: demoPlayers,
  staff: [],
  clubs: [],
  competitions: [],
};

describe("player availability center", () => {
  it("shows deterministic medical evidence and state totals", async () => {
    render(<AvailabilityWorkspace snapshot={snapshot} onSnapshotChange={() => undefined} gateway={gatewayWith()} />);

    expect((await screen.findAllByText("Oberschenkelzerrung")).length).toBeGreaterThan(0);
    expect(screen.getByText("19 Tage", { exact: false })).toBeTruthy();
    expect(screen.getByText("Verletzung")).toBeTruthy();
    expect(screen.getByText("Nicht verfügbar", { selector: ".availability-state" })).toBeTruthy();
  });

  it("prepares and commits only explicitly selected players through the journal", async () => {
    const transaction: EditTransaction = {
      schema_version: 1,
      id: "availability-test-1",
      created_at_utc: "2026-07-22T10:00:00Z",
      reason: "Availability action: make_match_ready",
      operations: [{
        entity_kind: "player",
        entity_id: "103",
        field: "details.injuries",
        expected_before: { mode: "exact", value: snapshot.players[2].details?.injuries },
        after: [],
      }],
    };
    const edited = structuredClone(snapshot);
    if (edited.players[2].details) edited.players[2].details.injuries = [];
    const prepared: PreparedAvailabilityAction = {
      action: "make_match_ready",
      affected_player_count: 1,
      transaction,
      preview: applied(transaction, edited),
    };
    const prepare = vi.fn(async (
      _snapshot: DatabaseSnapshot,
      _request: Parameters<AvailabilityGateway["prepare"]>[1],
    ) => prepared);
    const apply = vi.fn(async (
      _journalId: string,
      _snapshot: DatabaseSnapshot,
      _transaction: EditTransaction,
    ) => applied(transaction, edited));
    const onSnapshotChange = vi.fn();

    render(<AvailabilityWorkspace snapshot={snapshot} onSnapshotChange={onSnapshotChange} gateway={gatewayWith({ prepare, apply })} />);
    await screen.findAllByText("Oberschenkelzerrung");
    fireEvent.click(screen.getByRole("button", { name: "Elias Berg auswählen" }));
    fireEvent.click(screen.getByRole("button", { name: "Änderungsvorschau erstellen" }));

    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    expect(prepare.mock.calls[0][1]).toMatchObject({ player_ids: ["103"], action: "make_match_ready" });
    expect(await screen.findByText("Vorschau konfliktfrei")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mit Backup & Journal anwenden" }));

    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    expect(apply.mock.calls[0][0]).toBe("availability-synthetic-workspace-v1");
    expect(apply.mock.calls[0][2]).toEqual(transaction);
    expect(onSnapshotChange).toHaveBeenCalledWith(edited);
  });

  it("keeps preview disabled until a player is explicitly selected", async () => {
    render(<AvailabilityWorkspace snapshot={snapshot} onSnapshotChange={() => undefined} gateway={gatewayWith()} />);
    await screen.findAllByText("Oberschenkelzerrung");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Änderungsvorschau erstellen" }).disabled).toBe(true);
  });
});

function report(): AvailabilityReport {
  return {
    schema_version: 1,
    as_of: { year: 2026, month: 7, day: 22 },
    snapshot_hash: "a".repeat(64),
    total_players: 2,
    available_count: 1,
    managed_count: 0,
    doubtful_count: 0,
    unavailable_count: 1,
    players: [{
      player_id: "103",
      player_name: "Elias Berg",
      club: "FC Falkenstadt",
      state: "unavailable",
      score: 0,
      condition: 43,
      match_fitness: 34,
      fatigue: 66,
      jadedness: 28,
      morale: 16,
      happiness: 17,
      active_injuries: snapshot.players[2].details?.injuries ?? [],
      active_bans: [],
      issues: [{ kind: "injury", impact: "unavailable", detail: "Oberschenkelzerrung" }],
    }, {
      player_id: "101",
      player_name: "Noah Hartmann",
      club: "FC Falkenstadt",
      state: "available",
      score: 100,
      condition: 92,
      match_fitness: 88,
      fatigue: 18,
      jadedness: 10,
      morale: 16,
      happiness: 17,
      active_injuries: [],
      active_bans: [],
      issues: [],
    }],
  };
}

function gatewayWith(overrides: Partial<AvailabilityGateway> = {}): AvailabilityGateway {
  return {
    analyse: vi.fn(async () => report()),
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
