use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::{Attribute, Player};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RoleProfile {
    pub id: String,
    pub name: String,
    pub phase: RolePhase,
    pub family: RoleFamily,
    pub weights: BTreeMap<Attribute, f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RolePhase {
    InPossession,
    OutOfPossession,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RoleFamily {
    Goalkeeper,
    CentreBack,
    FullBack,
    WingBack,
    DefensiveMidfield,
    CentralMidfield,
    AttackingMidfield,
    WideMidfield,
    Winger,
    Forward,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AttributeContribution {
    pub attribute: Attribute,
    pub value: u8,
    pub weight: f64,
    pub contribution: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScoreBreakdown {
    pub role_id: String,
    pub score: f64,
    pub coverage: f64,
    pub contributions: Vec<AttributeContribution>,
}

pub fn score_player(player: &Player, role: &RoleProfile) -> ScoreBreakdown {
    let total_weight: f64 = role.weights.values().sum();
    let mut seen_weight = 0.0;
    let mut weighted_score = 0.0;
    let mut contributions = Vec::new();

    for (&attribute, &weight) in &role.weights {
        if let Some(value) = player.attribute(attribute) {
            seen_weight += weight;
            let contribution = f64::from(value) * weight;
            weighted_score += contribution;
            contributions.push(AttributeContribution {
                attribute,
                value,
                weight,
                contribution,
            });
        }
    }

    contributions.sort_by(|a, b| b.contribution.total_cmp(&a.contribution));
    let raw = if seen_weight > 0.0 {
        weighted_score / seen_weight
    } else {
        0.0
    };

    ScoreBreakdown {
        role_id: role.id.clone(),
        score: round2(raw / 20.0 * 100.0),
        coverage: round2(if total_weight > 0.0 {
            seen_weight / total_weight * 100.0
        } else {
            0.0
        }),
        contributions,
    }
}

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Attribute::*, Foot};

    #[test]
    fn scores_on_a_hundred_point_scale_and_reports_coverage() {
        let player = Player {
            id: "1".into(),
            name: "Test".into(),
            age: Some(21),
            club: None,
            nationality: None,
            positions: vec![],
            preferred_foot: Foot::Unknown,
            value: None,
            wage: None,
            current_ability: None,
            potential_ability: None,
            attributes: [(Passing, 20), (Vision, 10)].into_iter().collect(),
            details: Default::default(),
        };
        let profile = RoleProfile {
            id: "playmaker".into(),
            name: "Playmaker".into(),
            phase: RolePhase::InPossession,
            family: RoleFamily::CentralMidfield,
            weights: [(Passing, 1.0), (Vision, 1.0), (Technique, 1.0)]
                .into_iter()
                .collect(),
        };
        let result = score_player(&player, &profile);
        assert_eq!(result.score, 75.0);
        assert_eq!(result.coverage, 66.67);
    }
}
