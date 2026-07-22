import { useEffect, useMemo, useState } from "react";
import { Button, Card, Input, TextArea, TextField } from "@heroui/react";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertTriangle, ArrowRight, Check, CheckCircle2, Clock3, DatabaseBackup,
  History, PencilLine, RotateCcw, Search, ShieldCheck, Trash2, Users,
  UserRoundCog, Building2, Trophy,
} from "lucide-react";

import type {
  AppliedTransaction, Club, Competition, DatabaseSnapshot, EditEntityKind,
  EditOperation, EditTransaction, JournalEntry, Player, Staff, TransactionJournal,
} from "./types";
import { playerColumns } from "./view-preferences";

type EditorEntity = Player | Staff | Club | Competition;
type ValueType = "string" | "integer" | "number" | "boolean" | "list" | "date" | "json" | "enum";
type EditorField = {
  path: string;
  label: string;
  group: string;
  type: ValueType;
  nullable?: boolean;
  min?: number;
  max?: number;
  options?: string[];
};

export type EditorGateway = {
  preview: (snapshot: DatabaseSnapshot, transaction: EditTransaction) => Promise<AppliedTransaction>;
  apply: (journalId: string, snapshot: DatabaseSnapshot, transaction: EditTransaction) => Promise<AppliedTransaction>;
  history: (journalId: string) => Promise<TransactionJournal>;
  undo: (
    journalId: string,
    snapshot: DatabaseSnapshot,
    transactionId: string,
    undoId: string,
    createdAtUtc: string,
  ) => Promise<AppliedTransaction>;
  restore: (snapshotHash: string) => Promise<DatabaseSnapshot>;
};

const tauriGateway: EditorGateway = {
  preview: (snapshot, transaction) => invoke("preview_snapshot_transaction", { snapshot, transaction }),
  apply: (journalId, snapshot, transaction) => invoke("apply_snapshot_transaction", { journalId, snapshot, transaction }),
  history: (journalId) => invoke("editor_history", { journalId }),
  undo: (journalId, snapshot, transactionId, undoId, createdAtUtc) => invoke("undo_snapshot_transaction", {
    journalId, snapshot, transactionId, undoId, createdAtUtc,
  }),
  restore: (snapshotHash) => invoke("restore_snapshot_backup", { snapshotHash }),
};

const kinds: Array<{ id: EditEntityKind; label: string; icon: typeof Users }> = [
  { id: "player", label: "Spieler", icon: Users },
  { id: "staff", label: "Staff", icon: UserRoundCog },
  { id: "club", label: "Vereine", icon: Building2 },
  { id: "competition", label: "Wettbewerbe", icon: Trophy },
];

const basicFields: Record<EditEntityKind, EditorField[]> = {
  player: [
    field("name", "Name", "Identität", "string"), field("age", "Alter", "Identität", "integer", true, 0, 120),
    field("club", "Verein", "Identität", "string", true), field("nationality", "Nationalität", "Identität", "string", true),
    field("positions", "Positionen", "Identität", "list"),
    { ...field("preferred_foot", "Starker Fuß", "Identität", "enum"), options: ["left", "right", "both", "unknown"] },
    field("value", "Marktwert", "Fähigkeit & Wert", "number", true, 0), field("wage", "Wochengehalt", "Fähigkeit & Wert", "number", true, 0),
    field("current_ability", "Aktuelle Fähigkeit (CA)", "Fähigkeit & Wert", "integer", true, 0, 200),
    field("potential_ability", "Potenzial (PA)", "Fähigkeit & Wert", "integer", true, 0, 200),
    field("details.date_of_birth", "Geburtsdatum", "Persönlichkeit", "date", true),
    field("details.reputation", "Reputation", "Persönlichkeit", "integer", true, 0, 10_000),
    field("details.international_reputation", "Internationale Reputation", "Persönlichkeit", "integer", true, 0, 10_000),
    field("details.consistency", "Konstanz", "Persönlichkeit", "integer", true, 1, 20),
    field("details.important_matches", "Wichtige Spiele", "Persönlichkeit", "integer", true, 1, 20),
    field("details.injury_proneness", "Verletzungsanfälligkeit", "Persönlichkeit", "integer", true, 1, 20),
    field("details.versatility", "Vielseitigkeit", "Persönlichkeit", "integer", true, 1, 20),
    field("details.professionalism", "Professionalität", "Persönlichkeit", "integer", true, 1, 20),
    field("details.ambition", "Ehrgeiz", "Persönlichkeit", "integer", true, 1, 20),
    field("details.contract", "Gesamter Vertrag (JSON)", "Vertrag", "json", true),
    field("details.contract.club_id", "Vertragsverein-ID", "Vertrag", "string", true),
    field("details.contract.starts_on", "Vertragsbeginn", "Vertrag", "date", true),
    field("details.contract.expires_on", "Vertragsende", "Vertrag", "date", true),
    field("details.contract.contract_type", "Vertragsart", "Vertrag", "string", true),
    field("details.contract.wage", "Vertragsgehalt", "Vertrag", "number", true, 0),
    field("details.contract.release_clause", "Ausstiegsklausel", "Vertrag", "number", true, 0),
    field("details.contract.squad_status", "Kaderstatus", "Vertrag", "string", true),
    field("details.status.transfer_listed", "Auf Transferliste", "Status", "boolean"),
    field("details.status.loan_listed", "Auf Leihliste", "Status", "boolean"),
    field("details.status.injured", "Verletzt", "Status", "boolean"),
    field("details.status.suspended", "Gesperrt", "Status", "boolean"),
    field("details.status.unavailable", "Nicht verfügbar", "Status", "boolean"),
    field("details.tags", "Tags", "Notizen", "list"), field("details.note", "Notiz", "Notizen", "string", true),
  ],
  staff: [
    field("name", "Name", "Identität", "string"), field("age", "Alter", "Identität", "integer", true, 0, 120),
    field("club", "Verein", "Identität", "string", true), field("nationality", "Nationalität", "Identität", "string", true),
    field("roles", "Rollen", "Identität", "list"),
    field("current_ability", "Aktuelle Fähigkeit (CA)", "Fähigkeit", "integer", true, 0, 200),
    field("potential_ability", "Potenzial (PA)", "Fähigkeit", "integer", true, 0, 200),
    field("reputation", "Reputation", "Fähigkeit", "integer", true, 0, 10_000),
    field("contract", "Gesamter Vertrag (JSON)", "Vertrag", "json", true),
    field("contract.club_id", "Vertragsverein-ID", "Vertrag", "string", true),
    field("contract.starts_on", "Vertragsbeginn", "Vertrag", "date", true),
    field("contract.expires_on", "Vertragsende", "Vertrag", "date", true),
    field("contract.contract_type", "Vertragsart", "Vertrag", "string", true),
    field("contract.wage", "Vertragsgehalt", "Vertrag", "number", true, 0),
    field("contract.release_clause", "Ausstiegsklausel", "Vertrag", "number", true, 0),
    field("contract.squad_status", "Kaderstatus", "Vertrag", "string", true),
  ],
  club: [
    field("name", "Name", "Identität", "string"), field("short_name", "Kurzname", "Identität", "string", true),
    field("nation", "Nation", "Identität", "string", true), field("competition", "Wettbewerb", "Identität", "string", true),
    field("reputation", "Reputation", "Vereinsprofil", "integer", true, 0, 10_000),
    field("professional_status", "Profistatus", "Vereinsprofil", "string", true),
    field("stadium", "Stadion", "Vereinsprofil", "string", true),
    field("stadium_capacity", "Stadionkapazität", "Vereinsprofil", "integer", true, 0),
    field("average_attendance", "Zuschauerschnitt", "Vereinsprofil", "integer", true, 0),
    field("finances.balance", "Kontostand", "Finanzen", "number", true),
    field("finances.transfer_budget", "Transferbudget", "Finanzen", "number", true, 0),
    field("finances.wage_budget", "Gehaltsbudget", "Finanzen", "number", true, 0),
    field("finances.debt", "Schulden", "Finanzen", "number", true, 0),
    field("facilities.training", "Trainingseinrichtungen", "Einrichtungen", "integer", true, 1, 20),
    field("facilities.youth", "Jugendeinrichtungen", "Einrichtungen", "integer", true, 1, 20),
    field("facilities.youth_recruitment", "Jugendrekrutierung", "Einrichtungen", "integer", true, 1, 20),
    field("facilities.junior_coaching", "Juniorentraining", "Einrichtungen", "integer", true, 1, 20),
  ],
  competition: [
    field("name", "Name", "Wettbewerb", "string"), field("short_name", "Kurzname", "Wettbewerb", "string", true),
    field("nation", "Nation", "Wettbewerb", "string", true),
    field("reputation", "Reputation", "Wettbewerb", "integer", true, 0, 10_000),
    field("current_champion", "Titelverteidiger", "Wettbewerb", "string", true),
    field("level", "Ligaebene", "Wettbewerb", "integer", true, 1),
  ],
};

export function EditorWorkspace({
  snapshot, onSnapshotChange, liveWriteEnabled = false, gateway = tauriGateway,
}: {
  snapshot: DatabaseSnapshot | null;
  onSnapshotChange: (snapshot: DatabaseSnapshot) => void;
  liveWriteEnabled?: boolean;
  gateway?: EditorGateway;
}) {
  const [kind, setKind] = useState<EditEntityKind>("player");
  const [entityQuery, setEntityQuery] = useState("");
  const [fieldQuery, setFieldQuery] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [selectedFieldPath, setSelectedFieldPath] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [operations, setOperations] = useState<EditOperation[]>([]);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<{ transaction: EditTransaction; result: AppliedTransaction } | null>(null);
  const [history, setHistory] = useState<JournalEntry[]>([]);
  const [message, setMessage] = useState("Arbeitskopie bereit");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const journalId = `canonical-${snapshot?.source ?? "offline"}-workspace-v1`;
  const entities = useMemo(() => entitiesFor(snapshot, kind), [snapshot, kind]);
  const filteredEntities = useMemo(() => {
    const needle = normalize(entityQuery);
    return needle ? entities.filter((entity) => normalize(entityName(entity)).includes(needle)) : entities;
  }, [entities, entityQuery]);
  const selectedEntity = entities.find((entity) => entity.id === selectedEntityId) ?? null;
  const fields = useMemo(() => fieldsFor(kind, selectedEntity), [kind, selectedEntity]);
  const filteredFields = useMemo(() => {
    const needle = normalize(fieldQuery);
    return needle ? fields.filter((item) => normalize(`${item.label} ${item.group} ${item.path}`).includes(needle)) : fields;
  }, [fields, fieldQuery]);
  const selectedField = fields.find((item) => item.path === selectedFieldPath) ?? null;
  const stagedForField = operations.find((operation) => operation.entity_kind === kind
    && operation.entity_id === selectedEntityId && operation.field === selectedFieldPath);
  const currentValue = selectedEntity && selectedField ? valueAtPath(selectedEntity, selectedField.path) : undefined;

  useEffect(() => {
    if (!entities.some((entity) => entity.id === selectedEntityId)) {
      setSelectedEntityId(entities[0]?.id ?? "");
    }
  }, [entities, selectedEntityId]);

  useEffect(() => {
    if (!fields.some((item) => item.path === selectedFieldPath)) {
      setSelectedFieldPath(fields[0]?.path ?? "");
    }
  }, [fields, selectedFieldPath]);

  useEffect(() => {
    if (selectedField) setInputValue(formatEditorValue(stagedForField?.after ?? currentValue, selectedField));
  }, [currentValue, selectedField, stagedForField]);

  useEffect(() => {
    let cancelled = false;
    gateway.history(journalId)
      .then((journal) => { if (!cancelled) setHistory(journal.entries); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [gateway, journalId]);

  function changeKind(next: EditEntityKind) {
    setKind(next);
    setEntityQuery("");
    setFieldQuery("");
    setSelectedEntityId("");
    setSelectedFieldPath("");
  }

  function stageField() {
    if (!selectedEntity || !selectedField) return;
    try {
      const after = parseEditorValue(inputValue, selectedField);
      const before = valueAtPath(selectedEntity, selectedField.path) ?? null;
      setOperations((current) => {
        const withoutCurrent = current.filter((operation) => !(operation.entity_kind === kind
          && operation.entity_id === selectedEntity.id && operation.field === selectedField.path));
        if (equalJson(before, after)) return withoutCurrent;
        return [...withoutCurrent, {
          entity_kind: kind,
          entity_id: selectedEntity.id,
          field: selectedField.path,
          expected_before: { mode: "exact", value: before },
          after,
        }];
      });
      setPreview(null);
      setError("");
      setMessage(equalJson(before, after) ? "Unveränderter Wert entfernt" : `${selectedField.label} vorgemerkt`);
    } catch (nextError) {
      setError(String(nextError));
    }
  }

  function removeOperation(operation: EditOperation) {
    setOperations((current) => current.filter((item) => item !== operation));
    setPreview(null);
  }

  async function createPreview() {
    if (!snapshot || operations.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const transaction = transactionFrom(operations, reason);
      const result = await gateway.preview(snapshot, transaction);
      setPreview({ transaction, result });
      setMessage(`${operations.length} Änderung${operations.length === 1 ? "" : "en"} vollständig validiert`);
    } catch (nextError) {
      setPreview(null);
      setError(`Vorschau abgelehnt: ${String(nextError)}`);
    } finally {
      setBusy(false);
    }
  }

  async function commitPreview() {
    if (!snapshot || !preview) return;
    setBusy(true);
    setError("");
    try {
      const result = await gateway.apply(journalId, snapshot, preview.transaction);
      onSnapshotChange(result.snapshot);
      setHistory((current) => [...current, result.journal_entry]);
      setOperations([]);
      setPreview(null);
      setReason("");
      setMessage("Arbeitskopie atomar committed · Vorher/Nachher gesichert");
    } catch (nextError) {
      setError(`Commit abgelehnt: ${String(nextError)}`);
    } finally {
      setBusy(false);
    }
  }

  async function undoLast() {
    const last = history.at(-1);
    if (!snapshot || !last) return;
    setBusy(true);
    setError("");
    try {
      const result = await gateway.undo(
        journalId, snapshot, last.transaction_id, newTransactionId("undo"), new Date().toISOString(),
      );
      onSnapshotChange(result.snapshot);
      setHistory((current) => [...current, result.journal_entry]);
      setOperations([]);
      setPreview(null);
      setMessage(`${last.transaction_id} exakt rückgängig gemacht`);
    } catch (nextError) {
      setError(`Undo abgelehnt: ${String(nextError)}`);
    } finally {
      setBusy(false);
    }
  }

  async function restoreLatest() {
    const last = history.at(-1);
    if (!last) return;
    setBusy(true);
    setError("");
    try {
      const restored = await gateway.restore(last.snapshot_after_hash);
      onSnapshotChange(restored);
      setOperations([]);
      setPreview(null);
      setMessage("Letzten verifizierten Journalstand geladen");
    } catch (nextError) {
      setError(`Wiederherstellung abgelehnt: ${String(nextError)}`);
    } finally {
      setBusy(false);
    }
  }

  if (!snapshot) {
    return <Card className="editor-empty"><Card.Content><DatabaseBackup size={24} /><strong>Snapshot wird vorbereitet</strong><span>Der Editor startet erst mit einer validierten Arbeitskopie.</span></Card.Content></Card>;
  }

  return (
    <div className="editor-workspace">
      <Card className="editor-hero">
        <Card.Header>
          <div><span className="eyebrow">TRANSAKTIONALER EDITOR</span><Card.Title>Sichere Arbeitskopie</Card.Title><Card.Description>Exakte Preview-Werte, atomare Validierung, private Backups und Hash-Journal.</Card.Description></div>
          <div className="editor-safety-state">
            <span className="engine-badge"><ShieldCheck size={13} /> SCHEMA {snapshot.schema_version}</span>
            <span className={`profile-state ${liveWriteEnabled ? "exact" : ""}`}>{liveWriteEnabled ? "LIVE-ADAPTER FREIGEGEBEN" : "LIVE-SCHREIBEN GESPERRT"}</span>
          </div>
        </Card.Header>
        <Card.Content className="editor-summary">
          <div><PencilLine size={16} /><span>Vorgemerkt</span><strong>{operations.length}</strong></div>
          <div><CheckCircle2 size={16} /><span>Vorschau</span><strong>{preview ? "Validiert" : "Offen"}</strong></div>
          <div><History size={16} /><span>Journal</span><strong>{history.length} Einträge</strong></div>
          <div><DatabaseBackup size={16} /><span>Ziel</span><strong>{sourceLabel(snapshot.source)}</strong></div>
        </Card.Content>
      </Card>

      <div className="editor-columns">
        <Card className="editor-panel entity-panel">
          <Card.Header><div><Card.Title>1 · Datensatz</Card.Title><Card.Description>Entität eindeutig auswählen</Card.Description></div></Card.Header>
          <Card.Content>
            <div className="editor-kind-tabs" role="group" aria-label="Editor-Entitätstyp wählen">
              {kinds.map((item) => <Button key={item.id} isIconOnly size="sm" variant={kind === item.id ? "primary" : "ghost"} aria-label={item.label} aria-pressed={kind === item.id} onPress={() => changeKind(item.id)}><item.icon size={14} /></Button>)}
            </div>
            <TextField aria-label="Editor-Datensätze durchsuchen" value={entityQuery} onChange={setEntityQuery} className="editor-search"><Search className="search-icon" size={14} /><Input placeholder="Name suchen …" /></TextField>
            <div className="editor-entity-list" role="group" aria-label="Editierbare Datensätze">
              {filteredEntities.map((entity) => <Button key={entity.id} variant={selectedEntityId === entity.id ? "secondary" : "ghost"} className="editor-entity" aria-pressed={selectedEntityId === entity.id} onPress={() => setSelectedEntityId(entity.id)}><span>{initials(entityName(entity))}</span><div><strong>{entityName(entity)}</strong><small>{entitySubtitle(entity, kind)}</small></div></Button>)}
            </div>
          </Card.Content>
        </Card>

        <Card className="editor-panel field-panel">
          <Card.Header><div><Card.Title>2 · Feld bearbeiten</Card.Title><Card.Description>{fields.length} freigegebene Felder für {kinds.find((item) => item.id === kind)?.label}</Card.Description></div></Card.Header>
          <Card.Content>
            <TextField aria-label="Editor-Felder durchsuchen" value={fieldQuery} onChange={setFieldQuery} className="editor-search"><Search className="search-icon" size={14} /><Input placeholder="Feld oder Gruppe …" /></TextField>
            <div className="editor-field-layout">
              <div className="editor-field-list" role="group" aria-label="Editierbare Felder">
                {filteredFields.map((item) => <Button key={item.path} variant={selectedFieldPath === item.path ? "secondary" : "ghost"} className="editor-field" aria-pressed={selectedFieldPath === item.path} onPress={() => setSelectedFieldPath(item.path)}><span>{item.group}</span><strong>{item.label}</strong></Button>)}
              </div>
              {selectedEntity && selectedField && <div className="editor-value-card">
                <div className="editor-value-heading"><div><span>{selectedField.group}</span><strong>{selectedField.label}</strong></div><code>{selectedField.path}</code></div>
                <div className="editor-before"><span>Aktueller Wert</span><strong>{humanValue(currentValue)}</strong></div>
                {selectedField.type === "boolean" ? <div className="boolean-picker" role="group" aria-label={`Neuer Wert für ${selectedField.label}`}><Button size="sm" variant={inputValue === "true" ? "primary" : "secondary"} onPress={() => setInputValue("true")}><Check size={13} /> Ja</Button><Button size="sm" variant={inputValue === "false" ? "primary" : "secondary"} onPress={() => setInputValue("false")}><Trash2 size={13} /> Nein</Button></div>
                  : selectedField.type === "json" ? <TextArea aria-label={`Neuer Wert für ${selectedField.label}`} value={inputValue} onChange={(event) => setInputValue(event.target.value)} className="editor-json-input" />
                    : <TextField aria-label={`Neuer Wert für ${selectedField.label}`} value={inputValue} onChange={setInputValue}><Input placeholder={inputHint(selectedField)} /></TextField>}
                <div className="editor-input-meta"><span>{fieldConstraint(selectedField)}</span>{selectedField.nullable && <span>Leer = nicht gesetzt</span>}</div>
                <Button onPress={stageField}><PencilLine size={14} /> Änderung vormerken</Button>
              </div>}
            </div>
          </Card.Content>
        </Card>

        <Card className="editor-panel change-panel">
          <Card.Header><div><Card.Title>3 · Prüfen & committen</Card.Title><Card.Description>Keine Teiländerungen bei Fehlern</Card.Description></div><span className="nav-count">{operations.length}</span></Card.Header>
          <Card.Content>
            <div className="editor-change-list" aria-label="Vorgemerkte Änderungen">
              {operations.length === 0 ? <div className="editor-change-empty"><PencilLine size={20} /><span>Noch keine Änderungen vorgemerkt</span></div> : operations.map((operation) => <div className="editor-change" key={`${operation.entity_kind}-${operation.entity_id}-${operation.field}`}><div><span>{entityLabel(snapshot, operation)}</span><strong>{fieldLabel(operation.entity_kind, operation.field)}</strong></div><div className="editor-change-values"><code>{humanValue(expectationValue(operation))}</code><ArrowRight size={12} /><code>{humanValue(operation.after)}</code></div><Button isIconOnly size="sm" variant="ghost" aria-label={`${operation.field} entfernen`} onPress={() => removeOperation(operation)}><Trash2 size={13} /></Button></div>)}
            </div>
            <TextField aria-label="Grund für die Transaktion" value={reason} onChange={(value) => { setReason(value); setPreview(null); }}><Input placeholder="Optionaler Journal-Kommentar …" maxLength={1000} /></TextField>
            {error && <div className="editor-alert error" role="alert"><AlertTriangle size={14} /><span>{error}</span></div>}
            {!error && <div className="editor-alert"><ShieldCheck size={14} /><span>{message}</span></div>}
            {preview && <div className="preview-proof"><CheckCircle2 size={16} /><div><strong>Vorschau vollständig gültig</strong><span>{shortHash(preview.result.journal_entry.snapshot_before_hash)} → {shortHash(preview.result.journal_entry.snapshot_after_hash)}</span></div></div>}
            <div className="editor-commit-actions">
              <Button variant="secondary" isDisabled={busy || operations.length === 0} onPress={createPreview}><ShieldCheck size={14} /> Vorschau validieren</Button>
              <Button isDisabled={busy || !preview} onPress={commitPreview}><DatabaseBackup size={14} /> Arbeitskopie committen</Button>
            </div>
          </Card.Content>
        </Card>
      </div>

      <Card className="editor-history-card">
        <Card.Header><div><Card.Title>Transaktionsverlauf</Card.Title><Card.Description>Hash-verkettete, save-spezifische Historie mit exaktem Undo.</Card.Description></div><div className="history-actions"><Button size="sm" variant="secondary" isDisabled={busy || history.length === 0} onPress={restoreLatest}><DatabaseBackup size={14} /> Letzten Stand laden</Button><Button size="sm" variant="secondary" isDisabled={busy || history.length === 0} onPress={undoLast}><RotateCcw size={14} /> Letzte Transaktion rückgängig</Button></div></Card.Header>
        <Card.Content>
          {history.length === 0 ? <div className="editor-history-empty"><Clock3 size={18} /> Noch keine committen Änderungen in diesem Journal.</div> : <div className="editor-history-list">{history.slice().reverse().slice(0, 8).map((entry) => <div className="editor-history-row" key={entry.transaction_id}><span className={entry.reverts_transaction_id ? "undo" : "commit"}>{entry.reverts_transaction_id ? <RotateCcw size={13} /> : <Check size={13} />}</span><div><strong>{entry.reason || (entry.reverts_transaction_id ? `Undo ${entry.reverts_transaction_id}` : "Editor-Transaktion")}</strong><small>{entry.transaction_id} · {entry.changes.length} Änderung{entry.changes.length === 1 ? "" : "en"}</small></div><code>{shortHash(entry.snapshot_after_hash)}</code></div>)}</div>}
        </Card.Content>
      </Card>
    </div>
  );
}

function field(path: string, label: string, group: string, type: ValueType, nullable = false, min?: number, max?: number): EditorField {
  return { path, label, group, type, nullable, min, max };
}

function entitiesFor(snapshot: DatabaseSnapshot | null, kind: EditEntityKind): EditorEntity[] {
  if (!snapshot) return [];
  if (kind === "player") return snapshot.players;
  if (kind === "staff") return snapshot.staff;
  if (kind === "club") return snapshot.clubs;
  return snapshot.competitions;
}

function fieldsFor(kind: EditEntityKind, entity: EditorEntity | null): EditorField[] {
  if (!entity) return basicFields[kind];
  const fields = basicFields[kind].filter((item) => {
    if (item.path.includes("contract.") && valueAtPath(entity, item.path.split(".").slice(0, -1).join(".")) == null) return false;
    if (item.path.startsWith("details.status.") && valueAtPath(entity, "details.status") == null) return false;
    return true;
  });
  if ((kind === "player" || kind === "staff") && "attributes" in entity) {
    const labels = kind === "player"
      ? new Map(playerColumns.filter((item) => item.attribute).map((item) => [item.attribute!, [item.label, item.category]]))
      : staffAttributeLabels;
    const attributeIds = [...new Set([...labels.keys(), ...Object.keys(entity.attributes)])];
    const attributes = attributeIds.sort((left, right) => {
      const leftLabel = labels.get(left)?.[0] ?? left;
      const rightLabel = labels.get(right)?.[0] ?? right;
      return leftLabel.localeCompare(rightLabel, "de");
    }).map((attribute) => {
      const [label, group] = labels.get(attribute) ?? [humanize(attribute), kind === "player" ? "Attribute" : "Staff-Attribute"];
      return field(`attributes.${attribute}`, label, group, "integer", false, 1, 20);
    });
    return [...fields, ...attributes];
  }
  return fields;
}

const staffAttributeLabels = new Map<string, [string, string]>([
  ["adaptability", "Anpassungsfähigkeit"], ["determination", "Zielstrebigkeit"], ["level_of_discipline", "Disziplin"],
  ["man_management", "Mitarbeiterführung"], ["motivating", "Motivieren"], ["judging_player_ability", "Spielerfähigkeit beurteilen"],
  ["judging_player_potential", "Spielerpotenzial beurteilen"], ["tactical_knowledge", "Taktikwissen"],
  ["working_with_youngsters", "Arbeit mit jungen Spielern"], ["attacking", "Angriff"], ["defending", "Verteidigung"],
  ["fitness", "Fitness"], ["goalkeepers", "Torhüter"], ["mental", "Mental"], ["tactical", "Taktik"], ["technical", "Technik"],
].map(([id, label]) => [id, [label, "Staff-Attribute"]]));

function valueAtPath(entity: EditorEntity, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => current && typeof current === "object"
    ? (current as Record<string, unknown>)[segment] : undefined, entity);
}

function parseEditorValue(input: string, item: EditorField): unknown {
  const trimmed = input.trim();
  if (trimmed === "" && item.nullable) return null;
  if (item.type === "string") return input.trim();
  if (item.type === "boolean") return trimmed === "true";
  if (item.type === "list") return trimmed ? [...new Set(input.split(",").map((value) => value.trim()).filter(Boolean))] : [];
  if (item.type === "json") {
    try { return JSON.parse(input); } catch { throw new Error("JSON ist syntaktisch ungültig"); }
  }
  if (item.type === "date") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (!match) throw new Error("Datum muss das Format JJJJ-MM-TT haben");
    const value = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
    const verified = new Date(Date.UTC(value.year, value.month - 1, value.day));
    if (verified.getUTCFullYear() !== value.year || verified.getUTCMonth() + 1 !== value.month || verified.getUTCDate() !== value.day) throw new Error("Datum ist nicht gültig");
    return value;
  }
  if (item.type === "enum") {
    if (!item.options?.includes(trimmed)) throw new Error(`Erlaubt: ${item.options?.join(", ")}`);
    return trimmed;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || (item.type === "integer" && !Number.isInteger(value))) throw new Error(item.type === "integer" ? "Eine ganze Zahl ist erforderlich" : "Eine Zahl ist erforderlich");
  if (item.min != null && value < item.min) throw new Error(`Mindestwert: ${item.min}`);
  if (item.max != null && value > item.max) throw new Error(`Höchstwert: ${item.max}`);
  return value;
}

function formatEditorValue(value: unknown, item: EditorField): string {
  if (value == null) return "";
  if (item.type === "list" && Array.isArray(value)) return value.join(", ");
  if (item.type === "date" && typeof value === "object") {
    const date = value as { year: number; month: number; day: number };
    return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
  }
  if (item.type === "json") return JSON.stringify(value, null, 2);
  return String(value);
}

function transactionFrom(operations: EditOperation[], reason: string): EditTransaction {
  return { schema_version: 1, id: newTransactionId("tx"), created_at_utc: new Date().toISOString(), reason: reason.trim() || null, operations };
}

function newTransactionId(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
}

function entityName(entity: EditorEntity) { return entity.name; }
function entitySubtitle(entity: EditorEntity, kind: EditEntityKind) {
  if (kind === "player" || kind === "staff") return ["club" in entity ? entity.club : null, "nationality" in entity ? entity.nationality : null].filter(Boolean).join(" · ") || entity.id;
  if (kind === "club") return [(entity as Club).competition, (entity as Club).nation].filter(Boolean).join(" · ") || entity.id;
  return (entity as Competition).nation || entity.id;
}
function entityLabel(snapshot: DatabaseSnapshot, operation: EditOperation) {
  return entitiesFor(snapshot, operation.entity_kind).find((entity) => entity.id === operation.entity_id)?.name ?? operation.entity_id;
}
function fieldLabel(kind: EditEntityKind, path: string) { return basicFields[kind].find((item) => item.path === path)?.label ?? humanize(path.split(".").at(-1) ?? path); }
function expectationValue(operation: EditOperation) { return operation.expected_before.mode === "exact" ? operation.expected_before.value : null; }
function sourceLabel(source: DatabaseSnapshot["source"]) { return ({ synthetic: "Sichere Demo", csv: "CSV-Arbeitskopie", live: "Live-Snapshot", save_game: "Spielstand" })[source]; }
function humanize(value: string) { return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toLocaleUpperCase("de")); }
function humanValue(value: unknown) {
  if (value == null) return "–";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (Array.isArray(value)) return value.join(", ") || "–";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function initials(value: string) { return value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toLocaleUpperCase("de"); }
function normalize(value: string) { return value.trim().toLocaleLowerCase("de").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function equalJson(left: unknown, right: unknown) { return JSON.stringify(left) === JSON.stringify(right); }
function shortHash(hash: string) { return `${hash.slice(0, 8)}…${hash.slice(-6)}`; }
function inputHint(item: EditorField) {
  if (item.type === "date") return "JJJJ-MM-TT";
  if (item.type === "list") return "Kommagetrennte Werte";
  if (item.type === "enum") return item.options?.join(" · ") ?? "Wert";
  return item.type === "integer" || item.type === "number" ? "Neuer Zahlenwert" : "Neuer Wert";
}
function fieldConstraint(item: EditorField) {
  if (item.type === "boolean") return "Ja oder Nein";
  if (item.type === "date") return "Gültiges Kalenderdatum";
  if (item.type === "list") return "Kommagetrennte Liste";
  if (item.type === "json") return "Typisiertes JSON-Objekt";
  if (item.options) return item.options.join(" · ");
  if (item.min != null || item.max != null) return `${item.min ?? "−∞"} bis ${item.max ?? "∞"}`;
  return "Freigegebenes kanonisches Feld";
}
