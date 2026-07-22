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
  contract?: Contract | null;
};

export type Club = {
  id: string;
  name: string;
  short_name: string | null;
  nation: string | null;
  competition: string | null;
  reputation: number | null;
  professional_status?: string | null;
  stadium?: string | null;
  stadium_capacity?: number | null;
  average_attendance?: number | null;
  finances?: {
    balance: number | null;
    transfer_budget: number | null;
    wage_budget: number | null;
    debt: number | null;
  };
  facilities?: {
    training: number | null;
    youth: number | null;
    youth_recruitment: number | null;
    junior_coaching: number | null;
  };
};

export type Competition = {
  id: string;
  name: string;
  short_name: string | null;
  nation: string | null;
  reputation: number | null;
  current_champion?: string | null;
  level?: number | null;
};

export type DatabaseSnapshot = {
  schema_version: number;
  source: "synthetic" | "csv" | "live" | "save_game";
  players: Player[];
  staff: Staff[];
  clubs: Club[];
  competitions: Competition[];
};

export type EditEntityKind = "player" | "staff" | "club" | "competition";

export type FieldExpectation =
  | { mode: "any" }
  | { mode: "exact"; value: unknown };

export type EditOperation = {
  entity_kind: EditEntityKind;
  entity_id: string;
  field: string;
  expected_before: FieldExpectation;
  after: unknown;
};

export type EditTransaction = {
  schema_version: 1;
  id: string;
  created_at_utc: string;
  reason: string | null;
  operations: EditOperation[];
};

export type PresetStrategy =
  | { kind: "set"; value: unknown }
  | { kind: "add_number"; delta: number }
  | { kind: "scale_number"; factor: number }
  | { kind: "clamp_number"; minimum: number; maximum: number };

export type PresetChange = {
  field: string;
  strategy: PresetStrategy;
};

export type EditorPreset = {
  schema_version: 1;
  id: string;
  name: string;
  entity_kind: EditEntityKind;
  changes: PresetChange[];
};

export type MassEditRequest = {
  transaction_id: string;
  created_at_utc: string;
  reason: string | null;
  entity_ids: string[];
  preset: EditorPreset;
};

export type PreparedMassEdit = {
  transaction: EditTransaction;
  preview: AppliedTransaction;
};

export type JournalChange = {
  entity_kind: EditEntityKind;
  entity_id: string;
  field: string;
  before: unknown;
  after: unknown;
};

export type JournalEntry = {
  schema_version: 1;
  transaction_id: string;
  created_at_utc: string;
  reason: string | null;
  reverts_transaction_id: string | null;
  snapshot_before_hash: string;
  snapshot_after_hash: string;
  changes: JournalChange[];
};

export type AppliedTransaction = {
  snapshot: DatabaseSnapshot;
  journal_entry: JournalEntry;
};

export type TransactionJournal = {
  schema_version: 1;
  entries: JournalEntry[];
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

export type IntelligenceCriteria = {
  as_of: GameDate;
  wonderkid_max_age: number;
  wonderkid_min_potential: number;
  bargain_max_value: number;
  bargain_min_projected_peak: number;
  expiring_within_days: number;
};

export type ProjectionFactor = {
  id: string;
  label: string;
  score: number;
  weight: number;
  observed: boolean;
  explanation: string;
};

export type DevelopmentProjection = {
  projected_peak_ability: number;
  reach_potential_probability: number;
  confidence: number;
  ability_gain: number;
  years_to_peak: number;
  attribute_peaks: Record<string, number>;
  factors: ProjectionFactor[];
};

export type PlayerIntelligence = {
  player: Player;
  projection: DevelopmentProjection | null;
  is_wonderkid: boolean;
  is_bargain: boolean;
  is_free_agent: boolean;
  is_expiring_contract: boolean;
  bargain_score: number | null;
  contract_days_remaining: number | null;
  discovery_score: number;
};

export type ScoutIntelligenceReport = {
  criteria: IntelligenceCriteria;
  players: PlayerIntelligence[];
  wonderkid_count: number;
  bargain_count: number;
  free_agent_count: number;
  expiring_contract_count: number;
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
    domain_roots?: {
      schema_version: number;
      checked_at_utc: string;
      state: "not_started" | "waiting_for_game" | "roots_resolved" | "probe_failed";
      initialiser_count: number;
      initialisation_complete: boolean;
      context_module_count: number;
      interop_subsystem_count: number;
      database_factory_available: boolean;
      reference_metadata: {
        game_properties: number;
        person_properties: number;
        club_properties: number;
        competition_properties: number;
        person_search_properties: number;
        person_summary_properties: number;
        club_summary_properties: number;
        competition_summary_properties: number;
      };
      error: string | null;
    };
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
