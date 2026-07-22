#!/usr/bin/env bash
set -euo pipefail

bestscout_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$bestscout_root"

node scripts/verify-release-metadata.mjs
npm ci
NO_STRIP=1 npm run tauri --workspace @bestscout/desktop -- build --bundles appimage,deb,rpm
node scripts/verify-linux-bundles.mjs --write-checksums
