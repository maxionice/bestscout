use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::BuildFingerprint;

const STEAM_23583635: &str = include_str!("../../../profiles/fm26/steam-23583635.json");

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProfileFingerprint {
    pub executable_sha256: String,
    pub game_assembly_sha256: String,
    pub global_metadata_sha256: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Capabilities {
    pub process_inspection: bool,
    pub domain_read: bool,
    pub domain_write: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompatibilityProfile {
    pub id: String,
    pub label: String,
    pub steam_build_id: String,
    pub fingerprint: ProfileFingerprint,
    pub capabilities: Capabilities,
    pub notes: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CompatibilityStatus {
    Unknown,
    FingerprintMismatch,
    Exact,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompatibilityReport {
    pub status: CompatibilityStatus,
    pub profile_id: Option<String>,
    pub label: Option<String>,
    pub capabilities: Capabilities,
    pub reason: String,
}

#[derive(Debug, Error)]
pub enum ProfileError {
    #[error("built-in compatibility profile is invalid: {0}")]
    Invalid(#[from] serde_json::Error),
}

pub fn builtin_profiles() -> Result<Vec<CompatibilityProfile>, ProfileError> {
    Ok(vec![serde_json::from_str(STEAM_23583635)?])
}

pub fn match_profile(
    build: &BuildFingerprint,
    steam_build_id: Option<&str>,
) -> Result<CompatibilityReport, ProfileError> {
    let profiles = builtin_profiles()?;
    let hash_match = |profile: &&CompatibilityProfile| {
        profile.fingerprint.executable_sha256 == build.executable.sha256
            && profile.fingerprint.game_assembly_sha256 == build.game_assembly.sha256
            && profile.fingerprint.global_metadata_sha256 == build.global_metadata.sha256
    };

    if let Some(profile) = profiles.iter().find(hash_match) {
        let build_id_matches = steam_build_id.is_none_or(|id| id == profile.steam_build_id);
        if build_id_matches {
            return Ok(CompatibilityReport {
                status: CompatibilityStatus::Exact,
                profile_id: Some(profile.id.clone()),
                label: Some(profile.label.clone()),
                capabilities: profile.capabilities,
                reason: "all version fingerprints match".to_owned(),
            });
        }
    }

    let known_executable = profiles
        .iter()
        .any(|profile| profile.fingerprint.executable_sha256 == build.executable.sha256);
    Ok(CompatibilityReport {
        status: if known_executable {
            CompatibilityStatus::FingerprintMismatch
        } else {
            CompatibilityStatus::Unknown
        },
        profile_id: None,
        label: None,
        capabilities: Capabilities {
            process_inspection: false,
            domain_read: false,
            domain_write: false,
        },
        reason: if known_executable {
            "executable is known but companion fingerprints or Steam build differ"
        } else {
            "no compatibility profile matches this build"
        }
        .to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ExecutableFingerprint;

    fn file(sha256: &str) -> ExecutableFingerprint {
        ExecutableFingerprint {
            sha256: sha256.to_owned(),
            size: 1,
        }
    }

    #[test]
    fn exact_profile_only_enables_declared_capabilities() {
        let build = BuildFingerprint {
            executable: file("3653c97f9ccec2be28edc4faae67304b5b6c26733f2f07dea3e7c591d3b9ff73"),
            game_assembly: file("7ce3eb474dc6093df633f979e869e55b2ec7953fde2e732392a694d379ff7a0c"),
            global_metadata: file(
                "52287eadeb07d3d222c9e370e64f308260934911807e2073fb0e72f49c273213",
            ),
        };
        let report = match_profile(&build, Some("23583635")).unwrap();
        assert_eq!(report.status, CompatibilityStatus::Exact);
        assert!(report.capabilities.process_inspection);
        assert!(!report.capabilities.domain_read);
        assert!(!report.capabilities.domain_write);
    }

    #[test]
    fn one_changed_component_rejects_the_profile() {
        let build = BuildFingerprint {
            executable: file("3653c97f9ccec2be28edc4faae67304b5b6c26733f2f07dea3e7c591d3b9ff73"),
            game_assembly: file("changed"),
            global_metadata: file(
                "52287eadeb07d3d222c9e370e64f308260934911807e2073fb0e72f49c273213",
            ),
        };
        let report = match_profile(&build, Some("23583635")).unwrap();
        assert_eq!(report.status, CompatibilityStatus::FingerprintMismatch);
        assert!(!report.capabilities.process_inspection);
    }
}
