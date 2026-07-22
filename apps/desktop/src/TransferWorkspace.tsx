import { useMemo, useState } from "react";
import { Button, Card, Input, NumberField, TextField } from "@heroui/react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowRight, ArrowRightLeft, BadgeEuro, Ban, Building2, CalendarClock, Check,
  ClipboardCheck, FileClock, Search, ShieldCheck, Users,
} from "lucide-react";

import type {
  AppliedTransaction, Contract, DatabaseSnapshot, FutureTransfer, GameDate, Player,
  PreparedTransferAction, TransferActionRequest, TransferCommand, TransferKind,
} from "./types";

export type TransferGateway = {
  prepare: (snapshot: DatabaseSnapshot, request: TransferActionRequest) => Promise<PreparedTransferAction>;
  apply: (
    journalId: string,
    snapshot: DatabaseSnapshot,
    transaction: PreparedTransferAction["transaction"],
  ) => Promise<AppliedTransaction>;
};

const tauriGateway: TransferGateway = {
  prepare: (snapshot, request) => invoke("prepare_transfer_action", { snapshot, request }),
  apply: (journalId, snapshot, transaction) => invoke("apply_snapshot_transaction", {
    journalId, snapshot, transaction,
  }),
};

type PlanMode = "move_now" | "arrange_future";

export function TransferWorkspace({
  snapshot,
  onSnapshotChange,
  liveWriteEnabled = false,
  gateway = tauriGateway,
}: {
  snapshot: DatabaseSnapshot | null;
  onSnapshotChange: (snapshot: DatabaseSnapshot) => void;
  liveWriteEnabled?: boolean;
  gateway?: TransferGateway;
}) {
  const [playerId, setPlayerId] = useState<string | null>(snapshot?.players[0]?.id ?? null);
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<PlanMode>("arrange_future");
  const [transferKind, setTransferKind] = useState<Exclude<TransferKind, "swap">>("permanent");
  const [effectiveDate, setEffectiveDate] = useState("2026-08-01");
  const [loanEnd, setLoanEnd] = useState("2027-06-30");
  const [contractEnd, setContractEnd] = useState("2030-06-30");
  const [fee, setFee] = useState(0);
  const [wage, setWage] = useState(0);
  const [wageContribution, setWageContribution] = useState(0);
  const [squadStatus, setSquadStatus] = useState("First team");
  const [prepared, setPrepared] = useState<PreparedTransferAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Transferparameter festlegen und sicher prüfen");
  const [error, setError] = useState("");

  const selected = snapshot?.players.find((player) => player.id === playerId) ?? snapshot?.players[0] ?? null;
  const currentClubId = selected?.details?.contract?.club_id ?? null;
  const destination = snapshot?.clubs.find((club) => club.id === destinationId) ?? null;
  const destinationOptions = (snapshot?.clubs ?? []).filter((club) => club.id !== currentClubId);
  const planned = (snapshot?.players ?? []).filter((player) => player.details?.future_transfer);
  const filteredPlayers = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("de");
    return (snapshot?.players ?? []).filter((player) => !needle
      || [player.name, player.club, player.nationality].some((value) => value?.toLocaleLowerCase("de").includes(needle)));
  }, [query, snapshot]);
  const gameDate = snapshot?.game_date ?? fallbackDate();

  function selectPlayer(next: Player) {
    setPlayerId(next.id);
    setDestinationId(null);
    setPrepared(null);
    setError("");
    setWage(next.details?.contract?.wage ?? next.wage ?? 0);
    const plannedKind = next.details?.future_transfer?.kind;
    if (plannedKind && plannedKind !== "swap") setTransferKind(plannedKind);
  }

  function changeMode(next: PlanMode) {
    setMode(next);
    setPrepared(null);
    setError("");
  }

  function changeKind(next: Exclude<TransferKind, "swap">) {
    setTransferKind(next);
    setPrepared(null);
    setError("");
    if (next === "free_transfer") setFee(0);
  }

  async function prepare(commandOverride?: TransferCommand) {
    if (!snapshot || !selected) return;
    if (!commandOverride && !destination) {
      setError("Einen Zielverein auswählen");
      return;
    }
    let command: TransferCommand;
    try {
      command = commandOverride ?? buildCommand();
    } catch (reason) {
      setError(String(reason));
      return;
    }
    setBusy(true);
    setError("");
    setPrepared(null);
    try {
      const result = await gateway.prepare(snapshot, {
        transaction_id: newId("transfer"),
        created_at_utc: new Date().toISOString(),
        command,
      });
      setPrepared(result);
      setMessage(`${result.transaction.operations.length} Änderungen konfliktgeprüft · noch nicht angewendet`);
    } catch (reason) {
      setError(`Vorschau fehlgeschlagen: ${String(reason)}`);
    } finally {
      setBusy(false);
    }
  }

  function buildCommand(): TransferCommand {
    if (!selected || !destination) throw new Error("Spieler und Zielverein auswählen");
    const effective = parseDate(mode === "move_now" ? formatInputDate(gameDate) : effectiveDate, "Transferdatum");
    const contract = buildContract(destination.id, effective);
    if (mode === "move_now") {
      return { kind: "move_now", player_id: selected.id, destination_club_id: destination.id, contract };
    }
    const transfer: FutureTransfer = {
      id: newId(`future-${selected.id}`),
      kind: transferKind,
      from_club_id: currentClubId,
      to_club_id: destination.id,
      arranged_on: gameDate,
      effective_on: effective,
      fee: transferKind === "free_transfer" ? 0 : fee,
      loan_end: transferKind === "loan" ? parseDate(loanEnd, "Leihende") : null,
      wage_contribution_percent: transferKind === "loan" ? wageContribution : null,
      swap_player_id: null,
      status: "agreed",
    };
    return { kind: "arrange_future", player_id: selected.id, transfer };
  }

  function buildContract(clubId: string, startsOn: GameDate, kind: TransferKind = transferKind): Contract {
    return {
      club_id: clubId,
      starts_on: startsOn,
      expires_on: parseDate(contractEnd, "Vertragsende"),
      contract_type: kind === "loan" ? "loan" : "full_time",
      wage,
      release_clause: null,
      squad_status: squadStatus.trim() || null,
    };
  }

  async function commit() {
    if (!snapshot || !prepared) return;
    setBusy(true);
    setError("");
    try {
      const result = await gateway.apply(`transfers-${snapshot.source}-workspace-v1`, snapshot, prepared.transaction);
      onSnapshotChange(result.snapshot);
      setPrepared(null);
      setMessage(`${result.journal_entry.changes.length} Transferänderungen mit Backup und Journal übernommen`);
    } catch (reason) {
      setError(`Übernahme fehlgeschlagen: ${String(reason)}`);
    } finally {
      setBusy(false);
    }
  }

  function cancelFuture() {
    if (selected) void prepare({ kind: "cancel_future", player_id: selected.id });
  }

  function completeFuture() {
    const transfer = selected?.details?.future_transfer;
    if (!selected || !transfer) return;
    try {
      const contract = buildContract(transfer.to_club_id, transfer.effective_on, transfer.kind);
      void prepare({ kind: "complete_future", player_id: selected.id, contract });
    } catch (reason) {
      setError(String(reason));
    }
  }

  if (!snapshot) {
    return <Card className="transfer-empty"><Card.Content><ArrowRightLeft size={30} /><strong>Kein Snapshot geladen</strong><span>Das Transfer Center benötigt kanonische Spieler- und Vereinsdaten.</span></Card.Content></Card>;
  }

  return <div className="transfer-workspace">
    <Card className="transfer-hero">
      <Card.Header>
        <div className="transfer-heading"><span><ArrowRightLeft size={21} /></span><div><span className="eyebrow">SOFORTWECHSEL · ZUKUNFT · LEIHE · VERTRAG</span><Card.Title>Transfer Center</Card.Title><Card.Description>Vereinswechsel planen, validieren und atomar journalisieren.</Card.Description></div></div>
        <div className="transfer-safety"><ShieldCheck size={18} /><div><strong>{liveWriteEnabled ? "Live-Profil bereit" : "Sichere Arbeitskopie"}</strong><span>Exakte Vorschau · Backup · Undo</span></div></div>
      </Card.Header>
      <Card.Content><span>SPIELTAG {formatGameDate(gameDate)}</span><span className={error ? "error" : ""}>{error || message}</span></Card.Content>
    </Card>

    <section className="transfer-metrics" aria-label="Transferübersicht">
      <TransferMetric icon={Users} label="Spieler" value={snapshot.players.length} />
      <TransferMetric icon={Building2} label="Vereine" value={snapshot.clubs.length} />
      <TransferMetric icon={FileClock} label="Geplant" value={planned.length} />
      <TransferMetric icon={BadgeEuro} label="Gebühren geplant" value={planned.reduce((sum, player) => sum + (player.details?.future_transfer?.fee ?? 0), 0)} money />
    </section>

    <div className="transfer-layout">
      <Card className="transfer-player-card">
        <Card.Header><div><Card.Title>Spieler auswählen</Card.Title><Card.Description>{filteredPlayers.length} Datensätze</Card.Description></div><Users size={17} /></Card.Header>
        <Card.Content>
          <TextField aria-label="Transfer-Spieler durchsuchen" value={query} onChange={setQuery}><Search className="search-icon" size={14} /><Input placeholder="Name, Verein oder Nation …" /></TextField>
          <div className="transfer-player-list">
            {filteredPlayers.map((player) => <Button key={player.id} variant={selected?.id === player.id ? "primary" : "ghost"} onPress={() => selectPlayer(player)} aria-label={`Transfer-Spieler ${player.name}`}><span className="transfer-avatar">{initials(player.name)}</span><span><strong>{player.name}</strong><small>{player.club ?? "Vereinslos"} · {player.positions.join(" · ")}</small></span>{player.details?.future_transfer && <FileClock size={13} />}</Button>)}
          </div>
        </Card.Content>
      </Card>

      <Card className="transfer-planner-card">
        <Card.Header><div><Card.Title>Route & Konditionen</Card.Title><Card.Description>{selected?.name ?? "Kein Spieler"}</Card.Description></div><ArrowRight size={17} /></Card.Header>
        <Card.Content>
          <div className="transfer-route">
            <div><span>VON</span><strong>{selected?.club ?? "Vereinslos"}</strong><small>{currentClubId ?? "Ohne Vertragsverein-ID"}</small></div><ArrowRight size={18} /><div><span>NACH</span><strong>{destination?.name ?? "Zielverein wählen"}</strong><small>{destination?.id ?? "–"}</small></div>
          </div>
          <div className="transfer-mode-tabs" role="group" aria-label="Transferzeitpunkt"><Button variant={mode === "arrange_future" ? "primary" : "secondary"} onPress={() => changeMode("arrange_future")}><CalendarClock size={14} /> Zukunft planen</Button><Button variant={mode === "move_now" ? "primary" : "secondary"} onPress={() => changeMode("move_now")}><ArrowRightLeft size={14} /> Sofort wechseln</Button></div>
          <section className="transfer-section"><header><strong>Zielverein</strong><span>{destinationOptions.length}</span></header><div className="transfer-club-list">{destinationOptions.map((club) => <Button key={club.id} variant={destinationId === club.id ? "primary" : "secondary"} aria-label={`Transferziel ${club.name}`} onPress={() => { setDestinationId(club.id); setPrepared(null); }}><Building2 size={13} /><span><strong>{club.name}</strong><small>{club.competition ?? club.nation ?? "–"}</small></span>{destinationId === club.id && <Check size={12} />}</Button>)}</div></section>
          <section className="transfer-section"><header><strong>Transferart</strong></header><div className="transfer-kind-tabs">{(["permanent", "loan", "free_transfer"] as const).map((kind) => <Button key={kind} size="sm" variant={transferKind === kind ? "primary" : "ghost"} onPress={() => changeKind(kind)}>{kindLabel(kind)}</Button>)}</div></section>
          <div className="transfer-form-grid">
            {mode === "arrange_future" && <label><span>Transferdatum</span><input aria-label="Transferdatum" type="date" value={effectiveDate} onChange={(event) => { setEffectiveDate(event.target.value); setPrepared(null); }} /></label>}
            {transferKind !== "free_transfer" && <NumberInput label="Gebühr" value={fee} onChange={(value) => { setFee(value); setPrepared(null); }} maximum={1_000_000_000_000} />}
            <NumberInput label="Wochengehalt" value={wage} onChange={(value) => { setWage(value); setPrepared(null); }} maximum={100_000_000} />
            <label><span>Vertragsende</span><input aria-label="Vertragsende" type="date" value={contractEnd} onChange={(event) => { setContractEnd(event.target.value); setPrepared(null); }} /></label>
            {transferKind === "loan" && <><label><span>Leihende</span><input aria-label="Leihende" type="date" value={loanEnd} onChange={(event) => { setLoanEnd(event.target.value); setPrepared(null); }} /></label><NumberInput label="Gehaltsanteil Prozent" value={wageContribution} onChange={(value) => { setWageContribution(value); setPrepared(null); }} maximum={100} /></>}
            <TextField aria-label="Kaderstatus" value={squadStatus} onChange={(value) => { setSquadStatus(value); setPrepared(null); }}><span className="transfer-input-label">Kaderstatus</span><Input /></TextField>
          </div>
          <Button className="w-full" isDisabled={busy || !selected || !destination} onPress={() => prepare()}><ShieldCheck size={15} /> {busy ? "Validiere …" : "Transfervorschau erstellen"}</Button>
        </Card.Content>
      </Card>

      <Card className="transfer-status-card">
        <Card.Header><div><Card.Title>Vereinbarung & Commit</Card.Title><Card.Description>{planned.length} aktive Zukunftstransfers</Card.Description></div><ClipboardCheck size={17} /></Card.Header>
        <Card.Content>
          {selected?.details?.future_transfer ? <FutureTransferCard transfer={selected.details.future_transfer} snapshot={snapshot} /> : <div className="transfer-no-plan"><FileClock size={24} /><strong>Kein Zukunftstransfer</strong><span>Für {selected?.name ?? "diesen Spieler"} ist keine Vereinbarung hinterlegt.</span></div>}
          {selected?.details?.future_transfer && <div className="transfer-existing-actions"><Button variant="secondary" className="danger" onPress={cancelFuture} isDisabled={busy}><Ban size={14} /> Vereinbarung stornieren</Button><Button onPress={completeFuture} isDisabled={busy || !isDue(selected.details.future_transfer, gameDate)}><ArrowRightLeft size={14} /> Transfer abschließen</Button></div>}
          <div className="transfer-safety-proof"><ShieldCheck size={15} /><div><strong>Keine direkte Mutation</strong><span>Jede Route nutzt denselben validierten Editor-Kern.</span></div></div>
          {prepared ? <div className="transfer-preview"><div><Check size={15} /><span><strong>Vorschau konfliktfrei</strong><small>{prepared.transaction.operations.length} exakte Feldänderungen</small></span></div><div className="transfer-change-list">{prepared.transaction.operations.map((operation) => <p key={`${operation.entity_id}-${operation.field}`}><code>{operation.field}</code><ArrowRight size={10} /><span>{compact(operation.after)}</span></p>)}</div><code>{prepared.transaction.id}</code><Button className="w-full" onPress={commit} isDisabled={busy}><ClipboardCheck size={15} /> Mit Backup & Journal anwenden</Button></div> : <div className="transfer-preview-empty"><span>Nach der Vorschau erscheint hier der exakte Änderungssatz.</span></div>}
        </Card.Content>
      </Card>
    </div>
  </div>;
}

function NumberInput({ label, value, onChange, maximum }: { label: string; value: number; onChange: (value: number) => void; maximum: number }) {
  return <label><span>{label}</span><NumberField aria-label={label} value={value} minValue={0} maxValue={maximum} onChange={onChange}><NumberField.Group><NumberField.Input /><NumberField.DecrementButton aria-label={`${label} verringern`}>−</NumberField.DecrementButton><NumberField.IncrementButton aria-label={`${label} erhöhen`}>+</NumberField.IncrementButton></NumberField.Group></NumberField></label>;
}

function FutureTransferCard({ transfer, snapshot }: { transfer: FutureTransfer; snapshot: DatabaseSnapshot }) {
  const destination = snapshot.clubs.find((club) => club.id === transfer.to_club_id);
  return <div className="future-transfer-card"><header><CalendarClock size={16} /><div><strong>{kindLabel(transfer.kind)}</strong><span>{transfer.status}</span></div></header><div><span>Ziel</span><strong>{destination?.name ?? transfer.to_club_id}</strong></div><div><span>Datum</span><strong>{formatGameDate(transfer.effective_on)}</strong></div><div><span>Gebühr</span><strong>{formatMoney(transfer.fee)}</strong></div>{transfer.loan_end && <div><span>Leihende</span><strong>{formatGameDate(transfer.loan_end)}</strong></div>}<code>{transfer.id}</code></div>;
}

function TransferMetric({ icon: Icon, label, value, money = false }: { icon: typeof Users; label: string; value: number; money?: boolean }) {
  return <Card><Card.Content><Icon size={16} /><div><span>{label}</span><strong>{money ? formatMoney(value) : value.toLocaleString("de-DE")}</strong></div></Card.Content></Card>;
}

function parseDate(value: string, label: string): GameDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`${label} ist ungültig`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}
function fallbackDate(): GameDate { const value = new Date(); return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() }; }
function formatInputDate(date: GameDate) { return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`; }
function formatGameDate(date: GameDate) { return `${String(date.day).padStart(2, "0")}.${String(date.month).padStart(2, "0")}.${date.year}`; }
function formatMoney(value: number | null) { return value == null ? "–" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 }).format(value); }
function initials(name: string) { return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toLocaleUpperCase("de"); }
function newId(prefix: string) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function kindLabel(kind: TransferKind) { return { permanent: "Festtransfer", loan: "Leihe", free_transfer: "Ablösefrei", swap: "Tausch" }[kind]; }
function compact(value: unknown) { const text = JSON.stringify(value); return text.length > 70 ? `${text.slice(0, 67)}…` : text; }
function isDue(transfer: FutureTransfer, date: GameDate) { return date.year * 10_000 + date.month * 100 + date.day >= transfer.effective_on.year * 10_000 + transfer.effective_on.month * 100 + transfer.effective_on.day; }
