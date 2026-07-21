use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use crate::{ExecutableFingerprint, fingerprint_file};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FmInstallation {
    pub root: PathBuf,
    pub executable: PathBuf,
    pub game_assembly: PathBuf,
    pub fingerprint: Option<ExecutableFingerprint>,
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
    pub editor_allowed: bool,
    pub message: String,
}

pub fn discover_environment() -> LiveEnvironment {
    let installations = discover_installations();
    let processes = discover_processes();
    let message = match (installations.is_empty(), processes.is_empty()) {
        (true, _) => "Football Manager 26 installation not found".to_owned(),
        (false, true) => "FM26 found; start and load a save for live access".to_owned(),
        (false, false) => "FM26 is running; build profile verification required".to_owned(),
    };

    LiveEnvironment {
        installations,
        processes,
        editor_allowed: false,
        message,
    }
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
        .filter_map(|root| installation_at(&root))
        .collect()
}

fn installation_at(root: &Path) -> Option<FmInstallation> {
    let executable = root.join("fm.exe");
    let game_assembly = root.join("GameAssembly.dll");
    if !executable.is_file() || !game_assembly.is_file() {
        return None;
    }
    let fingerprint = fingerprint_file(&executable).ok();
    Some(FmInstallation {
        root: root.to_owned(),
        executable,
        game_assembly,
        fingerprint,
    })
}

fn discover_processes() -> Vec<FmProcess> {
    let Ok(entries) = fs::read_dir("/proc") else {
        return Vec::new();
    };
    let mut result = Vec::new();
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
        if comm_matches || argument_matches {
            result.push(FmProcess { pid, command });
        }
    }
    result.sort_by_key(|process| process.pid);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ignores_directories_without_both_runtime_files() {
        assert!(installation_at(Path::new("/definitely/not/fm26")).is_none());
    }
}
