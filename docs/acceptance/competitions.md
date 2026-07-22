# Competition Operations Center acceptance

Status: kanonische Implementierung und automatisierte lokale
Repository-Abnahme bestanden. Native Sichtprüfung, GitHub-CI und
FM26-Live-Adapter bleiben offen.

## Modell und Validierung

- [x] Ältere Wettbewerbs-Payloads ohne Champion-ID, Stufen, Paarungen und
  Tabellenstände bleiben deserialisierbar.
- [x] Eine vorhandene Champion-ID verweist auf einen kanonischen Club und
  stimmt mit dessen Namen überein.
- [x] Stufen- und Paarungs-IDs sind begrenzt und snapshotweit eindeutig.
- [x] Stufennamen, Reihenfolge, Zeitraum und aktueller Status sind validiert.
- [x] Paarungen besitzen vorhandene, verschiedene Clubs und höchstens eine
  Stufenreferenz aus demselben Wettbewerb.
- [x] Spielstatus und vollständiges Ergebnis sind konsistent und begrenzt.
- [x] Tabellenclub, Stufe, Position, Bilanz, Tore, Tordifferenz und Punkte
  erfüllen die kanonischen Invarianten.
- [x] Texte und Sammlungsgrößen besitzen explizite Grenzen.

## Aktionen und Sicherheit

- [x] Profil und Championreferenz werden atomar vorbereitet.
- [x] Eine Namensänderung aktualisiert alle gebundenen Club-Anzeigenamen in
  derselben Transaktion.
- [x] Eine Clubumbenennung aktualisiert gebundene Champion-Anzeigenamen in
  derselben Transaktion.
- [x] Stufen, Paarungs-Upsert/-Löschung und Tabelle besitzen getrennte
  kanonische Commands.
- [x] Jede erzeugte Operation besitzt eine exakte Vorbedingung.
- [x] No-op, fehlender Wettbewerb, Club, Champion oder Löschdatensatz werden
  abgelehnt.
- [x] Ein invalider Ergebnissnapshot wird vor Commit abgelehnt.
- [x] Eine stale Vorschau erzeugt keine partielle Mutation.
- [x] Commit verwendet den gemeinsamen Backup-, Journal- und Undo-Pfad.

## Oberfläche

- [x] Vier spezialisierte Modi und eine durchsuchbare Wettbewerbsauswahl sind
  implementiert.
- [x] Champion, Stufe und Clubauswahl verwenden kanonische IDs und lesbare
  Namen.
- [x] Die UI berechnet Tordifferenzen deterministisch aus Toren und Gegentoren.
- [x] Formänderungen und Snapshotwechsel verwerfen alte Vorschauen.
- [x] DOM-Tests prüfen Preview, Commit, Referenzgate und stale Async-Antworten.
- [x] Datenbankansicht zeigt Champion-ID sowie Stufen-, Paarungs- und
  Tabellenanzahl.
- [x] TypeScript- und Vite-Produktionsbuild bestehen.
- [ ] Breite und schmale native Tauri-Ansicht sind visuell abgenommen.
- [ ] Tastatur, Fokus, lange Namen, leere Listen und große Datensätze sind
  nativ geprüft.

## Repository-Prüfung

- [x] `cargo fmt --all -- --check`
- [x] `git diff --check`
- [x] `cargo test --workspace --all-targets`
- [x] `cargo clippy --workspace --all-targets -- -D warnings`
- [x] `npm test --workspace @bestscout/desktop`
- [x] `npm run build --workspace @bestscout/desktop`
- [x] `scripts/build-linux-packages.sh`
- [ ] GitHub-Actions-Checks auf dem veröffentlichten Produktcommit vollständig grün

Verifizierte Paket-Hashes dieses Branches:

- AppImage: `6ef6f45fa6bb96db4f8ceacdaf1278b1ea5051db0aaa363303f01ad674c7fde1`
- DEB: `05341352722fb95b31512eff33eaf2fa0583388873b662b1e494a43cb8a7d65b`
- RPM: `db371d2930c6a6cf6498e29a6b91fda22cf2f4d0900fa503748006134d479e1b`

## Live-FM26-Acceptance

- [ ] Wettbewerbs-, Stufen-, Paarungs- und Tabellenreferenzen stammen aus
  validierten Domain-Roots.
- [ ] Jeder kanonische Feldpfad besitzt eine bestätigte Lesezuordnung.
- [ ] Jeder editierbare Pfad besitzt eine Main-Thread-Schreibzuordnung und
  unmittelbaren Read-back.
- [ ] Fehler stellen alle betroffenen Werte wieder her und verifizieren den
  Rollback.
- [ ] Backup, Journal und exaktes Undo sind auf dem unterstützten Build
  nachgewiesen.
