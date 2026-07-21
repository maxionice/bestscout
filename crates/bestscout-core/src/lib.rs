pub mod comparison;
pub mod editor;
pub mod fixtures;
pub mod import;
pub mod model;
pub mod query;
pub mod roles;
pub mod scoring;
pub mod shortlist;
pub mod squad;
pub mod validation;

pub use comparison::{SimilarPlayer, find_similar_players};
pub use editor::{
    AppliedTransaction, EDITOR_SCHEMA_VERSION, EditEntityKind, EditOperation, EditTransaction,
    FieldExpectation, JournalChange, JournalEntry, SnapshotBackup, TransactionError,
    TransactionJournal, apply_transaction, create_backup, restore_backup, snapshot_hash,
    undo_transaction, verify_read_back,
};
pub use fixtures::synthetic_snapshot;
pub use import::{ImportError, ImportResult, import_players};
pub use model::{
    Attribute, Club, ClubFacilities, ClubFinances, Competition, Contract, ContractType,
    DatabaseSnapshot, Foot, GameDate, HiddenAttribute, Player, PlayerDetails, PlayerStatus,
    Position, SnapshotSource, Staff, StaffAttribute, StaffRole,
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
pub use validation::{
    CURRENT_SCHEMA_VERSION, IssueSeverity, SnapshotIssue, SnapshotValidationReport,
    validate_snapshot,
};
