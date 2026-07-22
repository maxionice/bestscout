# Bridge lifecycle

BestScout treats the in-game bridge as a managed, reversible deployment rather
than an arbitrary file copy. Status inspection is read-only. Install, update and
uninstall require both an exact FM26 compatibility profile and no detected FM
game or launcher process.

## Managed files

Only these paths belong to the lifecycle manager:

- `BepInEx/plugins/BestScout/BestScout.Bridge.dll`
- `BepInEx/plugins/BestScout/bestscout-install.json`

The versioned manifest records the compatibility-profile ID, bridge version,
file name, byte size, SHA-256 and installation timestamp. No Football Manager
assembly, save data, token or absolute artifact source path is stored in it.

## Safety states

- `not_installed`: neither managed file exists.
- `managed`: both files are regular files and the DLL exactly matches the
  bounded manifest.
- `unmanaged_file`: a DLL exists without a manifest.
- `missing_binary`: a valid manifest exists without its DLL.
- `invalid_manifest`: the manifest is malformed, oversized, symlinked or outside
  the accepted schema.
- `modified`: the current DLL size or hash differs from the manifest.
- `transaction_residue`: an interrupted operation left inert staging, rollback
  or removal files behind.

Only `not_installed` may become a new install. Only `managed` may be updated or
removed. A different profile, any other state, or leftover transaction file is a
hard stop that requires manual inspection.

## Transaction

The artifact must be a regular non-symlink file named `BestScout.Bridge.dll`, be
at most 32 MiB and carry a PE `MZ` signature. It is copied to the final filesystem
under a unique staging name, re-hashed there and synced. The bounded JSON
manifest is staged and synced separately. Updates move the verified previous pair
to inert rollback names before activating the new pair; activation errors restore
the previous files. Uninstall first renames both managed files to inert names,
syncs the directory and only then removes them.

The lifecycle intentionally offers no force flag. It also never injects into a
running process.

## CLI

```bash
cargo run -p bestscout-live --bin bestscout-bridge -- status \
  --game-root "/path/to/Football Manager 26"

# Run mutations only after FM26 has been closed normally.
cargo run -p bestscout-live --bin bestscout-bridge -- install \
  --game-root "/path/to/Football Manager 26" \
  --artifact "/path/to/BestScout.Bridge.dll"

cargo run -p bestscout-live --bin bestscout-bridge -- uninstall \
  --game-root "/path/to/Football Manager 26"
```

Every command returns machine-readable JSON. Mutation failures return a non-zero
exit code.
