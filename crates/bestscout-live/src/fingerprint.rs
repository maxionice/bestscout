use std::{
    fs::File,
    io::{self, BufReader, Read},
    path::Path,
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExecutableFingerprint {
    pub sha256: String,
    pub size: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BuildFingerprint {
    pub executable: ExecutableFingerprint,
    pub game_assembly: ExecutableFingerprint,
    pub global_metadata: ExecutableFingerprint,
}

#[derive(Debug, Error)]
pub enum FingerprintError {
    #[error("cannot open executable: {0}")]
    Open(#[source] io::Error),
    #[error("cannot read executable: {0}")]
    Read(#[source] io::Error),
}

pub fn fingerprint_file(path: impl AsRef<Path>) -> Result<ExecutableFingerprint, FingerprintError> {
    let file = File::open(path).map_err(FingerprintError::Open)?;
    let size = file.metadata().map_err(FingerprintError::Read)?.len();
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];

    loop {
        let read = reader.read(&mut buffer).map_err(FingerprintError::Read)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Ok(ExecutableFingerprint {
        sha256: format!("{:x}", hasher.finalize()),
        size,
    })
}

#[cfg(test)]
mod tests {
    use std::{fs, time::SystemTime};

    use super::*;

    #[test]
    fn creates_stable_sha256_fingerprint() {
        let unique = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("bestscout-fingerprint-{unique}"));
        fs::write(&path, b"BestScout").unwrap();
        let fingerprint = fingerprint_file(&path).unwrap();
        fs::remove_file(path).unwrap();

        assert_eq!(fingerprint.size, 9);
        assert_eq!(
            fingerprint.sha256,
            "d597afeac8fab75c5441fb7f6a270b6b1764de6eb83e693cbd51f7ea5ddc4e79"
        );
    }
}
