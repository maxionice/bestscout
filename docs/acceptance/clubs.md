# Club Operations Center acceptance

Status: kanonische Implementierung und automatisierte Repository-Abnahme
bestanden. Native Sichtprüfung, GitHub-CI und FM26-Live-Adapter bleiben offen.

## Modell und Validierung

- [x] Ältere Club-Payloads ohne `competition_id` bleiben deserialisierbar.
- [x] Ältere Club-Payloads ohne `branding` und `relationships` erhalten neutrale
  Standardwerte.
- [x] Vorhandene Wettbewerbs-IDs müssen auf einen kanonischen Wettbewerb
  zeigen und zum gespeicherten Anzeigenamen passen.
- [x] Clubtexte, Reputation und Profistatus besitzen validierte Grenzen.
- [x] Kontostand akzeptiert endliche negative Werte; Budgets und Schulden sind
  endlich und nicht negativ.
- [x] Alle vier Anlagenwerte sind auf 1 bis 20 begrenzt.
- [x] Stadionkapazität und Zuschauerschnitt besitzen Obergrenzen; der Schnitt
  darf die Kapazität nicht überschreiten.
- [x] Club- und Kitfarben verwenden exakt `#RRGGBB`; jede der vier Kit-Arten ist
  höchstens einmal vorhanden und alle IDs/Muster sind begrenzt.
- [x] Clubbeziehungen besitzen existierende Fremdziele, eindeutige IDs und
  Art-/Zielpaare sowie eine Stärke zwischen 1 und 100.

## Aktionen und Sicherheit

- [x] Identität und Wettbewerbsreferenz werden atomar vorbereitet.
- [x] Stadion, Finanzen und Anlagen besitzen getrennte atomare Commands.
- [x] Branding sowie Beziehungs-Upsert/-Entfernung besitzen getrennte atomare
  Commands.
- [x] Jede erzeugte Operation besitzt eine exakte Vorbedingung.
- [x] No-op, fehlender Club und unbekannter Wettbewerb werden abgelehnt.
- [x] Ein invalider Ergebnissnapshot wird vor Commit abgelehnt.
- [x] Eine stale Vorschau erzeugt keine partielle Mutation.
- [x] Commit verwendet den gemeinsamen Backup-, Journal- und Undo-Pfad.
- [x] UI-Formänderungen und Snapshotwechsel verwerfen alte Vorschauen.

## Oberfläche

- [x] Sechs spezialisierte Modi und eine durchsuchbare Clubauswahl sind
  implementiert.
- [x] Wettbewerbsauswahl verwendet kanonische IDs und lesbare Namen.
- [x] Finanz- und Anlagenzusammenfassungen erfinden keine Live-Daten.
- [x] Kit- und Beziehungsmasken arbeiten nur mit kanonischen Typen und
  Zielclub-IDs.
- [x] DOM-Tests prüfen Preview, Commit, Fehlergate und stale Async-Antworten.
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
- [x] GitHub-Actions-Checks auf dem veröffentlichten Produktcommit vollständig grün

Verifizierte Paket-Hashes dieses Branches:

- AppImage: `324c299edb3481d0f2eec1d283661dcc020712d0035dcb2351bdf8cbf364748a`
- DEB: `6825f92e06ff539f5bdd24a3d5936a59889d027cabbe5cb5d82a2cef77b0a1da`
- RPM: `141b0446599e28fb5d80b9a383e655a575b487a9dbc5222ec4205fa6a67b13e3`

## Live-FM26-Acceptance

- [ ] Clubreferenzen stammen aus validierten Domain-Roots.
- [ ] Jeder Club-, Finanz-, Stadion-, Anlagen-, Branding-, Kit- und
  Beziehungsfeldpfad besitzt eine bestätigte Lesezuordnung.
- [ ] Jeder editierbare Pfad besitzt eine Main-Thread-Schreibzuordnung und
  unmittelbaren Read-back.
- [ ] Fehler stellen alle betroffenen Werte wieder her und verifizieren den
  Rollback.
- [ ] Backup, Journal und exaktes Undo sind auf dem unterstützten Build
  nachgewiesen.
