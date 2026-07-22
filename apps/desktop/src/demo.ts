import type { Player } from "./types";

const attributes = (passing: number, vision: number, pace: number, technique: number) => ({
  passing, vision, pace, technique,
  decisions: Math.max(1, passing - 1), first_touch: technique,
  composure: Math.max(1, technique - 1), off_the_ball: Math.max(1, pace - 2),
});

const details = (expiresYear: number, expiresMonth = 6, expiresDay = 30) => ({
  reputation: null,
  international_reputation: null,
  consistency: null,
  important_matches: null,
  injury_proneness: null,
  versatility: null,
  professionalism: null,
  ambition: null,
  contract: {
    club_id: "club-nordhafen",
    expires_on: { year: expiresYear, month: expiresMonth, day: expiresDay },
    contract_type: "full_time" as const,
  },
  future_transfer: null,
  fitness: { condition: 92, match_fitness: 88, fatigue: 18, jadedness: 10 },
  morale: 16,
  happiness: 17,
  injuries: [],
  bans: [],
  status: { transfer_listed: false, loan_listed: false, injured: false, suspended: false, unavailable: false },
  tags: [],
  note: null,
});

const club = "SV Nordhafen";

export const demoPlayers: Player[] = [
  { id: "101", name: "Noah Hartmann", age: 19, club, nationality: "Deutschland", positions: ["M (Z)", "OM (Z)"], preferred_foot: "right", value: 12_500_000, wage: 18_500, current_ability: 128, potential_ability: 174, attributes: attributes(17, 18, 14, 17), details: details(2029) },
  { id: "102", name: "Mateo Silva", age: 21, club, nationality: "Portugal", positions: ["OM (L)", "ST"], preferred_foot: "left", value: 18_000_000, wage: 24_000, current_ability: 137, potential_ability: 169, attributes: attributes(14, 15, 18, 17), details: { ...details(2028), fitness: { condition: 61, match_fitness: 72, fatigue: 78, jadedness: 54 }, morale: 12, happiness: 14 } },
  { id: "103", name: "Elias Berg", age: 18, club, nationality: "Dänemark", positions: ["DM", "M (Z)"], preferred_foot: "both", value: 7_800_000, wage: 9_200, current_ability: 116, potential_ability: 181, attributes: attributes(16, 17, 13, 16), details: { ...details(2030), fitness: { condition: 43, match_fitness: 34, fatigue: 66, jadedness: 28 }, injuries: [{ id: "injury-elias-1", name: "Oberschenkelzerrung", body_area: "Oberschenkel", severity: "moderate", started_on: { year: 2026, month: 7, day: 18 }, expected_return: { year: 2026, month: 8, day: 10 }, days_remaining: 19, recurring: false, treatment: "rehabilitation" }], status: { transfer_listed: false, loan_listed: false, injured: true, suspended: false, unavailable: true } } },
  { id: "104", name: "Amadou Koné", age: 23, club, nationality: "Mali", positions: ["V (Z)"], preferred_foot: "right", value: 21_000_000, wage: 31_000, current_ability: 146, potential_ability: 158, attributes: attributes(12, 11, 16, 13), details: { ...details(2028), bans: [{ id: "ban-amadou-1", reason: "Rote Karte", competition_id: "competition-nordliga", scope: "domestic", starts_on: { year: 2026, month: 7, day: 20 }, ends_on: null, matches_remaining: 2 }], status: { transfer_listed: false, loan_listed: false, injured: false, suspended: true, unavailable: true } } },
  { id: "105", name: "Tomás Rojas", age: 20, club, nationality: "Argentinien", positions: ["ST"], preferred_foot: "left", value: 15_500_000, wage: 14_000, current_ability: 132, potential_ability: 176, attributes: attributes(12, 14, 17, 16), details: details(2030) },
  { id: "106", name: "Karim Diarra", age: 29, club, nationality: "Frankreich", positions: ["V (Z)"], preferred_foot: "left", value: 24_000_000, wage: 35_000, current_ability: 150, potential_ability: 151, attributes: attributes(13, 12, 14, 14), details: details(2027) },
  { id: "107", name: "Felix Auer", age: 28, club, nationality: "Österreich", positions: ["TW"], preferred_foot: "right", value: 9_000_000, wage: 26_000, current_ability: 142, potential_ability: 145, attributes: attributes(11, 13, 12, 12), details: details(2028) },
  { id: "108", name: "Jan de Wit", age: 20, club, nationality: "Niederlande", positions: ["TW"], preferred_foot: "right", value: 4_500_000, wage: 6_000, current_ability: 104, potential_ability: 158, attributes: attributes(10, 12, 13, 11), details: details(2030) },
  { id: "109", name: "Leon Okafor", age: 26, club, nationality: "Schweiz", positions: ["AV (R)"], preferred_foot: "right", value: 16_000_000, wage: 22_000, current_ability: 138, potential_ability: 143, attributes: attributes(14, 13, 17, 15), details: details(2027, 10, 31) },
  { id: "110", name: "Rui Costa Lima", age: 19, club, nationality: "Portugal", positions: ["AV (L)"], preferred_foot: "left", value: 8_500_000, wage: 7_000, current_ability: 110, potential_ability: 166, attributes: attributes(13, 14, 16, 15), details: details(2031) },
  { id: "111", name: "Miro Petrovic", age: 32, club, nationality: "Kroatien", positions: ["M (Z)"], preferred_foot: "both", value: 7_000_000, wage: 42_000, current_ability: 153, potential_ability: 153, attributes: attributes(18, 17, 11, 18), details: { ...details(2027), morale: 7, happiness: 6 } },
  { id: "112", name: "Samuel Mensah", age: 27, club, nationality: "Ghana", positions: ["ST"], preferred_foot: "right", value: 27_000_000, wage: 38_000, current_ability: 149, potential_ability: 153, attributes: attributes(13, 12, 16, 15), details: details(2028) },
];
