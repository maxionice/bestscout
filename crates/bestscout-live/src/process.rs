use std::{
    fs::{self, File},
    io,
    path::PathBuf,
};

#[cfg(target_os = "linux")]
use std::os::unix::fs::FileExt;

use serde::{Deserialize, Serialize};
use thiserror::Error;

const MAX_SINGLE_READ: usize = 16 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct MemoryPermissions {
    pub read: bool,
    pub write: bool,
    pub execute: bool,
    pub private: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MemoryRegion {
    pub start: u64,
    pub end: u64,
    pub permissions: MemoryPermissions,
    pub offset: u64,
    pub device: String,
    pub inode: u64,
    pub path: Option<PathBuf>,
}

impl MemoryRegion {
    pub fn len(&self) -> u64 {
        self.end.saturating_sub(self.start)
    }

    pub fn is_empty(&self) -> bool {
        self.start >= self.end
    }

    pub fn contains_range(&self, address: u64, length: usize) -> bool {
        let Ok(length) = u64::try_from(length) else {
            return false;
        };
        address >= self.start
            && address
                .checked_add(length)
                .is_some_and(|end| end <= self.end)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProcessMap {
    pub pid: u32,
    pub regions: Vec<MemoryRegion>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProcessInspection {
    pub pid: u32,
    pub region_count: usize,
    pub readable_region_count: usize,
    pub fm_executable_base: Option<u64>,
    pub game_assembly_base: Option<u64>,
}

impl ProcessMap {
    pub fn readable_region(&self, address: u64, length: usize) -> Option<&MemoryRegion> {
        self.regions
            .iter()
            .find(|region| region.permissions.read && region.contains_range(address, length))
    }

    pub fn module_base(&self, file_name: &str) -> Option<u64> {
        self.regions
            .iter()
            .filter(|region| {
                region.path.as_ref().is_some_and(|path| {
                    path.file_name()
                        .is_some_and(|name| name.eq_ignore_ascii_case(file_name))
                })
            })
            .map(|region| region.start.saturating_sub(region.offset))
            .min()
    }
}

#[derive(Debug, Error)]
pub enum ProcessError {
    #[error("live process inspection is only supported on Linux")]
    UnsupportedPlatform,
    #[error("cannot read process maps: {0}")]
    Maps(#[source] io::Error),
    #[error("invalid process map line {line}: {reason}")]
    InvalidMap { line: usize, reason: String },
    #[error("cannot open read-only process memory: {0}")]
    OpenMemory(#[source] io::Error),
    #[error("read length {requested} exceeds the {maximum} byte safety limit")]
    ReadTooLarge { requested: usize, maximum: usize },
    #[error("address 0x{address:x} with length {length} is not in one readable region")]
    UnreadableRange { address: u64, length: usize },
    #[error("cannot read process memory: {0}")]
    ReadMemory(#[source] io::Error),
}

pub fn parse_maps(pid: u32, input: &str) -> Result<ProcessMap, ProcessError> {
    let mut regions = Vec::new();
    for (index, line) in input.lines().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        regions.push(
            parse_map_line(line).map_err(|reason| ProcessError::InvalidMap {
                line: index + 1,
                reason,
            })?,
        );
    }
    regions.sort_by_key(|region| region.start);
    Ok(ProcessMap { pid, regions })
}

fn parse_map_line(line: &str) -> Result<MemoryRegion, String> {
    let mut fields = line.split_whitespace();
    let range = fields.next().ok_or("missing address range")?;
    let permissions = fields.next().ok_or("missing permissions")?;
    let offset = fields.next().ok_or("missing file offset")?;
    let device = fields.next().ok_or("missing device")?;
    let inode = fields.next().ok_or("missing inode")?;
    let path = fields.collect::<Vec<_>>().join(" ");

    let (start, end) = range.split_once('-').ok_or("invalid address range")?;
    let start = u64::from_str_radix(start, 16).map_err(|_| "invalid start address")?;
    let end = u64::from_str_radix(end, 16).map_err(|_| "invalid end address")?;
    if start >= end {
        return Err("empty or reversed address range".to_owned());
    }
    let bytes = permissions.as_bytes();
    if bytes.len() != 4 {
        return Err("permissions must contain four characters".to_owned());
    }

    Ok(MemoryRegion {
        start,
        end,
        permissions: MemoryPermissions {
            read: bytes[0] == b'r',
            write: bytes[1] == b'w',
            execute: bytes[2] == b'x',
            private: bytes[3] == b'p',
        },
        offset: u64::from_str_radix(offset, 16).map_err(|_| "invalid file offset")?,
        device: device.to_owned(),
        inode: inode.parse().map_err(|_| "invalid inode")?,
        path: (!path.is_empty()).then(|| PathBuf::from(path)),
    })
}

#[cfg(target_os = "linux")]
pub fn read_process_map(pid: u32) -> Result<ProcessMap, ProcessError> {
    let contents = fs::read_to_string(format!("/proc/{pid}/maps")).map_err(ProcessError::Maps)?;
    parse_maps(pid, &contents)
}

pub fn inspect_process(pid: u32) -> Result<ProcessInspection, ProcessError> {
    let map = read_process_map(pid)?;
    Ok(ProcessInspection {
        pid,
        region_count: map.regions.len(),
        readable_region_count: map
            .regions
            .iter()
            .filter(|region| region.permissions.read)
            .count(),
        fm_executable_base: map.module_base("fm.exe"),
        game_assembly_base: map.module_base("GameAssembly.dll"),
    })
}

#[cfg(not(target_os = "linux"))]
pub fn read_process_map(_pid: u32) -> Result<ProcessMap, ProcessError> {
    Err(ProcessError::UnsupportedPlatform)
}

/// Read-only view of a Linux process. This type intentionally exposes no write API.
pub struct ReadOnlyProcessMemory {
    pid: u32,
    memory: File,
    map: ProcessMap,
}

impl ReadOnlyProcessMemory {
    #[cfg(target_os = "linux")]
    pub fn open(pid: u32) -> Result<Self, ProcessError> {
        let map = read_process_map(pid)?;
        let memory = File::open(format!("/proc/{pid}/mem")).map_err(ProcessError::OpenMemory)?;
        Ok(Self { pid, memory, map })
    }

    #[cfg(not(target_os = "linux"))]
    pub fn open(_pid: u32) -> Result<Self, ProcessError> {
        Err(ProcessError::UnsupportedPlatform)
    }

    pub fn pid(&self) -> u32 {
        self.pid
    }

    pub fn map(&self) -> &ProcessMap {
        &self.map
    }

    #[cfg(target_os = "linux")]
    pub fn read_exact_at(&self, address: u64, length: usize) -> Result<Vec<u8>, ProcessError> {
        if length > MAX_SINGLE_READ {
            return Err(ProcessError::ReadTooLarge {
                requested: length,
                maximum: MAX_SINGLE_READ,
            });
        }
        if self.map.readable_region(address, length).is_none() {
            return Err(ProcessError::UnreadableRange { address, length });
        }

        let mut buffer = vec![0; length];
        self.memory
            .read_exact_at(&mut buffer, address)
            .map_err(ProcessError::ReadMemory)?;
        Ok(buffer)
    }

    #[cfg(not(target_os = "linux"))]
    pub fn read_exact_at(&self, _address: u64, _length: usize) -> Result<Vec<u8>, ProcessError> {
        Err(ProcessError::UnsupportedPlatform)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_linux_maps_and_resolves_relocated_module_base() {
        let input = concat!(
            "7f00001000-7f00002000 r--p 00001000 08:01 42 /games/GameAssembly.dll\n",
            "7f00002000-7f00005000 r-xp 00002000 08:01 42 /games/GameAssembly.dll\n",
            "7fff000000-7fff001000 rw-p 00000000 00:00 0 [stack]\n",
        );
        let map = parse_maps(77, input).unwrap();
        assert_eq!(map.regions.len(), 3);
        assert_eq!(map.module_base("GameAssembly.dll"), Some(0x7f00000000));
        assert!(map.readable_region(0x7f00001010, 16).is_some());
        assert!(map.readable_region(0x7f00001ff8, 16).is_none());
    }

    #[test]
    fn rejects_malformed_map_lines() {
        assert!(matches!(
            parse_maps(1, "not-a-map"),
            Err(ProcessError::InvalidMap { line: 1, .. })
        ));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn reads_memory_from_the_current_process_without_a_write_api() {
        let marker = *b"BESTSCOUT_READ_ONLY";
        let address = marker.as_ptr() as u64;
        let process = ReadOnlyProcessMemory::open(std::process::id()).unwrap();
        let bytes = process.read_exact_at(address, marker.len()).unwrap();
        assert_eq!(bytes, marker);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn inspects_the_current_process_map() {
        let inspection = inspect_process(std::process::id()).unwrap();
        assert!(inspection.region_count > 0);
        assert!(inspection.readable_region_count > 0);
    }
}
