use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::{Attribute, DatabaseSnapshot, GameDate, Player};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct IntelligenceCriteria {
    pub as_of: GameDate,
    pub wonderkid_max_age: u8,
    pub wonderkid_min_potential: u16,
    pub bargain_max_value: f64,
    pub bargain_min_projected_peak: u16,
    pub expiring_within_days: u16,
}

impl IntelligenceCriteria {
    pub fn fm26_default(as_of: GameDate) -> Self {
        Self {
            as_of,
            wonderkid_max_age: 21,
            wonderkid_min_potential: 150,
            bargain_max_value: 20_000_000.0,
            bargain_min_projected_peak: 145,
            expiring_within_days: 365,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProjectionFactor {
    pub id: String,
    pub label: String,
    pub score: f64,
    pub weight: f64,
    pub observed: bool,
    pub explanation: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DevelopmentProjection {
    pub projected_peak_ability: u16,
    pub reach_potential_probability: f64,
    pub confidence: f64,
    pub ability_gain: u16,
    pub years_to_peak: u8,
    pub attribute_peaks: BTreeMap<Attribute, u8>,
    pub factors: Vec<ProjectionFactor>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlayerIntelligence {
    pub player: Player,
    pub projection: Option<DevelopmentProjection>,
    pub is_wonderkid: bool,
    pub is_bargain: bool,
    pub is_free_agent: bool,
    pub is_expiring_contract: bool,
    pub bargain_score: Option<f64>,
    pub contract_days_remaining: Option<i32>,
    pub discovery_score: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScoutIntelligenceReport {
    pub criteria: IntelligenceCriteria,
    pub players: Vec<PlayerIntelligence>,
    pub wonderkid_count: usize,
    pub bargain_count: usize,
    pub free_agent_count: usize,
    pub expiring_contract_count: usize,
}

pub fn analyse_scout_intelligence(
    snapshot: &DatabaseSnapshot,
    criteria: &IntelligenceCriteria,
) -> ScoutIntelligenceReport {
    let mut players: Vec<_> = snapshot
        .players
        .iter()
        .map(|player| analyse_player(snapshot, player, criteria))
        .collect();
    players.sort_by(|left, right| {
        right
            .discovery_score
            .total_cmp(&left.discovery_score)
            .then_with(|| left.player.name.cmp(&right.player.name))
            .then_with(|| left.player.id.cmp(&right.player.id))
    });

    ScoutIntelligenceReport {
        wonderkid_count: players.iter().filter(|row| row.is_wonderkid).count(),
        bargain_count: players.iter().filter(|row| row.is_bargain).count(),
        free_agent_count: players.iter().filter(|row| row.is_free_agent).count(),
        expiring_contract_count: players
            .iter()
            .filter(|row| row.is_expiring_contract)
            .count(),
        criteria: criteria.clone(),
        players,
    }
}

fn analyse_player(
    snapshot: &DatabaseSnapshot,
    player: &Player,
    criteria: &IntelligenceCriteria,
) -> PlayerIntelligence {
    let environment = development_environment(snapshot, player);
    let projection = project_development(player, environment);
    let projected_peak = projection
        .as_ref()
        .map(|projection| projection.projected_peak_ability);
    let is_wonderkid = player
        .age
        .is_some_and(|age| age <= criteria.wonderkid_max_age)
        && player
            .potential_ability
            .is_some_and(|ability| ability >= criteria.wonderkid_min_potential);
    let is_free_agent = player.club.is_none()
        && player
            .details
            .contract
            .as_ref()
            .and_then(|contract| contract.club_id.as_ref())
            .is_none();
    let contract_days_remaining = player
        .details
        .contract
        .as_ref()
        .and_then(|contract| contract.expires_on)
        .map(|expiry| days_between(criteria.as_of, expiry));
    let is_expiring_contract = contract_days_remaining
        .is_some_and(|days| days >= 0 && days <= i32::from(criteria.expiring_within_days));
    let bargain_score = player
        .value
        .and_then(|value| projected_peak.map(|peak| value_efficiency(peak, value)));
    let is_bargain = !is_free_agent
        && player
            .value
            .is_some_and(|value| value >= 0.0 && value <= criteria.bargain_max_value)
        && projected_peak.is_some_and(|peak| peak >= criteria.bargain_min_projected_peak);
    let projection_score = projection
        .as_ref()
        .map(|projection| {
            f64::from(projection.projected_peak_ability) / 2.0
                + projection.reach_potential_probability * 0.25
        })
        .unwrap_or_default();
    let discovery_score = projection_score
        + if is_wonderkid { 18.0 } else { 0.0 }
        + if is_bargain { 12.0 } else { 0.0 }
        + if is_free_agent { 10.0 } else { 0.0 }
        + if is_expiring_contract { 8.0 } else { 0.0 };

    PlayerIntelligence {
        player: player.clone(),
        projection,
        is_wonderkid,
        is_bargain,
        is_free_agent,
        is_expiring_contract,
        bargain_score,
        contract_days_remaining,
        discovery_score,
    }
}

fn project_development(player: &Player, environment: Option<f64>) -> Option<DevelopmentProjection> {
    let age = player.age?;
    let current = player.current_ability?;
    let potential = player.potential_ability?;
    let gap = potential.saturating_sub(current);
    let age_score = age_runway(age);

    let personality_values = [
        player.details.professionalism.map(normalize_attribute),
        player.details.ambition.map(normalize_attribute),
        player
            .attribute(Attribute::Determination)
            .map(normalize_attribute),
    ];
    let personality = average_observed(&personality_values).unwrap_or(0.5);
    let resilience_values = [
        player
            .attribute(Attribute::NaturalFitness)
            .map(normalize_attribute),
        player
            .details
            .injury_proneness
            .map(|value| 1.0 - normalize_attribute(value)),
    ];
    let resilience = average_observed(&resilience_values).unwrap_or(0.5);
    let environment_score = environment.unwrap_or(0.5);
    let difficulty = (1.0 - f64::from(gap) / 400.0).clamp(0.65, 1.0);
    let probability =
        ((age_score * 0.40 + personality * 0.30 + resilience * 0.15 + environment_score * 0.15)
            * difficulty)
            .clamp(0.05, 0.98);
    let ability_gain = (f64::from(gap) * probability).round() as u16;
    let projected_peak_ability = current.saturating_add(ability_gain).min(potential);
    let observed_points = 2
        + personality_values.iter().flatten().count()
        + resilience_values.iter().flatten().count()
        + usize::from(environment.is_some());
    let confidence = (f64::from(observed_points as u32) / 8.0 * 100.0).clamp(25.0, 100.0);
    let attribute_peaks = player
        .attributes
        .iter()
        .map(|(attribute, value)| {
            let headroom = 20_u8.saturating_sub(*value);
            let increase = (f64::from(headroom) * probability * age_score * 0.55).round() as u8;
            (*attribute, value.saturating_add(increase).min(20))
        })
        .collect();

    Some(DevelopmentProjection {
        projected_peak_ability,
        reach_potential_probability: probability * 100.0,
        confidence,
        ability_gain,
        years_to_peak: years_to_peak(age),
        attribute_peaks,
        factors: vec![
            factor(
                "age_runway",
                "Entwicklungsfenster",
                age_score,
                0.40,
                true,
                format!("Alter {age}; jüngere Spieler besitzen mehr Entwicklungszeit"),
            ),
            factor(
                "personality",
                "Mentalität",
                personality,
                0.30,
                personality_values.iter().any(Option::is_some),
                "Professionalität, Ehrgeiz und Zielstrebigkeit".to_owned(),
            ),
            factor(
                "resilience",
                "Belastbarkeit",
                resilience,
                0.15,
                resilience_values.iter().any(Option::is_some),
                "Grundfitness und inverse Verletzungsanfälligkeit".to_owned(),
            ),
            factor(
                "environment",
                "Vereinsumfeld",
                environment_score,
                0.15,
                environment.is_some(),
                "Trainings- und Jugendeinrichtungen des Vertragsvereins".to_owned(),
            ),
        ],
    })
}

fn development_environment(snapshot: &DatabaseSnapshot, player: &Player) -> Option<f64> {
    let contract_club_id = player
        .details
        .contract
        .as_ref()
        .and_then(|contract| contract.club_id.as_deref());
    let club = snapshot.clubs.iter().find(|club| {
        contract_club_id.is_some_and(|id| club.id == id)
            || player.club.as_deref().is_some_and(|name| {
                club.name.eq_ignore_ascii_case(name)
                    || club
                        .short_name
                        .as_deref()
                        .is_some_and(|short| short.eq_ignore_ascii_case(name))
            })
    })?;
    average_observed(&[
        club.facilities.training.map(normalize_attribute),
        club.facilities.youth.map(normalize_attribute),
        club.facilities.youth_recruitment.map(normalize_attribute),
        club.facilities.junior_coaching.map(normalize_attribute),
    ])
}

fn factor(
    id: &str,
    label: &str,
    score: f64,
    weight: f64,
    observed: bool,
    explanation: String,
) -> ProjectionFactor {
    ProjectionFactor {
        id: id.to_owned(),
        label: label.to_owned(),
        score: score * 100.0,
        weight: weight * 100.0,
        observed,
        explanation,
    }
}

fn normalize_attribute(value: u8) -> f64 {
    (f64::from(value.saturating_sub(1)) / 19.0).clamp(0.0, 1.0)
}

fn average_observed(values: &[Option<f64>]) -> Option<f64> {
    let (sum, count) = values
        .iter()
        .flatten()
        .fold((0.0, 0_u32), |(sum, count), value| (sum + value, count + 1));
    (count > 0).then(|| sum / f64::from(count))
}

fn age_runway(age: u8) -> f64 {
    match age {
        0..=18 => 1.0,
        19 => 0.95,
        20 => 0.88,
        21 => 0.80,
        22 => 0.70,
        23 => 0.58,
        24 => 0.45,
        25 => 0.32,
        26 => 0.20,
        _ => 0.10,
    }
}

fn years_to_peak(age: u8) -> u8 {
    match age {
        0..=18 => 6,
        19 => 5,
        20 => 4,
        21..=22 => 3,
        23..=25 => 2,
        _ => 1,
    }
}

fn value_efficiency(projected_peak: u16, value: f64) -> f64 {
    f64::from(projected_peak) / (value / 1_000_000.0).max(0.25)
}

fn days_between(start: GameDate, end: GameDate) -> i32 {
    ordinal(end).saturating_sub(ordinal(start))
}

fn ordinal(date: GameDate) -> i32 {
    let previous_year = i32::from(date.year).saturating_sub(1);
    let leap_days = previous_year / 4 - previous_year / 100 + previous_year / 400;
    let month_offsets = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let leap_adjustment = i32::from(
        date.month > 2
            && (date.year.is_multiple_of(400)
                || (date.year.is_multiple_of(4) && !date.year.is_multiple_of(100))),
    );
    previous_year * 365
        + leap_days
        + month_offsets[usize::from(date.month.saturating_sub(1).min(11))]
        + leap_adjustment
        + i32::from(date.day)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::synthetic_snapshot;

    fn criteria() -> IntelligenceCriteria {
        IntelligenceCriteria::fm26_default(GameDate::new(2026, 7, 21).unwrap())
    }

    #[test]
    fn identifies_wonderkids_bargains_and_free_agents_deterministically() {
        let snapshot = synthetic_snapshot();
        let first = analyse_scout_intelligence(&snapshot, &criteria());
        let second = analyse_scout_intelligence(&snapshot, &criteria());

        assert_eq!(first, second);
        assert_eq!(first.wonderkid_count, 1);
        assert_eq!(first.bargain_count, 1);
        assert_eq!(first.free_agent_count, 1);
        let ada = first
            .players
            .iter()
            .find(|row| row.player.id == "player-ada")
            .unwrap();
        assert!(ada.is_wonderkid);
        assert!(ada.is_bargain);
        let projection = ada.projection.as_ref().unwrap();
        assert!((128..=174).contains(&projection.projected_peak_ability));
        assert!((5.0..=98.0).contains(&projection.reach_potential_probability));
        assert!(
            projection
                .attribute_peaks
                .values()
                .all(|value| *value <= 20)
        );
        assert_eq!(projection.factors.len(), 4);
    }

    #[test]
    fn detects_contracts_inside_the_configured_date_window() {
        let mut snapshot = synthetic_snapshot();
        snapshot.players[0]
            .details
            .contract
            .as_mut()
            .unwrap()
            .expires_on = GameDate::new(2027, 6, 30);
        let report = analyse_scout_intelligence(&snapshot, &criteria());
        let ada = report
            .players
            .iter()
            .find(|row| row.player.id == "player-ada")
            .unwrap();
        assert_eq!(ada.contract_days_remaining, Some(344));
        assert!(ada.is_expiring_contract);
        assert_eq!(report.expiring_contract_count, 1);
    }

    #[test]
    fn lowers_confidence_for_missing_factors_without_inventing_source_values() {
        let mut snapshot = synthetic_snapshot();
        let player = &mut snapshot.players[0];
        player.details.professionalism = None;
        player.details.ambition = None;
        player.details.injury_proneness = None;
        player.attributes.remove(&Attribute::Determination);
        player.attributes.remove(&Attribute::NaturalFitness);
        player.club = None;
        player.details.contract = None;
        let report = analyse_scout_intelligence(&snapshot, &criteria());
        let projection = report.players[0].projection.as_ref().unwrap();
        assert_eq!(projection.confidence, 25.0);
        assert!(
            projection
                .factors
                .iter()
                .skip(1)
                .all(|factor| !factor.observed)
        );
    }

    #[test]
    fn date_distance_handles_leap_years_and_expired_contracts() {
        assert_eq!(
            days_between(
                GameDate::new(2028, 2, 28).unwrap(),
                GameDate::new(2028, 3, 1).unwrap()
            ),
            2
        );
        assert_eq!(
            days_between(
                GameDate::new(2026, 7, 21).unwrap(),
                GameDate::new(2026, 7, 20).unwrap()
            ),
            -1
        );
    }
}
