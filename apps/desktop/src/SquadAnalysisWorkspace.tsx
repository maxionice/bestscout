import { useEffect, useMemo, useState } from "react";
import { Card, Table } from "@heroui/react";
import { AlertTriangle, CalendarClock, CircleDollarSign, ShieldAlert, UsersRound } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

import { analyseSquadLocally, squadAnalysisDate } from "./squad";
import type { AnalysisBucket, GameDate, Player, SquadAnalysis } from "./types";

const money = new Intl.NumberFormat("de-DE", { notation: "compact", style: "currency", currency: "EUR", maximumFractionDigits: 1 });

export function SquadAnalysisWorkspace({ players }: { players: Player[] }) {
  const fallback = useMemo(() => analyseSquadLocally(players), [players]);
  const [analysis, setAnalysis] = useState(fallback);

  useEffect(() => {
    let cancelled = false;
    setAnalysis(fallback);
    invoke<SquadAnalysis>("analyse_squad", { players, asOf: squadAnalysisDate })
      .then((result) => { if (!cancelled) setAnalysis(result); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [fallback, players]);

  const maxDepth = Math.max(1, ...analysis.position_groups.map((group) => group.count));
  return (
    <div className="squad-workspace">
      <Card className="squad-summary-card">
        <Card.Header>
          <div><Card.Title>Kadergesundheit</Card.Title><Card.Description>Stichtag {formatDate(analysis.as_of)} · aktueller Datensatz</Card.Description></div>
          <span className="engine-badge"><UsersRound size={13} /> SQUAD ENGINE</span>
        </Card.Header>
        <Card.Content className="squad-summary-metrics">
          <SquadMetric label="Kadergröße" value={analysis.player_count.toString()} detail="Spieler mit Primärposition" />
          <SquadMetric label="Ø Alter" value={analysis.average_age?.toLocaleString("de-DE", { maximumFractionDigits: 1 }) ?? "–"} detail="Jahre" />
          <SquadMetric label="Wochenbudget" value={money.format(analysis.weekly_wage_total)} detail={`${money.format(analysis.annual_wage_total)} pro Jahr`} />
          <SquadMetric label="Verträge ≤ 12 M." value={analysis.expiring_within_year.toString()} detail="Verlängerung prüfen" alert={analysis.expiring_within_year > 0} />
        </Card.Content>
      </Card>

      <div className="squad-analysis-grid">
        <Card className="squad-depth-card">
          <Card.Header><div><Card.Title>Positionsbreite</Card.Title><Card.Description>Primärposition, Stärke und U23-Abdeckung</Card.Description></div><UsersRound size={18} /></Card.Header>
          <Card.Content className="depth-list">
            {analysis.position_groups.map((group) => (
              <div className="depth-row" key={group.id}>
                <div className="depth-copy"><strong>{group.label}</strong><span>{group.players.slice(0, 2).map((player) => player.name).join(" · ") || "Unbesetzt"}</span></div>
                <div className="depth-track" aria-label={`${group.label}: ${group.count} Spieler`}><i style={{ width: `${group.count / maxDepth * 100}%` }} /></div>
                <div className="depth-values"><b>{group.count}</b><span>Ø CA {group.average_current_ability?.toLocaleString("de-DE", { maximumFractionDigits: 0 }) ?? "–"}</span><small>{group.under_23_count} U23</small></div>
              </div>
            ))}
          </Card.Content>
        </Card>

        <div className="squad-distributions">
          <DistributionCard title="Altersstruktur" description="Entwicklungs- und Erfahrungsfenster" icon={<UsersRound size={17} />} buckets={analysis.age_bands} total={analysis.player_count} />
          <DistributionCard title="Vertragshorizont" description="Laufzeit und gebundenes Wochenbudget" icon={<CalendarClock size={17} />} buckets={analysis.contract_windows} total={analysis.player_count} showWage />
        </div>
      </div>

      <div className="squad-bottom-grid">
        <Card className="succession-card">
          <Card.Header><div><Card.Title>Nachfolge- & Verlängerungsrisiken</Card.Title><Card.Description>Regelbasiert aus Tiefe, Alter und Vertragslaufzeit</Card.Description></div><ShieldAlert size={18} /></Card.Header>
          <Card.Content className="risk-list">
            {analysis.succession_risks.length > 0 ? analysis.succession_risks.map((risk) => (
              <div className={`risk-row ${risk.severity}`} key={risk.position_group_id}>
                <span className="risk-icon"><AlertTriangle size={15} /></span>
                <div><strong>{risk.position_group_label}</strong>{risk.reasons.map((reason) => <span key={reason}>{reason}</span>)}</div>
                <small>{risk.severity === "critical" ? "KRITISCH" : risk.severity === "warning" ? "WARNUNG" : "BEOBACHTEN"}</small>
              </div>
            )) : <div className="squad-empty">Keine strukturellen Risiken im aktuellen Datensatz erkannt.</div>}
          </Card.Content>
        </Card>

        <Card className="wage-card">
          <Card.Header><div><Card.Title>Gehaltsstruktur</Card.Title><Card.Description>Spieler ab 135% des bekannten Durchschnitts</Card.Description></div><CircleDollarSign size={18} /></Card.Header>
          <Card.Content className="p-0">
            {analysis.wage_outliers.length > 0 ? (
              <Table variant="secondary" className="wage-table">
                <Table.ScrollContainer>
                  <Table.Content aria-label="Gehaltsausreißer">
                    <Table.Header><Table.Column id="player" isRowHeader>SPIELER</Table.Column><Table.Column id="wage">PRO WOCHE</Table.Column><Table.Column id="share">ANTEIL</Table.Column></Table.Header>
                    <Table.Body items={analysis.wage_outliers}>{(item) => <Table.Row id={item.player_id}><Table.Cell><strong>{item.player_name}</strong><small>{item.multiple_of_average.toLocaleString("de-DE")}× Durchschnitt</small></Table.Cell><Table.Cell>{money.format(item.weekly_wage)}</Table.Cell><Table.Cell><span className="wage-share">{Math.round(item.share_of_total)}%</span></Table.Cell></Table.Row>}</Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table>
            ) : <div className="squad-empty">Keine auffälligen Gehälter mit ausreichender Datenbasis.</div>}
          </Card.Content>
          <Card.Footer><span>Ø bekanntes Gehalt</span><strong>{analysis.average_weekly_wage === null ? "–" : `${money.format(analysis.average_weekly_wage)} / W.`}</strong></Card.Footer>
        </Card>
      </div>
    </div>
  );
}

function SquadMetric({ label, value, detail, alert = false }: { label: string; value: string; detail: string; alert?: boolean }) {
  return <div className={`squad-metric ${alert ? "has-alert" : ""}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function DistributionCard({ title, description, icon, buckets, total, showWage = false }: {
  title: string;
  description: string;
  icon: React.ReactNode;
  buckets: AnalysisBucket[];
  total: number;
  showWage?: boolean;
}) {
  return (
    <Card className="distribution-card">
      <Card.Header><div><Card.Title>{title}</Card.Title><Card.Description>{description}</Card.Description></div>{icon}</Card.Header>
      <Card.Content>
        <div className="distribution-stack" aria-label={`${title}: Verteilung`}>
          {buckets.filter((bucket) => bucket.count > 0).map((bucket, index) => <i key={bucket.id} className={`segment-${index}`} style={{ width: `${bucket.count / Math.max(total, 1) * 100}%` }} title={`${bucket.label}: ${bucket.count}`} />)}
        </div>
        <div className="distribution-list">
          {buckets.map((bucket, index) => <div key={bucket.id}><span><i className={`segment-${index}`} />{bucket.label}</span><strong>{bucket.count}</strong>{showWage && <small>{money.format(bucket.weekly_wage)} / W.</small>}</div>)}
        </div>
      </Card.Content>
    </Card>
  );
}

function formatDate(date: GameDate) {
  return `${String(date.day).padStart(2, "0")}.${String(date.month).padStart(2, "0")}.${date.year}`;
}
