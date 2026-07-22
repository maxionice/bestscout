use std::{
    env,
    error::Error,
    fs::{self, File},
    io::{self, Cursor, Write},
    os::unix::fs::{MetadataExt, PermissionsExt},
    path::{Path, PathBuf},
};

use ar::{Builder as ArBuilder, Header as ArHeader};
use flate2::{Compression, GzBuilder};
use tar::{Builder as TarBuilder, EntryType, Header as TarHeader};
use walkdir::WalkDir;

#[derive(Debug)]
struct Arguments {
    source_date_epoch: u64,
    package_directory: PathBuf,
    output: PathBuf,
}

fn main() {
    if let Err(error) = run(parse_arguments(env::args().skip(1))) {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run(arguments: Result<Arguments, String>) -> Result<(), Box<dyn Error>> {
    let arguments = arguments?;
    if arguments.source_date_epoch == 0 || arguments.source_date_epoch > u32::MAX.into() {
        return Err("SOURCE_DATE_EPOCH must be a positive RPM-compatible timestamp".into());
    }
    let package_directory = fs::canonicalize(&arguments.package_directory)?;
    if !fs::symlink_metadata(&package_directory)?.is_dir() {
        return Err("DEB package staging path must be a directory".into());
    }
    let output_parent = arguments
        .output
        .parent()
        .ok_or("DEB output has no parent")?;
    let canonical_parent = fs::canonicalize(output_parent)?;
    if package_directory.parent() != Some(canonical_parent.as_path())
        || arguments
            .output
            .extension()
            .and_then(|value| value.to_str())
            != Some("deb")
    {
        return Err("DEB output must remain beside its Tauri staging directory".into());
    }
    let control = package_directory.join("control");
    let data = package_directory.join("data");
    validate_tree(&control)?;
    validate_tree(&data)?;

    let temporary = canonical_parent.join(format!(".bestscout-deb-{}", std::process::id()));
    fs::create_dir(&temporary)?;
    let build_result = (|| -> Result<PathBuf, Box<dyn Error>> {
        let debian_binary = temporary.join("debian-binary");
        let control_archive = temporary.join("control.tar.gz");
        let data_archive = temporary.join("data.tar.gz");
        fs::write(&debian_binary, "2.0\n")?;
        fs::set_permissions(&debian_binary, fs::Permissions::from_mode(0o644))?;
        create_tar_gzip(&control, &control_archive, arguments.source_date_epoch)?;
        create_tar_gzip(&data, &data_archive, arguments.source_date_epoch)?;

        let staged_output = temporary.join(
            arguments
                .output
                .file_name()
                .ok_or("DEB output has no filename")?,
        );
        let mut archive = ArBuilder::new(File::create(&staged_output)?);
        for (name, path) in [
            (b"debian-binary".as_slice(), debian_binary),
            (b"control.tar.gz".as_slice(), control_archive),
            (b"data.tar.gz".as_slice(), data_archive),
        ] {
            let bytes = fs::read(path)?;
            let mut header = ArHeader::new(name.to_vec(), bytes.len() as u64);
            header.set_mode(0o100644);
            archive.append(&header, Cursor::new(bytes))?;
        }
        archive.into_inner()?.flush()?;
        Ok(staged_output)
    })();
    let staged_output = match build_result {
        Ok(path) => path,
        Err(error) => {
            fs::remove_dir_all(&temporary)?;
            return Err(error);
        }
    };
    fs::rename(staged_output, &arguments.output)?;
    fs::remove_dir_all(&temporary)?;
    Ok(())
}

fn validate_tree(root: &Path) -> Result<(), Box<dyn Error>> {
    let metadata = fs::symlink_metadata(root)?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(format!("DEB staging tree must be a regular directory: {root:?}").into());
    }
    for entry in WalkDir::new(root).min_depth(1) {
        let entry = entry?;
        let metadata = fs::symlink_metadata(entry.path())?;
        if metadata.file_type().is_symlink() || (!metadata.is_file() && !metadata.is_dir()) {
            return Err(format!(
                "DEB staging tree contains an unsafe entry: {:?}",
                entry.path()
            )
            .into());
        }
    }
    Ok(())
}

fn create_tar_gzip(
    root: &Path,
    output: &Path,
    source_date_epoch: u64,
) -> Result<(), Box<dyn Error>> {
    let gzip = GzBuilder::new()
        .mtime(0)
        .operating_system(3)
        .write(File::create(output)?, Compression::new(9));
    let mut archive = TarBuilder::new(gzip);
    let mut entries = WalkDir::new(root)
        .min_depth(1)
        .into_iter()
        .collect::<Result<Vec<_>, _>>()?;
    entries.sort_by(|left, right| left.path().cmp(right.path()));
    for entry in entries {
        let path = entry.path();
        let relative = path.strip_prefix(root)?;
        let metadata = fs::symlink_metadata(path)?;
        let mut header = TarHeader::new_gnu();
        header.set_uid(0);
        header.set_gid(0);
        header.set_mtime(source_date_epoch);
        header.set_mode(metadata.mode() & 0o7777);
        if metadata.is_dir() {
            header.set_entry_type(EntryType::Directory);
            header.set_size(0);
            header.set_cksum();
            archive.append_data(&mut header, relative, io::empty())?;
        } else if metadata.is_file() {
            header.set_entry_type(EntryType::Regular);
            header.set_size(metadata.len());
            header.set_cksum();
            archive.append_data(&mut header, relative, File::open(path)?)?;
        } else {
            return Err(format!("DEB staging tree contains an unsafe entry: {path:?}").into());
        }
    }
    archive.into_inner()?.finish()?.flush()?;
    Ok(())
}

fn parse_arguments(arguments: impl Iterator<Item = String>) -> Result<Arguments, String> {
    let mut source_date_epoch = None;
    let mut package_directory = None;
    let mut output = None;
    let mut arguments = arguments;
    while let Some(flag) = arguments.next() {
        let value = arguments
            .next()
            .ok_or_else(|| format!("missing value for {flag}"))?;
        match flag.as_str() {
            "--source-date-epoch" => {
                source_date_epoch = Some(
                    value
                        .parse::<u64>()
                        .map_err(|_| "SOURCE_DATE_EPOCH must be an unsigned integer".to_owned())?,
                )
            }
            "--package-directory" => package_directory = Some(PathBuf::from(value)),
            "--output" => output = Some(PathBuf::from(value)),
            _ => return Err(format!("unknown argument: {flag}")),
        }
    }
    Ok(Arguments {
        source_date_epoch: source_date_epoch.ok_or("--source-date-epoch is required")?,
        package_directory: package_directory.ok_or("--package-directory is required")?,
        output: output.ok_or("--output is required")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{os::unix::fs::symlink, time::SystemTime};

    #[test]
    fn writes_byte_reproducible_deb_packages_and_rejects_symlinks() {
        let root = env::temp_dir().join(format!(
            "bestscout-deb-repro-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let package_directory = root.join("BestScout_1.0.0_amd64");
        let control = package_directory.join("control");
        let data = package_directory.join("data/usr/bin");
        fs::create_dir_all(&control).unwrap();
        fs::create_dir_all(&data).unwrap();
        fs::write(
            control.join("control"),
            "Package: best-scout\nVersion: 1.0.0\n",
        )
        .unwrap();
        fs::write(data.join("bestscout-desktop"), "binary").unwrap();
        let first = root.join("first.deb");
        let second = root.join("second.deb");
        for output in [&first, &second] {
            run(Ok(Arguments {
                source_date_epoch: 1_600_000_000,
                package_directory: package_directory.clone(),
                output: output.clone(),
            }))
            .unwrap();
        }
        assert_eq!(fs::read(first).unwrap(), fs::read(second).unwrap());

        let unsafe_path = data.join("unsafe");
        symlink("bestscout-desktop", &unsafe_path).unwrap();
        assert!(validate_tree(&package_directory).is_err());
        fs::remove_file(unsafe_path).unwrap();
        fs::remove_dir_all(root).unwrap();
    }
}
