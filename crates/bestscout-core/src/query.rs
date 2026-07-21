use std::cmp::Ordering;

use serde::{Deserialize, Serialize};

use crate::{
    Attribute, DatabaseSnapshot, GameDate, HiddenAttribute, Player, ScoreBreakdown, builtin_roles,
    score_player,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntityKind {
    Player,
    Staff,
    Club,
    Competition,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GlobalSearchQuery {
    pub text: String,
    #[serde(default)]
    pub kinds: Vec<EntityKind>,
    #[serde(default = "default_search_limit")]
    pub limit: usize,
}

fn default_search_limit() -> usize {
    30
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SearchHit {
    pub kind: EntityKind,
    pub id: String,
    pub name: String,
    pub subtitle: String,
    pub relevance: u16,
}

pub fn global_search(snapshot: &DatabaseSnapshot, query: &GlobalSearchQuery) -> Vec<SearchHit> {
    let needle = normalize(&query.text);
    if needle.is_empty() {
        return Vec::new();
    }
    let accepts = |kind| query.kinds.is_empty() || query.kinds.contains(&kind);
    let mut hits = Vec::new();

    if accepts(EntityKind::Player) {
        hits.extend(snapshot.players.iter().filter_map(|player| {
            let aliases = [player.club.as_deref(), player.nationality.as_deref()];
            search_relevance(&needle, &player.name, aliases).map(|relevance| SearchHit {
                kind: EntityKind::Player,
                id: player.id.clone(),
                name: player.name.clone(),
                subtitle: join_subtitle([
                    player.club.as_deref(),
                    player.age.map(|age| format!("{age} Jahre")).as_deref(),
                ]),
                relevance,
            })
        }));
    }
    if accepts(EntityKind::Staff) {
        hits.extend(snapshot.staff.iter().filter_map(|staff| {
            let aliases = [staff.club.as_deref(), staff.nationality.as_deref()];
            search_relevance(&needle, &staff.name, aliases).map(|relevance| SearchHit {
                kind: EntityKind::Staff,
                id: staff.id.clone(),
                name: staff.name.clone(),
                subtitle: join_subtitle([staff.club.as_deref(), staff.nationality.as_deref()]),
                relevance,
            })
        }));
    }
    if accepts(EntityKind::Club) {
        hits.extend(snapshot.clubs.iter().filter_map(|club| {
            let aliases = [
                club.short_name.as_deref(),
                club.nation.as_deref(),
                club.competition.as_deref(),
            ];
            search_relevance(&needle, &club.name, aliases).map(|relevance| SearchHit {
                kind: EntityKind::Club,
                id: club.id.clone(),
                name: club.name.clone(),
                subtitle: join_subtitle([club.competition.as_deref(), club.nation.as_deref()]),
                relevance,
            })
        }));
    }
    if accepts(EntityKind::Competition) {
        hits.extend(snapshot.competitions.iter().filter_map(|competition| {
            let aliases = [
                competition.short_name.as_deref(),
                competition.nation.as_deref(),
            ];
            search_relevance(&needle, &competition.name, aliases).map(|relevance| SearchHit {
                kind: EntityKind::Competition,
                id: competition.id.clone(),
                name: competition.name.clone(),
                subtitle: competition.nation.clone().unwrap_or_default(),
                relevance,
            })
        }));
    }

    hits.sort_by(|left, right| {
        right
            .relevance
            .cmp(&left.relevance)
            .then_with(|| left.name.cmp(&right.name))
            .then_with(|| left.id.cmp(&right.id))
    });
    hits.truncate(query.limit.clamp(1, 200));
    hits
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "operator", content = "items", rename_all = "snake_case")]
pub enum FilterExpression {
    All(Vec<FilterExpression>),
    Any(Vec<FilterExpression>),
    Not(Box<FilterExpression>),
    Predicate(PlayerPredicate),
}

impl Default for FilterExpression {
    fn default() -> Self {
        Self::All(Vec::new())
    }
}

impl FilterExpression {
    pub fn matches(&self, player: &Player) -> bool {
        match self {
            Self::All(filters) => filters.iter().all(|filter| filter.matches(player)),
            Self::Any(filters) => filters.iter().any(|filter| filter.matches(player)),
            Self::Not(filter) => !filter.matches(player),
            Self::Predicate(predicate) => predicate.matches(player),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PlayerPredicate {
    TextContains {
        value: String,
    },
    AgeBetween {
        minimum: u8,
        maximum: u8,
    },
    CurrentAbilityBetween {
        minimum: u16,
        maximum: u16,
    },
    PotentialAbilityBetween {
        minimum: u16,
        maximum: u16,
    },
    ValueBetween {
        minimum: f64,
        maximum: f64,
    },
    WageAtMost {
        maximum: f64,
    },
    ReputationAtLeast {
        minimum: u16,
    },
    AttributeAtLeast {
        attribute: Attribute,
        minimum: u8,
    },
    HiddenAttributeAtLeast {
        attribute: HiddenAttribute,
        minimum: u8,
    },
    PositionAny {
        values: Vec<String>,
    },
    ClubAny {
        values: Vec<String>,
    },
    NationalityAny {
        values: Vec<String>,
    },
    ContractExpiresOnOrBefore {
        date: GameDate,
    },
    FreeAgent,
    TransferListed,
    LoanListed,
    Injured,
}

impl PlayerPredicate {
    pub fn matches(&self, player: &Player) -> bool {
        match self {
            Self::TextContains { value } => {
                let needle = normalize(value);
                !needle.is_empty()
                    && [
                        Some(player.name.as_str()),
                        player.club.as_deref(),
                        player.nationality.as_deref(),
                    ]
                    .into_iter()
                    .flatten()
                    .chain(player.positions.iter().map(String::as_str))
                    .any(|candidate| normalize(candidate).contains(&needle))
            }
            Self::AgeBetween { minimum, maximum } => within(player.age, *minimum, *maximum),
            Self::CurrentAbilityBetween { minimum, maximum } => {
                within(player.current_ability, *minimum, *maximum)
            }
            Self::PotentialAbilityBetween { minimum, maximum } => {
                within(player.potential_ability, *minimum, *maximum)
            }
            Self::ValueBetween { minimum, maximum } => {
                within_float(player.value, *minimum, *maximum)
            }
            Self::WageAtMost { maximum } => player.wage.is_some_and(|value| value <= *maximum),
            Self::ReputationAtLeast { minimum } => player
                .details
                .reputation
                .is_some_and(|value| value >= *minimum),
            Self::AttributeAtLeast { attribute, minimum } => player
                .attribute(*attribute)
                .is_some_and(|value| value >= *minimum),
            Self::HiddenAttributeAtLeast { attribute, minimum } => player
                .details
                .hidden_attribute(*attribute)
                .is_some_and(|value| value >= *minimum),
            Self::PositionAny { values } => contains_any(&player.positions, values),
            Self::ClubAny { values } => player
                .club
                .as_ref()
                .is_some_and(|club| equals_any(club, values)),
            Self::NationalityAny { values } => player
                .nationality
                .as_ref()
                .is_some_and(|nation| equals_any(nation, values)),
            Self::ContractExpiresOnOrBefore { date } => player
                .details
                .contract
                .as_ref()
                .and_then(|contract| contract.expires_on)
                .is_some_and(|expiry| expiry <= *date),
            Self::FreeAgent => player
                .club
                .as_ref()
                .is_none_or(|club| club.trim().is_empty()),
            Self::TransferListed => player.details.status.transfer_listed,
            Self::LoanListed => player.details.status.loan_listed,
            Self::Injured => player.details.status.injured,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlayerSortField {
    Name,
    Age,
    Value,
    Wage,
    CurrentAbility,
    PotentialAbility,
    Reputation,
    RoleScore,
    Attribute(Attribute),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SortDirection {
    Ascending,
    #[default]
    Descending,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlayerSort {
    pub field: PlayerSortField,
    pub direction: SortDirection,
}

impl Default for PlayerSort {
    fn default() -> Self {
        Self {
            field: PlayerSortField::Name,
            direction: SortDirection::Ascending,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlayerQuery {
    #[serde(default)]
    pub filter: FilterExpression,
    #[serde(default)]
    pub sort: PlayerSort,
    pub role_id: Option<String>,
    #[serde(default)]
    pub offset: usize,
    #[serde(default = "default_player_limit")]
    pub limit: usize,
}

fn default_player_limit() -> usize {
    100
}

impl Default for PlayerQuery {
    fn default() -> Self {
        Self {
            filter: FilterExpression::default(),
            sort: PlayerSort::default(),
            role_id: None,
            offset: 0,
            limit: default_player_limit(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlayerQueryRow {
    pub player: Player,
    pub role_score: Option<ScoreBreakdown>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlayerQueryResult {
    pub total: usize,
    pub offset: usize,
    pub rows: Vec<PlayerQueryRow>,
}

pub fn query_players(players: &[Player], query: &PlayerQuery) -> PlayerQueryResult {
    let role = query
        .role_id
        .as_deref()
        .and_then(|id| builtin_roles().iter().find(|role| role.id == id));
    let mut rows: Vec<_> = players
        .iter()
        .filter(|player| query.filter.matches(player))
        .map(|player| PlayerQueryRow {
            player: player.clone(),
            role_score: role.as_ref().map(|role| score_player(player, role)),
        })
        .collect();
    rows.sort_by(|left, right| compare_rows(left, right, &query.sort));
    let total = rows.len();
    let offset = query.offset.min(total);
    let limit = query.limit.clamp(1, 10_000);
    let rows = rows.into_iter().skip(offset).take(limit).collect();
    PlayerQueryResult {
        total,
        offset,
        rows,
    }
}

fn compare_rows(left: &PlayerQueryRow, right: &PlayerQueryRow, sort: &PlayerSort) -> Ordering {
    let order = match sort.field {
        PlayerSortField::Name => left.player.name.cmp(&right.player.name),
        PlayerSortField::Age => compare_optional(left.player.age, right.player.age),
        PlayerSortField::Value => compare_optional_float(left.player.value, right.player.value),
        PlayerSortField::Wage => compare_optional_float(left.player.wage, right.player.wage),
        PlayerSortField::CurrentAbility => {
            compare_optional(left.player.current_ability, right.player.current_ability)
        }
        PlayerSortField::PotentialAbility => compare_optional(
            left.player.potential_ability,
            right.player.potential_ability,
        ),
        PlayerSortField::Reputation => compare_optional(
            left.player.details.reputation,
            right.player.details.reputation,
        ),
        PlayerSortField::RoleScore => compare_optional_float(
            left.role_score.as_ref().map(|score| score.score),
            right.role_score.as_ref().map(|score| score.score),
        ),
        PlayerSortField::Attribute(attribute) => compare_optional(
            left.player.attribute(attribute),
            right.player.attribute(attribute),
        ),
    };
    let order = match sort.direction {
        SortDirection::Ascending => order,
        SortDirection::Descending => reverse_known(order, &sort.field, left, right),
    };
    order
        .then_with(|| left.player.name.cmp(&right.player.name))
        .then_with(|| left.player.id.cmp(&right.player.id))
}

fn reverse_known(
    order: Ordering,
    field: &PlayerSortField,
    left: &PlayerQueryRow,
    right: &PlayerQueryRow,
) -> Ordering {
    let missing = match field {
        PlayerSortField::Name => None,
        PlayerSortField::Age => missing_order(left.player.age, right.player.age),
        PlayerSortField::Value => missing_order(left.player.value, right.player.value),
        PlayerSortField::Wage => missing_order(left.player.wage, right.player.wage),
        PlayerSortField::CurrentAbility => {
            missing_order(left.player.current_ability, right.player.current_ability)
        }
        PlayerSortField::PotentialAbility => missing_order(
            left.player.potential_ability,
            right.player.potential_ability,
        ),
        PlayerSortField::Reputation => missing_order(
            left.player.details.reputation,
            right.player.details.reputation,
        ),
        PlayerSortField::RoleScore => missing_order(
            left.role_score.as_ref().map(|score| score.score),
            right.role_score.as_ref().map(|score| score.score),
        ),
        PlayerSortField::Attribute(attribute) => missing_order(
            left.player.attribute(*attribute),
            right.player.attribute(*attribute),
        ),
    };
    missing.unwrap_or_else(|| order.reverse())
}

fn compare_optional<T: Ord>(left: Option<T>, right: Option<T>) -> Ordering {
    match (left, right) {
        (Some(left), Some(right)) => left.cmp(&right),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => Ordering::Equal,
    }
}

fn compare_optional_float(left: Option<f64>, right: Option<f64>) -> Ordering {
    match (left, right) {
        (Some(left), Some(right)) => left.total_cmp(&right),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => Ordering::Equal,
    }
}

fn missing_order<T>(left: Option<T>, right: Option<T>) -> Option<Ordering> {
    match (left.is_some(), right.is_some()) {
        (true, false) => Some(Ordering::Less),
        (false, true) => Some(Ordering::Greater),
        _ => None,
    }
}

fn within<T: PartialOrd>(value: Option<T>, minimum: T, maximum: T) -> bool {
    value.is_some_and(|value| value >= minimum && value <= maximum)
}

fn within_float(value: Option<f64>, minimum: f64, maximum: f64) -> bool {
    minimum.is_finite()
        && maximum.is_finite()
        && value.is_some_and(|value| value.is_finite() && value >= minimum && value <= maximum)
}

fn equals_any(candidate: &str, values: &[String]) -> bool {
    let candidate = normalize(candidate);
    values.iter().any(|value| normalize(value) == candidate)
}

fn contains_any(candidates: &[String], values: &[String]) -> bool {
    candidates
        .iter()
        .any(|candidate| equals_any(candidate, values))
}

fn search_relevance<'a>(
    needle: &str,
    name: &str,
    aliases: impl IntoIterator<Item = Option<&'a str>>,
) -> Option<u16> {
    let name = normalize(name);
    if name == needle {
        return Some(1_000);
    }
    if name.starts_with(needle) {
        return Some(900);
    }
    if name.split_whitespace().any(|word| word.starts_with(needle)) {
        return Some(800);
    }
    if name.contains(needle) {
        return Some(700);
    }
    let aliases: Vec<_> = aliases.into_iter().flatten().map(normalize).collect();
    if aliases.iter().any(|alias| alias.starts_with(needle)) {
        return Some(600);
    }
    if aliases.iter().any(|alias| alias.contains(needle)) {
        return Some(500);
    }
    let tokens: Vec<_> = needle.split_whitespace().collect();
    let haystack = std::iter::once(name.as_str())
        .chain(aliases.iter().map(String::as_str))
        .collect::<Vec<_>>()
        .join(" ");
    (!tokens.is_empty() && tokens.iter().all(|token| haystack.contains(token))).then_some(400)
}

fn join_subtitle<'a>(values: impl IntoIterator<Item = Option<&'a str>>) -> String {
    values
        .into_iter()
        .flatten()
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join(" · ")
}

fn normalize(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .replace('ä', "a")
        .replace('ö', "o")
        .replace('ü', "u")
        .replace('ß', "ss")
        .replace('á', "a")
        .replace('é', "e")
        .replace('í', "i")
        .replace('ó', "o")
        .replace('ú', "u")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::synthetic_snapshot;

    #[test]
    fn searches_all_entity_kinds_and_matches_aliases() {
        let snapshot = synthetic_snapshot();
        let hits = global_search(
            &snapshot,
            &GlobalSearchQuery {
                text: "SV Nord".into(),
                kinds: Vec::new(),
                limit: 20,
            },
        );
        assert!(hits.iter().any(|hit| hit.kind == EntityKind::Club));
        assert!(hits.iter().any(|hit| hit.kind == EntityKind::Player));

        let competitions = global_search(
            &snapshot,
            &GlobalSearchQuery {
                text: "Deutschland".into(),
                kinds: vec![EntityKind::Competition],
                limit: 20,
            },
        );
        assert_eq!(competitions.len(), 1);
        assert_eq!(competitions[0].kind, EntityKind::Competition);
    }

    #[test]
    fn composes_filters_and_sorts_by_role_score() {
        let snapshot = synthetic_snapshot();
        let query = PlayerQuery {
            filter: FilterExpression::All(vec![
                FilterExpression::Predicate(PlayerPredicate::AgeBetween {
                    minimum: 16,
                    maximum: 21,
                }),
                FilterExpression::Predicate(PlayerPredicate::AttributeAtLeast {
                    attribute: Attribute::Passing,
                    minimum: 15,
                }),
                FilterExpression::Not(Box::new(FilterExpression::Predicate(
                    PlayerPredicate::Injured,
                ))),
            ]),
            sort: PlayerSort {
                field: PlayerSortField::RoleScore,
                direction: SortDirection::Descending,
            },
            role_id: Some("deep_lying_playmaker".into()),
            ..Default::default()
        };
        let result = query_players(&snapshot.players, &query);
        assert_eq!(result.total, 1);
        assert_eq!(result.rows[0].player.id, "player-ada");
        assert!(result.rows[0].role_score.as_ref().unwrap().score > 70.0);
    }

    #[test]
    fn finds_free_agents_and_keeps_missing_values_last() {
        let mut snapshot = synthetic_snapshot();
        snapshot.players[0].details.reputation = None;
        let query = PlayerQuery {
            filter: FilterExpression::Predicate(PlayerPredicate::FreeAgent),
            sort: PlayerSort {
                field: PlayerSortField::Reputation,
                direction: SortDirection::Descending,
            },
            ..Default::default()
        };
        let result = query_players(&snapshot.players, &query);
        assert_eq!(result.total, 1);
        assert_eq!(result.rows[0].player.id, "player-milo");

        let all = query_players(
            &snapshot.players,
            &PlayerQuery {
                sort: query.sort,
                ..Default::default()
            },
        );
        assert_eq!(all.rows[0].player.id, "player-milo");
        assert_eq!(all.rows[1].player.id, "player-ada");
    }

    #[test]
    fn filter_protocol_round_trips_through_json() {
        let filter = FilterExpression::Any(vec![
            FilterExpression::Predicate(PlayerPredicate::TransferListed),
            FilterExpression::Predicate(PlayerPredicate::ContractExpiresOnOrBefore {
                date: GameDate::new(2027, 6, 30).unwrap(),
            }),
        ]);
        let json = serde_json::to_string(&filter).unwrap();
        assert_eq!(
            serde_json::from_str::<FilterExpression>(&json).unwrap(),
            filter
        );
    }
}
