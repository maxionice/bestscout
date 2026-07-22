// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorWorkspace, type EditorGateway } from "./EditorWorkspace";
import { demoPlayers } from "./demo";
import type { AppliedTransaction, DatabaseSnapshot, EditTransaction, JournalEntry } from "./types";

afterEach(cleanup);

const snapshot: DatabaseSnapshot = {
  schema_version: 1,
  source: "synthetic",
  players: demoPlayers,
  staff: [],
  clubs: [],
  competitions: [],
};

describe("transactional editor workspace", () => {
  it("stages, previews and commits an exact field edit", async () => {
    const onSnapshotChange = vi.fn();
    const preview = vi.fn(async (_snapshot: DatabaseSnapshot, transaction: EditTransaction) => applied(transaction));
    const apply = vi.fn(async (_journalId: string, _snapshot: DatabaseSnapshot, transaction: EditTransaction) => applied(transaction));
    const gateway = gatewayWith({ preview, apply });

    render(<EditorWorkspace snapshot={snapshot} onSnapshotChange={onSnapshotChange} gateway={gateway} />);
    expect(screen.getByRole("button", { name: /Abwürfe/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Potenzial \(PA\)/ }));
    const value = screen.getByRole("textbox", { name: "Neuer Wert für Potenzial (PA)" });
    fireEvent.change(value, { target: { value: "180" } });
    fireEvent.click(screen.getByRole("button", { name: "Änderung vormerken" }));

    expect(screen.getByText("Potenzial (PA)", { selector: ".editor-change strong" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Vorschau validieren" }));
    expect(await screen.findByText("Vorschau vollständig gültig")).toBeTruthy();
    expect(preview).toHaveBeenCalledTimes(1);
    expect(preview.mock.calls[0][1].operations[0]).toMatchObject({
      entity_kind: "player",
      field: "potential_ability",
      after: 180,
      expected_before: { mode: "exact", value: demoPlayers[0].potential_ability },
    });

    fireEvent.click(screen.getByRole("button", { name: "Arbeitskopie committen" }));
    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    expect(onSnapshotChange).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText("Journal").parentElement?.textContent).toContain("1 Einträge"));
  });

  it("rejects values outside the field boundary before preview", () => {
    const gateway = gatewayWith();
    render(<EditorWorkspace snapshot={snapshot} onSnapshotChange={() => undefined} gateway={gateway} />);
    fireEvent.click(screen.getByRole("button", { name: /Potenzial \(PA\)/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Neuer Wert für Potenzial (PA)" }), { target: { value: "201" } });
    fireEvent.click(screen.getByRole("button", { name: "Änderung vormerken" }));

    expect(screen.getByRole("alert").textContent).toContain("Höchstwert: 200");
    expect(gateway.preview).not.toHaveBeenCalled();
  });
});

function gatewayWith(overrides: Partial<EditorGateway> = {}): EditorGateway {
  return {
    preview: vi.fn(async (_snapshot, transaction) => applied(transaction)),
    apply: vi.fn(async (_journalId, _snapshot, transaction) => applied(transaction)),
    history: vi.fn(async () => ({ schema_version: 1 as const, entries: [] })),
    undo: vi.fn(async () => { throw new Error("not used"); }),
    restore: vi.fn(async () => snapshot),
    ...overrides,
  };
}

function applied(transaction: EditTransaction): AppliedTransaction {
  const edited = structuredClone(snapshot);
  const operation = transaction.operations[0];
  if (operation?.entity_kind === "player" && operation.field === "potential_ability") {
    edited.players[0].potential_ability = Number(operation.after);
  }
  const journal_entry: JournalEntry = {
    schema_version: 1,
    transaction_id: transaction.id,
    created_at_utc: transaction.created_at_utc,
    reason: transaction.reason,
    reverts_transaction_id: null,
    snapshot_before_hash: "a".repeat(64),
    snapshot_after_hash: "b".repeat(64),
    changes: transaction.operations.map((item) => ({
      entity_kind: item.entity_kind,
      entity_id: item.entity_id,
      field: item.field,
      before: item.expected_before.mode === "exact" ? item.expected_before.value : null,
      after: item.after,
    })),
  };
  return { snapshot: edited, journal_entry };
}
