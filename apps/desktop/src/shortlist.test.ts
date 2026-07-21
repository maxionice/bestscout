import { describe, expect, it } from "vitest";

import { demoPlayers } from "./demo";
import {
  defaultShortlist, exportShortlistLocally, importShortlistLocally,
  loadShortlist, persistShortlist, shortlistStorageKey,
} from "./shortlist";

describe("shortlist persistence and exchange", () => {
  it("round-trips the versioned JSON and CSV formats", () => {
    const document = defaultShortlist();
    const json = exportShortlistLocally(document, demoPlayers, "json");
    const csv = exportShortlistLocally(document, demoPlayers, "csv");

    expect(importShortlistLocally(json, "json")).toEqual(document);
    expect(importShortlistLocally(csv, "csv")).toEqual(document);
    expect(csv).toContain("Elias Berg");
  });

  it("escapes notes in the standalone HTML report", () => {
    const document = defaultShortlist();
    document.entries[0].note = "<script>alert('x')</script> & prüfen";
    const html = exportShortlistLocally(document, demoPlayers, "html");

    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp; prüfen");
    expect(html).not.toContain("<script>");
  });

  it("stores and reloads the local document", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const document = defaultShortlist();
    persistShortlist(document, storage);

    expect(values.has(shortlistStorageKey)).toBe(true);
    expect(loadShortlist(storage)).toEqual(document);
  });
});
