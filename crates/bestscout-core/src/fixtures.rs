use std::collections::BTreeMap;

use crate::{
    Attribute, Club, ClubBranding, ClubFacilities, ClubFinances, ClubKit, ClubKitKind,
    ClubRelationship, ClubRelationshipKind, Competition, CompetitionFixture, CompetitionStage,
    CompetitionStageKind, CompetitionStanding, Contract, ContractType, DatabaseSnapshot,
    FixtureStatus, Foot, GameDate, LanguageSkill, PersonRelationship, Player, PlayerDetails,
    PlayerFitness, PlayerRegistration, PlayerStatus, RegistrationStatus, RelationshipKind,
    RelationshipTargetKind, SnapshotSource, Staff, StaffAttribute, StaffQualification,
    StaffResponsibility, StaffRole,
};

pub fn synthetic_snapshot() -> DatabaseSnapshot {
    DatabaseSnapshot {
        schema_version: 1,
        source: SnapshotSource::Synthetic,
        game_date: GameDate::new(2026, 7, 22),
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
                    future_transfer: None,
                    fitness: PlayerFitness {
                        condition: Some(92),
                        match_fitness: Some(88),
                        fatigue: Some(18),
                        jadedness: Some(10),
                    },
                    morale: Some(16),
                    happiness: Some(17),
                    injuries: Vec::new(),
                    bans: Vec::new(),
                    languages: vec![
                        LanguageSkill {
                            language: "Deutsch".into(),
                            speaking: 10,
                            reading: 10,
                            writing: 10,
                        },
                        LanguageSkill {
                            language: "Englisch".into(),
                            speaking: 7,
                            reading: 8,
                            writing: 7,
                        },
                    ],
                    relationships: vec![PersonRelationship {
                        id: "relationship-ada-lina".into(),
                        kind: RelationshipKind::FavoritePerson,
                        target_kind: RelationshipTargetKind::Staff,
                        target_id: "staff-lina".into(),
                        strength: 65,
                    }],
                    registrations: vec![PlayerRegistration {
                        id: "registration-ada-nordliga".into(),
                        competition_id: "competition-nordliga".into(),
                        club_id: "club-nordhafen".into(),
                        status: RegistrationStatus::Registered,
                        registered_on: GameDate::new(2026, 7, 1),
                        expires_on: GameDate::new(2027, 6, 30),
                        squad_number: Some(8),
                        homegrown_at_club: true,
                        homegrown_in_nation: true,
                    }],
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
            details: crate::StaffDetails {
                date_of_birth: GameDate::new(1985, 3, 14),
                languages: vec![
                    LanguageSkill {
                        language: "Deutsch".into(),
                        speaking: 10,
                        reading: 10,
                        writing: 10,
                    },
                    LanguageSkill {
                        language: "Englisch".into(),
                        speaking: 8,
                        reading: 8,
                        writing: 7,
                    },
                ],
                relationships: vec![PersonRelationship {
                    id: "relationship-lina-ada".into(),
                    kind: RelationshipKind::Mentor,
                    target_kind: RelationshipTargetKind::Player,
                    target_id: "player-ada".into(),
                    strength: 70,
                }],
                responsibilities: vec![
                    StaffResponsibility::TeamTraining,
                    StaffResponsibility::OppositionInstructions,
                ],
                qualifications: vec![StaffQualification {
                    id: "qualification-lina-continental-pro".into(),
                    name: "Continental Pro Licence".into(),
                    level: 5,
                    awarded_on: GameDate::new(2022, 6, 30),
                    expires_on: None,
                }],
                note: None,
            },
        }],
        clubs: vec![
            Club {
                id: "club-nordhafen".into(),
                name: "Sportverein Nordhafen".into(),
                short_name: Some("SV Nordhafen".into()),
                nation: Some("Deutschland".into()),
                competition: Some("Nordliga".into()),
                competition_id: Some("competition-nordliga".into()),
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
                branding: ClubBranding {
                    primary_colour: Some("#102A43".into()),
                    secondary_colour: Some("#F6C344".into()),
                    kits: vec![ClubKit {
                        id: "kit-nordhafen-home".into(),
                        kind: ClubKitKind::Home,
                        shirt_colour: "#102A43".into(),
                        shorts_colour: "#102A43".into(),
                        socks_colour: "#F6C344".into(),
                        trim_colour: Some("#FFFFFF".into()),
                        pattern: Some("solid".into()),
                    }],
                },
                relationships: vec![ClubRelationship {
                    id: "club-relation-nordhafen-suedstadt".into(),
                    kind: ClubRelationshipKind::Rival,
                    target_club_id: "club-suedstadt".into(),
                    strength: 70,
                }],
            },
            Club {
                id: "club-suedstadt".into(),
                name: "Fußballclub Südstadt".into(),
                short_name: Some("FC Südstadt".into()),
                nation: Some("Deutschland".into()),
                competition: Some("Nordliga".into()),
                competition_id: Some("competition-nordliga".into()),
                reputation: Some(4_200),
                professional_status: Some("professional".into()),
                stadium: Some("Südstadt-Arena".into()),
                stadium_capacity: Some(18_500),
                average_attendance: Some(13_800),
                finances: ClubFinances {
                    balance: Some(11_000_000.0),
                    transfer_budget: Some(4_000_000.0),
                    wage_budget: Some(320_000.0),
                    debt: Some(1_000_000.0),
                },
                facilities: ClubFacilities {
                    training: Some(13),
                    youth: Some(12),
                    youth_recruitment: Some(11),
                    junior_coaching: Some(12),
                },
                branding: ClubBranding {
                    primary_colour: Some("#8B1E3F".into()),
                    secondary_colour: Some("#F4E9CD".into()),
                    kits: vec![ClubKit {
                        id: "kit-suedstadt-home".into(),
                        kind: ClubKitKind::Home,
                        shirt_colour: "#8B1E3F".into(),
                        shorts_colour: "#F4E9CD".into(),
                        socks_colour: "#8B1E3F".into(),
                        trim_colour: None,
                        pattern: Some("solid".into()),
                    }],
                },
                relationships: vec![ClubRelationship {
                    id: "club-relation-suedstadt-nordhafen".into(),
                    kind: ClubRelationshipKind::Rival,
                    target_club_id: "club-nordhafen".into(),
                    strength: 70,
                }],
            },
        ],
        competitions: vec![Competition {
            id: "competition-nordliga".into(),
            name: "Nordliga".into(),
            short_name: Some("NL".into()),
            nation: Some("Deutschland".into()),
            reputation: Some(6_000),
            current_champion: Some("Sportverein Nordhafen".into()),
            current_champion_club_id: Some("club-nordhafen".into()),
            level: Some(1),
            stages: vec![CompetitionStage {
                id: "stage-nordliga-2026".into(),
                name: "Ligaphase 2026/27".into(),
                kind: CompetitionStageKind::League,
                order: 1,
                starts_on: GameDate::new(2026, 7, 1),
                ends_on: GameDate::new(2027, 5, 31),
                current: true,
            }],
            fixtures: vec![CompetitionFixture {
                id: "fixture-nordliga-opening".into(),
                stage_id: Some("stage-nordliga-2026".into()),
                home_club_id: "club-nordhafen".into(),
                away_club_id: "club-suedstadt".into(),
                scheduled_on: GameDate::new(2026, 8, 1),
                status: FixtureStatus::Scheduled,
                home_score: None,
                away_score: None,
                round: Some("1".into()),
                venue: Some("Hafenpark".into()),
            }],
            standings: vec![
                CompetitionStanding {
                    stage_id: Some("stage-nordliga-2026".into()),
                    club_id: "club-nordhafen".into(),
                    position: 1,
                    played: 0,
                    won: 0,
                    drawn: 0,
                    lost: 0,
                    goals_for: 0,
                    goals_against: 0,
                    goal_difference: 0,
                    points: 0,
                },
                CompetitionStanding {
                    stage_id: Some("stage-nordliga-2026".into()),
                    club_id: "club-suedstadt".into(),
                    position: 2,
                    played: 0,
                    won: 0,
                    drawn: 0,
                    lost: 0,
                    goals_for: 0,
                    goals_against: 0,
                    goal_difference: 0,
                    points: 0,
                },
            ],
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
