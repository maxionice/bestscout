use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use crate::{
    BridgeDeploymentStatus, BridgeProbe, BuildFingerprint, Capabilities, CompatibilityReport,
    ProcessAccessProbe, bridge_deployment_status, fingerprint_file, match_profile, probe_bridge,
    probe_process_read_access,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FmInstallation {
    pub root: PathBuf,
    pub executable: PathBuf,
    pub game_assembly: PathBuf,
    pub global_metadata: PathBuf,
    pub steam_build_id: Option<String>,
    pub build_fingerprint: Option<BuildFingerprint>,
    pub compatibility: Option<CompatibilityReport>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FmProcess {
    pub pid: u32,
    pub command: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LiveEnvironment {
    pub installations: Vec<FmInstallation>,
    pub processes: Vec<FmProcess>,
    pub bridge: Option<BridgeProbe>,
    pub bridge_deployment: Option<BridgeDeploymentStatus>,
    pub process_access: Option<ProcessAccessProbe>,
    pub process_access_error: Option<String>,
    pub process_inspection_allowed: bool,
    pub reader_allowed: bool,
    pub editor_allowed: bool,
    pub message: String,
}

pub fn discover_environment() -> LiveEnvironment {
    let installations = discover_installations();
    let processes = discover_processes();
    let bridge = installations
        .first()
        .and_then(|installation| probe_bridge(&installation.root).ok())
        .filter(|probe| {
            processes
                .iter()
                .any(|process| process.pid == probe.health.pid)
        });
    let bridge_deployment = installations
        .first()
        .and_then(|installation| bridge_deployment_status(&installation.root).ok());
    let capabilities = installations
        .first()
        .and_then(|installation| installation.compatibility.as_ref())
        .map(|report| report.capabilities);
    let (process_inspection_allowed, reader_allowed, editor_allowed) =
        resolve_capabilities(capabilities, bridge.as_ref());
    let (process_access, process_access_error) = if process_inspection_allowed {
        match processes
            .first()
            .map(|process| probe_process_read_access(process.pid))
        {
            Some(Ok(probe)) => (Some(probe), None),
            Some(Err(error)) => (None, Some(error.to_string())),
            None => (None, None),
        }
    } else {
        (None, None)
    };
    let process_access_verified = process_access
        .as_ref()
        .is_some_and(|probe| probe.executable_signature_valid);
    let message = match (
        installations.is_empty(),
        processes.is_empty(),
        process_inspection_allowed,
        process_access_verified,
    ) {
        (true, _, _, _) => "Football Manager 26 installation not found".to_owned(),
        (false, true, true, _) => {
            "FM26 build verified; start and load a save for live access".to_owned()
        }
        (false, true, false, _) => {
            "FM26 found, but this build is not approved for inspection".to_owned()
        }
        (false, false, true, true) => {
            "FM26 is running with verified read-only process access".to_owned()
        }
        (false, false, true, false) => {
            "FM26 is running, but read-only process access failed".to_owned()
        }
        (false, false, false, _) => "FM26 is running, but its build profile is unknown".to_owned(),
    };

    LiveEnvironment {
        installations,
        processes,
        bridge,
        bridge_deployment,
        process_access,
        process_access_error,
        process_inspection_allowed,
        reader_allowed,
        editor_allowed,
        message,
    }
}

fn resolve_capabilities(
    profile: Option<Capabilities>,
    bridge: Option<&BridgeProbe>,
) -> (bool, bool, bool) {
    let process_inspection = profile.is_some_and(|value| value.process_inspection);
    let domain_read = profile.is_some_and(|value| value.domain_read)
        && bridge.is_some_and(|probe| probe.capabilities.domain_read);
    let domain_write = profile.is_some_and(|value| value.domain_write)
        && bridge.is_some_and(|probe| probe.capabilities.domain_write && !probe.health.read_only);
    (process_inspection, domain_read, domain_write)
}

fn discover_installations() -> Vec<FmInstallation> {
    let mut candidates = Vec::new();
    if let Some(home) = dirs::home_dir() {
        candidates.push(home.join(".local/share/Steam/steamapps/common/Football Manager 26"));
        candidates.push(home.join(".steam/steam/steamapps/common/Football Manager 26"));
    }
    if let Some(data) = dirs::data_dir() {
        candidates.push(data.join("Steam/steamapps/common/Football Manager 26"));
    }

    let mut candidates: Vec<_> = candidates
        .into_iter()
        .filter_map(|path| fs::canonicalize(path).ok())
        .collect();
    candidates.sort();
    candidates.dedup();
    candidates
        .into_iter()
        .filter_map(|root| inspect_installation(&root))
        .collect()
}

pub fn inspect_installation(root: &Path) -> Option<FmInstallation> {
    let executable = root.join("fm.exe");
    let game_assembly = root.join("GameAssembly.dll");
    let global_metadata = root.join("fm_Data/il2cpp_data/Metadata/global-metadata.dat");
    if !executable.is_file() || !game_assembly.is_file() || !global_metadata.is_file() {
        return None;
    }
    let build_fingerprint = fingerprint_file(&executable)
        .and_then(|executable| {
            Ok(BuildFingerprint {
                executable,
                game_assembly: fingerprint_file(&game_assembly)?,
                global_metadata: fingerprint_file(&global_metadata)?,
            })
        })
        .ok();
    let steam_build_id = read_steam_build_id(root);
    let compatibility = build_fingerprint
        .as_ref()
        .and_then(|build| match_profile(build, steam_build_id.as_deref()).ok());
    Some(FmInstallation {
        root: root.to_owned(),
        executable,
        game_assembly,
        global_metadata,
        steam_build_id,
        build_fingerprint,
        compatibility,
    })
}

fn read_steam_build_id(root: &Path) -> Option<String> {
    let steamapps = root.parent()?.parent()?;
    let manifest = fs::read_to_string(steamapps.join("appmanifest_3551340.acf")).ok()?;
    manifest.lines().find_map(|line| {
        let quoted: Vec<_> = line.split('"').collect();
        (quoted.get(1).copied() == Some("buildid"))
            .then(|| quoted.get(3).map(|value| (*value).to_owned()))
            .flatten()
    })
}

pub(crate) fn discover_processes() -> Vec<FmProcess> {
    let Ok(entries) = fs::read_dir("/proc") else {
        return Vec::new();
    };
    let mut game_processes = Vec::new();
    let mut launcher_processes = Vec::new();
    for entry in entries.flatten() {
        let Some(pid) = entry
            .file_name()
            .to_str()
            .and_then(|name| name.parse::<u32>().ok())
        else {
            continue;
        };
        let Ok(bytes) = fs::read(entry.path().join("cmdline")) else {
            continue;
        };
        let command = String::from_utf8_lossy(&bytes).replace('\0', " ");
        let comm_matches = fs::read_to_string(entry.path().join("comm"))
            .is_ok_and(|comm| comm.trim().eq_ignore_ascii_case("fm.exe"));
        let argument_matches = bytes.split(|byte| *byte == 0).any(|argument| {
            let argument = String::from_utf8_lossy(argument);
            Path::new(argument.as_ref())
                .file_name()
                .is_some_and(|name| name.eq_ignore_ascii_case("fm.exe"))
        });
        if comm_matches {
            game_processes.push(FmProcess { pid, command });
        } else if argument_matches {
            launcher_processes.push(FmProcess { pid, command });
        }
    }
    select_detected_processes(game_processes, launcher_processes)
}

fn select_detected_processes(
    mut game_processes: Vec<FmProcess>,
    mut launcher_processes: Vec<FmProcess>,
) -> Vec<FmProcess> {
    game_processes.sort_by_key(|process| process.pid);
    launcher_processes.sort_by_key(|process| process.pid);
    if game_processes.is_empty() {
        launcher_processes
    } else {
        game_processes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bridge(read: bool, write: bool, read_only: bool) -> BridgeProbe {
        BridgeProbe {
            health: crate::BridgeHealth {
                bridge_version: "test".to_owned(),
                pid: 1,
                read_only,
            },
            capabilities: crate::BridgeCapabilities {
                health: true,
                domain_read: read,
                domain_write: write,
            },
            domain_roots: None,
        }
    }

    fn profile() -> Capabilities {
        Capabilities {
            process_inspection: true,
            domain_read: true,
            domain_write: true,
        }
    }

    #[test]
    fn ignores_directories_without_both_runtime_files() {
        assert!(inspect_installation(Path::new("/definitely/not/fm26")).is_none());
    }

    #[test]
    fn domain_access_requires_profile_and_bridge_agreement() {
        assert_eq!(
            resolve_capabilities(Some(profile()), None),
            (true, false, false)
        );
        assert_eq!(
            resolve_capabilities(Some(profile()), Some(&bridge(true, true, true))),
            (true, true, false)
        );
        assert_eq!(
            resolve_capabilities(Some(profile()), Some(&bridge(true, true, false))),
            (true, true, true)
        );
        assert_eq!(
            resolve_capabilities(None, Some(&bridge(true, true, false))),
            (false, false, false)
        );
    }

    #[test]
    fn selects_the_real_game_process_instead_of_proton_launchers() {
        let game = FmProcess {
            pid: 30,
            command: "fm.exe".to_owned(),
        };
        let launchers = vec![
            FmProcess {
                pid: 10,
                command: "proton fm.exe".to_owned(),
            },
            FmProcess {
                pid: 20,
                command: "reaper fm.exe".to_owned(),
            },
        ];
        assert_eq!(
            select_detected_processes(vec![game.clone()], launchers.clone()),
            vec![game]
        );
        assert_eq!(
            select_detected_processes(Vec::new(), launchers.clone()),
            launchers
        );
    }
}
