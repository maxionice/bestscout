import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Input, NumberField, Table, TextField } from "@heroui/react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Activity, BarChart3, Building2, CheckCircle2, ChevronDown, CircleOff, Database,
  FileUp, Filter, Fingerprint, LayoutDashboard, LockKeyhole, RefreshCw, Search,
  ShieldCheck, Star, Trophy, UserRoundCog, Users, Zap, Minus, Square, X,
} from "lucide-react";
import { demoPlayers } from "./demo";
import type {
  DatabaseSnapshot, ImportResult, LiveEnvironment, Player, PlayerQueryResult, SearchHit,
} from "./types";

const nav = [
  [LayoutDashboard, "Übersicht"], [Search, "Spielersuche"], [Users, "Kaderanalyse"],
  [Star, "Shortlist"], [BarChart3, "Vergleich"], [Activity, "Live-Spiel"],
] as const;

const money = new Intl.NumberFormat("de-DE", { notation: "compact", style: "currency", currency: "EUR", maximumFractionDigits: 1 });
const totalPlayerAttributes = 47;

function score(player: Player) {
  const keys = ["passing", "vision", "decisions", "first_touch", "technique", "composure"];
  const values = keys.map((key) => player.attributes[key]).filter((v): v is number => typeof v === "number");
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length / 20 * 100) : 0;
}

export default function App() {
  const [players, setPlayers] = useState(demoPlayers);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("Übersicht");
  const [shortlist, setShortlist] = useState<Set<string>>(new Set(["103"]));
  const [status, setStatus] = useState("Demo-Daten · noch nicht mit FM26 verbunden");
  const [liveEnvironment, setLiveEnvironment] = useState<LiveEnvironment | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [u21Only, setU21Only] = useState(false);
  const [freeAgentsOnly, setFreeAgentsOnly] = useState(false);
  const [minPotential, setMinPotential] = useState(0);
  const [maxValueMillions, setMaxValueMillions] = useState(0);
  const [snapshot, setSnapshot] = useState<DatabaseSnapshot | null>(null);
  const [globalQuery, setGlobalQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const locallyFiltered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("de");
    const maximumValue = maxValueMillions > 0 ? maxValueMillions * 1_000_000 : null;
    return players.filter((player) =>
      (!needle || [player.name, player.club, player.nationality, ...player.positions]
        .some((value) => value?.toLocaleLowerCase("de").includes(needle)))
      && (!u21Only || (player.age ?? 99) <= 21)
      && (!freeAgentsOnly || !player.club)
      && (minPotential <= 0 || (player.potential_ability ?? 0) >= minPotential)
      && (maximumValue === null || (player.value ?? Number.POSITIVE_INFINITY) <= maximumValue));
  }, [players, query, u21Only, freeAgentsOnly, minPotential, maxValueMillions]);
  const [filtered, setFiltered] = useState(locallyFiltered);
  const activeFilterCount = Number(u21Only) + Number(freeAgentsOnly) + Number(minPotential > 0) + Number(maxValueMillions > 0);

  useEffect(() => {
    let cancelled = false;
    setFiltered(locallyFiltered);
    const predicates: unknown[] = [];
    if (query.trim()) predicates.push({ operator: "predicate", items: { kind: "text_contains", value: query } });
    if (u21Only) predicates.push({ operator: "predicate", items: { kind: "age_between", minimum: 0, maximum: 21 } });
    if (freeAgentsOnly) predicates.push({ operator: "predicate", items: { kind: "free_agent" } });
    if (minPotential > 0) predicates.push({ operator: "predicate", items: { kind: "potential_ability_between", minimum: minPotential, maximum: 200 } });
    if (maxValueMillions > 0) predicates.push({ operator: "predicate", items: { kind: "value_between", minimum: 0, maximum: maxValueMillions * 1_000_000 } });
    const timer = window.setTimeout(() => {
      invoke<PlayerQueryResult>("query_players", {
        players,
        query: {
          filter: { operator: "all", items: predicates },
          sort: { field: "role_score", direction: "descending" },
          role_id: "deep_lying_playmaker",
          offset: 0,
          limit: 10_000,
        },
      }).then((result) => {
        if (!cancelled) setFiltered(result.rows.map((row) => row.player));
      }).catch(() => undefined);
    }, 100);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [players, query, u21Only, freeAgentsOnly, minPotential, maxValueMillions, locallyFiltered]);

  useEffect(() => {
    invoke<DatabaseSnapshot>("load_synthetic_snapshot")
      .then(setSnapshot)
      .catch(() => setSnapshot(fallbackSnapshot(players)));
  }, []);

  useEffect(() => {
    const needle = globalQuery.trim();
    if (!needle || !snapshot) {
      setSearchHits([]);
      setIsSearching(false);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    const timer = window.setTimeout(() => {
      invoke<SearchHit[]>("search_database", {
        snapshot,
        query: { text: needle, kinds: [], limit: 30 },
      }).then((hits) => {
        if (!cancelled) setSearchHits(hits);
      }).catch(() => {
        if (!cancelled) setSearchHits(localSearch(snapshot, needle));
      }).finally(() => {
        if (!cancelled) setIsSearching(false);
      });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [globalQuery, snapshot]);

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
          <Metric label="Datenabdeckung" value={`${Math.round(players.reduce((sum, p) => sum + Object.keys(p.attributes).length, 0) / Math.max(players.length, 1) / totalPlayerAttributes * 100)}%`} detail="47 FM26-Attribute" />
        </section>

        {active === "Live-Spiel" ? (
          <LiveWorkspace environment={liveEnvironment} isDetecting={isDetecting} onDetect={detectGame} />
        ) : active === "Übersicht" ? (
          <OverviewWorkspace
            snapshot={snapshot}
            query={globalQuery}
            onQueryChange={setGlobalQuery}
            hits={searchHits}
            isSearching={isSearching}
          />
        ) : (
        <>
        {filtersOpen && (
          <FilterPanel
            u21Only={u21Only}
            freeAgentsOnly={freeAgentsOnly}
            minPotential={minPotential}
            maxValueMillions={maxValueMillions}
            onU21Change={setU21Only}
            onFreeAgentsChange={setFreeAgentsOnly}
            onMinPotentialChange={setMinPotential}
            onMaxValueChange={setMaxValueMillions}
            onReset={() => {
              setU21Only(false);
              setFreeAgentsOnly(false);
              setMinPotential(0);
              setMaxValueMillions(0);
            }}
          />
        )}
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
              <Button variant={activeFilterCount > 0 ? "primary" : "secondary"} onPress={() => setFiltersOpen((current) => !current)}><Filter size={16} /> Filter{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""} <ChevronDown className={filtersOpen ? "chevron-open" : ""} size={14} /></Button>
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
        </>
        )}
      </main>
    </div>
  );
}

function OverviewWorkspace({ snapshot, query, onQueryChange, hits, isSearching }: {
  snapshot: DatabaseSnapshot | null;
  query: string;
  onQueryChange: (value: string) => void;
  hits: SearchHit[];
  isSearching: boolean;
}) {
  const counts = [
    [Users, "Spieler", snapshot?.players.length ?? 0],
    [UserRoundCog, "Staff", snapshot?.staff.length ?? 0],
    [Building2, "Vereine", snapshot?.clubs.length ?? 0],
    [Trophy, "Wettbewerbe", snapshot?.competitions.length ?? 0],
  ] as const;

  return (
    <div className="overview-workspace">
      <Card className="global-search-card">
        <Card.Content>
          <div className="global-search-copy">
            <span className="eyebrow">GESAMTE DATENBANK</span>
            <h2>Globale Suche</h2>
            <p>Durchsucht Spieler, Staff, Vereine und Wettbewerbe über dieselbe validierte Abfrage-Engine.</p>
          </div>
          <TextField aria-label="Gesamte Datenbank durchsuchen" value={query} onChange={onQueryChange} className="global-search-field">
            <Search className="search-icon" size={18} />
            <Input placeholder="Name, Verein, Nation oder Wettbewerb …" />
            {isSearching && <RefreshCw className="global-search-spinner spin" size={16} />}
          </TextField>
        </Card.Content>
      </Card>

      <section className="entity-counts" aria-label="Entitäten im Datensatz">
        {counts.map(([Icon, label, value]) => (
          <Card key={label} className="entity-count-card">
            <Card.Content><Icon size={17} /><div><strong>{value.toLocaleString("de-DE")}</strong><span>{label}</span></div></Card.Content>
          </Card>
        ))}
      </section>

      <Card className="search-results-card">
        <Card.Header>
          <div><Card.Title>Suchergebnisse</Card.Title><Card.Description>{query.trim() ? `${hits.length} Treffer für „${query.trim()}“` : "Suchbegriff eingeben, um alle Entitätstypen zu durchsuchen"}</Card.Description></div>
          <span className="engine-badge"><ShieldCheck size={13} /> CORE ENGINE</span>
        </Card.Header>
        <Card.Content>
          {hits.length > 0 ? hits.map((hit) => <SearchResult key={`${hit.kind}-${hit.id}`} hit={hit} />) : (
            <div className="search-empty"><Database size={24} /><strong>{query.trim() ? "Keine passenden Einträge" : "Bereit für die globale Suche"}</strong><span>{snapshot ? `Snapshot-Schema ${snapshot.schema_version} · ${snapshot.source}` : "Snapshot wird geladen …"}</span></div>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}

function SearchResult({ hit }: { hit: SearchHit }) {
  const icons = { player: Users, staff: UserRoundCog, club: Building2, competition: Trophy };
  const labels = { player: "Spieler", staff: "Staff", club: "Verein", competition: "Wettbewerb" };
  const Icon = icons[hit.kind];
  return (
    <Button variant="ghost" className="search-result">
      <span className={`result-icon ${hit.kind}`}><Icon size={16} /></span>
      <span className="result-copy"><strong>{hit.name}</strong><small>{hit.subtitle || "Keine Zusatzdaten"}</small></span>
      <span className="result-kind">{labels[hit.kind]}</span>
    </Button>
  );
}

function FilterPanel({
  u21Only, freeAgentsOnly, minPotential, maxValueMillions, onU21Change,
  onFreeAgentsChange, onMinPotentialChange, onMaxValueChange, onReset,
}: {
  u21Only: boolean;
  freeAgentsOnly: boolean;
  minPotential: number;
  maxValueMillions: number;
  onU21Change: (value: boolean) => void;
  onFreeAgentsChange: (value: boolean) => void;
  onMinPotentialChange: (value: number) => void;
  onMaxValueChange: (value: number) => void;
  onReset: () => void;
}) {
  return (
    <Card className="filter-panel" role="region" aria-label="Erweiterte Spielerfilter">
      <Card.Content>
        <div className="filter-heading"><div><strong>Erweiterte Filter</strong><span>Alle aktiven Bedingungen werden gemeinsam angewendet.</span></div><Button size="sm" variant="ghost" onPress={onReset}>Zurücksetzen</Button></div>
        <div className="filter-controls">
          <Button size="sm" variant={u21Only ? "primary" : "secondary"} aria-pressed={u21Only} onPress={() => onU21Change(!u21Only)}>U21-Talente</Button>
          <Button size="sm" variant={freeAgentsOnly ? "primary" : "secondary"} aria-pressed={freeAgentsOnly} onPress={() => onFreeAgentsChange(!freeAgentsOnly)}>Vereinslos</Button>
          <label className="number-filter"><span>Mindestens PA</span><NumberField aria-label="Minimales Potenzial" value={minPotential} minValue={0} maxValue={200} onChange={onMinPotentialChange}><NumberField.Group><NumberField.Input /><NumberField.DecrementButton aria-label="Potenzial verringern">−</NumberField.DecrementButton><NumberField.IncrementButton aria-label="Potenzial erhöhen">+</NumberField.IncrementButton></NumberField.Group></NumberField></label>
          <label className="number-filter"><span>Max. Wert in Mio. €</span><NumberField aria-label="Maximaler Marktwert in Millionen" value={maxValueMillions} minValue={0} maxValue={1000} onChange={onMaxValueChange}><NumberField.Group><NumberField.Input /><NumberField.DecrementButton aria-label="Marktwert verringern">−</NumberField.DecrementButton><NumberField.IncrementButton aria-label="Marktwert erhöhen">+</NumberField.IncrementButton></NumberField.Group></NumberField></label>
        </div>
      </Card.Content>
    </Card>
  );
}

function fallbackSnapshot(players: Player[]): DatabaseSnapshot {
  return {
    schema_version: 1,
    source: "synthetic",
    players,
    staff: [],
    clubs: [],
    competitions: [],
  };
}

function localSearch(snapshot: DatabaseSnapshot, query: string): SearchHit[] {
  const needle = normalizeSearch(query);
  const candidates: SearchHit[] = [
    ...snapshot.players.map((player) => ({ kind: "player" as const, id: player.id, name: player.name, subtitle: [player.club, player.nationality].filter(Boolean).join(" · "), relevance: 0 })),
    ...snapshot.staff.map((staff) => ({ kind: "staff" as const, id: staff.id, name: staff.name, subtitle: [staff.club, staff.nationality].filter(Boolean).join(" · "), relevance: 0 })),
    ...snapshot.clubs.map((club) => ({ kind: "club" as const, id: club.id, name: club.name, subtitle: [club.competition, club.nation].filter(Boolean).join(" · "), relevance: 0 })),
    ...snapshot.competitions.map((competition) => ({ kind: "competition" as const, id: competition.id, name: competition.name, subtitle: competition.nation ?? "", relevance: 0 })),
  ];
  return candidates
    .map((hit) => {
      const name = normalizeSearch(hit.name);
      const subtitle = normalizeSearch(hit.subtitle);
      const relevance = name === needle ? 1000 : name.startsWith(needle) ? 900 : name.includes(needle) ? 700 : subtitle.includes(needle) ? 500 : 0;
      return { ...hit, relevance };
    })
    .filter((hit) => hit.relevance > 0)
    .sort((left, right) => right.relevance - left.relevance || left.name.localeCompare(right.name, "de"))
    .slice(0, 30);
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("de").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
