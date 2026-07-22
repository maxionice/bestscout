use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::{
    CompatibilityStatus, ExecutableFingerprint, FingerprintError, FmInstallation, FmProcess,
    RuntimeSandbox, fingerprint_file, runtime_sandbox,
};

use crate::discovery::{discover_processes, inspect_installation};

pub const BRIDGE_VERSION: &str = "0.3.0";
const MANIFEST_SCHEMA_VERSION: u32 = 1;
const BRIDGE_FILENAME: &str = "BestScout.Bridge.dll";
const MANIFEST_FILENAME: &str = "bestscout-install.json";
const MAXIMUM_BRIDGE_BYTES: u64 = 32 * 1024 * 1024;
const MAXIMUM_MANIFEST_BYTES: u64 = 16 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BridgeDeploymentState {
    NotInstalled,
    Managed,
    UnmanagedFile,
    MissingBinary,
    InvalidManifest,
    Modified,
    TransactionResidue,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BridgeInstallManifest {
    pub schema_version: u32,
    pub bridge_version: String,
    pub profile_id: String,
    pub bridge_filename: String,
    pub sha256: String,
    pub size: u64,
    pub installed_at_unix_seconds: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BridgeDeploymentStatus {
    pub state: BridgeDeploymentState,
    pub plugin_directory: PathBuf,
    pub bridge_path: PathBuf,
    pub manifest_path: PathBuf,
    pub manifest: Option<BridgeInstallManifest>,
    pub observed_artifact: Option<ExecutableFingerprint>,
    pub reason: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BridgeDeploymentAction {
    Installed,
    Updated,
    AlreadyInstalled,
    Removed,
    AlreadyAbsent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BridgeDeploymentOutcome {
    pub action: BridgeDeploymentAction,
    pub status: BridgeDeploymentStatus,
}

#[derive(Debug, Error)]
pub enum BridgeDeploymentError {
    #[error("the selected directory is not a complete FM26 installation")]
    InvalidInstallation,
    #[error("the selected FM26 build has no exact compatibility profile")]
    UnsupportedBuild,
    #[error("FM26 is still running with PID(s) {0:?}; close it normally before changing plugins")]
    GameRunning(Vec<u32>),
    #[error("bridge deployment is unavailable inside Flatpak; use AppImage, DEB or RPM")]
    SandboxedRuntime,
    #[error("the bridge artifact must be a regular, non-symlink file named {BRIDGE_FILENAME}")]
    InvalidArtifact,
    #[error("the bridge artifact is empty, too large or has no PE signature")]
    InvalidArtifactFormat,
    #[error("the plugin directory resolves outside the selected FM26 installation")]
    EscapingPluginDirectory,
    #[error("existing bridge state {0:?} is not safe to replace or remove")]
    UnsafeExistingState(BridgeDeploymentState),
    #[error("the installed bridge belongs to profile {installed}, not {selected}")]
    ProfileMismatch { installed: String, selected: String },
    #[error("a previous bridge deployment transaction left staging files behind")]
    TransactionResidue,
    #[error("cannot fingerprint bridge artifact: {0}")]
    Fingerprint(#[from] FingerprintError),
    #[error("cannot process bridge install manifest JSON: {0}")]
    ManifestJson(#[from] serde_json::Error),
    #[error("cannot {action} {path}: {source}")]
    Io {
        action: &'static str,
        path: PathBuf,
        #[source]
        source: io::Error,
    },
}

pub fn bridge_deployment_status(
    game_root: impl AsRef<Path>,
) -> Result<BridgeDeploymentStatus, BridgeDeploymentError> {
    let paths = status_paths(game_root.as_ref())?;
    if has_transaction_residue(&paths)? {
        return Ok(paths.status(
            BridgeDeploymentState::TransactionResidue,
            None,
            None,
            "a previous deployment transaction left inert files behind",
        ));
    }
    let bridge_metadata = optional_metadata(&paths.bridge)?;
    let manifest_metadata = optional_metadata(&paths.manifest)?;

    let status = match (bridge_metadata, manifest_metadata) {
        (None, None) => paths.status(
            BridgeDeploymentState::NotInstalled,
            None,
            None,
            "no managed BestScout bridge is installed",
        ),
        (Some(bridge), None) => {
            let observed = regular_fingerprint(&paths.bridge, &bridge)?;
            paths.status(
                BridgeDeploymentState::UnmanagedFile,
                None,
                observed,
                "a bridge DLL exists without a BestScout install manifest",
            )
        }
        (None, Some(_)) => match read_manifest(&paths.manifest) {
            Ok(manifest) if validate_manifest(&manifest) => paths.status(
                BridgeDeploymentState::MissingBinary,
                Some(manifest),
                None,
                "the install manifest exists but its bridge DLL is missing",
            ),
            Ok(manifest) => paths.status(
                BridgeDeploymentState::InvalidManifest,
                Some(manifest),
                None,
                "the install manifest violates the deployment schema",
            ),
            Err(_) => paths.status(
                BridgeDeploymentState::InvalidManifest,
                None,
                None,
                "the install manifest is not a bounded regular JSON file",
            ),
        },
        (Some(bridge), Some(_)) => {
            let observed = regular_fingerprint(&paths.bridge, &bridge)?;
            let manifest = match read_manifest(&paths.manifest) {
                Ok(manifest) if validate_manifest(&manifest) => manifest,
                Ok(manifest) => {
                    return Ok(paths.status(
                        BridgeDeploymentState::InvalidManifest,
                        Some(manifest),
                        observed,
                        "the install manifest violates the deployment schema",
                    ));
                }
                Err(_) => {
                    return Ok(paths.status(
                        BridgeDeploymentState::InvalidManifest,
                        None,
                        observed,
                        "the install manifest is not valid JSON",
                    ));
                }
            };
            match observed.as_ref() {
                Some(fingerprint)
                    if fingerprint.sha256 == manifest.sha256
                        && fingerprint.size == manifest.size =>
                {
                    paths.status(
                        BridgeDeploymentState::Managed,
                        Some(manifest),
                        observed,
                        "managed bridge integrity is verified",
                    )
                }
                _ => paths.status(
                    BridgeDeploymentState::Modified,
                    Some(manifest),
                    observed,
                    "the installed bridge no longer matches its manifest",
                ),
            }
        }
    };
    Ok(status)
}

pub fn install_bridge(
    game_root: impl AsRef<Path>,
    artifact: impl AsRef<Path>,
) -> Result<BridgeDeploymentOutcome, BridgeDeploymentError> {
    ensure_native_runtime(runtime_sandbox())?;
    let installation = inspect_installation(game_root.as_ref())
        .ok_or(BridgeDeploymentError::InvalidInstallation)?;
    install_bridge_for_installation(&installation, artifact.as_ref(), &discover_processes())
}

pub fn uninstall_bridge(
    game_root: impl AsRef<Path>,
) -> Result<BridgeDeploymentOutcome, BridgeDeploymentError> {
    ensure_native_runtime(runtime_sandbox())?;
    let installation = inspect_installation(game_root.as_ref())
        .ok_or(BridgeDeploymentError::InvalidInstallation)?;
    uninstall_bridge_for_installation(&installation, &discover_processes())
}

fn install_bridge_for_installation(
    installation: &FmInstallation,
    artifact: &Path,
    processes: &[FmProcess],
) -> Result<BridgeDeploymentOutcome, BridgeDeploymentError> {
    let profile_id = exact_profile_id(installation)?;
    ensure_game_stopped(processes)?;
    let artifact_fingerprint = validate_artifact(artifact)?;
    let paths = prepare_paths(&installation.root)?;
    ensure_no_transaction_residue(&paths)?;
    let previous = bridge_deployment_status(&installation.root)?;
    let replacing = match previous.state {
        BridgeDeploymentState::NotInstalled => false,
        BridgeDeploymentState::Managed => {
            let manifest = previous
                .manifest
                .as_ref()
                .expect("managed deployment always has a manifest");
            if manifest.profile_id != profile_id {
                return Err(BridgeDeploymentError::ProfileMismatch {
                    installed: manifest.profile_id.clone(),
                    selected: profile_id,
                });
            }
            if manifest.sha256 == artifact_fingerprint.sha256
                && manifest.size == artifact_fingerprint.size
                && manifest.bridge_version == BRIDGE_VERSION
            {
                return Ok(BridgeDeploymentOutcome {
                    action: BridgeDeploymentAction::AlreadyInstalled,
                    status: previous,
                });
            }
            true
        }
        state => return Err(BridgeDeploymentError::UnsafeExistingState(state)),
    };

    let manifest = BridgeInstallManifest {
        schema_version: MANIFEST_SCHEMA_VERSION,
        bridge_version: BRIDGE_VERSION.to_owned(),
        profile_id,
        bridge_filename: BRIDGE_FILENAME.to_owned(),
        sha256: artifact_fingerprint.sha256.clone(),
        size: artifact_fingerprint.size,
        installed_at_unix_seconds: unix_seconds(),
    };
    let staged_bridge = paths.transaction_path("bridge.staging");
    let staged_manifest = paths.transaction_path("manifest.staging");
    stage_artifact(artifact, &staged_bridge, &artifact_fingerprint)?;
    if let Err(error) = stage_manifest(&manifest, &staged_manifest) {
        remove_if_present(&staged_bridge);
        remove_if_present(&staged_manifest);
        return Err(error);
    }

    let rollback_bridge = paths.transaction_path("bridge.rollback");
    let rollback_manifest = paths.transaction_path("manifest.rollback");
    if replacing {
        rename(
            &paths.bridge,
            &rollback_bridge,
            "stage existing bridge for rollback",
        )?;
        if let Err(error) = rename(
            &paths.manifest,
            &rollback_manifest,
            "stage existing manifest for rollback",
        ) {
            let _ = fs::rename(&rollback_bridge, &paths.bridge);
            remove_if_present(&staged_bridge);
            remove_if_present(&staged_manifest);
            return Err(error);
        }
    }

    if let Err(error) = rename(&staged_bridge, &paths.bridge, "activate staged bridge") {
        restore_replaced_files(&paths, &rollback_bridge, &rollback_manifest, replacing);
        remove_if_present(&staged_manifest);
        return Err(error);
    }
    if let Err(error) = rename(
        &staged_manifest,
        &paths.manifest,
        "activate staged manifest",
    ) {
        remove_if_present(&paths.bridge);
        restore_replaced_files(&paths, &rollback_bridge, &rollback_manifest, replacing);
        return Err(error);
    }

    if let Err(error) = sync_directory(&paths.plugin_directory) {
        remove_if_present(&paths.bridge);
        remove_if_present(&paths.manifest);
        restore_replaced_files(&paths, &rollback_bridge, &rollback_manifest, replacing);
        let _ = sync_directory(&paths.plugin_directory);
        return Err(error);
    }
    remove_if_present(&rollback_bridge);
    remove_if_present(&rollback_manifest);
    sync_directory(&paths.plugin_directory)?;
    let status = bridge_deployment_status(&installation.root)?;
    Ok(BridgeDeploymentOutcome {
        action: if replacing {
            BridgeDeploymentAction::Updated
        } else {
            BridgeDeploymentAction::Installed
        },
        status,
    })
}

fn uninstall_bridge_for_installation(
    installation: &FmInstallation,
    processes: &[FmProcess],
) -> Result<BridgeDeploymentOutcome, BridgeDeploymentError> {
    let profile_id = exact_profile_id(installation)?;
    ensure_game_stopped(processes)?;
    let paths = status_paths(&installation.root)?;
    ensure_no_transaction_residue(&paths)?;
    let previous = bridge_deployment_status(&installation.root)?;
    if previous.state == BridgeDeploymentState::NotInstalled {
        return Ok(BridgeDeploymentOutcome {
            action: BridgeDeploymentAction::AlreadyAbsent,
            status: previous,
        });
    }
    if previous.state != BridgeDeploymentState::Managed {
        return Err(BridgeDeploymentError::UnsafeExistingState(previous.state));
    }
    let manifest = previous
        .manifest
        .as_ref()
        .expect("managed deployment always has a manifest");
    if manifest.profile_id != profile_id {
        return Err(BridgeDeploymentError::ProfileMismatch {
            installed: manifest.profile_id.clone(),
            selected: profile_id,
        });
    }

    let removed_bridge = paths.transaction_path("bridge.removed");
    let removed_manifest = paths.transaction_path("manifest.removed");
    rename(&paths.bridge, &removed_bridge, "disable managed bridge")?;
    if let Err(error) = rename(
        &paths.manifest,
        &removed_manifest,
        "disable managed manifest",
    ) {
        let _ = fs::rename(&removed_bridge, &paths.bridge);
        return Err(error);
    }
    if let Err(error) = sync_directory(&paths.plugin_directory) {
        let _ = fs::rename(&removed_bridge, &paths.bridge);
        let _ = fs::rename(&removed_manifest, &paths.manifest);
        let _ = sync_directory(&paths.plugin_directory);
        return Err(error);
    }
    remove(&removed_bridge, "remove disabled bridge")?;
    remove(&removed_manifest, "remove disabled manifest")?;
    let _ = fs::remove_dir(&paths.plugin_directory);

    Ok(BridgeDeploymentOutcome {
        action: BridgeDeploymentAction::Removed,
        status: bridge_deployment_status(&installation.root)?,
    })
}

fn exact_profile_id(installation: &FmInstallation) -> Result<String, BridgeDeploymentError> {
    installation
        .compatibility
        .as_ref()
        .filter(|report| report.status == CompatibilityStatus::Exact)
        .and_then(|report| report.profile_id.clone())
        .ok_or(BridgeDeploymentError::UnsupportedBuild)
}

fn ensure_game_stopped(processes: &[FmProcess]) -> Result<(), BridgeDeploymentError> {
    if processes.is_empty() {
        return Ok(());
    }
    Err(BridgeDeploymentError::GameRunning(
        processes.iter().map(|process| process.pid).collect(),
    ))
}

fn ensure_native_runtime(sandbox: RuntimeSandbox) -> Result<(), BridgeDeploymentError> {
    match sandbox {
        RuntimeSandbox::None => Ok(()),
        RuntimeSandbox::Flatpak => Err(BridgeDeploymentError::SandboxedRuntime),
    }
}

fn validate_artifact(path: &Path) -> Result<ExecutableFingerprint, BridgeDeploymentError> {
    if path.file_name().and_then(|name| name.to_str()) != Some(BRIDGE_FILENAME) {
        return Err(BridgeDeploymentError::InvalidArtifact);
    }
    let metadata = fs::symlink_metadata(path).map_err(|source| BridgeDeploymentError::Io {
        action: "inspect bridge artifact",
        path: path.to_owned(),
        source,
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(BridgeDeploymentError::InvalidArtifact);
    }
    if metadata.len() == 0 || metadata.len() > MAXIMUM_BRIDGE_BYTES {
        return Err(BridgeDeploymentError::InvalidArtifactFormat);
    }
    let mut magic = [0_u8; 2];
    File::open(path)
        .and_then(|mut file| file.read_exact(&mut magic))
        .map_err(|source| BridgeDeploymentError::Io {
            action: "read bridge artifact signature",
            path: path.to_owned(),
            source,
        })?;
    if magic != *b"MZ" {
        return Err(BridgeDeploymentError::InvalidArtifactFormat);
    }
    Ok(fingerprint_file(path)?)
}

fn prepare_paths(game_root: &Path) -> Result<DeploymentPaths, BridgeDeploymentError> {
    let canonical_root =
        fs::canonicalize(game_root).map_err(|source| BridgeDeploymentError::Io {
            action: "resolve FM26 installation",
            path: game_root.to_owned(),
            source,
        })?;
    let paths = DeploymentPaths::new(&canonical_root);
    fs::create_dir_all(&paths.plugin_directory).map_err(|source| BridgeDeploymentError::Io {
        action: "create BestScout plugin directory",
        path: paths.plugin_directory.clone(),
        source,
    })?;
    let canonical_plugin =
        fs::canonicalize(&paths.plugin_directory).map_err(|source| BridgeDeploymentError::Io {
            action: "resolve BestScout plugin directory",
            path: paths.plugin_directory.clone(),
            source,
        })?;
    if !canonical_plugin.starts_with(&canonical_root) {
        return Err(BridgeDeploymentError::EscapingPluginDirectory);
    }
    Ok(DeploymentPaths::new(&canonical_root))
}

fn status_paths(game_root: &Path) -> Result<DeploymentPaths, BridgeDeploymentError> {
    let canonical_root =
        fs::canonicalize(game_root).map_err(|source| BridgeDeploymentError::Io {
            action: "resolve FM26 installation",
            path: game_root.to_owned(),
            source,
        })?;
    let paths = DeploymentPaths::new(&canonical_root);
    match fs::canonicalize(&paths.plugin_directory) {
        Ok(canonical_plugin) if !canonical_plugin.starts_with(&canonical_root) => {
            Err(BridgeDeploymentError::EscapingPluginDirectory)
        }
        Ok(_) => Ok(paths),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(paths),
        Err(source) => Err(BridgeDeploymentError::Io {
            action: "resolve BestScout plugin directory",
            path: paths.plugin_directory,
            source,
        }),
    }
}

fn ensure_no_transaction_residue(paths: &DeploymentPaths) -> Result<(), BridgeDeploymentError> {
    if has_transaction_residue(paths)? {
        return Err(BridgeDeploymentError::TransactionResidue);
    }
    Ok(())
}

fn has_transaction_residue(paths: &DeploymentPaths) -> Result<bool, BridgeDeploymentError> {
    let entries = match fs::read_dir(&paths.plugin_directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
        Err(source) => {
            return Err(BridgeDeploymentError::Io {
                action: "inspect BestScout plugin directory",
                path: paths.plugin_directory.clone(),
                source,
            });
        }
    };
    for entry in entries {
        let entry = entry.map_err(|source| BridgeDeploymentError::Io {
            action: "read BestScout plugin directory entry",
            path: paths.plugin_directory.clone(),
            source,
        })?;
        if entry
            .file_name()
            .to_str()
            .is_some_and(|name| name.starts_with(".bestscout-transaction-"))
        {
            return Ok(true);
        }
    }
    Ok(false)
}

fn optional_metadata(path: &Path) -> Result<Option<fs::Metadata>, BridgeDeploymentError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => Ok(Some(metadata)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(source) => Err(BridgeDeploymentError::Io {
            action: "inspect deployment file",
            path: path.to_owned(),
            source,
        }),
    }
}

fn regular_fingerprint(
    path: &Path,
    metadata: &fs::Metadata,
) -> Result<Option<ExecutableFingerprint>, BridgeDeploymentError> {
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Ok(None);
    }
    Ok(Some(fingerprint_file(path)?))
}

fn read_manifest(path: &Path) -> Result<BridgeInstallManifest, BridgeDeploymentError> {
    let metadata = fs::symlink_metadata(path).map_err(|source| BridgeDeploymentError::Io {
        action: "inspect bridge install manifest",
        path: path.to_owned(),
        source,
    })?;
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() > MAXIMUM_MANIFEST_BYTES
    {
        return Err(BridgeDeploymentError::Io {
            action: "validate bridge install manifest",
            path: path.to_owned(),
            source: io::Error::new(
                io::ErrorKind::InvalidData,
                "manifest must be a bounded regular file",
            ),
        });
    }
    let bytes = fs::read(path).map_err(|source| BridgeDeploymentError::Io {
        action: "read bridge install manifest",
        path: path.to_owned(),
        source,
    })?;
    serde_json::from_slice(&bytes).map_err(BridgeDeploymentError::ManifestJson)
}

fn validate_manifest(manifest: &BridgeInstallManifest) -> bool {
    manifest.schema_version == MANIFEST_SCHEMA_VERSION
        && manifest.bridge_filename == BRIDGE_FILENAME
        && !manifest.bridge_version.is_empty()
        && manifest.bridge_version.len() <= 64
        && !manifest.profile_id.is_empty()
        && manifest.profile_id.len() <= 128
        && manifest.sha256.len() == 64
        && manifest.sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
        && manifest.size > 0
        && manifest.size <= MAXIMUM_BRIDGE_BYTES
        && manifest.installed_at_unix_seconds > 0
}

fn stage_artifact(
    source: &Path,
    destination: &Path,
    expected: &ExecutableFingerprint,
) -> Result<(), BridgeDeploymentError> {
    let mut source_file = File::open(source).map_err(|error| BridgeDeploymentError::Io {
        action: "open bridge artifact for staging",
        path: source.to_owned(),
        source: error,
    })?;
    let mut destination_file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(destination)
        .map_err(|source| BridgeDeploymentError::Io {
            action: "create staged bridge artifact",
            path: destination.to_owned(),
            source,
        })?;
    if let Err(source) = io::copy(&mut source_file, &mut destination_file) {
        drop(destination_file);
        remove_if_present(destination);
        return Err(BridgeDeploymentError::Io {
            action: "stage bridge artifact",
            path: destination.to_owned(),
            source,
        });
    }
    if let Err(source) = destination_file.sync_all() {
        drop(destination_file);
        remove_if_present(destination);
        return Err(BridgeDeploymentError::Io {
            action: "sync staged bridge artifact",
            path: destination.to_owned(),
            source,
        });
    }
    drop(destination_file);
    let staged = match fingerprint_file(destination) {
        Ok(fingerprint) => fingerprint,
        Err(error) => {
            remove_if_present(destination);
            return Err(error.into());
        }
    };
    if &staged != expected {
        remove_if_present(destination);
        return Err(BridgeDeploymentError::InvalidArtifactFormat);
    }
    Ok(())
}

fn stage_manifest(
    manifest: &BridgeInstallManifest,
    destination: &Path,
) -> Result<(), BridgeDeploymentError> {
    let mut bytes = serde_json::to_vec_pretty(manifest)?;
    bytes.push(b'\n');
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(destination)
        .map_err(|source| BridgeDeploymentError::Io {
            action: "create staged bridge manifest",
            path: destination.to_owned(),
            source,
        })?;
    if let Err(source) = file.write_all(&bytes).and_then(|_| file.sync_all()) {
        drop(file);
        remove_if_present(destination);
        return Err(BridgeDeploymentError::Io {
            action: "write staged bridge manifest",
            path: destination.to_owned(),
            source,
        });
    }
    Ok(())
}

fn rename(
    source: &Path,
    destination: &Path,
    action: &'static str,
) -> Result<(), BridgeDeploymentError> {
    fs::rename(source, destination).map_err(|source| BridgeDeploymentError::Io {
        action,
        path: destination.to_owned(),
        source,
    })
}

fn remove(path: &Path, action: &'static str) -> Result<(), BridgeDeploymentError> {
    fs::remove_file(path).map_err(|source| BridgeDeploymentError::Io {
        action,
        path: path.to_owned(),
        source,
    })
}

fn remove_if_present(path: &Path) {
    if path.is_file() {
        let _ = fs::remove_file(path);
    }
}

fn restore_replaced_files(
    paths: &DeploymentPaths,
    rollback_bridge: &Path,
    rollback_manifest: &Path,
    replacing: bool,
) {
    if replacing {
        let _ = fs::rename(rollback_bridge, &paths.bridge);
        let _ = fs::rename(rollback_manifest, &paths.manifest);
    }
}

fn sync_directory(path: &Path) -> Result<(), BridgeDeploymentError> {
    File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|source| BridgeDeploymentError::Io {
            action: "sync BestScout plugin directory",
            path: path.to_owned(),
            source,
        })
}

fn unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .max(1)
}

#[derive(Debug)]
struct DeploymentPaths {
    plugin_directory: PathBuf,
    bridge: PathBuf,
    manifest: PathBuf,
}

impl DeploymentPaths {
    fn new(game_root: &Path) -> Self {
        let plugin_directory = game_root.join("BepInEx/plugins/BestScout");
        Self {
            bridge: plugin_directory.join(BRIDGE_FILENAME),
            manifest: plugin_directory.join(MANIFEST_FILENAME),
            plugin_directory,
        }
    }

    fn transaction_path(&self, purpose: &str) -> PathBuf {
        self.plugin_directory.join(format!(
            ".bestscout-transaction-{}-{purpose}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ))
    }

    fn status(
        &self,
        state: BridgeDeploymentState,
        manifest: Option<BridgeInstallManifest>,
        observed_artifact: Option<ExecutableFingerprint>,
        reason: impl Into<String>,
    ) -> BridgeDeploymentStatus {
        BridgeDeploymentStatus {
            state,
            plugin_directory: self.plugin_directory.clone(),
            bridge_path: self.bridge.clone(),
            manifest_path: self.manifest.clone(),
            manifest,
            observed_artifact,
            reason: reason.into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Capabilities, CompatibilityReport};

    fn temporary_root(label: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("bestscout-{label}-{unique}"));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn installation(root: &Path) -> FmInstallation {
        FmInstallation {
            root: root.to_owned(),
            executable: root.join("fm.exe"),
            game_assembly: root.join("GameAssembly.dll"),
            global_metadata: root.join("global-metadata.dat"),
            steam_build_id: Some("test".to_owned()),
            build_fingerprint: None,
            compatibility: Some(CompatibilityReport {
                status: CompatibilityStatus::Exact,
                profile_id: Some("test-profile".to_owned()),
                label: Some("Test profile".to_owned()),
                capabilities: Capabilities {
                    process_inspection: true,
                    domain_read: false,
                    domain_write: false,
                },
                reason: "test".to_owned(),
            }),
        }
    }

    fn artifact(root: &Path, bytes: &[u8]) -> PathBuf {
        let artifact = root.join(BRIDGE_FILENAME);
        fs::write(&artifact, bytes).unwrap();
        artifact
    }

    #[test]
    fn deployment_manifest_version_matches_the_bridge_plugin() {
        let plugin_source = include_str!("../../../bridge/BestScout.Bridge/Plugin.cs");
        assert!(plugin_source.contains(&format!("PluginVersion = \"{BRIDGE_VERSION}\"")));
    }

    #[test]
    fn flatpak_runtime_can_never_mutate_host_plugins() {
        assert!(matches!(
            ensure_native_runtime(RuntimeSandbox::Flatpak),
            Err(BridgeDeploymentError::SandboxedRuntime)
        ));
    }

    #[test]
    fn installs_idempotently_and_removes_only_a_verified_bridge() {
        let root = temporary_root("bridge-lifecycle");
        let source_root = temporary_root("bridge-artifact");
        let artifact = artifact(&source_root, b"MZBestScout bridge fixture");
        let installation = installation(&root);

        let installed = install_bridge_for_installation(&installation, &artifact, &[]).unwrap();
        assert_eq!(installed.action, BridgeDeploymentAction::Installed);
        assert_eq!(installed.status.state, BridgeDeploymentState::Managed);

        let unchanged = install_bridge_for_installation(&installation, &artifact, &[]).unwrap();
        assert_eq!(unchanged.action, BridgeDeploymentAction::AlreadyInstalled);

        fs::write(&artifact, b"MZBestScout bridge fixture v2").unwrap();
        let updated = install_bridge_for_installation(&installation, &artifact, &[]).unwrap();
        assert_eq!(updated.action, BridgeDeploymentAction::Updated);
        assert_eq!(updated.status.state, BridgeDeploymentState::Managed);

        let removed = uninstall_bridge_for_installation(&installation, &[]).unwrap();
        assert_eq!(removed.action, BridgeDeploymentAction::Removed);
        assert_eq!(removed.status.state, BridgeDeploymentState::NotInstalled);

        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(source_root).unwrap();
    }

    #[test]
    fn refuses_to_change_plugins_while_the_game_is_running() {
        let root = temporary_root("bridge-running");
        let source_root = temporary_root("bridge-running-artifact");
        let artifact = artifact(&source_root, b"MZBestScout bridge fixture");
        let process = FmProcess {
            pid: 42,
            command: "fm.exe".to_owned(),
        };

        let result = install_bridge_for_installation(&installation(&root), &artifact, &[process]);
        assert!(matches!(
            result,
            Err(BridgeDeploymentError::GameRunning(pids)) if pids == vec![42]
        ));
        assert_eq!(
            bridge_deployment_status(&root).unwrap().state,
            BridgeDeploymentState::NotInstalled
        );

        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(source_root).unwrap();
    }

    #[test]
    fn refuses_unmanaged_and_modified_bridge_files() {
        let root = temporary_root("bridge-integrity");
        let source_root = temporary_root("bridge-integrity-artifact");
        let artifact = artifact(&source_root, b"MZBestScout bridge fixture");
        let installation = installation(&root);
        let paths = prepare_paths(&root).unwrap();
        fs::write(&paths.bridge, b"MZunmanaged").unwrap();

        let result = install_bridge_for_installation(&installation, &artifact, &[]);
        assert!(matches!(
            result,
            Err(BridgeDeploymentError::UnsafeExistingState(
                BridgeDeploymentState::UnmanagedFile
            ))
        ));

        fs::remove_file(&paths.bridge).unwrap();
        install_bridge_for_installation(&installation, &artifact, &[]).unwrap();
        fs::write(&paths.bridge, b"MZmodified").unwrap();
        let result = uninstall_bridge_for_installation(&installation, &[]);
        assert!(matches!(
            result,
            Err(BridgeDeploymentError::UnsafeExistingState(
                BridgeDeploymentState::Modified
            ))
        ));

        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(source_root).unwrap();
    }

    #[test]
    fn rejects_a_non_pe_artifact_before_creating_a_plugin_directory() {
        let root = temporary_root("bridge-format");
        let source_root = temporary_root("bridge-format-artifact");
        let artifact = artifact(&source_root, b"not a PE file");

        let result = install_bridge_for_installation(&installation(&root), &artifact, &[]);
        assert!(matches!(
            result,
            Err(BridgeDeploymentError::InvalidArtifactFormat)
        ));
        assert!(!root.join("BepInEx/plugins/BestScout").exists());

        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(source_root).unwrap();
    }

    #[test]
    fn reports_and_refuses_transaction_residue() {
        let root = temporary_root("bridge-residue");
        let source_root = temporary_root("bridge-residue-artifact");
        let artifact = artifact(&source_root, b"MZBestScout bridge fixture");
        let paths = prepare_paths(&root).unwrap();
        fs::write(
            paths
                .plugin_directory
                .join(".bestscout-transaction-interrupted-bridge.staging"),
            b"partial",
        )
        .unwrap();

        assert_eq!(
            bridge_deployment_status(&root).unwrap().state,
            BridgeDeploymentState::TransactionResidue
        );
        assert!(matches!(
            install_bridge_for_installation(&installation(&root), &artifact, &[]),
            Err(BridgeDeploymentError::TransactionResidue)
        ));

        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(source_root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn never_follows_a_manifest_symlink() {
        use std::os::unix::fs::symlink;

        let root = temporary_root("bridge-manifest-symlink");
        let paths = prepare_paths(&root).unwrap();
        fs::write(&paths.bridge, b"MZBestScout bridge fixture").unwrap();
        symlink("/etc/passwd", &paths.manifest).unwrap();

        let status = bridge_deployment_status(&root).unwrap();
        assert_eq!(status.state, BridgeDeploymentState::InvalidManifest);
        assert!(status.manifest.is_none());

        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_plugin_directory_that_escapes_the_game_root() {
        use std::os::unix::fs::symlink;

        let root = temporary_root("bridge-escaping-directory");
        let outside = temporary_root("bridge-outside-directory");
        fs::create_dir_all(root.join("BepInEx/plugins")).unwrap();
        symlink(&outside, root.join("BepInEx/plugins/BestScout")).unwrap();

        assert!(matches!(
            bridge_deployment_status(&root),
            Err(BridgeDeploymentError::EscapingPluginDirectory)
        ));

        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(outside).unwrap();
    }
}
