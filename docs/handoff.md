# Current development handoff

Stand: 2026-07-22, Europe/Berlin

Dieses Dokument ist der verbindliche Einstiegspunkt. BestScout ist noch nicht
1.0: Die implementierten kanonischen Funktionen sind gestapelt veröffentlicht,
aber native UI-, echte FM26-Lese-/Schreib- und Hardware-/Signatur-Gates bleiben
bewusst offen.

## Repository und Pull-Request-Stack

- Lokaler Pfad: `/home/maxi/Dokumente/bestscout`
- Öffentliches Repository: `https://github.com/maxionice/bestscout`
- Stabiler `main`: `cb2191b225145098e285d733ebab57d0dca1423e`
- Letzter Merge: PR #24, vollständiges Transfer Center

Der aktuelle Stack ist absichtlich linear:

| PR | Branch | Basis | Inhalt |
| ---: | --- | --- | --- |
| #25 | `agent/staff-registrations-relationships` | `main` | People & Registration Center |
| #26 | `agent/club-finance-facilities` | PR #25 | Club Operations Center |
| #27 | `agent/competitions-fixtures-stages` | PR #26 | Competition Operations Center |
| #28 | `agent/live-domain-readers` | PR #27 | begrenztes FM26-Referenzsampling |
| #29 | `agent/release-hardening` | PR #28 | Linux-/Steam-Deck-Pakete und signierter Release-Workflow |
| #30 | `agent/newgen-facepacks` | PR #29 | sichere Newgen-Facepack-Werkzeuge |
| #31 | `agent/bilingual-documentation` | PR #30 | deutsche und englische Benutzerdokumentation |
| #32 | `agent/bridge-reproducibility` | PR #31 | reproduzierbarer lokaler Bridge-Build |
| #33 | `agent/release-readiness-gates` | PR #32 | harte 1.0-Release-Readiness-Gates |
| #34 | `agent/club-branding-relationships` | PR #33 | Clubfarben, Trikots und Clubbeziehungen |
| #35 | `agent/person-appearance-preferred-moves` | PR #34 | Personenprofile und bevorzugte Spielzüge |
| #36 | `agent/contract-bonuses-clauses` | PR #35 | typisierte Vertragsboni und -klauseln |
| #37 | `agent/release-artifact-freshness` | PR #36 | frische Native-Paketmanifeste ohne optionale Altartefakte |
| #38 | `agent/release-upload-allowlist` | PR #37 | checksum-basierte Release-Upload-Allowlist |
| #39 | `agent/ci-native-package-entrypoint` | PR #38 | einheitlicher lokaler und CI-Native-Paketpfad |

PR #25 bis #37 sind offen, Draft, mergebar und vollständig grün. PR #38 und #39
wurden nach vollständiger lokaler Prüfung als Draft geöffnet; deren GitHub-CI
läuft. Keine offene Draft-Stufe als bereits in `main` enthalten behandeln.

## Implementierter Stand

- kanonische Spieler-, Staff-, Club-, Wettbewerbs- und Transfermodelle;
- kanonische Personenprofile mit weiteren Nationalitäten, begrenztem
  Erscheinungsbild und bevorzugten Spielzügen;
- rückwärtskompatible Vertragsboni und typisierte Geld-, Prozent- und
  Zählklauseln samt beidseitiger Transfer-UI;
- kanonische Clubfarben, vier typisierte Trikotslots und referenzielle
  Clubbeziehungen;
- Suche, Filter, Rollenratings, Entwicklungs-/Marktlisten und Squad-Analyse;
- zweiphasige, konfliktgeprüfte Commands für People, Clubs, Wettbewerbe,
  Transfers, Verfügbarkeit, Mass Edit und Freezer;
- gemeinsamer Backup-, Journal-, Read-back- und Undo-Pfad für kanonische Daten;
- sichere, bestätigungspflichtige Newgen-Facepack-Planung, Installation,
  Verifikation und Entfernung;
- AppImage, DEB, RPM, Flatpak und Steam-Deck-Edition samt Bundle-Verifikation;
- native Paketmanifeste, die vorhandene optionale Altartefakte ausdrücklich
  ausschließen und nur die gerade gebauten AppImage-/DEB-/RPM-Dateien ausweisen;
- ein gemeinsamer, durch Metadatenprüfung fixierter Native-Paketbefehl für lokale
  Entwicklung und Linux-Bundle-CI;
- OIDC-/Sigstore-Attestierungsworkflow, der einen Draft-Release erst nach
  vollständigen Artefakten und erfolgreicher unabhängiger Verifikation
  veröffentlicht;
- checksum-basierte Upload-Allowlist mit erneuter Hash-, Pfad- und
  Sigstore-JSON-Prüfung; fremde Staging-Dateien erreichen GitHub nicht;
- ein tag-, versions- und main-gebundener Release-Readiness-Prüfer, der alle
  Roadmap-, Paritäts- und Acceptance-Gates scannt;
- topic-parallele deutsche und englische Benutzerhandbücher mit automatischer
  Link- und Vollständigkeitsprüfung;
- Bridge 0.5.0 für den .NET-6-BepInEx-Host mit authentifiziertem, begrenztem,
  rein lesendem Referenzsampler.

Der Einstieg liegt in der [`Architekturübersicht`](architecture/overview.md),
der [`Editor-Abnahme`](acceptance/editor-workspace.md) und der
[`Feature-Parity-Spezifikation`](feature-parity.md); die verlinkten
Bereichsdokumente bleiben jeweils maßgeblich.

## Aktueller Prüfstand

Auf `agent/ci-native-package-entrypoint` erfolgreich ausgeführt:

```text
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --all-targets
node --test scripts/*.test.mjs
npm test --workspace @bestscout/desktop
npm run build --workspace @bestscout/desktop
node scripts/verify-release-metadata.mjs
node scripts/verify-release-readiness.mjs
scripts/build-linux-packages.sh
scripts/build-bridge.sh "/path/to/Football Manager 26"
```

Ergebnis: 127 Rust-Tests, 66 Vitest-/DOM-Tests, 14 Node-Release-/Doku-Tests,
Clippy ohne Warnung, Formatierung, TypeScript/Vite, Linux-Pakete und
Release-Metadaten grün. Der Readiness-Prüfer meldet exakt 62 noch offene 1.0-
Gates und blockiert deshalb korrekt einen stabilen Release.
Der Bridge-Build wurde vor und nach Commit sowie in einem zweiten absoluten
Checkout-Pfad bytegleich bestätigt:

| Artefakt | Bytes | SHA-256 |
| --- | ---: | --- |
| `BestScout.Bridge.dll` | 84,992 | `d3f4225b59765ea39885039ebafd6eb3a7426f59e80d8383dc7a40888a408056` |
| `BestScout.Bridge.pdb` | 25,876 | `fa32ca1cd054c38f0a5b17518730c66edeaeef0ccdeb97e188bc2abe4b44137d` |
| `BestScout.Bridge.deps.json` | 418 | `2fec98e69fe18446e8dd835dad10fe01e98407909f15b45f632a17ebcf85cd22` |

Details: [`bridge-reproducibility.md`](acceptance/bridge-reproducibility.md).

Der lokale Paketbefehl erzeugt frisch AppImage, DEB und RPM. Sein expliziter
`--native-only`-Prüfpfad ignoriert vorhandene optionale Flatpak-/Steam-Deck-
Dateien und schrieb bei der realen Regression ausschließlich diese drei frisch
gebauten Pakete in Report und `SHA256SUMS`. Der Release-Workflow bleibt getrennt
fail-closed: Er baut alle acht Dateien in einem sauberen Runner und verlangt den
vollständigen Satz mit `--require-release-set`.

Vor dem finalen GitHub-Upload wird dieser Satz aus `SHA256SUMS` erneut
rekonstruiert und gehasht. Zugelassen sind genau acht Release-Subjects, das
Manifest und das geparste Sigstore-Bundle. Die Steam-Deck-AppImage muss außerdem
bytegleich zur aktuellen nativen AppImage sein.

Zwei erfolgreiche Native-Paketläufe mit unveränderten Desktop-Quellen ergaben
unterschiedliche Paket-Hashes. Die Pakete sind funktional validiert, aber noch
nicht byte-reproduzierbar; das zugehörige 1.0-Gate bleibt deshalb offen. Als
nächster unabhängiger Schritt sind `SOURCE_DATE_EPOCH`, Archivzeitstempel und die
Tauri-/linuxdeploy-Paketstufen gezielt zu isolieren.

## Native UI-Gates

Die verbindliche In-App-Browserliste war leer (`[]`). People, Club,
Wettbewerb und Facepack wurden deshalb nicht als native breite/schmale Tauri-
Ansichten, per vollständiger Tastaturnavigation oder mit Randdatensätzen
abgenommen.

Bis eine steuerbare native Ansicht verfügbar ist:

- die betroffenen PRs Draft lassen;
- keine native Checkbox markieren;
- keine 1.0-Parität behaupten;
- nicht auf ein anderes Browser-Backend ausweichen.

Wenn die Ansicht verfügbar ist, PR #25 zuerst nativ abnehmen und nach aktueller
grüner CI mergen. Danach jeden gestapelten PR in Reihenfolge auf den gemergten
Vorgänger bringen, dessen eigene Gates prüfen und erst dann mergen.

## FM26- und Bridge-Status

Letzte rein lesende Prüfung:

- Steam-Build `23583635`, Profil `fm26-steam-23583635`, exakter Treffer;
- reales `fm.exe` PID `172108`, vom Nutzer gestartet und weiterhin laufend;
- Bridge 0.4.0 verwaltet und hashverifiziert installiert;
- BepInEx 6 verwarf den alten net8-Build im .NET-6.0.7-Host vor `Load()`;
- `reader_allowed=false`, `editor_allowed=false`;
- Bridge 0.5.0 ist lokal reproduzierbar gebaut, aber bei laufendem FM absichtlich
  weder installiert noch anderweitig in der Installation verändert.

Verbindliche Sicherheitsgrenzen:

- FM niemals für den Nutzer starten oder schließen.
- Bridge niemals bei laufendem FM installieren, ändern oder entfernen.
- Keine Live-Mutation, bevor Domain-Roots, jeder feldgenaue Adapter,
  Main-Thread-Ausführung, Read-back, Rollback und Undo auf dem exakten Build
  einzeln abgenommen sind.
- Grüne kanonische Commands schalten keine Live-Rechte frei.

Nach einem normalen, vom Nutzer ausgeführten FM-Ende zuerst Prozessfreiheit
erneut prüfen. Dann den Kandidaten ausschließlich über den verwalteten Lifecycle
installieren:

```text
scripts/build-bridge.sh "/home/maxi/.local/share/Steam/steamapps/common/Football Manager 26"
cargo run -p bestscout-live --bin bestscout-bridge -- install \
  --game-root "/home/maxi/.local/share/Steam/steamapps/common/Football Manager 26" \
  --artifact bridge/BestScout.Bridge/bin/Release/net6.0/BestScout.Bridge.dll
```

FM anschließend weiterhin nicht selbst starten. Erst nach einem vom Nutzer
gestarteten FM und geladenen Spielstand mit Diagnose, Root-Katalog und kleinen,
rein lesenden Referenzsamples fortfahren.

## Verbleibende 1.0-Gates

- native Tauri-Abnahme aller großen Arbeitsbereiche;
- echte FM26-Domain-Roots und vollständige Leseadapter;
- feldgenaue Live-Writer mit Read-back, Rollback, Journal und Undo;
- Newgen-Facepack-Skin-Refresh in einem unterstützten Save;
- Steam-Deck-Hardwaretest;
- reale Tag-Pipeline mit veröffentlichter Sigstore-Attestierung;
- vollständiger linearer Merge des Draft-Stacks;
- abschließender Versionssprung, Paket-Rebuild, Installationsmatrix und
  veröffentlichter GitHub-Release 1.0.0.

Keines dieser realweltlichen Gates durch Simulation oder statische Tests als
erledigt markieren.
