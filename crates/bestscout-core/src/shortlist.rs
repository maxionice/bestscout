use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::Player;

pub const SHORTLIST_SCHEMA_VERSION: u16 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ShortlistDocument {
    pub schema_version: u16,
    pub entries: Vec<ShortlistEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ShortlistEntry {
    pub player_id: String,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ShortlistFormat {
    Json,
    Csv,
    Html,
}

#[derive(Debug, Error)]
pub enum ShortlistError {
    #[error("unsupported shortlist schema version {0}")]
    UnsupportedSchema(u16),
    #[error("invalid shortlist JSON: {0}")]
    InvalidJson(#[from] serde_json::Error),
    #[error("invalid shortlist CSV: {0}")]
    InvalidCsv(#[from] csv::Error),
    #[error("shortlist export is not valid UTF-8")]
    InvalidUtf8,
    #[error("HTML is an export-only shortlist format")]
    UnsupportedImportFormat,
}

#[derive(Debug, Deserialize)]
struct CsvEntry {
    player_id: String,
    #[serde(default, deserialize_with = "deserialize_bool")]
    favorite: bool,
    #[serde(default)]
    tags: String,
    #[serde(default)]
    note: String,
}

pub fn normalize_shortlist(
    document: ShortlistDocument,
) -> Result<ShortlistDocument, ShortlistError> {
    if document.schema_version != SHORTLIST_SCHEMA_VERSION {
        return Err(ShortlistError::UnsupportedSchema(document.schema_version));
    }
    let mut entries = BTreeMap::new();
    for entry in document.entries {
        let player_id = clean_text(&entry.player_id, 128);
        if player_id.is_empty() {
            continue;
        }
        let tags = entry
            .tags
            .into_iter()
            .map(|tag| clean_text(&tag, 40))
            .filter(|tag| !tag.is_empty())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .take(20)
            .collect();
        let note = entry
            .note
            .map(|note| clean_text(&note, 4_000))
            .filter(|note| !note.is_empty());
        entries.insert(
            player_id.clone(),
            ShortlistEntry {
                player_id,
                favorite: entry.favorite,
                tags,
                note,
            },
        );
    }
    Ok(ShortlistDocument {
        schema_version: SHORTLIST_SCHEMA_VERSION,
        entries: entries.into_values().collect(),
    })
}

pub fn import_shortlist(
    contents: &str,
    format: ShortlistFormat,
) -> Result<ShortlistDocument, ShortlistError> {
    let document = match format {
        ShortlistFormat::Json => serde_json::from_str(contents)?,
        ShortlistFormat::Csv => {
            let mut reader = csv::ReaderBuilder::new()
                .flexible(true)
                .from_reader(contents.as_bytes());
            let entries = reader
                .deserialize::<CsvEntry>()
                .map(|row| {
                    row.map(|row| ShortlistEntry {
                        player_id: row.player_id,
                        favorite: row.favorite,
                        tags: row.tags.split('|').map(str::to_owned).collect(),
                        note: (!row.note.trim().is_empty()).then_some(row.note),
                    })
                })
                .collect::<Result<Vec<_>, _>>()?;
            ShortlistDocument {
                schema_version: SHORTLIST_SCHEMA_VERSION,
                entries,
            }
        }
        ShortlistFormat::Html => return Err(ShortlistError::UnsupportedImportFormat),
    };
    normalize_shortlist(document)
}

pub fn export_shortlist(
    document: ShortlistDocument,
    players: &[Player],
    format: ShortlistFormat,
) -> Result<String, ShortlistError> {
    let document = normalize_shortlist(document)?;
    match format {
        ShortlistFormat::Json => Ok(serde_json::to_string_pretty(&document)?),
        ShortlistFormat::Csv => export_csv(&document, players),
        ShortlistFormat::Html => Ok(export_html(&document, players)),
    }
}

fn export_csv(document: &ShortlistDocument, players: &[Player]) -> Result<String, ShortlistError> {
    let mut writer = csv::Writer::from_writer(Vec::new());
    writer.write_record(["player_id", "name", "favorite", "tags", "note"])?;
    for entry in &document.entries {
        writer.write_record([
            entry.player_id.as_str(),
            player_name(players, &entry.player_id),
            if entry.favorite { "true" } else { "false" },
            &entry.tags.join("|"),
            entry.note.as_deref().unwrap_or(""),
        ])?;
    }
    writer.flush().map_err(csv::Error::from)?;
    let bytes = writer
        .into_inner()
        .map_err(|error| ShortlistError::InvalidCsv(csv::Error::from(error.into_error())))?;
    String::from_utf8(bytes).map_err(|_| ShortlistError::InvalidUtf8)
}

fn export_html(document: &ShortlistDocument, players: &[Player]) -> String {
    let rows = document
        .entries
        .iter()
        .map(|entry| {
            format!(
                "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>",
                escape_html(player_name(players, &entry.player_id)),
                escape_html(&entry.player_id),
                if entry.favorite { "★" } else { "" },
                escape_html(&entry.tags.join(", ")),
                escape_html(entry.note.as_deref().unwrap_or("")),
            )
        })
        .collect::<String>();
    format!(
        "<!doctype html><html lang=\"de\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>BestScout Shortlist</title><style>body{{font:14px system-ui;background:#080b10;color:#eef3f8;padding:32px}}h1{{color:#73f2a7}}table{{width:100%;border-collapse:collapse;background:#10151d}}th,td{{padding:10px;border:1px solid #242d3a;text-align:left}}th{{color:#73f2a7}}</style></head><body><h1>BestScout Shortlist</h1><p>{} Einträge · Schema {}</p><table><thead><tr><th>Spieler</th><th>ID</th><th>Favorit</th><th>Tags</th><th>Notiz</th></tr></thead><tbody>{rows}</tbody></table></body></html>",
        document.entries.len(),
        document.schema_version,
    )
}

fn player_name<'a>(players: &'a [Player], player_id: &str) -> &'a str {
    players
        .iter()
        .find(|player| player.id == player_id)
        .map_or("Unbekannter Spieler", |player| player.name.as_str())
}

fn clean_text(value: &str, maximum_chars: usize) -> String {
    value
        .trim()
        .chars()
        .filter(|character| !character.is_control() || matches!(character, '\n' | '\t'))
        .take(maximum_chars)
        .collect()
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn deserialize_bool<'de, D>(deserializer: D) -> Result<bool, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = String::deserialize(deserializer)?;
    Ok(matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "true" | "1" | "yes" | "ja" | "x"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::synthetic_snapshot;

    fn document() -> ShortlistDocument {
        ShortlistDocument {
            schema_version: SHORTLIST_SCHEMA_VERSION,
            entries: vec![ShortlistEntry {
                player_id: "player-ada".into(),
                favorite: true,
                tags: vec![" Zukunft ".into(), "Zukunft".into()],
                note: Some("<stark> & bezahlbar".into()),
            }],
        }
    }

    #[test]
    fn normalizes_and_round_trips_json_and_csv() {
        let players = synthetic_snapshot().players;
        let normalized = normalize_shortlist(document()).unwrap();
        assert_eq!(normalized.entries[0].tags, vec!["Zukunft"]);

        let json = export_shortlist(normalized.clone(), &players, ShortlistFormat::Json).unwrap();
        assert_eq!(
            import_shortlist(&json, ShortlistFormat::Json).unwrap(),
            normalized
        );
        let csv = export_shortlist(normalized.clone(), &players, ShortlistFormat::Csv).unwrap();
        assert_eq!(
            import_shortlist(&csv, ShortlistFormat::Csv).unwrap(),
            normalized
        );
    }

    #[test]
    fn html_export_escapes_user_content_and_contains_no_script() {
        let html = export_shortlist(
            document(),
            &synthetic_snapshot().players,
            ShortlistFormat::Html,
        )
        .unwrap();
        assert!(html.contains("&lt;stark&gt; &amp; bezahlbar"));
        assert!(!html.contains("<stark>"));
        assert!(!html.contains("<script"));
    }

    #[test]
    fn rejects_unknown_schema_versions() {
        let error = normalize_shortlist(ShortlistDocument {
            schema_version: 99,
            entries: vec![],
        })
        .unwrap_err();
        assert!(matches!(error, ShortlistError::UnsupportedSchema(99)));
    }
}
