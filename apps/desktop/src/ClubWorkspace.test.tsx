// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ClubWorkspace, type ClubGateway, type ClubIdentityProvider,
} from "./ClubWorkspace";
import type {
  AppliedTransaction, ClubActionRequest, ClubCommand, DatabaseSnapshot, EditTransaction,
  PreparedClubAction,
} from "./types";

afterEach(cleanup);

const identity: ClubIdentityProvider = {
  createId: () => "club-deterministic",
  now: () => new Date("2026-07-22T20:00:00Z"),
};

describe("Club Operations Center", () => {
  it("prepares and commits a referentially bound club identity", async () => {
    const snapshot = clubSnapshot();
    const edited = structuredClone(snapshot);
    edited.clubs[0].name = "SV Nordhafen 1908";
    const transaction = clubTransaction("name", snapshot.clubs[0].name, edited.clubs[0].name);
    const prepare = vi.fn(async (_snapshot: DatabaseSnapshot, request: ClubActionRequest) => prepared(request.command, transaction, edited));
    const apply = vi.fn(async (_journal: string, _snapshot: DatabaseSnapshot, _transaction: EditTransaction) => applied(transaction, edited));
    const onSnapshotChange = vi.fn();

    render(<ClubWorkspace snapshot={snapshot} onSnapshotChange={onSnapshotChange} gateway={gatewayWith({ prepare, apply })} identity={identity} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Clubname" }), { target: { value: "SV Nordhafen 1908" } });
    fireEvent.click(screen.getByRole("button", { name: "Identität-Vorschau erstellen" }));

    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    expect(prepare.mock.calls[0][1]).toEqual({
      transaction_id: "club-deterministic",
      created_at_utc: "2026-07-22T20:00:00.000Z",
      command: {
        kind: "update_identity",
        club_id: "club-nordhafen",
        name: "SV Nordhafen 1908",
        short_name: "SV Nordhafen",
        nation: "Deutschland",
        competition_id: "competition-nordliga",
        reputation: 4800,
        professional_status: "professional",
      },
    });
    expect(await screen.findByText("Vorschau konfliktfrei")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mit Backup & Journal anwenden" }));

    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    expect(apply.mock.calls[0][0]).toBe("clubs-synthetic-workspace-v1");
    expect(onSnapshotChange).toHaveBeenCalledWith(edited);
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Clubname" }).value).toBe("SV Nordhafen 1908");
  });

  it("prepares finance changes and invalidates the preview after another input", async () => {
    const snapshot = clubSnapshot();
    const prepare = echoingPrepare(snapshot);

    render(<ClubWorkspace snapshot={snapshot} onSnapshotChange={() => undefined} gateway={gatewayWith({ prepare })} identity={identity} />);
    fireEvent.click(screen.getByRole("button", { name: "Finanzen" }));
    fireEvent.click(screen.getByRole("button", { name: "Transferbudget erhöhen" }));
    fireEvent.click(screen.getByRole("button", { name: "Finanzen-Vorschau erstellen" }));

    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    expect(prepare.mock.calls[0][1].command).toEqual({
      kind: "update_finances",
      club_id: "club-nordhafen",
      finances: {
        balance: 18_000_000,
        transfer_budget: 6_500_001,
        wage_budget: 450_000,
        debt: 2_000_000,
      },
    });
    expect(await screen.findByText("Vorschau konfliktfrei")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Schulden erhöhen" }));
    expect(screen.queryByText("Vorschau konfliktfrei")).toBeNull();
    expect(screen.getByText("Formular geändert – vorherige Vorschau verworfen")).toBeTruthy();
  });

  it("discards a pending preview after a canonical snapshot update", async () => {
    const snapshot = clubSnapshot();
    let resolvePrepare: ((value: PreparedClubAction) => void) | undefined;
    const prepare = vi.fn((_snapshot: DatabaseSnapshot, _request: ClubActionRequest) => new Promise<PreparedClubAction>((resolve) => {
      resolvePrepare = resolve;
    }));
    const { rerender } = render(<ClubWorkspace snapshot={snapshot} onSnapshotChange={() => undefined} gateway={gatewayWith({ prepare })} identity={identity} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Clubname" }), { target: { value: "Nordhafen aktualisiert" } });
    fireEvent.click(screen.getByRole("button", { name: "Identität-Vorschau erstellen" }));
    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));

    const replacement = structuredClone(snapshot);
    replacement.clubs[0].short_name = "NH 08";
    rerender(<ClubWorkspace snapshot={replacement} onSnapshotChange={() => undefined} gateway={gatewayWith({ prepare })} identity={identity} />);
    const command = prepare.mock.calls[0][1].command;
    resolvePrepare?.(prepared(command, clubTransaction("name", snapshot.clubs[0].name, "Nordhafen aktualisiert"), replacement));

    await waitFor(() => expect(screen.getByText("Formular geändert – asynchrone Vorschau verworfen")).toBeTruthy());
    expect(screen.queryByText("Vorschau konfliktfrei")).toBeNull();
  });

  it("blocks an empty club name before invoking the backend", () => {
    const prepare = vi.fn();
    render(<ClubWorkspace snapshot={clubSnapshot()} onSnapshotChange={() => undefined} gateway={gatewayWith({ prepare })} identity={identity} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Clubname" }), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Identität-Vorschau erstellen" }));

    expect(prepare).not.toHaveBeenCalled();
    expect(screen.getByText("Der Clubname darf nicht leer sein")).toBeTruthy();
  });
});

function clubSnapshot(): DatabaseSnapshot {
  return {
    schema_version: 1,
    source: "synthetic",
    game_date: { year: 2026, month: 7, day: 22 },
    players: [],
    staff: [],
    clubs: [{
      id: "club-nordhafen",
      name: "Sportverein Nordhafen",
      short_name: "SV Nordhafen",
      nation: "Deutschland",
      competition: "Nordliga",
      competition_id: "competition-nordliga",
      reputation: 4800,
      professional_status: "professional",
      stadium: "Hafenpark",
      stadium_capacity: 24_500,
      average_attendance: 19_300,
      finances: { balance: 18_000_000, transfer_budget: 6_500_000, wage_budget: 450_000, debt: 2_000_000 },
      facilities: { training: 15, youth: 16, youth_recruitment: 14, junior_coaching: 15 },
    }],
    competitions: [{
      id: "competition-nordliga",
      name: "Nordliga",
      short_name: "NL",
      nation: "Deutschland",
      reputation: 6000,
      current_champion: "Sportverein Nordhafen",
      level: 1,
    }],
  };
}

function echoingPrepare(snapshot: DatabaseSnapshot) {
  return vi.fn(async (_snapshot: DatabaseSnapshot, request: ClubActionRequest) => prepared(
    request.command,
    clubTransaction("finances.transfer_budget", 6_500_000, 7_000_000),
    snapshot,
  ));
}

function clubTransaction(field: string, before: unknown, after: unknown): EditTransaction {
  return {
    schema_version: 1,
    id: "club-test-transaction",
    created_at_utc: "2026-07-22T20:00:00Z",
    reason: "Club workspace test",
    operations: [{
      entity_kind: "club",
      entity_id: "club-nordhafen",
      field,
      expected_before: { mode: "exact", value: before },
      after,
    }],
  };
}

function prepared(command: ClubCommand, transaction: EditTransaction, edited: DatabaseSnapshot): PreparedClubAction {
  return { command, transaction, preview: applied(transaction, edited) };
}

function gatewayWith(overrides: Partial<ClubGateway> = {}): ClubGateway {
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
