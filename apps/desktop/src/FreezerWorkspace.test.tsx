// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FreezerWorkspace, type FreezerGateway } from "./FreezerWorkspace";
import { demoPlayers } from "./demo";
import type {
  AppliedTransaction, DatabaseSnapshot, EditTransaction, FreezePlan, FreezeReport,
  JournalEntry, PreparedFreezeCorrection,
} from "./types";

afterEach(cleanup);

const snapshot: DatabaseSnapshot = {
  schema_version: 1,
  source: "synthetic",
  players: demoPlayers,
  staff: [],
  clubs: [],
  competitions: [],
};

describe("attribute freezer and change monitor", () => {
  it("builds one plan with independently selected per-field policies", async () => {
    const upsert = vi.fn(async (_plan: FreezePlan) => undefined);
    const gateway = gatewayWith({ upsert });
    render(<FreezerWorkspace snapshot={snapshot} onSnapshotChange={() => undefined} gateway={gateway} />);

    await screen.findByText("Noch kein Freezer-Plan angelegt");
    fireEvent.change(screen.getByRole("textbox", { name: "Name des Freezer-Plans" }), { target: { value: "Talente schützen" } });
    fireEvent.click(screen.getByRole("button", { name: "Freezer-Ziel Noah Hartmann" }));
    fireEvent.click(screen.getByRole("button", { name: /Aktuelle Fähigkeit \(CA\)/ }));
    fireEvent.click(screen.getByRole("button", { name: /Plus erlauben/ }));
    fireEvent.click(screen.getByRole("button", { name: "1 Regeln vormerken" }));

    fireEvent.click(screen.getByRole("button", { name: /Potenzial \(PA\)/ }));
    fireEvent.click(screen.getByRole("button", { name: /Exakt sperren/ }));
    fireEvent.click(screen.getByRole("button", { name: "1 Regeln vormerken" }));
    fireEvent.click(screen.getByRole("button", { name: "Plan speichern" }));

    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    const saved = upsert.mock.calls[0][0];
    expect(saved).toMatchObject({
      name: "Talente schützen",
      snapshot_source: "synthetic",
      enabled: true,
    });
    expect(saved.rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ entity_id: "101", field: "current_ability", baseline: 128, policy: "allow_increase" }),
      expect.objectContaining({ entity_id: "101", field: "potential_ability", baseline: 174, policy: "exact" }),
    ]));
  });

  it("previews and commits only validated freezer violations through the journal gateway", async () => {
    const plan = freezePlan();
    const initialReport = violationReport(plan);
    const correctedSnapshot = structuredClone(snapshot);
    correctedSnapshot.players[0].current_ability = 130;
    const transaction: EditTransaction = {
      schema_version: 1,
      id: "freeze-correction-test",
      created_at_utc: "2026-07-22T10:01:00Z",
      reason: "Freezer Leistungsträger",
      operations: [{
        entity_kind: "player",
        entity_id: "101",
        field: "current_ability",
        expected_before: { mode: "exact", value: 128 },
        after: 130,
      }],
    };
    const prepared: PreparedFreezeCorrection = {
      report: initialReport,
      transaction,
      preview: applied(transaction, correctedSnapshot),
    };
    const prepare = vi.fn(async (
      _snapshot: DatabaseSnapshot,
      _plan: FreezePlan,
      _transactionId: string,
      _createdAtUtc: string,
    ) => prepared);
    const apply = vi.fn(async (
      _journalId: string,
      _snapshot: DatabaseSnapshot,
      _transaction: EditTransaction,
    ) => applied(transaction, correctedSnapshot));
    const onSnapshotChange = vi.fn();
    const gateway = gatewayWith({
      list: vi.fn(async () => [plan]),
      evaluate: vi.fn(async (current) => current.players[0].current_ability === 130 ? compliantReport(plan) : initialReport),
      prepare,
      apply,
    });

    render(<FreezerWorkspace snapshot={snapshot} onSnapshotChange={onSnapshotChange} gateway={gateway} />);
    expect(await screen.findByText("Verstoß")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Korrektur vorbereiten" }));
    expect(await screen.findByText("1 Korrekturen vollständig validiert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sicher korrigieren" }));

    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0][0]).toBe("freezer-synthetic-workspace-v1");
    expect(apply.mock.calls[0][2]).toEqual(transaction);
    expect(onSnapshotChange).toHaveBeenCalledWith(correctedSnapshot);
    expect(await screen.findByText("1 Werte korrigiert, gesichert und im Journal erfasst")).toBeTruthy();
  });

  it("keeps correction disabled for paused plans", async () => {
    const plan = { ...freezePlan(), enabled: false };
    render(<FreezerWorkspace snapshot={snapshot} onSnapshotChange={() => undefined} gateway={gatewayWith({
      list: vi.fn(async () => [plan]),
      evaluate: vi.fn(async () => violationReport(plan)),
    })} />);

    await screen.findByText("Plan ist pausiert");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Korrektur vorbereiten" }).disabled).toBe(true);
  });
});

function freezePlan(): FreezePlan {
  return {
    schema_version: 1,
    id: "freeze-first-team",
    name: "Leistungsträger",
    created_at_utc: "2026-07-22T10:00:00Z",
    updated_at_utc: "2026-07-22T10:00:00Z",
    snapshot_source: "synthetic",
    enabled: true,
    rules: [{
      entity_kind: "player",
      entity_id: "101",
      field: "current_ability",
      baseline: 130,
      policy: "exact",
    }],
  };
}

function violationReport(plan: FreezePlan): FreezeReport {
  return {
    schema_version: 1,
    plan_id: plan.id,
    checked_at_utc: "2026-07-22T10:01:00Z",
    snapshot_hash: "a".repeat(64),
    total_rules: 1,
    unchanged_count: 0,
    allowed_increase_count: 0,
    monitored_change_count: 0,
    violation_count: 1,
    unresolved_count: 0,
    observations: [{ ...plan.rules[0], current: 128, state: "violation", numeric_delta: -2 }],
  };
}

function compliantReport(plan: FreezePlan): FreezeReport {
  return {
    ...violationReport(plan),
    unchanged_count: 1,
    violation_count: 0,
    observations: [{ ...plan.rules[0], current: 130, state: "unchanged", numeric_delta: 0 }],
  };
}

function gatewayWith(overrides: Partial<FreezerGateway> = {}): FreezerGateway {
  return {
    list: vi.fn(async () => []),
    upsert: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    evaluate: vi.fn(async (_snapshot, plan) => compliantReport(plan)),
    prepare: vi.fn(async () => { throw new Error("not used"); }),
    apply: vi.fn(async () => { throw new Error("not used"); }),
    ...overrides,
  };
}

function applied(transaction: EditTransaction, edited: DatabaseSnapshot): AppliedTransaction {
  const journal_entry: JournalEntry = {
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
  };
  return { snapshot: edited, journal_entry };
}
