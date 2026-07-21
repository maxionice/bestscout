import type { Player } from "./types";

const attributes = (passing: number, vision: number, pace: number, technique: number) => ({
  passing, vision, pace, technique,
  decisions: Math.max(1, passing - 1), first_touch: technique,
  composure: Math.max(1, technique - 1), off_the_ball: Math.max(1, pace - 2),
});

export const demoPlayers: Player[] = [
  { id: "101", name: "Noah Hartmann", age: 19, club: "Mainz", nationality: "Deutschland", positions: ["M (Z)", "OM (Z)"], preferred_foot: "right", value: 12_500_000, wage: 18_500, current_ability: 128, potential_ability: 174, attributes: attributes(17, 18, 14, 17) },
  { id: "102", name: "Mateo Silva", age: 21, club: "Braga", nationality: "Portugal", positions: ["OM (L)", "ST"], preferred_foot: "left", value: 18_000_000, wage: 24_000, current_ability: 137, potential_ability: 169, attributes: attributes(14, 15, 18, 17) },
  { id: "103", name: "Elias Berg", age: 18, club: "Nordsjælland", nationality: "Dänemark", positions: ["DM", "M (Z)"], preferred_foot: "both", value: 7_800_000, wage: 9_200, current_ability: 116, potential_ability: 181, attributes: attributes(16, 17, 13, 16) },
  { id: "104", name: "Amadou Koné", age: 23, club: "Lens", nationality: "Mali", positions: ["V (Z)"], preferred_foot: "right", value: 21_000_000, wage: 31_000, current_ability: 146, potential_ability: 158, attributes: attributes(12, 11, 16, 13) },
  { id: "105", name: "Tomás Rojas", age: 20, club: "River", nationality: "Argentinien", positions: ["ST"], preferred_foot: "left", value: 15_500_000, wage: 14_000, current_ability: 132, potential_ability: 176, attributes: attributes(12, 14, 17, 16) },
];
