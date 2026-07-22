// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CompetitionWorkspace, type CompetitionGateway, type CompetitionIdentityProvider,
} from "./CompetitionWorkspace";
import type {
  AppliedTransaction, CompetitionActionRequest, CompetitionCommand, DatabaseSnapshot,
  EditTransaction, PreparedCompetitionAction,
} from "./types";

afterEach(cleanup);

const identity: CompetitionIdentityProvider = {
  createId: () => "competition-deterministic",
  now: () => new Date("2026-07-22T20:00:00Z"),
};

describe("Competition Operations Center", () => {
  it("prepares and commits a profile with stable champion and club references", async () => {
    const snapshot = competitionSnapshot();
    const edited = structuredClone(snapshot);
    edited.competitions[0].name = "Nordliga Eins";
    edited.clubs.forEach((club) => { club.competition = "Nordliga Eins"; });
    const transaction = competitionTransaction("name", "Nordliga", "Nordliga Eins");
    const prepare = vi.fn(async (_snapshot: DatabaseSnapshot, request: CompetitionActionRequest) => prepared(request.command, transaction, edited));
    const apply = vi.fn(async (_journal: string, _snapshot: DatabaseSnapshot, _transaction: EditTransaction) => applied(transaction, edited));
    const onSnapshotChange = vi.fn();

    render(<CompetitionWorkspace snapshot={snapshot} onSnapshotChange={onSnapshotChange} gateway={gatewayWith({ prepare, apply })} identity={identity} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Wettbewerbsname" }), { target: { value: "Nordliga Eins" } });
    fireEvent.click(screen.getByRole("button", { name: "Profil-Vorschau erstellen" }));

    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    expect(prepare.mock.calls[0][1]).toEqual({
      transaction_id: "competition-deterministic",
      created_at_utc: "2026-07-22T20:00:00.000Z",
      command: {
        kind: "update_profile",
        competition_id: "competition-nordliga",
        name: "Nordliga Eins",
        short_name: "NL",
        nation: "Deutschland",
        reputation: 6000,
        current_champion_club_id: "club-nordhafen",
        level: 1,
      },
    });
    expect(await screen.findByText("Vorschau konfliktfrei")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mit Backup & Journal anwenden" }));

    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    expect(apply.mock.calls[0][0]).toBe("competitions-synthetic-workspace-v1");
    expect(onSnapshotChange).toHaveBeenCalledWith(edited);
  });

  it("prepares a scored fixture and rejects identical opponents locally", async () => {
    const snapshot = competitionSnapshot();
    const prepare = vi.fn(async (_snapshot: DatabaseSnapshot, request: CompetitionActionRequest) => prepared(
      request.command,
      competitionTransaction("fixtures", snapshot.competitions[0].fixtures, snapshot.competitions[0].fixtures),
      snapshot,
    ));
    render(<CompetitionWorkspace snapshot={snapshot} onSnapshotChange={() => undefined} gateway={gatewayWith({ prepare })} identity={identity} />);
    fireEvent.click(screen.getByRole("button", { name: "Spielplan" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Spielstatus" }), { target: { value: "played" } });
    fireEvent.click(screen.getByRole("button", { name: "Heimtore erhöhen" }));
    fireEvent.click(screen.getByRole("button", { name: "Spielplan-Vorschau erstellen" }));

    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    expect(prepare.mock.calls[0][1].command).toMatchObject({
      kind: "upsert_fixture",
      competition_id: "competition-nordliga",
      fixture: { status: "played", home_score: 1, away_score: 0 },
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Auswärtsclub" }), { target: { value: "club-nordhafen" } });
    fireEvent.click(screen.getByRole("button", { name: "Spielplan-Vorschau erstellen" }));
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Heim- und Auswärtsclub müssen vorhanden und verschieden sein")).toBeTruthy();
  });

  it("discards an asynchronous preview after a canonical snapshot replacement", async () => {
    const snapshot = competitionSnapshot();
    let resolvePrepare: ((value: PreparedCompetitionAction) => void) | undefined;
    const prepare = vi.fn((_snapshot: DatabaseSnapshot, _request: CompetitionActionRequest) => new Promise<PreparedCompetitionAction>((resolve) => {
      resolvePrepare = resolve;
    }));
    const { rerender } = render(<CompetitionWorkspace snapshot={snapshot} onSnapshotChange={() => undefined} gateway={gatewayWith({ prepare })} identity={identity} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Wettbewerbsname" }), { target: { value: "Nordliga Neu" } });
    fireEvent.click(screen.getByRole("button", { name: "Profil-Vorschau erstellen" }));
    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));

    const replacement = structuredClone(snapshot);
    replacement.competitions[0].short_name = "NL1";
    rerender(<CompetitionWorkspace snapshot={replacement} onSnapshotChange={() => undefined} gateway={gatewayWith({ prepare })} identity={identity} />);
    resolvePrepare?.(prepared(
      prepare.mock.calls[0][1].command,
      competitionTransaction("name", "Nordliga", "Nordliga Neu"),
      replacement,
    ));

    await waitFor(() => expect(screen.getByText("Formular geändert – asynchrone Vorschau verworfen")).toBeTruthy());
    expect(screen.queryByText("Vorschau konfliktfrei")).toBeNull();
  });

  it("blocks an empty competition name before invoking the backend", () => {
    const prepare = vi.fn();
    render(<CompetitionWorkspace snapshot={competitionSnapshot()} onSnapshotChange={() => undefined} gateway={gatewayWith({ prepare })} identity={identity} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Wettbewerbsname" }), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Profil-Vorschau erstellen" }));

    expect(prepare).not.toHaveBeenCalled();
    expect(screen.getByText("Der Wettbewerbsname darf nicht leer sein")).toBeTruthy();
  });
});

function competitionSnapshot(): DatabaseSnapshot {
  return {
    schema_version: 1,
    source: "synthetic",
    game_date: { year: 2026, month: 7, day: 22 },
    players: [],
    staff: [],
    clubs: [
      { id: "club-nordhafen", name: "Sportverein Nordhafen", short_name: "Nordhafen", nation: "Deutschland", competition: "Nordliga", competition_id: "competition-nordliga", reputation: 4800, professional_status: "professional", stadium: null, stadium_capacity: null, average_attendance: null, finances: { balance: 0, transfer_budget: 0, wage_budget: 0, debt: 0 }, facilities: { training: 10, youth: 10, youth_recruitment: 10, junior_coaching: 10 } },
      { id: "club-suedstadt", name: "Fußballclub Südstadt", short_name: "Südstadt", nation: "Deutschland", competition: "Nordliga", competition_id: "competition-nordliga", reputation: 4700, professional_status: "professional", stadium: null, stadium_capacity: null, average_attendance: null, finances: { balance: 0, transfer_budget: 0, wage_budget: 0, debt: 0 }, facilities: { training: 10, youth: 10, youth_recruitment: 10, junior_coaching: 10 } },
    ],
    competitions: [{
      id: "competition-nordliga",
      name: "Nordliga",
      short_name: "NL",
      nation: "Deutschland",
      reputation: 6000,
      current_champion: "Sportverein Nordhafen",
      current_champion_club_id: "club-nordhafen",
      level: 1,
      stages: [{ id: "stage-nordliga", name: "Liga", kind: "league", order: 1, starts_on: { year: 2026, month: 7, day: 1 }, ends_on: { year: 2027, month: 5, day: 31 }, current: true }],
      fixtures: [{ id: "fixture-opening", stage_id: "stage-nordliga", home_club_id: "club-nordhafen", away_club_id: "club-suedstadt", scheduled_on: { year: 2026, month: 8, day: 1 }, status: "scheduled", home_score: null, away_score: null, round: "1", venue: "Hafenpark" }],
      standings: [
        { stage_id: "stage-nordliga", club_id: "club-nordhafen", position: 1, played: 0, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0, goal_difference: 0, points: 0 },
        { stage_id: "stage-nordliga", club_id: "club-suedstadt", position: 2, played: 0, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0, goal_difference: 0, points: 0 },
      ],
    }],
  };
}

function competitionTransaction(field: string, before: unknown, after: unknown): EditTransaction {
  return {
    schema_version: 1,
    id: "competition-test-transaction",
    created_at_utc: "2026-07-22T20:00:00Z",
    reason: "Competition workspace test",
    operations: [{
      entity_kind: "competition",
      entity_id: "competition-nordliga",
      field,
      expected_before: { mode: "exact", value: before },
      after,
    }],
  };
}

function prepared(command: CompetitionCommand, transaction: EditTransaction, edited: DatabaseSnapshot): PreparedCompetitionAction {
  return { command, transaction, preview: applied(transaction, edited) };
}

function gatewayWith(overrides: Partial<CompetitionGateway> = {}): CompetitionGateway {
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
