# BestScout @VERSION@ auf Steam Deck

Diese Ausgabe ist die native x86_64-AppImage. Sie kann den FM26-Prozess des Hosts
prüfen; die Flatpak-Ausgabe kann das wegen ihres absichtlich isolierten
Prozess-Namensraums nicht.

1. `@APPIMAGE@` und `@LAUNCHER@` in denselben Ordner laden.
2. Im Desktop-Modus beide Dateien in den Eigenschaften ausführbar machen oder
   `chmod +x @APPIMAGE@ @LAUNCHER@` ausführen.
3. `./@LAUNCHER@` einmal im Desktop-Modus testen.
4. In Steam **Spiele → Steam-fremdes Spiel hinzufügen** wählen, `@LAUNCHER@`
   auswählen und zur Bibliothek hinzufügen. Der Gaming-Modus startet anschließend
   dieselbe native Ausgabe.

Falls SteamOS fehlendes FUSE meldet, als Steam-Startoption
`BESTSCOUT_APPIMAGE_EXTRACT_AND_RUN=1 %command%` setzen. Die Extraktion ist
langsamer und nur als Rückfall gedacht.

Vor dem ersten Start Prüfsumme und signierte Provenienz prüfen:

```bash
sha256sum -c SHA256SUMS --ignore-missing
gh attestation verify @APPIMAGE@ \
  --repo maxionice/bestscout \
  --signer-workflow github.com/maxionice/bestscout/.github/workflows/release.yml
```

BestScout startet oder beendet FM26 nie selbst. Bridge-Updates werden bei
laufendem FM verweigert; Live-Schreibzugriffe bleiben bis zur Abnahme des exakten
FM26-Adapters deaktiviert.
