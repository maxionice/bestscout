#!/usr/bin/env bash
set -euo pipefail

bestscout_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$bestscout_root"

if [[ -z "${SOURCE_DATE_EPOCH:-}" ]]; then
  SOURCE_DATE_EPOCH="$(git show -s --format=%ct HEAD)"
fi
export SOURCE_DATE_EPOCH
export TZ=UTC
export LC_ALL=C

node scripts/verify-release-metadata.mjs
npm ci
NO_STRIP=1 npm run tauri --workspace @bestscout/desktop -- \
  build --bundles appimage,deb,rpm -- --locked
scripts/normalize-linux-packages.sh
node scripts/verify-linux-bundles.mjs --write-checksums --native-only
