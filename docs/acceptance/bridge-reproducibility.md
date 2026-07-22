# Bridge build reproducibility acceptance — 2026-07-22

This gate covers only the local compilation process and artifact boundaries. It
does not replace positive BepInEx load, domain-root, reader or writer acceptance.

## Pinned inputs

- `global.json` requires .NET SDK `10.0.110`, disables roll-forward and rejects
  preview SDKs.
- The plugin targets `net6.0` for the actual BepInEx host and pins C# 10 rather
  than following the SDK's latest language version.
- Assembly and informational versions are explicitly `0.5.0`; the SDK's
  checkout-revision suffix is disabled so documentation-only commits cannot
  alter distributable bytes.
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
| `BestScout.Bridge.dll` | 84,992 | `f24ff2949fa8052ca8d29079aabf6a0420b98188b3688756d5eb858771b19cd4` |
| `BestScout.Bridge.pdb` | 26,672 | `21bf3dc21a5603d463ae2a09dce8ed35d9f53df163f64119af6093040d382209` |
| `BestScout.Bridge.deps.json` | 418 | `2fec98e69fe18446e8dd835dad10fe01e98407909f15b45f632a17ebcf85cd22` |

Command:

```text
scripts/build-bridge.sh "/path/to/Football Manager 26"
```

The committed candidate was also built from a detached worktree under a
different absolute path. Direct `cmp` checks confirmed all three files were
byte-identical to the primary checkout. The hashes are therefore functions of
the accepted source and local FM reference set, not of the checkout location or
current Git revision.

The 86,528-byte hash in the earlier bridge lifecycle record remains historical
evidence from before SDK/language/path pinning. It is not the current candidate.
FM was running during this read-only compilation, so no installed plugin or
manifest was changed. Runtime acceptance still requires a normal user shutdown,
managed installation and a later user-started FM session.
