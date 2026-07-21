import { useEffect, useMemo, useState } from "react";
import { Button, Card, Table } from "@heroui/react";
import { GitCompareArrows, Plus, Radar, Sparkles, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

import { findSimilarLocally, scorePlayerLocally } from "./roles";
import type { Player, RoleProfile, SimilarPlayer } from "./types";
import { playerColumns } from "./view-preferences";

const colors = ["#66e89d", "#68bff0", "#f0ba62", "#c38af0"];
const money = new Intl.NumberFormat("de-DE", { notation: "compact", style: "currency", currency: "EUR", maximumFractionDigits: 1 });
const attributeLabels = new Map(playerColumns.filter((column) => column.attribute).map((column) => [column.attribute!, column.label]));

export function ComparisonWorkspace({ players, role, selectedIds, onToggle }: {
  players: Player[];
  role: RoleProfile | undefined;
  selectedIds: Set<string>;
  onToggle: (playerId: string) => void;
}) {
  const selected = players.filter((player) => selectedIds.has(player.id)).slice(0, 4);
  const reference = selected[0];
  const [similar, setSimilar] = useState<SimilarPlayer[]>([]);
  const attributes = useMemo(() => Object.entries(role?.weights ?? {})
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([id, weight]) => ({ id, weight, label: attributeLabels.get(id) ?? id })), [role]);

  useEffect(() => {
    if (!reference) {
      setSimilar([]);
      return;
    }
    let cancelled = false;
    const fallback = findSimilarLocally(reference, players, role, 8);
    setSimilar(fallback);
    invoke<SimilarPlayer[]>("find_similar_players", {
      players,
      referenceId: reference.id,
      roleId: role?.id ?? null,
      limit: 8,
    }).then((matches) => {
      if (!cancelled) setSimilar(matches);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [players, reference, role]);

  const suggestions = similar.filter((match) => !selectedIds.has(match.player.id)).slice(0, 4);

  return (
    <div className="comparison-workspace">
      <Card className="comparison-hero">
        <Card.Header>
          <div><Card.Title>Direktvergleich</Card.Title><Card.Description>Bis zu vier Spieler · {role?.name ?? "rollenunabhängig"}</Card.Description></div>
          <span className="engine-badge"><GitCompareArrows size={13} /> {selected.length}/4 AUSGEWÄHLT</span>
        </Card.Header>
        <Card.Content className="comparison-player-grid">
          {selected.map((player, index) => {
            const rating = Math.round(scorePlayerLocally(player, role)?.score ?? 0);
            return (
              <Card key={player.id} className="compare-player-card" style={{ "--player-color": colors[index] } as React.CSSProperties}>
                <Card.Content>
                  <div className="compare-player-top"><span className="compare-avatar">{initials(player.name)}</span><Button isIconOnly size="sm" variant="ghost" aria-label={`${player.name} aus Vergleich entfernen`} onPress={() => onToggle(player.id)}><X size={13} /></Button></div>
                  <strong>{player.name}</strong><small>{player.club ?? "Vereinslos"} · {player.positions.join(" / ")}</small>
                  <div className="compare-stats"><span><b>{rating}</b> Rolle</span><span><b>{player.current_ability ?? "?"}</b> CA</span><span><b>{player.potential_ability ?? "?"}</b> PA</span></div>
                </Card.Content>
              </Card>
            );
          })}
          {Array.from({ length: Math.max(0, 2 - selected.length) }, (_, index) => (
            <div className="compare-placeholder" key={index}><Plus size={18} /><span>Spieler unten auswählen</span></div>
          ))}
        </Card.Content>
      </Card>

      {selected.length >= 2 && attributes.length > 0 ? (
        <div className="comparison-analysis">
          <Card className="radar-card">
            <Card.Header><div><Card.Title>Rollenprofil-Radar</Card.Title><Card.Description>Die acht höchst gewichteten Attribute</Card.Description></div><Radar size={18} /></Card.Header>
            <Card.Content><RadarChart players={selected} attributes={attributes} /></Card.Content>
            <Card.Footer className="radar-legend">{selected.map((player, index) => <span key={player.id}><i style={{ background: colors[index] }} />{player.name}</span>)}</Card.Footer>
          </Card>

          <Card className="comparison-table-card">
            <Card.Header><div><Card.Title>Attributmatrix</Card.Title><Card.Description>Direkte Werte auf der FM-Skala 1–20</Card.Description></div></Card.Header>
            <Card.Content className="p-0">
              <Table variant="secondary" className="comparison-table">
                <Table.ScrollContainer>
                  <Table.Content aria-label="Verglichene Rollenattribute">
                    <Table.Header>
                      <Table.Column id="attribute" isRowHeader>ATTRIBUT</Table.Column>
                      {selected.map((player) => <Table.Column key={player.id} id={player.id}>{player.name.toLocaleUpperCase("de")}</Table.Column>)}
                    </Table.Header>
                    <Table.Body items={attributes}>
                      {(attribute) => <Table.Row id={attribute.id} key={attribute.id}><Table.Cell><strong>{attribute.label}</strong><small>Gewicht {attribute.weight.toFixed(2)}</small></Table.Cell>{selected.map((player) => <Table.Cell key={player.id}><AttributeScore value={player.attributes[attribute.id]} best={Math.max(...selected.map((candidate) => candidate.attributes[attribute.id] ?? 0))} /></Table.Cell>)}</Table.Row>}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table>
            </Card.Content>
          </Card>
        </div>
      ) : (
        <Card className="comparison-empty"><Card.Content><GitCompareArrows size={25} /><strong>Noch einen Spieler auswählen</strong><span>Ab zwei Spielern werden Radar und Attributmatrix berechnet.</span></Card.Content></Card>
      )}

      <Card className="similar-card">
        <Card.Header><div><Card.Title>Ähnliche Spieler & Ersatzkandidaten</Card.Title><Card.Description>{reference ? `Referenz: ${reference.name}` : "Ersten Referenzspieler auswählen"}</Card.Description></div><Sparkles size={17} /></Card.Header>
        <Card.Content className="similar-grid">
          {suggestions.length > 0 ? suggestions.map((match) => (
            <Card key={match.player.id} className="similar-player" variant="secondary">
              <Card.Content>
                <div className="similar-score"><strong>{Math.round(match.similarity)}%</strong><span>Ähnlichkeit · {Math.round(match.coverage)}% Daten</span></div>
                <div className="similar-copy"><strong>{match.player.name}</strong><small>{match.player.club ?? "Vereinslos"} · {match.player.value ? money.format(match.player.value) : "ohne Marktwert"}</small></div>
                <Button isIconOnly size="sm" variant="ghost" aria-label={`${match.player.name} zum Vergleich hinzufügen`} onPress={() => onToggle(match.player.id)}><Plus size={14} /></Button>
              </Card.Content>
            </Card>
          )) : <div className="similar-empty">{reference ? "Keine weiteren Kandidaten im Datensatz." : "Eine Referenz startet die Ähnlichkeitssuche."}</div>}
        </Card.Content>
      </Card>

      <Card className="comparison-pool">
        <Card.Header><div><Card.Title>Spielerauswahl</Card.Title><Card.Description>Maximal vier Spieler gleichzeitig vergleichen</Card.Description></div></Card.Header>
        <Card.Content>
          {players.map((player) => {
            const active = selectedIds.has(player.id);
            return <Button key={player.id} size="sm" variant={active ? "secondary" : "ghost"} aria-label={`${active ? "Entfernen" : "Hinzufügen"}: ${player.name}`} aria-pressed={active} isDisabled={!active && selected.length >= 4} onPress={() => onToggle(player.id)}><span className="pool-avatar">{initials(player.name)}</span>{player.name}<small>{player.positions[0] ?? "–"}</small></Button>;
          })}
        </Card.Content>
      </Card>
    </div>
  );
}

function RadarChart({ players, attributes }: { players: Player[]; attributes: Array<{ id: string; label: string }> }) {
  const center = 150;
  const radius = 100;
  const point = (index: number, value: number) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / attributes.length;
    const distance = radius * value / 20;
    return [center + Math.cos(angle) * distance, center + Math.sin(angle) * distance] as const;
  };
  const polygon = (value: number) => attributes.map((_, index) => point(index, value).join(",")).join(" ");
  return (
    <svg className="role-radar" viewBox="0 0 300 300" role="img" aria-label={`Rollenprofil-Radar für ${players.map((player) => player.name).join(", ")}`}>
      {[5, 10, 15, 20].map((level) => <polygon key={level} points={polygon(level)} className="radar-grid-line" />)}
      {attributes.map((attribute, index) => {
        const [x, y] = point(index, 20);
        const [labelX, labelY] = point(index, 24);
        return <g key={attribute.id}><line x1={center} y1={center} x2={x} y2={y} className="radar-axis" /><text x={labelX} y={labelY} textAnchor={labelX < center - 5 ? "end" : labelX > center + 5 ? "start" : "middle"}>{attribute.label}</text></g>;
      })}
      {players.map((player, playerIndex) => <polygon key={player.id} points={attributes.map((attribute, index) => point(index, player.attributes[attribute.id] ?? 0).join(",")).join(" ")} style={{ fill: `${colors[playerIndex]}24`, stroke: colors[playerIndex] }} className="radar-player" />)}
    </svg>
  );
}

function AttributeScore({ value, best }: { value: number | undefined; best: number }) {
  if (typeof value !== "number") return <span className="attribute-missing">–</span>;
  return <span className={`comparison-attribute ${value === best ? "best" : ""}`}>{value}</span>;
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toLocaleUpperCase("de");
}
