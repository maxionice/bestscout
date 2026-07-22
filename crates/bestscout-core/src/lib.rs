pub mod availability;
pub mod clubs;
pub mod comparison;
pub mod editor;
pub mod fixtures;
pub mod freezer;
pub mod import;
pub mod intelligence;
pub mod model;
pub mod people;
pub mod query;
pub mod roles;
pub mod scoring;
pub mod shortlist;
pub mod squad;
pub mod transfers;
pub mod validation;

pub use availability::{
    AVAILABILITY_SCHEMA_VERSION, AvailabilityAction, AvailabilityActionRequest,
    AvailabilityCriteria, AvailabilityError, AvailabilityIssue, AvailabilityIssueKind,
    AvailabilityReport, AvailabilityState, PlayerAvailability, PreparedAvailabilityAction,
    analyse_player_availability, prepare_availability_action,
};
pub use clubs::{
    ClubActionRequest, ClubCommand, ClubError, PreparedClubAction, prepare_club_action,
};
pub use comparison::{SimilarPlayer, find_similar_players};
pub use editor::{
    AppliedTransaction, EDITOR_SCHEMA_VERSION, EditEntityKind, EditOperation, EditTransaction,
    EditorPreset, FieldExpectation, JournalChange, JournalEntry, MassEditRequest, PreparedMassEdit,
    PresetChange, PresetStrategy, SnapshotBackup, TransactionError, TransactionJournal,
    apply_transaction, create_backup, prepare_mass_edit, restore_backup, snapshot_hash,
    undo_transaction, verify_read_back,
};
pub use fixtures::synthetic_snapshot;
pub use freezer::{
    FREEZER_SCHEMA_VERSION, FreezeObservation, FreezeObservationState, FreezePlan, FreezePolicy,
    FreezeReport, FreezeRule, FreezerError, PreparedFreezeCorrection, evaluate_freeze_plan,
    prepare_freeze_correction, validate_freeze_plan,
};
pub use import::{ImportError, ImportResult, import_players};
pub use intelligence::{
    DevelopmentProjection, IntelligenceCriteria, PlayerIntelligence, ProjectionFactor,
    ScoutIntelligenceReport, analyse_scout_intelligence,
};
pub use model::{
    Attribute, BanScope, Club, ClubFacilities, ClubFinances, Competition, Contract, ContractType,
    DatabaseSnapshot, Foot, FutureTransfer, GameDate, HiddenAttribute, InjurySeverity,
    InjuryTreatment, LanguageSkill, PersonRelationship, Player, PlayerBan, PlayerDetails,
    PlayerFitness, PlayerInjury, PlayerRegistration, PlayerStatus, Position, RegistrationStatus,
    RelationshipKind, RelationshipTargetKind, SnapshotSource, Staff, StaffAttribute, StaffDetails,
    StaffQualification, StaffResponsibility, StaffRole, TransferKind, TransferStatus,
};
pub use people::{
    PeopleActionRequest, PeopleCommand, PeopleError, PreparedPeopleAction, prepare_people_action,
};
pub use query::{
    EntityKind, FilterExpression, GlobalSearchQuery, PlayerPredicate, PlayerQuery,
    PlayerQueryResult, PlayerQueryRow, PlayerSort, PlayerSortField, SearchHit, SortDirection,
    global_search, query_players,
};
pub use roles::{builtin_roles, in_possession_roles, out_of_possession_roles};
pub use scoring::{RoleFamily, RolePhase, RoleProfile, ScoreBreakdown, score_player};
pub use shortlist::{
    SHORTLIST_SCHEMA_VERSION, ShortlistDocument, ShortlistEntry, ShortlistError, ShortlistFormat,
    export_shortlist, import_shortlist, normalize_shortlist,
};
pub use squad::{
    AnalysisBucket, PositionGroupAnalysis, RiskSeverity, SquadAnalysis, SquadPlayerSummary,
    SuccessionRisk, WageOutlier, analyse_squad,
};
pub use transfers::{
    PreparedTransferAction, TransferActionRequest, TransferCommand, TransferError,
    prepare_transfer_action,
};
pub use validation::{
    CURRENT_SCHEMA_VERSION, IssueSeverity, SnapshotIssue, SnapshotValidationReport,
    validate_snapshot,
};
