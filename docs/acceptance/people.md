# People workspace acceptance

Status: kanonische Implementierung und automatisierte Repository-Abnahme
bestanden. Native Sichtprüfung, GitHub-CI und FM26-Live-Adapter bleiben offen.

## Kanonisches Modell

- [x] Sprach-, Beziehungs-, Registrierungs-, Verantwortungs- und
  Qualifikationstypen sind angelegt.
- [x] Neue Player-/Staff-Felder besitzen neutrale Defaults.
- [x] Synthetische Fixtures enthalten gültige Beispiele.
- [x] Alte Player- und Staff-Snapshot-Payloads sind durch Regressionstests
  rückwärtskompatibel deserialisierbar.
- [x] Alle unteren/oberen Werte, leeren Namen, doppelten IDs, falschen Zieltypen,
  Selbstreferenzen und ungültigen Datumsintervalle besitzen Negativtests.

## Aktionen und Sicherheit

- [x] Staff-Zuweisung bereitet Club, Rollen, Verantwortungen und Vertrag atomar
  vor.
- [x] Sprache, Qualifikation, Registrierung und Beziehung verwenden das
  zweiphasige Editorprotokoll.
- [x] Jede erzeugte Operation besitzt eine exakte Vorbedingung.
- [x] Ein stale Snapshot wird ohne partielle Mutation abgelehnt.
- [x] Vollzogene Vereinswechsel leeren veraltete Registrierungen atomar.
- [x] No-op, fehlende Entitäten und jede Remove-not-found-Variante sind gezielt
  getestet.
- [x] UI-Formänderungen verwerfen jede ältere Prepared-Antwort.
- [x] Eine noch laufende Prepare-Antwort wird nach Snapshotwechsel verworfen.
- [x] UI-Commit übernimmt ausschließlich die aktuell sichtbare Vorschau.
- [x] Nach Commit werden Auswahl und Formular aus dem neuen Snapshot
  synchronisiert.
- [x] Fehlende In-Game-Daten erzeugen keine erfundenen Host-Daten.

## Oberfläche

- [x] People-Navigation und vier spezialisierte Modi sind implementiert.
- [x] Der Workspace nutzt HeroUI v3 und die eigene rahmenlose dunkle Shell.
- [x] TypeScript- und Vite-Produktionsbuild bestehen.
- [x] UI-Tests decken Staff, Registrierungen, Sprachen und Beziehungen ab.
- [x] DOM-Tests prüfen zugängliche Labels, Fehlerstatus, Busy-Gates und Commit.
- [ ] Native Tastatur-, Fokus- und Interaktionsprüfung ist durchgeführt.
- [ ] Breite und schmale native Tauri-Ansicht sind visuell abgenommen.
- [ ] Lange Namen, leere Listen und große Datensätze bleiben bedienbar.
- [x] Datenbankansichten lösen Beziehungsziele und Wettbewerbe zu lesbaren
  Namen auf.

## Repository-Prüfung

- [x] `cargo fmt --all -- --check`
- [x] `git diff --check`
- [x] `cargo test --workspace --all-targets`
- [x] `cargo clippy --workspace --all-targets -- -D warnings`
- [x] `npm test --workspace @bestscout/desktop`
- [x] `npm run build --workspace @bestscout/desktop`
- [x] `scripts/build-linux-packages.sh`
- [ ] GitHub-Actions-Checks auf dem veröffentlichten PR vollständig grün

## Live-FM26-Acceptance

- [ ] Spieler-/Staff-/Club-/Wettbewerbsreferenzen werden aus validierten
  Domain-Roots gelesen.
- [ ] Jedes People-Feld besitzt eine bestätigte Lesezuordnung.
- [ ] Jedes editierbare People-Feld besitzt eine bestätigte Main-Thread-
  Schreibzuordnung und Read-back-Prüfung.
- [ ] Registrierungs- und Beziehungsobjekte werden nach Live-Write vollständig
  neu gelesen und verglichen.
- [ ] Backup, Journal und Undo wurden auf dem unterstützten FM26-Build
  nachgewiesen.
- [ ] Unbekannte/partielle Builds und unsichere Spielzustände bleiben
  unveränderbar.

Der 0.7-People-Block und die zugehörigen 1.0-Paritätsfelder bleiben offen, bis
alle Repository-, UI- und Live-Gates erfüllt sind.
