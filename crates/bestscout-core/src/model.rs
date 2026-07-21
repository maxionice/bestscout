use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Attribute {
    Acceleration,
    Aggression,
    Agility,
    Anticipation,
    Balance,
    Bravery,
    Composure,
    Concentration,
    Crossing,
    Decisions,
    Determination,
    Dribbling,
    Finishing,
    FirstTouch,
    Flair,
    Heading,
    JumpingReach,
    Leadership,
    LongShots,
    Marking,
    OffTheBall,
    Pace,
    Passing,
    Positioning,
    Stamina,
    Strength,
    Tackling,
    Teamwork,
    Technique,
    Vision,
    WorkRate,
}

impl Attribute {
    pub const ALL: [Self; 31] = [
        Self::Acceleration,
        Self::Aggression,
        Self::Agility,
        Self::Anticipation,
        Self::Balance,
        Self::Bravery,
        Self::Composure,
        Self::Concentration,
        Self::Crossing,
        Self::Decisions,
        Self::Determination,
        Self::Dribbling,
        Self::Finishing,
        Self::FirstTouch,
        Self::Flair,
        Self::Heading,
        Self::JumpingReach,
        Self::Leadership,
        Self::LongShots,
        Self::Marking,
        Self::OffTheBall,
        Self::Pace,
        Self::Passing,
        Self::Positioning,
        Self::Stamina,
        Self::Strength,
        Self::Tackling,
        Self::Teamwork,
        Self::Technique,
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
pub struct Contract {
    pub club_id: Option<String>,
    pub starts_on: Option<GameDate>,
    pub expires_on: Option<GameDate>,
    pub contract_type: ContractType,
    pub wage: Option<f64>,
    pub release_clause: Option<f64>,
    pub squad_status: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct PlayerStatus {
    pub transfer_listed: bool,
    pub loan_listed: bool,
    pub injured: bool,
    pub suspended: bool,
    pub unavailable: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
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
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct ClubFinances {
    pub balance: Option<f64>,
    pub transfer_budget: Option<f64>,
    pub wage_budget: Option<f64>,
    pub debt: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
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
    pub players: Vec<Player>,
    pub staff: Vec<Staff>,
    pub clubs: Vec<Club>,
    pub competitions: Vec<Competition>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_calendar_dates_including_leap_years() {
        assert!(GameDate::new(2028, 2, 29).is_some());
        assert!(GameDate::new(2027, 2, 29).is_none());
        assert!(GameDate::new(2027, 13, 1).is_none());
        assert!(GameDate::new(2027, 4, 31).is_none());
    }
}
