import { useMemo, useState, type ReactNode } from "react";
import { Button, Card, Input, Table, TextField } from "@heroui/react";
import { Building2, Database, Search, ShieldCheck, Trophy, UserRoundCog, Users } from "lucide-react";

import type { Club, Competition, Contract, DatabaseSnapshot, GameDate, PersonRelationship, Player, Staff } from "./types";
import { playerColumns } from "./view-preferences";

type EntityKind = "players" | "staff" | "clubs" | "competitions";
type GridColumn = { id: string; label: string };
type GridRow = { id: string; searchText: string; cells: Record<string, ReactNode> };
type GridConfiguration = {
  label: string;
  singular: string;
  ariaLabel: string;
  icon: typeof Users;
  columns: GridColumn[];
  rows: GridRow[];
};

const money = new Intl.NumberFormat("de-DE", {
  notation: "compact",
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 1,
});
const number = new Intl.NumberFormat("de-DE");

const staffAttributeColumns: GridColumn[] = [
  ["adaptability", "Anpassungsfähigkeit"], ["determination", "Zielstrebigkeit"],
  ["level_of_discipline", "Disziplin"], ["man_management", "Mitarbeiterführung"],
  ["motivating", "Motivieren"], ["judging_player_ability", "Spielerfähigkeit beurteilen"],
  ["judging_player_potential", "Spielerpotenzial beurteilen"], ["tactical_knowledge", "Taktikwissen"],
  ["working_with_youngsters", "Arbeit mit jungen Spielern"], ["attacking", "Angriff"],
  ["defending", "Verteidigung"], ["fitness", "Fitness"], ["goalkeepers", "Torhüter"],
  ["mental", "Mental"], ["tactical", "Taktik"], ["technical", "Technik"],
].map(([id, label]) => ({ id: `attribute:${id}`, label }));

const playerGridColumns = playerColumns
  .filter((column) => column.id !== "favorite" && column.id !== "role_score")
  .map(({ id, label }) => ({ id, label }));

const staffGridColumns: GridColumn[] = [
  { id: "id", label: "Datenbank-ID" }, { id: "name", label: "Name" },
  { id: "age", label: "Alter" }, { id: "club", label: "Verein" },
  { id: "nationality", label: "Nation" }, { id: "roles", label: "Rollen" },
  { id: "current_ability", label: "CA" }, { id: "potential_ability", label: "PA" },
  { id: "reputation", label: "Reputation" }, { id: "contract_starts", label: "Vertragsbeginn" },
  { id: "contract_expires", label: "Vertragsende" }, { id: "contract_club_id", label: "Vertragsverein-ID" },
  { id: "contract_type", label: "Vertragsart" },
  { id: "wage", label: "Gehalt" }, { id: "release_clause", label: "Ausstiegsklausel" },
  { id: "squad_status", label: "Kaderstatus" },
  { id: "date_of_birth", label: "Geburtsdatum" },
  { id: "languages", label: "Sprachen" },
  { id: "responsibilities", label: "Verantwortungen" },
  { id: "qualifications", label: "Qualifikationen" },
  { id: "relationships", label: "Beziehungen" },
  { id: "note", label: "Notiz" },
  ...staffAttributeColumns,
];

const clubGridColumns: GridColumn[] = [
  { id: "id", label: "Datenbank-ID" }, { id: "name", label: "Name" },
  { id: "short_name", label: "Kurzname" }, { id: "nation", label: "Nation" },
  { id: "competition", label: "Wettbewerb" }, { id: "competition_id", label: "Wettbewerb-ID" }, { id: "reputation", label: "Reputation" },
  { id: "professional_status", label: "Profistatus" }, { id: "stadium", label: "Stadion" },
  { id: "stadium_capacity", label: "Kapazität" }, { id: "average_attendance", label: "Zuschauerschnitt" },
  { id: "balance", label: "Kontostand" }, { id: "transfer_budget", label: "Transferbudget" },
  { id: "wage_budget", label: "Gehaltsbudget" }, { id: "debt", label: "Schulden" },
  { id: "training", label: "Training" }, { id: "youth", label: "Jugendeinrichtungen" },
  { id: "youth_recruitment", label: "Jugendrekrutierung" }, { id: "junior_coaching", label: "Juniorentraining" },
  { id: "primary_colour", label: "Primärfarbe" }, { id: "secondary_colour", label: "Sekundärfarbe" },
  { id: "kits", label: "Trikots" }, { id: "club_relationships", label: "Clubbeziehungen" },
];

const competitionGridColumns: GridColumn[] = [
  { id: "id", label: "Datenbank-ID" }, { id: "name", label: "Name" },
  { id: "short_name", label: "Kurzname" }, { id: "nation", label: "Nation" },
  { id: "reputation", label: "Reputation" }, { id: "current_champion", label: "Titelverteidiger" },
  { id: "current_champion_club_id", label: "Titelverteidiger-ID" },
  { id: "level", label: "Ligaebene" }, { id: "stages", label: "Stufen" },
  { id: "fixtures", label: "Paarungen" }, { id: "standings", label: "Tabellenzeilen" },
];

export function DatabaseWorkspace({ players, snapshot }: { players: Player[]; snapshot: DatabaseSnapshot | null }) {
  const [activeKind, setActiveKind] = useState<EntityKind>("players");
  const [query, setQuery] = useState("");

  const configurations = useMemo<Record<EntityKind, GridConfiguration>>(() => ({
    players: {
      label: "Spieler", singular: "Spieler", ariaLabel: "Spielerdaten", icon: Users,
      columns: playerGridColumns, rows: players.map((player) => playerRow(player, snapshot)),
    },
    staff: {
      label: "Staff", singular: "Mitarbeiter", ariaLabel: "Staffdaten", icon: UserRoundCog,
      columns: staffGridColumns, rows: (snapshot?.staff ?? []).map((staff) => staffRow(staff, snapshot)),
    },
    clubs: {
      label: "Vereine", singular: "Verein", ariaLabel: "Vereinsdaten", icon: Building2,
      columns: clubGridColumns, rows: (snapshot?.clubs ?? []).map(clubRow),
    },
    competitions: {
      label: "Wettbewerbe", singular: "Wettbewerb", ariaLabel: "Wettbewerbsdaten", icon: Trophy,
      columns: competitionGridColumns, rows: (snapshot?.competitions ?? []).map(competitionRow),
    },
  }), [players, snapshot]);

  const configuration = configurations[activeKind];
  const ActiveIcon = configuration.icon;
  const needle = normalize(query);
  const rows = needle
    ? configuration.rows.filter((row) => row.searchText.includes(needle))
    : configuration.rows;

  function selectKind(kind: EntityKind) {
    setActiveKind(kind);
    setQuery("");
  }

  return (
    <div className="database-workspace">
      <Card className="database-hero">
        <Card.Header>
          <div>
            <span className="eyebrow">KANONISCHES FM26-SCHEMA</span>
            <Card.Title>Entitätsdatenbank</Card.Title>
            <Card.Description>Alle verfügbaren Rohfelder in einer durchsuchbaren, typisierten Tabellenansicht.</Card.Description>
          </div>
          <span className="engine-badge"><ShieldCheck size={13} /> SCHEMA {snapshot?.schema_version ?? 1}</span>
        </Card.Header>
        <Card.Content className="database-summary">
          <div><Database size={16} /><span>Quelle</span><strong>{sourceLabel(snapshot?.source)}</strong></div>
          <div><ActiveIcon size={16} /><span>Datensätze</span><strong>{configuration.rows.length.toLocaleString("de-DE")}</strong></div>
          <div><span className="summary-glyph">#</span><span>Felder</span><strong>{configuration.columns.length}</strong></div>
          <div><span className="summary-glyph">✓</span><span>Darstellung</span><strong>Vollständig</strong></div>
        </Card.Content>
      </Card>

      <Card className="database-grid-card">
        <Card.Header className="database-toolbar">
          <div className="entity-tabs" role="group" aria-label="Entitätstyp wählen">
            {(Object.keys(configurations) as EntityKind[]).map((kind) => {
              const item = configurations[kind];
              const Icon = item.icon;
              return (
                <Button
                  key={kind}
                  size="sm"
                  variant={activeKind === kind ? "primary" : "ghost"}
                  aria-pressed={activeKind === kind}
                  onPress={() => selectKind(kind)}
                >
                  <Icon size={14} /> {item.label}<span>{item.rows.length}</span>
                </Button>
              );
            })}
          </div>
          <TextField aria-label={`${configuration.label} durchsuchen`} value={query} onChange={setQuery} className="database-search">
            <Search className="search-icon" size={15} />
            <Input placeholder={`${configuration.singular}, Verein, Nation oder Wert …`} />
          </TextField>
        </Card.Header>
        <Card.Content className="p-0">
          <Table key={activeKind} variant="secondary" className="database-table">
            <Table.ScrollContainer>
              <Table.Content aria-label={configuration.ariaLabel}>
                <Table.Header>
                  {configuration.columns.map((column) => (
                    <Table.Column key={column.id} id={column.id} isRowHeader={column.id === "name"}>
                      {column.label.toLocaleUpperCase("de")}
                    </Table.Column>
                  ))}
                </Table.Header>
                <Table.Body items={rows} renderEmptyState={() => <div className="empty">Keine passenden {configuration.label.toLocaleLowerCase("de")} gefunden.</div>}>
                  {(row) => (
                    <Table.Row id={row.id} key={row.id}>
                      {configuration.columns.map((column) => <Table.Cell key={column.id}>{row.cells[column.id] ?? "–"}</Table.Cell>)}
                    </Table.Row>
                  )}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </Card.Content>
        <Card.Footer className="table-footer">
          <span>{rows.length} von {configuration.rows.length} {configuration.label}</span>
          <span>{configuration.columns.length} Felder · horizontal scrollbar</span>
        </Card.Footer>
      </Card>
    </div>
  );
}

function playerRow(player: Player, snapshot: DatabaseSnapshot | null): GridRow {
  const cells = Object.fromEntries(playerGridColumns.map((column) => [column.id, playerCell(player, column.id, snapshot)]));
  return { id: player.id, searchText: searchable(player), cells };
}

function playerCell(player: Player, columnId: string, snapshot: DatabaseSnapshot | null): ReactNode {
  switch (columnId) {
    case "id": return player.id;
    case "name": return <EntityName name={player.name} subtitle={player.nationality} />;
    case "position": return player.positions.join(" · ") || "–";
    case "age": return display(player.age);
    case "club": return display(player.club);
    case "nationality": return display(player.nationality);
    case "preferred_foot": return footLabel(player.preferred_foot);
    case "value": return formatMoney(player.value);
    case "wage": return player.wage == null ? "–" : `${money.format(player.wage)} / W.`;
    case "current_ability": return ability(player.current_ability, "ca");
    case "potential_ability": return ability(player.potential_ability, "potential");
    case "date_of_birth": return formatGameDate(player.details?.date_of_birth);
    case "reputation": return display(player.details?.reputation);
    case "international_reputation": return display(player.details?.international_reputation);
    case "consistency": return display(player.details?.consistency);
    case "important_matches": return display(player.details?.important_matches);
    case "injury_proneness": return display(player.details?.injury_proneness);
    case "versatility": return display(player.details?.versatility);
    case "professionalism": return display(player.details?.professionalism);
    case "ambition": return display(player.details?.ambition);
    case "contract_starts": return formatGameDate(player.details?.contract?.starts_on);
    case "contract_expires": return formatGameDate(player.details?.contract?.expires_on);
    case "contract_club_id": return display(player.details?.contract?.club_id);
    case "contract_type": return contractTypeLabel(player.details?.contract?.contract_type);
    case "contract_wage": return player.details?.contract?.wage == null ? "–" : `${money.format(player.details.contract.wage)} / W.`;
    case "release_clause": return formatMoney(player.details?.contract?.release_clause);
    case "squad_status": return display(player.details?.contract?.squad_status);
    case "future_transfer_kind": return display(player.details?.future_transfer?.kind);
    case "future_transfer_destination": return entityName(snapshot, "club", player.details?.future_transfer?.to_club_id);
    case "future_transfer_date": return formatGameDate(player.details?.future_transfer?.effective_on);
    case "future_transfer_fee": return formatMoney(player.details?.future_transfer?.fee);
    case "future_transfer_status": return display(player.details?.future_transfer?.status);
    case "player_status": return playerStatus(player);
    case "transfer_listed": return booleanLabel(player.details?.status?.transfer_listed);
    case "loan_listed": return booleanLabel(player.details?.status?.loan_listed);
    case "injured": return booleanLabel(player.details?.status?.injured);
    case "suspended": return booleanLabel(player.details?.status?.suspended);
    case "unavailable": return booleanLabel(player.details?.status?.unavailable);
    case "condition": return display(player.details?.fitness?.condition);
    case "match_fitness": return display(player.details?.fitness?.match_fitness);
    case "fatigue": return display(player.details?.fitness?.fatigue);
    case "jadedness": return display(player.details?.fitness?.jadedness);
    case "morale": return display(player.details?.morale);
    case "happiness": return display(player.details?.happiness);
    case "active_injuries": return player.details?.injuries?.map((injury) => injury.name).join(", ") || "–";
    case "active_bans": return player.details?.bans?.map((ban) => ban.reason).join(", ") || "–";
    case "tags": return player.details?.tags.join(", ") || "–";
    case "note": return display(player.details?.note);
    case "languages": return player.details?.languages?.map((item) => `${item.language} ${item.speaking}/10`).join(", ") || "–";
    case "relationships": return player.details?.relationships?.map((item) => relationshipLabel(snapshot, item)).join(", ") || "–";
    case "registrations": return player.details?.registrations?.map((item) => `${entityName(snapshot, "competition", item.competition_id)}: ${roleLabel(item.status)}`).join(", ") || "–";
    default: return attribute(player.attributes[columnId.replace("attribute:", "")]);
  }
}

function staffRow(staff: Staff, snapshot: DatabaseSnapshot | null): GridRow {
  const fixed: Record<string, ReactNode> = {
    id: staff.id,
    name: <EntityName name={staff.name} subtitle={staff.nationality} />,
    age: display(staff.age), club: display(staff.club), nationality: display(staff.nationality),
    roles: staff.roles.map(roleLabel).join(" · ") || "–",
    current_ability: ability(staff.current_ability, "ca"),
    potential_ability: ability(staff.potential_ability, "potential"),
    reputation: display(staff.reputation),
    contract_starts: formatGameDate(staff.contract?.starts_on),
    contract_expires: formatGameDate(staff.contract?.expires_on),
    contract_club_id: display(staff.contract?.club_id),
    contract_type: contractTypeLabel(staff.contract?.contract_type),
    wage: staff.contract?.wage == null ? "–" : `${money.format(staff.contract.wage)} / W.`,
    release_clause: formatMoney(staff.contract?.release_clause),
    squad_status: display(staff.contract?.squad_status),
    date_of_birth: formatGameDate(staff.details?.date_of_birth),
    languages: staff.details?.languages?.map((item) => `${item.language} ${item.speaking}/10`).join(", ") || "–",
    responsibilities: staff.details?.responsibilities?.map(roleLabel).join(" · ") || "–",
    qualifications: staff.details?.qualifications?.map((item) => `${item.name} L${item.level}`).join(", ") || "–",
    relationships: staff.details?.relationships?.map((item) => relationshipLabel(snapshot, item)).join(", ") || "–",
    note: display(staff.details?.note),
  };
  for (const column of staffAttributeColumns) fixed[column.id] = attribute(staff.attributes[column.id.replace("attribute:", "")]);
  return { id: staff.id, searchText: searchable(staff), cells: fixed };
}

function relationshipLabel(snapshot: DatabaseSnapshot | null, relationship: PersonRelationship) {
  return `${roleLabel(relationship.kind)}: ${entityName(snapshot, relationship.target_kind, relationship.target_id)} (${relationship.strength})`;
}

function entityName(
  snapshot: DatabaseSnapshot | null,
  kind: "player" | "staff" | "club" | "competition",
  id: string | null | undefined,
) {
  if (!id) return "–";
  const entities = kind === "player" ? snapshot?.players
    : kind === "staff" ? snapshot?.staff
      : kind === "club" ? snapshot?.clubs
        : snapshot?.competitions;
  return entities?.find((item) => item.id === id)?.name ?? id;
}

function clubRow(club: Club): GridRow {
  return {
    id: club.id,
    searchText: searchable(club),
    cells: {
      id: club.id, name: <EntityName name={club.name} subtitle={club.short_name} />,
      short_name: display(club.short_name), nation: display(club.nation), competition: display(club.competition),
      competition_id: display(club.competition_id),
      reputation: display(club.reputation), professional_status: professionalStatusLabel(club.professional_status),
      stadium: display(club.stadium), stadium_capacity: formatNumber(club.stadium_capacity),
      average_attendance: formatNumber(club.average_attendance), balance: formatMoney(club.finances?.balance),
      transfer_budget: formatMoney(club.finances?.transfer_budget), wage_budget: formatMoney(club.finances?.wage_budget),
      debt: formatMoney(club.finances?.debt), training: attribute(club.facilities?.training),
      youth: attribute(club.facilities?.youth), youth_recruitment: attribute(club.facilities?.youth_recruitment),
      junior_coaching: attribute(club.facilities?.junior_coaching),
      primary_colour: display(club.branding?.primary_colour),
      secondary_colour: display(club.branding?.secondary_colour),
      kits: display(club.branding?.kits.length),
      club_relationships: display(club.relationships?.length),
    },
  };
}

function competitionRow(competition: Competition): GridRow {
  return {
    id: competition.id,
    searchText: searchable(competition),
    cells: {
      id: competition.id, name: <EntityName name={competition.name} subtitle={competition.short_name} />,
      short_name: display(competition.short_name), nation: display(competition.nation),
      reputation: display(competition.reputation), current_champion: display(competition.current_champion),
      current_champion_club_id: display(competition.current_champion_club_id),
      level: display(competition.level), stages: display(competition.stages?.length),
      fixtures: display(competition.fixtures?.length), standings: display(competition.standings?.length),
    },
  };
}

function EntityName({ name, subtitle }: { name: string; subtitle?: string | null }) {
  return <div className="database-entity-name"><strong>{name}</strong><span>{subtitle ?? "Keine Zusatzdaten"}</span></div>;
}

function searchable(value: unknown) {
  return normalize(JSON.stringify(value));
}

function normalize(value: string) {
  return value.toLocaleLowerCase("de").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function display(value: string | number | null | undefined) {
  return value == null || value === "" ? "–" : String(value);
}

function formatMoney(value: number | null | undefined) {
  return value == null ? "–" : money.format(value);
}

function formatNumber(value: number | null | undefined) {
  return value == null ? "–" : number.format(value);
}

function formatGameDate(date: GameDate | null | undefined) {
  return date ? `${String(date.day).padStart(2, "0")}.${String(date.month).padStart(2, "0")}.${date.year}` : "–";
}

function attribute(value: number | null | undefined): ReactNode {
  return value == null ? "–" : <span className={`attribute-value level-${Math.min(4, Math.floor(value / 5))}`}>{value}</span>;
}

function ability(value: number | null | undefined, className: "ca" | "potential") {
  return value == null ? "–" : <span className={className}>{value}</span>;
}

function footLabel(foot: Player["preferred_foot"]) {
  return ({ left: "Links", right: "Rechts", both: "Beidfüßig", unknown: "–" } as const)[foot];
}

function contractTypeLabel(type: Contract["contract_type"]) {
  if (!type) return "–";
  return ({ full_time: "Vollzeit", part_time: "Teilzeit", youth: "Jugend", non_contract: "Ohne Vertrag", loan: "Leihe", unknown: "Unbekannt" } as Record<string, string>)[type] ?? type;
}

function roleLabel(role: string) {
  return ({ assistant_manager: "Co-Trainer", coach: "Trainer", manager: "Trainer", goalkeeping_coach: "Torwarttrainer", fitness_coach: "Fitnesstrainer", performance_analyst: "Leistungsanalyst", recruitment_analyst: "Rekrutierungsanalyst", scout: "Scout", director_of_football: "Sportdirektor", technical_director: "Technischer Direktor", head_of_youth_development: "Nachwuchsleiter", physio: "Physiotherapeut", sports_scientist: "Sportwissenschaftler" } as Record<string, string>)[role] ?? role;
}

function professionalStatusLabel(status: string | null | undefined) {
  if (!status) return "–";
  return ({ professional: "Profiverein", semi_professional: "Semiprofessionell", amateur: "Amateurverein" } as Record<string, string>)[status] ?? status;
}

function booleanLabel(value: boolean | null | undefined) {
  return value == null ? "–" : value ? "Ja" : "Nein";
}

function playerStatus(player: Player) {
  const status = player.details?.status;
  if (!status) return "–";
  const labels: Record<keyof typeof status, string> = {
    transfer_listed: "Transferliste", loan_listed: "Leihliste", injured: "Verletzt",
    suspended: "Gesperrt", unavailable: "Nicht verfügbar",
  };
  return Object.entries(status).filter(([, active]) => active).map(([key]) => labels[key as keyof typeof status]).join(", ") || "Verfügbar";
}

function sourceLabel(source: DatabaseSnapshot["source"] | undefined) {
  return ({ synthetic: "Testdaten", csv: "CSV-Import", live: "Live-Spiel", save_game: "Spielstand" } as const)[source ?? "synthetic"];
}
