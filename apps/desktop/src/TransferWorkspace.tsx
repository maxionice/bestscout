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
type ContractTermsDraft = {
  signingOnFee: number;
  appearanceFee: number;
  goalBonus: number;
  minimumFeeRelease: number;
  sellOnProfitPercentage: number;
  yearlyWageRisePercentage: number;
};

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
  const initialPlayer = snapshot?.players[0] ?? null;
  const initialTransfer = initialPlayer?.details?.future_transfer;
  const initialSwapPlayer = initialTransfer?.kind === "swap"
    ? snapshot?.players.find((player) => player.id === initialTransfer.swap_player_id)
    : null;
  const [playerId, setPlayerId] = useState<string | null>(initialPlayer?.id ?? null);
  const [destinationId, setDestinationId] = useState<string | null>(initialTransfer?.to_club_id ?? null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<PlanMode>("arrange_future");
  const [transferKind, setTransferKind] = useState<TransferKind>(initialTransfer?.kind ?? "permanent");
  const [swapPlayerId, setSwapPlayerId] = useState<string | null>(initialSwapPlayer?.id ?? null);
  const [effectiveDate, setEffectiveDate] = useState("2026-08-01");
  const [loanEnd, setLoanEnd] = useState("2027-06-30");
  const [contractEnd, setContractEnd] = useState("2030-06-30");
  const [fee, setFee] = useState(0);
  const [wage, setWage] = useState(initialPlayer?.details?.contract?.wage ?? initialPlayer?.wage ?? 0);
  const [wageContribution, setWageContribution] = useState(0);
  const [squadStatus, setSquadStatus] = useState("First team");
  const [contractTerms, setContractTerms] = useState<ContractTermsDraft>(() => termsDraft());
  const [swapWage, setSwapWage] = useState(initialSwapPlayer?.details?.contract?.wage ?? initialSwapPlayer?.wage ?? 0);
  const [swapContractEnd, setSwapContractEnd] = useState("2030-06-30");
  const [swapSquadStatus, setSwapSquadStatus] = useState("First team");
  const [swapContractTerms, setSwapContractTerms] = useState<ContractTermsDraft>(() => termsDraft());
  const [prepared, setPrepared] = useState<PreparedTransferAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Transferparameter festlegen und sicher prüfen");
  const [error, setError] = useState("");

  const selected = snapshot?.players.find((player) => player.id === playerId) ?? snapshot?.players[0] ?? null;
  const currentClubId = selected?.details?.contract?.club_id ?? null;
  const destination = snapshot?.clubs.find((club) => club.id === destinationId) ?? null;
  const destinationOptions = (snapshot?.clubs ?? []).filter((club) => club.id !== currentClubId);
  const swapPlayer = snapshot?.players.find((player) => player.id === swapPlayerId) ?? null;
  const swapCandidates = (snapshot?.players ?? []).filter((player) =>
    player.id !== selected?.id
    && player.details?.contract?.club_id === destinationId,
  );
  const planned = (snapshot?.players ?? []).filter((player) => player.details?.future_transfer);
  const filteredPlayers = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("de");
    return (snapshot?.players ?? []).filter((player) => !needle
      || [player.name, player.club, player.nationality].some((value) => value?.toLocaleLowerCase("de").includes(needle)));
  }, [query, snapshot]);
  const gameDate = snapshot?.game_date ?? fallbackDate();

  function selectPlayer(next: Player) {
    const futureTransfer = next.details?.future_transfer;
    const futureSwapPlayer = futureTransfer?.kind === "swap"
      ? snapshot?.players.find((player) => player.id === futureTransfer.swap_player_id)
      : null;
    setPlayerId(next.id);
    setDestinationId(futureTransfer?.to_club_id ?? null);
    setSwapPlayerId(futureSwapPlayer?.id ?? null);
    setPrepared(null);
    setError("");
    setWage(next.details?.contract?.wage ?? next.wage ?? 0);
    setContractTerms(termsDraft());
    setSwapWage(futureSwapPlayer?.details?.contract?.wage ?? futureSwapPlayer?.wage ?? 0);
    setSwapContractTerms(termsDraft());
    const plannedKind = futureTransfer?.kind;
    if (plannedKind) setTransferKind(plannedKind);
  }

  function changeMode(next: PlanMode) {
    setMode(next);
    setPrepared(null);
    setError("");
  }

  function changeKind(next: TransferKind) {
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
    if (transferKind === "swap") {
      if (!currentClubId) throw new Error("Der gewählte Spieler benötigt einen aktuellen Vertragsverein");
      if (!swapPlayer || swapPlayer.details?.contract?.club_id !== destination.id) {
        throw new Error("Einen Tauschpartner mit Vertrag beim Zielverein auswählen");
      }
      const swapPlayerContract = buildSwapPlayerContract(currentClubId, effective);
      if (mode === "move_now") {
        return {
          kind: "swap_now",
          player_id: selected.id,
          swap_player_id: swapPlayer.id,
          player_contract: contract,
          swap_player_contract: swapPlayerContract,
        };
      }
      const transfer: FutureTransfer = {
        id: newId(`future-swap-${selected.id}`),
        kind: "swap",
        from_club_id: currentClubId,
        to_club_id: destination.id,
        arranged_on: gameDate,
        effective_on: effective,
        fee,
        loan_end: null,
        wage_contribution_percent: null,
        swap_player_id: swapPlayer.id,
        status: "agreed",
      };
      const reciprocalTransfer: FutureTransfer = {
        id: newId(`future-swap-${swapPlayer.id}`),
        kind: "swap",
        from_club_id: destination.id,
        to_club_id: currentClubId,
        arranged_on: gameDate,
        effective_on: effective,
        fee: 0,
        loan_end: null,
        wage_contribution_percent: null,
        swap_player_id: selected.id,
        status: "agreed",
      };
      return {
        kind: "arrange_future_swap",
        player_id: selected.id,
        swap_player_id: swapPlayer.id,
        transfer,
        reciprocal_transfer: reciprocalTransfer,
      };
    }
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
    const terms = structuredTerms(selected?.id ?? "player", contractTerms);
    return {
      club_id: clubId,
      starts_on: startsOn,
      expires_on: parseDate(contractEnd, "Vertragsende"),
      contract_type: kind === "loan" ? "loan" : "full_time",
      wage,
      release_clause: contractTerms.minimumFeeRelease || null,
      squad_status: squadStatus.trim() || null,
      ...terms,
    };
  }

  function buildSwapPlayerContract(clubId: string, startsOn: GameDate): Contract {
    const terms = structuredTerms(swapPlayer?.id ?? "swap-player", swapContractTerms);
    return {
      club_id: clubId,
      starts_on: startsOn,
      expires_on: parseDate(swapContractEnd, "Partner-Vertragsende"),
      contract_type: "full_time",
      wage: swapWage,
      release_clause: swapContractTerms.minimumFeeRelease || null,
      squad_status: swapSquadStatus.trim() || null,
      ...terms,
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
      if (transfer.kind === "swap") {
        const partner = snapshot?.players.find((player) => player.id === transfer.swap_player_id);
        const originClubId = selected.details?.contract?.club_id;
        if (!partner || !originClubId) throw new Error("Die reziproke Tauschvereinbarung ist unvollständig");
        void prepare({
          kind: "complete_future_swap",
          player_id: selected.id,
          swap_player_id: partner.id,
          player_contract: buildContract(transfer.to_club_id, transfer.effective_on, "swap"),
          swap_player_contract: buildSwapPlayerContract(originClubId, transfer.effective_on),
        });
        return;
      }
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
          <section className="transfer-section"><header><strong>Zielverein</strong><span>{destinationOptions.length}</span></header><div className="transfer-club-list">{destinationOptions.map((club) => <Button key={club.id} variant={destinationId === club.id ? "primary" : "secondary"} aria-label={`Transferziel ${club.name}`} onPress={() => { setDestinationId(club.id); setSwapPlayerId(null); setPrepared(null); }}><Building2 size={13} /><span><strong>{club.name}</strong><small>{club.competition ?? club.nation ?? "–"}</small></span>{destinationId === club.id && <Check size={12} />}</Button>)}</div></section>
          <section className="transfer-section"><header><strong>Transferart</strong></header><div className="transfer-kind-tabs">{(["permanent", "loan", "free_transfer", "swap"] as const).map((kind) => <Button key={kind} size="sm" variant={transferKind === kind ? "primary" : "ghost"} onPress={() => changeKind(kind)}>{kindLabel(kind)}</Button>)}</div></section>
          {transferKind === "swap" && <section className="transfer-section transfer-swap-section"><header><strong>Tauschpartner beim Zielverein</strong><span>{swapCandidates.length}</span></header><div className="transfer-swap-list">{swapCandidates.length ? swapCandidates.map((player) => <Button key={player.id} variant={swapPlayerId === player.id ? "primary" : "secondary"} aria-label={`Tauschpartner ${player.name}`} onPress={() => { setSwapPlayerId(player.id); setSwapWage(player.details?.contract?.wage ?? player.wage ?? 0); setSwapContractTerms(termsDraft()); setPrepared(null); }}><span className="transfer-avatar">{initials(player.name)}</span><span><strong>{player.name}</strong><small>{player.positions.join(" · ")} · {formatMoney(player.value)}</small></span>{swapPlayerId === player.id && <Check size={12} />}</Button>) : <p>Für dieses Ziel ist kein Spieler mit kanonischem Vereinsvertrag geladen.</p>}</div></section>}
          <div className="transfer-form-grid">
            {mode === "arrange_future" && <label><span>Transferdatum</span><input aria-label="Transferdatum" type="date" value={effectiveDate} onChange={(event) => { setEffectiveDate(event.target.value); setPrepared(null); }} /></label>}
            {transferKind !== "free_transfer" && <NumberInput label="Gebühr" value={fee} onChange={(value) => { setFee(value); setPrepared(null); }} maximum={1_000_000_000_000} />}
            <NumberInput label="Wochengehalt" value={wage} onChange={(value) => { setWage(value); setPrepared(null); }} maximum={100_000_000} />
            <label><span>Vertragsende</span><input aria-label="Vertragsende" type="date" value={contractEnd} onChange={(event) => { setContractEnd(event.target.value); setPrepared(null); }} /></label>
            {transferKind === "loan" && <><label><span>Leihende</span><input aria-label="Leihende" type="date" value={loanEnd} onChange={(event) => { setLoanEnd(event.target.value); setPrepared(null); }} /></label><NumberInput label="Gehaltsanteil Prozent" value={wageContribution} onChange={(value) => { setWageContribution(value); setPrepared(null); }} maximum={100} /></>}
            <TextField aria-label="Kaderstatus" value={squadStatus} onChange={(value) => { setSquadStatus(value); setPrepared(null); }}><span className="transfer-input-label">Kaderstatus</span><Input /></TextField>
            {transferKind === "swap" && <><NumberInput label="Partner-Wochengehalt" value={swapWage} onChange={(value) => { setSwapWage(value); setPrepared(null); }} maximum={100_000_000} /><label><span>Partner-Vertragsende</span><input aria-label="Partner-Vertragsende" type="date" value={swapContractEnd} onChange={(event) => { setSwapContractEnd(event.target.value); setPrepared(null); }} /></label><TextField aria-label="Partner-Kaderstatus" value={swapSquadStatus} onChange={(value) => { setSwapSquadStatus(value); setPrepared(null); }}><span className="transfer-input-label">Partner-Kaderstatus</span><Input /></TextField></>}
          </div>
          <ContractTermsFields title="Vertragsboni & Klauseln" draft={contractTerms} onChange={(value) => { setContractTerms(value); setPrepared(null); }} />
          {transferKind === "swap" && <ContractTermsFields title="Partner-Boni & Klauseln" prefix="Partner-" draft={swapContractTerms} onChange={(value) => { setSwapContractTerms(value); setPrepared(null); }} />}
          <Button className="w-full" isDisabled={busy || !selected || !destination || (transferKind === "swap" && !swapPlayer)} onPress={() => prepare()}><ShieldCheck size={15} /> {busy ? "Validiere …" : "Transfervorschau erstellen"}</Button>
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

function ContractTermsFields({ title, prefix = "", draft, onChange }: { title: string; prefix?: string; draft: ContractTermsDraft; onChange: (value: ContractTermsDraft) => void }) {
  const update = (field: keyof ContractTermsDraft, value: number) => onChange({ ...draft, [field]: value });
  return <section className="transfer-section"><header><strong>{title}</strong></header><div className="transfer-form-grid">
    <NumberInput label={`${prefix}Handgeld`} value={draft.signingOnFee} onChange={(value) => update("signingOnFee", value)} maximum={1_000_000_000_000} />
    <NumberInput label={`${prefix}Einsatzprämie`} value={draft.appearanceFee} onChange={(value) => update("appearanceFee", value)} maximum={1_000_000_000_000} />
    <NumberInput label={`${prefix}Torprämie`} value={draft.goalBonus} onChange={(value) => update("goalBonus", value)} maximum={1_000_000_000_000} />
    <NumberInput label={`${prefix}Mindestablöse`} value={draft.minimumFeeRelease} onChange={(value) => update("minimumFeeRelease", value)} maximum={1_000_000_000_000} />
    <NumberInput label={`${prefix}Weiterverkaufsanteil Prozent`} value={draft.sellOnProfitPercentage} onChange={(value) => update("sellOnProfitPercentage", value)} maximum={100} />
    <NumberInput label={`${prefix}Jährliche Gehaltssteigerung Prozent`} value={draft.yearlyWageRisePercentage} onChange={(value) => update("yearlyWageRisePercentage", value)} maximum={100} />
  </div></section>;
}

function FutureTransferCard({ transfer, snapshot }: { transfer: FutureTransfer; snapshot: DatabaseSnapshot }) {
  const destination = snapshot.clubs.find((club) => club.id === transfer.to_club_id);
  const swapPlayer = snapshot.players.find((player) => player.id === transfer.swap_player_id);
  return <div className="future-transfer-card"><header><CalendarClock size={16} /><div><strong>{kindLabel(transfer.kind)}</strong><span>{transfer.status}</span></div></header><div><span>Ziel</span><strong>{destination?.name ?? transfer.to_club_id}</strong></div><div><span>Datum</span><strong>{formatGameDate(transfer.effective_on)}</strong></div><div><span>Gebühr</span><strong>{formatMoney(transfer.fee)}</strong></div>{transfer.loan_end && <div><span>Leihende</span><strong>{formatGameDate(transfer.loan_end)}</strong></div>}{transfer.kind === "swap" && <div><span>Tauschpartner</span><strong>{swapPlayer?.name ?? transfer.swap_player_id}</strong></div>}<code>{transfer.id}</code></div>;
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
function termsDraft(): ContractTermsDraft {
  return {
    signingOnFee: 0,
    appearanceFee: 0,
    goalBonus: 0,
    minimumFeeRelease: 0,
    sellOnProfitPercentage: 0,
    yearlyWageRisePercentage: 0,
  };
}
function structuredTerms(personId: string, draft: ContractTermsDraft): Pick<Contract, "bonuses" | "clauses"> {
  const id = (kind: string) => `contract-${kind}-${personId}`.slice(0, 128);
  const bonuses: NonNullable<Contract["bonuses"]> = [
    ["signing_on_fee", draft.signingOnFee],
    ["appearance_fee", draft.appearanceFee],
    ["goal_bonus", draft.goalBonus],
  ].filter((entry) => Number(entry[1]) > 0).map(([kind, amount]) => ({
    id: id(String(kind)),
    kind: kind as NonNullable<Contract["bonuses"]>[number]["kind"],
    amount: Number(amount),
  }));
  const clauses: NonNullable<Contract["clauses"]> = [];
  if (draft.minimumFeeRelease > 0) clauses.push({ id: id("minimum_fee_release"), kind: "minimum_fee_release", value: { kind: "money", value: draft.minimumFeeRelease } });
  if (draft.sellOnProfitPercentage > 0) clauses.push({ id: id("sell_on_profit_percentage"), kind: "sell_on_profit_percentage", value: { kind: "percentage", value: draft.sellOnProfitPercentage } });
  if (draft.yearlyWageRisePercentage > 0) clauses.push({ id: id("yearly_wage_rise_percentage"), kind: "yearly_wage_rise_percentage", value: { kind: "percentage", value: draft.yearlyWageRisePercentage } });
  return { bonuses, clauses };
}
function newId(prefix: string) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function kindLabel(kind: TransferKind) { return { permanent: "Festtransfer", loan: "Leihe", free_transfer: "Ablösefrei", swap: "Tausch" }[kind]; }
function compact(value: unknown) { const text = JSON.stringify(value); return text.length > 70 ? `${text.slice(0, 67)}…` : text; }
function isDue(transfer: FutureTransfer, date: GameDate) { return date.year * 10_000 + date.month * 100 + date.day >= transfer.effective_on.year * 10_000 + transfer.effective_on.month * 100 + transfer.effective_on.day; }
