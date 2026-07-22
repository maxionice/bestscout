import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Input, NumberField, Table, TextField } from "@heroui/react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Activity, BarChart3, Building2, CheckCircle2, ChevronDown, CircleOff, Database,
  FileUp, Filter, Fingerprint, LayoutDashboard, LockKeyhole, RefreshCw, Search, TableProperties,
  ShieldCheck, Star, Trophy, UserRoundCog, Users, Zap, Minus, Square, X, PencilLine, Sparkles, Snowflake, HeartPulse, ArrowRightLeft,
} from "lucide-react";
import { AvailabilityWorkspace } from "./AvailabilityWorkspace";
import { demoPlayers } from "./demo";
import { ComparisonWorkspace } from "./ComparisonWorkspace";
import { DatabaseWorkspace } from "./DatabaseWorkspace";
import { EditorWorkspace } from "./EditorWorkspace";
import { FreezerWorkspace } from "./FreezerWorkspace";
import { IntelligenceWorkspace } from "./IntelligenceWorkspace";
import { PeopleWorkspace } from "./PeopleWorkspace";
import { RoleExplorer } from "./RoleExplorer";
import { ShortlistWorkspace } from "./ShortlistWorkspace";
import { SquadAnalysisWorkspace } from "./SquadAnalysisWorkspace";
import { TransferWorkspace } from "./TransferWorkspace";
import { locallyRatedRows, previewRoles } from "./roles";
import { loadShortlist, persistShortlist } from "./shortlist";
import { ViewToolbar } from "./ViewToolbar";
import {
  createSavedPlayerView, defaultPlayerColumns, loadSavedPlayerViews, persistSavedPlayerViews,
  playerColumns, type SavedPlayerView,
} from "./view-preferences";
import type {
  DatabaseSnapshot, GameDate, ImportResult, LiveEnvironment, Player, PlayerQueryResult, PlayerQueryRow,
  RolePhase, RoleProfile, SearchHit,
} from "./types";

const nav = [
  [LayoutDashboard, "Übersicht"], [Sparkles, "Scout-Intel"], [TableProperties, "Datenbank"], [Search, "Spielersuche"], [Users, "Kaderanalyse"],
  [Star, "Shortlist"], [BarChart3, "Vergleich"], [HeartPulse, "Verfügbarkeit"], [ArrowRightLeft, "Transfers"], [UserRoundCog, "People"], [PencilLine, "Editor"], [Snowflake, "Freezer"], [Activity, "Live-Spiel"],
] as const;

const money = new Intl.NumberFormat("de-DE", { notation: "compact", style: "currency", currency: "EUR", maximumFractionDigits: 1 });
const totalPlayerAttributes = 47;

export default function App() {
  const [players, setPlayers] = useState(demoPlayers);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("Übersicht");
  const [shortlistDocument, setShortlistDocument] = useState(loadShortlist);
  const [comparison, setComparison] = useState<Set<string>>(new Set(["101", "103"]));
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
  const [roles, setRoles] = useState<RoleProfile[]>(previewRoles);
  const [rolePhase, setRolePhase] = useState<RolePhase>("in_possession");
  const [selectedRoleId, setSelectedRoleId] = useState("deep_lying_playmaker");
  const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultPlayerColumns);
  const [savedViews, setSavedViews] = useState<SavedPlayerView[]>(loadSavedPlayerViews);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const shortlist = useMemo(() => new Set(shortlistDocument.entries.map((entry) => entry.player_id)), [shortlistDocument]);

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
  const selectedRole = roles.find((role) => role.id === selectedRoleId);
  const visibleColumnDefinitions = playerColumns.filter((column) => column.locked || visibleColumns.includes(column.id));
  const [filtered, setFiltered] = useState<PlayerQueryRow[]>(() => locallyRatedRows(demoPlayers, previewRoles[0]));
  const activeFilterCount = Number(u21Only) + Number(freeAgentsOnly) + Number(minPotential > 0) + Number(maxValueMillions > 0);
  const metricPlayers = (active === "Editor" || active === "Freezer" || active === "Verfügbarkeit" || active === "Transfers" || active === "People") && snapshot ? snapshot.players : players;

  useEffect(() => {
    let cancelled = false;
    setFiltered(locallyRatedRows(locallyFiltered, selectedRole));
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
          role_id: selectedRoleId,
          offset: 0,
          limit: 10_000,
        },
      }).then((result) => {
        if (!cancelled) setFiltered(result.rows);
      }).catch(() => undefined);
    }, 100);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [players, query, u21Only, freeAgentsOnly, minPotential, maxValueMillions, locallyFiltered, selectedRole, selectedRoleId]);

  useEffect(() => {
    let cancelled = false;
    invoke<RoleProfile[]>("list_roles")
      .then((catalog) => {
        if (!cancelled && catalog.length > 0) setRoles(catalog);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    persistSavedPlayerViews(savedViews);
  }, [savedViews]);

  useEffect(() => {
    persistShortlist(shortlistDocument);
  }, [shortlistDocument]);

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

  async function loadLiveData() {
    setIsDetecting(true);
    try {
      const environment = await invoke<LiveEnvironment>("detect_fm26");
      setLiveEnvironment(environment);
      if (!environment.reader_allowed) {
        setStatus(`${environment.message} · Domänen-Reader noch sicher gesperrt`);
        return;
      }
      const liveSnapshot = await invoke<DatabaseSnapshot>("load_live_snapshot");
      setSnapshot(liveSnapshot);
      setPlayers(liveSnapshot.players);
      setStatus(`${liveSnapshot.players.length.toLocaleString("de-DE")} Live-Spieler sicher übernommen`);
    } catch (error) {
      setStatus(`Live-Daten konnten nicht geladen werden: ${String(error)}`);
    } finally {
      setIsDetecting(false);
    }
  }

  function updateEditedSnapshot(edited: DatabaseSnapshot) {
    setSnapshot(edited);
    setPlayers(edited.players);
    setStatus(`Editor-Arbeitskopie · ${edited.players.length.toLocaleString("de-DE")} Spieler · Live-Schreiben ${liveEnvironment?.editor_allowed ? "freigegeben" : "gesperrt"}`);
  }

  function toggleShortlist(id: string) {
    setShortlistDocument((current) => {
      const existing = current.entries.some((entry) => entry.player_id === id);
      return {
        ...current,
        entries: existing
          ? current.entries.filter((entry) => entry.player_id !== id)
          : [...current.entries, { player_id: id, favorite: true, tags: [], note: null }],
      };
    });
  }

  function toggleComparison(id: string) {
    setComparison((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      return next;
    });
  }

  function changeRolePhase(phase: RolePhase) {
    setRolePhase(phase);
    const current = roles.find((role) => role.id === selectedRoleId);
    if (current?.phase !== phase) {
      const firstRole = roles.find((role) => role.phase === phase);
      if (firstRole) setSelectedRoleId(firstRole.id);
    }
  }

  function saveCurrentView(name: string) {
    const view = createSavedPlayerView(name, {
      roleId: selectedRoleId,
      rolePhase,
      visibleColumns,
      filters: { u21Only, freeAgentsOnly, minPotential, maxValueMillions },
    });
    setSavedViews((current) => [view, ...current].slice(0, 30));
    setActiveViewId(view.id);
  }

  function applySavedView(view: SavedPlayerView) {
    setSelectedRoleId(view.roleId);
    setRolePhase(view.rolePhase);
    setVisibleColumns(view.visibleColumns);
    setU21Only(view.filters.u21Only);
    setFreeAgentsOnly(view.filters.freeAgentsOnly);
    setMinPotential(view.filters.minPotential);
    setMaxValueMillions(view.filters.maxValueMillions);
    setActiveViewId(view.id);
  }

  function resetPlayerView() {
    setSelectedRoleId("deep_lying_playmaker");
    setRolePhase("in_possession");
    setVisibleColumns(defaultPlayerColumns);
    setU21Only(false);
    setFreeAgentsOnly(false);
    setMinPotential(0);
    setMaxValueMillions(0);
    setActiveViewId(null);
  }

  function deleteSavedView(viewId: string) {
    setSavedViews((current) => current.filter((view) => view.id !== viewId));
    if (activeViewId === viewId) setActiveViewId(null);
  }

  function renderPlayerCell(columnId: string, row: PlayerQueryRow) {
    const player = row.player;
    switch (columnId) {
      case "favorite":
        return <Button isIconOnly size="sm" variant="ghost" className={`star ${shortlist.has(player.id) ? "active" : ""}`} onPress={() => toggleShortlist(player.id)} aria-label={`Shortlist für ${player.name} umschalten`}><Star size={17} fill="currentColor" /></Button>;
      case "name":
        return <div className="player"><div className="avatar">{player.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div><div><strong>{player.name}</strong><span>{player.nationality ?? "–"}</span></div></div>;
      case "position": return <span className="position">{player.positions.join(" · ") || "–"}</span>;
      case "age": return player.age ?? "–";
      case "club": return player.club ?? "–";
      case "nationality": return player.nationality ?? "–";
      case "preferred_foot": return ({ left: "Links", right: "Rechts", both: "Beidfüßig", unknown: "–" } as const)[player.preferred_foot];
      case "value": return player.value ? money.format(player.value) : "–";
      case "wage": return player.wage ? `${money.format(player.wage)} / W.` : "–";
      case "current_ability": return <span className="ca">{player.current_ability ?? "?"}</span>;
      case "potential_ability": return <span className="potential">{player.potential_ability ?? "?"}</span>;
      case "role_score": {
        const rating = Math.round(row.role_score?.score ?? 0);
        return <div className="rating" title={`${row.role_score?.coverage ?? 0}% Datenabdeckung`}><span>{rating}</span><i><b style={{ width: `${rating}%` }} /></i><small>{Math.round(row.role_score?.coverage ?? 0)}%</small></div>;
      }
      case "id": return player.id;
      case "date_of_birth": return formatGameDate(player.details?.date_of_birth);
      case "reputation": return player.details?.reputation ?? "–";
      case "international_reputation": return player.details?.international_reputation ?? "–";
      case "consistency": return player.details?.consistency ?? "–";
      case "important_matches": return player.details?.important_matches ?? "–";
      case "injury_proneness": return player.details?.injury_proneness ?? "–";
      case "versatility": return player.details?.versatility ?? "–";
      case "professionalism": return player.details?.professionalism ?? "–";
      case "ambition": return player.details?.ambition ?? "–";
      case "contract_starts": return formatGameDate(player.details?.contract?.starts_on);
      case "contract_expires": return formatGameDate(player.details?.contract?.expires_on);
      case "contract_club_id": return player.details?.contract?.club_id ?? "–";
      case "contract_type": return player.details?.contract?.contract_type ?? "–";
      case "contract_wage": return player.details?.contract?.wage == null ? "–" : `${money.format(player.details.contract.wage)} / W.`;
      case "release_clause": return player.details?.contract?.release_clause == null ? "–" : money.format(player.details.contract.release_clause);
      case "squad_status": return player.details?.contract?.squad_status ?? "–";
      case "future_transfer_kind": return player.details?.future_transfer?.kind ?? "–";
      case "future_transfer_destination": return player.details?.future_transfer?.to_club_id ?? "–";
      case "future_transfer_date": return formatGameDate(player.details?.future_transfer?.effective_on);
      case "future_transfer_fee": return player.details?.future_transfer?.fee == null ? "–" : money.format(player.details.future_transfer.fee);
      case "future_transfer_status": return player.details?.future_transfer?.status ?? "–";
      case "player_status": return player.details?.status ? Object.entries(player.details.status).filter(([, active]) => active).map(([status]) => status).join(", ") || "Verfügbar" : "–";
      case "transfer_listed": return formatBoolean(player.details?.status?.transfer_listed);
      case "loan_listed": return formatBoolean(player.details?.status?.loan_listed);
      case "injured": return formatBoolean(player.details?.status?.injured);
      case "suspended": return formatBoolean(player.details?.status?.suspended);
      case "unavailable": return formatBoolean(player.details?.status?.unavailable);
      case "condition": return player.details?.fitness?.condition ?? "–";
      case "match_fitness": return player.details?.fitness?.match_fitness ?? "–";
      case "fatigue": return player.details?.fitness?.fatigue ?? "–";
      case "jadedness": return player.details?.fitness?.jadedness ?? "–";
      case "morale": return player.details?.morale ?? "–";
      case "happiness": return player.details?.happiness ?? "–";
      case "active_injuries": return player.details?.injuries?.map((injury) => injury.name).join(", ") || "–";
      case "active_bans": return player.details?.bans?.map((ban) => ban.reason).join(", ") || "–";
      case "tags": return player.details?.tags.join(", ") || "–";
      case "note": return player.details?.note ?? "–";
      case "languages": return player.details?.languages?.map((item) => item.language).join(", ") || "–";
      case "relationships": return player.details?.relationships?.length ?? 0;
      case "registrations": return player.details?.registrations?.map((item) => item.status).join(", ") || "–";
      default: {
        const attribute = columnId.startsWith("attribute:") ? columnId.slice("attribute:".length) : "";
        const value = player.attributes[attribute];
        return typeof value === "number" ? <span className={`attribute-value level-${Math.min(4, Math.floor(value / 5))}`}>{value}</span> : "–";
      }
    }
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
              {label === "Vergleich" && comparison.size > 0 && <span className="nav-count">{comparison.size}</span>}
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
            <Button isDisabled={isDetecting} onPress={loadLiveData}>{isDetecting ? <RefreshCw className="spin" size={16} /> : <Database size={16} />} {isDetecting ? "Live-Daten werden geprüft …" : "Live-Daten laden"}</Button>
          </div>
        </header>

        <section className="metrics" aria-label="Datenübersicht">
          <Metric label="Spieler im Datensatz" value={metricPlayers.length.toLocaleString("de-DE")} detail={active === "Editor" || active === "Freezer" || active === "Verfügbarkeit" || active === "Transfers" || active === "People" ? "Editor-Arbeitskopie" : "Aktueller Import"} />
          <Metric label="U21-Talente" value={metricPlayers.filter((p) => (p.age ?? 99) <= 21).length.toString()} detail="Potenzialanalyse" accent />
          <Metric label="Auf Shortlist" value={shortlist.size.toString()} detail="Lokale Auswahl" />
          <Metric label="Datenabdeckung" value={`${Math.round(metricPlayers.reduce((sum, p) => sum + Object.keys(p.attributes).length, 0) / Math.max(metricPlayers.length, 1) / totalPlayerAttributes * 100)}%`} detail="47 FM26-Attribute" />
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
        ) : active === "Scout-Intel" ? (
          <IntelligenceWorkspace players={players} snapshot={snapshot} />
        ) : active === "Datenbank" ? (
          <DatabaseWorkspace players={players} snapshot={snapshot} />
        ) : active === "Kaderanalyse" ? (
          <SquadAnalysisWorkspace players={players} />
        ) : active === "Verfügbarkeit" ? (
          <AvailabilityWorkspace snapshot={snapshot} onSnapshotChange={updateEditedSnapshot} liveWriteEnabled={liveEnvironment?.editor_allowed ?? false} />
        ) : active === "Transfers" ? (
          <TransferWorkspace snapshot={snapshot} onSnapshotChange={updateEditedSnapshot} liveWriteEnabled={liveEnvironment?.editor_allowed ?? false} />
        ) : active === "People" ? (
          <PeopleWorkspace snapshot={snapshot} onSnapshotChange={updateEditedSnapshot} liveWriteEnabled={liveEnvironment?.editor_allowed ?? false} />
        ) : active === "Editor" ? (
          <EditorWorkspace snapshot={snapshot} onSnapshotChange={updateEditedSnapshot} liveWriteEnabled={liveEnvironment?.editor_allowed ?? false} />
        ) : active === "Freezer" ? (
          <FreezerWorkspace snapshot={snapshot} onSnapshotChange={updateEditedSnapshot} liveWriteEnabled={liveEnvironment?.editor_allowed ?? false} />
        ) : active === "Shortlist" ? (
          <ShortlistWorkspace players={players} document={shortlistDocument} onChange={setShortlistDocument} />
        ) : (
        <>
        <RoleExplorer
          roles={roles}
          selectedRoleId={selectedRoleId}
          phase={rolePhase}
          onPhaseChange={changeRolePhase}
          onRoleChange={setSelectedRoleId}
        />
        {active === "Vergleich" ? (
          <ComparisonWorkspace players={players} role={selectedRole} selectedIds={comparison} onToggle={toggleComparison} />
        ) : (
        <>
        <ViewToolbar
          savedViews={savedViews}
          activeViewId={activeViewId}
          visibleColumns={visibleColumns}
          onApply={applySavedView}
          onDelete={deleteSavedView}
          onReset={resetPlayerView}
          onSave={saveCurrentView}
          onVisibleColumnsChange={setVisibleColumns}
        />
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
            <Table key={visibleColumnDefinitions.map((column) => column.id).join("|")} variant="secondary" className="player-table">
              <Table.ScrollContainer>
                <Table.Content aria-label="Spielerliste">
                  <Table.Header>
                    {visibleColumnDefinitions.map((column) => <Table.Column key={column.id} id={column.id} isRowHeader={column.id === "name"} aria-label={column.id === "favorite" ? column.label : undefined}>{column.id === "favorite" ? null : column.label.toLocaleUpperCase("de")}</Table.Column>)}
                  </Table.Header>
                  <Table.Body items={filtered} renderEmptyState={() => <div className="empty">Keine passenden Spieler gefunden.</div>}>
                    {(row) => {
                      const player = row.player;
                      return (
                        <Table.Row id={player.id} key={player.id}>
                          {visibleColumnDefinitions.map((column) => <Table.Cell key={column.id}>{renderPlayerCell(column.id, row)}</Table.Cell>)}
                        </Table.Row>
                      );
                    }}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </Card.Content>
          <Card.Footer className="table-footer"><span>{filtered.length} von {players.length} Spielern</span><span>Rollenprofil: {selectedRole?.name ?? "–"} · {rolePhase === "in_possession" ? "Mit Ball" : "Gegen den Ball"}</span></Card.Footer>
        </Card>
        </>
        )}
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
    game_date: { year: 2026, month: 7, day: 22 },
    players,
    staff: [{
      id: "staff-lina", name: "Lina Taktik", age: 41, club: "SV Nordhafen", nationality: "Österreich",
      roles: ["assistant_manager", "coach"], current_ability: 145, potential_ability: 155, reputation: 5100,
      attributes: { tactical_knowledge: 17, motivating: 16, man_management: 15 },
      contract: { club_id: "club-nordhafen", expires_on: { year: 2028, month: 6, day: 30 }, contract_type: "full_time", wage: 12_000 },
    }],
    clubs: [{
      id: "club-nordhafen", name: "Sportverein Nordhafen", short_name: "SV Nordhafen", nation: "Deutschland",
      competition: "Nordliga", reputation: 4800, professional_status: "professional", stadium: "Hafenpark",
      stadium_capacity: 24_500, average_attendance: 19_300,
      finances: { balance: 18_000_000, transfer_budget: 6_500_000, wage_budget: 450_000, debt: 2_000_000 },
      facilities: { training: 15, youth: 16, youth_recruitment: 14, junior_coaching: 15 },
    }, {
      id: "club-suedstadt", name: "Fußballclub Südstadt", short_name: "FC Südstadt", nation: "Deutschland",
      competition: "Nordliga", reputation: 4200, professional_status: "professional", stadium: "Südstadt-Arena",
      stadium_capacity: 18_500, average_attendance: 13_800,
      finances: { balance: 11_000_000, transfer_budget: 4_000_000, wage_budget: 320_000, debt: 1_000_000 },
      facilities: { training: 13, youth: 12, youth_recruitment: 11, junior_coaching: 12 },
    }],
    competitions: [{
      id: "competition-nordliga", name: "Nordliga", short_name: "NL", nation: "Deutschland",
      reputation: 6000, current_champion: "SV Nordhafen", level: 1,
    }],
  };
}

function formatGameDate(date: GameDate | null | undefined) {
  return date ? `${String(date.day).padStart(2, "0")}.${String(date.month).padStart(2, "0")}.${date.year}` : "–";
}

function formatBoolean(value: boolean | null | undefined) {
  return value == null ? "–" : value ? "Ja" : "Nein";
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

export function LiveWorkspace({ environment, isDetecting, onDetect }: { environment: LiveEnvironment | null; isDetecting: boolean; onDetect: () => void }) {
  const installation = environment?.installations[0];
  const compatibility = installation?.compatibility;
  const fingerprint = installation?.build_fingerprint;
  const access = environment?.process_access;
  const domainRoots = environment?.bridge?.domain_roots;
  const flatpak = environment?.runtime_sandbox === "flatpak";

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
        <Capability title="Read-only Probe" enabled={access?.executable_signature_valid ?? false} detail={flatpak ? "Host-Prozesse sind in Flatpak nicht sichtbar" : access ? `PID ${access.inspection.pid} · MZ-Signatur bestätigt` : environment?.process_access_error ?? "Kein lesbarer FM26-Spielprozess"} />
        <Capability title="In-Game Bridge" enabled={environment?.bridge?.health.read_only ?? false} detail={flatpak ? "AppImage, DEB oder RPM für Live-Zugriff verwenden" : bridgeDetail(environment)} />
        <Capability title="Domain-Roots" enabled={domainRoots?.state === "roots_resolved"} detail={flatpak ? "Im Flatpak-Offlinepaket deaktiviert" : domainRootDetail(domainRoots)} />
        <Capability title="Domänendaten" enabled={environment?.reader_allowed ?? false} detail={flatpak ? "CSV- und lokale Datenanalyse bleiben verfügbar" : "Spieler-, Vereins- und Staff-Layout noch gesperrt"} />
        <Capability title="Editor" enabled={environment?.editor_allowed ?? false} detail={flatpak ? "Nur sichere lokale Arbeitskopien" : "Schreiben erst nach validierten Feldprofilen"} locked />
      </section>

      <Card className="build-card">
        <Card.Header>
          <div><Card.Title>Kompatibilitätsnachweis</Card.Title><Card.Description>Drei Artefakte müssen für ein exaktes Profil übereinstimmen.</Card.Description></div>
          <span className={`profile-state ${compatibility?.status === "exact" ? "exact" : ""}`}>{compatibility?.status === "exact" ? "EXAKTER TREFFER" : "NICHT VERIFIZIERT"}</span>
        </Card.Header>
        <Card.Content>
          <BuildRow label="Steam Build" value={installation?.steam_build_id ?? "–"} />
          <BuildRow label="Spielprozess" value={access ? `PID ${access.inspection.pid} · ${access.inspection.readable_region_count}/${access.inspection.region_count} Bereiche lesbar` : "–"} />
          <BuildRow label="fm.exe Basis" value={formatAddress(access?.inspection.fm_executable_base)} />
          <BuildRow label="GameAssembly Basis" value={formatAddress(access?.inspection.game_assembly_base)} />
          <BuildRow label="fm.exe" value={fingerprint?.executable.sha256 ?? "–"} />
          <BuildRow label="GameAssembly.dll" value={fingerprint?.game_assembly.sha256 ?? "–"} />
          <BuildRow label="global-metadata.dat" value={fingerprint?.global_metadata.sha256 ?? "–"} />
        </Card.Content>
      </Card>
    </div>
  );
}

function formatAddress(address: number | null | undefined) {
  return typeof address === "number" ? `0x${address.toString(16)}` : "–";
}

function domainRootDetail(roots: NonNullable<NonNullable<LiveEnvironment["bridge"]>["domain_roots"]> | undefined) {
  if (!roots) return "Probe wird nach FM26-Neustart verfügbar";
  if (roots.state === "roots_resolved") return `${roots.interop_subsystem_count} Interop-Root · Referenzen verifiziert`;
  if (roots.state === "probe_failed") return roots.error ?? "Domain-Probe fehlgeschlagen";
  return roots.initialisation_complete ? "Warte auf Interop-Subsystem" : "Warte auf vollständige Spielinitialisierung";
}

function bridgeDetail(environment: LiveEnvironment | null) {
  if (environment?.bridge) return `Bridge ${environment.bridge.health.bridge_version} · PID ${environment.bridge.health.pid}`;
  const deployment = environment?.bridge_deployment;
  if (!deployment) return "Installationsstatus noch nicht geprüft";
  if (deployment.state === "managed") {
    const nextStep = environment?.processes.length ? "keine Verbindung" : "FM26 starten";
    return `Bridge ${deployment.manifest?.bridge_version ?? "?"} installiert · ${nextStep}`;
  }
  if (deployment.state === "not_installed") return "Noch nicht in FM26 installiert";
  return "Installation verändert oder unvollständig";
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
