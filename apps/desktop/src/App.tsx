import { useMemo, useRef, useState } from "react";
import { Button, Card, Input, Table, TextField } from "@heroui/react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Activity, BarChart3, CheckCircle2, ChevronDown, CircleOff, Database, FileUp,
  Filter, Fingerprint, LayoutDashboard, LockKeyhole, RefreshCw, Search,
  ShieldCheck, Star, Users, Zap, Minus, Square, X,
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
  const [liveEnvironment, setLiveEnvironment] = useState<LiveEnvironment | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
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
    setIsDetecting(true);
    try {
      const environment = await invoke<LiveEnvironment>("detect_fm26");
      setLiveEnvironment(environment);
      const install = environment.installations[0];
      const hash = install?.build_fingerprint?.executable.sha256.slice(0, 8);
      setStatus(`${environment.message}${hash ? ` · Build ${hash}` : ""}`);
    } catch (error) {
      setStatus(`Spielerkennung fehlgeschlagen: ${String(error)}`);
    } finally {
      setIsDetecting(false);
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
      <WindowTitlebar verified={liveEnvironment?.process_inspection_allowed ?? false} />
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
            <div className="connection-row"><span className={`status-dot ${liveEnvironment?.process_inspection_allowed ? "verified" : ""}`} /> {liveEnvironment?.process_inspection_allowed ? "Build verifiziert" : "Offline-Modus"}</div>
            <p>{status}</p>
            <Button size="sm" variant="tertiary" className="w-full" isDisabled={isDetecting} onPress={detectGame}>{isDetecting ? <RefreshCw className="spin" size={15} /> : <ShieldCheck size={15} />} {isDetecting ? "Prüfe Build …" : "Spiel erkennen"}</Button>
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
            <Button isDisabled={isDetecting} onPress={detectGame}><Database size={16} /> Live-Daten laden</Button>
          </div>
        </header>

        <section className="metrics" aria-label="Datenübersicht">
          <Metric label="Spieler im Datensatz" value={players.length.toLocaleString("de-DE")} detail="Aktueller Import" />
          <Metric label="U21-Talente" value={players.filter((p) => (p.age ?? 99) <= 21).length.toString()} detail="Potenzialanalyse" accent />
          <Metric label="Auf Shortlist" value={shortlist.size.toString()} detail="Lokale Auswahl" />
          <Metric label="Datenabdeckung" value={`${Math.round(players.reduce((sum, p) => sum + Object.keys(p.attributes).length, 0) / Math.max(players.length, 1) / 30 * 100)}%`} detail="Attribute erkannt" />
        </section>

        {active === "Live-Spiel" ? (
          <LiveWorkspace environment={liveEnvironment} isDetecting={isDetecting} onDetect={detectGame} />
        ) : (
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
                    <Table.Column id="name" isRowHeader>SPIELER</Table.Column>
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
        )}
      </main>
    </div>
  );
}

function WindowTitlebar({ verified }: { verified: boolean }) {
  async function control(action: "minimize" | "maximize" | "close") {
    try {
      const window = getCurrentWindow();
      if (action === "minimize") await window.minimize();
      if (action === "maximize") await window.toggleMaximize();
      if (action === "close") await window.close();
    } catch (error) {
      console.error(`Fensteraktion „${action}“ fehlgeschlagen`, error);
    }
  }

  return (
    <header
      className="window-titlebar"
      data-tauri-drag-region
      aria-label="BestScout Fensterleiste"
      onDoubleClick={(event) => {
        if (!(event.target as HTMLElement).closest("[data-window-control]")) {
          void control("maximize");
        }
      }}
    >
      <div className="window-identity" data-tauri-drag-region>
        <span className="window-logo" data-tauri-drag-region><Zap size={12} fill="currentColor" /></span>
        <strong data-tauri-drag-region>BestScout</strong>
        <span className="window-channel" data-tauri-drag-region>LINUX · DEVELOPMENT</span>
      </div>
      <div className="window-state" data-tauri-drag-region>
        <span className={`status-dot ${verified ? "verified" : ""}`} data-tauri-drag-region />
        <span data-tauri-drag-region>{verified ? "FM26-Build verifiziert" : "Sicherer Offline-Modus"}</span>
      </div>
      <div className="window-controls">
        <Button isIconOnly size="sm" variant="ghost" data-window-control aria-label="Minimieren" onPress={() => void control("minimize")}><Minus size={14} /></Button>
        <Button isIconOnly size="sm" variant="ghost" data-window-control aria-label="Maximieren oder wiederherstellen" onPress={() => void control("maximize")}><Square size={11} /></Button>
        <Button isIconOnly size="sm" variant="ghost" data-window-control className="window-close" aria-label="Schließen" onPress={() => void control("close")}><X size={14} /></Button>
      </div>
    </header>
  );
}

function LiveWorkspace({ environment, isDetecting, onDetect }: { environment: LiveEnvironment | null; isDetecting: boolean; onDetect: () => void }) {
  const installation = environment?.installations[0];
  const compatibility = installation?.compatibility;
  const fingerprint = installation?.build_fingerprint;

  return (
    <div className="live-workspace">
      <Card className="live-hero">
        <Card.Content>
          <div className="live-hero-icon"><Activity size={24} /></div>
          <div className="live-hero-copy">
            <span className="eyebrow">SICHERE LIVE-VERBINDUNG</span>
            <h2>{environment ? environment.message : "FM26-Umgebung noch nicht geprüft"}</h2>
            <p>BestScout aktiviert Funktionen einzeln anhand des vollständigen Build-Fingerprints. Ein erkannter Prozess allein schaltet niemals Schreibzugriffe frei.</p>
          </div>
          <Button isDisabled={isDetecting} onPress={onDetect}>{isDetecting ? <RefreshCw className="spin" size={16} /> : <Fingerprint size={16} />} {isDetecting ? "Prüfung läuft …" : "Erneut prüfen"}</Button>
        </Card.Content>
      </Card>

      <section className="capability-grid" aria-label="Live-Fähigkeiten">
        <Capability title="Build-Profil" enabled={compatibility?.status === "exact"} detail={compatibility?.label ?? "Kein Profil abgeglichen"} />
        <Capability title="Prozessinspektion" enabled={environment?.process_inspection_allowed ?? false} detail={environment?.processes.length ? `${environment.processes.length} FM26-Prozess gefunden` : "Kein laufender FM26-Prozess"} />
        <Capability title="In-Game Bridge" enabled={environment?.bridge?.health.read_only ?? false} detail={environment?.bridge ? `Bridge ${environment.bridge.health.bridge_version} · PID ${environment.bridge.health.pid}` : "Noch nicht in FM26 installiert"} />
        <Capability title="Domänendaten" enabled={environment?.reader_allowed ?? false} detail="Spieler-, Vereins- und Staff-Layout noch gesperrt" />
        <Capability title="Editor" enabled={environment?.editor_allowed ?? false} detail="Schreiben erst nach validierten Feldprofilen" locked />
      </section>

      <Card className="build-card">
        <Card.Header>
          <div><Card.Title>Kompatibilitätsnachweis</Card.Title><Card.Description>Drei Artefakte müssen für ein exaktes Profil übereinstimmen.</Card.Description></div>
          <span className={`profile-state ${compatibility?.status === "exact" ? "exact" : ""}`}>{compatibility?.status === "exact" ? "EXAKTER TREFFER" : "NICHT VERIFIZIERT"}</span>
        </Card.Header>
        <Card.Content>
          <BuildRow label="Steam Build" value={installation?.steam_build_id ?? "–"} />
          <BuildRow label="fm.exe" value={fingerprint?.executable.sha256 ?? "–"} />
          <BuildRow label="GameAssembly.dll" value={fingerprint?.game_assembly.sha256 ?? "–"} />
          <BuildRow label="global-metadata.dat" value={fingerprint?.global_metadata.sha256 ?? "–"} />
        </Card.Content>
      </Card>
    </div>
  );
}

function Capability({ title, enabled, detail, locked = false }: { title: string; enabled: boolean; detail: string; locked?: boolean }) {
  return (
    <Card className={`capability-card ${enabled ? "enabled" : ""}`}>
      <Card.Content>
        <div className="capability-icon">{enabled ? <CheckCircle2 size={18} /> : locked ? <LockKeyhole size={18} /> : <CircleOff size={18} />}</div>
        <strong>{title}</strong><span>{detail}</span>
      </Card.Content>
    </Card>
  );
}

function BuildRow({ label, value }: { label: string; value: string }) {
  return <div className="build-row"><span>{label}</span><code title={value}>{value.length > 28 ? `${value.slice(0, 16)}…${value.slice(-10)}` : value}</code></div>;
}

function Metric({ label, value, detail, accent = false }: { label: string; value: string; detail: string; accent?: boolean }) {
  return (
    <Card className={`metric-card ${accent ? "accent" : ""}`}>
      <Card.Content><span>{label}</span><strong>{value}</strong><small>{detail}</small></Card.Content>
    </Card>
  );
}
