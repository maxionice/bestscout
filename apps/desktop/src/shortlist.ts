import type { Player, ShortlistDocument, ShortlistEntry, ShortlistFormat } from "./types";

export const shortlistStorageKey = "bestscout.shortlist.v1";

export function defaultShortlist(): ShortlistDocument {
  return { schema_version: 1, entries: [{ player_id: "103", favorite: true, tags: ["Top-Talent"], note: null }] };
}

export function loadShortlist(storage?: Pick<Storage, "getItem">): ShortlistDocument {
  try {
    const target = storage ?? globalThis.localStorage;
    if (!target) return defaultShortlist();
    const value: unknown = JSON.parse(target.getItem(shortlistStorageKey) ?? "null");
    return normalizeShortlist(value) ?? defaultShortlist();
  } catch {
    return defaultShortlist();
  }
}

export function persistShortlist(document: ShortlistDocument, storage?: Pick<Storage, "setItem">) {
  try {
    const target = storage ?? globalThis.localStorage;
    target?.setItem(shortlistStorageKey, JSON.stringify(document));
  } catch {
    // The in-memory shortlist stays usable when storage is disabled.
  }
}

export function normalizeShortlist(value: unknown): ShortlistDocument | null {
  if (!value || typeof value !== "object") return null;
  const document = value as Partial<ShortlistDocument>;
  if (document.schema_version !== 1 || !Array.isArray(document.entries)) return null;
  const byPlayer = new Map<string, ShortlistEntry>();
  for (const candidate of document.entries) {
    if (!candidate || typeof candidate !== "object") continue;
    const entry = candidate as Partial<ShortlistEntry>;
    const playerId = cleanText(entry.player_id, 128);
    if (!playerId) continue;
    const tags = [...new Set((Array.isArray(entry.tags) ? entry.tags : []).map((tag) => cleanText(tag, 40)).filter(Boolean))].sort().slice(0, 20);
    const note = cleanText(entry.note, 4_000) || null;
    byPlayer.set(playerId, { player_id: playerId, favorite: entry.favorite === true, tags, note });
  }
  return { schema_version: 1, entries: [...byPlayer.values()].sort((left, right) => left.player_id.localeCompare(right.player_id)) };
}

export function importShortlistLocally(contents: string, format: Exclude<ShortlistFormat, "html">): ShortlistDocument {
  if (format === "json") {
    const normalized = normalizeShortlist(JSON.parse(contents));
    if (!normalized) throw new Error("Ungültiges BestScout-Shortlist-JSON");
    return normalized;
  }
  const rows = parseCsv(contents);
  const header = rows.shift()?.map((cell) => cell.trim().toLocaleLowerCase("en")) ?? [];
  const playerIndex = header.indexOf("player_id");
  if (playerIndex < 0) throw new Error("CSV-Spalte player_id fehlt");
  const favoriteIndex = header.indexOf("favorite");
  const tagsIndex = header.indexOf("tags");
  const noteIndex = header.indexOf("note");
  const document = {
    schema_version: 1,
    entries: rows.map((row) => ({
      player_id: row[playerIndex] ?? "",
      favorite: /^(true|1|yes|ja|x)$/i.test(row[favoriteIndex] ?? ""),
      tags: (row[tagsIndex] ?? "").split("|").filter(Boolean),
      note: row[noteIndex] || null,
    })),
  } satisfies ShortlistDocument;
  return normalizeShortlist(document)!;
}

export function exportShortlistLocally(document: ShortlistDocument, players: Player[], format: ShortlistFormat) {
  const normalized = normalizeShortlist(document) ?? { schema_version: 1 as const, entries: [] };
  if (format === "json") return JSON.stringify(normalized, null, 2);
  const playerNames = new Map(players.map((player) => [player.id, player.name]));
  if (format === "csv") {
    const rows = [["player_id", "name", "favorite", "tags", "note"], ...normalized.entries.map((entry) => [
      entry.player_id,
      playerNames.get(entry.player_id) ?? "Unbekannter Spieler",
      entry.favorite ? "true" : "false",
      entry.tags.join("|"),
      entry.note ?? "",
    ])];
    return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
  }
  const rows = normalized.entries.map((entry) => `<tr><td>${escapeHtml(playerNames.get(entry.player_id) ?? "Unbekannter Spieler")}</td><td>${escapeHtml(entry.player_id)}</td><td>${entry.favorite ? "★" : ""}</td><td>${escapeHtml(entry.tags.join(", "))}</td><td>${escapeHtml(entry.note ?? "")}</td></tr>`).join("");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>BestScout Shortlist</title><style>body{font:14px system-ui;background:#080b10;color:#eef3f8;padding:32px}h1{color:#73f2a7}table{width:100%;border-collapse:collapse;background:#10151d}th,td{padding:10px;border:1px solid #242d3a;text-align:left}th{color:#73f2a7}</style></head><body><h1>BestScout Shortlist</h1><p>${normalized.entries.length} Einträge · Schema 1</p><table><thead><tr><th>Spieler</th><th>ID</th><th>Favorit</th><th>Tags</th><th>Notiz</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

function cleanText(value: unknown, maximumChars: number) {
  return typeof value === "string" ? [...value.trim()].filter((character) => character === "\n" || character === "\t" || !/[\u0000-\u001f\u007f]/.test(character)).slice(0, maximumChars).join("") : "";
}

function csvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function parseCsv(contents: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index];
    if (character === '"' && quoted && contents[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && contents[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
