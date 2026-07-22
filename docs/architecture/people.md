# People, staff, registration and relationship architecture

Status: kanonische Implementierung auf `agent/staff-registrations-relationships`;
automatisiert abgenommen, native Sichtprüfung und Live-FM26-Adapter offen.

BestScout behandelt Identität, Erscheinungsbild, weitere Nationalitäten,
bevorzugte Spielzüge, Staff-Zuweisungen, Sprachen, Registrierungen,
Qualifikationen und Beziehungen als kanonische Snapshot-Daten. Der
spezialisierte Arbeitsbereich besitzt keinen eigenen Write-Bypass: Jede Aktion
wird in die vorhandene exakte Editor-Transaktion übersetzt.

## Modellgrenzen

Sprachkenntnisse gehören einer Person und enthalten getrennte Werte für
Sprechen, Lesen und Schreiben. Beziehungen besitzen eine snapshotweit
eindeutige ID, einen typisierten Zielraum und eine Stärke. Dadurch kann eine ID
nicht versehentlich als Spieler interpretiert werden, wenn sie tatsächlich zu
Staff oder einem Verein gehört.

Registrierungen gehören ausschließlich zu Spielern. Sie referenzieren einen
Wettbewerb und genau den aktuellen kanonischen Vertragsverein. Pro Spieler ist
höchstens ein Eintrag je Wettbewerb erlaubt. Status, Zeitraum, Rückennummer und
Homegrown-Eigenschaften bleiben explizit, statt aus UI-Text abgeleitet zu werden.

Staff besitzt Rollen, Verantwortungen, Vertrag und zusätzliche Details.
Qualifikationen haben eine eigene ID, ein begrenztes Level und optionale
Verleihungs-/Gültigkeitsdaten. Staff-Profilfelder enthalten außerdem
Geburtsdatum und eine begrenzte interne Notiz. `StaffDetails` und die
erweiterten `PlayerDetails` verwenden
Serde-Defaults, damit fehlende Felder älterer kanonischer Snapshots neutral
eingelesen werden können.

Player und Staff teilen ein explizites `PersonAppearance` mit optionaler Größe,
optionalem Gewicht, optionalem Hautton, typisierter Haarfarbe/-länge und einer
optionalen kanonischen Ethnizitätsangabe. Diese Daten werden niemals aus Name,
Nationalität oder Bild abgeleitet. Weitere Nationalitäten bleiben eine
geordnete, eindeutige Liste. Bevorzugte Spielzüge gehören ausschließlich zum
Player und besitzen stabile IDs sowie lesbare Namen.

## Referenz- und Wertevalidierung

Whole-snapshot validation prüft alle Personenfelder gemeinsam. IDs von
Beziehungen, Registrierungen und Qualifikationen sind innerhalb ihres
jeweiligen snapshotweiten Namensraums eindeutig. Referenzen müssen existieren
und zur deklarierten Zielart passen; Selbstbeziehungen sind verboten.

Vereinbeziehungen zielen nur auf Clubs, Agenten nur auf Staff und sonstige
Personenbeziehungen nur auf Player oder Staff. Sprachkompetenzen sind 1–10,
Beziehungsstärken 1–100, Rückennummern 1–99 und Qualifikationslevel 1–5.
Datumsintervalle verwenden die kanonische `GameDate`-Validierung.

Weitere Nationalitäten dürfen weder doppelt noch mit der primären Nationalität
identisch sein. Größe ist auf 100–250 cm, Gewicht auf 30–250 kg und Hautton auf
1–20 begrenzt. Ethnizität und alle Namen sind getrimmt und längenbegrenzt;
Spielzug-IDs und -Namen müssen je Player eindeutig sein.

Ein Staff-Datensatz benötigt mindestens eine eindeutige Rolle. Verantwortungen
müssen eindeutig sein. Eine Spielerregistrierung wird ungültig, sobald ihr
Verein nicht mehr dem Vertragsverein entspricht.

## Aktionsprotokoll

`PeopleCommand` unterstützt:

- atomare Identitätsprofile für Player und Staff einschließlich
  Erscheinungsbild und weiterer Nationalitäten sowie bei Spielern Positionen,
  starkem Fuß und bevorzugten Spielzügen;
- atomare Staff-Zuweisung aus Club-Anzeigename, Rollen, Verantwortungen und
  Vertrag;
- atomare Staff-Profildaten aus Geburtsdatum und Notiz;
- vollständiges Setzen der Sprachen eines Players oder Staff-Mitglieds;
- vollständiges Setzen der Staff-Qualifikationen;
- Upsert/Remove einer Spielerregistrierung;
- Upsert/Remove einer Player- oder Staff-Beziehung.

`prepare_people_action` validiert zuerst den Ausgangssnapshot, erzeugt nur
tatsächliche Änderungen und versieht jedes Feld mit dem exakt gelesenen
`expected_before`. Danach wird die vollständige Transaktion probeweise auf eine
Arbeitskopie angewendet. Ein invalides Ergebnis, fehlende Referenz, No-op oder
staler Ausgangswert wird abgelehnt, ohne den Quellsnapshot teilweise zu ändern.

Der Commit läuft über den gemeinsamen Editorpfad mit privatem Backup,
Hash-Journal und exaktem Undo. Tauri stellt nur den rechenintensiven Prepare-
Schritt bereit; die Sicherheitssemantik bleibt im Rust-Core.

## Wechselwirkung mit Transfers

Ein vollzogener Vereinswechsel macht bisherige Wettbewerbsregistrierungen des
Spielers fachlich ungültig. Sofortwechsel und fällige Zukunftstransfers leeren
daher die Registrierungsliste in derselben Transaktion wie Verein und Vertrag.
Bei einem Tausch gilt dies für beide Spieler. Planung und Stornierung verändern
Registrierungen nicht.

Eine spätere Ausbaustufe kann statt Leeren eine explizite Abmeldungshistorie
modellieren. Die aktuelle kanonische Invariante bevorzugt einen gültigen,
eindeutigen Snapshot gegenüber implizit veralteten Einträgen.

## UI-Grenze

Der People-Workspace ist in fünf Modi getrennt: Staff/Aufgaben,
Identitätsprofile, Registrierungen, Sprachen und Beziehungen. Auswahl, Formular und Vorschau sind
sichtbar getrennt. Der Commit darf ausschließlich auf einer aktuell zum
Formular passenden Prepared-Antwort basieren; jede Eingabeänderung muss eine
vorhandene Vorschau verwerfen. Dasselbe gilt für eine noch laufende asynchrone
Vorschau, wenn sich Formular oder Snapshot währenddessen ändern.

Registrierungsende, Rückennummer sowie Qualifikationsdaten sind optional. Fehlt
dem Snapshot der kanonische In-Game-Spieltag, wird kein Datum aus der Host-Uhr
erfunden; optionale Aktionsfelder bleiben null oder müssen explizit eingegeben
werden.

Die Oberfläche verwendet HeroUI v3 innerhalb des vorhandenen dunklen,
rahmenlosen Tauri-Fensters. OS-Titelleisten oder plattformspezifische Write-
Dialoge werden nicht eingeführt.

## Live-Grenze

Die kanonischen Commands berechtigen nicht zu FM26-Live-Schreiben. Für jeden
Feldpfad müssen separat bestätigt werden:

- exakter Build und Domain-Root;
- typisierte Lesezuordnung;
- Main-Thread-Schreibzuordnung;
- begrenzte und validierte Werte;
- unmittelbarer Read-back;
- Backup-/Journalbezug und exaktes Undo;
- sicherer Spielzustand.

Bis alle betroffenen Felder diese Gates erfüllen, bleibt der People-Workspace
eine kanonische Arbeitskopie und `editor_allowed=false`.
