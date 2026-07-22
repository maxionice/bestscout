use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

use crate::Player;

pub const FACEPACK_SCHEMA_VERSION: u16 = 1;
const MAX_ASSIGNMENTS: usize = 10_000;
const MAX_IMAGE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES: u64 = 8 * 1024 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FacepackImage {
    pub source_name: String,
    pub extension: String,
    pub bytes: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FacepackRequest {
    pub pack_id: String,
    pub selected_player_ids: Vec<String>,
    pub seed: String,
    pub confirm_newgens: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FacepackAssignment {
    pub player_id: String,
    pub player_name: String,
    pub target_id: String,
    pub source_name: String,
    pub source_sha256: String,
    pub output_filename: String,
    pub resource_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FacepackPlan {
    pub schema_version: u16,
    pub pack_id: String,
    pub seed: String,
    pub assignments: Vec<FacepackAssignment>,
    pub unused_image_count: usize,
    pub plan_hash: String,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum FacepackError {
    #[error("confirm that every selected person is a newgen before assigning faces")]
    NewgensNotConfirmed,
    #[error("pack id must contain 1 to 64 lowercase ASCII letters, digits, hyphens or underscores")]
    InvalidPackId,
    #[error("seed must contain 1 to 128 printable characters")]
    InvalidSeed,
    #[error("select between 1 and {MAX_ASSIGNMENTS} players")]
    InvalidPlayerCount,
    #[error("selected player id is duplicated: {0}")]
    DuplicatePlayer(String),
    #[error("selected player was not found: {0}")]
    MissingPlayer(String),
    #[error("newgen face assignment requires a numeric FM unique id: {0}")]
    InvalidPlayerId(String),
    #[error("two selected players resolve to the same FM unique id: {0}")]
    DuplicateUniqueId(String),
    #[error("face image metadata is invalid: {0}")]
    InvalidImage(String),
    #[error("face image filename is duplicated: {0}")]
    DuplicateImageName(String),
    #[error("face image content is duplicated: {0}")]
    DuplicateImageContent(String),
    #[error("not enough distinct face images: need {required}, found {available}")]
    InsufficientImages { required: usize, available: usize },
}

pub fn plan_facepack(
    players: &[Player],
    images: &[FacepackImage],
    request: &FacepackRequest,
) -> Result<FacepackPlan, FacepackError> {
    validate_request(request)?;
    let player_by_id: HashMap<&str, &Player> = players
        .iter()
        .map(|player| (player.id.as_str(), player))
        .collect();
    let mut selected_ids = HashSet::new();
    let mut unique_ids = HashSet::new();
    let mut selected = Vec::with_capacity(request.selected_player_ids.len());
    for player_id in &request.selected_player_ids {
        if !selected_ids.insert(player_id.as_str()) {
            return Err(FacepackError::DuplicatePlayer(player_id.clone()));
        }
        let player = player_by_id
            .get(player_id.as_str())
            .ok_or_else(|| FacepackError::MissingPlayer(player_id.clone()))?;
        let unique_id = normalize_newgen_id(player_id)
            .ok_or_else(|| FacepackError::InvalidPlayerId(player_id.clone()))?;
        if !unique_ids.insert(unique_id.clone()) {
            return Err(FacepackError::DuplicateUniqueId(unique_id));
        }
        selected.push((unique_id, *player));
    }
    selected.sort_by(|(left, _), (right, _)| numeric_id_order(left, right));

    validate_images(images)?;
    if images.len() < selected.len() {
        return Err(FacepackError::InsufficientImages {
            required: selected.len(),
            available: images.len(),
        });
    }
    let mut ranked_images = images.to_vec();
    ranked_images.sort_by(|left, right| {
        image_rank(&request.seed, left)
            .cmp(&image_rank(&request.seed, right))
            .then_with(|| left.source_name.cmp(&right.source_name))
    });

    let assignments = selected
        .into_iter()
        .zip(ranked_images)
        .map(|((unique_id, player), image)| {
            let resource_name = format!("bestscout_newgen_{unique_id}");
            FacepackAssignment {
                player_id: player.id.clone(),
                player_name: player.name.clone(),
                target_id: format!("r-{unique_id}"),
                source_name: image.source_name,
                source_sha256: image.sha256,
                output_filename: format!("{resource_name}.{}", image.extension),
                resource_name,
            }
        })
        .collect::<Vec<_>>();
    let unused_image_count = images.len() - assignments.len();
    let plan_hash = hash_plan(
        &request.pack_id,
        &request.seed,
        &assignments,
        unused_image_count,
    );
    Ok(FacepackPlan {
        schema_version: FACEPACK_SCHEMA_VERSION,
        pack_id: request.pack_id.clone(),
        seed: request.seed.clone(),
        assignments,
        unused_image_count,
        plan_hash,
    })
}

pub fn render_facepack_config(plan: &FacepackPlan) -> String {
    let mut xml = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<record>\n  <boolean id=\"preload\" value=\"false\"/>\n  <boolean id=\"amap\" value=\"false\"/>\n  <list id=\"maps\">\n",
    );
    for assignment in &plan.assignments {
        xml.push_str(&format!(
            "    <record from=\"{}\" to=\"graphics/pictures/person/{}/portrait\"/>\n",
            assignment.resource_name, assignment.target_id
        ));
    }
    xml.push_str("  </list>\n</record>\n");
    xml
}

fn validate_request(request: &FacepackRequest) -> Result<(), FacepackError> {
    if !request.confirm_newgens {
        return Err(FacepackError::NewgensNotConfirmed);
    }
    if request.pack_id.is_empty()
        || request.pack_id.len() > 64
        || !request
            .pack_id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"-_".contains(&byte))
    {
        return Err(FacepackError::InvalidPackId);
    }
    if request.seed.is_empty()
        || request.seed.len() > 128
        || request.seed.chars().any(char::is_control)
    {
        return Err(FacepackError::InvalidSeed);
    }
    if request.selected_player_ids.is_empty() || request.selected_player_ids.len() > MAX_ASSIGNMENTS
    {
        return Err(FacepackError::InvalidPlayerCount);
    }
    Ok(())
}

fn normalize_newgen_id(value: &str) -> Option<String> {
    let digits = value.strip_prefix("r-").unwrap_or(value);
    if digits.is_empty() || digits.len() > 20 || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let normalized = digits.trim_start_matches('0');
    (!normalized.is_empty()).then(|| normalized.to_owned())
}

fn numeric_id_order(left: &str, right: &str) -> std::cmp::Ordering {
    left.len().cmp(&right.len()).then_with(|| left.cmp(right))
}

fn validate_images(images: &[FacepackImage]) -> Result<(), FacepackError> {
    if images.len() > MAX_ASSIGNMENTS {
        return Err(FacepackError::InvalidImage(format!(
            "more than {MAX_ASSIGNMENTS} files"
        )));
    }
    let mut names = HashSet::new();
    let mut hashes = HashSet::new();
    let mut total_bytes = 0_u64;
    for image in images {
        let name_is_safe = !image.source_name.is_empty()
            && image.source_name.len() <= 255
            && !image.source_name.contains(['/', '\\'])
            && !image.source_name.chars().any(char::is_control);
        let extension_is_supported = matches!(image.extension.as_str(), "png" | "jpg" | "jpeg");
        let hash_is_valid = image.sha256.len() == 64
            && image
                .sha256
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte));
        if !name_is_safe
            || !extension_is_supported
            || image.bytes < 1_024
            || image.bytes > MAX_IMAGE_BYTES
            || !hash_is_valid
        {
            return Err(FacepackError::InvalidImage(image.source_name.clone()));
        }
        if !names.insert(image.source_name.as_str()) {
            return Err(FacepackError::DuplicateImageName(image.source_name.clone()));
        }
        if !hashes.insert(image.sha256.as_str()) {
            return Err(FacepackError::DuplicateImageContent(
                image.source_name.clone(),
            ));
        }
        total_bytes = total_bytes
            .checked_add(image.bytes)
            .ok_or_else(|| FacepackError::InvalidImage("total size overflow".into()))?;
        if total_bytes > MAX_TOTAL_IMAGE_BYTES {
            return Err(FacepackError::InvalidImage(
                "total image size exceeds 8 GiB".into(),
            ));
        }
    }
    Ok(())
}

fn image_rank(seed: &str, image: &FacepackImage) -> [u8; 32] {
    let mut hash = Sha256::new();
    hash.update(b"bestscout-facepack-image-v1\0");
    hash.update(seed.as_bytes());
    hash.update(b"\0");
    hash.update(image.source_name.as_bytes());
    hash.update(b"\0");
    hash.update(image.sha256.as_bytes());
    hash.finalize().into()
}

fn hash_plan(
    pack_id: &str,
    seed: &str,
    assignments: &[FacepackAssignment],
    unused_image_count: usize,
) -> String {
    let payload = serde_json::to_vec(&(
        FACEPACK_SCHEMA_VERSION,
        pack_id,
        seed,
        assignments,
        unused_image_count,
    ))
    .expect("facepack plan is serializable");
    format!("{:x}", Sha256::digest(payload))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::synthetic_snapshot;

    fn numeric_players() -> Vec<Player> {
        let mut players = synthetic_snapshot().players;
        players[0].id = "2000000001".into();
        players[1].id = "r-2000000002".into();
        players
    }

    fn images() -> Vec<FacepackImage> {
        vec![
            FacepackImage {
                source_name: "face-b.jpg".into(),
                extension: "jpg".into(),
                bytes: 4_096,
                sha256: "b".repeat(64),
            },
            FacepackImage {
                source_name: "face-a.png".into(),
                extension: "png".into(),
                bytes: 8_192,
                sha256: "a".repeat(64),
            },
            FacepackImage {
                source_name: "unused.jpeg".into(),
                extension: "jpeg".into(),
                bytes: 2_048,
                sha256: "c".repeat(64),
            },
        ]
    }

    fn request() -> FacepackRequest {
        FacepackRequest {
            pack_id: "save-2026".into(),
            selected_player_ids: vec!["r-2000000002".into(), "2000000001".into()],
            seed: "career-a".into(),
            confirm_newgens: true,
        }
    }

    #[test]
    fn creates_a_deterministic_conflict_free_newgen_plan() {
        let players = numeric_players();
        let plan = plan_facepack(&players, &images(), &request()).unwrap();
        let mut reversed_players = players.clone();
        reversed_players.reverse();
        let mut reversed_images = images();
        reversed_images.reverse();
        let repeated = plan_facepack(&reversed_players, &reversed_images, &request()).unwrap();
        assert_eq!(plan, repeated);
        assert_eq!(plan.assignments.len(), 2);
        assert_eq!(plan.unused_image_count, 1);
        assert_eq!(plan.assignments[0].target_id, "r-2000000001");
        assert_eq!(plan.assignments[1].target_id, "r-2000000002");
        assert_ne!(
            plan.assignments[0].source_name,
            plan.assignments[1].source_name
        );
        assert_eq!(plan.plan_hash.len(), 64);
    }

    #[test]
    fn renders_only_bounded_generated_names_and_newgen_targets() {
        let plan = plan_facepack(&numeric_players(), &images(), &request()).unwrap();
        let xml = render_facepack_config(&plan);
        assert!(xml.contains("from=\"bestscout_newgen_2000000001\""));
        assert!(xml.contains("graphics/pictures/person/r-2000000002/portrait"));
        assert!(!xml.contains("Ada Beispiel"));
        assert_eq!(xml.matches("<record from=").count(), 2);
    }

    #[test]
    fn rejects_unconfirmed_non_numeric_duplicate_and_insufficient_inputs() {
        let players = numeric_players();
        let mut unconfirmed = request();
        unconfirmed.confirm_newgens = false;
        assert_eq!(
            plan_facepack(&players, &images(), &unconfirmed),
            Err(FacepackError::NewgensNotConfirmed)
        );

        let mut invalid_id = request();
        invalid_id.selected_player_ids = vec!["player-name".into()];
        let mut player = players[0].clone();
        player.id = "player-name".into();
        assert_eq!(
            plan_facepack(&[player], &images(), &invalid_id),
            Err(FacepackError::InvalidPlayerId("player-name".into()))
        );

        let mut zero_id = players[0].clone();
        zero_id.id = "000".into();
        let mut zero_request = request();
        zero_request.selected_player_ids = vec!["000".into()];
        assert_eq!(
            plan_facepack(&[zero_id], &images(), &zero_request),
            Err(FacepackError::InvalidPlayerId("000".into()))
        );

        let mut colliding_players = players.clone();
        colliding_players[0].id = "001".into();
        colliding_players[1].id = "r-1".into();
        let mut collision_request = request();
        collision_request.selected_player_ids = vec!["001".into(), "r-1".into()];
        assert_eq!(
            plan_facepack(&colliding_players, &images(), &collision_request),
            Err(FacepackError::DuplicateUniqueId("1".into()))
        );

        let mut duplicate_images = images();
        duplicate_images[1].sha256 = duplicate_images[0].sha256.clone();
        assert!(matches!(
            plan_facepack(&players, &duplicate_images, &request()),
            Err(FacepackError::DuplicateImageContent(_))
        ));

        assert_eq!(
            plan_facepack(&players, &images()[..1], &request()),
            Err(FacepackError::InsufficientImages {
                required: 2,
                available: 1,
            })
        );
    }
}
