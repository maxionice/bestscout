use serde::{Deserialize, Serialize};

use crate::{GameDate, Player};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SquadAnalysis {
    pub as_of: GameDate,
    pub player_count: usize,
    pub average_age: Option<f64>,
    pub weekly_wage_total: f64,
    pub annual_wage_total: f64,
    pub average_weekly_wage: Option<f64>,
    pub expiring_within_year: usize,
    pub age_bands: Vec<AnalysisBucket>,
    pub contract_windows: Vec<AnalysisBucket>,
    pub position_groups: Vec<PositionGroupAnalysis>,
    pub succession_risks: Vec<SuccessionRisk>,
    pub wage_outliers: Vec<WageOutlier>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnalysisBucket {
    pub id: String,
    pub label: String,
    pub count: usize,
    pub weekly_wage: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PositionGroupAnalysis {
    pub id: String,
    pub label: String,
    pub count: usize,
    pub average_age: Option<f64>,
    pub average_current_ability: Option<f64>,
    pub highest_current_ability: Option<u16>,
    pub under_23_count: usize,
    pub players: Vec<SquadPlayerSummary>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SquadPlayerSummary {
    pub id: String,
    pub name: String,
    pub age: Option<u8>,
    pub current_ability: Option<u16>,
    pub potential_ability: Option<u16>,
    pub weekly_wage: Option<f64>,
    pub contract_expires_on: Option<GameDate>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskSeverity {
    Critical,
    Warning,
    Watch,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SuccessionRisk {
    pub position_group_id: String,
    pub position_group_label: String,
    pub severity: RiskSeverity,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WageOutlier {
    pub player_id: String,
    pub player_name: String,
    pub weekly_wage: f64,
    pub share_of_total: f64,
    pub multiple_of_average: f64,
}

const POSITION_GROUPS: [(&str, &str); 7] = [
    ("goalkeeper", "Tor"),
    ("defence", "Innenverteidigung"),
    ("full_back", "Außenverteidigung"),
    ("defensive_midfield", "Defensives Mittelfeld"),
    ("central_midfield", "Zentrales Mittelfeld"),
    ("attacking_midfield", "Offensives Mittelfeld & Flügel"),
    ("forward", "Angriff"),
];

pub fn analyse_squad(players: &[Player], as_of: GameDate) -> SquadAnalysis {
    let ages: Vec<_> = players.iter().filter_map(|player| player.age).collect();
    let wages: Vec<_> = players.iter().filter_map(player_wage).collect();
    let weekly_wage_total = wages.iter().sum::<f64>();
    let average_weekly_wage =
        (!wages.is_empty()).then(|| round2(weekly_wage_total / wages.len() as f64));

    let age_bands = [
        ("u21", "U21", 0, 21),
        ("development", "22–25", 22, 25),
        ("prime", "26–29", 26, 29),
        ("experienced", "30+", 30, u8::MAX),
        ("unknown", "Unbekannt", 0, u8::MAX),
    ]
    .into_iter()
    .map(|(id, label, minimum, maximum)| {
        let members: Vec<_> = players
            .iter()
            .filter(|player| match (id, player.age) {
                ("unknown", None) => true,
                ("unknown", Some(_)) | (_, None) => false,
                (_, Some(age)) => age >= minimum && age <= maximum,
            })
            .collect();
        bucket(id, label, &members)
    })
    .collect();

    let one_year = anniversary(as_of, 1);
    let two_years = anniversary(as_of, 2);
    let contract_windows = [
        ("expired", "Abgelaufen"),
        ("next_year", "≤ 12 Monate"),
        ("following_year", "12–24 Monate"),
        ("later", "> 24 Monate"),
        ("unknown", "Unbekannt"),
    ]
    .into_iter()
    .map(|(id, label)| {
        let members: Vec<_> = players
            .iter()
            .filter(|player| contract_window(player, as_of, one_year, two_years) == id)
            .collect();
        bucket(id, label, &members)
    })
    .collect::<Vec<_>>();

    let position_groups = POSITION_GROUPS
        .into_iter()
        .map(|(id, label)| position_group(players, id, label))
        .collect::<Vec<_>>();
    let succession_risks = position_groups
        .iter()
        .filter_map(|group| succession_risk(group, as_of, one_year))
        .collect();
    let mut wage_outliers = average_weekly_wage.map_or_else(Vec::new, |average| {
        players
            .iter()
            .filter_map(|player| {
                let wage = player_wage(player)?;
                (wage >= average * 1.35).then(|| WageOutlier {
                    player_id: player.id.clone(),
                    player_name: player.name.clone(),
                    weekly_wage: wage,
                    share_of_total: round2(if weekly_wage_total > 0.0 {
                        wage / weekly_wage_total * 100.0
                    } else {
                        0.0
                    }),
                    multiple_of_average: round2(wage / average),
                })
            })
            .collect()
    });
    wage_outliers.sort_by(|left, right| right.weekly_wage.total_cmp(&left.weekly_wage));
    wage_outliers.truncate(5);

    SquadAnalysis {
        as_of,
        player_count: players.len(),
        average_age: (!ages.is_empty()).then(|| {
            round2(ages.iter().map(|&age| f64::from(age)).sum::<f64>() / ages.len() as f64)
        }),
        weekly_wage_total: round2(weekly_wage_total),
        annual_wage_total: round2(weekly_wage_total * 52.0),
        average_weekly_wage,
        expiring_within_year: contract_windows
            .iter()
            .find(|bucket| bucket.id == "next_year")
            .map_or(0, |bucket| bucket.count),
        age_bands,
        contract_windows,
        position_groups,
        succession_risks,
        wage_outliers,
    }
}

fn bucket(id: &str, label: &str, players: &[&Player]) -> AnalysisBucket {
    AnalysisBucket {
        id: id.into(),
        label: label.into(),
        count: players.len(),
        weekly_wage: round2(
            players
                .iter()
                .filter_map(|player| player_wage(player))
                .sum(),
        ),
    }
}

fn position_group(players: &[Player], id: &str, label: &str) -> PositionGroupAnalysis {
    let mut members: Vec<_> = players
        .iter()
        .filter(|player| primary_position_group(player) == id)
        .collect();
    members.sort_by(|left, right| {
        right
            .current_ability
            .cmp(&left.current_ability)
            .then_with(|| left.name.cmp(&right.name))
    });
    let ages: Vec<_> = members.iter().filter_map(|player| player.age).collect();
    let abilities: Vec<_> = members
        .iter()
        .filter_map(|player| player.current_ability)
        .collect();
    PositionGroupAnalysis {
        id: id.into(),
        label: label.into(),
        count: members.len(),
        average_age: average_u8(&ages),
        average_current_ability: average_u16(&abilities),
        highest_current_ability: abilities.iter().max().copied(),
        under_23_count: members
            .iter()
            .filter(|player| player.age.is_some_and(|age| age < 23))
            .count(),
        players: members.into_iter().map(player_summary).collect(),
    }
}

fn succession_risk(
    group: &PositionGroupAnalysis,
    as_of: GameDate,
    one_year: GameDate,
) -> Option<SuccessionRisk> {
    let mut severity = RiskSeverity::Watch;
    let mut reasons = Vec::new();
    if group.count < 2 {
        severity = RiskSeverity::Critical;
        reasons.push(format!(
            "Nur {} Spieler in dieser Positionsgruppe",
            group.count
        ));
    }
    if group.count > 0
        && group.under_23_count == 0
        && group.average_age.is_some_and(|age| age >= 28.0)
    {
        if severity == RiskSeverity::Watch {
            severity = RiskSeverity::Warning;
        }
        reasons.push("Kein U23-Nachfolger bei hohem Durchschnittsalter".into());
    }
    if let Some(core_player) = group.players.first()
        && core_player
            .contract_expires_on
            .is_some_and(|date| date >= as_of && date <= one_year)
    {
        if severity == RiskSeverity::Watch {
            severity = RiskSeverity::Warning;
        }
        reasons.push(format!(
            "Vertrag von Kernspieler {} läuft binnen 12 Monaten aus",
            core_player.name
        ));
    }
    (!reasons.is_empty()).then(|| SuccessionRisk {
        position_group_id: group.id.clone(),
        position_group_label: group.label.clone(),
        severity,
        reasons,
    })
}

fn player_summary(player: &Player) -> SquadPlayerSummary {
    SquadPlayerSummary {
        id: player.id.clone(),
        name: player.name.clone(),
        age: player.age,
        current_ability: player.current_ability,
        potential_ability: player.potential_ability,
        weekly_wage: player_wage(player),
        contract_expires_on: player
            .details
            .contract
            .as_ref()
            .and_then(|contract| contract.expires_on),
    }
}

fn primary_position_group(player: &Player) -> &'static str {
    let position = player
        .positions
        .first()
        .map_or("", String::as_str)
        .to_uppercase();
    if position.contains("TW") || position.contains("GK") || position.contains("TOR") {
        "goalkeeper"
    } else if position.contains("AV") || position.contains("WB") || position.contains("WING-BACK") {
        "full_back"
    } else if position.starts_with("DM") || position.contains("DM") {
        "defensive_midfield"
    } else if position.starts_with("OM") || position.starts_with("AM") || position.starts_with('W')
    {
        "attacking_midfield"
    } else if position.starts_with("ST") || position.starts_with("SC") || position.contains("ANG") {
        "forward"
    } else if position.starts_with('V') || position.starts_with('D') {
        "defence"
    } else {
        "central_midfield"
    }
}

fn player_wage(player: &Player) -> Option<f64> {
    player
        .details
        .contract
        .as_ref()
        .and_then(|contract| contract.wage)
        .or(player.wage)
        .filter(|wage| wage.is_finite() && *wage >= 0.0)
}

fn contract_window(
    player: &Player,
    as_of: GameDate,
    one_year: GameDate,
    two_years: GameDate,
) -> &'static str {
    match player
        .details
        .contract
        .as_ref()
        .and_then(|contract| contract.expires_on)
    {
        None => "unknown",
        Some(date) if date < as_of => "expired",
        Some(date) if date <= one_year => "next_year",
        Some(date) if date <= two_years => "following_year",
        Some(_) => "later",
    }
}

fn anniversary(date: GameDate, years: u16) -> GameDate {
    GameDate::new(date.year.saturating_add(years), date.month, date.day)
        .or_else(|| {
            GameDate::new(
                date.year.saturating_add(years),
                date.month,
                date.day.saturating_sub(1),
            )
        })
        .expect("a valid date has a valid anniversary")
}

fn average_u8(values: &[u8]) -> Option<f64> {
    (!values.is_empty()).then(|| {
        round2(values.iter().map(|&value| f64::from(value)).sum::<f64>() / values.len() as f64)
    })
}

fn average_u16(values: &[u16]) -> Option<f64> {
    (!values.is_empty()).then(|| {
        round2(values.iter().map(|&value| f64::from(value)).sum::<f64>() / values.len() as f64)
    })
}

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Contract, ContractType, PlayerDetails, synthetic_snapshot};

    #[test]
    fn analyses_age_wage_contract_and_position_depth() {
        let mut players = synthetic_snapshot().players;
        players[0].positions = vec!["M (Z)".into()];
        players[1].positions = vec!["M (Z)".into()];
        players[1].wage = Some(8_000.0);
        players[1].details.contract = Some(Contract {
            expires_on: GameDate::new(2027, 6, 30),
            contract_type: ContractType::FullTime,
            wage: Some(8_000.0),
            ..Default::default()
        });

        let analysis = analyse_squad(&players, GameDate::new(2026, 7, 1).unwrap());
        assert_eq!(analysis.player_count, 2);
        assert_eq!(analysis.average_age, Some(21.5));
        assert_eq!(analysis.weekly_wage_total, 26_500.0);
        assert_eq!(analysis.expiring_within_year, 1);
        let midfield = analysis
            .position_groups
            .iter()
            .find(|group| group.id == "central_midfield")
            .unwrap();
        assert_eq!(midfield.count, 2);
        assert_eq!(midfield.highest_current_ability, Some(128));
        assert_eq!(midfield.under_23_count, 1);
    }

    #[test]
    fn flags_thin_groups_and_core_players_with_expiring_contracts() {
        let mut player = synthetic_snapshot().players.remove(0);
        player.positions = vec!["ST".into()];
        player.age = Some(31);
        player.details = PlayerDetails {
            contract: Some(Contract {
                expires_on: GameDate::new(2027, 6, 30),
                ..Default::default()
            }),
            ..Default::default()
        };
        let analysis = analyse_squad(&[player], GameDate::new(2026, 7, 1).unwrap());
        let attack = analysis
            .succession_risks
            .iter()
            .find(|risk| risk.position_group_id == "forward")
            .unwrap();
        assert_eq!(attack.severity, RiskSeverity::Critical);
        assert_eq!(attack.reasons.len(), 3);
    }
}
