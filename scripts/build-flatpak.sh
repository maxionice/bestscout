#!/usr/bin/env bash
set -euo pipefail

bestscout_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
flatpak_dir="$bestscout_root/packaging/flatpak"
flatpak_build_dir="$flatpak_dir/build-dir"
flatpak_repo_dir="$flatpak_dir/repo"
bestscout_binary="$bestscout_root/target/release/bestscout-desktop"

command -v flatpak >/dev/null
command -v flatpak-builder >/dev/null
test -x "$bestscout_binary"

bestscout_version="$(node -p "require('$bestscout_root/apps/desktop/src-tauri/tauri.conf.json').version")"
mkdir -p "$bestscout_root/release-artifacts"
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak-builder --user --force-clean --install-deps-from=flathub \
  "$flatpak_build_dir" "$flatpak_dir/io.github.maxionice.bestscout.yml"
flatpak build-export "$flatpak_repo_dir" "$flatpak_build_dir" stable
flatpak build-bundle "$flatpak_repo_dir" \
  "$bestscout_root/release-artifacts/BestScout_${bestscout_version}_x86_64.flatpak" \
  io.github.maxionice.bestscout stable
