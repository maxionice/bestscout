#!/usr/bin/env bash
set -euo pipefail

bestscout_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ $# -ne 1 ]]; then
  printf 'usage: %s "/path/to/Football Manager 26"\n' "$0" >&2
  exit 2
fi

bestscout_fm_root="$(realpath -- "$1")"
bestscout_project="$bestscout_root/bridge/BestScout.Bridge/BestScout.Bridge.csproj"
bestscout_output="$bestscout_root/bridge/BestScout.Bridge/bin/Release/net6.0"
bestscout_dll="$bestscout_output/BestScout.Bridge.dll"
bestscout_pdb="$bestscout_output/BestScout.Bridge.pdb"
bestscout_deps="$bestscout_output/BestScout.Bridge.deps.json"

test -f "$bestscout_fm_root/BepInEx/core/BepInEx.Unity.IL2CPP.dll"
test -f "$bestscout_fm_root/BepInEx/interop/FM.UI.dll"
test "$(dotnet --version)" = "10.0.110"

build_bridge() {
  dotnet build "$bestscout_project" -t:Rebuild -c Release --nologo \
    -p:FM26Root="$bestscout_fm_root"
}

build_bridge
for bestscout_artifact in "$bestscout_dll" "$bestscout_pdb" "$bestscout_deps"; do
  test -f "$bestscout_artifact"
  test ! -L "$bestscout_artifact"
done
bestscout_first_dll="$(sha256sum "$bestscout_dll" | cut -d ' ' -f 1)"
bestscout_first_pdb="$(sha256sum "$bestscout_pdb" | cut -d ' ' -f 1)"
bestscout_first_deps="$(sha256sum "$bestscout_deps" | cut -d ' ' -f 1)"

build_bridge
bestscout_second_dll="$(sha256sum "$bestscout_dll" | cut -d ' ' -f 1)"
bestscout_second_pdb="$(sha256sum "$bestscout_pdb" | cut -d ' ' -f 1)"
bestscout_second_deps="$(sha256sum "$bestscout_deps" | cut -d ' ' -f 1)"
test "$bestscout_first_dll" = "$bestscout_second_dll"
test "$bestscout_first_pdb" = "$bestscout_second_pdb"
test "$bestscout_first_deps" = "$bestscout_second_deps"

bestscout_dll_size="$(stat --printf='%s' "$bestscout_dll")"
bestscout_pdb_size="$(stat --printf='%s' "$bestscout_pdb")"
bestscout_deps_size="$(stat --printf='%s' "$bestscout_deps")"
for bestscout_artifact_size in \
  "$bestscout_dll_size" "$bestscout_pdb_size" "$bestscout_deps_size"; do
  test "$bestscout_artifact_size" -gt 0
  test "$bestscout_artifact_size" -le 33554432
done
test "$(od -An -tx1 -N2 "$bestscout_dll" | tr -d ' \n')" = "4d5a"
grep -Fq '.NETCoreApp,Version=v6.0' "$bestscout_deps"

bestscout_outputs="$(find "$bestscout_output" -maxdepth 1 -type f -printf '%f\n' | LC_ALL=C sort)"
bestscout_expected_outputs=$'BestScout.Bridge.deps.json\nBestScout.Bridge.dll\nBestScout.Bridge.pdb'
test "$bestscout_outputs" = "$bestscout_expected_outputs"
test -z "$(find "$bestscout_output" -maxdepth 1 -type l -print -quit)"
for bestscout_artifact in "$bestscout_dll" "$bestscout_pdb" "$bestscout_deps"; do
  if grep -aFq "$bestscout_root" "$bestscout_artifact" \
    || grep -aFq "$bestscout_fm_root" "$bestscout_artifact"; then
    printf 'bridge artifact leaks a local build path: %s\n' "$bestscout_artifact" >&2
    exit 1
  fi
done

printf '{\n'
printf '  "sdk": "10.0.110",\n'
printf '  "target": "net6.0",\n'
printf '  "dll_bytes": %s,\n' "$bestscout_dll_size"
printf '  "dll_sha256": "%s",\n' "$bestscout_second_dll"
printf '  "pdb_bytes": %s,\n' "$bestscout_pdb_size"
printf '  "pdb_sha256": "%s",\n' "$bestscout_second_pdb"
printf '  "deps_bytes": %s,\n' "$bestscout_deps_size"
printf '  "deps_sha256": "%s"\n' "$bestscout_second_deps"
printf '}\n'
