# Competition, fixture and stage architecture

Status: kanonische Implementierung auf
`agent/competitions-fixtures-stages`; automatisierte Repository-Abnahme
bestanden, native Sichtprüfung und Live-FM26-Adapter offen.

BestScout behandelt Wettbewerbsprofil, Titelverteidiger, Stufen, Paarungen und
Tabellenstände als einen referenziell geschlossenen Teil des kanonischen
Snapshots. Die Wettbewerbs-Zentrale besitzt keinen direkten Schreibpfad. Jede
Aktion erzeugt eine exakte `EditTransaction` und verwendet anschließend den
gemeinsamen Backup-, Journal-, Read-back- und Undo-Pfad.

## Modell und Referenzen

`Competition` behält den lesbaren Titelverteidigernamen für ältere Payloads.
Die optionale `current_champion_club_id` bindet ihn bei neuen Snapshots stabil
an einen Club. Fehlt die ID, bleiben alte Payloads neutral lesbar. Ist sie
vorhanden, müssen Referenz und aktueller Clubname übereinstimmen.

Eine `CompetitionStage` besitzt eine global eindeutige ID, Typ, positive und
innerhalb des Wettbewerbs eindeutige Reihenfolge sowie optionale, geordnete
Kalenderdaten. Höchstens eine Stufe ist aktuell. Paarungen referenzieren
optional eine Stufe desselben Wettbewerbs sowie zwei verschiedene vorhandene
Clubs. Ergebnis und Status sind gekoppelt: gespielt verlangt ein vollständiges
Ergebnis; geplant, verschoben und abgesagt erlauben keines.

Tabellenzeilen sind pro Stufe und Club eindeutig. Positionen sind pro Stufe
eindeutig, `played = won + drawn + lost`, und die Tordifferenz entspricht exakt
Tore minus Gegentore. IDs, Texte, Daten, Ergebnisse, Zähler, Punkte und
Sammlungsgrößen besitzen explizite Grenzen.

## Aktionsprotokoll

`CompetitionCommand` trennt fünf atomare Anwendungsfälle:

- Profil, Reputation, Ligaebene und stabiler Titelverteidiger;
- vollständige Stufenliste;
- Hinzufügen oder Ersetzen einer Paarung;
- Entfernen einer vorhandenen Paarung;
- vollständiger Tabellenstand.

`prepare_competition_action` validiert zuerst den gesamten Ausgangssnapshot,
liest jeden betroffenen Wert und erzeugt ausschließlich Änderungen mit
`FieldExpectation::Exact`. Danach wird die Transaktion auf einer Arbeitskopie
angewendet und wieder als ganzer Snapshot validiert. Fehlende Entitäten,
unbekannte Referenzen, ungültige Invarianten, No-ops und stale Vorschauen
erzeugen keine partielle Mutation.

Wird der Wettbewerbsname geändert, aktualisiert dieselbe Transaktion alle
Clubs mit passender `competition_id`. Wird ein Club umbenannt, aktualisiert der
Club-Command in derselben Transaktion den Titelverteidigernamen aller über
`current_champion_club_id` gebundenen Wettbewerbe. Dadurch bleiben stabile ID
und lesbarer Name in beiden Richtungen konsistent.

## Oberfläche

Das `Competition Operations Center` besitzt vier Modi: Profil, Stufen,
Spielplan und Tabelle. Auswahl, Formular und Transaktionsvorschau sind sichtbar
getrennt. Formänderungen verwerfen vorhandene Vorschauen; verspätete
asynchrone Antworten werden nach Formular- oder Snapshotwechsel ignoriert.
Tabellentordifferenzen werden aus den Torwerten berechnet und nicht unabhängig
erfunden. Nach Commit synchronisiert sich der Entwurf aus dem übernommenen
Snapshot.

## Live-Grenze

Der kanonische Command schaltet keine FM26-Schreibrechte frei. Für jeden
Wettbewerbs-, Stufen-, Paarungs- und Tabellenpfad bleiben bestätigte
Domain-Roots, typisierte Lese- und Main-Thread-Schreibzuordnung, unmittelbarer
Read-back, Rollback und exaktes Undo auf dem unterstützten Build erforderlich.
Bis dahin bleibt `editor_allowed=false`.
