import { useEffect, useMemo, useState } from "react";
import { Button, Card, Input, NumberField, TextField } from "@heroui/react";
import { invoke } from "@tauri-apps/api/core";
import {
  BadgeEuro, BrainCircuit, CalendarClock, ChartNoAxesCombined, ChevronRight,
  CircleDollarSign, RefreshCw, Search, ShieldCheck, Sparkles, Target, UserRoundX,
} from "lucide-react";

import type {
  DatabaseSnapshot, GameDate, IntelligenceCriteria, Player, PlayerIntelligence,
  ScoutIntelligenceReport,
} from "./types";
import { playerColumns } from "./view-preferences";

type SmartList = "wonderkids" | "bargains" | "free_agents" | "expiring";

export type IntelligenceGateway = {
  analyse: (snapshot: DatabaseSnapshot, criteria: IntelligenceCriteria) => Promise<ScoutIntelligenceReport>;
};

const tauriGateway: IntelligenceGateway = {
  analyse: (snapshot, criteria) => invoke("analyse_scout_intelligence", { snapshot, criteria }),
};

const lists: Array<{ id: SmartList; label: string; icon: typeof Sparkles; description: string }> = [
  { id: "wonderkids", label: "Wonderkids", icon: Sparkles, description: "Jung und außergewöhnliches PA" },
  { id: "bargains", label: "Schnäppchen", icon: BadgeEuro, description: "Projizierte Spitze pro Marktwert" },
  { id: "free_agents", label: "Vereinslos", icon: UserRoundX, description: "Ohne Verein und Vertragsbindung" },
  { id: "expiring", label: "Verträge laufen aus", icon: CalendarClock, description: "Im gewählten Zeitfenster" },
];

const money = new Intl.NumberFormat("de-DE", {
  notation: "compact", style: "currency", currency: "EUR", maximumFractionDigits: 1,
});
const attributeLabels = new Map(playerColumns.filter((column) => column.attribute).map((column) => [column.attribute!, column.label]));

export function IntelligenceWorkspace({
  players, snapshot, gateway = tauriGateway,
}: {
  players: Player[];
  snapshot: DatabaseSnapshot | null;
  gateway?: IntelligenceGateway;
}) {
  const [activeList, setActiveList] = useState<SmartList>("wonderkids");
  const [asOf, setAsOf] = useState(todayInputValue);
  const [minimumPotential, setMinimumPotential] = useState(150);
  const [maximumValueMillions, setMaximumValueMillions] = useState(20);
  const [expiryDays, setExpiryDays] = useState(365);
  const [report, setReport] = useState<ScoutIntelligenceReport | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Scouting-Engine wird vorbereitet …");
  const [isLoading, setIsLoading] = useState(false);

  const workingSnapshot = useMemo<DatabaseSnapshot | null>(() => snapshot ? { ...snapshot, players } : null, [players, snapshot]);
  const criteria = useMemo<IntelligenceCriteria>(() => ({
    as_of: parseDate(asOf) ?? todayGameDate(),
    wonderkid_max_age: 21,
    wonderkid_min_potential: minimumPotential,
    bargain_max_value: maximumValueMillions * 1_000_000,
    bargain_min_projected_peak: 145,
    expiring_within_days: expiryDays,
  }), [asOf, expiryDays, maximumValueMillions, minimumPotential]);

  useEffect(() => {
    if (!workingSnapshot) return;
    let cancelled = false;
    setIsLoading(true);
    const timer = window.setTimeout(() => {
      gateway.analyse(workingSnapshot, criteria)
        .then((result) => {
          if (!cancelled) {
            setReport(result);
            setStatus(`${result.players.length} Spieler mit erklärbarer Projektion analysiert`);
          }
        })
        .catch((error) => {
          if (!cancelled) setStatus(`Analyse nicht verfügbar: ${String(error)}`);
        })
        .finally(() => { if (!cancelled) setIsLoading(false); });
    }, 120);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [criteria, gateway, workingSnapshot]);

  const rows = useMemo(() => {
    if (!report) return [];
    const needle = normalize(query);
    const matches = report.players.filter((row) => categoryMatches(row, activeList)
      && (!needle || normalize(`${row.player.name} ${row.player.club ?? ""} ${row.player.nationality ?? ""} ${row.player.positions.join(" ")}`).includes(needle)));
    if (activeList === "expiring") {
      matches.sort((left, right) => (left.contract_days_remaining ?? Number.MAX_SAFE_INTEGER) - (right.contract_days_remaining ?? Number.MAX_SAFE_INTEGER));
    } else if (activeList === "bargains") {
      matches.sort((left, right) => (right.bargain_score ?? 0) - (left.bargain_score ?? 0));
    }
    return matches;
  }, [activeList, query, report]);

  useEffect(() => {
    if (!rows.some((row) => row.player.id === selectedPlayerId)) setSelectedPlayerId(rows[0]?.player.id ?? "");
  }, [rows, selectedPlayerId]);

  const selected = rows.find((row) => row.player.id === selectedPlayerId) ?? null;
  const counts = report ? {
    wonderkids: report.wonderkid_count,
    bargains: report.bargain_count,
    free_agents: report.free_agent_count,
    expiring: report.expiring_contract_count,
  } : { wonderkids: 0, bargains: 0, free_agents: 0, expiring: 0 };

  return (
    <div className="intelligence-workspace">
      <Card className="intelligence-hero">
        <Card.Header>
          <div className="intelligence-heading"><span className="intelligence-icon"><BrainCircuit size={22} /></span><div><span className="eyebrow">ERKLÄRBARE SCOUT-INTELLIGENCE</span><Card.Title>Talent-Radar</Card.Title><Card.Description>Entwicklungschance, projizierte Spitze und sofort nutzbare Smart Lists.</Card.Description></div></div>
          <span className="engine-badge"><ShieldCheck size={13} /> EIGENE OFFENE FORMEL</span>
        </Card.Header>
        <Card.Content className="intelligence-controls">
          <label className="intelligence-control"><span>Stichtag</span><TextField aria-label="Analyse-Stichtag" value={asOf} onChange={setAsOf}><Input type="date" /></TextField></label>
          <label className="intelligence-control"><span>Wonderkid · Mindest-PA</span><NumberField value={minimumPotential} minValue={100} maxValue={200} onChange={setMinimumPotential} aria-label="Wonderkid Mindestpotenzial"><NumberField.Group><NumberField.Input /><NumberField.DecrementButton aria-label="Mindestpotenzial verringern">−</NumberField.DecrementButton><NumberField.IncrementButton aria-label="Mindestpotenzial erhöhen">+</NumberField.IncrementButton></NumberField.Group></NumberField></label>
          <label className="intelligence-control"><span>Schnäppchen · max. Mio. €</span><NumberField value={maximumValueMillions} minValue={0} maxValue={1000} onChange={setMaximumValueMillions} aria-label="Maximaler Schnäppchen-Marktwert"><NumberField.Group><NumberField.Input /><NumberField.DecrementButton aria-label="Marktwert verringern">−</NumberField.DecrementButton><NumberField.IncrementButton aria-label="Marktwert erhöhen">+</NumberField.IncrementButton></NumberField.Group></NumberField></label>
          <label className="intelligence-control"><span>Vertragsfenster · Tage</span><NumberField value={expiryDays} minValue={1} maxValue={1095} onChange={setExpiryDays} aria-label="Vertragsfenster in Tagen"><NumberField.Group><NumberField.Input /><NumberField.DecrementButton aria-label="Vertragsfenster verkürzen">−</NumberField.DecrementButton><NumberField.IncrementButton aria-label="Vertragsfenster verlängern">+</NumberField.IncrementButton></NumberField.Group></NumberField></label>
          <div className="intelligence-status">{isLoading ? <RefreshCw size={13} className="spin" /> : <ChartNoAxesCombined size={13} />}<span>{status}</span></div>
        </Card.Content>
      </Card>

      <section className="smart-list-tabs" aria-label="Intelligente Scoutinglisten">
        {lists.map((list) => <Button key={list.id} variant={activeList === list.id ? "primary" : "secondary"} className="smart-list-tab" aria-pressed={activeList === list.id} onPress={() => setActiveList(list.id)}><span className="smart-list-icon"><list.icon size={15} /></span><span><strong>{list.label}</strong><small>{list.description}</small></span><b>{counts[list.id]}</b></Button>)}
      </section>

      <div className="intelligence-grid">
        <Card className="discovery-list-card">
          <Card.Header><div><Card.Title>{lists.find((list) => list.id === activeList)?.label}</Card.Title><Card.Description>{rows.length} passende Kandidaten</Card.Description></div><TextField aria-label="Scoutingliste durchsuchen" value={query} onChange={setQuery} className="intelligence-search"><Search size={14} className="search-icon" /><Input placeholder="Name, Verein, Position …" /></TextField></Card.Header>
          <Card.Content>
            {rows.length === 0 ? <div className="intelligence-empty"><Target size={22} /><strong>Keine Kandidaten</strong><span>Grenzwerte oder Stichtag anpassen.</span></div> : <div className="discovery-list">{rows.map((row) => <Button key={row.player.id} variant={selectedPlayerId === row.player.id ? "secondary" : "ghost"} className="discovery-row" aria-pressed={selectedPlayerId === row.player.id} onPress={() => setSelectedPlayerId(row.player.id)}><span className="discovery-avatar">{initials(row.player.name)}</span><span className="discovery-copy"><strong>{row.player.name}</strong><small>{[row.player.club ?? "Vereinslos", row.player.positions.join(" · ")].filter(Boolean).join(" · ")}</small></span><span className="discovery-metrics">{listMetric(row, activeList)}<small>{listMetricLabel(activeList)}</small></span><ChevronRight size={14} /></Button>)}</div>}
          </Card.Content>
        </Card>

        <Card className="projection-card">
          {selected ? <ProjectionDetail row={selected} /> : <Card.Content className="projection-empty"><BrainCircuit size={27} /><strong>Projektion auswählen</strong><span>Ein Kandidat zeigt hier Potenzial, Faktoren und Attributspitzen.</span></Card.Content>}
        </Card>
      </div>
    </div>
  );
}

function ProjectionDetail({ row }: { row: PlayerIntelligence }) {
  const projection = row.projection;
  const peaks = projection ? Object.entries(projection.attribute_peaks)
    .map(([attribute, peak]) => ({ attribute, peak, current: row.player.attributes[attribute] ?? 0, gain: peak - (row.player.attributes[attribute] ?? 0) }))
    .sort((left, right) => right.gain - left.gain || right.peak - left.peak)
    .slice(0, 10) : [];
  return <>
    <Card.Header className="projection-header"><div className="projection-player"><span>{initials(row.player.name)}</span><div><Card.Title>{row.player.name}</Card.Title><Card.Description>{[row.player.age != null ? `${row.player.age} Jahre` : null, row.player.nationality, row.player.positions.join(" · ")].filter(Boolean).join(" · ")}</Card.Description></div></div><div className="projection-tags">{row.is_wonderkid && <span>WONDERKID</span>}{row.is_bargain && <span>SCHNÄPPCHEN</span>}{row.is_free_agent && <span>VEREINSLOS</span>}</div></Card.Header>
    {projection ? <Card.Content>
      <div className="projection-score-grid">
        <ProjectionScore label="CA" value={row.player.current_ability ?? "–"} />
        <ProjectionScore label="PA" value={row.player.potential_ability ?? "–"} />
        <ProjectionScore label="Projizierte Spitze" value={projection.projected_peak_ability} accent />
        <ProjectionScore label="PA-Chance" value={`${Math.round(projection.reach_potential_probability)}%`} accent />
      </div>
      <div className="projection-proof"><div><span>Erwarteter Zugewinn</span><strong>+{projection.ability_gain} CA</strong></div><div><span>Zeit bis Spitze</span><strong>≈ {projection.years_to_peak} Jahre</strong></div><div><span>Datenkonfidenz</span><strong>{Math.round(projection.confidence)}%</strong></div><div><span>Marktwert</span><strong>{row.player.value == null ? "–" : money.format(row.player.value)}</strong></div></div>
      <section className="factor-section"><div className="section-heading"><div><strong>Einflussfaktoren</strong><span>Gewichtete, offen dokumentierte Projektion</span></div><CircleDollarSign size={16} /></div><div className="factor-list">{projection.factors.map((factor) => <div className={`factor-row ${factor.observed ? "" : "estimated"}`} key={factor.id}><div><strong>{factor.label}</strong><span>{factor.observed ? factor.explanation : "Daten fehlen · neutral mit 50% geschätzt"}</span></div><div className="factor-track"><i style={{ width: `${factor.score}%` }} /></div><b>{Math.round(factor.score)}</b><small>{Math.round(factor.weight)}% Gewicht</small></div>)}</div></section>
      <section className="peak-section"><div className="section-heading"><div><strong>Projizierte Attributspitzen</strong><span>Nur vorhandene Ausgangswerte · gedeckelt bei 20</span></div><Target size={16} /></div>{peaks.length ? <div className="peak-grid">{peaks.map((item) => <div key={item.attribute}><span>{attributeLabels.get(item.attribute) ?? humanize(item.attribute)}</span><strong>{item.current}<ChevronRight size={11} />{item.peak}</strong><small>+{item.gain}</small></div>)}</div> : <div className="peak-empty">Keine Attributwerte für eine Projektion vorhanden.</div>}</section>
    </Card.Content> : <Card.Content className="projection-empty"><Target size={24} /><strong>Zu wenig Daten</strong><span>CA, PA und Alter werden für eine belastbare Projektion benötigt.</span></Card.Content>}
  </>;
}

function ProjectionScore({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return <div className={accent ? "accent" : ""}><span>{label}</span><strong>{value}</strong></div>;
}

function categoryMatches(row: PlayerIntelligence, list: SmartList) {
  return list === "wonderkids" ? row.is_wonderkid
    : list === "bargains" ? row.is_bargain
      : list === "free_agents" ? row.is_free_agent
        : row.is_expiring_contract;
}

function listMetric(row: PlayerIntelligence, list: SmartList) {
  if (list === "bargains") return row.bargain_score?.toFixed(1) ?? "–";
  if (list === "expiring") return row.contract_days_remaining ?? "–";
  if (list === "free_agents") return row.projection?.projected_peak_ability ?? row.player.current_ability ?? "–";
  return row.player.potential_ability ?? "–";
}

function listMetricLabel(list: SmartList) {
  return list === "bargains" ? "WERT-INDEX" : list === "expiring" ? "TAGE" : list === "free_agents" ? "SPITZE" : "PA";
}

function parseDate(value: string): GameDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const verified = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return verified.getUTCFullYear() === date.year
    && verified.getUTCMonth() + 1 === date.month
    && verified.getUTCDate() === date.day ? date : null;
}

function todayGameDate(): GameDate {
  const date = new Date();
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

function todayInputValue() {
  const date = todayGameDate();
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function initials(value: string) { return value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toLocaleUpperCase("de"); }
function normalize(value: string) { return value.trim().toLocaleLowerCase("de").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function humanize(value: string) { return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toLocaleUpperCase("de")); }
