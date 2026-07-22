import { useEffect, useMemo, useState } from "react";
import { Button, Card, Input, TextField } from "@heroui/react";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertTriangle, Check, CheckCircle2, ChevronRight, Eye, FileClock, Gauge,
  Layers3, Pause, PencilLine, Play, Plus, RefreshCw, Save, ShieldCheck,
  Snowflake, Trash2, TrendingUp, Users, UserRoundCog, Building2, Trophy,
} from "lucide-react";

import {
  entitiesFor, entityName, entitySubtitle, fieldsFor, valueAtPath,
} from "./EditorWorkspace";
import type {
  AppliedTransaction, DatabaseSnapshot, EditEntityKind, EditTransaction,
  FreezeObservation, FreezeObservationState, FreezePlan, FreezePolicy,
  FreezeReport, FreezeRule, PreparedFreezeCorrection,
} from "./types";

export type FreezerGateway = {
  list: () => Promise<FreezePlan[]>;
  upsert: (plan: FreezePlan) => Promise<void>;
  remove: (planId: string) => Promise<void>;
  evaluate: (snapshot: DatabaseSnapshot, plan: FreezePlan, checkedAtUtc: string) => Promise<FreezeReport>;
  prepare: (
    snapshot: DatabaseSnapshot,
    plan: FreezePlan,
    transactionId: string,
    createdAtUtc: string,
  ) => Promise<PreparedFreezeCorrection>;
  apply: (journalId: string, snapshot: DatabaseSnapshot, transaction: EditTransaction) => Promise<AppliedTransaction>;
};

const tauriGateway: FreezerGateway = {
  list: () => invoke("list_freeze_plans"),
  upsert: (plan) => invoke("upsert_freeze_plan", { plan }),
  remove: (planId) => invoke("delete_freeze_plan", { planId }),
  evaluate: (snapshot, plan, checkedAtUtc) => invoke("evaluate_freeze_plan", { snapshot, plan, checkedAtUtc }),
  prepare: (snapshot, plan, transactionId, createdAtUtc) => invoke("prepare_freeze_correction", {
    snapshot, plan, transactionId, createdAtUtc,
  }),
  apply: (journalId, snapshot, transaction) => invoke("apply_snapshot_transaction", { journalId, snapshot, transaction }),
};

const kinds: Array<{ id: EditEntityKind; label: string; icon: typeof Users }> = [
  { id: "player", label: "Spieler", icon: Users },
  { id: "staff", label: "Staff", icon: UserRoundCog },
  { id: "club", label: "Vereine", icon: Building2 },
  { id: "competition", label: "Wettbewerbe", icon: Trophy },
];

const policies: Array<{ id: FreezePolicy; label: string; detail: string; icon: typeof Snowflake }> = [
  { id: "exact", label: "Exakt sperren", detail: "Jede Abweichung korrigieren", icon: Snowflake },
  { id: "allow_increase", label: "Plus erlauben", detail: "Nur Rückgänge korrigieren", icon: TrendingUp },
  { id: "monitor_only", label: "Beobachten", detail: "Änderung nur protokollieren", icon: Eye },
];

type MonitorFilter = "all" | "violations" | "changes";

export function FreezerWorkspace({
  snapshot, onSnapshotChange, liveWriteEnabled = false, gateway = tauriGateway,
}: {
  snapshot: DatabaseSnapshot | null;
  onSnapshotChange: (snapshot: DatabaseSnapshot) => void;
  liveWriteEnabled?: boolean;
  gateway?: FreezerGateway;
}) {
  const [plans, setPlans] = useState<FreezePlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [kind, setKind] = useState<EditEntityKind>("player");
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [selectedFieldPaths, setSelectedFieldPaths] = useState<string[]>([]);
  const [draftRules, setDraftRules] = useState<FreezeRule[]>([]);
  const [policy, setPolicy] = useState<FreezePolicy>("exact");
  const [fieldQuery, setFieldQuery] = useState("");
  const [monitorFilter, setMonitorFilter] = useState<MonitorFilter>("all");
  const [report, setReport] = useState<FreezeReport | null>(null);
  const [prepared, setPrepared] = useState<PreparedFreezeCorrection | null>(null);
  const [message, setMessage] = useState("Pläne werden geladen …");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteArmedId, setDeleteArmedId] = useState<string | null>(null);

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const entities = useMemo(() => entitiesFor(snapshot, kind), [snapshot, kind]);
  const selectedEntities = entities.filter((entity) => selectedEntityIds.includes(entity.id));
  const referenceEntity = selectedEntities[0] ?? entities[0] ?? null;
  const numericFields = useMemo(() => fieldsFor(kind, referenceEntity)
    .filter((item) => item.type === "integer" || item.type === "number")
    .filter((item) => {
      const targets = selectedEntities.length > 0 ? selectedEntities : referenceEntity ? [referenceEntity] : [];
      return targets.length > 0 && targets.every((entity) => typeof valueAtPath(entity, item.path) === "number");
    }), [kind, referenceEntity, selectedEntities]);
  const filteredFields = useMemo(() => {
    const needle = normalize(fieldQuery);
    return needle
      ? numericFields.filter((item) => normalize(`${item.label} ${item.group} ${item.path}`).includes(needle))
      : numericFields;
  }, [fieldQuery, numericFields]);
  const visibleObservations = useMemo(() => {
    if (!report) return [];
    if (monitorFilter === "violations") {
      return report.observations.filter((item) => item.state === "violation" || isUnresolved(item.state));
    }
    if (monitorFilter === "changes") {
      return report.observations.filter((item) => item.state !== "unchanged");
    }
    return report.observations;
  }, [monitorFilter, report]);

  useEffect(() => {
    let cancelled = false;
    gateway.list().then((loaded) => {
      if (cancelled) return;
      setPlans(loaded);
      setSelectedPlanId((current) => loaded.some((plan) => plan.id === current) ? current : loaded[0]?.id ?? "");
      setMessage(loaded.length > 0 ? `${loaded.length} Freezer-Pläne geladen` : "Noch kein Freezer-Plan angelegt");
    }).catch((reason) => {
      if (!cancelled) setError(`Freezer-Pläne konnten nicht geladen werden: ${String(reason)}`);
    });
    return () => { cancelled = true; };
  }, [gateway]);

  useEffect(() => {
    if (!snapshot || !selectedPlan) {
      setReport(null);
      setPrepared(null);
      return;
    }
    let cancelled = false;
    setPrepared(null);
    gateway.evaluate(snapshot, selectedPlan, new Date().toISOString()).then((next) => {
      if (!cancelled) {
        setReport(next);
        setError("");
        setMessage(reportMessage(next));
      }
    }).catch((reason) => {
      if (!cancelled) {
        setReport(null);
        setError(`Plan konnte nicht geprüft werden: ${String(reason)}`);
      }
    });
    return () => { cancelled = true; };
  }, [gateway, selectedPlan, snapshot]);

  function changeKind(next: EditEntityKind) {
    setKind(next);
    setSelectedEntityIds([]);
    setSelectedFieldPaths([]);
    setFieldQuery("");
  }

  function toggleEntity(entityId: string) {
    setSelectedEntityIds((current) => toggleInList(current, entityId));
    setSelectedFieldPaths([]);
  }

  function addRules() {
    setError("");
    if (selectedEntities.length === 0 || selectedFieldPaths.length === 0) {
      setError("Mindestens ein Ziel und ein Zahlenfeld auswählen");
      return;
    }
    const additions = selectedEntities.flatMap((entity) => selectedFieldPaths.flatMap((field) => {
      const baseline = valueAtPath(entity, field);
      return typeof baseline === "number" ? [{
        entity_kind: kind,
        entity_id: entity.id,
        field,
        baseline,
        policy,
      } satisfies FreezeRule] : [];
    }));
    const merged = new Map(draftRules.map((rule) => [ruleKey(rule), rule]));
    additions.forEach((rule) => merged.set(ruleKey(rule), rule));
    if (merged.size > 5_000) {
      setError("Ein Plan darf höchstens 5.000 eindeutige Regeln enthalten");
      return;
    }
    setDraftRules([...merged.values()]);
    setSelectedFieldPaths([]);
    setMessage(`${additions.length} Regeln mit aktuellem Ausgangswert vorgemerkt`);
  }

  async function savePlan() {
    if (!snapshot) return;
    if (!draftName.trim()) {
      setError("Der Plan benötigt einen Namen");
      return;
    }
    if (draftRules.length === 0) {
      setError("Der Plan benötigt mindestens eine vorgemerkte Regel");
      return;
    }
    const existing = plans.find((plan) => plan.id === editingPlanId);
    if (existing && existing.snapshot_source !== snapshot.source) {
      setError("Ein Plan kann nur in seiner ursprünglichen Snapshot-Quelle bearbeitet werden");
      return;
    }
    const now = new Date().toISOString();
    const plan: FreezePlan = {
      schema_version: 1,
      id: existing?.id ?? newId("freeze-plan"),
      name: draftName.trim(),
      created_at_utc: existing?.created_at_utc ?? now,
      updated_at_utc: now,
      snapshot_source: snapshot.source,
      enabled: existing?.enabled ?? true,
      rules: draftRules,
    };
    setBusy(true);
    setError("");
    try {
      await gateway.upsert(plan);
      setPlans((current) => [plan, ...current.filter((item) => item.id !== plan.id)]);
      setSelectedPlanId(plan.id);
      resetBuilder();
      setMessage(`${plan.name} mit ${plan.rules.length} Regeln sicher gespeichert`);
    } catch (reason) {
      setError(`Plan konnte nicht gespeichert werden: ${String(reason)}`);
    } finally {
      setBusy(false);
    }
  }

  function editPlan(plan: FreezePlan) {
    setEditingPlanId(plan.id);
    setDraftName(plan.name);
    setDraftRules(plan.rules);
    const nextKind = plan.rules[0]?.entity_kind ?? "player";
    setKind(nextKind);
    setSelectedEntityIds([]);
    setSelectedFieldPaths([]);
    setPolicy(plan.rules[0]?.policy ?? "exact");
    setMessage(`${plan.name} als bearbeitbaren Entwurf geladen`);
    setError("");
  }

  async function togglePlan(plan: FreezePlan) {
    const updated = { ...plan, enabled: !plan.enabled, updated_at_utc: new Date().toISOString() };
    setBusy(true);
    setError("");
    try {
      await gateway.upsert(updated);
      setPlans((current) => current.map((item) => item.id === updated.id ? updated : item));
      setMessage(updated.enabled ? `${updated.name} aktiviert` : `${updated.name} pausiert`);
    } catch (reason) {
      setError(`Planstatus konnte nicht geändert werden: ${String(reason)}`);
    } finally {
      setBusy(false);
    }
  }

  async function removePlan(plan: FreezePlan) {
    if (deleteArmedId !== plan.id) {
      setDeleteArmedId(plan.id);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await gateway.remove(plan.id);
      const remaining = plans.filter((item) => item.id !== plan.id);
      setPlans(remaining);
      setSelectedPlanId((current) => current === plan.id ? remaining[0]?.id ?? "" : current);
      setDeleteArmedId(null);
      if (editingPlanId === plan.id) resetBuilder();
      setMessage(`${plan.name} gelöscht`);
    } catch (reason) {
      setError(`Plan konnte nicht gelöscht werden: ${String(reason)}`);
    } finally {
      setBusy(false);
    }
  }

  async function refreshReport() {
    if (!snapshot || !selectedPlan) return;
    setBusy(true);
    setError("");
    try {
      const next = await gateway.evaluate(snapshot, selectedPlan, new Date().toISOString());
      setReport(next);
      setPrepared(null);
      setMessage(reportMessage(next));
    } catch (reason) {
      setError(`Plan konnte nicht geprüft werden: ${String(reason)}`);
    } finally {
      setBusy(false);
    }
  }

  async function prepareCorrection() {
    if (!snapshot || !selectedPlan) return;
    setBusy(true);
    setError("");
    try {
      const next = await gateway.prepare(snapshot, selectedPlan, newId("freeze-correction"), new Date().toISOString());
      setPrepared(next);
      setReport(next.report);
      setMessage(next.transaction
        ? `${next.transaction.operations.length} Korrekturen atomar validiert`
        : "Keine Korrektur erforderlich");
    } catch (reason) {
      setPrepared(null);
      setError(`Korrektur konnte nicht vorbereitet werden: ${String(reason)}`);
    } finally {
      setBusy(false);
    }
  }

  async function commitCorrection() {
    if (!snapshot || !selectedPlan || !prepared?.transaction) return;
    setBusy(true);
    setError("");
    try {
      const applied = await gateway.apply(
        `freezer-${snapshot.source}-workspace-v1`,
        snapshot,
        prepared.transaction,
      );
      onSnapshotChange(applied.snapshot);
      const next = await gateway.evaluate(applied.snapshot, selectedPlan, new Date().toISOString());
      setReport(next);
      setPrepared(null);
      setMessage(`${applied.journal_entry.changes.length} Werte korrigiert, gesichert und im Journal erfasst`);
    } catch (reason) {
      setError(`Korrektur wurde nicht übernommen: ${String(reason)}`);
    } finally {
      setBusy(false);
    }
  }

  function resetBuilder() {
    setEditingPlanId(null);
    setDraftName("");
    setDraftRules([]);
    setSelectedEntityIds([]);
    setSelectedFieldPaths([]);
    setFieldQuery("");
  }

  if (!snapshot) {
    return <Card className="freezer-empty"><Card.Content><Snowflake size={28} /><strong>Kein Snapshot verfügbar</strong><span>Erst Daten laden oder die sichere Demo-Arbeitskopie öffnen.</span></Card.Content></Card>;
  }

  return <div className="freezer-workspace">
    <Card className="freezer-hero">
      <Card.Header>
        <div className="freezer-heading"><span><Snowflake size={21} /></span><div><Card.Title>Attribute Freezer & Change Monitor</Card.Title><Card.Description>Feldgenaue Baselines, erlaubte Steigerungen und atomare Korrekturen</Card.Description></div></div>
        <div className="freezer-safety"><ShieldCheck size={15} /><div><strong>{liveWriteEnabled ? "Live-Adapter freigegeben" : "Sichere Arbeitskopie"}</strong><span>{liveWriteEnabled ? "Live-Commit nutzt dieselben Konflikt- und Backup-Gates" : "Keine Änderung am laufenden Spiel"}</span></div></div>
      </Card.Header>
      <Card.Content>
        <span className="freezer-source">QUELLE · {sourceLabel(snapshot.source)}</span>
        <span className={error ? "freezer-message error" : "freezer-message"} role={error ? "alert" : "status"}>{error || message}</span>
      </Card.Content>
    </Card>

    <div className="freezer-layout">
      <Card className="freezer-plan-card">
        <Card.Header><div><Card.Title>Pläne</Card.Title><Card.Description>Privat und atomar gespeichert</Card.Description></div><span className="nav-count">{plans.length}</span></Card.Header>
        <Card.Content>
          <div className="freezer-plan-list">
            {plans.length === 0 ? <div className="freezer-list-empty"><Snowflake size={21} /><span>Noch keine Baseline</span></div> : plans.map((plan) => <div key={plan.id} className={`freezer-plan-row ${selectedPlanId === plan.id ? "selected" : ""}`}>
              <Button variant="ghost" onPress={() => setSelectedPlanId(plan.id)} aria-label={`Plan ${plan.name} öffnen`}>
                <span className={plan.enabled ? "plan-state active" : "plan-state"}>{plan.enabled ? <Snowflake size={13} /> : <Pause size={13} />}</span>
                <span><strong>{plan.name}</strong><small>{plan.rules.length} Regeln · {sourceLabel(plan.snapshot_source)}</small></span>
                <ChevronRight size={13} />
              </Button>
              <div className="freezer-plan-actions">
                <Button isIconOnly size="sm" variant="ghost" aria-label={`${plan.name} bearbeiten`} onPress={() => editPlan(plan)}><PencilLine size={12} /></Button>
                <Button isIconOnly size="sm" variant="ghost" aria-label={`${plan.name} ${plan.enabled ? "pausieren" : "aktivieren"}`} onPress={() => void togglePlan(plan)}>{plan.enabled ? <Pause size={12} /> : <Play size={12} />}</Button>
                <Button isIconOnly size="sm" variant={deleteArmedId === plan.id ? "danger" : "ghost"} aria-label={deleteArmedId === plan.id ? `${plan.name} Löschen bestätigen` : `${plan.name} löschen`} onPress={() => void removePlan(plan)}><Trash2 size={12} /></Button>
              </div>
            </div>)}
          </div>
          <Button size="sm" variant="secondary" onPress={resetBuilder}><Plus size={13} /> Neuer Plan</Button>
        </Card.Content>
      </Card>

      <Card className="freezer-builder-card">
        <Card.Header><div><Card.Title>{editingPlanId ? "Plan bearbeiten" : "Baseline erfassen"}</Card.Title><Card.Description>Regeln erhalten ihren Ausgangswert aus diesem Snapshot</Card.Description></div><Layers3 size={16} /></Card.Header>
        <Card.Content>
          <TextField aria-label="Name des Freezer-Plans" value={draftName} onChange={setDraftName}><Input placeholder="z. B. Talente schützen" /></TextField>
          <div className="freezer-kind-tabs" role="group" aria-label="Entitätstyp">
            {kinds.map(({ id, label, icon: Icon }) => <Button key={id} size="sm" variant={kind === id ? "primary" : "secondary"} aria-pressed={kind === id} onPress={() => changeKind(id)}><Icon size={12} /> {label}</Button>)}
          </div>
          <BuilderSection title="1 · Ziele" count={selectedEntityIds.length}>
            <div className="freezer-target-list">
              {entities.map((entity) => {
                const selected = selectedEntityIds.includes(entity.id);
                return <Button key={entity.id} variant={selected ? "secondary" : "ghost"} aria-label={`Freezer-Ziel ${entityName(entity)}`} aria-pressed={selected} onPress={() => toggleEntity(entity.id)}><span className={`bulk-check ${selected ? "selected" : ""}`}>{selected && <Check size={11} />}</span><span><strong>{entityName(entity)}</strong><small>{entitySubtitle(entity, kind)}</small></span></Button>;
              })}
            </div>
          </BuilderSection>
          <BuilderSection title="2 · Zahlenfelder" count={selectedFieldPaths.length}>
            <TextField aria-label="Freezer-Felder durchsuchen" value={fieldQuery} onChange={setFieldQuery}><Input placeholder="Attribut oder Feld suchen …" /></TextField>
            <div className="freezer-field-list">
              {filteredFields.map((item) => {
                const selected = selectedFieldPaths.includes(item.path);
                return <Button key={item.path} size="sm" variant={selected ? "secondary" : "ghost"} aria-pressed={selected} onPress={() => setSelectedFieldPaths((current) => toggleInList(current, item.path))}><span>{item.group}</span><strong>{item.label}</strong></Button>;
              })}
            </div>
          </BuilderSection>
          <BuilderSection title="3 · Feldrichtlinie">
            <div className="freezer-policy-list">
              {policies.map(({ id, label, detail, icon: Icon }) => <Button key={id} variant={policy === id ? "secondary" : "ghost"} aria-pressed={policy === id} onPress={() => setPolicy(id)}><Icon size={13} /><span><strong>{label}</strong><small>{detail}</small></span></Button>)}
            </div>
            <Button size="sm" variant="secondary" onPress={addRules}><Plus size={13} /> {selectedEntityIds.length * selectedFieldPaths.length || 0} Regeln vormerken</Button>
          </BuilderSection>
          <div className="freezer-draft">
            <div className="freezer-draft-head"><span>VORGEMERKTE REGELN</span><strong>{draftRules.length}</strong></div>
            {draftRules.length === 0 ? <div className="freezer-draft-empty">Ziele, Felder und Richtlinie auswählen.</div> : <div className="freezer-draft-list">{draftRules.slice(0, 8).map((rule) => <div key={ruleKey(rule)}><span><strong>{ruleEntityLabel(snapshot, rule)}</strong><small>{fieldLabel(snapshot, rule)}</small></span><code>{humanValue(rule.baseline)}</code><span className={`policy-pill ${rule.policy}`}>{policyLabel(rule.policy)}</span><Button isIconOnly size="sm" variant="ghost" aria-label={`Regel ${fieldLabel(snapshot, rule)} entfernen`} onPress={() => setDraftRules((current) => current.filter((item) => ruleKey(item) !== ruleKey(rule)))}><Trash2 size={11} /></Button></div>)}{draftRules.length > 8 && <span className="freezer-more">+ {draftRules.length - 8} weitere Regeln</span>}</div>}
          </div>
          <div className="freezer-builder-actions">
            {editingPlanId && <Button size="sm" variant="ghost" onPress={resetBuilder}>Abbrechen</Button>}
            <Button size="sm" isDisabled={busy || !draftName.trim() || draftRules.length === 0} onPress={() => void savePlan()}><Save size={13} /> {editingPlanId ? "Plan aktualisieren" : "Plan speichern"}</Button>
          </div>
        </Card.Content>
      </Card>

      <Card className="freezer-monitor-card">
        <Card.Header>
          <div><Card.Title>Change Monitor</Card.Title><Card.Description>{selectedPlan ? selectedPlan.name : "Plan auswählen"}</Card.Description></div>
          <Button size="sm" variant="secondary" isDisabled={busy || !selectedPlan} onPress={() => void refreshReport()}>{busy ? <RefreshCw className="spin" size={13} /> : <RefreshCw size={13} />} Prüfen</Button>
        </Card.Header>
        <Card.Content>
          {!selectedPlan ? <div className="freezer-monitor-empty"><Gauge size={24} /><strong>Kein Plan ausgewählt</strong><span>Eine Baseline anlegen oder links einen Plan öffnen.</span></div> : <>
            <div className="freezer-monitor-summary">
              <MonitorMetric label="Regeln" value={report?.total_rules ?? selectedPlan.rules.length} icon={Layers3} />
              <MonitorMetric label="Verstöße" value={report?.violation_count ?? 0} icon={AlertTriangle} tone="danger" />
              <MonitorMetric label="Erlaubtes Plus" value={report?.allowed_increase_count ?? 0} icon={TrendingUp} tone="positive" />
              <MonitorMetric label="Beobachtet" value={(report?.monitored_change_count ?? 0) + (report?.unresolved_count ?? 0)} icon={Eye} />
            </div>
            <div className="freezer-monitor-toolbar">
              <div role="group" aria-label="Monitorfilter">
                <Button size="sm" variant={monitorFilter === "all" ? "secondary" : "ghost"} onPress={() => setMonitorFilter("all")}>Alle</Button>
                <Button size="sm" variant={monitorFilter === "violations" ? "secondary" : "ghost"} onPress={() => setMonitorFilter("violations")}>Verstöße</Button>
                <Button size="sm" variant={monitorFilter === "changes" ? "secondary" : "ghost"} onPress={() => setMonitorFilter("changes")}>Änderungen</Button>
              </div>
              {report && <code>{shortHash(report.snapshot_hash)}</code>}
            </div>
            <div className="freezer-observations" role="table" aria-label="Freezer-Beobachtungen">
              <div className="freezer-observation-head" role="row"><span>Ziel / Feld</span><span>Baseline</span><span>Aktuell</span><span>Δ</span><span>Status</span></div>
              {visibleObservations.length === 0 ? <div className="freezer-observation-empty"><CheckCircle2 size={19} /><span>Keine Einträge in diesem Filter</span></div> : visibleObservations.map((item) => <ObservationRow key={`${item.entity_kind}:${item.entity_id}:${item.field}`} snapshot={snapshot} item={item} />)}
            </div>
            <div className="freezer-correction-proof">
              {prepared?.transaction ? <><CheckCircle2 size={15} /><div><strong>{prepared.transaction.operations.length} Korrekturen vollständig validiert</strong><span>Exakte Vorwerte · Backup · Journal · Read-back-fähig</span></div></> : <><FileClock size={15} /><div><strong>{selectedPlan.enabled ? "Korrektur wartet auf Vorschau" : "Plan ist pausiert"}</strong><span>Es wird niemals ohne explizite Bestätigung geschrieben.</span></div></>}
            </div>
            <div className="freezer-monitor-actions">
              <Button variant="secondary" isDisabled={busy || !selectedPlan.enabled || !report || report.violation_count === 0 || report.unresolved_count > 0} onPress={() => void prepareCorrection()}><ShieldCheck size={14} /> Korrektur vorbereiten</Button>
              <Button isDisabled={busy || !prepared?.transaction} onPress={() => void commitCorrection()}><Snowflake size={14} /> Sicher korrigieren</Button>
            </div>
          </>}
        </Card.Content>
      </Card>
    </div>
  </div>;
}

function BuilderSection({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return <section className="freezer-builder-section"><div className="freezer-builder-section-head"><strong>{title}</strong>{count != null && <span>{count}</span>}</div>{children}</section>;
}

function MonitorMetric({ label, value, icon: Icon, tone = "neutral" }: { label: string; value: number; icon: typeof Layers3; tone?: "neutral" | "danger" | "positive" }) {
  return <div className={`freezer-monitor-metric ${tone}`}><Icon size={14} /><span>{label}</span><strong>{value}</strong></div>;
}

function ObservationRow({ snapshot, item }: { snapshot: DatabaseSnapshot; item: FreezeObservation }) {
  return <div className={`freezer-observation ${item.state}`} role="row">
    <span><strong>{ruleEntityLabel(snapshot, item)}</strong><small>{fieldLabel(snapshot, item)} · {policyLabel(item.policy)}</small></span>
    <code>{humanValue(item.baseline)}</code>
    <code>{item.current == null ? "–" : humanValue(item.current)}</code>
    <code className={(item.numeric_delta ?? 0) > 0 ? "positive" : (item.numeric_delta ?? 0) < 0 ? "negative" : ""}>{formatDelta(item.numeric_delta)}</code>
    <span className={`observation-state ${item.state}`}>{stateLabel(item.state)}</span>
  </div>;
}

function ruleEntityLabel(snapshot: DatabaseSnapshot, rule: Pick<FreezeRule, "entity_kind" | "entity_id">) {
  return entitiesFor(snapshot, rule.entity_kind).find((entity) => entity.id === rule.entity_id)?.name ?? rule.entity_id;
}

function fieldLabel(snapshot: DatabaseSnapshot, rule: Pick<FreezeRule, "entity_kind" | "entity_id" | "field">) {
  const entity = entitiesFor(snapshot, rule.entity_kind).find((item) => item.id === rule.entity_id) ?? null;
  return fieldsFor(rule.entity_kind, entity).find((item) => item.path === rule.field)?.label ?? humanize(rule.field.split(".").at(-1) ?? rule.field);
}

function toggleInList(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function ruleKey(rule: Pick<FreezeRule, "entity_kind" | "entity_id" | "field">) {
  return `${rule.entity_kind}:${rule.entity_id}:${rule.field}`;
}

function reportMessage(report: FreezeReport) {
  if (report.unresolved_count > 0) return `${report.unresolved_count} Regeln können nicht sicher aufgelöst werden`;
  if (report.violation_count > 0) return `${report.violation_count} Abweichungen benötigen eine Korrekturvorschau`;
  const changes = report.allowed_increase_count + report.monitored_change_count;
  return changes > 0 ? `${changes} erlaubte oder beobachtete Änderungen · kein Verstoß` : "Alle Freezer-Regeln sind unverändert";
}

function policyLabel(policy: FreezePolicy) {
  return ({ exact: "Exakt", allow_increase: "Plus erlaubt", monitor_only: "Monitor" })[policy];
}

function stateLabel(state: FreezeObservationState) {
  return ({
    unchanged: "Unverändert", allowed_increase: "Erlaubtes Plus", observed_change: "Beobachtet",
    violation: "Verstoß", missing_entity: "Ziel fehlt", missing_field: "Feld fehlt", type_mismatch: "Typfehler",
  })[state];
}

function isUnresolved(state: FreezeObservationState) {
  return state === "missing_entity" || state === "missing_field" || state === "type_mismatch";
}

function formatDelta(delta: number | null) {
  if (delta == null) return "–";
  return delta === 0 ? "0" : `${delta > 0 ? "+" : ""}${Number.isInteger(delta) ? delta : delta.toLocaleString("de-DE", { maximumFractionDigits: 2 })}`;
}

function humanValue(value: unknown) {
  if (value == null) return "–";
  if (typeof value === "number") return value.toLocaleString("de-DE", { maximumFractionDigits: 2 });
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (Array.isArray(value)) return value.join(", ") || "–";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function sourceLabel(source: DatabaseSnapshot["source"]) {
  return ({ synthetic: "Sichere Demo", csv: "CSV-Arbeitskopie", live: "Live-Snapshot", save_game: "Spielstand" })[source];
}

function newId(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("de").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toLocaleUpperCase("de"));
}

function shortHash(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}
