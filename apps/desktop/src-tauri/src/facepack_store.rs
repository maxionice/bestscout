use std::collections::HashSet;
use std::ffi::CString;
use std::fs::{self, File, OpenOptions};
use std::io::{Cursor, Read, Write};
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};

use bestscout_core::{
    DatabaseSnapshot, FACEPACK_SCHEMA_VERSION, FacepackImage, FacepackPlan, FacepackRequest,
    plan_facepack, render_facepack_config,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

const MANIFEST_NAME: &str = ".bestscout-facepack.json";
const CONFIG_NAME: &str = "config.xml";
const MAX_MANIFEST_BYTES: u64 = 1024 * 1024;
const MAX_IMAGE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_IMAGE_COUNT: usize = 10_000;
const MAX_TOTAL_IMAGE_BYTES: u64 = 8 * 1024 * 1024 * 1024;
const MAX_IMAGE_DIMENSION: u32 = 4_096;
const MAX_IMAGE_PIXELS: u64 = 16_777_216;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FacepackFilesystemRequest {
    pub source_directory: PathBuf,
    pub destination_root: PathBuf,
    pub plan: FacepackRequest,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FacepackPreview {
    pub plan: FacepackPlan,
    pub source_directory: PathBuf,
    pub target_directory: PathBuf,
    pub config_xml: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InstalledFacepack {
    pub target_directory: PathBuf,
    pub plan_hash: String,
    pub assignment_count: usize,
    pub file_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RemovedFacepack {
    pub target_directory: PathBuf,
    pub removed_file_count: usize,
}

#[derive(Debug, Error)]
pub enum FacepackStoreError {
    #[error("{kind} directory is missing, symbolic, or not a directory: {path}")]
    InvalidDirectory { kind: &'static str, path: String },
    #[error("source and destination directories must not overlap")]
    OverlappingDirectories,
    #[error("facepack target already exists: {0}")]
    TargetExists(String),
    #[error("facepack target does not exist: {0}")]
    TargetMissing(String),
    #[error("facepack transaction residue already exists: {0}")]
    TransactionResidue(String),
    #[error(
        "face image is symbolic, irregular, too large, too small or has an invalid signature: {0}"
    )]
    InvalidImage(String),
    #[error("face image changed after preview: {0}")]
    ImageChanged(String),
    #[error("facepack preview is stale or was modified")]
    StalePreview,
    #[error("facepack manifest is missing, invalid or too large")]
    InvalidManifest,
    #[error("managed facepack contains an unexpected or modified file: {0}")]
    ModifiedPack(String),
    #[error("facepack input/output error while {action}: {source}")]
    Io {
        action: &'static str,
        #[source]
        source: std::io::Error,
    },
    #[error("facepack request is invalid: {0}")]
    Plan(String),
    #[error("facepack manifest serialization failed: {0}")]
    Serialization(#[from] serde_json::Error),
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct FacepackManifest {
    schema_version: u16,
    pack_id: String,
    plan_hash: String,
    config_sha256: String,
    files: Vec<ManagedFaceFile>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ManagedFaceFile {
    name: String,
    bytes: u64,
    sha256: String,
    target_id: String,
}

pub fn preview_facepack(
    snapshot: &DatabaseSnapshot,
    request: &FacepackFilesystemRequest,
) -> Result<FacepackPreview, FacepackStoreError> {
    let source_directory = canonical_directory(&request.source_directory, "source")?;
    let destination_root = canonical_directory(&request.destination_root, "destination")?;
    if source_directory.starts_with(&destination_root)
        || destination_root.starts_with(&source_directory)
    {
        return Err(FacepackStoreError::OverlappingDirectories);
    }
    let images = scan_images(&source_directory)?;
    let plan = plan_facepack(&snapshot.players, &images, &request.plan)
        .map_err(|error| FacepackStoreError::Plan(error.to_string()))?;
    let target_directory = destination_root.join(&plan.pack_id);
    if fs::symlink_metadata(&target_directory).is_ok() {
        return Err(FacepackStoreError::TargetExists(
            target_directory.display().to_string(),
        ));
    }
    let config_xml = render_facepack_config(&plan);
    Ok(FacepackPreview {
        plan,
        source_directory,
        target_directory,
        config_xml,
    })
}

pub fn install_facepack(
    snapshot: &DatabaseSnapshot,
    request: &FacepackFilesystemRequest,
    expected_plan_hash: &str,
) -> Result<InstalledFacepack, FacepackStoreError> {
    let preview = preview_facepack(snapshot, request)?;
    if preview.plan.plan_hash != expected_plan_hash {
        return Err(FacepackStoreError::StalePreview);
    }
    let destination_root = preview
        .target_directory
        .parent()
        .expect("facepack target has a parent");
    let transaction = destination_root.join(format!(
        ".bestscout-facepack-{}-{}.staging",
        preview.plan.pack_id,
        &preview.plan.plan_hash[..12]
    ));
    if fs::symlink_metadata(&transaction).is_ok() {
        return Err(FacepackStoreError::TransactionResidue(
            transaction.display().to_string(),
        ));
    }
    fs::create_dir(&transaction).map_err(|source| FacepackStoreError::Io {
        action: "create staging directory",
        source,
    })?;
    fs::set_permissions(&transaction, fs::Permissions::from_mode(0o700)).map_err(|source| {
        FacepackStoreError::Io {
            action: "protect staging directory",
            source,
        }
    })?;

    let result = stage_facepack(&preview, &transaction).and_then(|manifest| {
        verify_managed_directory(&transaction, &manifest)?;
        sync_directory(&transaction)?;
        rename_noreplace(
            &transaction,
            &preview.target_directory,
            "activate staged facepack",
        )?;
        if let Err(error) = sync_directory(destination_root) {
            if rename_noreplace(
                &preview.target_directory,
                &transaction,
                "roll back unsynced facepack activation",
            )
            .is_ok()
            {
                let _ = sync_directory(destination_root);
            }
            return Err(error);
        }
        Ok(InstalledFacepack {
            target_directory: preview.target_directory.clone(),
            plan_hash: preview.plan.plan_hash.clone(),
            assignment_count: preview.plan.assignments.len(),
            file_count: manifest.files.len() + 2,
        })
    });
    if result.is_err() {
        cleanup_controlled_directory(&transaction);
    }
    result
}

pub fn remove_facepack(
    destination_root: &Path,
    pack_id: &str,
) -> Result<RemovedFacepack, FacepackStoreError> {
    if !valid_pack_id(pack_id) {
        return Err(FacepackStoreError::Plan("invalid pack id".into()));
    }
    let destination_root = canonical_directory(destination_root, "destination")?;
    let target = destination_root.join(pack_id);
    let metadata = fs::symlink_metadata(&target)
        .map_err(|_| FacepackStoreError::TargetMissing(target.display().to_string()))?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(FacepackStoreError::InvalidManifest);
    }
    let manifest_path = target.join(MANIFEST_NAME);
    let manifest_bytes = read_regular_bounded(&manifest_path, MAX_MANIFEST_BYTES)
        .map_err(|_| FacepackStoreError::InvalidManifest)?;
    let manifest: FacepackManifest =
        serde_json::from_slice(&manifest_bytes).map_err(|_| FacepackStoreError::InvalidManifest)?;
    validate_manifest(&manifest, pack_id)?;
    verify_managed_directory(&target, &manifest)?;

    let removal = destination_root.join(format!(
        ".bestscout-facepack-{}-{}.removing",
        pack_id,
        &manifest.plan_hash[..12]
    ));
    if fs::symlink_metadata(&removal).is_ok() {
        return Err(FacepackStoreError::TransactionResidue(
            removal.display().to_string(),
        ));
    }
    rename_noreplace(&target, &removal, "deactivate managed facepack")?;
    if let Err(error) = sync_directory(&destination_root) {
        if rename_noreplace(&removal, &target, "roll back unsynced facepack removal").is_ok() {
            let _ = sync_directory(&destination_root);
        }
        return Err(error);
    }
    let hidden_manifest = read_regular_bounded(&removal.join(MANIFEST_NAME), MAX_MANIFEST_BYTES);
    let hidden_verified = hidden_manifest
        .as_ref()
        .is_ok_and(|bytes| bytes == &manifest_bytes)
        && verify_managed_directory(&removal, &manifest).is_ok();
    if !hidden_verified {
        if rename_noreplace(&removal, &target, "restore changed facepack").is_ok() {
            let _ = sync_directory(&destination_root);
        }
        return Err(FacepackStoreError::ModifiedPack(
            target.display().to_string(),
        ));
    }
    let removed_file_count = manifest.files.len() + 2;
    fs::remove_dir_all(&removal).map_err(|source| FacepackStoreError::Io {
        action: "remove verified facepack",
        source,
    })?;
    sync_directory(&destination_root)?;
    Ok(RemovedFacepack {
        target_directory: target,
        removed_file_count,
    })
}

fn stage_facepack(
    preview: &FacepackPreview,
    transaction: &Path,
) -> Result<FacepackManifest, FacepackStoreError> {
    let mut files = Vec::with_capacity(preview.plan.assignments.len());
    for assignment in &preview.plan.assignments {
        let source = preview.source_directory.join(&assignment.source_name);
        let bytes = read_valid_image(&source, &assignment.source_name)?;
        let sha256 = hash_bytes(&bytes);
        if sha256 != assignment.source_sha256 {
            return Err(FacepackStoreError::ImageChanged(
                assignment.source_name.clone(),
            ));
        }
        write_new_file(
            &transaction.join(&assignment.output_filename),
            &bytes,
            0o644,
        )?;
        files.push(ManagedFaceFile {
            name: assignment.output_filename.clone(),
            bytes: bytes.len() as u64,
            sha256,
            target_id: assignment.target_id.clone(),
        });
    }
    write_new_file(
        &transaction.join(CONFIG_NAME),
        preview.config_xml.as_bytes(),
        0o644,
    )?;
    let manifest = FacepackManifest {
        schema_version: FACEPACK_SCHEMA_VERSION,
        pack_id: preview.plan.pack_id.clone(),
        plan_hash: preview.plan.plan_hash.clone(),
        config_sha256: hash_bytes(preview.config_xml.as_bytes()),
        files,
    };
    let manifest_bytes = serde_json::to_vec_pretty(&manifest)?;
    write_new_file(&transaction.join(MANIFEST_NAME), &manifest_bytes, 0o600)?;
    Ok(manifest)
}

fn canonical_directory(path: &Path, kind: &'static str) -> Result<PathBuf, FacepackStoreError> {
    let metadata =
        fs::symlink_metadata(path).map_err(|_| FacepackStoreError::InvalidDirectory {
            kind,
            path: path.display().to_string(),
        })?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(FacepackStoreError::InvalidDirectory {
            kind,
            path: path.display().to_string(),
        });
    }
    fs::canonicalize(path).map_err(|source| FacepackStoreError::Io {
        action: "resolve directory",
        source,
    })
}

fn scan_images(directory: &Path) -> Result<Vec<FacepackImage>, FacepackStoreError> {
    let entries = fs::read_dir(directory).map_err(|source| FacepackStoreError::Io {
        action: "scan source directory",
        source,
    })?;
    let mut images = Vec::new();
    let mut total_bytes = 0_u64;
    for entry in entries {
        let entry = entry.map_err(|source| FacepackStoreError::Io {
            action: "read source entry",
            source,
        })?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let extension = Path::new(&name)
            .extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase);
        if !matches!(extension.as_deref(), Some("png" | "jpg" | "jpeg")) {
            continue;
        }
        if images.len() >= MAX_IMAGE_COUNT {
            return Err(FacepackStoreError::InvalidImage(format!(
                "more than {MAX_IMAGE_COUNT} supported files"
            )));
        }
        let bytes = read_valid_image(&entry.path(), &name)?;
        total_bytes = total_bytes
            .checked_add(bytes.len() as u64)
            .ok_or_else(|| FacepackStoreError::InvalidImage("total image size overflow".into()))?;
        if total_bytes > MAX_TOTAL_IMAGE_BYTES {
            return Err(FacepackStoreError::InvalidImage(
                "total image size exceeds 8 GiB".into(),
            ));
        }
        images.push(FacepackImage {
            source_name: name,
            extension: extension.expect("supported extension exists"),
            bytes: bytes.len() as u64,
            sha256: hash_bytes(&bytes),
        });
    }
    Ok(images)
}

fn read_valid_image(path: &Path, name: &str) -> Result<Vec<u8>, FacepackStoreError> {
    let metadata_before = fs::symlink_metadata(path)
        .map_err(|_| FacepackStoreError::InvalidImage(name.to_owned()))?;
    if !metadata_before.is_file()
        || metadata_before.file_type().is_symlink()
        || metadata_before.len() < 1_024
        || metadata_before.len() > MAX_IMAGE_BYTES
    {
        return Err(FacepackStoreError::InvalidImage(name.to_owned()));
    }
    let file = File::open(path).map_err(|_| FacepackStoreError::InvalidImage(name.to_owned()))?;
    let metadata_after = file
        .metadata()
        .map_err(|_| FacepackStoreError::InvalidImage(name.to_owned()))?;
    if !metadata_after.is_file()
        || metadata_before.dev() != metadata_after.dev()
        || metadata_before.ino() != metadata_after.ino()
        || metadata_before.len() != metadata_after.len()
    {
        return Err(FacepackStoreError::InvalidImage(name.to_owned()));
    }
    let mut bytes = Vec::with_capacity(metadata_after.len() as usize);
    file.take(MAX_IMAGE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| FacepackStoreError::InvalidImage(name.to_owned()))?;
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let format = match extension.as_str() {
        "png" if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => image::ImageFormat::Png,
        "jpg" | "jpeg"
            if bytes.starts_with(&[0xff, 0xd8, 0xff]) && bytes.ends_with(&[0xff, 0xd9]) =>
        {
            image::ImageFormat::Jpeg
        }
        _ => return Err(FacepackStoreError::InvalidImage(name.to_owned())),
    };
    if bytes.len() as u64 != metadata_after.len() {
        return Err(FacepackStoreError::InvalidImage(name.to_owned()));
    }
    let dimensions = image::ImageReader::with_format(Cursor::new(&bytes), format)
        .into_dimensions()
        .map_err(|_| FacepackStoreError::InvalidImage(name.to_owned()))?;
    if dimensions.0 == 0
        || dimensions.1 == 0
        || dimensions.0 > MAX_IMAGE_DIMENSION
        || dimensions.1 > MAX_IMAGE_DIMENSION
        || u64::from(dimensions.0) * u64::from(dimensions.1) > MAX_IMAGE_PIXELS
    {
        return Err(FacepackStoreError::InvalidImage(name.to_owned()));
    }
    image::ImageReader::with_format(Cursor::new(&bytes), format)
        .decode()
        .map_err(|_| FacepackStoreError::InvalidImage(name.to_owned()))?;
    Ok(bytes)
}

fn write_new_file(path: &Path, contents: &[u8], mode: u32) -> Result<(), FacepackStoreError> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(mode)
        .open(path)
        .map_err(|source| FacepackStoreError::Io {
            action: "create managed facepack file",
            source,
        })?;
    file.write_all(contents)
        .and_then(|_| file.sync_all())
        .map_err(|source| FacepackStoreError::Io {
            action: "write managed facepack file",
            source,
        })
}

fn read_regular_bounded(path: &Path, maximum: u64) -> Result<Vec<u8>, FacepackStoreError> {
    let metadata = fs::symlink_metadata(path).map_err(|source| FacepackStoreError::Io {
        action: "inspect managed facepack file",
        source,
    })?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > maximum {
        return Err(FacepackStoreError::ModifiedPack(path.display().to_string()));
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    File::open(path)
        .and_then(|file| file.take(maximum + 1).read_to_end(&mut bytes))
        .map_err(|source| FacepackStoreError::Io {
            action: "read managed facepack file",
            source,
        })?;
    if bytes.len() as u64 != metadata.len() {
        return Err(FacepackStoreError::ModifiedPack(path.display().to_string()));
    }
    Ok(bytes)
}

fn validate_manifest(
    manifest: &FacepackManifest,
    expected_pack_id: &str,
) -> Result<(), FacepackStoreError> {
    if manifest.schema_version != FACEPACK_SCHEMA_VERSION
        || manifest.pack_id != expected_pack_id
        || !valid_hash(&manifest.plan_hash)
        || !valid_hash(&manifest.config_sha256)
        || manifest.files.is_empty()
        || manifest.files.len() > 10_000
    {
        return Err(FacepackStoreError::InvalidManifest);
    }
    let mut names = HashSet::new();
    let mut targets = HashSet::new();
    let mut total_bytes = 0_u64;
    for file in &manifest.files {
        let filename_uid = managed_filename_uid(&file.name);
        let target_uid = target_uid(&file.target_id);
        if !valid_managed_filename(&file.name)
            || !names.insert(file.name.as_str())
            || file.bytes < 1_024
            || file.bytes > MAX_IMAGE_BYTES
            || !valid_hash(&file.sha256)
            || !valid_target_id(&file.target_id)
            || filename_uid != target_uid
            || !targets.insert(file.target_id.as_str())
        {
            return Err(FacepackStoreError::InvalidManifest);
        }
        total_bytes = total_bytes
            .checked_add(file.bytes)
            .ok_or(FacepackStoreError::InvalidManifest)?;
        if total_bytes > MAX_TOTAL_IMAGE_BYTES {
            return Err(FacepackStoreError::InvalidManifest);
        }
    }
    Ok(())
}

fn verify_managed_directory(
    target: &Path,
    manifest: &FacepackManifest,
) -> Result<(), FacepackStoreError> {
    let mut expected: HashSet<String> = manifest
        .files
        .iter()
        .map(|file| file.name.clone())
        .collect();
    expected.insert(CONFIG_NAME.into());
    expected.insert(MANIFEST_NAME.into());
    let actual = fs::read_dir(target)
        .map_err(|source| FacepackStoreError::Io {
            action: "scan managed facepack",
            source,
        })?
        .map(|entry| {
            entry
                .map(|entry| entry.file_name().to_string_lossy().into_owned())
                .map_err(|source| FacepackStoreError::Io {
                    action: "read managed facepack entry",
                    source,
                })
        })
        .collect::<Result<HashSet<_>, _>>()?;
    if actual != expected {
        return Err(FacepackStoreError::ModifiedPack(
            target.display().to_string(),
        ));
    }
    for file in &manifest.files {
        let bytes = read_regular_bounded(&target.join(&file.name), MAX_IMAGE_BYTES)?;
        if bytes.len() as u64 != file.bytes || hash_bytes(&bytes) != file.sha256 {
            return Err(FacepackStoreError::ModifiedPack(file.name.clone()));
        }
    }
    let config = read_regular_bounded(&target.join(CONFIG_NAME), MAX_MANIFEST_BYTES)?;
    if hash_bytes(&config) != manifest.config_sha256 {
        return Err(FacepackStoreError::ModifiedPack(CONFIG_NAME.into()));
    }
    Ok(())
}

fn sync_directory(path: &Path) -> Result<(), FacepackStoreError> {
    File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|source| FacepackStoreError::Io {
            action: "sync facepack directory",
            source,
        })
}

fn rename_noreplace(
    source: &Path,
    destination: &Path,
    action: &'static str,
) -> Result<(), FacepackStoreError> {
    let source =
        CString::new(source.as_os_str().as_bytes()).map_err(|_| FacepackStoreError::Io {
            action,
            source: std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "source path contains NUL",
            ),
        })?;
    let destination =
        CString::new(destination.as_os_str().as_bytes()).map_err(|_| FacepackStoreError::Io {
            action,
            source: std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "destination path contains NUL",
            ),
        })?;
    // Linux renameat2 makes the non-overwrite guarantee atomic; falling back to
    // std::fs::rename would reintroduce a target-replacement race.
    let result = unsafe {
        libc::syscall(
            libc::SYS_renameat2,
            libc::AT_FDCWD,
            source.as_ptr(),
            libc::AT_FDCWD,
            destination.as_ptr(),
            libc::RENAME_NOREPLACE,
        )
    };
    if result == 0 {
        Ok(())
    } else {
        Err(FacepackStoreError::Io {
            action,
            source: std::io::Error::last_os_error(),
        })
    }
}

fn cleanup_controlled_directory(path: &Path) {
    if let Ok(metadata) = fs::symlink_metadata(path)
        && metadata.is_dir()
        && !metadata.file_type().is_symlink()
    {
        let _ = fs::remove_dir_all(path);
    }
}

fn hash_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn valid_pack_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"-_".contains(&byte))
}

fn valid_hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn valid_target_id(value: &str) -> bool {
    target_uid(value).is_some()
}

fn valid_managed_filename(value: &str) -> bool {
    managed_filename_uid(value).is_some()
}

fn target_uid(value: &str) -> Option<&str> {
    value.strip_prefix("r-").filter(|digits| {
        !digits.is_empty()
            && digits.len() <= 20
            && !digits.starts_with('0')
            && digits.bytes().all(|byte| byte.is_ascii_digit())
    })
}

fn managed_filename_uid(value: &str) -> Option<&str> {
    let (stem, extension) = value.rsplit_once('.')?;
    matches!(extension, "png" | "jpg" | "jpeg")
        .then_some(())
        .and_then(|()| stem.strip_prefix("bestscout_newgen_"))
        .filter(|digits| {
            !digits.is_empty()
                && digits.len() <= 20
                && !digits.starts_with('0')
                && digits.bytes().all(|byte| byte.is_ascii_digit())
        })
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicU64, Ordering};

    use super::*;
    use bestscout_core::synthetic_snapshot;

    static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(1);

    fn fixture_root() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "bestscout-facepack-store-{}-{}",
            std::process::id(),
            NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        path
    }

    fn png(fill: u8) -> Vec<u8> {
        let image = image::RgbImage::from_fn(128, 128, |x, y| {
            image::Rgb([
                fill.wrapping_add(x as u8),
                fill.wrapping_add(y as u8),
                fill.wrapping_add((x ^ y) as u8),
            ])
        });
        let mut bytes = Cursor::new(Vec::new());
        image::DynamicImage::ImageRgb8(image)
            .write_to(&mut bytes, image::ImageFormat::Png)
            .unwrap();
        bytes.into_inner()
    }

    fn request(root: &Path) -> (DatabaseSnapshot, FacepackFilesystemRequest) {
        let source = root.join("source");
        let destination = root.join("destination");
        fs::create_dir(&source).unwrap();
        fs::create_dir(&destination).unwrap();
        fs::write(source.join("a.png"), png(1)).unwrap();
        fs::write(source.join("b.png"), png(2)).unwrap();
        let mut snapshot = synthetic_snapshot();
        snapshot.players[0].id = "2000000001".into();
        snapshot.players[1].id = "2000000002".into();
        let request = FacepackFilesystemRequest {
            source_directory: source,
            destination_root: destination,
            plan: FacepackRequest {
                pack_id: "career-a".into(),
                selected_player_ids: vec!["2000000001".into(), "2000000002".into()],
                seed: "save-a".into(),
                confirm_newgens: true,
            },
        };
        (snapshot, request)
    }

    #[test]
    fn previews_installs_verifies_and_removes_a_managed_pack() {
        let root = fixture_root();
        let (snapshot, request) = request(&root);
        let preview = preview_facepack(&snapshot, &request).unwrap();
        assert_eq!(preview.plan.assignments.len(), 2);
        assert!(!preview.target_directory.exists());

        let installed = install_facepack(&snapshot, &request, &preview.plan.plan_hash).unwrap();
        assert_eq!(installed.assignment_count, 2);
        assert_eq!(installed.file_count, 4);
        assert!(installed.target_directory.join(CONFIG_NAME).is_file());
        assert!(installed.target_directory.join(MANIFEST_NAME).is_file());

        let removed = remove_facepack(&request.destination_root, "career-a").unwrap();
        assert_eq!(removed.removed_file_count, 4);
        assert!(!removed.target_directory.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn refuses_stale_previews_and_modified_managed_files() {
        let root = fixture_root();
        let (snapshot, request) = request(&root);
        assert!(matches!(
            install_facepack(&snapshot, &request, &"0".repeat(64)),
            Err(FacepackStoreError::StalePreview)
        ));
        let preview = preview_facepack(&snapshot, &request).unwrap();
        let installed = install_facepack(&snapshot, &request, &preview.plan.plan_hash).unwrap();
        fs::write(
            installed
                .target_directory
                .join(&preview.plan.assignments[0].output_filename),
            png(9),
        )
        .unwrap();
        assert!(matches!(
            remove_facepack(&request.destination_root, "career-a"),
            Err(FacepackStoreError::ModifiedPack(_))
        ));
        assert!(installed.target_directory.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symbolic_image_inputs() {
        use std::os::unix::fs::symlink;

        let root = fixture_root();
        let (snapshot, mut request) = request(&root);
        fs::remove_file(request.source_directory.join("b.png")).unwrap();
        symlink(
            request.source_directory.join("a.png"),
            request.source_directory.join("b.png"),
        )
        .unwrap();
        request.plan.selected_player_ids.truncate(1);
        assert!(matches!(
            preview_facepack(&snapshot, &request),
            Err(FacepackStoreError::InvalidImage(_))
        ));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_a_file_with_only_a_png_header() {
        let root = fixture_root();
        let (snapshot, mut request) = request(&root);
        let mut corrupt = b"\x89PNG\r\n\x1a\n".to_vec();
        corrupt.extend(std::iter::repeat_n(7, 2_048));
        fs::write(request.source_directory.join("a.png"), corrupt).unwrap();
        fs::remove_file(request.source_directory.join("b.png")).unwrap();
        request.plan.selected_player_ids.truncate(1);
        assert!(matches!(
            preview_facepack(&snapshot, &request),
            Err(FacepackStoreError::InvalidImage(_))
        ));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn atomic_rename_never_replaces_an_existing_target() {
        let root = fixture_root();
        let source = root.join("source-file");
        let destination = root.join("destination-file");
        fs::write(&source, b"new").unwrap();
        fs::write(&destination, b"existing").unwrap();
        assert!(rename_noreplace(&source, &destination, "test rename").is_err());
        assert_eq!(fs::read(&source).unwrap(), b"new");
        assert_eq!(fs::read(&destination).unwrap(), b"existing");
        fs::remove_dir_all(root).unwrap();
    }
}
