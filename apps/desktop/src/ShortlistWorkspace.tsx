import { useMemo, useRef, useState } from "react";
import { Button, Card, Input, TextArea, TextField } from "@heroui/react";
import { FileJson, FileSpreadsheet, Globe2, Import, NotebookPen, Plus, Search, Star, Tag, Trash2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

import { exportShortlistLocally, importShortlistLocally, normalizeShortlist } from "./shortlist";
import type { Player, ShortlistDocument, ShortlistEntry, ShortlistFormat } from "./types";

const money = new Intl.NumberFormat("de-DE", { notation: "compact", style: "currency", currency: "EUR", maximumFractionDigits: 1 });

export function ShortlistWorkspace({ players, document, onChange }: {
  players: Player[];
  document: ShortlistDocument;
  onChange: (document: ShortlistDocument) => void;
}) {
  const [query, setQuery] = useState("");
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("Lokal gespeichert · Schema 1");
  const importInput = useRef<HTMLInputElement>(null);
  const playersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const entries = document.entries.filter((entry) => {
    const player = playersById.get(entry.player_id);
    const needle = query.trim().toLocaleLowerCase("de");
    return !needle || [player?.name, player?.club, entry.note, ...entry.tags].some((value) => value?.toLocaleLowerCase("de").includes(needle));
  });
  const allTags = new Set(document.entries.flatMap((entry) => entry.tags));
  const favorites = document.entries.filter((entry) => entry.favorite).length;

  function updateEntry(playerId: string, patch: Partial<ShortlistEntry>) {
    onChange({ ...document, entries: document.entries.map((entry) => entry.player_id === playerId ? { ...entry, ...patch } : entry) });
  }

  function addTag(entry: ShortlistEntry) {
    const tag = (tagDrafts[entry.player_id] ?? "").trim().slice(0, 40);
    if (!tag) return;
    updateEntry(entry.player_id, { tags: [...new Set([...entry.tags, tag])].sort().slice(0, 20) });
    setTagDrafts((current) => ({ ...current, [entry.player_id]: "" }));
  }

  function removeEntry(playerId: string) {
    onChange({ ...document, entries: document.entries.filter((entry) => entry.player_id !== playerId) });
  }

  async function handleExport(format: ShortlistFormat) {
    let contents = exportShortlistLocally(document, players, format);
    try {
      contents = await invoke<string>("export_shortlist", { document, players, format });
    } catch {
      // The browser fallback produces the same versioned format.
    }
    downloadText(contents, format);
    setNotice(`${format.toLocaleUpperCase("de")}-Export mit ${document.entries.length} Einträgen erstellt`);
  }

  async function handleImport(file?: File) {
    if (!file) return;
    const format = file.name.toLocaleLowerCase("de").endsWith(".csv") ? "csv" : "json";
    const contents = await file.text();
    try {
      let imported = importShortlistLocally(contents, format);
      try {
        imported = await invoke<ShortlistDocument>("import_shortlist", { contents, format });
      } catch {
        // Local validation already succeeded.
      }
      const knownIds = new Set(players.map((player) => player.id));
      const normalized = normalizeShortlist({ ...imported, entries: imported.entries.filter((entry) => knownIds.has(entry.player_id)) });
      if (!normalized) throw new Error("Ungültige Shortlist");
      onChange(normalized);
      setNotice(`${normalized.entries.length} bekannte Spieler importiert`);
    } catch (error) {
      setNotice(`Import fehlgeschlagen: ${String(error)}`);
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  }

  return (
    <div className="shortlist-workspace">
      <Card className="shortlist-hero">
        <Card.Header>
          <div><Card.Title>Scouting-Board</Card.Title><Card.Description>Favoriten, Tags und Notizen bleiben lokal auf diesem Gerät</Card.Description></div>
          <span className="engine-badge"><Star size={13} /> SHORTLIST V1</span>
        </Card.Header>
        <Card.Content className="shortlist-overview">
          <div><span>Einträge</span><strong>{document.entries.length}</strong></div>
          <div><span>Favoriten</span><strong>{favorites}</strong></div>
          <div><span>Eigene Tags</span><strong>{allTags.size}</strong></div>
          <div className="shortlist-notice"><span>Status</span><strong>{notice}</strong></div>
        </Card.Content>
      </Card>

      <Card className="shortlist-toolbar">
        <Card.Content>
          <TextField aria-label="Shortlist durchsuchen" value={query} onChange={setQuery} className="shortlist-search">
            <Search className="search-icon" size={16} /><Input placeholder="Spieler, Verein, Tag oder Notiz …" />
          </TextField>
          <div className="shortlist-actions" aria-label="Shortlist importieren und exportieren">
            <input ref={importInput} type="file" accept=".json,.csv" hidden onChange={(event) => handleImport(event.target.files?.[0])} />
            <Button variant="secondary" size="sm" onPress={() => importInput.current?.click()}><Import size={14} /> Import</Button>
            <Button variant="ghost" size="sm" onPress={() => handleExport("json")}><FileJson size={14} /> JSON</Button>
            <Button variant="ghost" size="sm" onPress={() => handleExport("csv")}><FileSpreadsheet size={14} /> CSV</Button>
            <Button variant="ghost" size="sm" onPress={() => handleExport("html")}><Globe2 size={14} /> HTML</Button>
          </div>
        </Card.Content>
      </Card>

      <div className="shortlist-grid">
        {entries.map((entry) => {
          const player = playersById.get(entry.player_id);
          if (!player) return null;
          return (
            <Card className="shortlist-player-card" key={entry.player_id}>
              <Card.Header>
                <div className="shortlist-player-identity"><span>{initials(player.name)}</span><div><Card.Title>{player.name}</Card.Title><Card.Description>{player.club ?? "Vereinslos"} · {player.positions.join(" / ")}</Card.Description></div></div>
                <div className="shortlist-card-actions"><Button isIconOnly size="sm" variant="ghost" className={entry.favorite ? "favorite-active" : ""} aria-label={`${player.name} als Favorit umschalten`} aria-pressed={entry.favorite} onPress={() => updateEntry(entry.player_id, { favorite: !entry.favorite })}><Star size={15} fill="currentColor" /></Button><Button isIconOnly size="sm" variant="ghost" aria-label={`${player.name} von Shortlist entfernen`} onPress={() => removeEntry(entry.player_id)}><Trash2 size={14} /></Button></div>
              </Card.Header>
              <Card.Content>
                <div className="shortlist-player-stats"><span><b>{player.current_ability ?? "?"}</b> CA</span><span><b>{player.potential_ability ?? "?"}</b> PA</span><span><b>{player.value ? money.format(player.value) : "–"}</b> Wert</span><span><b>{player.age ?? "–"}</b> Alter</span></div>
                <div className="shortlist-tags"><div className="shortlist-section-label"><Tag size={12} /> Tags</div><div className="tag-list">{entry.tags.map((tag) => <Button key={tag} size="sm" variant="secondary" aria-label={`Tag ${tag} bei ${player.name} entfernen`} onPress={() => updateEntry(entry.player_id, { tags: entry.tags.filter((candidate) => candidate !== tag) })}>{tag} ×</Button>)}</div><div className="tag-add"><TextField aria-label={`Tag für ${player.name}`} value={tagDrafts[entry.player_id] ?? ""} onChange={(value) => setTagDrafts((current) => ({ ...current, [entry.player_id]: value }))}><Input placeholder="Tag hinzufügen …" onKeyDown={(event) => { if (event.key === "Enter") addTag(entry); }} /></TextField><Button isIconOnly size="sm" variant="secondary" aria-label={`Tag für ${player.name} hinzufügen`} onPress={() => addTag(entry)}><Plus size={14} /></Button></div></div>
                <div className="shortlist-note"><label htmlFor={`note-${entry.player_id}`}><NotebookPen size={12} /> Scouting-Notiz</label><TextArea id={`note-${entry.player_id}`} aria-label={`Notiz für ${player.name}`} value={entry.note ?? ""} maxLength={4_000} placeholder="Beobachtung, nächste Aktion oder Transferidee …" onChange={(event) => updateEntry(entry.player_id, { note: event.target.value || null })} /></div>
              </Card.Content>
            </Card>
          );
        })}
      </div>
      {entries.length === 0 && <Card className="shortlist-empty"><Card.Content><Star size={23} /><strong>Keine passenden Shortlist-Einträge</strong><span>Spieler über den Stern in der Spielersuche hinzufügen oder eine Shortlist importieren.</span></Card.Content></Card>}
    </div>
  );
}

function downloadText(contents: string, format: ShortlistFormat) {
  const mime = format === "json" ? "application/json" : format === "csv" ? "text/csv" : "text/html";
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `bestscout-shortlist.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toLocaleUpperCase("de");
}
