import { describe, expect, it } from "vitest";

import {
  createSavedPlayerView, loadSavedPlayerViews, persistSavedPlayerViews, playerColumns,
} from "./view-preferences";

function memoryStorage() {
  let value: string | null = null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next; },
  };
}

describe("saved player views", () => {
  it("offers all 47 player attributes in addition to core columns", () => {
    expect(playerColumns.filter((column) => column.attribute)).toHaveLength(47);
  });

  it("round-trips a validated view and keeps the row-header column", () => {
    const storage = memoryStorage();
    const view = createSavedPlayerView(" Talente ", {
      roleId: "deep_lying_playmaker",
      rolePhase: "in_possession",
      visibleColumns: ["age", "attribute:passing"],
      filters: { u21Only: true, freeAgentsOnly: false, minPotential: 160, maxValueMillions: 20 },
    });
    persistSavedPlayerViews([view], storage);
    const loaded = loadSavedPlayerViews(storage);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe("Talente");
    expect(loaded[0].visibleColumns).toEqual(["name", "age", "attribute:passing"]);
  });

  it("rejects corrupt persisted data", () => {
    const storage = { getItem: () => "{not-json" };
    expect(loadSavedPlayerViews(storage)).toEqual([]);
  });
});
