import type { Player, PlayerQueryRow, RoleProfile } from "./types";

// Keeps the web preview and tests useful when the Tauri command layer is unavailable.
// The native application replaces this subset with the complete Rust-owned catalog.
export const previewRoles: RoleProfile[] = [
  {
    id: "deep_lying_playmaker",
    name: "Deep-Lying Playmaker",
    phase: "in_possession",
    family: "defensive_midfield",
    weights: { passing: 1.5, vision: 1.5, decisions: 1.35, first_touch: 1.2, technique: 1.2, composure: 1.1 },
  },
  {
    id: "advanced_forward",
    name: "Advanced Forward",
    phase: "in_possession",
    family: "forward",
    weights: { finishing: 1.5, off_the_ball: 1.45, acceleration: 1.35, pace: 1.3, composure: 1.2, technique: 1.0 },
  },
  {
    id: "oop_covering_centre_back",
    name: "Covering Centre-Back",
    phase: "out_of_possession",
    family: "centre_back",
    weights: { positioning: 1.5, anticipation: 1.4, pace: 1.3, concentration: 1.25, marking: 1.2, tackling: 1.1 },
  },
  {
    id: "oop_pressing_forward",
    name: "Pressing Forward",
    phase: "out_of_possession",
    family: "forward",
    weights: { work_rate: 1.5, stamina: 1.4, aggression: 1.25, acceleration: 1.2, anticipation: 1.1, teamwork: 1.1 },
  },
];

export function scorePlayerLocally(player: Player, role: RoleProfile | undefined): PlayerQueryRow["role_score"] {
  if (!role) return null;
  const weights = Object.entries(role.weights);
  const totalWeight = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let seenWeight = 0;
  let weightedScore = 0;
  const contributions = weights.flatMap(([attribute, weight]) => {
    const value = player.attributes[attribute];
    if (typeof value !== "number") return [];
    seenWeight += weight;
    const contribution = value * weight;
    weightedScore += contribution;
    return [{ attribute, value, weight, contribution }];
  }).sort((left, right) => right.contribution - left.contribution);

  const round2 = (value: number) => Math.round(value * 100) / 100;
  return {
    role_id: role.id,
    score: round2(seenWeight > 0 ? weightedScore / seenWeight / 20 * 100 : 0),
    coverage: round2(totalWeight > 0 ? seenWeight / totalWeight * 100 : 0),
    contributions,
  };
}

export function locallyRatedRows(players: Player[], role: RoleProfile | undefined): PlayerQueryRow[] {
  return players
    .map((player) => ({ player, role_score: scorePlayerLocally(player, role) }))
    .sort((left, right) => (right.role_score?.score ?? 0) - (left.role_score?.score ?? 0));
}
