use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::{Attribute, Foot, Player};

#[derive(Debug, Error)]
pub enum ImportError {
    #[error("the export has no header row")]
    MissingHeaders,
    #[error("the export needs a player name column")]
    MissingName,
    #[error("CSV error: {0}")]
    Csv(#[from] csv::Error),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ImportResult {
    pub players: Vec<Player>,
    pub warnings: Vec<String>,
    pub delimiter: char,
}

pub fn import_players(input: &str) -> Result<ImportResult, ImportError> {
    let delimiter = detect_delimiter(input);
    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter as u8)
        .flexible(true)
        .from_reader(input.as_bytes());
    let raw_headers = reader.headers()?.clone();
    if raw_headers.is_empty() {
        return Err(ImportError::MissingHeaders);
    }
    let headers: Vec<String> = raw_headers.iter().map(normalize).collect();
    if !headers.iter().any(|h| field_for(h) == Some(Field::Name)) {
        return Err(ImportError::MissingName);
    }

    let mut players = Vec::new();
    let mut warnings = Vec::new();
    for (row_index, record) in reader.records().enumerate() {
        let record = record?;
        let values: HashMap<&str, &str> = headers
            .iter()
            .map(String::as_str)
            .zip(record.iter())
            .collect();
        let name = find(&values, Field::Name)
            .unwrap_or_default()
            .trim()
            .to_owned();
        if name.is_empty() {
            warnings.push(format!(
                "row {} ignored because the name is empty",
                row_index + 2
            ));
            continue;
        }
        let mut attributes = BTreeMap::new();
        for attribute in Attribute::ALL {
            if let Some(value) = find_attribute(&values, attribute).and_then(parse_u8) {
                attributes.insert(attribute, value.clamp(1, 20));
            }
        }
        let id = find(&values, Field::Id)
            .filter(|v| !v.trim().is_empty())
            .map(str::to_owned)
            .unwrap_or_else(|| format!("import-{}", row_index + 1));
        players.push(Player {
            id,
            name,
            age: find(&values, Field::Age).and_then(parse_u8),
            club: text(find(&values, Field::Club)),
            nationality: text(find(&values, Field::Nationality)),
            positions: find(&values, Field::Position)
                .map(|v| v.split(',').map(|p| p.trim().to_owned()).collect())
                .unwrap_or_default(),
            preferred_foot: parse_foot(find(&values, Field::Foot)),
            value: find(&values, Field::Value).and_then(parse_money),
            wage: find(&values, Field::Wage).and_then(parse_money),
            current_ability: find(&values, Field::Ca).and_then(parse_u16),
            potential_ability: find(&values, Field::Pa).and_then(parse_u16),
            attributes,
            details: Default::default(),
        });
    }
    Ok(ImportResult {
        players,
        warnings,
        delimiter,
    })
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Field {
    Id,
    Name,
    Age,
    Club,
    Nationality,
    Position,
    Foot,
    Value,
    Wage,
    Ca,
    Pa,
}

fn field_for(header: &str) -> Option<Field> {
    match header {
        "uid" | "id" | "uniqueid" => Some(Field::Id),
        "name" | "spieler" | "player" => Some(Field::Name),
        "age" | "alter" => Some(Field::Age),
        "club" | "verein" | "team" => Some(Field::Club),
        "nationality" | "nationalitat" | "nation" => Some(Field::Nationality),
        "position" | "positions" | "pos" => Some(Field::Position),
        "preferredfoot" | "starkerfuss" | "foot" => Some(Field::Foot),
        "value" | "wert" | "transferwert" => Some(Field::Value),
        "wage" | "salary" | "gehalt" => Some(Field::Wage),
        "ca" | "currentability" => Some(Field::Ca),
        "pa" | "potentialability" => Some(Field::Pa),
        _ => None,
    }
}

fn attribute_for(header: &str) -> Option<Attribute> {
    use Attribute::*;
    Some(match header {
        "acceleration" | "antritt" => Acceleration,
        "aerialreach" | "lufthoheit" => AerialReach,
        "aggression" | "aggressivitat" => Aggression,
        "agility" | "beweglichkeit" => Agility,
        "anticipation" | "antizipation" => Anticipation,
        "balance" => Balance,
        "bravery" | "mut" => Bravery,
        "commandofarea" | "strafraumbeherrschung" => CommandOfArea,
        "communication" | "kommunikation" => Communication,
        "composure" | "nervenstarke" => Composure,
        "concentration" | "konzentration" => Concentration,
        "corners" | "ecken" => Corners,
        "crossing" | "flanken" => Crossing,
        "decisions" | "entscheidungen" => Decisions,
        "determination" | "zielstrebigkeit" => Determination,
        "dribbling" => Dribbling,
        "eccentricity" | "exzentrizitat" => Eccentricity,
        "finishing" | "abschluss" => Finishing,
        "firsttouch" | "ballannahme" => FirstTouch,
        "flair" | "kreativitat" => Flair,
        "freekicktaking" | "freekicks" | "freistoss" => FreeKickTaking,
        "handling" | "fangsicherheit" => Handling,
        "heading" | "kopfballtechnik" => Heading,
        "jumpingreach" | "sprungkraft" => JumpingReach,
        "kicking" | "abstosse" => Kicking,
        "leadership" | "fuhrungsqualitaten" => Leadership,
        "longshots" | "weitschusse" => LongShots,
        "longthrows" | "weiteeinwurfe" => LongThrows,
        "marking" | "deckung" => Marking,
        "naturalfitness" | "grundfitness" => NaturalFitness,
        "offtheball" | "ohneball" => OffTheBall,
        "oneonones" | "einsgegeneins" => OneOnOnes,
        "pace" | "schnelligkeit" => Pace,
        "passing" | "passen" => Passing,
        "penaltytaking" | "penalties" | "elfmeter" => PenaltyTaking,
        "positioning" | "stellungsspiel" => Positioning,
        "punchingtendency" | "fausten" => PunchingTendency,
        "reflexes" | "reflexe" => Reflexes,
        "rushingouttendency" | "herauslaufen" => RushingOutTendency,
        "stamina" | "ausdauer" => Stamina,
        "strength" | "kraft" => Strength,
        "tackling" | "zweikampfe" => Tackling,
        "teamwork" => Teamwork,
        "technique" | "technik" => Technique,
        "throwing" | "abwurf" => Throwing,
        "vision" | "ubersicht" => Vision,
        "workrate" | "einsatzfreude" => WorkRate,
        _ => return None,
    })
}

fn find<'a>(values: &'a HashMap<&str, &'a str>, field: Field) -> Option<&'a str> {
    values
        .iter()
        .find_map(|(h, v)| (field_for(h) == Some(field)).then_some(*v))
}

fn find_attribute<'a>(values: &'a HashMap<&str, &'a str>, attribute: Attribute) -> Option<&'a str> {
    values
        .iter()
        .find_map(|(h, v)| (attribute_for(h) == Some(attribute)).then_some(*v))
}

fn normalize(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .replace([' ', '-', '_', '.', '/', '(', ')'], "")
        .replace('ä', "a")
        .replace('ö', "o")
        .replace('ü', "u")
        .replace('ß', "ss")
}

fn detect_delimiter(input: &str) -> char {
    let line = input.lines().next().unwrap_or_default();
    [';', ',', '\t']
        .into_iter()
        .max_by_key(|delimiter| line.matches(*delimiter).count())
        .unwrap_or(',')
}

fn parse_u8(value: &str) -> Option<u8> {
    value.trim().parse().ok()
}
fn parse_u16(value: &str) -> Option<u16> {
    value.trim().parse().ok()
}
fn text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_owned)
}

fn parse_money(value: &str) -> Option<f64> {
    let normalized = value
        .trim()
        .replace(['€', '£', '$', ' '], "")
        .replace('.', "")
        .replace(',', ".");
    let (number, multiplier) = match normalized.chars().last()? {
        'K' | 'k' => (&normalized[..normalized.len() - 1], 1_000.0),
        'M' | 'm' => (&normalized[..normalized.len() - 1], 1_000_000.0),
        _ => (normalized.as_str(), 1.0),
    };
    number.parse::<f64>().ok().map(|n| n * multiplier)
}

fn parse_foot(value: Option<&str>) -> Foot {
    match value.map(normalize).as_deref() {
        Some("left" | "links") => Foot::Left,
        Some("right" | "rechts") => Foot::Right,
        Some("both" | "beide") => Foot::Both,
        _ => Foot::Unknown,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn imports_semicolon_german_export() {
        let csv =
            "UID;Name;Alter;Verein;Passen;Übersicht;Wert\n7;Ada Beispiel;19;Mainz;17;18;12,5M €\n";
        let result = import_players(csv).unwrap();
        assert_eq!(result.delimiter, ';');
        assert_eq!(result.players[0].age, Some(19));
        assert_eq!(result.players[0].attribute(Attribute::Passing), Some(17));
        assert_eq!(result.players[0].value, Some(12_500_000.0));
    }

    #[test]
    fn imports_goalkeeping_and_set_piece_attributes() {
        let csv = "UID;Name;Reflexe;Strafraumbeherrschung;Ecken;Grundfitness\n8;Mira Beispiel;18;16;7;15\n";
        let player = &import_players(csv).unwrap().players[0];
        assert_eq!(player.attribute(Attribute::Reflexes), Some(18));
        assert_eq!(player.attribute(Attribute::CommandOfArea), Some(16));
        assert_eq!(player.attribute(Attribute::Corners), Some(7));
        assert_eq!(player.attribute(Attribute::NaturalFitness), Some(15));
    }
}
