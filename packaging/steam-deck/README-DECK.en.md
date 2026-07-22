# BestScout @VERSION@ on Steam Deck

This edition is the native x86_64 AppImage. It can inspect the host FM26 process;
the Flatpak edition cannot because its process namespace is intentionally isolated.

1. Download `@APPIMAGE@` and `@LAUNCHER@` into the same folder.
2. In Desktop Mode, mark both files executable in Properties, or run
   `chmod +x @APPIMAGE@ @LAUNCHER@`.
3. Test `./@LAUNCHER@` once in Desktop Mode.
4. In Steam, choose **Games → Add a Non-Steam Game**, browse to `@LAUNCHER@`,
   and add it to the library. Gaming Mode then launches the same native edition.

If SteamOS reports that FUSE is unavailable, set the Steam launch option to
`BESTSCOUT_APPIMAGE_EXTRACT_AND_RUN=1 %command%`. Extraction is slower, so use
this only as a fallback.

Verify the checksum and signed provenance before first launch:

```bash
sha256sum -c SHA256SUMS --ignore-missing
gh attestation verify @APPIMAGE@ \
  --repo maxionice/bestscout \
  --signer-workflow github.com/maxionice/bestscout/.github/workflows/release.yml
```

BestScout never starts or closes FM26. Bridge updates are refused while FM is
running, and live writes remain disabled until the exact FM26 adapter is accepted.
