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
}

impl Player {
    pub fn attribute(&self, attribute: Attribute) -> Option<u8> {
        self.attributes.get(&attribute).copied()
    }
}
