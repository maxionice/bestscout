use serde::{Deserialize, Serialize};

use crate::{Attribute, Player, ScoreBreakdown, builtin_roles, score_player};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SimilarPlayer {
    pub player: Player,
    pub similarity: f64,
    pub coverage: f64,
    pub role_score: Option<ScoreBreakdown>,
}

/// Finds players whose available attributes are closest to the reference.
/// A role ID makes important role attributes contribute more strongly; without
/// one, every one of the 47 player attributes has equal weight.
pub fn find_similar_players(
    reference: &Player,
    candidates: &[Player],
    role_id: Option<&str>,
    limit: usize,
) -> Vec<SimilarPlayer> {
    let role = role_id.and_then(|id| builtin_roles().iter().find(|role| role.id == id));
    let weights: Vec<_> = match role {
        Some(role) => role
            .weights
            .iter()
            .map(|(&attribute, &weight)| (attribute, weight))
            .collect(),
        None => Attribute::ALL
            .into_iter()
            .map(|attribute| (attribute, 1.0))
            .collect(),
    };
    let total_weight: f64 = weights.iter().map(|(_, weight)| weight).sum();

    let mut matches: Vec<_> = candidates
        .iter()
        .filter(|candidate| candidate.id != reference.id)
        .map(|candidate| {
            let mut seen_weight = 0.0;
            let mut squared_distance = 0.0;
            for &(attribute, weight) in &weights {
                if let (Some(left), Some(right)) = (
                    reference.attribute(attribute),
                    candidate.attribute(attribute),
                ) {
                    seen_weight += weight;
                    let delta = f64::from(left) - f64::from(right);
                    squared_distance += delta * delta * weight;
                }
            }
            let normalized_distance = if seen_weight > 0.0 {
                (squared_distance / seen_weight).sqrt() / 19.0
            } else {
                1.0
            };
            SimilarPlayer {
                player: candidate.clone(),
                similarity: round2((1.0 - normalized_distance).clamp(0.0, 1.0) * 100.0),
                coverage: round2(if total_weight > 0.0 {
                    seen_weight / total_weight * 100.0
                } else {
                    0.0
                }),
                role_score: role.map(|profile| score_player(candidate, profile)),
            }
        })
        .collect();
    matches.sort_by(|left, right| {
        right
            .similarity
            .total_cmp(&left.similarity)
            .then_with(|| right.coverage.total_cmp(&left.coverage))
            .then_with(|| left.player.name.cmp(&right.player.name))
            .then_with(|| left.player.id.cmp(&right.player.id))
    });
    matches.truncate(limit.clamp(1, 100));
    matches
}

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::synthetic_snapshot;

    #[test]
    fn identical_attributes_produce_a_perfect_match_and_exclude_the_reference() {
        let snapshot = synthetic_snapshot();
        let reference = &snapshot.players[0];
        let mut twin = reference.clone();
        twin.id = "synthetic-twin".into();
        twin.name = "Synthetic Twin".into();
        let matches = find_similar_players(
            reference,
            &[reference.clone(), snapshot.players[1].clone(), twin],
            Some("deep_lying_playmaker"),
            10,
        );
        assert_eq!(matches.len(), 2);
        assert_eq!(matches[0].player.id, "synthetic-twin");
        assert_eq!(matches[0].similarity, 100.0);
        assert!(matches[0].coverage > 0.0);
        assert_eq!(
            matches[0].role_score.as_ref().unwrap().role_id,
            "deep_lying_playmaker"
        );
    }

    #[test]
    fn respects_the_result_limit_and_reports_zero_for_no_shared_data() {
        let snapshot = synthetic_snapshot();
        let mut empty = snapshot.players[1].clone();
        empty.attributes.clear();
        let matches = find_similar_players(&snapshot.players[0], &[empty], None, 1);
        assert_eq!(matches[0].similarity, 0.0);
        assert_eq!(matches[0].coverage, 0.0);
    }
}
