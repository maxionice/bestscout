# People WIP worklog — 2026-07-22

Dieses Protokoll friert den anfänglich unfertigen lokalen Entwicklungsstand beim
Beginn des Blocks „Staff, Registrierungen und Beziehungen“ ein. Der WIP wurde
später in derselben Entwicklungskette automatisiert abgenommen; der aktuelle
Abschlussbefund steht am Ende dieses Dokuments. Der allgemeine Handoff und die
People-Acceptance bleiben die maßgeblichen Einstiegspunkte.

## Git-Grenze

- Basis: `main` / `origin/main`
- Basis-Commit: `cb2191b225145098e285d733ebab57d0dca1423e`
- Arbeitsbranch: `agent/staff-registrations-relationships`
- Remote-PR: noch keiner
- Commit für diesen WIP: noch keiner
- Arbeitsbaum: verändert; zwei neue, ungetrackte Quelldateien und neue lokale
  Dokumentationsdateien

Neue Quelldateien:

- `crates/bestscout-core/src/people.rs`
- `apps/desktop/src/PeopleWorkspace.tsx`

Neue Dokumentationsdateien dieser Pause:

- `docs/worklog/2026-07-22-people-wip.md`
- `docs/architecture/people.md`
- `docs/acceptance/people.md`

Veränderte Dateien:

- `crates/bestscout-core/src/model.rs`
- `crates/bestscout-core/src/fixtures.rs`
- `crates/bestscout-core/src/validation.rs`
- `crates/bestscout-core/src/editor.rs`
- `crates/bestscout-core/src/transfers.rs`
- `crates/bestscout-core/src/lib.rs`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src/types.ts`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/DatabaseWorkspace.tsx`
- `apps/desktop/src/EditorWorkspace.tsx`
- `apps/desktop/src/view-preferences.ts`
- `apps/desktop/src/styles.css`

Zusätzlich aktualisierte Dokumentation:

- `docs/handoff.md`
- `docs/architecture/overview.md`
- `docs/architecture/transfers.md`
- `docs/acceptance/transfers.md`
- `docs/roadmap.md`

Vor jeder weiteren Arbeit `git status -sb` prüfen. Ein normales `git diff`
zeigt ungetrackte Dateien nicht an; deshalb niemals aus einem leeren Diff auf
einen vollständigen oder sicheren Stand schließen.

## Angelegtes kanonisches Modell

`model.rs` enthält neu:

- `LanguageSkill` mit Name sowie Sprechen/Lesen/Schreiben von 1 bis 10;
- `RelationshipTargetKind`: Player, Staff oder Club;
- `RelationshipKind`: Lieblingsperson, ungeliebte Person, Freund, Mentor,
  Familie, Agent, Lieblingsverein oder ungeliebter Verein;
- `PersonRelationship` mit globaler ID, typisiertem Ziel und Stärke 1 bis 100;
- `RegistrationStatus`: registered, pending, unregistered oder ineligible;
- `PlayerRegistration` mit Wettbewerb, Verein, Status, Zeitraum,
  Rückennummer und zwei Homegrown-Flags;
- neue Player-Details: Sprachen, Beziehungen und Registrierungen;
- zwölf `StaffResponsibility`-Werte von Team Selection bis Media;
- `StaffQualification` mit Name, Level 1 bis 5 und Zeitraum;
- `StaffDetails` mit Geburtsdatum, Sprachen, Beziehungen,
  Verantwortungen, Qualifikationen und Notiz;
- `Staff.details` mit Serde-Default für ältere Snapshots.

`PlayerDetails` war bereits `#[serde(default)]`, sodass fehlende neue Listen bei
älteren Player-Snapshots leer werden. Eine explizite Regression für alte Player-
und Staff-Payloads fehlt trotzdem noch.

## Angelegte Validierungsregeln

`validation.rs` baut globale Player-, Staff-, Club-, Wettbewerbs-, Beziehungs-,
Registrierungs- und Qualifikations-ID-Mengen auf und prüft:

- Sprachnamen: getrimmt nicht leer, höchstens 64 Zeichen, je Person
  case-insensitiv eindeutig;
- alle drei Sprachwerte: 1 bis 10;
- Beziehungs-IDs: nicht leer, höchstens 128 Zeichen und snapshotweit eindeutig;
- Beziehungsziel: existiert unter dem angegebenen Entitätstyp;
- Lieblings-/ungeliebter Verein zielt nur auf Club;
- Agent zielt nur auf Staff;
- alle anderen Personenbeziehungen zielen nur auf Player oder Staff;
- keine Selbstbeziehung mit gleichem Personentyp und gleicher ID;
- Beziehungsstärke: 1 bis 100;
- Registrierungs-ID: nicht leer, höchstens 128 Zeichen und snapshotweit
  eindeutig;
- je Spieler höchstens eine Registrierung pro Wettbewerb;
- Wettbewerb und Verein existieren;
- Registrierungsverein entspricht dem aktuellen kanonischen Vertragsverein;
- Registrierungsdaten sind gültig und geordnet;
- Rückennummer, falls gesetzt: 1 bis 99;
- Staff hat mindestens eine eindeutige Rolle;
- Staff-Verantwortungen sind eindeutig;
- Staff-Geburtsdatum ist ein gültiges Kalenderdatum;
- Qualifikations-ID ist nicht leer, höchstens 128 Zeichen und snapshotweit
  eindeutig;
- Qualifikationsname ist nicht leer und höchstens 128 Zeichen;
- Qualifikationslevel: 1 bis 5;
- Qualifikationsdaten sind gültig und geordnet.

Offen sind gezielte Grenzwert- und Negativtests für jede dieser Regeln.

## Fixtures und Editor

Die synthetischen Fixtures wurden erweitert:

- Ada besitzt deutsche/englische Sprachkenntnisse, eine Beziehung zu Lina und
  eine Nordliga-Registrierung mit Nummer 8;
- Lina besitzt Sprache, Mentor-Beziehung zu Ada, Verantwortungen und eine
  Continental-Pro-Qualifikation.

Der generische Editor erlaubt die neuen verschachtelten Player- und Staff-
Felder. Die React-Datenbank und Spieler-Spalten zeigen diese Daten zusätzlich
an. Die Anzeige verwendet teilweise noch rohe IDs/Enum-Werte; das ist für den
WIP akzeptiert, sollte für die fertige UX aber durch aufgelöste Namen und
deutsche Labels ersetzt werden.

## Angelegte People-Aktionen

`people.rs` definiert ein zweiphasiges Protokoll mit
`PeopleActionRequest`, `PreparedPeopleAction` und folgenden Commands:

- `UpdateStaffAssignment`
- `SetPlayerLanguages`
- `SetStaffLanguages`
- `SetStaffQualifications`
- `UpsertPlayerRegistration`
- `RemovePlayerRegistration`
- `UpsertPlayerRelationship`
- `RemovePlayerRelationship`
- `UpsertStaffRelationship`
- `RemoveStaffRelationship`

Alle Änderungen werden als normale `EditTransaction` vorbereitet. Jede
Operation enthält `FieldExpectation::Exact`; die Vorschau läuft bereits durch
die vollständige Snapshot-Validierung. Commit, privates Backup, Hash-Journal,
Read-back der Arbeitskopie und Undo werden durch den vorhandenen Editor-Pfad
bereitgestellt.

Eine Staff-Zuweisung ändert Club-Anzeigename, Rollen, Verantwortungen und
Vertrag gemeinsam. Registrierung und Beziehungen werden anhand ihrer stabilen
ID ersetzt oder entfernt. Ein No-op wird abgelehnt.

Vorhandene vier Core-Tests decken ab:

- atomare Staff-Zuweisung;
- Registrierung anlegen und entfernen;
- gültige Sprachen und Cross-Entity-Beziehung sowie einen ungültigen Fall;
- stale Vorschau ohne partielle Mutation.

## Transfer-Seiteneffekt

Die neue Regel „Registrierungsverein muss Vertragsverein sein“ hat einen echten
Transferfehler sichtbar gemacht. Ein vollzogener Vereinswechsel würde sonst
alte Registrierungen zurücklassen und den Snapshot ungültig machen.

`transfers.rs` leert deshalb `details.registrations` atomar bei:

- sofortigem Wechsel;
- fälligem Abschluss eines Zukunftstransfers;
- sofortigem Tausch für beide Spieler;
- fälligem Abschluss eines Zukunftstauschs für beide Spieler.

Planung und Stornierung ändern Registrierungen nicht. Die erwarteten
Operationszahlen der bestehenden Transfertests wurden entsprechend von 3/4/6
auf 4/5/7 erhöht. Die fachlichen Transferdokumente erwähnen diese Invariante.

## Tauri- und TypeScript-Grenze

Die Tauri-App exportiert neu `prepare_people_action` über
`spawn_blocking`. `types.ts` spiegelt Modell, Commands, Request und Prepared-
Antwort. Neue Detailfelder sind im Frontend optional, damit ältere Payloads
weiter darstellbar bleiben.

Offen: Rust/TypeScript-Vertragskonsistenz erst nach vollständigem Compile- und
UI-Testlauf als bestätigt ansehen.

## PeopleWorkspace-Entwurf

`PeopleWorkspace.tsx` ist ein neuer HeroUI-v3-Arbeitsbereich im bestehenden
rahmenlosen, dunklen Linux-Fenster. Er hat vier Modi:

1. Staff und Aufgaben: Rollen, Verantwortungen, Zielverein, Gehalt,
   Vertragsende und Qualifikationen;
2. Registrierungen: Wettbewerb, Status, Rückennummer, Ablauf und Homegrown;
3. Sprachen: Player/Staff-Auswahl und drei Kompetenzwerte;
4. Beziehungen: Player/Staff-Auswahl, typisiertes Ziel, Art und Stärke.

Der Workspace hat explizite Auswahl, Vorbereitung, Änderungsliste und Commit
über das vorhandene Journal. `App.tsx` bindet ihn als Navigationseintrag
„People“ ein. `styles.css` enthält den zugehörigen violett-dunklen,
dreispaltigen und teilweise responsiven Entwurf.

Der UI-Entwurf ist nicht kompiliert und nicht abgenommen.

## Bekannte technische Risiken

Diese Liste ist vor einem PR vollständig abzuarbeiten:

- Viele Formular-Setter werden direkt an Kindkomponenten durchgereicht. Wird
  nach einer erfolgreichen Vorbereitung ein Feld geändert, kann die alte
  Vorschau sichtbar und commitbar bleiben. Alle Eingabeänderungen müssen
  `clearPreview()` auslösen oder Prepared-Daten müssen an einen stabilen
  Formular-Fingerprint gebunden werden.
- Nach Commit zeigen lokale Formularzustände eventuell noch Werte des alten
  Snapshots. Auswahl und Entwurf müssen aus dem übernommenen Snapshot neu
  synchronisiert werden.
- Leere `roles` werden erst durch Snapshot-Validierung abgelehnt; die UI braucht
  eine direkte verständliche Schranke.
- IDs basieren derzeit in der UI auf `Date.now()` und `Math.random()`. Tests
  müssen Zeit/Zufall kontrollieren oder eine ID-Factory injizieren.
- `fallbackDate()` verwendet das echte UTC-Datum, falls `snapshot.game_date`
  fehlt. Prüfen, ob Aktionen ohne kanonisches In-Game-Datum besser gesperrt
  werden müssen.
- `PeopleWorkspace.tsx` ist stark verdichtet und 433 Zeilen lang. Nach
  funktionaler Abnahme sinnvoll in Moduseditoren/Hooks zerlegen, ohne dabei die
  Transaktionsgrenze zu duplizieren.
- Die neuen CSS-Regeln stehen in wenigen sehr langen Zeilen. Lesbarkeit und
  spätere Wartbarkeit verbessern, ohne die bestehende globale CSS-Struktur
  unnötig umzuschreiben.
- Datenbankzellen zeigen bei Beziehungen und Registrierungen noch technische
  IDs. Ziele und Wettbewerbe zu Namen auflösen.
- Qualifikationen können im spezialisierten UI angelegt/entfernt werden, aber
  verliehenes/ablaufendes Datum ist noch nicht editierbar.
- Staff-Geburtsdatum und Notiz sind bisher nur im generischen Editor, nicht im
  People-Workspace.
- Es gibt noch keine spezialisierte Staff-Attributbearbeitung in diesem Block;
  bestehende generische Editorfunktionen bleiben davon getrennt.
- Es gibt keine Live-FM-Feldzuordnung. Alle Aktionen betreffen nur die
  kanonische Arbeitskopie.

## Letzter bekannter Prüfstand

Vor dem People-WIP war `main` vollständig grün. Nach den Core-Änderungen wurde
einmal erfolgreich ausgeführt:

```bash
cargo test -p bestscout-core
```

Ergebnis: 59 Tests bestanden. Danach wurden der große React-Workspace, Styles
und weitere Integrationen ergänzt. Folgende Prüfungen sind seitdem ausdrücklich
nicht erfolgt:

- `cargo fmt --all -- --check`
- `git diff --check`
- `cargo test --workspace --all-targets`
- `cargo clippy --workspace --all-targets -- -D warnings`
- `npm test --workspace @bestscout/desktop`
- `npm run build --workspace @bestscout/desktop`
- `scripts/build-linux-packages.sh`
- native Tauri-Interaktionsprüfung

Diese fehlenden Prüfungen nicht als bestanden darstellen.

## Empfohlene nächste kleine Schritte

1. `git status -sb` und dieses Dokument lesen.
2. `cargo fmt --all` und Frontend-Build starten; nur vorhandene Compilefehler
   reparieren.
3. Prepared-State an jede Eingabe koppeln und stale UI-Vorschau verhindern.
4. `PeopleWorkspace.test.tsx` mit injiziertem Gateway schreiben:
   Staff-Zuweisung, Registrierung, Sprache, Beziehung, Preview-Verfall,
   Prepare-/Commitfehler und Snapshot-Update.
5. Rust-Negativtests und Serde-Rückwärtskompatibilität ergänzen.
6. vollständige Prüfmatrix aus `docs/handoff.md` ausführen.
7. native UI prüfen und Acceptance mit konkreten Ergebnissen aktualisieren.
8. erst dann Commit, Push und Draft-PR.

## Nicht tun

- WIP mit `git reset`, `git checkout --`, Clean-Skripten oder ähnlichen
  destruktiven Befehlen verwerfen.
- Den WIP als gemergt oder produktionsreif dokumentieren.
- Live-Schreiben aktivieren, weil der kanonische Editor funktioniert.
- FM für den Nutzer starten oder schließen.
- Bridge-Dateien ändern, solange ein FM-Prozess läuft.
- proprietären Code, Assets oder Daten anderer Scout-/Editor-Produkte
  übernehmen.

## Abschlussbefund nach Wiederaufnahme

Die oben festgehaltenen WIP-Risiken wurden wie folgt bearbeitet:

- TypeScript-/HeroUI-Produktionsbuild ist grün.
- Jede relevante Formularänderung verwirft eine Prepared-Antwort.
- Eine asynchrone Prepare-Antwort wird nach Formular- oder Snapshotwechsel
  ignoriert.
- Formulare synchronisieren sich nach Commit und externem Snapshotwechsel.
- Eine Staff-Aktion ist ohne mindestens eine Rolle in der UI gesperrt.
- ID- und Zeitquelle sind für deterministische UI-Tests injizierbar.
- Fehlende In-Game-Daten werden nicht durch das Host-Datum ersetzt.
- Staff-Geburtsdatum/Notiz, datierte Qualifikationen und optionale
  Rückennummern wurden ergänzt.
- Beziehungsziele und Registrierungswettbewerbe erscheinen mit lesbaren Namen.
- Core-Grenzwert-, No-op-, Missing-Entity-, Serde- und Transferinvariantentests
  wurden ergänzt.
- `PeopleWorkspace.test.tsx` prüft Staff, Profil, Qualifikation,
  Registrierung, Sprache, Beziehung, stale Preview, Fehler und fehlenden
  Spieltag.

Letzte lokale Prüfergebnisse:

- 63 `bestscout-core`-Tests bestanden;
- 97 Rust-Tests im vollständigen Workspace bestanden;
- 49 Vitest-/DOM-Tests bestanden;
- Clippy mit `-D warnings` bestanden;
- TypeScript-/Vite-Produktionsbuild bestanden;
- AppImage, DEB und RPM wurden gebaut und verifiziert.

Paketartefakte:

- AppImage: `26de04c9e4a8b9d11e7c22da8db791dd3e0f0c915eb031eb2daf4cc9aefe5074`
- DEB: `317641ae2ab19e581e493387228e85678bd1884e8d455a2c39abc836feedde29`
- RPM: `5ccb06faa35b0e54956a9137a54ecaf1796eaafe4b9b170da9174aa29b94f44b`

Offen bleiben die native breite/schmale Sicht- und Tastaturprüfung, weil die
verbindliche In-App-Browserliste leer (`[]`) war, sowie sämtliche echten
FM26-Live-Feldadapter. Diese offenen Punkte werden nicht durch die grüne
kanonische Testmatrix oder die inzwischen grüne GitHub-CI ersetzt.

## Pausenstand und öffentliche Übergabe

- Produktcommit: `898bbf7096a40014deeb02f4ba255939a1452525`
- Öffentlicher Draft-PR: `https://github.com/maxionice/bestscout/pull/25`
- Branch: `agent/staff-registrations-relationships`
- Basis: `main` auf `cb2191b225145098e285d733ebab57d0dca1423e`
- PR war beim letzten Abruf offen, als Draft markiert und mergebar.
- Alle sechs GitHub-Actions-Jobs auf `beba87c` waren grün: jeweils zwei
  Frontend-, Rust- und Linux-Bundle-Jobs.
- Es gab keine Kommentare, Reviews oder offenen Review-Threads.
- Es wurde bewusst weder die native UI-Abnahme behauptet noch der PR
  freigegeben oder gemergt.
- FM26 wurde nicht gestartet, geschlossen oder live verändert.

Der aktuelle, kurze Wiedereinstieg steht in `docs/handoff.md`. Die historische
WIP-Beschreibung weiter oben bleibt absichtlich erhalten; ihr
`Remote-PR: noch keiner` beschreibt den Zustand bei der ersten Aufnahme und
nicht den heutigen Pausenstand.
