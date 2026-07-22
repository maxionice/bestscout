import type { RolePhase } from "./types";

export type PlayerColumnDefinition = {
  id: string;
  label: string;
  category: "Basis" | "Medizin" | "Technik" | "Mental" | "Physis" | "Torwart";
  attribute?: string;
  locked?: boolean;
  defaultVisible?: boolean;
};

const coreColumns: PlayerColumnDefinition[] = [
  { id: "favorite", label: "Shortlist", category: "Basis", defaultVisible: true },
  { id: "name", label: "Spieler", category: "Basis", locked: true, defaultVisible: true },
  { id: "position", label: "Position", category: "Basis", defaultVisible: true },
  { id: "age", label: "Alter", category: "Basis", defaultVisible: true },
  { id: "club", label: "Verein", category: "Basis", defaultVisible: true },
  { id: "nationality", label: "Nation", category: "Basis" },
  { id: "preferred_foot", label: "Starker Fuß", category: "Basis" },
  { id: "value", label: "Marktwert", category: "Basis", defaultVisible: true },
  { id: "wage", label: "Gehalt", category: "Basis" },
  { id: "current_ability", label: "CA", category: "Basis", defaultVisible: true },
  { id: "potential_ability", label: "PA", category: "Basis", defaultVisible: true },
  { id: "role_score", label: "Rollenwert", category: "Basis", defaultVisible: true },
  { id: "id", label: "Datenbank-ID", category: "Basis" },
  { id: "date_of_birth", label: "Geburtsdatum", category: "Basis" },
  { id: "reputation", label: "Reputation", category: "Basis" },
  { id: "international_reputation", label: "Internationale Reputation", category: "Basis" },
  { id: "consistency", label: "Konstanz", category: "Basis" },
  { id: "important_matches", label: "Wichtige Spiele", category: "Basis" },
  { id: "injury_proneness", label: "Verletzungsanfälligkeit", category: "Basis" },
  { id: "versatility", label: "Vielseitigkeit", category: "Basis" },
  { id: "professionalism", label: "Professionalität", category: "Basis" },
  { id: "ambition", label: "Ehrgeiz", category: "Basis" },
  { id: "contract_starts", label: "Vertragsbeginn", category: "Basis" },
  { id: "contract_expires", label: "Vertragsende", category: "Basis" },
  { id: "contract_club_id", label: "Vertragsverein-ID", category: "Basis" },
  { id: "contract_type", label: "Vertragsart", category: "Basis" },
  { id: "contract_wage", label: "Vertragsgehalt", category: "Basis" },
  { id: "release_clause", label: "Ausstiegsklausel", category: "Basis" },
  { id: "squad_status", label: "Kaderstatus", category: "Basis" },
  { id: "player_status", label: "Verfügbarkeit", category: "Basis" },
  { id: "transfer_listed", label: "Transferliste", category: "Basis" },
  { id: "loan_listed", label: "Leihliste", category: "Basis" },
  { id: "injured", label: "Verletzt", category: "Basis" },
  { id: "suspended", label: "Gesperrt", category: "Basis" },
  { id: "unavailable", label: "Nicht verfügbar", category: "Basis" },
  { id: "condition", label: "Kondition", category: "Medizin" },
  { id: "match_fitness", label: "Matchfitness", category: "Medizin" },
  { id: "fatigue", label: "Ermüdung", category: "Medizin" },
  { id: "jadedness", label: "Überspieltheit", category: "Medizin" },
  { id: "morale", label: "Moral", category: "Medizin" },
  { id: "happiness", label: "Zufriedenheit", category: "Medizin" },
  { id: "active_injuries", label: "Aktive Verletzungen", category: "Medizin" },
  { id: "active_bans", label: "Aktive Sperren", category: "Medizin" },
  { id: "tags", label: "Tags", category: "Basis" },
  { id: "note", label: "Notiz", category: "Basis" },
];

const attributeGroups: Array<[PlayerColumnDefinition["category"], Array<[string, string]>]> = [
  ["Technik", [
    ["corners", "Ecken"], ["crossing", "Flanken"], ["dribbling", "Dribbling"],
    ["finishing", "Abschluss"], ["first_touch", "Ballannahme"], ["free_kick_taking", "Freistöße"],
    ["heading", "Kopfball"], ["long_shots", "Weitschüsse"], ["long_throws", "Weite Einwürfe"],
    ["marking", "Deckung"], ["passing", "Passen"], ["penalty_taking", "Elfmeter"],
    ["tackling", "Tackling"], ["technique", "Technik"],
  ]],
  ["Mental", [
    ["aggression", "Aggressivität"], ["anticipation", "Antizipation"], ["bravery", "Mut"],
    ["composure", "Nervenstärke"], ["concentration", "Konzentration"], ["decisions", "Entscheidungen"],
    ["determination", "Zielstrebigkeit"], ["flair", "Kreativität"], ["leadership", "Führungsqualitäten"],
    ["off_the_ball", "Ohne Ball"], ["positioning", "Stellungsspiel"], ["teamwork", "Teamwork"],
    ["vision", "Übersicht"], ["work_rate", "Einsatzfreude"],
  ]],
  ["Physis", [
    ["acceleration", "Antritt"], ["agility", "Beweglichkeit"], ["balance", "Balance"],
    ["jumping_reach", "Sprungkraft"], ["natural_fitness", "Grundfitness"], ["pace", "Schnelligkeit"],
    ["stamina", "Ausdauer"], ["strength", "Kraft"],
  ]],
  ["Torwart", [
    ["aerial_reach", "Lufthoheit"], ["command_of_area", "Strafraumkontrolle"], ["communication", "Kommunikation"],
    ["eccentricity", "Exzentrik"], ["handling", "Fangsicherheit"], ["kicking", "Abstöße"],
    ["one_on_ones", "Eins gegen Eins"], ["punching_tendency", "Fausttendenz"], ["reflexes", "Reflexe"],
    ["rushing_out_tendency", "Herauslaufen"], ["throwing", "Abwürfe"],
  ]],
];

export const playerColumns: PlayerColumnDefinition[] = [
  ...coreColumns,
  ...attributeGroups.flatMap(([category, attributes]) => attributes.map(([attribute, label]) => ({
    id: `attribute:${attribute}`,
    label,
    category,
    attribute,
  }))),
];

export const defaultPlayerColumns = playerColumns.filter((column) => column.defaultVisible || column.locked).map((column) => column.id);

export type SavedPlayerView = {
  id: string;
  name: string;
  roleId: string;
  rolePhase: RolePhase;
  visibleColumns: string[];
  filters: {
    u21Only: boolean;
    freeAgentsOnly: boolean;
    minPotential: number;
    maxValueMillions: number;
  };
};

const storageKey = "bestscout.saved-player-views.v1";
const validColumnIds = new Set(playerColumns.map((column) => column.id));

export function loadSavedPlayerViews(storage?: Pick<Storage, "getItem">): SavedPlayerView[] {
  try {
    const target = storage ?? globalThis.localStorage;
    if (!target) return [];
    const value: unknown = JSON.parse(target.getItem(storageKey) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(isSavedPlayerView).slice(0, 30).map((view) => ({
      ...view,
      visibleColumns: [...new Set(["name", ...view.visibleColumns.filter((id) => validColumnIds.has(id))])],
    }));
  } catch {
    return [];
  }
}

export function persistSavedPlayerViews(views: SavedPlayerView[], storage?: Pick<Storage, "setItem">) {
  try {
    const target = storage ?? globalThis.localStorage;
    target?.setItem(storageKey, JSON.stringify(views.slice(0, 30)));
  } catch {
    // The UI remains functional when storage is disabled or read-only.
  }
}

export function createSavedPlayerView(name: string, snapshot: Omit<SavedPlayerView, "id" | "name">): SavedPlayerView {
  return {
    ...snapshot,
    id: `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim().slice(0, 60),
  };
}

function isSavedPlayerView(value: unknown): value is SavedPlayerView {
  if (!value || typeof value !== "object") return false;
  const view = value as Partial<SavedPlayerView>;
  const filters = view.filters as Partial<SavedPlayerView["filters"]> | undefined;
  return typeof view.id === "string"
    && typeof view.name === "string"
    && view.name.trim().length > 0
    && typeof view.roleId === "string"
    && (view.rolePhase === "in_possession" || view.rolePhase === "out_of_possession")
    && Array.isArray(view.visibleColumns)
    && view.visibleColumns.every((id) => typeof id === "string")
    && !!filters
    && typeof filters.u21Only === "boolean"
    && typeof filters.freeAgentsOnly === "boolean"
    && typeof filters.minPotential === "number"
    && typeof filters.maxValueMillions === "number";
}
