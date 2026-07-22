use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::{DatabaseSnapshot, GameDate, Player, TransferKind};

pub const CURRENT_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IssueSeverity {
    Error,
    Warning,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotIssue {
    pub severity: IssueSeverity,
    pub code: String,
    pub entity_kind: String,
    pub entity_id: String,
    pub field: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotValidationReport {
    pub schema_version: u32,
    pub valid: bool,
    pub issues: Vec<SnapshotIssue>,
}

pub fn validate_snapshot(snapshot: &DatabaseSnapshot) -> SnapshotValidationReport {
    let mut issues = Vec::new();
    if snapshot.schema_version != CURRENT_SCHEMA_VERSION {
        issue(
            &mut issues,
            "unsupported_schema",
            "snapshot",
            "root",
            "schema_version",
            format!(
                "expected schema version {CURRENT_SCHEMA_VERSION}, found {}",
                snapshot.schema_version
            ),
        );
    }
    if snapshot
        .game_date
        .is_some_and(|date| GameDate::new(date.year, date.month, date.day) != Some(date))
    {
        issue(
            &mut issues,
            "invalid_date",
            "snapshot",
            "root",
            "game_date",
            "game date is not a valid calendar date",
        );
    }

    validate_unique_ids(
        &mut issues,
        "player",
        snapshot.players.iter().map(|entity| entity.id.as_str()),
    );
    validate_unique_ids(
        &mut issues,
        "staff",
        snapshot.staff.iter().map(|entity| entity.id.as_str()),
    );
    validate_unique_ids(
        &mut issues,
        "club",
        snapshot.clubs.iter().map(|entity| entity.id.as_str()),
    );
    validate_unique_ids(
        &mut issues,
        "competition",
        snapshot
            .competitions
            .iter()
            .map(|entity| entity.id.as_str()),
    );

    let club_ids: HashSet<_> = snapshot.clubs.iter().map(|club| club.id.as_str()).collect();
    let competition_ids: HashSet<_> = snapshot
        .competitions
        .iter()
        .map(|competition| competition.id.as_str())
        .collect();
    let player_ids: HashSet<_> = snapshot
        .players
        .iter()
        .map(|player| player.id.as_str())
        .collect();
    let staff_ids: HashSet<_> = snapshot
        .staff
        .iter()
        .map(|staff| staff.id.as_str())
        .collect();
    let mut future_transfer_ids = HashSet::new();
    let mut relationship_ids = HashSet::new();
    let mut club_relationship_ids = HashSet::new();
    let mut registration_ids = HashSet::new();
    let mut qualification_ids = HashSet::new();
    let mut stage_ids = HashSet::new();
    let mut fixture_ids = HashSet::new();
    for player in &snapshot.players {
        if player.name.trim().is_empty() {
            issue(
                &mut issues,
                "empty_name",
                "player",
                &player.id,
                "name",
                "player name must not be empty",
            );
        }
        if player.age.is_some_and(|age| age > 120) {
            issue(
                &mut issues,
                "age_out_of_range",
                "player",
                &player.id,
                "age",
                "age must not exceed 120",
            );
        }
        for (attribute, value) in &player.attributes {
            if !(1..=20).contains(value) {
                issue(
                    &mut issues,
                    "attribute_out_of_range",
                    "player",
                    &player.id,
                    format!("attributes.{attribute:?}"),
                    format!("attribute must be between 1 and 20, found {value}"),
                );
            }
        }
        for (field, value) in [
            ("current_ability", player.current_ability),
            ("potential_ability", player.potential_ability),
        ] {
            if value.is_some_and(|value| value > 200) {
                issue(
                    &mut issues,
                    "ability_out_of_range",
                    "player",
                    &player.id,
                    field,
                    "ability must not exceed 200",
                );
            }
        }
        validate_nonnegative_money(&mut issues, "player", &player.id, "value", player.value);
        validate_nonnegative_money(&mut issues, "player", &player.id, "wage", player.wage);
        for (field, reputation) in [
            ("details.reputation", player.details.reputation),
            (
                "details.international_reputation",
                player.details.international_reputation,
            ),
        ] {
            validate_reputation(&mut issues, "player", &player.id, field, reputation);
        }
        if player
            .details
            .date_of_birth
            .is_some_and(|date| GameDate::new(date.year, date.month, date.day) != Some(date))
        {
            issue(
                &mut issues,
                "invalid_date",
                "player",
                &player.id,
                "details.date_of_birth",
                "date of birth is not a valid calendar date",
            );
        }
        for (field, value) in [
            ("consistency", player.details.consistency),
            ("important_matches", player.details.important_matches),
            ("injury_proneness", player.details.injury_proneness),
            ("versatility", player.details.versatility),
            ("professionalism", player.details.professionalism),
            ("ambition", player.details.ambition),
        ] {
            if value.is_some_and(|value| !(1..=20).contains(&value)) {
                issue(
                    &mut issues,
                    "hidden_attribute_out_of_range",
                    "player",
                    &player.id,
                    format!("details.{field}"),
                    "hidden attribute must be between 1 and 20",
                );
            }
        }
        validate_player_availability(&mut issues, player, &competition_ids);
        validate_languages(
            &mut issues,
            "player",
            &player.id,
            "details.languages",
            &player.details.languages,
        );
        validate_relationships(
            &mut issues,
            "player",
            &player.id,
            "details.relationships",
            &player.details.relationships,
            &player_ids,
            &staff_ids,
            &club_ids,
            &mut relationship_ids,
        );
        validate_registrations(
            &mut issues,
            player,
            &competition_ids,
            &club_ids,
            &mut registration_ids,
        );
        if let Some(transfer) = &player.details.future_transfer {
            validate_future_transfer(
                &mut issues,
                player,
                transfer,
                &club_ids,
                &player_ids,
                &mut future_transfer_ids,
            );
        }
        if let Some(contract) = &player.details.contract {
            validate_contract(
                &mut issues,
                "player",
                &player.id,
                contract.club_id.as_deref(),
                contract.starts_on,
                contract.expires_on,
                contract.wage,
                contract.release_clause,
                &club_ids,
            );
        }
    }

    for player in &snapshot.players {
        if let Some(transfer) = player
            .details
            .future_transfer
            .as_ref()
            .filter(|transfer| transfer.kind == TransferKind::Swap)
        {
            validate_reciprocal_swap(&mut issues, player, transfer, snapshot);
        }
    }

    for staff in &snapshot.staff {
        if staff.name.trim().is_empty() {
            issue(
                &mut issues,
                "empty_name",
                "staff",
                &staff.id,
                "name",
                "staff name must not be empty",
            );
        }
        if staff.age.is_some_and(|age| age > 120) {
            issue(
                &mut issues,
                "age_out_of_range",
                "staff",
                &staff.id,
                "age",
                "age must not exceed 120",
            );
        }
        validate_abilities(
            &mut issues,
            "staff",
            &staff.id,
            staff.current_ability,
            staff.potential_ability,
        );
        validate_reputation(
            &mut issues,
            "staff",
            &staff.id,
            "reputation",
            staff.reputation,
        );
        if staff.roles.is_empty()
            || staff.roles.iter().collect::<HashSet<_>>().len() != staff.roles.len()
        {
            issue(
                &mut issues,
                "invalid_staff_roles",
                "staff",
                &staff.id,
                "roles",
                "staff must have at least one unique role",
            );
        }
        if staff
            .details
            .responsibilities
            .iter()
            .collect::<HashSet<_>>()
            .len()
            != staff.details.responsibilities.len()
        {
            issue(
                &mut issues,
                "duplicate_staff_responsibility",
                "staff",
                &staff.id,
                "details.responsibilities",
                "staff responsibilities must be unique",
            );
        }
        if staff
            .details
            .date_of_birth
            .is_some_and(|date| GameDate::new(date.year, date.month, date.day) != Some(date))
        {
            issue(
                &mut issues,
                "invalid_date",
                "staff",
                &staff.id,
                "details.date_of_birth",
                "staff date of birth is not a valid calendar date",
            );
        }
        if staff
            .details
            .note
            .as_ref()
            .is_some_and(|note| note.len() > 4_000)
        {
            issue(
                &mut issues,
                "staff_note_too_long",
                "staff",
                &staff.id,
                "details.note",
                "staff note must not exceed 4000 bytes",
            );
        }
        validate_languages(
            &mut issues,
            "staff",
            &staff.id,
            "details.languages",
            &staff.details.languages,
        );
        validate_relationships(
            &mut issues,
            "staff",
            &staff.id,
            "details.relationships",
            &staff.details.relationships,
            &player_ids,
            &staff_ids,
            &club_ids,
            &mut relationship_ids,
        );
        validate_staff_qualifications(&mut issues, staff, &mut qualification_ids);
        for (attribute, value) in &staff.attributes {
            if !(1..=20).contains(value) {
                issue(
                    &mut issues,
                    "attribute_out_of_range",
                    "staff",
                    &staff.id,
                    format!("attributes.{attribute:?}"),
                    format!("attribute must be between 1 and 20, found {value}"),
                );
            }
        }
        if let Some(contract) = &staff.contract {
            validate_contract(
                &mut issues,
                "staff",
                &staff.id,
                contract.club_id.as_deref(),
                contract.starts_on,
                contract.expires_on,
                contract.wage,
                contract.release_clause,
                &club_ids,
            );
        }
    }

    for club in &snapshot.clubs {
        if club.name.trim().is_empty() {
            issue(
                &mut issues,
                "empty_name",
                "club",
                &club.id,
                "name",
                "club name must not be empty",
            );
        }
        if club.name.chars().count() > 128 {
            issue(
                &mut issues,
                "club_name_too_long",
                "club",
                &club.id,
                "name",
                "club name must not exceed 128 characters",
            );
        }
        for (field, value, maximum) in [
            ("short_name", club.short_name.as_deref(), 32),
            ("nation", club.nation.as_deref(), 64),
            ("stadium", club.stadium.as_deref(), 128),
        ] {
            if value.is_some_and(|value| value.trim().is_empty() || value.chars().count() > maximum)
            {
                issue(
                    &mut issues,
                    "invalid_club_text",
                    "club",
                    &club.id,
                    field,
                    format!("club {field} must be non-empty and at most {maximum} characters"),
                );
            }
        }
        if let Some(competition_id) = club.competition_id.as_deref() {
            match snapshot
                .competitions
                .iter()
                .find(|competition| competition.id == competition_id)
            {
                None => issue(
                    &mut issues,
                    "unknown_competition_reference",
                    "club",
                    &club.id,
                    "competition_id",
                    "club competition must reference a competition in the snapshot",
                ),
                Some(competition)
                    if club.competition.as_deref() != Some(competition.name.as_str()) =>
                {
                    issue(
                        &mut issues,
                        "club_competition_name_mismatch",
                        "club",
                        &club.id,
                        "competition",
                        "club competition name must match its referenced competition",
                    );
                }
                Some(_) => {}
            }
        }
        if club.professional_status.as_deref().is_some_and(|status| {
            !matches!(status, "professional" | "semi_professional" | "amateur")
        }) {
            issue(
                &mut issues,
                "invalid_professional_status",
                "club",
                &club.id,
                "professional_status",
                "professional status must be professional, semi_professional or amateur",
            );
        }
        if club
            .stadium_capacity
            .is_some_and(|capacity| capacity == 0 || capacity > 2_000_000)
        {
            issue(
                &mut issues,
                "stadium_capacity_out_of_range",
                "club",
                &club.id,
                "stadium_capacity",
                "stadium capacity must be between 1 and 2000000",
            );
        }
        if club.average_attendance.is_some_and(|attendance| {
            attendance > 2_000_000
                || club
                    .stadium_capacity
                    .is_some_and(|capacity| attendance > capacity)
        }) {
            issue(
                &mut issues,
                "attendance_out_of_range",
                "club",
                &club.id,
                "average_attendance",
                "average attendance must not exceed stadium capacity or 2000000",
            );
        }
        validate_reputation(&mut issues, "club", &club.id, "reputation", club.reputation);
        validate_finite_money(
            &mut issues,
            "club",
            &club.id,
            "finances.balance",
            club.finances.balance,
        );
        for (field, value) in [
            ("finances.transfer_budget", club.finances.transfer_budget),
            ("finances.wage_budget", club.finances.wage_budget),
            ("finances.debt", club.finances.debt),
        ] {
            validate_nonnegative_money(&mut issues, "club", &club.id, field, value);
        }
        for (field, value) in [
            ("facilities.training", club.facilities.training),
            ("facilities.youth", club.facilities.youth),
            (
                "facilities.youth_recruitment",
                club.facilities.youth_recruitment,
            ),
            (
                "facilities.junior_coaching",
                club.facilities.junior_coaching,
            ),
        ] {
            if value.is_some_and(|value| !(1..=20).contains(&value)) {
                issue(
                    &mut issues,
                    "facility_out_of_range",
                    "club",
                    &club.id,
                    field,
                    "facility value must be between 1 and 20",
                );
            }
        }
        validate_club_branding(&mut issues, club);
        validate_club_relationships(&mut issues, club, &club_ids, &mut club_relationship_ids);
    }

    for competition in &snapshot.competitions {
        if competition.name.trim().is_empty() {
            issue(
                &mut issues,
                "empty_name",
                "competition",
                &competition.id,
                "name",
                "competition name must not be empty",
            );
        }
        if competition.name.chars().count() > 128 {
            issue(
                &mut issues,
                "competition_name_too_long",
                "competition",
                &competition.id,
                "name",
                "competition name must not exceed 128 characters",
            );
        }
        for (field, value, maximum) in [
            ("short_name", competition.short_name.as_deref(), 32),
            ("nation", competition.nation.as_deref(), 64),
            (
                "current_champion",
                competition.current_champion.as_deref(),
                128,
            ),
        ] {
            if value.is_some_and(|value| value.trim().is_empty() || value.chars().count() > maximum)
            {
                issue(
                    &mut issues,
                    "invalid_competition_text",
                    "competition",
                    &competition.id,
                    field,
                    format!(
                        "competition {field} must be non-empty and at most {maximum} characters"
                    ),
                );
            }
        }
        if let Some(champion_id) = competition.current_champion_club_id.as_deref() {
            match snapshot.clubs.iter().find(|club| club.id == champion_id) {
                None => issue(
                    &mut issues,
                    "unknown_champion_reference",
                    "competition",
                    &competition.id,
                    "current_champion_club_id",
                    "current champion must reference a club in the snapshot",
                ),
                Some(club)
                    if competition.current_champion.as_deref() != Some(club.name.as_str()) =>
                {
                    issue(
                        &mut issues,
                        "champion_name_mismatch",
                        "competition",
                        &competition.id,
                        "current_champion",
                        "current champion name must match its referenced club",
                    );
                }
                Some(_) => {}
            }
        }
        validate_reputation(
            &mut issues,
            "competition",
            &competition.id,
            "reputation",
            competition.reputation,
        );
        if competition.level == Some(0) {
            issue(
                &mut issues,
                "level_out_of_range",
                "competition",
                &competition.id,
                "level",
                "competition level must be greater than zero",
            );
        }

        if competition.stages.len() > 1_000 {
            issue(
                &mut issues,
                "too_many_competition_stages",
                "competition",
                &competition.id,
                "stages",
                "a competition may not contain more than 1000 stages",
            );
        }
        if competition.fixtures.len() > 100_000 {
            issue(
                &mut issues,
                "too_many_competition_fixtures",
                "competition",
                &competition.id,
                "fixtures",
                "a competition may not contain more than 100000 fixtures",
            );
        }
        if competition.standings.len() > 10_000 {
            issue(
                &mut issues,
                "too_many_competition_standings",
                "competition",
                &competition.id,
                "standings",
                "a competition may not contain more than 10000 standing rows",
            );
        }

        let mut competition_stage_ids = HashSet::new();
        let mut stage_orders = HashSet::new();
        let mut current_stage_count = 0usize;
        for (index, stage) in competition.stages.iter().enumerate() {
            let prefix = format!("stages.{index}");
            if stage.id.trim().is_empty()
                || stage.id.chars().count() > 128
                || !stage_ids.insert(stage.id.as_str())
            {
                issue(
                    &mut issues,
                    "invalid_competition_stage_id",
                    "competition",
                    &competition.id,
                    format!("{prefix}.id"),
                    "stage IDs must be non-empty, at most 128 characters and globally unique",
                );
            }
            competition_stage_ids.insert(stage.id.as_str());
            if stage.name.trim().is_empty() || stage.name.chars().count() > 128 {
                issue(
                    &mut issues,
                    "invalid_competition_stage_name",
                    "competition",
                    &competition.id,
                    format!("{prefix}.name"),
                    "stage names must be non-empty and at most 128 characters",
                );
            }
            if stage.order == 0 || !stage_orders.insert(stage.order) {
                issue(
                    &mut issues,
                    "invalid_competition_stage_order",
                    "competition",
                    &competition.id,
                    format!("{prefix}.order"),
                    "stage order must be positive and unique within the competition",
                );
            }
            if stage.current {
                current_stage_count += 1;
            }
            validate_date_range(
                &mut issues,
                "competition",
                &competition.id,
                &prefix,
                ("starts_on", stage.starts_on),
                ("ends_on", stage.ends_on),
            );
        }
        if current_stage_count > 1 {
            issue(
                &mut issues,
                "multiple_current_competition_stages",
                "competition",
                &competition.id,
                "stages",
                "at most one competition stage may be current",
            );
        }

        for (index, fixture) in competition.fixtures.iter().enumerate() {
            let prefix = format!("fixtures.{index}");
            if fixture.id.trim().is_empty()
                || fixture.id.chars().count() > 128
                || !fixture_ids.insert(fixture.id.as_str())
            {
                issue(
                    &mut issues,
                    "invalid_competition_fixture_id",
                    "competition",
                    &competition.id,
                    format!("{prefix}.id"),
                    "fixture IDs must be non-empty, at most 128 characters and globally unique",
                );
            }
            if fixture
                .stage_id
                .as_deref()
                .is_some_and(|id| !competition_stage_ids.contains(id))
            {
                issue(
                    &mut issues,
                    "unknown_fixture_stage_reference",
                    "competition",
                    &competition.id,
                    format!("{prefix}.stage_id"),
                    "fixture stage must belong to the same competition",
                );
            }
            for (field, club_id) in [
                ("home_club_id", fixture.home_club_id.as_str()),
                ("away_club_id", fixture.away_club_id.as_str()),
            ] {
                if !club_ids.contains(club_id) {
                    issue(
                        &mut issues,
                        "unknown_fixture_club_reference",
                        "competition",
                        &competition.id,
                        format!("{prefix}.{field}"),
                        "fixture club must reference a club in the snapshot",
                    );
                }
            }
            if fixture.home_club_id == fixture.away_club_id {
                issue(
                    &mut issues,
                    "identical_fixture_clubs",
                    "competition",
                    &competition.id,
                    format!("{prefix}.away_club_id"),
                    "fixture home and away clubs must differ",
                );
            }
            if fixture
                .scheduled_on
                .is_some_and(|date| GameDate::new(date.year, date.month, date.day) != Some(date))
            {
                issue(
                    &mut issues,
                    "invalid_date",
                    "competition",
                    &competition.id,
                    format!("{prefix}.scheduled_on"),
                    "fixture date is not a valid calendar date",
                );
            }
            for (field, value, maximum) in [
                ("round", fixture.round.as_deref(), 64),
                ("venue", fixture.venue.as_deref(), 128),
            ] {
                if value
                    .is_some_and(|value| value.trim().is_empty() || value.chars().count() > maximum)
                {
                    issue(
                        &mut issues,
                        "invalid_fixture_text",
                        "competition",
                        &competition.id,
                        format!("{prefix}.{field}"),
                        format!(
                            "fixture {field} must be non-empty and at most {maximum} characters"
                        ),
                    );
                }
            }
            let paired_scores = fixture.home_score.is_some() == fixture.away_score.is_some();
            if !paired_scores
                || fixture
                    .home_score
                    .zip(fixture.away_score)
                    .is_some_and(|(home, away)| home > 99 || away > 99)
            {
                issue(
                    &mut issues,
                    "invalid_fixture_score",
                    "competition",
                    &competition.id,
                    format!("{prefix}.home_score"),
                    "fixture scores must be paired and may not exceed 99",
                );
            }
            match fixture.status {
                crate::FixtureStatus::Played
                    if fixture.home_score.is_none() || fixture.away_score.is_none() =>
                {
                    issue(
                        &mut issues,
                        "missing_played_fixture_score",
                        "competition",
                        &competition.id,
                        format!("{prefix}.home_score"),
                        "played fixtures require a complete score",
                    );
                }
                crate::FixtureStatus::Scheduled
                | crate::FixtureStatus::Postponed
                | crate::FixtureStatus::Cancelled
                    if fixture.home_score.is_some() =>
                {
                    issue(
                        &mut issues,
                        "unexpected_fixture_score",
                        "competition",
                        &competition.id,
                        format!("{prefix}.home_score"),
                        "scheduled, postponed and cancelled fixtures may not have a score",
                    );
                }
                _ => {}
            }
        }

        let mut standing_clubs = HashSet::new();
        let mut standing_positions = HashSet::new();
        for (index, standing) in competition.standings.iter().enumerate() {
            let prefix = format!("standings.{index}");
            let stage_scope = standing.stage_id.as_deref();
            if stage_scope.is_some_and(|id| !competition_stage_ids.contains(id)) {
                issue(
                    &mut issues,
                    "unknown_standing_stage_reference",
                    "competition",
                    &competition.id,
                    format!("{prefix}.stage_id"),
                    "standing stage must belong to the same competition",
                );
            }
            if !club_ids.contains(standing.club_id.as_str()) {
                issue(
                    &mut issues,
                    "unknown_standing_club_reference",
                    "competition",
                    &competition.id,
                    format!("{prefix}.club_id"),
                    "standing club must reference a club in the snapshot",
                );
            }
            if !standing_clubs.insert((stage_scope, standing.club_id.as_str())) {
                issue(
                    &mut issues,
                    "duplicate_standing_club",
                    "competition",
                    &competition.id,
                    format!("{prefix}.club_id"),
                    "a club may appear once per standing stage",
                );
            }
            if standing.position == 0
                || !standing_positions.insert((stage_scope, standing.position))
            {
                issue(
                    &mut issues,
                    "invalid_standing_position",
                    "competition",
                    &competition.id,
                    format!("{prefix}.position"),
                    "standing position must be positive and unique per stage",
                );
            }
            let totals = [
                standing.played,
                standing.won,
                standing.drawn,
                standing.lost,
                standing.goals_for,
                standing.goals_against,
            ];
            if totals.into_iter().any(|value| value > 10_000)
                || u32::from(standing.won) + u32::from(standing.drawn) + u32::from(standing.lost)
                    != u32::from(standing.played)
            {
                issue(
                    &mut issues,
                    "invalid_standing_totals",
                    "competition",
                    &competition.id,
                    format!("{prefix}.played"),
                    "standing totals must be bounded and played must equal won plus drawn plus lost",
                );
            }
            let expected_difference =
                i32::from(standing.goals_for) - i32::from(standing.goals_against);
            if i32::from(standing.goal_difference) != expected_difference {
                issue(
                    &mut issues,
                    "invalid_standing_goal_difference",
                    "competition",
                    &competition.id,
                    format!("{prefix}.goal_difference"),
                    "goal difference must equal goals for minus goals against",
                );
            }
            if !(-10_000..=10_000).contains(&standing.points) {
                issue(
                    &mut issues,
                    "standing_points_out_of_range",
                    "competition",
                    &competition.id,
                    format!("{prefix}.points"),
                    "standing points must be between -10000 and 10000",
                );
            }
        }
    }

    SnapshotValidationReport {
        schema_version: snapshot.schema_version,
        valid: issues
            .iter()
            .all(|issue| issue.severity != IssueSeverity::Error),
        issues,
    }
}

fn validate_reciprocal_swap(
    issues: &mut Vec<SnapshotIssue>,
    player: &Player,
    transfer: &crate::FutureTransfer,
    snapshot: &DatabaseSnapshot,
) {
    let reciprocal = transfer
        .swap_player_id
        .as_deref()
        .and_then(|partner_id| snapshot.players.iter().find(|item| item.id == partner_id))
        .and_then(|partner| {
            partner
                .details
                .future_transfer
                .as_ref()
                .map(|partner_transfer| (partner, partner_transfer))
        });
    let player_club_id = player
        .details
        .contract
        .as_ref()
        .and_then(|contract| contract.club_id.as_deref());
    let valid = reciprocal.is_some_and(|(partner, partner_transfer)| {
        let partner_club_id = partner
            .details
            .contract
            .as_ref()
            .and_then(|contract| contract.club_id.as_deref());
        partner_transfer.kind == TransferKind::Swap
            && partner_transfer.id != transfer.id
            && partner_transfer.swap_player_id.as_deref() == Some(player.id.as_str())
            && transfer.from_club_id.as_deref() == player_club_id
            && Some(transfer.to_club_id.as_str()) == partner_club_id
            && partner_transfer.from_club_id.as_deref() == partner_club_id
            && Some(partner_transfer.to_club_id.as_str()) == player_club_id
            && transfer.arranged_on == partner_transfer.arranged_on
            && transfer.effective_on == partner_transfer.effective_on
            && transfer.status == partner_transfer.status
    });
    if !valid {
        issue(
            issues,
            "non_reciprocal_swap",
            "player",
            &player.id,
            "details.future_transfer",
            "a swap must have one inverse agreement with matching clubs, players, dates and status",
        );
    }
}

fn validate_languages(
    issues: &mut Vec<SnapshotIssue>,
    entity_kind: &str,
    entity_id: &str,
    prefix: &str,
    languages: &[crate::LanguageSkill],
) {
    let mut names = HashSet::new();
    for (index, language) in languages.iter().enumerate() {
        let name = language.language.trim();
        let normalized = name.to_lowercase();
        if name.is_empty() || name.len() > 64 || !names.insert(normalized) {
            issue(
                issues,
                "invalid_language",
                entity_kind,
                entity_id,
                format!("{prefix}.{index}.language"),
                "language names must be non-empty, bounded and unique per person",
            );
        }
        if [language.speaking, language.reading, language.writing]
            .into_iter()
            .any(|value| !(1..=10).contains(&value))
        {
            issue(
                issues,
                "language_proficiency_out_of_range",
                entity_kind,
                entity_id,
                format!("{prefix}.{index}"),
                "language proficiency must be between one and 10",
            );
        }
    }
}

fn validate_club_branding(issues: &mut Vec<SnapshotIssue>, club: &crate::Club) {
    for (field, colour) in [
        (
            "branding.primary_colour",
            club.branding.primary_colour.as_deref(),
        ),
        (
            "branding.secondary_colour",
            club.branding.secondary_colour.as_deref(),
        ),
    ] {
        if colour.is_some_and(|value| !is_hex_colour(value)) {
            issue(
                issues,
                "invalid_club_colour",
                "club",
                &club.id,
                field,
                "club colours must use the exact #RRGGBB form",
            );
        }
    }

    if club.branding.kits.len() > 4 {
        issue(
            issues,
            "too_many_club_kits",
            "club",
            &club.id,
            "branding.kits",
            "a club may define at most one home, away, third and goalkeeper kit",
        );
    }
    let mut ids = HashSet::new();
    let mut kinds = HashSet::new();
    for (index, kit) in club.branding.kits.iter().enumerate() {
        if kit.id.trim().is_empty() || kit.id.len() > 128 || !ids.insert(kit.id.as_str()) {
            issue(
                issues,
                "invalid_club_kit_id",
                "club",
                &club.id,
                format!("branding.kits.{index}.id"),
                "kit IDs must be non-empty, bounded and unique per club",
            );
        }
        if !kinds.insert(kit.kind) {
            issue(
                issues,
                "duplicate_club_kit_kind",
                "club",
                &club.id,
                format!("branding.kits.{index}.kind"),
                "a club may define each kit kind only once",
            );
        }
        for (field, colour) in [
            ("shirt_colour", Some(kit.shirt_colour.as_str())),
            ("shorts_colour", Some(kit.shorts_colour.as_str())),
            ("socks_colour", Some(kit.socks_colour.as_str())),
            ("trim_colour", kit.trim_colour.as_deref()),
        ] {
            if colour.is_some_and(|value| !is_hex_colour(value)) {
                issue(
                    issues,
                    "invalid_club_kit_colour",
                    "club",
                    &club.id,
                    format!("branding.kits.{index}.{field}"),
                    "kit colours must use the exact #RRGGBB form",
                );
            }
        }
        if kit
            .pattern
            .as_ref()
            .is_some_and(|pattern| pattern.trim().is_empty() || pattern.chars().count() > 64)
        {
            issue(
                issues,
                "invalid_club_kit_pattern",
                "club",
                &club.id,
                format!("branding.kits.{index}.pattern"),
                "kit pattern must be non-empty and at most 64 characters",
            );
        }
    }
}

fn is_hex_colour(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value.as_bytes()[1..]
            .iter()
            .all(|byte| byte.is_ascii_hexdigit())
}

fn validate_club_relationships<'a>(
    issues: &mut Vec<SnapshotIssue>,
    club: &'a crate::Club,
    club_ids: &HashSet<&str>,
    relationship_ids: &mut HashSet<&'a str>,
) {
    if club.relationships.len() > 128 {
        issue(
            issues,
            "too_many_club_relationships",
            "club",
            &club.id,
            "relationships",
            "a club may define at most 128 relationships",
        );
    }
    let mut targets = HashSet::new();
    for (index, relationship) in club.relationships.iter().enumerate() {
        if relationship.id.trim().is_empty()
            || relationship.id.len() > 128
            || !relationship_ids.insert(relationship.id.as_str())
        {
            issue(
                issues,
                "invalid_club_relationship_id",
                "club",
                &club.id,
                format!("relationships.{index}.id"),
                "club relationship IDs must be non-empty, bounded and unique in the snapshot",
            );
        }
        if !club_ids.contains(relationship.target_club_id.as_str()) {
            issue(
                issues,
                "unknown_club_relationship_target",
                "club",
                &club.id,
                format!("relationships.{index}.target_club_id"),
                "club relationship target must exist in the snapshot",
            );
        }
        if relationship.target_club_id == club.id {
            issue(
                issues,
                "self_club_relationship",
                "club",
                &club.id,
                format!("relationships.{index}.target_club_id"),
                "a club cannot have a relationship with itself",
            );
        }
        if !targets.insert((relationship.kind, relationship.target_club_id.as_str())) {
            issue(
                issues,
                "duplicate_club_relationship",
                "club",
                &club.id,
                format!("relationships.{index}"),
                "relationship kind and target must be unique per club",
            );
        }
        if !(1..=100).contains(&relationship.strength) {
            issue(
                issues,
                "club_relationship_strength_out_of_range",
                "club",
                &club.id,
                format!("relationships.{index}.strength"),
                "club relationship strength must be between one and 100",
            );
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn validate_relationships<'a>(
    issues: &mut Vec<SnapshotIssue>,
    entity_kind: &str,
    entity_id: &str,
    prefix: &str,
    relationships: &'a [crate::PersonRelationship],
    player_ids: &HashSet<&str>,
    staff_ids: &HashSet<&str>,
    club_ids: &HashSet<&str>,
    relationship_ids: &mut HashSet<&'a str>,
) {
    use crate::{RelationshipKind, RelationshipTargetKind};
    for (index, relationship) in relationships.iter().enumerate() {
        if relationship.id.trim().is_empty()
            || relationship.id.len() > 128
            || !relationship_ids.insert(relationship.id.as_str())
        {
            issue(
                issues,
                "invalid_relationship_id",
                entity_kind,
                entity_id,
                format!("{prefix}.{index}.id"),
                "relationship IDs must be non-empty, bounded and unique in the snapshot",
            );
        }
        let target_exists = match relationship.target_kind {
            RelationshipTargetKind::Player => player_ids.contains(relationship.target_id.as_str()),
            RelationshipTargetKind::Staff => staff_ids.contains(relationship.target_id.as_str()),
            RelationshipTargetKind::Club => club_ids.contains(relationship.target_id.as_str()),
        };
        if !target_exists {
            issue(
                issues,
                "unknown_relationship_target",
                entity_kind,
                entity_id,
                format!("{prefix}.{index}.target_id"),
                "relationship target must exist with the declared entity kind",
            );
        }
        let target_kind_matches = match relationship.kind {
            RelationshipKind::FavoriteClub | RelationshipKind::DislikedClub => {
                relationship.target_kind == RelationshipTargetKind::Club
            }
            RelationshipKind::Agent => relationship.target_kind == RelationshipTargetKind::Staff,
            _ => matches!(
                relationship.target_kind,
                RelationshipTargetKind::Player | RelationshipTargetKind::Staff
            ),
        };
        if !target_kind_matches {
            issue(
                issues,
                "relationship_kind_target_mismatch",
                entity_kind,
                entity_id,
                format!("{prefix}.{index}.target_kind"),
                "relationship kind is incompatible with its target entity kind",
            );
        }
        let targets_self = relationship.target_id == entity_id
            && matches!(
                (entity_kind, relationship.target_kind),
                ("player", RelationshipTargetKind::Player)
                    | ("staff", RelationshipTargetKind::Staff)
            );
        if targets_self {
            issue(
                issues,
                "self_relationship",
                entity_kind,
                entity_id,
                format!("{prefix}.{index}.target_id"),
                "a person cannot have a relationship with themselves",
            );
        }
        if !(1..=100).contains(&relationship.strength) {
            issue(
                issues,
                "relationship_strength_out_of_range",
                entity_kind,
                entity_id,
                format!("{prefix}.{index}.strength"),
                "relationship strength must be between one and 100",
            );
        }
    }
}

fn validate_registrations<'a>(
    issues: &mut Vec<SnapshotIssue>,
    player: &'a Player,
    competition_ids: &HashSet<&str>,
    club_ids: &HashSet<&str>,
    registration_ids: &mut HashSet<&'a str>,
) {
    let mut registered_competitions = HashSet::new();
    let contract_club_id = player
        .details
        .contract
        .as_ref()
        .and_then(|contract| contract.club_id.as_deref());
    for (index, registration) in player.details.registrations.iter().enumerate() {
        let prefix = format!("details.registrations.{index}");
        if registration.id.trim().is_empty()
            || registration.id.len() > 128
            || !registration_ids.insert(registration.id.as_str())
        {
            issue(
                issues,
                "invalid_registration_id",
                "player",
                &player.id,
                format!("{prefix}.id"),
                "registration IDs must be non-empty, bounded and unique in the snapshot",
            );
        }
        if !competition_ids.contains(registration.competition_id.as_str())
            || !registered_competitions.insert(registration.competition_id.as_str())
        {
            issue(
                issues,
                "invalid_registration_competition",
                "player",
                &player.id,
                format!("{prefix}.competition_id"),
                "each registration must reference one unique competition in the snapshot",
            );
        }
        if !club_ids.contains(registration.club_id.as_str())
            || Some(registration.club_id.as_str()) != contract_club_id
        {
            issue(
                issues,
                "invalid_registration_club",
                "player",
                &player.id,
                format!("{prefix}.club_id"),
                "registration club must be the player's current contract club",
            );
        }
        validate_date_range(
            issues,
            "player",
            &player.id,
            &prefix,
            ("registered_on", registration.registered_on),
            ("expires_on", registration.expires_on),
        );
        if registration
            .squad_number
            .is_some_and(|number| !(1..=99).contains(&number))
        {
            issue(
                issues,
                "squad_number_out_of_range",
                "player",
                &player.id,
                format!("{prefix}.squad_number"),
                "squad number must be between one and 99",
            );
        }
    }
}

fn validate_staff_qualifications<'a>(
    issues: &mut Vec<SnapshotIssue>,
    staff: &'a crate::Staff,
    qualification_ids: &mut HashSet<&'a str>,
) {
    for (index, qualification) in staff.details.qualifications.iter().enumerate() {
        let prefix = format!("details.qualifications.{index}");
        if qualification.id.trim().is_empty()
            || qualification.id.len() > 128
            || !qualification_ids.insert(qualification.id.as_str())
        {
            issue(
                issues,
                "invalid_staff_qualification_id",
                "staff",
                &staff.id,
                format!("{prefix}.id"),
                "qualification IDs must be non-empty, bounded and unique in the snapshot",
            );
        }
        if qualification.name.trim().is_empty() || qualification.name.len() > 128 {
            issue(
                issues,
                "invalid_staff_qualification_name",
                "staff",
                &staff.id,
                format!("{prefix}.name"),
                "qualification name must be non-empty and bounded",
            );
        }
        if !(1..=5).contains(&qualification.level) {
            issue(
                issues,
                "staff_qualification_level_out_of_range",
                "staff",
                &staff.id,
                format!("{prefix}.level"),
                "qualification level must be between one and five",
            );
        }
        validate_date_range(
            issues,
            "staff",
            &staff.id,
            &prefix,
            ("awarded_on", qualification.awarded_on),
            ("expires_on", qualification.expires_on),
        );
    }
}

fn validate_future_transfer<'a>(
    issues: &mut Vec<SnapshotIssue>,
    player: &Player,
    transfer: &'a crate::FutureTransfer,
    club_ids: &HashSet<&str>,
    player_ids: &HashSet<&str>,
    transfer_ids: &mut HashSet<&'a str>,
) {
    let prefix = "details.future_transfer";
    if transfer.id.trim().is_empty()
        || transfer.id.len() > 128
        || !transfer_ids.insert(transfer.id.as_str())
    {
        issue(
            issues,
            "invalid_future_transfer_id",
            "player",
            &player.id,
            format!("{prefix}.id"),
            "future transfer ID must be non-empty, bounded and unique in the snapshot",
        );
    }
    if transfer.to_club_id.trim().is_empty() || !club_ids.contains(transfer.to_club_id.as_str()) {
        issue(
            issues,
            "unknown_club_reference",
            "player",
            &player.id,
            format!("{prefix}.to_club_id"),
            "future transfer destination must reference a club in the snapshot",
        );
    }
    if transfer
        .from_club_id
        .as_deref()
        .is_some_and(|id| !club_ids.contains(id))
    {
        issue(
            issues,
            "unknown_club_reference",
            "player",
            &player.id,
            format!("{prefix}.from_club_id"),
            "future transfer origin must reference a club in the snapshot",
        );
    }
    if transfer.from_club_id.as_deref() == Some(transfer.to_club_id.as_str()) {
        issue(
            issues,
            "invalid_transfer_route",
            "player",
            &player.id,
            format!("{prefix}.to_club_id"),
            "future transfer origin and destination must differ",
        );
    }
    validate_date_range(
        issues,
        "player",
        &player.id,
        prefix,
        ("arranged_on", transfer.arranged_on),
        ("effective_on", Some(transfer.effective_on)),
    );
    validate_date_range(
        issues,
        "player",
        &player.id,
        prefix,
        ("effective_on", Some(transfer.effective_on)),
        ("loan_end", transfer.loan_end),
    );
    if transfer
        .fee
        .is_some_and(|fee| !fee.is_finite() || !(0.0..=1_000_000_000_000.0).contains(&fee))
    {
        issue(
            issues,
            "transfer_fee_out_of_range",
            "player",
            &player.id,
            format!("{prefix}.fee"),
            "transfer fee must be finite and between zero and one trillion",
        );
    }
    if transfer
        .wage_contribution_percent
        .is_some_and(|percentage| percentage > 100)
    {
        issue(
            issues,
            "wage_contribution_out_of_range",
            "player",
            &player.id,
            format!("{prefix}.wage_contribution_percent"),
            "wage contribution must be between zero and 100 percent",
        );
    }
    match transfer.kind {
        TransferKind::Loan if transfer.loan_end.is_none() => issue(
            issues,
            "missing_loan_end",
            "player",
            &player.id,
            format!("{prefix}.loan_end"),
            "a future loan requires an end date",
        ),
        TransferKind::Loan => {}
        _ if transfer.loan_end.is_some() || transfer.wage_contribution_percent.is_some() => issue(
            issues,
            "invalid_loan_terms",
            "player",
            &player.id,
            format!("{prefix}.loan_end"),
            "loan terms are only valid for a loan transfer",
        ),
        _ => {}
    }
    let valid_swap = transfer
        .swap_player_id
        .as_deref()
        .is_some_and(|id| id != player.id && player_ids.contains(id));
    if (transfer.kind == TransferKind::Swap && !valid_swap)
        || (transfer.kind != TransferKind::Swap && transfer.swap_player_id.is_some())
    {
        issue(
            issues,
            "invalid_swap_player",
            "player",
            &player.id,
            format!("{prefix}.swap_player_id"),
            "swap transfers require one different player in the snapshot; other kinds cannot set one",
        );
    }
    if transfer.kind == TransferKind::FreeTransfer && transfer.fee.is_some_and(|fee| fee != 0.0) {
        issue(
            issues,
            "invalid_free_transfer_fee",
            "player",
            &player.id,
            format!("{prefix}.fee"),
            "a free transfer cannot contain a non-zero fee",
        );
    }
}

fn validate_player_availability(
    issues: &mut Vec<SnapshotIssue>,
    player: &Player,
    competition_ids: &HashSet<&str>,
) {
    for (field, value) in [
        (
            "details.fitness.condition",
            player.details.fitness.condition,
        ),
        (
            "details.fitness.match_fitness",
            player.details.fitness.match_fitness,
        ),
        ("details.fitness.fatigue", player.details.fitness.fatigue),
        (
            "details.fitness.jadedness",
            player.details.fitness.jadedness,
        ),
    ] {
        if value.is_some_and(|value| value > 100) {
            issue(
                issues,
                "fitness_out_of_range",
                "player",
                &player.id,
                field,
                "fitness percentage must be between 0 and 100",
            );
        }
    }
    for (field, value) in [
        ("details.morale", player.details.morale),
        ("details.happiness", player.details.happiness),
    ] {
        if value.is_some_and(|value| !(1..=20).contains(&value)) {
            issue(
                issues,
                "wellbeing_out_of_range",
                "player",
                &player.id,
                field,
                "morale and happiness must be between 1 and 20",
            );
        }
    }

    if player.details.injuries.len() > 64 {
        issue(
            issues,
            "too_many_injuries",
            "player",
            &player.id,
            "details.injuries",
            "a player may contain at most 64 injury records",
        );
    }
    let mut injury_ids = HashSet::new();
    for (index, injury) in player.details.injuries.iter().enumerate() {
        let prefix = format!("details.injuries.{index}");
        if injury.id.trim().is_empty()
            || injury.id.len() > 128
            || !injury_ids.insert(injury.id.as_str())
        {
            issue(
                issues,
                "invalid_injury_id",
                "player",
                &player.id,
                format!("{prefix}.id"),
                "injury ID must be non-empty, bounded and unique per player",
            );
        }
        if injury.name.trim().is_empty() || injury.name.len() > 256 {
            issue(
                issues,
                "invalid_injury_name",
                "player",
                &player.id,
                format!("{prefix}.name"),
                "injury name must be non-empty and at most 256 bytes",
            );
        }
        validate_date_range(
            issues,
            "player",
            &player.id,
            &prefix,
            ("started_on", injury.started_on),
            ("expected_return", injury.expected_return),
        );
        if injury.days_remaining.is_some_and(|days| days > 3_650) {
            issue(
                issues,
                "injury_duration_out_of_range",
                "player",
                &player.id,
                format!("{prefix}.days_remaining"),
                "injury duration may not exceed 3650 days",
            );
        }
    }

    if player.details.bans.len() > 64 {
        issue(
            issues,
            "too_many_bans",
            "player",
            &player.id,
            "details.bans",
            "a player may contain at most 64 ban records",
        );
    }
    let mut ban_ids = HashSet::new();
    for (index, ban) in player.details.bans.iter().enumerate() {
        let prefix = format!("details.bans.{index}");
        if ban.id.trim().is_empty() || ban.id.len() > 128 || !ban_ids.insert(ban.id.as_str()) {
            issue(
                issues,
                "invalid_ban_id",
                "player",
                &player.id,
                format!("{prefix}.id"),
                "ban ID must be non-empty, bounded and unique per player",
            );
        }
        if ban.reason.trim().is_empty() || ban.reason.len() > 256 {
            issue(
                issues,
                "invalid_ban_reason",
                "player",
                &player.id,
                format!("{prefix}.reason"),
                "ban reason must be non-empty and at most 256 bytes",
            );
        }
        if ban
            .competition_id
            .as_deref()
            .is_some_and(|id| !competition_ids.contains(id))
        {
            issue(
                issues,
                "unknown_competition_reference",
                "player",
                &player.id,
                format!("{prefix}.competition_id"),
                "ban references a competition that is not in the snapshot",
            );
        }
        validate_date_range(
            issues,
            "player",
            &player.id,
            &prefix,
            ("starts_on", ban.starts_on),
            ("ends_on", ban.ends_on),
        );
        if ban.matches_remaining.is_some_and(|matches| matches > 1_000) {
            issue(
                issues,
                "ban_length_out_of_range",
                "player",
                &player.id,
                format!("{prefix}.matches_remaining"),
                "ban length may not exceed 1000 matches",
            );
        }
    }
}

fn validate_date_range(
    issues: &mut Vec<SnapshotIssue>,
    entity_kind: &str,
    entity_id: &str,
    prefix: &str,
    start: (&str, Option<GameDate>),
    end: (&str, Option<GameDate>),
) {
    let (start_field, starts_on) = start;
    let (end_field, ends_on) = end;
    for (field, date) in [(start_field, starts_on), (end_field, ends_on)] {
        if date.is_some_and(|date| GameDate::new(date.year, date.month, date.day) != Some(date)) {
            issue(
                issues,
                "invalid_date",
                entity_kind,
                entity_id,
                format!("{prefix}.{field}"),
                "date is not a valid calendar date",
            );
        }
    }
    if starts_on
        .zip(ends_on)
        .is_some_and(|(start, end)| start > end)
    {
        issue(
            issues,
            "invalid_date_range",
            entity_kind,
            entity_id,
            format!("{prefix}.{end_field}"),
            "end date must not be before start date",
        );
    }
}

#[allow(clippy::too_many_arguments)]
fn validate_contract(
    issues: &mut Vec<SnapshotIssue>,
    entity_kind: &str,
    entity_id: &str,
    club_id: Option<&str>,
    starts_on: Option<GameDate>,
    expires_on: Option<GameDate>,
    wage: Option<f64>,
    release_clause: Option<f64>,
    club_ids: &HashSet<&str>,
) {
    if club_id.is_some_and(|club_id| !club_ids.contains(club_id)) {
        issue(
            issues,
            "unknown_club_reference",
            entity_kind,
            entity_id,
            "contract.club_id",
            "contract references a club that is not in the snapshot",
        );
    }
    for (field, date) in [
        ("contract.starts_on", starts_on),
        ("contract.expires_on", expires_on),
    ] {
        if date.is_some_and(|date| GameDate::new(date.year, date.month, date.day) != Some(date)) {
            issue(
                issues,
                "invalid_date",
                entity_kind,
                entity_id,
                field,
                "contract date is not a valid calendar date",
            );
        }
    }
    if starts_on
        .zip(expires_on)
        .is_some_and(|(start, expiry)| start > expiry)
    {
        issue(
            issues,
            "invalid_contract_range",
            entity_kind,
            entity_id,
            "contract.expires_on",
            "contract expiry must not be before its start date",
        );
    }
    validate_nonnegative_money(issues, entity_kind, entity_id, "contract.wage", wage);
    validate_nonnegative_money(
        issues,
        entity_kind,
        entity_id,
        "contract.release_clause",
        release_clause,
    );
}

fn validate_abilities(
    issues: &mut Vec<SnapshotIssue>,
    entity_kind: &str,
    entity_id: &str,
    current_ability: Option<u16>,
    potential_ability: Option<u16>,
) {
    for (field, value) in [
        ("current_ability", current_ability),
        ("potential_ability", potential_ability),
    ] {
        if value.is_some_and(|value| value > 200) {
            issue(
                issues,
                "ability_out_of_range",
                entity_kind,
                entity_id,
                field,
                "ability must not exceed 200",
            );
        }
    }
}

fn validate_reputation(
    issues: &mut Vec<SnapshotIssue>,
    entity_kind: &str,
    entity_id: &str,
    field: &str,
    reputation: Option<u16>,
) {
    if reputation.is_some_and(|reputation| reputation > 10_000) {
        issue(
            issues,
            "reputation_out_of_range",
            entity_kind,
            entity_id,
            field,
            "reputation must not exceed 10000",
        );
    }
}

fn validate_unique_ids<'a>(
    issues: &mut Vec<SnapshotIssue>,
    entity_kind: &str,
    ids: impl IntoIterator<Item = &'a str>,
) {
    let mut seen = HashSet::new();
    for id in ids {
        if id.trim().is_empty() {
            issue(
                issues,
                "empty_id",
                entity_kind,
                id,
                "id",
                "entity ID must not be empty",
            );
        } else if !seen.insert(id) {
            issue(
                issues,
                "duplicate_id",
                entity_kind,
                id,
                "id",
                "entity ID must be unique within its kind",
            );
        }
    }
}

fn validate_nonnegative_money(
    issues: &mut Vec<SnapshotIssue>,
    entity_kind: &str,
    entity_id: &str,
    field: &str,
    value: Option<f64>,
) {
    if value.is_some_and(|value| !value.is_finite() || value < 0.0) {
        issue(
            issues,
            "invalid_money",
            entity_kind,
            entity_id,
            field,
            "money value must be finite and non-negative",
        );
    }
}

fn validate_finite_money(
    issues: &mut Vec<SnapshotIssue>,
    entity_kind: &str,
    entity_id: &str,
    field: &str,
    value: Option<f64>,
) {
    if value.is_some_and(|value| !value.is_finite()) {
        issue(
            issues,
            "invalid_money",
            entity_kind,
            entity_id,
            field,
            "money value must be finite",
        );
    }
}

fn issue(
    issues: &mut Vec<SnapshotIssue>,
    code: &str,
    entity_kind: &str,
    entity_id: &str,
    field: impl Into<String>,
    message: impl Into<String>,
) {
    issues.push(SnapshotIssue {
        severity: IssueSeverity::Error,
        code: code.to_owned(),
        entity_kind: entity_kind.to_owned(),
        entity_id: entity_id.to_owned(),
        field: field.into(),
        message: message.into(),
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        Attribute, FutureTransfer, LanguageSkill, PersonRelationship, PlayerRegistration,
        RegistrationStatus, RelationshipKind, RelationshipTargetKind, StaffQualification,
        StaffResponsibility, TransferStatus, synthetic_snapshot,
    };

    #[test]
    fn accepts_the_synthetic_reference_snapshot() {
        let report = validate_snapshot(&synthetic_snapshot());
        assert!(report.valid, "{:?}", report.issues);
        assert!(report.issues.is_empty());
    }

    #[test]
    fn reports_all_relevant_boundary_failures() {
        let mut snapshot = synthetic_snapshot();
        snapshot.players[1].id = snapshot.players[0].id.clone();
        snapshot.players[0].current_ability = Some(201);
        snapshot.players[0]
            .attributes
            .insert(Attribute::Passing, 21);
        snapshot.players[0]
            .details
            .contract
            .as_mut()
            .unwrap()
            .club_id = Some("missing-club".into());
        snapshot.staff[0].reputation = Some(10_001);
        snapshot.clubs[0].facilities.training = Some(21);
        snapshot.competitions[0].level = Some(0);
        let report = validate_snapshot(&snapshot);
        assert!(!report.valid);
        for code in [
            "duplicate_id",
            "ability_out_of_range",
            "attribute_out_of_range",
            "unknown_club_reference",
            "reputation_out_of_range",
            "facility_out_of_range",
            "level_out_of_range",
        ] {
            assert!(report.issues.iter().any(|issue| issue.code == code));
        }
    }

    #[test]
    fn rejects_invalid_club_references_text_status_capacity_and_attendance() {
        let mut snapshot = synthetic_snapshot();
        snapshot.clubs[0].name = "x".repeat(129);
        snapshot.clubs[0].short_name = Some(String::new());
        snapshot.clubs[0].competition_id = Some("missing-competition".into());
        snapshot.clubs[0].professional_status = Some("galactic".into());
        snapshot.clubs[0].stadium_capacity = Some(10_000);
        snapshot.clubs[0].average_attendance = Some(10_001);
        snapshot.clubs[1].competition = Some("Falscher Name".into());
        snapshot.clubs[1].stadium_capacity = Some(0);

        let report = validate_snapshot(&snapshot);
        assert!(!report.valid);
        for code in [
            "club_name_too_long",
            "invalid_club_text",
            "unknown_competition_reference",
            "club_competition_name_mismatch",
            "invalid_professional_status",
            "stadium_capacity_out_of_range",
            "attendance_out_of_range",
        ] {
            assert!(
                report.issues.iter().any(|issue| issue.code == code),
                "missing expected issue code {code}: {:?}",
                report.issues
            );
        }
    }

    #[test]
    fn rejects_invalid_club_branding_kits_and_relationships() {
        let mut snapshot = synthetic_snapshot();
        snapshot.clubs[0].branding.primary_colour = Some("blue".into());
        snapshot.clubs[0].branding.kits[0].pattern = Some(String::new());
        let mut duplicate_kit = snapshot.clubs[0].branding.kits[0].clone();
        duplicate_kit.id = "second-home-kit".into();
        duplicate_kit.trim_colour = Some("#12XY00".into());
        snapshot.clubs[0].branding.kits.push(duplicate_kit);
        let duplicate_relationship_id = snapshot.clubs[1].relationships[0].id.clone();
        let self_club_id = snapshot.clubs[0].id.clone();
        snapshot.clubs[0].relationships[0].id = duplicate_relationship_id;
        snapshot.clubs[0].relationships[0].target_club_id = "missing-club".into();
        snapshot.clubs[0].relationships[0].strength = 0;
        snapshot.clubs[0]
            .relationships
            .push(crate::ClubRelationship {
                id: "self-club-relation".into(),
                kind: crate::ClubRelationshipKind::Friendly,
                target_club_id: self_club_id,
                strength: 50,
            });

        let report = validate_snapshot(&snapshot);
        assert!(!report.valid);
        for code in [
            "invalid_club_colour",
            "invalid_club_kit_colour",
            "invalid_club_kit_pattern",
            "duplicate_club_kit_kind",
            "invalid_club_relationship_id",
            "unknown_club_relationship_target",
            "self_club_relationship",
            "club_relationship_strength_out_of_range",
        ] {
            assert!(
                report.issues.iter().any(|issue| issue.code == code),
                "missing expected issue code {code}: {:?}",
                report.issues
            );
        }
    }

    #[test]
    fn rejects_invalid_competition_stages_fixtures_and_standings() {
        let mut snapshot = synthetic_snapshot();
        let competition = &mut snapshot.competitions[0];
        competition.current_champion = Some("Falscher Titelverteidiger".into());
        competition.stages[0].name.clear();
        competition.stages[0].order = 0;
        competition.stages[0].starts_on = GameDate::new(2027, 6, 1);
        competition.stages[0].ends_on = GameDate::new(2027, 5, 31);
        competition.fixtures[0].stage_id = Some("missing-stage".into());
        competition.fixtures[0].away_club_id = "missing-club".into();
        competition.fixtures[0].status = crate::FixtureStatus::Played;
        competition.fixtures[0].home_score = Some(1);
        competition.fixtures[0].away_score = None;
        competition.standings[0].stage_id = Some("missing-stage".into());
        competition.standings[0].club_id = "missing-club".into();
        competition.standings[0].played = 2;
        competition.standings[0].goals_for = 3;
        competition.standings[0].goal_difference = 0;
        competition.standings[0].points = 10_001;

        let report = validate_snapshot(&snapshot);
        assert!(!report.valid);
        for code in [
            "champion_name_mismatch",
            "invalid_competition_stage_name",
            "invalid_competition_stage_order",
            "invalid_date_range",
            "unknown_fixture_stage_reference",
            "unknown_fixture_club_reference",
            "invalid_fixture_score",
            "missing_played_fixture_score",
            "unknown_standing_stage_reference",
            "unknown_standing_club_reference",
            "invalid_standing_totals",
            "invalid_standing_goal_difference",
            "standing_points_out_of_range",
        ] {
            assert!(
                report.issues.iter().any(|issue| issue.code == code),
                "missing expected issue code {code}: {:?}",
                report.issues
            );
        }
    }

    #[test]
    fn rejects_a_one_sided_future_swap() {
        let mut snapshot = synthetic_snapshot();
        snapshot.players[0].details.future_transfer = Some(FutureTransfer {
            id: "half-swap".into(),
            kind: TransferKind::Swap,
            from_club_id: Some("club-nordhafen".into()),
            to_club_id: "club-suedstadt".into(),
            arranged_on: GameDate::new(2026, 7, 22),
            effective_on: GameDate::new(2026, 8, 1).unwrap(),
            fee: Some(0.0),
            loan_end: None,
            wage_contribution_percent: None,
            swap_player_id: Some("player-milo".into()),
            status: TransferStatus::Agreed,
        });
        let report = validate_snapshot(&snapshot);
        assert!(!report.valid);
        assert!(
            report
                .issues
                .iter()
                .any(|issue| issue.code == "non_reciprocal_swap")
        );
    }

    #[test]
    fn reports_every_nested_people_boundary_failure() {
        let mut snapshot = synthetic_snapshot();
        snapshot.players[0].details.languages = vec![
            LanguageSkill {
                language: "Deutsch".into(),
                speaking: 0,
                reading: 10,
                writing: 10,
            },
            LanguageSkill {
                language: " deutsch ".into(),
                speaking: 10,
                reading: 10,
                writing: 10,
            },
            LanguageSkill {
                language: "Spanisch".into(),
                speaking: 11,
                reading: 10,
                writing: 10,
            },
        ];
        snapshot.players[0].details.relationships = vec![PersonRelationship {
            id: "duplicate-relationship".into(),
            kind: RelationshipKind::FavoriteClub,
            target_kind: RelationshipTargetKind::Player,
            target_id: "player-ada".into(),
            strength: 0,
        }];
        snapshot.staff[0].details.relationships = vec![PersonRelationship {
            id: "duplicate-relationship".into(),
            kind: RelationshipKind::Friend,
            target_kind: RelationshipTargetKind::Player,
            target_id: "missing-player".into(),
            strength: 101,
        }];
        let mut second_competition = snapshot.competitions[0].clone();
        second_competition.id = "competition-cup".into();
        second_competition.name = "Synthetic Cup".into();
        snapshot.competitions.push(second_competition);
        snapshot.players[0].details.registrations = vec![
            PlayerRegistration {
                id: String::new(),
                competition_id: "missing-competition".into(),
                club_id: "missing-club".into(),
                status: RegistrationStatus::Registered,
                registered_on: Some(GameDate {
                    year: 2027,
                    month: 2,
                    day: 30,
                }),
                expires_on: GameDate::new(2026, 1, 1),
                squad_number: Some(0),
                homegrown_at_club: false,
                homegrown_in_nation: false,
            },
            PlayerRegistration {
                id: "registration-upper-bound".into(),
                competition_id: "competition-cup".into(),
                club_id: "club-nordhafen".into(),
                status: RegistrationStatus::Registered,
                registered_on: GameDate::new(2026, 7, 1),
                expires_on: GameDate::new(2027, 6, 30),
                squad_number: Some(100),
                homegrown_at_club: false,
                homegrown_in_nation: false,
            },
        ];
        snapshot.staff[0].roles.clear();
        snapshot.staff[0].details.responsibilities = vec![
            StaffResponsibility::Recruitment,
            StaffResponsibility::Recruitment,
        ];
        snapshot.staff[0].details.note = Some("x".repeat(4_001));
        snapshot.staff[0].details.qualifications = vec![
            StaffQualification {
                id: String::new(),
                name: String::new(),
                level: 0,
                awarded_on: Some(GameDate {
                    year: 2027,
                    month: 13,
                    day: 1,
                }),
                expires_on: GameDate::new(2026, 1, 1),
            },
            StaffQualification {
                id: "qualification-upper-bound".into(),
                name: "Synthetic Licence".into(),
                level: 6,
                awarded_on: GameDate::new(2026, 1, 1),
                expires_on: None,
            },
        ];

        let report = validate_snapshot(&snapshot);
        assert!(!report.valid);
        for code in [
            "invalid_language",
            "language_proficiency_out_of_range",
            "invalid_relationship_id",
            "unknown_relationship_target",
            "relationship_kind_target_mismatch",
            "self_relationship",
            "relationship_strength_out_of_range",
            "invalid_registration_id",
            "invalid_registration_competition",
            "invalid_registration_club",
            "invalid_date",
            "invalid_date_range",
            "squad_number_out_of_range",
            "invalid_staff_roles",
            "duplicate_staff_responsibility",
            "staff_note_too_long",
            "invalid_staff_qualification_id",
            "invalid_staff_qualification_name",
            "staff_qualification_level_out_of_range",
        ] {
            assert!(
                report.issues.iter().any(|issue| issue.code == code),
                "missing expected issue code {code}: {:?}",
                report.issues
            );
        }
    }
}
