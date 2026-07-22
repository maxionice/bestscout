use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Attribute {
    Acceleration,
    AerialReach,
    Aggression,
    Agility,
    Anticipation,
    Balance,
    Bravery,
    CommandOfArea,
    Communication,
    Composure,
    Concentration,
    Corners,
    Crossing,
    Decisions,
    Determination,
    Dribbling,
    Eccentricity,
    Finishing,
    FirstTouch,
    Flair,
    FreeKickTaking,
    Handling,
    Heading,
    JumpingReach,
    Kicking,
    Leadership,
    LongShots,
    LongThrows,
    Marking,
    NaturalFitness,
    OffTheBall,
    OneOnOnes,
    Pace,
    Passing,
    PenaltyTaking,
    Positioning,
    PunchingTendency,
    Reflexes,
    RushingOutTendency,
    Stamina,
    Strength,
    Tackling,
    Teamwork,
    Technique,
    Throwing,
    Vision,
    WorkRate,
}

impl Attribute {
    pub const ALL: [Self; 47] = [
        Self::Acceleration,
        Self::AerialReach,
        Self::Aggression,
        Self::Agility,
        Self::Anticipation,
        Self::Balance,
        Self::Bravery,
        Self::CommandOfArea,
        Self::Communication,
        Self::Composure,
        Self::Concentration,
        Self::Corners,
        Self::Crossing,
        Self::Decisions,
        Self::Determination,
        Self::Dribbling,
        Self::Eccentricity,
        Self::Finishing,
        Self::FirstTouch,
        Self::Flair,
        Self::FreeKickTaking,
        Self::Handling,
        Self::Heading,
        Self::JumpingReach,
        Self::Kicking,
        Self::Leadership,
        Self::LongShots,
        Self::LongThrows,
        Self::Marking,
        Self::NaturalFitness,
        Self::OffTheBall,
        Self::OneOnOnes,
        Self::Pace,
        Self::Passing,
        Self::PenaltyTaking,
        Self::Positioning,
        Self::PunchingTendency,
        Self::Reflexes,
        Self::RushingOutTendency,
        Self::Stamina,
        Self::Strength,
        Self::Tackling,
        Self::Teamwork,
        Self::Technique,
        Self::Throwing,
        Self::Vision,
        Self::WorkRate,
    ];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Foot {
    Left,
    Right,
    Both,
    #[default]
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Position {
    Goalkeeper,
    Defender,
    WingBack,
    DefensiveMidfielder,
    Midfielder,
    AttackingMidfielder,
    Winger,
    Striker,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct GameDate {
    pub year: u16,
    pub month: u8,
    pub day: u8,
}

impl GameDate {
    pub fn new(year: u16, month: u8, day: u8) -> Option<Self> {
        let maximum_day = match month {
            1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
            4 | 6 | 9 | 11 => 30,
            2 if year.is_multiple_of(400)
                || (year.is_multiple_of(4) && !year.is_multiple_of(100)) =>
            {
                29
            }
            2 => 28,
            _ => return None,
        };
        (day > 0 && day <= maximum_day).then_some(Self { year, month, day })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ContractType {
    FullTime,
    PartTime,
    Youth,
    NonContract,
    Loan,
    #[default]
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct Contract {
    pub club_id: Option<String>,
    pub starts_on: Option<GameDate>,
    pub expires_on: Option<GameDate>,
    pub contract_type: ContractType,
    pub wage: Option<f64>,
    pub release_clause: Option<f64>,
    pub squad_status: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum TransferKind {
    #[default]
    Permanent,
    Loan,
    FreeTransfer,
    Swap,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum TransferStatus {
    #[default]
    Agreed,
    Confirmed,
    Completed,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FutureTransfer {
    pub id: String,
    pub kind: TransferKind,
    pub from_club_id: Option<String>,
    pub to_club_id: String,
    pub arranged_on: Option<GameDate>,
    pub effective_on: GameDate,
    pub fee: Option<f64>,
    pub loan_end: Option<GameDate>,
    pub wage_contribution_percent: Option<u8>,
    pub swap_player_id: Option<String>,
    pub status: TransferStatus,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct PlayerStatus {
    pub transfer_listed: bool,
    pub loan_listed: bool,
    pub injured: bool,
    pub suspended: bool,
    pub unavailable: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct PlayerFitness {
    pub condition: Option<u8>,
    pub match_fitness: Option<u8>,
    pub fatigue: Option<u8>,
    pub jadedness: Option<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum InjurySeverity {
    Minor,
    Moderate,
    Serious,
    Severe,
    CareerThreatening,
    #[default]
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum InjuryTreatment {
    None,
    Physio,
    Rehabilitation,
    Specialist,
    Surgery,
    #[default]
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlayerInjury {
    pub id: String,
    pub name: String,
    pub body_area: Option<String>,
    pub severity: InjurySeverity,
    pub started_on: Option<GameDate>,
    pub expected_return: Option<GameDate>,
    pub days_remaining: Option<u16>,
    pub recurring: bool,
    pub treatment: InjuryTreatment,
}

impl PlayerInjury {
    pub fn is_active_on(&self, date: GameDate) -> bool {
        self.started_on.is_none_or(|started| started <= date)
            && self.days_remaining.is_none_or(|days| days > 0)
            && self.expected_return.is_none_or(|expected| expected >= date)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum BanScope {
    Domestic,
    Continental,
    International,
    AllCompetitions,
    #[default]
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlayerBan {
    pub id: String,
    pub reason: String,
    pub competition_id: Option<String>,
    pub scope: BanScope,
    pub starts_on: Option<GameDate>,
    pub ends_on: Option<GameDate>,
    pub matches_remaining: Option<u16>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LanguageSkill {
    pub language: String,
    pub speaking: u8,
    pub reading: u8,
    pub writing: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RelationshipTargetKind {
    Player,
    Staff,
    Club,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RelationshipKind {
    FavoritePerson,
    DislikedPerson,
    Friend,
    Mentor,
    Family,
    Agent,
    FavoriteClub,
    DislikedClub,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PersonRelationship {
    pub id: String,
    pub kind: RelationshipKind,
    pub target_kind: RelationshipTargetKind,
    pub target_id: String,
    pub strength: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum RegistrationStatus {
    #[default]
    Registered,
    Pending,
    Unregistered,
    Ineligible,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlayerRegistration {
    pub id: String,
    pub competition_id: String,
    pub club_id: String,
    pub status: RegistrationStatus,
    pub registered_on: Option<GameDate>,
    pub expires_on: Option<GameDate>,
    pub squad_number: Option<u8>,
    pub homegrown_at_club: bool,
    pub homegrown_in_nation: bool,
}

impl PlayerBan {
    pub fn is_active_on(&self, date: GameDate) -> bool {
        self.starts_on.is_none_or(|starts| starts <= date)
            && self.matches_remaining.is_none_or(|matches| matches > 0)
            && self.ends_on.is_none_or(|ends| ends >= date)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct PlayerDetails {
    pub date_of_birth: Option<GameDate>,
    pub reputation: Option<u16>,
    pub international_reputation: Option<u16>,
    pub consistency: Option<u8>,
    pub important_matches: Option<u8>,
    pub injury_proneness: Option<u8>,
    pub versatility: Option<u8>,
    pub professionalism: Option<u8>,
    pub ambition: Option<u8>,
    pub contract: Option<Contract>,
    pub future_transfer: Option<FutureTransfer>,
    pub fitness: PlayerFitness,
    pub morale: Option<u8>,
    pub happiness: Option<u8>,
    pub injuries: Vec<PlayerInjury>,
    pub bans: Vec<PlayerBan>,
    pub languages: Vec<LanguageSkill>,
    pub relationships: Vec<PersonRelationship>,
    pub registrations: Vec<PlayerRegistration>,
    pub status: PlayerStatus,
    pub tags: Vec<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HiddenAttribute {
    Consistency,
    ImportantMatches,
    InjuryProneness,
    Versatility,
    Professionalism,
    Ambition,
}

impl PlayerDetails {
    pub fn hidden_attribute(&self, attribute: HiddenAttribute) -> Option<u8> {
        match attribute {
            HiddenAttribute::Consistency => self.consistency,
            HiddenAttribute::ImportantMatches => self.important_matches,
            HiddenAttribute::InjuryProneness => self.injury_proneness,
            HiddenAttribute::Versatility => self.versatility,
            HiddenAttribute::Professionalism => self.professionalism,
            HiddenAttribute::Ambition => self.ambition,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Player {
    pub id: String,
    pub name: String,
    pub age: Option<u8>,
    pub club: Option<String>,
    pub nationality: Option<String>,
    pub positions: Vec<String>,
    pub preferred_foot: Foot,
    pub value: Option<f64>,
    pub wage: Option<f64>,
    pub current_ability: Option<u16>,
    pub potential_ability: Option<u16>,
    pub attributes: BTreeMap<Attribute, u8>,
    #[serde(default)]
    pub details: PlayerDetails,
}

impl Player {
    pub fn attribute(&self, attribute: Attribute) -> Option<u8> {
        self.attributes.get(&attribute).copied()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StaffAttribute {
    Adaptability,
    Determination,
    LevelOfDiscipline,
    ManManagement,
    Motivating,
    JudgingPlayerAbility,
    JudgingPlayerPotential,
    TacticalKnowledge,
    WorkingWithYoungsters,
    Attacking,
    Defending,
    Fitness,
    Goalkeepers,
    Mental,
    Tactical,
    Technical,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StaffRole {
    Manager,
    AssistantManager,
    Coach,
    GoalkeepingCoach,
    FitnessCoach,
    PerformanceAnalyst,
    RecruitmentAnalyst,
    Scout,
    DirectorOfFootball,
    TechnicalDirector,
    HeadOfYouthDevelopment,
    Physio,
    SportsScientist,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StaffResponsibility {
    TeamSelection,
    Tactics,
    TeamTraining,
    IndividualTraining,
    SetPieces,
    OppositionInstructions,
    TeamTalks,
    Recruitment,
    ContractNegotiations,
    Loans,
    YouthDevelopment,
    Media,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StaffQualification {
    pub id: String,
    pub name: String,
    pub level: u8,
    pub awarded_on: Option<GameDate>,
    pub expires_on: Option<GameDate>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct StaffDetails {
    pub date_of_birth: Option<GameDate>,
    pub languages: Vec<LanguageSkill>,
    pub relationships: Vec<PersonRelationship>,
    pub responsibilities: Vec<StaffResponsibility>,
    pub qualifications: Vec<StaffQualification>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Staff {
    pub id: String,
    pub name: String,
    pub age: Option<u8>,
    pub club: Option<String>,
    pub nationality: Option<String>,
    pub roles: Vec<StaffRole>,
    pub current_ability: Option<u16>,
    pub potential_ability: Option<u16>,
    pub reputation: Option<u16>,
    pub attributes: BTreeMap<StaffAttribute, u8>,
    pub contract: Option<Contract>,
    #[serde(default)]
    pub details: StaffDetails,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct ClubFinances {
    pub balance: Option<f64>,
    pub transfer_budget: Option<f64>,
    pub wage_budget: Option<f64>,
    pub debt: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct ClubFacilities {
    pub training: Option<u8>,
    pub youth: Option<u8>,
    pub youth_recruitment: Option<u8>,
    pub junior_coaching: Option<u8>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Club {
    pub id: String,
    pub name: String,
    pub short_name: Option<String>,
    pub nation: Option<String>,
    pub competition: Option<String>,
    #[serde(default)]
    pub competition_id: Option<String>,
    pub reputation: Option<u16>,
    pub professional_status: Option<String>,
    pub stadium: Option<String>,
    pub stadium_capacity: Option<u32>,
    pub average_attendance: Option<u32>,
    pub finances: ClubFinances,
    pub facilities: ClubFacilities,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Competition {
    pub id: String,
    pub name: String,
    pub short_name: Option<String>,
    pub nation: Option<String>,
    pub reputation: Option<u16>,
    pub current_champion: Option<String>,
    pub level: Option<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SnapshotSource {
    Synthetic,
    Csv,
    Live,
    SaveGame,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DatabaseSnapshot {
    pub schema_version: u32,
    pub source: SnapshotSource,
    #[serde(default)]
    pub game_date: Option<GameDate>,
    pub players: Vec<Player>,
    pub staff: Vec<Staff>,
    pub clubs: Vec<Club>,
    pub competitions: Vec<Competition>,
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use super::*;

    #[test]
    fn validates_calendar_dates_including_leap_years() {
        assert!(GameDate::new(2028, 2, 29).is_some());
        assert!(GameDate::new(2027, 2, 29).is_none());
        assert!(GameDate::new(2027, 13, 1).is_none());
        assert!(GameDate::new(2027, 4, 31).is_none());
    }

    #[test]
    fn accepts_partial_detail_payloads_from_older_clients() {
        let details: PlayerDetails = serde_json::from_value(serde_json::json!({
            "reputation": 4200
        }))
        .unwrap();
        assert_eq!(details.reputation, Some(4200));
        assert!(!details.status.injured);
        assert!(details.contract.is_none());
        assert!(details.future_transfer.is_none());
        assert!(details.fitness.condition.is_none());
        assert!(details.injuries.is_empty());
        assert!(details.bans.is_empty());
        assert!(details.languages.is_empty());
        assert!(details.relationships.is_empty());
        assert!(details.registrations.is_empty());
    }

    #[test]
    fn accepts_staff_payloads_without_the_new_detail_object() {
        let staff: Staff = serde_json::from_value(serde_json::json!({
            "id": "legacy-staff",
            "name": "Legacy Staff",
            "age": 45,
            "club": null,
            "nationality": null,
            "roles": ["scout"],
            "current_ability": null,
            "potential_ability": null,
            "reputation": null,
            "attributes": {},
            "contract": null
        }))
        .unwrap();

        assert!(staff.details.date_of_birth.is_none());
        assert!(staff.details.languages.is_empty());
        assert!(staff.details.relationships.is_empty());
        assert!(staff.details.responsibilities.is_empty());
        assert!(staff.details.qualifications.is_empty());
        assert!(staff.details.note.is_none());
    }

    #[test]
    fn accepts_club_payloads_without_a_competition_reference_id() {
        let club: Club = serde_json::from_value(serde_json::json!({
            "id": "legacy-club",
            "name": "Legacy Club",
            "short_name": null,
            "nation": null,
            "competition": "Legacy League",
            "reputation": null,
            "professional_status": null,
            "stadium": null,
            "stadium_capacity": null,
            "average_attendance": null,
            "finances": {},
            "facilities": {}
        }))
        .unwrap();

        assert!(club.competition_id.is_none());
        assert_eq!(club.competition.as_deref(), Some("Legacy League"));
    }

    #[test]
    fn exposes_every_outfield_and_goalkeeping_attribute_once() {
        assert_eq!(Attribute::ALL.len(), 47);
        assert_eq!(
            Attribute::ALL.into_iter().collect::<BTreeSet<_>>().len(),
            47
        );
    }
}
