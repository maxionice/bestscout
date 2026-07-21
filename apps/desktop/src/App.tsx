import { useMemo, useRef, useState } from "react";
import { Button, Card, Input, Table, TextField } from "@heroui/react";
import { invoke } from "@tauri-apps/api/core";
import {
  Activity, BarChart3, ChevronDown, Database, FileUp, Filter,
  LayoutDashboard, Search, ShieldCheck, Star, Users, Zap,
} from "lucide-react";
import { demoPlayers } from "./demo";
import type { ImportResult, LiveEnvironment, Player } from "./types";

const nav = [
  [LayoutDashboard, "Übersicht"], [Search, "Spielersuche"], [Users, "Kaderanalyse"],
  [Star, "Shortlist"], [BarChart3, "Vergleich"], [Activity, "Live-Spiel"],
] as const;

const money = new Intl.NumberFormat("de-DE", { notation: "compact", style: "currency", currency: "EUR", maximumFractionDigits: 1 });

function score(player: Player) {
  const keys = ["passing", "vision", "decisions", "first_touch", "technique", "composure"];
  const values = keys.map((key) => player.attributes[key]).filter((v): v is number => typeof v === "number");
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length / 20 * 100) : 0;
}

export default function App() {
  const [players, setPlayers] = useState(demoPlayers);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("Spielersuche");
  const [shortlist, setShortlist] = useState<Set<string>>(new Set(["103"]));
  const [status, setStatus] = useState("Demo-Daten · noch nicht mit FM26 verbunden");
  const input = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("de");
    return players.filter((player) => !needle || [player.name, player.club, player.nationality, ...player.positions]
      .some((value) => value?.toLocaleLowerCase("de").includes(needle)));
  }, [players, query]);

  async function importFile(file?: File) {
    if (!file) return;
    const contents = await file.text();
    try {
      const result = await invoke<ImportResult>("parse_csv", { contents });
      setPlayers(result.players);
      setStatus(`${result.players.length} Spieler importiert · Trennzeichen „${result.delimiter}“`);
    } catch (error) {
      setStatus(`Import fehlgeschlagen: ${String(error)}`);
    }
  }

  async function detectGame() {
    try {
      const environment = await invoke<LiveEnvironment>("detect_fm26");
      const install = environment.installations[0];
      const hash = install?.fingerprint?.sha256.slice(0, 8);
      setStatus(`${environment.message}${hash ? ` · Build ${hash}` : ""}`);
    } catch (error) {
      setStatus(`Spielerkennung fehlgeschlagen: ${String(error)}`);
    }
  }

  function toggleShortlist(id: string) {
    setShortlist((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Zap size={20} fill="currentColor" /></div>
          <div><strong>BestScout</strong><span>FM26 Intelligence</span></div>
        </div>

        <nav aria-label="Hauptnavigation">
          <p className="nav-label">ARBEITSBEREICH</p>
          {nav.map(([Icon, label]) => (
            <Button key={label} variant={active === label ? "secondary" : "ghost"} className="nav-button" onPress={() => setActive(label)}>
              <Icon size={17} /><span>{label}</span>
              {label === "Shortlist" && shortlist.size > 0 && <span className="nav-count">{shortlist.size}</span>}
            </Button>
          ))}
        </nav>

        <Card className="connection-card" variant="secondary">
          <Card.Content>
            <div className="connection-row"><span className="status-dot" /> Offline-Modus</div>
            <p>{status}</p>
            <Button size="sm" variant="tertiary" className="w-full" onPress={detectGame}><ShieldCheck size={15} /> Spiel erkennen</Button>
          </Card.Content>
        </Card>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">SCOUTING-ZENTRALE</p>
            <h1>{active}</h1>
          </div>
          <div className="top-actions">
            <input ref={input} type="file" accept=".csv,.txt" hidden onChange={(event) => importFile(event.target.files?.[0])} />
            <Button variant="secondary" onPress={() => input.current?.click()}><FileUp size={16} /> CSV importieren</Button>
            <Button><Database size={16} /> Live-Daten laden</Button>
          </div>
        </header>

        <section className="metrics" aria-label="Datenübersicht">
          <Metric label="Spieler im Datensatz" value={players.length.toLocaleString("de-DE")} detail="Aktueller Import" />
          <Metric label="U21-Talente" value={players.filter((p) => (p.age ?? 99) <= 21).length.toString()} detail="Potenzialanalyse" accent />
          <Metric label="Auf Shortlist" value={shortlist.size.toString()} detail="Lokale Auswahl" />
          <Metric label="Datenabdeckung" value={`${Math.round(players.reduce((sum, p) => sum + Object.keys(p.attributes).length, 0) / Math.max(players.length, 1) / 30 * 100)}%`} detail="Attribute erkannt" />
        </section>

        <Card className="workspace-card">
          <Card.Header className="workspace-head">
            <div>
              <Card.Title>Spielerdatenbank</Card.Title>
              <Card.Description>Rollenbasiertes Scouting mit erklärbaren Bewertungen</Card.Description>
            </div>
            <div className="filters">
              <TextField aria-label="Spieler durchsuchen" value={query} onChange={setQuery} className="search-field">
                <Search className="search-icon" size={16} />
                <Input placeholder="Name, Verein, Nation …" />
              </TextField>
              <Button variant="secondary"><Filter size={16} /> Filter <ChevronDown size={14} /></Button>
            </div>
          </Card.Header>
          <Card.Content className="p-0">
            <Table variant="secondary" className="player-table">
              <Table.ScrollContainer>
                <Table.Content aria-label="Spielerliste">
                  <Table.Header>
                    <Table.Column id="favorite" aria-label="Shortlist" />
                    <Table.Column id="name">SPIELER</Table.Column>
                    <Table.Column id="position">POSITION</Table.Column>
                    <Table.Column id="age">ALTER</Table.Column>
                    <Table.Column id="club">VEREIN</Table.Column>
                    <Table.Column id="value">MARKTWERT</Table.Column>
                    <Table.Column id="ca">CA / PA</Table.Column>
                    <Table.Column id="score">ROLLENWERT</Table.Column>
                  </Table.Header>
                  <Table.Body items={filtered} renderEmptyState={() => <div className="empty">Keine passenden Spieler gefunden.</div>}>
                    {(player) => {
                      const rating = score(player);
                      return (
                        <Table.Row id={player.id} key={player.id}>
                          <Table.Cell><button className={`star ${shortlist.has(player.id) ? "active" : ""}`} onClick={() => toggleShortlist(player.id)} aria-label="Shortlist umschalten"><Star size={17} fill="currentColor" /></button></Table.Cell>
                          <Table.Cell><div className="player"><div className="avatar">{player.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}</div><div><strong>{player.name}</strong><span>{player.nationality ?? "–"}</span></div></div></Table.Cell>
                          <Table.Cell><span className="position">{player.positions.join(" · ") || "–"}</span></Table.Cell>
                          <Table.Cell>{player.age ?? "–"}</Table.Cell>
                          <Table.Cell>{player.club ?? "–"}</Table.Cell>
                          <Table.Cell>{player.value ? money.format(player.value) : "–"}</Table.Cell>
                          <Table.Cell><span className="ca">{player.current_ability ?? "?"}</span><span className="muted"> / {player.potential_ability ?? "?"}</span></Table.Cell>
                          <Table.Cell><div className="rating"><span>{rating}</span><i><b style={{ width: `${rating}%` }} /></i></div></Table.Cell>
                        </Table.Row>
                      );
                    }}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </Card.Content>
          <Card.Footer className="table-footer"><span>{filtered.length} von {players.length} Spielern</span><span>Rollenprofil: Tiefer Spielmacher</span></Card.Footer>
        </Card>
      </main>
    </div>
  );
}

function Metric({ label, value, detail, accent = false }: { label: string; value: string; detail: string; accent?: boolean }) {
  return (
    <Card className={`metric-card ${accent ? "accent" : ""}`}>
      <Card.Content><span>{label}</span><strong>{value}</strong><small>{detail}</small></Card.Content>
    </Card>
  );
}
