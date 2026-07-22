#!/usr/bin/env bash
set -euo pipefail

bestscout_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$bestscout_root"

if [[ ! "${SOURCE_DATE_EPOCH:-}" =~ ^[1-9][0-9]{0,9}$ ]] \
  || (( SOURCE_DATE_EPOCH > 4294967295 )); then
  echo "SOURCE_DATE_EPOCH must be a positive RPM-compatible timestamp" >&2
  exit 1
fi

bestscout_version="$(node -p "require('./apps/desktop/src-tauri/tauri.conf.json').version")"
deb_name="BestScout_${bestscout_version}_amd64"
rpm_name="BestScout-${bestscout_version}-1.x86_64"

cargo run --quiet --release -p bestscout-packaging --bin bestscout-reproducible-deb -- \
  --package-directory "target/release/bundle/deb/$deb_name" \
  --output "target/release/bundle/deb/$deb_name.deb" \
  --source-date-epoch "$SOURCE_DATE_EPOCH"

cargo run --quiet --release -p bestscout-packaging --bin bestscout-packaging -- \
  --source-date-epoch "$SOURCE_DATE_EPOCH" \
  --config apps/desktop/src-tauri/tauri.conf.json \
  --binary target/release/bestscout-desktop \
  --desktop "target/release/bundle/rpm/$rpm_name/usr/share/applications/BestScout.desktop" \
  --icon apps/desktop/src-tauri/icons/icon.png \
  --output "target/release/bundle/rpm/$rpm_name.rpm"
