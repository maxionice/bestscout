export type GameDate = { year: number; month: number; day: number };

export type Contract = {
  club_id?: string | null;
  starts_on?: GameDate | null;
  expires_on?: GameDate | null;
  contract_type?: "full_time" | "part_time" | "youth" | "non_contract" | "loan" | "unknown";
  wage?: number | null;
  release_clause?: number | null;
  squad_status?: string | null;
};

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
    date_of_birth?: GameDate | null;
    reputation: number | null;
    international_reputation: number | null;
    consistency: number | null;
    important_matches: number | null;
    injury_proneness: number | null;
    versatility: number | null;
    professionalism: number | null;
    ambition: number | null;
    contract?: Contract | null;
    status?: {
      transfer_listed: boolean;
      loan_listed: boolean;
      injured: boolean;
      suspended: boolean;
      unavailable: boolean;
    };
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
  rows: PlayerQueryRow[];
};

export type RolePhase = "in_possession" | "out_of_possession";

export type RoleFamily =
  | "goalkeeper"
  | "centre_back"
  | "full_back"
  | "wing_back"
  | "defensive_midfield"
  | "central_midfield"
  | "attacking_midfield"
  | "wide_midfield"
  | "winger"
  | "forward";

export type RoleProfile = {
  id: string;
  name: string;
  phase: RolePhase;
  family: RoleFamily;
  weights: Record<string, number>;
};

export type RoleScore = {
  role_id: string;
  score: number;
  coverage: number;
  contributions: Array<{
    attribute: string;
    value: number;
    weight: number;
    contribution: number;
  }>;
};

export type PlayerQueryRow = {
  player: Player;
  role_score: RoleScore | null;
};

export type SimilarPlayer = {
  player: Player;
  similarity: number;
  coverage: number;
  role_score: RoleScore | null;
};

export type SquadAnalysis = {
  as_of: GameDate;
  player_count: number;
  average_age: number | null;
  weekly_wage_total: number;
  annual_wage_total: number;
  average_weekly_wage: number | null;
  expiring_within_year: number;
  age_bands: AnalysisBucket[];
  contract_windows: AnalysisBucket[];
  position_groups: PositionGroupAnalysis[];
  succession_risks: SuccessionRisk[];
  wage_outliers: WageOutlier[];
};

export type AnalysisBucket = {
  id: string;
  label: string;
  count: number;
  weekly_wage: number;
};

export type PositionGroupAnalysis = {
  id: string;
  label: string;
  count: number;
  average_age: number | null;
  average_current_ability: number | null;
  highest_current_ability: number | null;
  under_23_count: number;
  players: SquadPlayerSummary[];
};

export type SquadPlayerSummary = {
  id: string;
  name: string;
  age: number | null;
  current_ability: number | null;
  potential_ability: number | null;
  weekly_wage: number | null;
  contract_expires_on: GameDate | null;
};

export type SuccessionRisk = {
  position_group_id: string;
  position_group_label: string;
  severity: "critical" | "warning" | "watch";
  reasons: string[];
};

export type WageOutlier = {
  player_id: string;
  player_name: string;
  weekly_wage: number;
  share_of_total: number;
  multiple_of_average: number;
};

export type ShortlistEntry = {
  player_id: string;
  favorite: boolean;
  tags: string[];
  note: string | null;
};

export type ShortlistDocument = {
  schema_version: 1;
  entries: ShortlistEntry[];
};

export type ShortlistFormat = "json" | "csv" | "html";

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
  process_access: {
    inspection: {
      pid: number;
      region_count: number;
      readable_region_count: number;
      fm_executable_base: number | null;
      game_assembly_base: number | null;
    };
    executable_signature_valid: boolean;
  } | null;
  process_access_error: string | null;
  process_inspection_allowed: boolean;
  reader_allowed: boolean;
  editor_allowed: boolean;
  message: string;
};
