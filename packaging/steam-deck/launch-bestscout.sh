#!/usr/bin/env bash
set -euo pipefail

launcher_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
appimage="$launcher_dir/@APPIMAGE@"

if [[ ! -f "$appimage" ]]; then
  printf 'BestScout Steam Deck AppImage is missing: %s\n' "$appimage" >&2
  exit 1
fi
if [[ ! -x "$appimage" ]]; then
  printf 'BestScout Steam Deck AppImage is not executable. Run: chmod +x %q\n' "$appimage" >&2
  exit 1
fi

if [[ "${BESTSCOUT_APPIMAGE_EXTRACT_AND_RUN:-0}" == "1" ]]; then
  export APPIMAGE_EXTRACT_AND_RUN=1
fi

exec "$appimage" "$@"
