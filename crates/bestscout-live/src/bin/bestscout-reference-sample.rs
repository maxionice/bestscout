use std::{env, ffi::OsString, path::PathBuf, process::ExitCode};

use bestscout_live::{BridgeClient, ReferenceSampleState};

#[derive(Debug, PartialEq, Eq)]
struct Options {
    game_root: PathBuf,
    family: String,
    entity_index: Option<u32>,
    property_ids: Vec<u32>,
}

fn main() -> ExitCode {
    let options = match parse_options(env::args_os().skip(1)) {
        Ok(options) => options,
        Err(error) => {
            eprintln!("{error}");
            eprintln!(
                "usage: bestscout-reference-sample --game-root <FM26 directory> --family <name> [--entity-index <index>] --property-id <id> [--property-id <id> ...]"
            );
            return ExitCode::from(2);
        }
    };
    let result = BridgeClient::from_installation(&options.game_root).and_then(|client| {
        client.sample_reference(&options.family, options.entity_index, &options.property_ids)
    });
    match result {
        Ok(status) => match serde_json::to_string_pretty(&status) {
            Ok(json) => {
                println!("{json}");
                if status.state == ReferenceSampleState::Completed {
                    ExitCode::SUCCESS
                } else {
                    ExitCode::FAILURE
                }
            }
            Err(error) => {
                eprintln!("cannot serialize the validated FM26 reference sample: {error}");
                ExitCode::FAILURE
            }
        },
        Err(error) => {
            eprintln!("cannot read the FM26 reference sample: {error}");
            ExitCode::FAILURE
        }
    }
}

fn parse_options(arguments: impl Iterator<Item = OsString>) -> Result<Options, String> {
    let mut game_root = None;
    let mut family = None;
    let mut entity_index = None;
    let mut property_ids = Vec::new();
    let mut arguments = arguments;
    while let Some(argument) = arguments.next() {
        match argument.to_str() {
            Some("--game-root") if game_root.is_none() => {
                game_root =
                    Some(PathBuf::from(arguments.next().ok_or_else(|| {
                        "missing FM26 directory after --game-root".to_owned()
                    })?));
            }
            Some("--family") if family.is_none() => {
                family = Some(parse_utf8(
                    arguments
                        .next()
                        .ok_or_else(|| "missing name after --family".to_owned())?,
                    "reference family",
                )?);
            }
            Some("--entity-index") if entity_index.is_none() => {
                entity_index = Some(parse_number(
                    arguments
                        .next()
                        .ok_or_else(|| "missing number after --entity-index".to_owned())?,
                    "entity index",
                )?);
            }
            Some("--property-id") => {
                property_ids.push(parse_number(
                    arguments
                        .next()
                        .ok_or_else(|| "missing number after --property-id".to_owned())?,
                    "property ID",
                )?);
            }
            _ => return Err("unknown, duplicate or malformed option".to_owned()),
        }
    }
    Ok(Options {
        game_root: game_root.ok_or_else(|| "missing --game-root option".to_owned())?,
        family: family.ok_or_else(|| "missing --family option".to_owned())?,
        entity_index,
        property_ids,
    })
}

fn parse_utf8(value: OsString, name: &str) -> Result<String, String> {
    value
        .into_string()
        .map_err(|_| format!("{name} must be valid UTF-8"))
}

fn parse_number(value: OsString, name: &str) -> Result<u32, String> {
    parse_utf8(value, name)?
        .parse()
        .map_err(|_| format!("{name} must be an unsigned 32-bit integer"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_indexed_reference_sample_options() {
        let options = parse_options(
            [
                "--game-root",
                "/games/Football Manager 26",
                "--family",
                "person",
                "--entity-index",
                "42",
                "--property-id",
                "7",
                "--property-id",
                "9",
            ]
            .into_iter()
            .map(Into::into),
        )
        .unwrap();
        assert_eq!(
            options.game_root,
            PathBuf::from("/games/Football Manager 26")
        );
        assert_eq!(options.family, "person");
        assert_eq!(options.entity_index, Some(42));
        assert_eq!(options.property_ids, [7, 9]);
    }

    #[test]
    fn rejects_duplicate_singleton_and_unknown_options() {
        assert!(
            parse_options(
                ["--game-root", "/games/fm26", "--game-root", "/other"]
                    .into_iter()
                    .map(Into::into)
            )
            .is_err()
        );
        assert!(parse_options(["--unknown"].into_iter().map(Into::into)).is_err());
    }
}
