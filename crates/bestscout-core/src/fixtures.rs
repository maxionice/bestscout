use std::collections::BTreeMap;

use crate::{
    Attribute, Club, ClubFacilities, ClubFinances, Competition, Contract, ContractType,
    DatabaseSnapshot, Foot, GameDate, Player, PlayerDetails, PlayerStatus, SnapshotSource, Staff,
    StaffAttribute, StaffRole,
};

pub fn synthetic_snapshot() -> DatabaseSnapshot {
    DatabaseSnapshot {
        schema_version: 1,
        source: SnapshotSource::Synthetic,
        players: vec![
            Player {
                id: "player-ada".into(),
                name: "Ada Beispiel".into(),
                age: Some(19),
                club: Some("SV Nordhafen".into()),
                nationality: Some("Deutschland".into()),
                positions: vec!["M (Z)".into(), "OM (Z)".into()],
                preferred_foot: Foot::Right,
                value: Some(12_500_000.0),
                wage: Some(18_500.0),
                current_ability: Some(128),
                potential_ability: Some(174),
                attributes: player_attributes(17, 18, 14, 17),
                details: PlayerDetails {
                    date_of_birth: GameDate::new(2007, 4, 12),
                    reputation: Some(4_250),
                    international_reputation: Some(1_200),
                    consistency: Some(15),
                    important_matches: Some(14),
                    injury_proneness: Some(6),
                    versatility: Some(16),
                    professionalism: Some(18),
                    ambition: Some(17),
                    contract: Some(Contract {
                        club_id: Some("club-nordhafen".into()),
                        starts_on: GameDate::new(2025, 7, 1),
                        expires_on: GameDate::new(2029, 6, 30),
                        contract_type: ContractType::FullTime,
                        wage: Some(18_500.0),
                        release_clause: Some(42_000_000.0),
                        squad_status: Some("First team".into()),
                    }),
                    status: PlayerStatus::default(),
                    tags: vec!["wonderkid".into()],
                    note: None,
                },
            },
            Player {
                id: "player-milo".into(),
                name: "Milo Frei".into(),
                age: Some(24),
                club: None,
                nationality: Some("Schweiz".into()),
                positions: vec!["V (Z)".into()],
                preferred_foot: Foot::Left,
                value: Some(1_800_000.0),
                wage: None,
                current_ability: Some(119),
                potential_ability: Some(126),
                attributes: player_attributes(12, 11, 15, 12),
                details: PlayerDetails {
                    reputation: Some(2_800),
                    consistency: Some(13),
                    professionalism: Some(15),
                    status: PlayerStatus {
                        transfer_listed: true,
                        ..Default::default()
                    },
                    tags: vec!["free-agent".into()],
                    ..Default::default()
                },
            },
        ],
        staff: vec![Staff {
            id: "staff-lina".into(),
            name: "Lina Taktik".into(),
            age: Some(41),
            club: Some("SV Nordhafen".into()),
            nationality: Some("Österreich".into()),
            roles: vec![StaffRole::AssistantManager, StaffRole::Coach],
            current_ability: Some(145),
            potential_ability: Some(155),
            reputation: Some(5_100),
            attributes: [
                (StaffAttribute::TacticalKnowledge, 17),
                (StaffAttribute::Motivating, 16),
                (StaffAttribute::ManManagement, 15),
            ]
            .into_iter()
            .collect(),
            contract: Some(Contract {
                club_id: Some("club-nordhafen".into()),
                expires_on: GameDate::new(2028, 6, 30),
                contract_type: ContractType::FullTime,
                wage: Some(12_000.0),
                ..Default::default()
            }),
        }],
        clubs: vec![Club {
            id: "club-nordhafen".into(),
            name: "Sportverein Nordhafen".into(),
            short_name: Some("SV Nordhafen".into()),
            nation: Some("Deutschland".into()),
            competition: Some("Nordliga".into()),
            reputation: Some(4_800),
            professional_status: Some("professional".into()),
            stadium: Some("Hafenpark".into()),
            stadium_capacity: Some(24_500),
            average_attendance: Some(19_300),
            finances: ClubFinances {
                balance: Some(18_000_000.0),
                transfer_budget: Some(6_500_000.0),
                wage_budget: Some(450_000.0),
                debt: Some(2_000_000.0),
            },
            facilities: ClubFacilities {
                training: Some(15),
                youth: Some(16),
                youth_recruitment: Some(14),
                junior_coaching: Some(15),
            },
        }],
        competitions: vec![Competition {
            id: "competition-nordliga".into(),
            name: "Nordliga".into(),
            short_name: Some("NL".into()),
            nation: Some("Deutschland".into()),
            reputation: Some(6_000),
            current_champion: Some("SV Nordhafen".into()),
            level: Some(1),
        }],
    }
}

fn player_attributes(passing: u8, vision: u8, pace: u8, technique: u8) -> BTreeMap<Attribute, u8> {
    use Attribute::*;
    [
        (Passing, passing),
        (Vision, vision),
        (Pace, pace),
        (Technique, technique),
        (Decisions, passing.saturating_sub(1)),
        (FirstTouch, technique),
        (Composure, technique.saturating_sub(1)),
        (OffTheBall, pace.saturating_sub(2)),
    ]
    .into_iter()
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixture_is_cross_linked_and_contains_no_real_world_data() {
        let fixture = synthetic_snapshot();
        assert_eq!(fixture.schema_version, 1);
        assert_eq!(fixture.players.len(), 2);
        assert_eq!(
            fixture.players[0]
                .details
                .contract
                .as_ref()
                .and_then(|contract| contract.club_id.as_deref()),
            Some(fixture.clubs[0].id.as_str())
        );
    }
}
