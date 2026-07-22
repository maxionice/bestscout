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

export type TransferKind = "permanent" | "loan" | "free_transfer" | "swap";
export type TransferStatus = "agreed" | "confirmed" | "completed" | "cancelled";

export type FutureTransfer = {
  id: string;
  kind: TransferKind;
  from_club_id: string | null;
  to_club_id: string;
  arranged_on: GameDate | null;
  effective_on: GameDate;
  fee: number | null;
  loan_end: GameDate | null;
  wage_contribution_percent: number | null;
  swap_player_id: string | null;
  status: TransferStatus;
};

export type LanguageSkill = {
  language: string;
  speaking: number;
  reading: number;
  writing: number;
};

export type RelationshipTargetKind = "player" | "staff" | "club";
export type RelationshipKind =
  | "favorite_person" | "disliked_person" | "friend" | "mentor" | "family" | "agent"
  | "favorite_club" | "disliked_club";

export type PersonRelationship = {
  id: string;
  kind: RelationshipKind;
  target_kind: RelationshipTargetKind;
  target_id: string;
  strength: number;
};

export type HairColour = "black" | "brown" | "blond" | "red" | "grey" | "white" | "other" | "unknown";
export type HairLength = "bald" | "short" | "medium" | "long" | "unknown";

export type PersonAppearance = {
  height_cm: number | null;
  weight_kg: number | null;
  skin_tone: number | null;
  hair_colour: HairColour;
  hair_length: HairLength;
  ethnicity: string | null;
};

export type PreferredMove = {
  id: string;
  name: string;
};

export type RegistrationStatus = "registered" | "pending" | "unregistered" | "ineligible";

export type PlayerRegistration = {
  id: string;
  competition_id: string;
  club_id: string;
  status: RegistrationStatus;
  registered_on: GameDate | null;
  expires_on: GameDate | null;
  squad_number: number | null;
  homegrown_at_club: boolean;
  homegrown_in_nation: boolean;
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
    secondary_nationalities?: string[];
    appearance?: PersonAppearance;
    preferred_moves?: PreferredMove[];
    reputation: number | null;
    international_reputation: number | null;
    consistency: number | null;
    important_matches: number | null;
    injury_proneness: number | null;
    versatility: number | null;
    professionalism: number | null;
    ambition: number | null;
    contract?: Contract | null;
    future_transfer?: FutureTransfer | null;
    fitness?: {
      condition: number | null;
      match_fitness: number | null;
      fatigue: number | null;
      jadedness: number | null;
    };
    morale?: number | null;
    happiness?: number | null;
    injuries?: PlayerInjury[];
    bans?: PlayerBan[];
    languages?: LanguageSkill[];
    relationships?: PersonRelationship[];
    registrations?: PlayerRegistration[];
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

export type InjurySeverity = "minor" | "moderate" | "serious" | "severe" | "career_threatening" | "unknown";
export type InjuryTreatment = "none" | "physio" | "rehabilitation" | "specialist" | "surgery" | "unknown";

export type PlayerInjury = {
  id: string;
  name: string;
  body_area: string | null;
  severity: InjurySeverity;
  started_on: GameDate | null;
  expected_return: GameDate | null;
  days_remaining: number | null;
  recurring: boolean;
  treatment: InjuryTreatment;
};

export type BanScope = "domestic" | "continental" | "international" | "all_competitions" | "unknown";

export type PlayerBan = {
  id: string;
  reason: string;
  competition_id: string | null;
  scope: BanScope;
  starts_on: GameDate | null;
  ends_on: GameDate | null;
  matches_remaining: number | null;
};

export type ImportResult = {
  players: Player[];
  warnings: string[];
  delimiter: string;
};

export type FacepackRequest = {
  pack_id: string;
  selected_player_ids: string[];
  seed: string;
  confirm_newgens: boolean;
};

export type FacepackFilesystemRequest = {
  source_directory: string;
  destination_root: string;
  plan: FacepackRequest;
};

export type FacepackAssignment = {
  player_id: string;
  player_name: string;
  target_id: string;
  source_name: string;
  source_sha256: string;
  output_filename: string;
  resource_name: string;
};

export type FacepackPlan = {
  schema_version: number;
  pack_id: string;
  seed: string;
  assignments: FacepackAssignment[];
  unused_image_count: number;
  plan_hash: string;
};

export type FacepackPreview = {
  plan: FacepackPlan;
  source_directory: string;
  target_directory: string;
  config_xml: string;
};

export type InstalledFacepack = {
  target_directory: string;
  plan_hash: string;
  assignment_count: number;
  file_count: number;
};

export type RemovedFacepack = {
  target_directory: string;
  removed_file_count: number;
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
  details?: {
    date_of_birth?: GameDate | null;
    secondary_nationalities?: string[];
    appearance?: PersonAppearance;
    languages?: LanguageSkill[];
    relationships?: PersonRelationship[];
    responsibilities?: string[];
    qualifications?: Array<{
      id: string;
      name: string;
      level: number;
      awarded_on: GameDate | null;
      expires_on: GameDate | null;
    }>;
    note?: string | null;
  };
};

export type ClubFinances = {
  balance: number | null;
  transfer_budget: number | null;
  wage_budget: number | null;
  debt: number | null;
};

export type ClubFacilities = {
  training: number | null;
  youth: number | null;
  youth_recruitment: number | null;
  junior_coaching: number | null;
};

export type ClubKitKind = "home" | "away" | "third" | "goalkeeper";

export type ClubKit = {
  id: string;
  kind: ClubKitKind;
  shirt_colour: string;
  shorts_colour: string;
  socks_colour: string;
  trim_colour: string | null;
  pattern: string | null;
};

export type ClubBranding = {
  primary_colour: string | null;
  secondary_colour: string | null;
  kits: ClubKit[];
};

export type ClubRelationshipKind = "rival" | "affiliate" | "parent" | "feeder" | "friendly";

export type ClubRelationship = {
  id: string;
  kind: ClubRelationshipKind;
  target_club_id: string;
  strength: number;
};

export type Club = {
  id: string;
  name: string;
  short_name: string | null;
  nation: string | null;
  competition: string | null;
  competition_id?: string | null;
  reputation: number | null;
  professional_status?: string | null;
  stadium?: string | null;
  stadium_capacity?: number | null;
  average_attendance?: number | null;
  finances?: ClubFinances;
  facilities?: ClubFacilities;
  branding?: ClubBranding;
  relationships?: ClubRelationship[];
};

export type Competition = {
  id: string;
  name: string;
  short_name: string | null;
  nation: string | null;
  reputation: number | null;
  current_champion?: string | null;
  current_champion_club_id?: string | null;
  level?: number | null;
  stages?: CompetitionStage[];
  fixtures?: CompetitionFixture[];
  standings?: CompetitionStanding[];
};

export type CompetitionStageKind = "league" | "group" | "knockout" | "qualifying" | "playoff" | "final";

export type CompetitionStage = {
  id: string;
  name: string;
  kind: CompetitionStageKind;
  order: number;
  starts_on: GameDate | null;
  ends_on: GameDate | null;
  current: boolean;
};

export type FixtureStatus = "scheduled" | "in_progress" | "played" | "postponed" | "cancelled";

export type CompetitionFixture = {
  id: string;
  stage_id: string | null;
  home_club_id: string;
  away_club_id: string;
  scheduled_on: GameDate | null;
  status: FixtureStatus;
  home_score: number | null;
  away_score: number | null;
  round: string | null;
  venue: string | null;
};

export type CompetitionStanding = {
  stage_id: string | null;
  club_id: string;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
};

export type DatabaseSnapshot = {
  schema_version: number;
  source: "synthetic" | "csv" | "live" | "save_game";
  game_date?: GameDate | null;
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

export type FreezePolicy = "exact" | "allow_increase" | "monitor_only";

export type FreezeRule = {
  entity_kind: EditEntityKind;
  entity_id: string;
  field: string;
  baseline: unknown;
  policy: FreezePolicy;
};

export type FreezePlan = {
  schema_version: 1;
  id: string;
  name: string;
  created_at_utc: string;
  updated_at_utc: string;
  snapshot_source: DatabaseSnapshot["source"];
  enabled: boolean;
  rules: FreezeRule[];
};

export type FreezeObservationState =
  | "unchanged"
  | "allowed_increase"
  | "observed_change"
  | "violation"
  | "missing_entity"
  | "missing_field"
  | "type_mismatch";

export type FreezeObservation = FreezeRule & {
  current: unknown | null;
  state: FreezeObservationState;
  numeric_delta: number | null;
};

export type FreezeReport = {
  schema_version: 1;
  plan_id: string;
  checked_at_utc: string;
  snapshot_hash: string;
  total_rules: number;
  unchanged_count: number;
  allowed_increase_count: number;
  monitored_change_count: number;
  violation_count: number;
  unresolved_count: number;
  observations: FreezeObservation[];
};

export type PreparedFreezeCorrection = {
  report: FreezeReport;
  transaction: EditTransaction | null;
  preview: AppliedTransaction | null;
};

export type AvailabilityCriteria = {
  as_of: GameDate;
  low_condition_below: number;
  low_match_fitness_below: number;
  high_fatigue_above: number;
  high_jadedness_above: number;
  low_morale_below: number;
  low_happiness_below: number;
};

export type AvailabilityState = "available" | "managed" | "doubtful" | "unavailable";

export type AvailabilityIssueKind =
  | "injury"
  | "ban"
  | "unavailable_flag"
  | "low_condition"
  | "low_match_fitness"
  | "high_fatigue"
  | "high_jadedness"
  | "low_morale"
  | "unhappy";

export type AvailabilityIssue = {
  kind: AvailabilityIssueKind;
  impact: AvailabilityState;
  detail: string;
};

export type PlayerAvailability = {
  player_id: string;
  player_name: string;
  club: string | null;
  state: AvailabilityState;
  score: number;
  condition: number | null;
  match_fitness: number | null;
  fatigue: number | null;
  jadedness: number | null;
  morale: number | null;
  happiness: number | null;
  active_injuries: PlayerInjury[];
  active_bans: PlayerBan[];
  issues: AvailabilityIssue[];
};

export type AvailabilityReport = {
  schema_version: 1;
  as_of: GameDate;
  snapshot_hash: string;
  total_players: number;
  available_count: number;
  managed_count: number;
  doubtful_count: number;
  unavailable_count: number;
  players: PlayerAvailability[];
};

export type AvailabilityAction =
  | "restore_condition"
  | "clear_injuries"
  | "clear_bans"
  | "stabilize_morale"
  | "make_match_ready";

export type AvailabilityActionRequest = {
  transaction_id: string;
  created_at_utc: string;
  player_ids: string[];
  action: AvailabilityAction;
};

export type PreparedAvailabilityAction = {
  action: AvailabilityAction;
  affected_player_count: number;
  transaction: EditTransaction;
  preview: AppliedTransaction;
};

export type TransferCommand =
  | { kind: "move_now"; player_id: string; destination_club_id: string; contract: Contract }
  | { kind: "arrange_future"; player_id: string; transfer: FutureTransfer }
  | { kind: "cancel_future"; player_id: string }
  | { kind: "complete_future"; player_id: string; contract: Contract }
  | {
      kind: "swap_now";
      player_id: string;
      swap_player_id: string;
      player_contract: Contract;
      swap_player_contract: Contract;
    }
  | {
      kind: "arrange_future_swap";
      player_id: string;
      swap_player_id: string;
      transfer: FutureTransfer;
      reciprocal_transfer: FutureTransfer;
    }
  | {
      kind: "complete_future_swap";
      player_id: string;
      swap_player_id: string;
      player_contract: Contract;
      swap_player_contract: Contract;
    };

export type TransferActionRequest = {
  transaction_id: string;
  created_at_utc: string;
  command: TransferCommand;
};

export type PreparedTransferAction = {
  command: TransferCommand;
  transaction: EditTransaction;
  preview: AppliedTransaction;
};

export type PeopleCommand =
  | {
      kind: "update_player_identity";
      player_id: string;
      name: string;
      nationality: string | null;
      secondary_nationalities: string[];
      positions: string[];
      preferred_foot: Player["preferred_foot"];
      appearance: PersonAppearance;
      preferred_moves: PreferredMove[];
    }
  | {
      kind: "update_staff_identity";
      staff_id: string;
      name: string;
      nationality: string | null;
      secondary_nationalities: string[];
      appearance: PersonAppearance;
    }
  | {
      kind: "update_staff_assignment";
      staff_id: string;
      roles: string[];
      responsibilities: string[];
      contract: Contract | null;
    }
  | {
      kind: "update_staff_profile";
      staff_id: string;
      date_of_birth: GameDate | null;
      note: string | null;
    }
  | { kind: "set_player_languages"; player_id: string; languages: LanguageSkill[] }
  | { kind: "set_staff_languages"; staff_id: string; languages: LanguageSkill[] }
  | {
      kind: "set_staff_qualifications";
      staff_id: string;
      qualifications: NonNullable<NonNullable<Staff["details"]>["qualifications"]>;
    }
  | { kind: "upsert_player_registration"; player_id: string; registration: PlayerRegistration }
  | { kind: "remove_player_registration"; player_id: string; registration_id: string }
  | { kind: "upsert_player_relationship"; player_id: string; relationship: PersonRelationship }
  | { kind: "remove_player_relationship"; player_id: string; relationship_id: string }
  | { kind: "upsert_staff_relationship"; staff_id: string; relationship: PersonRelationship }
  | { kind: "remove_staff_relationship"; staff_id: string; relationship_id: string };

export type PeopleActionRequest = {
  transaction_id: string;
  created_at_utc: string;
  command: PeopleCommand;
};

export type PreparedPeopleAction = {
  command: PeopleCommand;
  transaction: EditTransaction;
  preview: AppliedTransaction;
};

export type ClubCommand =
  | {
      kind: "update_identity";
      club_id: string;
      name: string;
      short_name: string | null;
      nation: string | null;
      competition_id: string | null;
      reputation: number | null;
      professional_status: string | null;
    }
  | {
      kind: "update_stadium";
      club_id: string;
      stadium: string | null;
      stadium_capacity: number | null;
      average_attendance: number | null;
    }
  | { kind: "update_finances"; club_id: string; finances: ClubFinances }
  | { kind: "update_facilities"; club_id: string; facilities: ClubFacilities }
  | { kind: "update_branding"; club_id: string; branding: ClubBranding }
  | { kind: "upsert_relationship"; club_id: string; relationship: ClubRelationship }
  | { kind: "remove_relationship"; club_id: string; relationship_id: string };

export type ClubActionRequest = {
  transaction_id: string;
  created_at_utc: string;
  command: ClubCommand;
};

export type PreparedClubAction = {
  command: ClubCommand;
  transaction: EditTransaction;
  preview: AppliedTransaction;
};

export type CompetitionCommand =
  | {
      kind: "update_profile";
      competition_id: string;
      name: string;
      short_name: string | null;
      nation: string | null;
      reputation: number | null;
      current_champion_club_id: string | null;
      level: number | null;
    }
  | { kind: "set_stages"; competition_id: string; stages: CompetitionStage[] }
  | { kind: "upsert_fixture"; competition_id: string; fixture: CompetitionFixture }
  | { kind: "remove_fixture"; competition_id: string; fixture_id: string }
  | { kind: "set_standings"; competition_id: string; standings: CompetitionStanding[] };

export type CompetitionActionRequest = {
  transaction_id: string;
  created_at_utc: string;
  command: CompetitionCommand;
};

export type PreparedCompetitionAction = {
  command: CompetitionCommand;
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
  runtime_sandbox: "none" | "flatpak";
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
  bridge_deployment: {
    state: "not_installed" | "managed" | "unmanaged_file" | "missing_binary" | "invalid_manifest" | "modified" | "transaction_residue";
    plugin_directory: string;
    bridge_path: string;
    manifest_path: string;
    manifest: {
      schema_version: number;
      bridge_version: string;
      profile_id: string;
      bridge_filename: string;
      sha256: string;
      size: number;
      installed_at_unix_seconds: number;
    } | null;
    observed_artifact: { sha256: string; size: number } | null;
    reason: string;
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
