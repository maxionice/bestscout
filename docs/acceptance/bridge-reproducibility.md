# Bridge build reproducibility acceptance — 2026-07-22

This gate covers only the local compilation process and artifact boundaries. It
does not replace positive BepInEx load, domain-root, reader or writer acceptance.

## Pinned inputs

- `global.json` requires .NET SDK `10.0.110`, disables roll-forward and rejects
  preview SDKs.
- The plugin targets `net6.0` for the actual BepInEx host and pins C# 10 rather
  than following the SDK's latest language version.
- MSBuild deterministic/CI settings are enabled and `PathMap` removes the local
  checkout prefix from compiler output.
- FM26, BepInEx and generated interop references come only from the user's local
  installation and remain `Private=false`.

## Automated acceptance

`scripts/build-bridge.sh` performs two clean Release rebuilds and requires
identical hashes for DLL, portable PDB and deps manifest. It then verifies:

- exactly those three regular, non-symlink output files;
- non-empty, bounded output sizes and a PE `MZ` signature on the DLL;
- `.NETCoreApp,Version=v6.0` in the dependency manifest;
- no local checkout or FM installation path in any output.

The accepted result on the exact local FM26 reference set was:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `BestScout.Bridge.dll` | 84,992 | `ee79abf5f85e048a636af3bb65d7ed623265e8e4b7e1afecd6a175686fef0600` |
| `BestScout.Bridge.pdb` | 26,704 | `ac01b384a140e167a49d8622ac483870afccb6798186623050f3908bbe6bd87c` |
| `BestScout.Bridge.deps.json` | 418 | `aedf7228c53b8d055576c3b007aecd4d4e14565b8bfab217d794557db8b5f5f9` |

Command:

```text
scripts/build-bridge.sh "/path/to/Football Manager 26"
```

The 86,528-byte hash in the earlier bridge lifecycle record remains historical
evidence from before SDK/language/path pinning. It is not the current candidate.
FM was running during this read-only compilation, so no installed plugin or
manifest was changed. Runtime acceptance still requires a normal user shutdown,
managed installation and a later user-started FM session.
