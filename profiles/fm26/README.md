# FM26 compatibility profiles

Profiles are allowlists, not guesses. An exact match requires the Steam build ID
and SHA-256 hashes of `fm.exe`, `GameAssembly.dll`, and
`fm_Data/il2cpp_data/Metadata/global-metadata.dat`.

Capabilities are approved independently:

- `process_inspection`: process maps and module bases may be inspected.
- `domain_read`: known game-domain layouts may be decoded.
- `domain_write`: validated transactions may modify explicitly listed fields.

A new profile starts with only process inspection. Domain read and write flags may
be enabled only after fixture-backed validation for that exact build. Never copy
offsets, signatures, code or assets from closed-source tools.
