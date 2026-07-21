export type Player = {
  id: string;
  name: string;
  age: number | null;
  club: string | null;
  nationality: string | null;
  positions: string[];
  preferred_foot: "left" | "right" | "both" | "unknown";
  value: number | null;
  wage: number | null;
  current_ability: number | null;
  potential_ability: number | null;
  attributes: Record<string, number>;
  details?: {
    reputation: number | null;
    international_reputation: number | null;
    consistency: number | null;
    important_matches: number | null;
    injury_proneness: number | null;
    versatility: number | null;
    professionalism: number | null;
    ambition: number | null;
    tags: string[];
    note: string | null;
  };
};

export type ImportResult = {
  players: Player[];
  warnings: string[];
  delimiter: string;
};

export type Staff = {
  id: string;
  name: string;
  age: number | null;
  club: string | null;
  nationality: string | null;
  roles: string[];
  current_ability: number | null;
  potential_ability: number | null;
  reputation: number | null;
  attributes: Record<string, number>;
};

export type Club = {
  id: string;
  name: string;
  short_name: string | null;
  nation: string | null;
  competition: string | null;
  reputation: number | null;
};

export type Competition = {
  id: string;
  name: string;
  short_name: string | null;
  nation: string | null;
  reputation: number | null;
};

export type DatabaseSnapshot = {
  schema_version: number;
  source: "synthetic" | "csv" | "live" | "save_game";
  players: Player[];
  staff: Staff[];
  clubs: Club[];
  competitions: Competition[];
};

export type SearchHit = {
  kind: "player" | "staff" | "club" | "competition";
  id: string;
  name: string;
  subtitle: string;
  relevance: number;
};

export type PlayerQueryResult = {
  total: number;
  offset: number;
  rows: Array<{ player: Player; role_score: { score: number; coverage: number } | null }>;
};

export type LiveEnvironment = {
  installations: Array<{
    root: string;
    executable: string;
    game_assembly: string;
    global_metadata: string;
    steam_build_id: string | null;
    build_fingerprint: {
      executable: { sha256: string; size: number };
      game_assembly: { sha256: string; size: number };
      global_metadata: { sha256: string; size: number };
    } | null;
    compatibility: {
      status: "unknown" | "fingerprint_mismatch" | "exact";
      profile_id: string | null;
      label: string | null;
      capabilities: {
        process_inspection: boolean;
        domain_read: boolean;
        domain_write: boolean;
      };
      reason: string;
    } | null;
  }>;
  processes: Array<{ pid: number; command: string }>;
  bridge: {
    health: { bridge_version: string; pid: number; read_only: boolean };
    capabilities: { health: boolean; domain_read: boolean; domain_write: boolean };
  } | null;
  process_inspection_allowed: boolean;
  reader_allowed: boolean;
  editor_allowed: boolean;
  message: string;
};
