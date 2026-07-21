import type {
  AnalysisBucket, GameDate, Player, PositionGroupAnalysis, SquadAnalysis,
  SquadPlayerSummary, SuccessionRisk, WageOutlier,
} from "./types";

export const squadAnalysisDate: GameDate = { year: 2026, month: 7, day: 1 };

const positionGroups = [
  ["goalkeeper", "Tor"],
  ["defence", "Innenverteidigung"],
  ["full_back", "Außenverteidigung"],
  ["defensive_midfield", "Defensives Mittelfeld"],
  ["central_midfield", "Zentrales Mittelfeld"],
  ["attacking_midfield", "Offensives Mittelfeld & Flügel"],
  ["forward", "Angriff"],
] as const;

export function analyseSquadLocally(players: Player[], asOf = squadAnalysisDate): SquadAnalysis {
  const knownAges = players.flatMap((player) => player.age === null ? [] : [player.age]);
  const knownWages = players.flatMap((player) => wage(player) === null ? [] : [wage(player)!]);
  const weeklyWageTotal = sum(knownWages);
  const averageWeeklyWage = knownWages.length > 0 ? round2(weeklyWageTotal / knownWages.length) : null;
  const oneYear = { ...asOf, year: asOf.year + 1 };
  const twoYears = { ...asOf, year: asOf.year + 2 };

  const ageBands = [
    bucket("u21", "U21", players.filter((player) => player.age !== null && player.age <= 21)),
    bucket("development", "22–25", players.filter((player) => player.age !== null && player.age >= 22 && player.age <= 25)),
    bucket("prime", "26–29", players.filter((player) => player.age !== null && player.age >= 26 && player.age <= 29)),
    bucket("experienced", "30+", players.filter((player) => player.age !== null && player.age >= 30)),
    bucket("unknown", "Unbekannt", players.filter((player) => player.age === null)),
  ];

  const contractWindows = [
    bucket("expired", "Abgelaufen", players.filter((player) => contractWindow(player, asOf, oneYear, twoYears) === "expired")),
    bucket("next_year", "≤ 12 Monate", players.filter((player) => contractWindow(player, asOf, oneYear, twoYears) === "next_year")),
    bucket("following_year", "12–24 Monate", players.filter((player) => contractWindow(player, asOf, oneYear, twoYears) === "following_year")),
    bucket("later", "> 24 Monate", players.filter((player) => contractWindow(player, asOf, oneYear, twoYears) === "later")),
    bucket("unknown", "Unbekannt", players.filter((player) => contractWindow(player, asOf, oneYear, twoYears) === "unknown")),
  ];

  const groups = positionGroups.map(([id, label]) => positionGroup(players, id, label));
  const risks = groups.flatMap((group) => successionRisk(group, asOf, oneYear) ?? []);
  const outliers: WageOutlier[] = averageWeeklyWage === null ? [] : players.flatMap((player) => {
    const weeklyWage = wage(player);
    if (weeklyWage === null || weeklyWage < averageWeeklyWage * 1.35) return [];
    return [{
      player_id: player.id,
      player_name: player.name,
      weekly_wage: weeklyWage,
      share_of_total: round2(weeklyWageTotal > 0 ? weeklyWage / weeklyWageTotal * 100 : 0),
      multiple_of_average: round2(weeklyWage / averageWeeklyWage),
    }];
  }).sort((left, right) => right.weekly_wage - left.weekly_wage).slice(0, 5);

  return {
    as_of: asOf,
    player_count: players.length,
    average_age: knownAges.length > 0 ? round2(sum(knownAges) / knownAges.length) : null,
    weekly_wage_total: round2(weeklyWageTotal),
    annual_wage_total: round2(weeklyWageTotal * 52),
    average_weekly_wage: averageWeeklyWage,
    expiring_within_year: contractWindows.find((item) => item.id === "next_year")?.count ?? 0,
    age_bands: ageBands,
    contract_windows: contractWindows,
    position_groups: groups,
    succession_risks: risks,
    wage_outliers: outliers,
  };
}

function bucket(id: string, label: string, players: Player[]): AnalysisBucket {
  return { id, label, count: players.length, weekly_wage: round2(sum(players.map(wage).filter((value): value is number => value !== null))) };
}

function positionGroup(players: Player[], id: string, label: string): PositionGroupAnalysis {
  const members = players.filter((player) => primaryPositionGroup(player) === id)
    .sort((left, right) => (right.current_ability ?? -1) - (left.current_ability ?? -1) || left.name.localeCompare(right.name, "de"));
  const ages = members.flatMap((player) => player.age === null ? [] : [player.age]);
  const abilities = members.flatMap((player) => player.current_ability === null ? [] : [player.current_ability]);
  return {
    id,
    label,
    count: members.length,
    average_age: ages.length > 0 ? round2(sum(ages) / ages.length) : null,
    average_current_ability: abilities.length > 0 ? round2(sum(abilities) / abilities.length) : null,
    highest_current_ability: abilities.length > 0 ? Math.max(...abilities) : null,
    under_23_count: members.filter((player) => player.age !== null && player.age < 23).length,
    players: members.map(playerSummary),
  };
}

function successionRisk(group: PositionGroupAnalysis, asOf: GameDate, oneYear: GameDate): SuccessionRisk | null {
  let severity: SuccessionRisk["severity"] = "watch";
  const reasons: string[] = [];
  if (group.count < 2) {
    severity = "critical";
    reasons.push(`Nur ${group.count} Spieler in dieser Positionsgruppe`);
  }
  if (group.count > 0 && group.under_23_count === 0 && (group.average_age ?? 0) >= 28) {
    if (severity === "watch") severity = "warning";
    reasons.push("Kein U23-Nachfolger bei hohem Durchschnittsalter");
  }
  const corePlayer = group.players[0];
  if (corePlayer?.contract_expires_on && compareDate(corePlayer.contract_expires_on, asOf) >= 0 && compareDate(corePlayer.contract_expires_on, oneYear) <= 0) {
    if (severity === "watch") severity = "warning";
    reasons.push(`Vertrag von Kernspieler ${corePlayer.name} läuft binnen 12 Monaten aus`);
  }
  return reasons.length > 0 ? { position_group_id: group.id, position_group_label: group.label, severity, reasons } : null;
}

function playerSummary(player: Player): SquadPlayerSummary {
  return {
    id: player.id,
    name: player.name,
    age: player.age,
    current_ability: player.current_ability,
    potential_ability: player.potential_ability,
    weekly_wage: wage(player),
    contract_expires_on: player.details?.contract?.expires_on ?? null,
  };
}

function primaryPositionGroup(player: Player) {
  const position = (player.positions[0] ?? "").toLocaleUpperCase("de");
  if (/TW|GK|TOR/.test(position)) return "goalkeeper";
  if (/AV|WB|WING-BACK/.test(position)) return "full_back";
  if (/^DM|DM/.test(position)) return "defensive_midfield";
  if (/^OM|^AM|^W/.test(position)) return "attacking_midfield";
  if (/^ST|^SC|ANG/.test(position)) return "forward";
  if (/^V|^D/.test(position)) return "defence";
  return "central_midfield";
}

function contractWindow(player: Player, asOf: GameDate, oneYear: GameDate, twoYears: GameDate) {
  const expiry = player.details?.contract?.expires_on;
  if (!expiry) return "unknown";
  if (compareDate(expiry, asOf) < 0) return "expired";
  if (compareDate(expiry, oneYear) <= 0) return "next_year";
  if (compareDate(expiry, twoYears) <= 0) return "following_year";
  return "later";
}

function compareDate(left: GameDate, right: GameDate) {
  return left.year - right.year || left.month - right.month || left.day - right.day;
}

function wage(player: Player) {
  const value = player.details?.contract?.wage ?? player.wage;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
