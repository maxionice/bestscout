import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Card, Input, TextField } from "@heroui/react";
import { invoke } from "@tauri-apps/api/core";
import {
  Activity, AlertTriangle, BadgeCheck, Ban, Check, ChevronRight, ClipboardCheck,
  HeartPulse, Search, ShieldCheck, Sparkles, Stethoscope, Thermometer, Users,
} from "lucide-react";

import type {
  AppliedTransaction, AvailabilityAction, AvailabilityActionRequest, AvailabilityCriteria,
  AvailabilityReport, AvailabilityState, DatabaseSnapshot, GameDate, PlayerAvailability,
  PreparedAvailabilityAction,
} from "./types";

export type AvailabilityGateway = {
  analyse: (snapshot: DatabaseSnapshot, criteria: AvailabilityCriteria) => Promise<AvailabilityReport>;
  prepare: (snapshot: DatabaseSnapshot, request: AvailabilityActionRequest) => Promise<PreparedAvailabilityAction>;
  apply: (
    journalId: string,
    snapshot: DatabaseSnapshot,
    transaction: PreparedAvailabilityAction["transaction"],
  ) => Promise<AppliedTransaction>;
};

const tauriGateway: AvailabilityGateway = {
  analyse: (snapshot, criteria) => invoke("analyse_player_availability", { snapshot, criteria }),
  prepare: (snapshot, request) => invoke("prepare_availability_action", { snapshot, request }),
  apply: (journalId, snapshot, transaction) => invoke("apply_snapshot_transaction", {
    journalId, snapshot, transaction,
  }),
};

const actions: Array<{ id: AvailabilityAction; label: string; detail: string; icon: typeof Activity }> = [
  { id: "restore_condition", label: "Fitness auffüllen", detail: "Kondition und Matchfitness 100, Belastung 0", icon: Activity },
  { id: "clear_injuries", label: "Verletzungen heilen", detail: "Verletzungsliste und Verletztenstatus leeren", icon: Stethoscope },
  { id: "clear_bans", label: "Sperren aufheben", detail: "Sperren und Suspendierungsstatus leeren", icon: Ban },
  { id: "stabilize_morale", label: "Moral stabilisieren", detail: "Moral und Zufriedenheit auf 20", icon: BadgeCheck },
  { id: "make_match_ready", label: "Komplett spielfit", detail: "Alle medizinischen und Statuswerte korrigieren", icon: Sparkles },
];

const stateOptions: Array<{ id: "all" | AvailabilityState; label: string }> = [
  { id: "all", label: "Alle" },
  { id: "unavailable", label: "Nicht verfügbar" },
  { id: "doubtful", label: "Fraglich" },
  { id: "managed", label: "Steuern" },
  { id: "available", label: "Bereit" },
];

export function AvailabilityWorkspace({
  snapshot,
  onSnapshotChange,
  liveWriteEnabled = false,
  gateway = tauriGateway,
}: {
  snapshot: DatabaseSnapshot | null;
  onSnapshotChange: (snapshot: DatabaseSnapshot) => void;
  liveWriteEnabled?: boolean;
  gateway?: AvailabilityGateway;
}) {
  const [report, setReport] = useState<AvailabilityReport | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<"all" | AvailabilityState>("all");
  const [action, setAction] = useState<AvailabilityAction>("make_match_ready");
  const [prepared, setPrepared] = useState<PreparedAvailabilityAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Kader wird anhand des kanonischen Snapshots geprüft …");
  const [error, setError] = useState("");

  const asOf = snapshot?.game_date ?? fallbackDate();
  const criteria = useMemo<AvailabilityCriteria>(() => ({
    as_of: asOf,
    low_condition_below: 80,
    low_match_fitness_below: 75,
    high_fatigue_above: 65,
    high_jadedness_above: 60,
    low_morale_below: 8,
    low_happiness_below: 8,
  }), [asOf.year, asOf.month, asOf.day]);

  useEffect(() => {
    if (!snapshot) {
      setReport(null);
      setMessage("Kein kanonischer Snapshot geladen");
      return;
    }
    let cancelled = false;
    setBusy(true);
    setError("");
    gateway.analyse(snapshot, criteria)
      .then((result) => {
        if (cancelled) return;
        setReport(result);
        setFocusedId((current) => result.players.some((player) => player.player_id === current)
          ? current
          : result.players[0]?.player_id ?? null);
        setSelectedIds((current) => new Set([...current].filter((id) => result.players.some((player) => player.player_id === id))));
        setPrepared(null);
        setMessage(`${result.total_players.toLocaleString("de-DE")} Spieler vollständig analysiert`);
      })
      .catch((reason) => {
        if (!cancelled) setError(`Analyse fehlgeschlagen: ${String(reason)}`);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => { cancelled = true; };
  }, [snapshot, criteria, gateway]);

  const filteredPlayers = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("de");
    return (report?.players ?? []).filter((player) =>
      (stateFilter === "all" || player.state === stateFilter)
      && (!needle || [player.player_name, player.club, ...player.issues.map((issue) => issue.detail)]
        .some((value) => value?.toLocaleLowerCase("de").includes(needle))));
  }, [query, report, stateFilter]);
  const focused = report?.players.find((player) => player.player_id === focusedId) ?? filteredPlayers[0] ?? null;

  function toggleSelection(playerId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
    setPrepared(null);
    setError("");
  }

  function selectAction(next: AvailabilityAction) {
    setAction(next);
    setPrepared(null);
    setError("");
  }

  async function prepareAction() {
    if (!snapshot || selectedIds.size === 0) {
      setError("Mindestens einen Spieler explizit auswählen");
      return;
    }
    setBusy(true);
    setError("");
    setPrepared(null);
    try {
      const result = await gateway.prepare(snapshot, {
        transaction_id: newId("availability"),
        created_at_utc: new Date().toISOString(),
        player_ids: [...selectedIds],
        action,
      });
      setPrepared(result);
      setMessage(`${result.transaction.operations.length} Änderungen für ${result.affected_player_count} Spieler konfliktgeprüft`);
    } catch (reason) {
      setError(`Vorschau fehlgeschlagen: ${String(reason)}`);
    } finally {
      setBusy(false);
    }
  }

  async function commitAction() {
    if (!snapshot || !prepared) return;
    setBusy(true);
    setError("");
    try {
      const result = await gateway.apply(
        `availability-${snapshot.source}-workspace-v1`,
        snapshot,
        prepared.transaction,
      );
      onSnapshotChange(result.snapshot);
      setPrepared(null);
      setSelectedIds(new Set());
      setMessage(`${result.journal_entry.changes.length} Änderungen mit Backup und Journal übernommen`);
    } catch (reason) {
      setError(`Übernahme fehlgeschlagen: ${String(reason)}`);
    } finally {
      setBusy(false);
    }
  }

  if (!snapshot) {
    return <Card className="availability-empty"><Card.Content><HeartPulse size={30} /><strong>Kein Snapshot geladen</strong><span>Für die Verfügbarkeitsanalyse werden kanonische Spielerdaten benötigt.</span></Card.Content></Card>;
  }

  return (
    <div className="availability-workspace">
      <Card className="availability-hero">
        <Card.Header>
          <div className="availability-heading">
            <span><HeartPulse size={21} /></span>
            <div>
              <span className="eyebrow">MEDIZIN · FITNESS · MORAL · SPERREN</span>
              <Card.Title>Player Availability Center</Card.Title>
              <Card.Description>Kaderstatus analysieren und Korrekturen sicher als Transaktion vorbereiten.</Card.Description>
            </div>
          </div>
          <div className="availability-safety">
            <ShieldCheck size={18} />
            <div><strong>{liveWriteEnabled ? "Live-Profil bereit" : "Sichere Arbeitskopie"}</strong><span>Vorschau · Backup · Journal · Undo</span></div>
          </div>
        </Card.Header>
        <Card.Content>
          <span>SPIELTAG {formatGameDate(asOf)}</span>
          <span className={error ? "error" : ""}>{error || message}</span>
        </Card.Content>
      </Card>

      <section className="availability-metrics" aria-label="Verfügbarkeitsübersicht">
        <AvailabilityMetric label="Bereit" value={report?.available_count ?? 0} state="available" />
        <AvailabilityMetric label="Steuern" value={report?.managed_count ?? 0} state="managed" />
        <AvailabilityMetric label="Fraglich" value={report?.doubtful_count ?? 0} state="doubtful" />
        <AvailabilityMetric label="Nicht verfügbar" value={report?.unavailable_count ?? 0} state="unavailable" />
      </section>

      <div className="availability-layout">
        <Card className="availability-roster-card">
          <Card.Header>
            <div><Card.Title>Kader-Triage</Card.Title><Card.Description>{filteredPlayers.length} Treffer · {selectedIds.size} ausgewählt</Card.Description></div>
            <Users size={17} />
          </Card.Header>
          <Card.Content>
            <TextField aria-label="Verfügbarkeit durchsuchen" value={query} onChange={setQuery}>
              <Search className="search-icon" size={14} /><Input placeholder="Spieler, Verein oder Befund …" />
            </TextField>
            <div className="availability-filters" role="group" aria-label="Status filtern">
              {stateOptions.map((option) => <Button key={option.id} size="sm" variant={stateFilter === option.id ? "primary" : "ghost"} onPress={() => setStateFilter(option.id)}>{option.label}</Button>)}
            </div>
            <div className="availability-roster">
              {filteredPlayers.map((player) => (
                <div key={player.player_id} className={`availability-player-row ${focused?.player_id === player.player_id ? "focused" : ""}`}>
                  <Button
                    isIconOnly
                    size="sm"
                    variant={selectedIds.has(player.player_id) ? "primary" : "secondary"}
                    aria-label={`${player.player_name} auswählen`}
                    aria-pressed={selectedIds.has(player.player_id)}
                    onPress={() => toggleSelection(player.player_id)}
                  >{selectedIds.has(player.player_id) ? <Check size={13} /> : <span />}</Button>
                  <button type="button" onClick={() => setFocusedId(player.player_id)}>
                    <span className={`availability-dot ${player.state}`} />
                    <span><strong>{player.player_name}</strong><small>{player.club ?? "Vereinslos"} · {stateLabel(player.state)}</small></span>
                    <b>{player.score}</b><ChevronRight size={13} />
                  </button>
                </div>
              ))}
              {!busy && filteredPlayers.length === 0 && <div className="availability-list-empty">Keine passenden Spieler.</div>}
            </div>
          </Card.Content>
        </Card>

        <Card className="availability-detail-card">
          <Card.Header>
            {focused ? <div className="availability-profile"><span>{initials(focused.player_name)}</span><div><Card.Title>{focused.player_name}</Card.Title><Card.Description>{focused.club ?? "Vereinslos"} · Score {focused.score}/100</Card.Description></div></div> : <div><Card.Title>Spielerprofil</Card.Title><Card.Description>Spieler aus der Triage öffnen</Card.Description></div>}
            {focused && <span className={`availability-state ${focused.state}`}>{stateLabel(focused.state)}</span>}
          </Card.Header>
          <Card.Content>
            {focused ? <>
              <div className="availability-vitals">
                <Vital label="Kondition" value={focused.condition} maximum={100} />
                <Vital label="Matchfitness" value={focused.match_fitness} maximum={100} />
                <Vital label="Ermüdung" value={focused.fatigue} maximum={100} danger />
                <Vital label="Überspieltheit" value={focused.jadedness} maximum={100} danger />
                <Vital label="Moral" value={focused.morale} maximum={20} />
                <Vital label="Zufriedenheit" value={focused.happiness} maximum={20} />
              </div>
              <div className="availability-findings">
                <FindingSection title="Aktive Verletzungen" icon={Stethoscope} empty="Keine aktive Verletzung">
                  {focused.active_injuries.map((injury) => <div key={injury.id}><strong>{injury.name}</strong><span>{severityLabel(injury.severity)} · {injury.days_remaining == null ? "Dauer offen" : `${injury.days_remaining} Tage`} · {injury.treatment}</span></div>)}
                </FindingSection>
                <FindingSection title="Aktive Sperren" icon={Ban} empty="Keine aktive Sperre">
                  {focused.active_bans.map((ban) => <div key={ban.id}><strong>{ban.reason}</strong><span>{ban.scope} · {ban.matches_remaining == null ? "Dauer offen" : `${ban.matches_remaining} Spiele`}</span></div>)}
                </FindingSection>
              </div>
              <div className="availability-issues">
                <div><AlertTriangle size={14} /><strong>Bewertungsbelege</strong><span>{focused.issues.length}</span></div>
                {focused.issues.length > 0
                  ? focused.issues.map((issue, index) => <p key={`${issue.kind}-${index}`}><span className={`availability-dot ${issue.impact}`} /><strong>{issueLabel(issue.kind)}</strong><small>{issue.detail}</small></p>)
                  : <p className="positive"><Check size={12} /><strong>Keine Einschränkung erkannt</strong></p>}
              </div>
            </> : <div className="availability-detail-empty"><Thermometer size={28} /><span>Spielerprofil auswählen</span></div>}
          </Card.Content>
        </Card>

        <Card className="availability-action-card">
          <Card.Header><div><Card.Title>Sichere Aktion</Card.Title><Card.Description>Nur explizit ausgewählte Spieler</Card.Description></div><ClipboardCheck size={17} /></Card.Header>
          <Card.Content>
            <div className="availability-actions">
              {actions.map((item) => {
                const Icon = item.icon;
                return <Button key={item.id} variant={action === item.id ? "primary" : "secondary"} onPress={() => selectAction(item.id)}><Icon size={14} /><span><strong>{item.label}</strong><small>{item.detail}</small></span></Button>;
              })}
            </div>
            <div className="availability-selection-proof">
              <Users size={15} /><div><strong>{selectedIds.size} Spieler als Ziel bestätigt</strong><span>Keine automatische Auswahl und keine direkte Live-Mutation</span></div>
            </div>
            <Button className="w-full" isDisabled={busy || selectedIds.size === 0} onPress={prepareAction}><ShieldCheck size={15} /> {busy ? "Prüfe …" : "Änderungsvorschau erstellen"}</Button>
            {prepared && <div className="availability-preview">
              <div><Check size={15} /><span><strong>Vorschau konfliktfrei</strong><small>{prepared.transaction.operations.length} Felder · {prepared.affected_player_count} Spieler</small></span></div>
              <code>{prepared.transaction.id}</code>
              <Button className="w-full" onPress={commitAction} isDisabled={busy}><ClipboardCheck size={15} /> Mit Backup & Journal anwenden</Button>
            </div>}
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}

function AvailabilityMetric({ label, value, state }: { label: string; value: number; state: AvailabilityState }) {
  return <Card className={`availability-metric ${state}`}><Card.Content><span className={`availability-dot ${state}`} /><div><span>{label}</span><strong>{value.toLocaleString("de-DE")}</strong></div></Card.Content></Card>;
}

function Vital({ label, value, maximum, danger = false }: { label: string; value: number | null; maximum: number; danger?: boolean }) {
  const percentage = value == null ? 0 : Math.min(100, Math.max(0, value / maximum * 100));
  return <div className={danger ? "danger" : ""}><span>{label}</span><strong>{value ?? "–"}<small>{value == null ? "" : `/${maximum}`}</small></strong><i><b style={{ width: `${percentage}%` }} /></i></div>;
}

function FindingSection({ title, icon: Icon, empty, children }: { title: string; icon: typeof Activity; empty: string; children: ReactNode }) {
  const entries = Array.isArray(children) ? children : [children];
  return <section><header><Icon size={13} /><strong>{title}</strong></header>{entries.length > 0 ? entries : <p>{empty}</p>}</section>;
}

function fallbackDate(): GameDate {
  const today = new Date();
  return { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1, day: today.getUTCDate() };
}

function formatGameDate(date: GameDate) {
  return `${String(date.day).padStart(2, "0")}.${String(date.month).padStart(2, "0")}.${date.year}`;
}

function initials(name: string) { return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toLocaleUpperCase("de"); }
function newId(prefix: string) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }

function stateLabel(state: AvailabilityState) {
  return { available: "Bereit", managed: "Belastung steuern", doubtful: "Fraglich", unavailable: "Nicht verfügbar" }[state];
}

function issueLabel(kind: PlayerAvailability["issues"][number]["kind"]) {
  return {
    injury: "Verletzung", ban: "Sperre", unavailable_flag: "Statussperre", low_condition: "Kondition",
    low_match_fitness: "Matchfitness", high_fatigue: "Ermüdung", high_jadedness: "Überspieltheit",
    low_morale: "Niedrige Moral", unhappy: "Unzufriedenheit",
  }[kind];
}

function severityLabel(severity: PlayerAvailability["active_injuries"][number]["severity"]) {
  return { minor: "Leicht", moderate: "Mittel", serious: "Ernst", severe: "Schwer", career_threatening: "Karrieregefährdend", unknown: "Unbekannt" }[severity];
}
