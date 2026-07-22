use std::{env, ffi::OsString, path::PathBuf};

use serde::Serialize;

const USAGE: &str = "usage: bestscout-bridge <status|install|uninstall> --game-root <path> [--artifact <BestScout.Bridge.dll>]";

fn main() {
    match run(env::args_os().skip(1)) {
        Ok(value) => print_json(&value, false),
        Err(error) => {
            print_json(
                &CliError {
                    error,
                    usage: USAGE,
                },
                true,
            );
            std::process::exit(1);
        }
    }
}

fn run(args: impl Iterator<Item = OsString>) -> Result<serde_json::Value, String> {
    let options = Options::parse(args)?;
    match options.command {
        Command::Status => to_json(
            bestscout_live::bridge_deployment_status(&options.game_root)
                .map_err(|error| error.to_string())?,
        ),
        Command::Install => to_json(
            bestscout_live::install_bridge(
                &options.game_root,
                options
                    .artifact
                    .as_ref()
                    .expect("install command requires an artifact"),
            )
            .map_err(|error| error.to_string())?,
        ),
        Command::Uninstall => to_json(
            bestscout_live::uninstall_bridge(&options.game_root)
                .map_err(|error| error.to_string())?,
        ),
    }
}

fn to_json(value: impl Serialize) -> Result<serde_json::Value, String> {
    serde_json::to_value(value).map_err(|error| format!("cannot serialize CLI result: {error}"))
}

fn print_json(value: &impl Serialize, stderr: bool) {
    let json = serde_json::to_string_pretty(value)
        .unwrap_or_else(|_| "{\"error\":\"cannot serialize CLI result\"}".to_owned());
    if stderr {
        eprintln!("{json}");
    } else {
        println!("{json}");
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Command {
    Status,
    Install,
    Uninstall,
}

#[derive(Debug, PartialEq, Eq)]
struct Options {
    command: Command,
    game_root: PathBuf,
    artifact: Option<PathBuf>,
}

impl Options {
    fn parse(mut args: impl Iterator<Item = OsString>) -> Result<Self, String> {
        let command = match args
            .next()
            .and_then(|value| value.into_string().ok())
            .as_deref()
        {
            Some("status") => Command::Status,
            Some("install") => Command::Install,
            Some("uninstall") => Command::Uninstall,
            _ => return Err("missing or unknown bridge command".to_owned()),
        };
        let mut game_root = None;
        let mut artifact = None;
        while let Some(option) = args.next() {
            match option.to_str() {
                Some("--game-root") if game_root.is_none() => {
                    game_root = Some(PathBuf::from(
                        args.next()
                            .ok_or_else(|| "--game-root requires a path".to_owned())?,
                    ));
                }
                Some("--artifact") if artifact.is_none() => {
                    artifact = Some(PathBuf::from(
                        args.next()
                            .ok_or_else(|| "--artifact requires a path".to_owned())?,
                    ));
                }
                _ => return Err("unknown or duplicate bridge option".to_owned()),
            }
        }
        let game_root = game_root.ok_or_else(|| "--game-root is required".to_owned())?;
        match (command, artifact.is_some()) {
            (Command::Install, false) => return Err("install requires --artifact".to_owned()),
            (Command::Status | Command::Uninstall, true) => {
                return Err("--artifact is only valid for install".to_owned());
            }
            _ => {}
        }
        Ok(Self {
            command,
            game_root,
            artifact,
        })
    }
}

#[derive(Serialize)]
struct CliError<'a> {
    error: String,
    usage: &'a str,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_path_with_spaces_without_shell_assumptions() {
        let options = Options::parse(
            [
                "install",
                "--game-root",
                "/games/Football Manager 26",
                "--artifact",
                "/build/BestScout.Bridge.dll",
            ]
            .into_iter()
            .map(OsString::from),
        )
        .unwrap();
        assert_eq!(options.command, Command::Install);
        assert_eq!(
            options.game_root,
            PathBuf::from("/games/Football Manager 26")
        );
    }

    #[test]
    fn rejects_an_artifact_for_non_install_commands() {
        let result = Options::parse(
            ["status", "--game-root", "/game", "--artifact", "/bridge"]
                .into_iter()
                .map(OsString::from),
        );
        assert_eq!(
            result,
            Err("--artifact is only valid for install".to_owned())
        );
    }
}
