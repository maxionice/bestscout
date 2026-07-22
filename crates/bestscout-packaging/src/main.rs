use std::{
    env,
    error::Error,
    fs::{self, OpenOptions},
    io::Write,
    os::unix::fs::OpenOptionsExt,
    path::PathBuf,
};

use heck::AsKebabCase;
use rpm::{CompressionWithLevel, Dependency, FileMode, FileOptions, Package, PackageBuilder};
use serde_json::Value;

const BUNDLE_MARKER: &[u8] = b"__TAURI_BUNDLE_TYPE_VAR_UNK";

#[derive(Debug)]
struct Arguments {
    source_date_epoch: u64,
    config: PathBuf,
    binary: PathBuf,
    desktop: PathBuf,
    icon: PathBuf,
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
    let config: Value = serde_json::from_slice(&fs::read(&arguments.config)?)?;
    let bundle = object_at(&config, &["bundle"])?;
    let product_name = string_at(&config, &["productName"])?;
    let version = string_at(&config, &["version"])?;
    let license = string_at(bundle, &["license"])?;
    let summary = string_at(bundle, &["shortDescription"])?;
    let description = string_at(bundle, &["longDescription"])?;
    let homepage = string_at(bundle, &["homepage"])?;
    let rpm_config = object_at(bundle, &["linux", "rpm"])?;
    let epoch = u32::try_from(rpm_config.get("epoch").and_then(Value::as_u64).unwrap_or(0))
        .map_err(|_| "RPM epoch exceeds the supported u32 range")?;
    let source_date_epoch = u32::try_from(arguments.source_date_epoch)
        .map_err(|_| "SOURCE_DATE_EPOCH exceeds the RPM u32 range")?;
    let release = rpm_config
        .get("release")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .unwrap_or("1");
    let architecture = match env::consts::ARCH {
        "x86_64" => "x86_64",
        "x86" => "i386",
        "aarch64" => "aarch64",
        other => return Err(format!("unsupported RPM architecture: {other}").into()),
    };
    let binary_name = arguments
        .binary
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("RPM binary has no UTF-8 filename")?;
    let package_name = AsKebabCase(product_name).to_string();
    let expected_paths = [
        PathBuf::from(format!("/usr/bin/{binary_name}")),
        PathBuf::from(format!("/usr/share/applications/{product_name}.desktop")),
        PathBuf::from(format!(
            "/usr/share/icons/hicolor/512x512/apps/{binary_name}.png"
        )),
    ];

    let output_parent = arguments
        .output
        .parent()
        .ok_or("RPM output has no parent")?;
    fs::create_dir_all(output_parent)?;
    let tauri_package = Package::open(&arguments.output)?;
    tauri_package.verify_digests()?;
    let tauri_metadata = &tauri_package.metadata;
    if tauri_metadata.get_name()? != package_name
        || tauri_metadata.get_epoch()? != epoch
        || tauri_metadata.get_version()? != version
        || tauri_metadata.get_release()? != release
        || tauri_metadata.get_arch()? != architecture
        || tauri_metadata.get_license()? != license
        || tauri_metadata.get_summary()? != summary
        || tauri_metadata.get_description()? != description
        || tauri_metadata.get_url()? != homepage
        || tauri_metadata.get_file_paths()? != expected_paths
    {
        return Err("Tauri RPM metadata does not match the requested package".into());
    }
    let tauri_requirements = tauri_metadata.get_requires()?;
    let mut tauri_provides = tauri_metadata.get_provides()?;
    let tauri_recommends = tauri_metadata.get_recommends()?;
    let tauri_conflicts = tauri_metadata.get_conflicts()?;
    let tauri_obsoletes = tauri_metadata.get_obsoletes()?;
    let tauri_suggests = tauri_metadata.get_suggests()?;
    let tauri_enhances = tauri_metadata.get_enhances()?;
    let tauri_supplements = tauri_metadata.get_supplements()?;
    let expected_requirement_keys = dependency_keys(&tauri_requirements);
    let expected_provide_keys = dependency_keys(&tauri_provides);
    let expected_recommend_keys = dependency_keys(&tauri_recommends);
    let expected_conflict_keys = dependency_keys(&tauri_conflicts);
    let expected_obsolete_keys = dependency_keys(&tauri_obsoletes);
    let expected_suggest_keys = dependency_keys(&tauri_suggests);
    let expected_enhance_keys = dependency_keys(&tauri_enhances);
    let expected_supplement_keys = dependency_keys(&tauri_supplements);
    let preserved_requirements = tauri_requirements
        .into_iter()
        .filter(|dependency| !dependency.name.starts_with("rpmlib("))
        .collect::<Vec<_>>();
    let automatic_provides = [
        dependency_key(&Dependency::eq(&package_name, version)),
        dependency_key(&Dependency::eq(
            format!("{package_name}({architecture})"),
            version,
        )),
    ];
    tauri_provides.retain(|dependency| !automatic_provides.contains(&dependency_key(dependency)));
    let patched_binary_path =
        output_parent.join(format!(".bestscout-rpm-binary-{}", std::process::id()));
    let mut patched_binary = patch_bundle_type(fs::read(&arguments.binary)?)?;
    let mut temporary = OpenOptions::new()
        .create_new(true)
        .write(true)
        .mode(0o700)
        .open(&patched_binary_path)?;
    temporary.write_all(&patched_binary)?;
    temporary.flush()?;
    patched_binary.fill(0);
    drop(temporary);

    let build_result = (|| -> Result<_, rpm::Error> {
        let mut builder =
            PackageBuilder::new(&package_name, version, license, architecture, summary)
                .epoch(epoch)
                .release(release)
                .compression(CompressionWithLevel::Gzip(6))
                .source_date(source_date_epoch)
                .description(description)
                .url(homepage)
                .with_file(
                    &patched_binary_path,
                    FileOptions::new(format!("/usr/bin/{binary_name}"))
                        .mode(FileMode::regular(0o755)),
                )?
                .with_file(
                    &arguments.desktop,
                    FileOptions::new(format!("/usr/share/applications/{product_name}.desktop"))
                        .mode(FileMode::regular(0o644)),
                )?
                .with_file(
                    &arguments.icon,
                    FileOptions::new(format!(
                        "/usr/share/icons/hicolor/512x512/apps/{binary_name}.png"
                    ))
                    .mode(FileMode::regular(0o644)),
                )?;
        for dependency in preserved_requirements {
            builder = builder.requires(dependency);
        }
        for dependency in tauri_provides {
            builder = builder.provides(dependency);
        }
        for dependency in tauri_recommends {
            builder = builder.recommends(dependency);
        }
        for dependency in tauri_conflicts {
            builder = builder.conflicts(dependency);
        }
        for dependency in tauri_obsoletes {
            builder = builder.obsoletes(dependency);
        }
        for dependency in tauri_suggests {
            builder = builder.suggests(dependency);
        }
        for dependency in tauri_enhances {
            builder = builder.enhances(dependency);
        }
        for dependency in tauri_supplements {
            builder = builder.supplements(dependency);
        }
        builder.build()
    })();
    fs::remove_file(&patched_binary_path)?;
    let package = build_result?;
    let staged_output = output_parent.join(format!(".bestscout-rpm-{}", std::process::id()));
    package.write_file(&staged_output)?;
    let written_package = Package::open(&staged_output)?;
    written_package.verify_digests()?;
    let metadata = &written_package.metadata;
    if metadata.get_name()? != package_name
        || metadata.get_epoch()? != epoch
        || metadata.get_version()? != version
        || metadata.get_release()? != release
        || metadata.get_arch()? != architecture
        || metadata.get_license()? != license
        || metadata.get_summary()? != summary
        || metadata.get_description()? != description
        || metadata.get_url()? != homepage
        || metadata.get_build_time()? != u64::from(source_date_epoch)
    {
        return Err("written RPM metadata does not match the requested package".into());
    }
    if metadata.get_file_paths()? != expected_paths {
        return Err("written RPM contains an unexpected file set".into());
    }
    if dependency_keys(&metadata.get_requires()?) != expected_requirement_keys
        || dependency_keys(&metadata.get_provides()?) != expected_provide_keys
        || dependency_keys(&metadata.get_recommends()?) != expected_recommend_keys
        || dependency_keys(&metadata.get_conflicts()?) != expected_conflict_keys
        || dependency_keys(&metadata.get_obsoletes()?) != expected_obsolete_keys
        || dependency_keys(&metadata.get_suggests()?) != expected_suggest_keys
        || dependency_keys(&metadata.get_enhances()?) != expected_enhance_keys
        || dependency_keys(&metadata.get_supplements()?) != expected_supplement_keys
    {
        return Err("written RPM does not preserve Tauri's dependency metadata".into());
    }
    fs::rename(staged_output, &arguments.output)?;
    Ok(())
}

fn dependency_keys(dependencies: &[Dependency]) -> Vec<(String, u32, String)> {
    let mut keys = dependencies
        .iter()
        .map(|dependency| {
            (
                dependency.name.clone(),
                dependency.flags.bits(),
                dependency.version.clone(),
            )
        })
        .collect::<Vec<_>>();
    keys.sort();
    keys
}

fn dependency_key(dependency: &Dependency) -> (String, u32, String) {
    (
        dependency.name.clone(),
        dependency.flags.bits(),
        dependency.version.clone(),
    )
}

fn patch_bundle_type(mut binary: Vec<u8>) -> Result<Vec<u8>, Box<dyn Error>> {
    let matches: Vec<_> = binary
        .windows(BUNDLE_MARKER.len())
        .enumerate()
        .filter_map(|(index, window)| (window == BUNDLE_MARKER).then_some(index))
        .collect();
    if matches.len() != 1 {
        return Err(format!(
            "expected exactly one Tauri bundle marker, found {}",
            matches.len()
        )
        .into());
    }
    let replacement_at = matches[0] + BUNDLE_MARKER.len() - 3;
    binary[replacement_at..replacement_at + 3].copy_from_slice(b"RPM");
    Ok(binary)
}

fn parse_arguments(arguments: impl Iterator<Item = String>) -> Result<Arguments, String> {
    let mut source_date_epoch = None;
    let mut config = None;
    let mut binary = None;
    let mut desktop = None;
    let mut icon = None;
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
            "--config" => config = Some(PathBuf::from(value)),
            "--binary" => binary = Some(PathBuf::from(value)),
            "--desktop" => desktop = Some(PathBuf::from(value)),
            "--icon" => icon = Some(PathBuf::from(value)),
            "--output" => output = Some(PathBuf::from(value)),
            _ => return Err(format!("unknown argument: {flag}")),
        }
    }
    Ok(Arguments {
        source_date_epoch: source_date_epoch.ok_or("--source-date-epoch is required")?,
        config: config.ok_or("--config is required")?,
        binary: binary.ok_or("--binary is required")?,
        desktop: desktop.ok_or("--desktop is required")?,
        icon: icon.ok_or("--icon is required")?,
        output: output.ok_or("--output is required")?,
    })
}

fn object_at<'a>(value: &'a Value, path: &[&str]) -> Result<&'a Value, Box<dyn Error>> {
    path.iter()
        .try_fold(value, |current, segment| {
            current
                .get(segment)
                .ok_or_else(|| format!("missing configuration field {}", path.join(".")))
        })
        .map_err(Into::into)
}

fn string_at<'a>(value: &'a Value, path: &[&str]) -> Result<&'a str, Box<dyn Error>> {
    object_at(value, path)?
        .as_str()
        .ok_or_else(|| format!("configuration field {} must be a string", path.join(".")).into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{os::unix::fs::PermissionsExt, time::SystemTime};

    #[test]
    fn patches_exactly_one_tauri_bundle_marker() {
        let patched = patch_bundle_type(BUNDLE_MARKER.to_vec()).unwrap();
        assert_eq!(&patched[patched.len() - 3..], b"RPM");
        assert!(patch_bundle_type(Vec::new()).is_err());
        assert!(patch_bundle_type([BUNDLE_MARKER, BUNDLE_MARKER].concat()).is_err());
    }

    #[test]
    fn parses_only_the_complete_bounded_argument_set() {
        let arguments = parse_arguments(
            [
                "--source-date-epoch",
                "1600000000",
                "--config",
                "config.json",
                "--binary",
                "app",
                "--desktop",
                "app.desktop",
                "--icon",
                "icon.png",
                "--output",
                "app.rpm",
            ]
            .map(str::to_owned)
            .into_iter(),
        )
        .unwrap();
        assert_eq!(arguments.source_date_epoch, 1_600_000_000);
        assert!(parse_arguments(["--unknown", "value"].map(str::to_owned).into_iter()).is_err());
    }

    #[test]
    fn writes_byte_reproducible_rpm_packages() {
        let root = env::temp_dir().join(format!(
            "bestscout-rpm-repro-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let result = (|| -> Result<(), Box<dyn Error>> {
            let config = root.join("tauri.conf.json");
            let binary = root.join("bestscout-desktop");
            let desktop = root.join("BestScout.desktop");
            let icon = root.join("icon.png");
            fs::write(
                &config,
                r#"{
                  "productName":"BestScout",
                  "version":"1.0.0",
                  "bundle":{
                    "license":"GPL-3.0-or-later",
                    "shortDescription":"Test package",
                    "longDescription":"Reproducibility fixture",
                    "homepage":"https://example.invalid",
                    "linux":{"rpm":{"epoch":0,"release":"1"}}
                  }
                }"#,
            )?;
            fs::write(
                &binary,
                [b"prefix".as_slice(), BUNDLE_MARKER, b"suffix"].concat(),
            )?;
            fs::set_permissions(&binary, fs::Permissions::from_mode(0o755))?;
            fs::write(&desktop, "[Desktop Entry]\nName=BestScout\n")?;
            fs::write(&icon, b"png")?;
            let first = root.join("first.rpm");
            let second = root.join("second.rpm");
            for output in [&first, &second] {
                PackageBuilder::new(
                    "best-scout",
                    "1.0.0",
                    "GPL-3.0-or-later",
                    env::consts::ARCH,
                    "Test package",
                )
                .description("Reproducibility fixture")
                .url("https://example.invalid")
                .requires(Dependency::any("libwebkit2gtk-4.1.so.0()(64bit)"))
                .provides(Dependency::greater_eq("bestscout-virtual", "0.9"))
                .recommends(Dependency::any("bestscout-helper"))
                .conflicts(Dependency::less("bestscout-legacy", "0.1"))
                .obsoletes(Dependency::less_eq("bestscout-old", "0.1"))
                .suggests(Dependency::any("bestscout-docs"))
                .enhances(Dependency::any("football-manager"))
                .supplements(Dependency::any("steam"))
                .with_file(
                    &binary,
                    FileOptions::new("/usr/bin/bestscout-desktop").mode(FileMode::regular(0o755)),
                )?
                .with_file(
                    &desktop,
                    FileOptions::new("/usr/share/applications/BestScout.desktop")
                        .mode(FileMode::regular(0o644)),
                )?
                .with_file(
                    &icon,
                    FileOptions::new("/usr/share/icons/hicolor/512x512/apps/bestscout-desktop.png")
                        .mode(FileMode::regular(0o644)),
                )?
                .build()?
                .write_file(output)?;
                run(Ok(Arguments {
                    source_date_epoch: 1_600_000_000,
                    config: config.clone(),
                    binary: binary.clone(),
                    desktop: desktop.clone(),
                    icon: icon.clone(),
                    output: output.clone(),
                }))?;
            }
            assert_eq!(fs::read(&first)?, fs::read(&second)?);
            assert_eq!(
                rpm::Package::open(first)?.metadata.get_build_time()?,
                1_600_000_000
            );
            assert!(
                rpm::Package::open(second)?
                    .metadata
                    .get_requires()?
                    .iter()
                    .any(|dependency| dependency.name == "libwebkit2gtk-4.1.so.0()(64bit)")
            );
            Ok(())
        })();
        fs::remove_dir_all(&root).unwrap();
        result.unwrap();
    }
}
