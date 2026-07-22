# Current development handoff

Stand: 2026-07-22, Europe/Berlin

Dieses Dokument ist der Einstiegspunkt für die nächste Arbeitssitzung. Es hält
bewusst auch den unfertigen Stand fest. Architektur- und Acceptance-Dokumente
bleiben die fachliche Quelle; dieser Handoff beschreibt Branch, Prüfstatus,
externe Voraussetzungen und die exakte Reihenfolge zum Weitermachen.

## Repository und veröffentlichter Stand

- Lokaler Pfad: `/home/maxi/Dokumente/bestscout`
- Öffentliches Repository: `https://github.com/maxionice/bestscout`
- Stabiler Remote-Branch: `main`
- Aktueller stabiler Commit: `bf21187ea25f2c21d468550766455d75425077dd`
- Aktiver Arbeitsbranch: `agent/transfer-center`
- Der Transfer-Block ist ein lokaler WIP-Checkpoint und noch nicht gemergt.

Zuletzt gemergte Meilensteine:

- PR #23: Player Availability Center, Fitness, Moral, Verletzungen und Sperren
- PR #22: Attribute Freezer und Change Monitor
- PR #21: validierter FM26 Reference Catalog
- PR #20: reproduzierbare Linux-Pakete
- PR #19: sicherer Bridge-Lifecycle

## Fertiger Availability-Block

PR #23 ist vollständig gemergt. Enthalten sind:

- kanonische Fitness-, Moral-, Zufriedenheits-, Verletzungs- und Sperrendaten;
- Spieltag im Snapshot und vollständige verschachtelte Validierung;
- deterministische Verfügbarkeitsanalyse mit Belegen und Score;
- sichere Aktionen für Fitness, Verletzungen, Sperren, Moral und Matchbereitschaft;
- explizite Mehrfachauswahl, Vorschau, Backup, Hash-Journal und Undo;
- dunkler HeroUI-v3-Arbeitsbereich im eigenen rahmenlosen Fenster;
- Datenbankspalten, allgemeine Editorfelder, Architektur und Acceptance.

Öffentlicher PR: `https://github.com/maxionice/bestscout/pull/23`

## Aktueller WIP: Transfer Center

Der aktive Branch enthält bereits folgende Implementierung:

- `FutureTransfer` mit permanentem Wechsel, Leihe, ablösefreiem Wechsel und
  Tausch-Metadaten;
- Transferstatus, Ausgangs-/Zielverein, In-Game-Daten, Gebühr, Leihende,
  Gehaltsanteil und Swap-Spielerreferenz;
- Snapshot-Validierung für Club-/Spielerreferenzen, eindeutige IDs,
  Datumsreihenfolge, Gebühren, Leih- und Swap-Regeln;
- `TransferCommand` für Sofortwechsel, Zukunftsvereinbarung, Storno und fälligen
  Abschluss;
- atomare Änderung von Spielerverein, Vertrag und Zukunftstransfer mit exakten
  `expected_before`-Werten;
- bewusste Sperre für einen halben Swap: der Abschluss eines Tauschtransfers wird
  abgelehnt, bis die reziproke Zwei-Spieler-Transaktion existiert;
- Tauri-Command `prepare_transfer_action`;
- vollständiges dunkles HeroUI-v3 Transfer Center mit Spieler- und Zielauswahl,
  permanent/Leihe/ablösefrei, Vertragsparametern, Vorschau und Journal-Commit;
- Transferspalten in Datenbank und Spielersuche sowie JSON-Zugriff im Editor;
- Architektur- und Acceptance-Dokumente unter
  `docs/architecture/transfers.md` und `docs/acceptance/transfers.md`.

Zentrale WIP-Dateien:

- `crates/bestscout-core/src/transfers.rs`
- `crates/bestscout-core/src/model.rs`
- `crates/bestscout-core/src/validation.rs`
- `apps/desktop/src/TransferWorkspace.tsx`
- `apps/desktop/src/TransferWorkspace.test.tsx`
- `apps/desktop/src-tauri/src/lib.rs`

## Letzter verifizierter Prüfstand

Auf dem Transfer-WIP wurden zuletzt erfolgreich ausgeführt:

```bash
cargo fmt --all
git diff --check
cargo test --workspace --all-targets
cargo clippy --workspace --all-targets -- -D warnings
cd apps/desktop && npm test && npm run build
```

Ergebnis:

- 84 Rust-Tests bestanden;
- 38 Vitest-/DOM-Tests bestanden;
- Clippy mit `-D warnings` bestanden;
- TypeScript- und Vite-Produktionsbuild bestanden;
- keine Diff-Whitespace-Fehler.

Der anschließend gestartete Befehl

```bash
scripts/build-linux-packages.sh
```

wurde auf Wunsch des Nutzers während der nativen Kompilierung mit Exit-Code 130
abgebrochen. Das war eine kontrollierte Pause, kein Fehlerbefund. AppImage, DEB
und RPM gelten für den Transfer-WIP daher noch nicht als abgenommen und müssen
beim Fortsetzen neu gebaut werden. Build-Zwischenstände liegen nur im
git-ignorierten `target/`-Verzeichnis.

Eine visuelle Browser-Abnahme war nicht möglich, weil die In-App-Browserliste in
dieser Sitzung leer war. Nicht auf einen fremden Browser-Backend ausweichen. Die
native Tauri-Sichtprüfung bleibt offen.

## FM26- und Bridge-Status

Letzte rein lesende Diagnose in dieser Sitzung:

- FM26 lief als PID `1517254`;
- Steam-Build `23583635`;
- Kompatibilitätsprofil `fm26-steam-23583635` war ein exakter Treffer;
- Prozessinspektion und PE-Signaturprüfung waren erfolgreich;
- `domain_read=false` und `domain_write=false` blieben korrekt gesperrt;
- keine BestScout-Bridge war installiert;
- das Plugin-Verzeichnis war nicht vorhanden.

Verifizierte Fingerprints:

- `fm.exe`: `3653c97f9ccec2be28edc4faae67304b5b6c26733f2f07dea3e7c591d3b9ff73`
- `GameAssembly.dll`: `7ce3eb474dc6093df633f979e869e55b2ec7953fde2e732392a694d379ff7a0c`
- `global-metadata.dat`: `52287eadeb07d3d222c9e370e64f308260934911807e2073fb0e72f49c273213`

Bridge-Kandidat:

- Version `0.4.0`
- Datei: `bridge/BestScout.Bridge/bin/Release/net8.0/BestScout.Bridge.dll`
- SHA-256: `6e00672924f73f76c7450764e7eb875c43a3e6ac315710790404503a30cb8c5d`

Sicherheitsregel: FM niemals für den Nutzer schließen und die Bridge niemals
während eines laufenden FM-Prozesses installieren, aktualisieren oder entfernen.
Der Nutzer beendet FM normal. Erst danach den Status erneut prüfen.

## Exakte Wiederaufnahme-Reihenfolge

1. Arbeitsstand prüfen:

   ```bash
   cd /home/maxi/Dokumente/bestscout
   git switch agent/transfer-center
   git status -sb
   git diff --check
   ```

2. Transfer-WIP vollständig erneut prüfen:

   ```bash
   cargo fmt --all -- --check
   cargo test --workspace --all-targets
   cargo clippy --workspace --all-targets -- -D warnings
   npm test --workspace @bestscout/desktop
   npm run build --workspace @bestscout/desktop
   scripts/build-linux-packages.sh
   ```

3. Native UI kontrollieren, sobald eine geeignete Ansicht verfügbar ist:

   ```bash
   npm run tauri --workspace @bestscout/desktop -- dev
   ```

   Transfer Center bei normaler und schmaler Fensterbreite prüfen: Navigation,
   Scrollbereiche, Datums-/Zahlenfelder, Zukunftstransfer, Leihe, Storno,
   fälliger Abschluss, Vorschau und Commit-Status. Keine echte Live-Mutation.

4. Reciprocal Swap fertigstellen:

   - einen expliziten Swap-Partner und zwei Zielverträge erfassen;
   - beide Spieler in einer einzigen `EditTransaction` ändern;
   - alle Erwartungen aus derselben Vorschau lesen;
   - bei fehlendem Spieler, gleichem Verein, stale preview oder ungültigem Vertrag
     die gesamte Aktion ablehnen;
   - UI- und Core-Tests für Sofort-Swap und fälligen Zukunfts-Swap ergänzen;
   - erst danach den offenen Swap-Punkt in der Acceptance schließen.

5. Nach grüner Paketprüfung den Branch committen, pushen, Draft-PR öffnen, alle
   GitHub-Jobs abwarten und erst vollständig grün mergen.

6. Bridge-Arbeit nur nach normal beendetem FM:

   ```bash
   cargo run -p bestscout-live --bin bestscout-diagnose
   cargo run -p bestscout-live --bin bestscout-bridge -- status \
     --game-root "/home/maxi/.local/share/Steam/steamapps/common/Football Manager 26"
   cargo run -p bestscout-live --bin bestscout-bridge -- install \
     --game-root "/home/maxi/.local/share/Steam/steamapps/common/Football Manager 26" \
     --artifact "/home/maxi/Dokumente/bestscout/bridge/BestScout.Bridge/bin/Release/net8.0/BestScout.Bridge.dll"
   ```

   Danach lässt der Nutzer FM selbst neu starten. Erst dann Health-Handshake,
   Domain-Root-Status und Reference Catalog prüfen. Live-Schreiben bleibt bis zur
   feldgenauen Read-back- und Undo-Abnahme gesperrt.

## Danach verbleibende 1.0-Blöcke

Die verbindliche Liste steht in `docs/roadmap.md` und `docs/feature-parity.md`.
Die wichtigsten offenen Bereiche nach Transfer/Bridge sind:

- echte Live-Domänenwurzeln und kanonisches Lesen aller Entitäten;
- feldgenaue Live-Writes mit Main-Thread-Scheduling und Read-back;
- reziproke Swaps;
- Staff, Registrierungen und Beziehungen;
- Wettbewerbe, Tabellen, Punkte, Fixtures und Stages;
- Clubfarben/Kits und Clubbeziehungen;
- Newgen-/Facepack-Tools;
- automatischer Live-Freezer unter sicheren Spielzuständen;
- Steam-Deck-Abnahme, Signierung und deutsche/englische 1.0-Dokumentation.

## Kurzer Resume-Prompt

Für eine neue Sitzung genügt:

> Lies `docs/handoff.md` vollständig, prüfe den Branch
> `agent/transfer-center` und fahre bei „Exakte Wiederaufnahme-Reihenfolge“ fort.
> FM darf nicht geschlossen oder verändert werden. Installiere die Bridge nur,
> wenn die Diagnose keinen laufenden FM-Prozess mehr findet.
