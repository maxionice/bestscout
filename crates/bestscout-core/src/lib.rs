pub mod fixtures;
pub mod import;
pub mod model;
pub mod query;
pub mod roles;
pub mod scoring;
pub mod validation;

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
pub use validation::{
    CURRENT_SCHEMA_VERSION, IssueSeverity, SnapshotIssue, SnapshotValidationReport,
    validate_snapshot,
};
