use std::{env, path::PathBuf, process::ExitCode};

fn main() -> ExitCode {
    let game_root = match game_root(env::args_os().skip(1)) {
        Ok(path) => path,
        Err(error) => {
            eprintln!("{error}");
            eprintln!("usage: bestscout-reference-catalog --game-root <FM26 directory>");
            return ExitCode::from(2);
        }
    };
    let result = bestscout_live::BridgeClient::from_installation(&game_root)
        .and_then(|client| client.reference_catalog());
    match result {
        Ok(catalog) => match serde_json::to_string_pretty(&catalog) {
            Ok(json) => {
                println!("{json}");
                ExitCode::SUCCESS
            }
            Err(error) => {
                eprintln!("cannot serialize the validated FM26 reference catalog: {error}");
                ExitCode::FAILURE
            }
        },
        Err(error) => {
            eprintln!("cannot read the FM26 reference catalog: {error}");
            ExitCode::FAILURE
        }
    }
}

fn game_root(mut arguments: impl Iterator<Item = std::ffi::OsString>) -> Result<PathBuf, String> {
    if arguments.next().as_deref() != Some(std::ffi::OsStr::new("--game-root")) {
        return Err("missing --game-root option".to_owned());
    }
    let path = arguments
        .next()
        .map(PathBuf::from)
        .ok_or_else(|| "missing FM26 directory after --game-root".to_owned())?;
    if arguments.next().is_some() {
        return Err("unexpected additional arguments".to_owned());
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_game_root_with_spaces() {
        let path = game_root(
            ["--game-root", "/games/Football Manager 26"]
                .into_iter()
                .map(Into::into),
        )
        .unwrap();
        assert_eq!(path, PathBuf::from("/games/Football Manager 26"));
    }

    #[test]
    fn rejects_missing_and_extra_arguments() {
        assert!(game_root(std::iter::empty()).is_err());
        assert!(
            game_root(
                ["--game-root", "/games/fm26", "extra"]
                    .into_iter()
                    .map(Into::into)
            )
            .is_err()
        );
    }
}
