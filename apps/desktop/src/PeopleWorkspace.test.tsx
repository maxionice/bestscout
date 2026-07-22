// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PeopleWorkspace,
  type PeopleGateway,
  type PeopleIdentityProvider,
} from "./PeopleWorkspace";
import { demoPlayers } from "./demo";
import type {
  AppliedTransaction, DatabaseSnapshot, EditTransaction, PeopleActionRequest,
  PeopleCommand, PreparedPeopleAction,
} from "./types";

afterEach(cleanup);

const identity: PeopleIdentityProvider = {
  createId: (prefix) => `${prefix}-deterministic`,
  now: () => new Date("2026-07-22T12:00:00Z"),
};

describe("People & Registration Center", () => {
  it("prepares and commits a complete staff assignment through the shared journal", async () => {
    const snapshot = peopleSnapshot();
    const edited = structuredClone(snapshot);
    edited.staff[0].club = "Fußballclub Südstadt";
    edited.staff[0].roles = ["scout", "director_of_football"];
    edited.staff[0].details!.responsibilities = ["recruitment"];
    edited.staff[0].contract = {
      club_id: "club-suedstadt",
      starts_on: snapshot.game_date,
      expires_on: { year: 2030, month: 6, day: 30 },
      contract_type: "full_time",
      wage: 25_000,
      release_clause: null,
      squad_status: null,
    };
    const transaction = peopleTransaction("staff", "staff-lina", "roles", ["scout"], edited.staff[0].roles);
    const prepare = vi.fn(async (_snapshot: DatabaseSnapshot, request: PeopleActionRequest) => prepared(request.command, transaction, edited));
    const apply = vi.fn(async (_journal: string, _snapshot: DatabaseSnapshot, _transaction: EditTransaction) => applied(transaction, edited));
    const onSnapshotChange = vi.fn();

    render(<PeopleWorkspace snapshot={snapshot} onSnapshotChange={onSnapshotChange} gateway={gatewayWith({ prepare, apply })} identity={identity} />);
    fireEvent.click(screen.getByRole("button", { name: "Director Of Football" }));
    fireEvent.click(screen.getByRole("button", { name: "Recruitment" }));
    fireEvent.click(screen.getByRole("button", { name: "Staff-Verein Fußballclub Südstadt" }));
    fireEvent.click(screen.getByRole("button", { name: "Staff-Vorschau erstellen" }));

    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    expect(prepare.mock.calls[0][1]).toEqual({
      transaction_id: "people-deterministic",
      created_at_utc: "2026-07-22T12:00:00.000Z",
      command: {
        kind: "update_staff_assignment",
        staff_id: "staff-lina",
        roles: ["scout", "director_of_football"],
        responsibilities: ["recruitment"],
        contract: {
          club_id: "club-suedstadt",
          starts_on: snapshot.game_date,
          expires_on: { year: 2030, month: 6, day: 30 },
          contract_type: "full_time",
          wage: 25_000,
          release_clause: null,
          squad_status: null,
        },
      },
    });
    expect(await screen.findByText("Vorschau konfliktfrei")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mit Backup & Journal anwenden" }));

    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    expect(apply.mock.calls[0][0]).toBe("people-synthetic-workspace-v1");
    expect(apply.mock.calls[0][2]).toEqual(transaction);
    expect(onSnapshotChange).toHaveBeenCalledWith(edited);
    expect(screen.getByRole("button", { name: "Director Of Football" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("prepares a competition registration bound to the player's contract club", async () => {
    const snapshot = peopleSnapshot();
    const prepare = echoingPrepare(snapshot);

    render(<PeopleWorkspace snapshot={snapshot} onSnapshotChange={() => undefined} gateway={gatewayWith({ prepare })} identity={identity} />);
    fireEvent.click(screen.getByRole("button", { name: "Registrierungen" }));
    fireEvent.click(screen.getByRole("button", { name: "Ohne Rückennummer" }));
    fireEvent.click(screen.getByRole("button", { name: "Registrierungsvorschau erstellen" }));

    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    expect(prepare.mock.calls[0][1].command).toEqual({
      kind: "upsert_player_registration",
      player_id: "101",
      registration: {
        id: "registration-101-deterministic",
        competition_id: "competition-nordliga",
        club_id: "club-nordhafen",
        status: "registered",
        registered_on: snapshot.game_date,
        expires_on: { year: 2027, month: 6, day: 30 },
        squad_number: null,
        homegrown_at_club: false,
        homegrown_in_nation: false,
      },
    });
  });

  it("prepares staff profile data and dated qualifications", async () => {
    const snapshot = peopleSnapshot();
    const prepare = echoingPrepare(snapshot);

    render(<PeopleWorkspace snapshot={snapshot} onSnapshotChange={() => undefined} gateway={gatewayWith({ prepare })} identity={identity} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Staff-Notiz" }), { target: { value: "Leitet die internationale Rekrutierung" } });
    fireEvent.click(screen.getByRole("button", { name: "Profildaten-Vorschau erstellen" }));

    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    expect(prepare.mock.calls[0][1].command).toEqual({
      kind: "update_staff_profile",
      staff_id: "staff-lina",
      date_of_birth: { year: 1985, month: 3, day: 14 },
      note: "Leitet die internationale Rekrutierung",
    });

    fireEvent.change(screen.getByRole("textbox", { name: "Qualifikation" }), { target: { value: "Continental Pro" } });
    fireEvent.click(screen.getByRole("button", { name: "Qualifikation vormerken" }));
    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(2));
    expect(prepare.mock.calls[1][1].command).toEqual({
      kind: "set_staff_qualifications",
      staff_id: "staff-lina",
      qualifications: [{
        id: "qualification-staff-lina-deterministic",
        name: "Continental Pro",
        level: 1,
        awarded_on: snapshot.game_date,
        expires_on: null,
      }],
    });
  });

  it("prepares languages and invalidates the preview after any draft change", async () => {
    const snapshot = peopleSnapshot();
    const prepare = echoingPrepare(snapshot);

    render(<PeopleWorkspace snapshot={snapshot} onSnapshotChange={() => undefined} gateway={gatewayWith({ prepare })} identity={identity} />);
    fireEvent.click(screen.getByRole("button", { name: "Sprachen" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Sprache" }), { target: { value: "Französisch" } });
    fireEvent.click(screen.getByRole("button", { name: "Sprachvorschau erstellen" }));

    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    expect(prepare.mock.calls[0][1].command).toEqual({
      kind: "set_player_languages",
      player_id: "101",
      languages: [{ language: "Französisch", speaking: 5, reading: 5, writing: 5 }],
    });
    expect(await screen.findByText("Vorschau konfliktfrei")).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox", { name: "Sprache" }), { target: { value: "Italienisch" } });
    expect(screen.queryByText("Vorschau konfliktfrei")).toBeNull();
    expect(screen.getByText("Formular geändert – vorherige Vorschau verworfen")).toBeTruthy();
  });

  it("prepares a typed club relationship and resolves readable target names", async () => {
    const snapshot = peopleSnapshot();
    const prepare = echoingPrepare(snapshot);

    render(<PeopleWorkspace snapshot={snapshot} onSnapshotChange={() => undefined} gateway={gatewayWith({ prepare })} identity={identity} />);
    fireEvent.click(screen.getByRole("button", { name: "Beziehungen" }));
    fireEvent.click(screen.getByRole("button", { name: "Club" }));
    fireEvent.click(screen.getByRole("button", { name: "Beziehungsziel Fußballclub Südstadt" }));
    fireEvent.click(screen.getByRole("button", { name: "Beziehungsvorschau erstellen" }));

    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    expect(prepare.mock.calls[0][1].command).toEqual({
      kind: "upsert_player_relationship",
      player_id: "101",
      relationship: {
        id: "relationship-101-deterministic",
        kind: "favorite_club",
        target_kind: "club",
        target_id: "club-suedstadt",
        strength: 50,
      },
    });
  });

  it("discards a pending preview when the canonical snapshot changes", async () => {
    const snapshot = peopleSnapshot();
    let resolvePrepare: ((value: PreparedPeopleAction) => void) | undefined;
    const prepare = vi.fn((_snapshot: DatabaseSnapshot, _request: PeopleActionRequest) => new Promise<PreparedPeopleAction>((resolve) => {
      resolvePrepare = resolve;
    }));
    const { rerender } = render(<PeopleWorkspace snapshot={snapshot} onSnapshotChange={() => undefined} gateway={gatewayWith({ prepare })} identity={identity} />);
    fireEvent.click(screen.getByRole("button", { name: "Sprachen" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Sprache" }), { target: { value: "Französisch" } });
    fireEvent.click(screen.getByRole("button", { name: "Sprachvorschau erstellen" }));
    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));

    const replacement = structuredClone(snapshot);
    replacement.players[0].name = "Noah Hartmann aktualisiert";
    rerender(<PeopleWorkspace snapshot={replacement} onSnapshotChange={() => undefined} gateway={gatewayWith({ prepare })} identity={identity} />);
    resolvePrepare?.(prepared(prepare.mock.calls[0][1].command, peopleTransaction("player", "101", "details.languages", [], []), replacement));

    await waitFor(() => expect(screen.getByText("Formular geändert – asynchrone Vorschau verworfen")).toBeTruthy());
    expect(screen.queryByText("Vorschau konfliktfrei")).toBeNull();
  });

  it("shows prepare errors without exposing a commit action", async () => {
    const snapshot = peopleSnapshot();
    const prepare = vi.fn(async () => { throw new Error("invalid relationship target"); });

    render(<PeopleWorkspace snapshot={snapshot} onSnapshotChange={() => undefined} gateway={gatewayWith({ prepare })} identity={identity} />);
    fireEvent.click(screen.getByRole("button", { name: "Beziehungen" }));
    fireEvent.click(screen.getByRole("button", { name: "Beziehungsvorschau erstellen" }));

    expect(await screen.findByText(/Vorschau fehlgeschlagen: Error: invalid relationship target/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mit Backup & Journal anwenden" })).toBeNull();
  });

  it("never invents host dates when the snapshot has no in-game date", async () => {
    const snapshot = peopleSnapshot();
    snapshot.game_date = null;
    const prepare = echoingPrepare(snapshot);

    render(<PeopleWorkspace snapshot={snapshot} onSnapshotChange={() => undefined} gateway={gatewayWith({ prepare })} identity={identity} />);
    expect(screen.getByText("SPIELTAG NICHT VERFÜGBAR")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Registrierungen" }));
    fireEvent.click(screen.getByRole("button", { name: "Registrierungsvorschau erstellen" }));

    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    expect(prepare.mock.calls[0][1].command).toMatchObject({
      registration: { registered_on: null, expires_on: null },
    });
  });
});

function peopleSnapshot(): DatabaseSnapshot {
  const players = structuredClone(demoPlayers.slice(0, 2));
  for (const player of players) {
    if (!player.details) throw new Error(`demo player ${player.id} has no details`);
    player.details = {
      ...player.details,
      languages: [],
      relationships: [],
      registrations: [],
    };
  }
  return {
    schema_version: 1,
    source: "synthetic",
    game_date: { year: 2026, month: 7, day: 22 },
    players,
    staff: [{
      id: "staff-lina",
      name: "Lina Becker",
      age: 41,
      club: "Sportverein Nordhafen",
      nationality: "Deutschland",
      roles: ["scout"],
      current_ability: 140,
      potential_ability: 145,
      reputation: 4200,
      attributes: {},
      contract: {
        club_id: "club-nordhafen",
        starts_on: { year: 2025, month: 7, day: 1 },
        expires_on: { year: 2030, month: 6, day: 30 },
        contract_type: "full_time",
        wage: 25_000,
        release_clause: null,
        squad_status: null,
      },
      details: {
        date_of_birth: { year: 1985, month: 3, day: 14 },
        languages: [{ language: "Deutsch", speaking: 10, reading: 10, writing: 10 }],
        relationships: [],
        responsibilities: [],
        qualifications: [],
        note: null,
      },
    }],
    clubs: [{
      id: "club-nordhafen", name: "Sportverein Nordhafen", short_name: "SV Nordhafen",
      nation: "Deutschland", competition: "Nordliga", reputation: 4800,
    }, {
      id: "club-suedstadt", name: "Fußballclub Südstadt", short_name: "FC Südstadt",
      nation: "Deutschland", competition: "Nordliga", reputation: 4200,
    }],
    competitions: [{
      id: "competition-nordliga", name: "Nordliga", short_name: "NL",
      nation: "Deutschland", reputation: 7000,
    }],
  };
}

function echoingPrepare(snapshot: DatabaseSnapshot) {
  return vi.fn(async (_snapshot: DatabaseSnapshot, request: PeopleActionRequest) => {
    const entityKind = request.command.kind.includes("staff") ? "staff" as const : "player" as const;
    const entityId = "staff_id" in request.command ? request.command.staff_id : "player_id" in request.command ? request.command.player_id : "101";
    const transaction = peopleTransaction(entityKind, entityId, "details.people_test", null, request.command);
    return prepared(request.command, transaction, snapshot);
  });
}

function peopleTransaction(
  entityKind: "player" | "staff",
  entityId: string,
  field: string,
  before: unknown,
  after: unknown,
): EditTransaction {
  return {
    schema_version: 1,
    id: "people-test-transaction",
    created_at_utc: "2026-07-22T12:00:00Z",
    reason: "People workspace test",
    operations: [{
      entity_kind: entityKind,
      entity_id: entityId,
      field,
      expected_before: { mode: "exact", value: before },
      after,
    }],
  };
}

function prepared(
  command: PeopleCommand,
  transaction: EditTransaction,
  edited: DatabaseSnapshot,
): PreparedPeopleAction {
  return { command, transaction, preview: applied(transaction, edited) };
}

function gatewayWith(overrides: Partial<PeopleGateway> = {}): PeopleGateway {
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
