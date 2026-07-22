import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Card, Input, NumberField, TextField } from "@heroui/react";
import { invoke } from "@tauri-apps/api/core";
import {
  BadgeEuro, Building2, Check, ClipboardCheck, Landmark, Link2, Palette, Search,
  ShieldCheck, Shirt, Sparkles, Trash2, Users,
} from "lucide-react";

import type {
  AppliedTransaction, Club, ClubActionRequest, ClubCommand, ClubKit, ClubKitKind,
  ClubRelationshipKind, DatabaseSnapshot, PreparedClubAction,
} from "./types";

export type ClubGateway = {
  prepare: (snapshot: DatabaseSnapshot, request: ClubActionRequest) => Promise<PreparedClubAction>;
  apply: (
    journalId: string,
    snapshot: DatabaseSnapshot,
    transaction: PreparedClubAction["transaction"],
  ) => Promise<AppliedTransaction>;
};

export type ClubIdentityProvider = {
  createId: () => string;
  now: () => Date;
};

const tauriGateway: ClubGateway = {
  prepare: (snapshot, request) => invoke("prepare_club_action", { snapshot, request }),
  apply: (journalId, snapshot, transaction) => invoke("apply_snapshot_transaction", {
    journalId, snapshot, transaction,
  }),
};

const defaultIdentity: ClubIdentityProvider = {
  createId: () => `club-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  now: () => new Date(),
};

type Mode = "identity" | "stadium" | "finances" | "facilities" | "branding" | "relationships";
type EditableKitField = "shirt_colour" | "shorts_colour" | "socks_colour" | "trim_colour" | "pattern";
const modes: Mode[] = ["identity", "stadium", "finances", "facilities", "branding", "relationships"];
const professionalStatuses = ["professional", "semi_professional", "amateur"] as const;
const kitKinds: ClubKitKind[] = ["home", "away", "third", "goalkeeper"];
const relationshipKinds: ClubRelationshipKind[] = ["rival", "affiliate", "parent", "feeder", "friendly"];

export function ClubWorkspace({
  snapshot,
  onSnapshotChange,
  liveWriteEnabled = false,
  gateway = tauriGateway,
  identity = defaultIdentity,
}: {
  snapshot: DatabaseSnapshot | null;
  onSnapshotChange: (snapshot: DatabaseSnapshot) => void;
  liveWriteEnabled?: boolean;
  gateway?: ClubGateway;
  identity?: ClubIdentityProvider;
}) {
  const firstClub = snapshot?.clubs[0] ?? null;
  const [mode, setMode] = useState<Mode>("identity");
  const [query, setQuery] = useState("");
  const [clubId, setClubId] = useState(firstClub?.id ?? "");
  const [name, setName] = useState(firstClub?.name ?? "");
  const [shortName, setShortName] = useState(firstClub?.short_name ?? "");
  const [nation, setNation] = useState(firstClub?.nation ?? "");
  const [competitionId, setCompetitionId] = useState(inferCompetitionId(firstClub, snapshot));
  const [reputation, setReputation] = useState(firstClub?.reputation ?? 0);
  const [professionalStatus, setProfessionalStatus] = useState(firstClub?.professional_status ?? "professional");
  const [stadiumName, setStadiumName] = useState(firstClub?.stadium ?? "");
  const [stadiumCapacity, setStadiumCapacity] = useState(firstClub?.stadium_capacity ?? 1);
  const [averageAttendance, setAverageAttendance] = useState(firstClub?.average_attendance ?? 0);
  const [balance, setBalance] = useState(firstClub?.finances?.balance ?? 0);
  const [transferBudget, setTransferBudget] = useState(firstClub?.finances?.transfer_budget ?? 0);
  const [wageBudget, setWageBudget] = useState(firstClub?.finances?.wage_budget ?? 0);
  const [debt, setDebt] = useState(firstClub?.finances?.debt ?? 0);
  const [training, setTraining] = useState(firstClub?.facilities?.training ?? 1);
  const [youth, setYouth] = useState(firstClub?.facilities?.youth ?? 1);
  const [youthRecruitment, setYouthRecruitment] = useState(firstClub?.facilities?.youth_recruitment ?? 1);
  const [juniorCoaching, setJuniorCoaching] = useState(firstClub?.facilities?.junior_coaching ?? 1);
  const [primaryColour, setPrimaryColour] = useState(firstClub?.branding?.primary_colour ?? "");
  const [secondaryColour, setSecondaryColour] = useState(firstClub?.branding?.secondary_colour ?? "");
  const [kits, setKits] = useState<ClubKit[]>(firstClub?.branding?.kits ?? []);
  const [relationshipTargetId, setRelationshipTargetId] = useState(
    snapshot?.clubs.find((club) => club.id !== firstClub?.id)?.id ?? "",
  );
  const [relationshipKind, setRelationshipKind] = useState<ClubRelationshipKind>("rival");
  const [relationshipStrength, setRelationshipStrength] = useState(50);
  const [prepared, setPrepared] = useState<PreparedClubAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Vereinsdaten sicher in der kanonischen Arbeitskopie bearbeiten");
  const [error, setError] = useState("");
  const draftRevision = useRef(0);
  const prepareSequence = useRef(0);

  const selectedClub = snapshot?.clubs.find((club) => club.id === clubId) ?? snapshot?.clubs[0] ?? null;
  const normalizedQuery = query.trim().toLocaleLowerCase("de");
  const filteredClubs = useMemo(() => (snapshot?.clubs ?? []).filter((club) => {
    const values = [club.name, club.short_name, club.nation, club.competition];
    return !normalizedQuery || values.some((value) => value?.toLocaleLowerCase("de").includes(normalizedQuery));
  }), [normalizedQuery, snapshot]);

  useEffect(() => {
    if (!snapshot) return;
    const club = snapshot.clubs.find((item) => item.id === clubId) ?? snapshot.clubs[0] ?? null;
    if (club) {
      setClubId(club.id);
      synchronizeDraft(club, snapshot);
    }
    clearPreview();
  }, [snapshot]);

  function synchronizeDraft(club: Club, source: DatabaseSnapshot) {
    setName(club.name);
    setShortName(club.short_name ?? "");
    setNation(club.nation ?? "");
    setCompetitionId(inferCompetitionId(club, source));
    setReputation(club.reputation ?? 0);
    setProfessionalStatus(club.professional_status ?? "professional");
    setStadiumName(club.stadium ?? "");
    setStadiumCapacity(club.stadium_capacity ?? 1);
    setAverageAttendance(club.average_attendance ?? 0);
    setBalance(club.finances?.balance ?? 0);
    setTransferBudget(club.finances?.transfer_budget ?? 0);
    setWageBudget(club.finances?.wage_budget ?? 0);
    setDebt(club.finances?.debt ?? 0);
    setTraining(club.facilities?.training ?? 1);
    setYouth(club.facilities?.youth ?? 1);
    setYouthRecruitment(club.facilities?.youth_recruitment ?? 1);
    setJuniorCoaching(club.facilities?.junior_coaching ?? 1);
    setPrimaryColour(club.branding?.primary_colour ?? "");
    setSecondaryColour(club.branding?.secondary_colour ?? "");
    setKits(club.branding?.kits ?? []);
    setRelationshipTargetId(source.clubs.find((item) => item.id !== club.id)?.id ?? "");
  }

  function selectClub(club: Club) {
    setClubId(club.id);
    if (snapshot) synchronizeDraft(club, snapshot);
    clearPreview();
  }

  function clearPreview() {
    draftRevision.current += 1;
    if (prepared) setMessage("Formular geändert – vorherige Vorschau verworfen");
    setPrepared(null);
    setError("");
  }

  function updateDraft<T>(setter: (value: T) => void, value: T) {
    setter(value);
    clearPreview();
  }

  function addKit(kind: ClubKitKind) {
    if (kits.some((kit) => kit.kind === kind) || !selectedClub) return;
    const fallback = "#000000";
    updateDraft(setKits, [...kits, {
      id: `${selectedClub.id.slice(0, 80)}-kit-${kind}`,
      kind,
      shirt_colour: primaryColour || fallback,
      shorts_colour: secondaryColour || primaryColour || fallback,
      socks_colour: primaryColour || fallback,
      trim_colour: secondaryColour || null,
      pattern: null,
    }]);
  }

  function updateKit<Field extends EditableKitField>(kind: ClubKitKind, field: Field, value: ClubKit[Field]) {
    updateDraft(setKits, kits.map((kit) => kit.kind === kind ? { ...kit, [field]: value } : kit));
  }

  function removeKit(kind: ClubKitKind) {
    updateDraft(setKits, kits.filter((kit) => kit.kind !== kind));
  }

  function prepareRelationship() {
    if (!selectedClub || !relationshipTargetId) {
      setError("Für eine Clubbeziehung muss ein anderer Zielverein gewählt werden");
      return;
    }
    const existing = selectedClub.relationships?.find((item) => (
      item.kind === relationshipKind && item.target_club_id === relationshipTargetId
    ));
    void prepare({
      kind: "upsert_relationship",
      club_id: selectedClub.id,
      relationship: {
        id: existing?.id ?? identity.createId(),
        kind: relationshipKind,
        target_club_id: relationshipTargetId,
        strength: relationshipStrength,
      },
    });
  }

  function prepareRelationshipRemoval(relationshipId: string) {
    if (!selectedClub) return;
    void prepare({
      kind: "remove_relationship",
      club_id: selectedClub.id,
      relationship_id: relationshipId,
    });
  }

  async function prepare(command: ClubCommand) {
    if (!snapshot) return;
    const revision = draftRevision.current;
    const sequence = ++prepareSequence.current;
    setBusy(true);
    setError("");
    setPrepared(null);
    try {
      const result = await gateway.prepare(snapshot, {
        transaction_id: identity.createId(),
        created_at_utc: identity.now().toISOString(),
        command,
      });
      if (sequence !== prepareSequence.current || revision !== draftRevision.current) {
        setMessage("Formular geändert – asynchrone Vorschau verworfen");
        return;
      }
      setPrepared(result);
      setMessage(`${result.transaction.operations.length} exakte Änderungen konfliktgeprüft`);
    } catch (reason) {
      if (sequence === prepareSequence.current && revision === draftRevision.current) {
        setError(`Vorschau fehlgeschlagen: ${String(reason)}`);
      }
    } finally {
      if (sequence === prepareSequence.current) setBusy(false);
    }
  }

  async function commit() {
    if (!snapshot || !prepared) return;
    setBusy(true);
    setError("");
    try {
      const result = await gateway.apply(
        `clubs-${snapshot.source}-workspace-v1`, snapshot, prepared.transaction,
      );
      onSnapshotChange(result.snapshot);
      const club = result.snapshot.clubs.find((item) => item.id === clubId) ?? result.snapshot.clubs[0];
      if (club) synchronizeDraft(club, result.snapshot);
      clearPreview();
      setMessage(`${result.journal_entry.changes.length} Änderungen mit Backup, Journal und Undo übernommen`);
    } catch (reason) {
      setError(`Übernahme fehlgeschlagen: ${String(reason)}`);
    } finally {
      setBusy(false);
    }
  }

  function prepareCurrentMode() {
    if (!selectedClub) return;
    if (mode === "identity") {
      if (!name.trim()) {
        setError("Der Clubname darf nicht leer sein");
        return;
      }
      void prepare({
        kind: "update_identity",
        club_id: selectedClub.id,
        name: name.trim(),
        short_name: shortName.trim() || null,
        nation: nation.trim() || null,
        competition_id: competitionId || null,
        reputation,
        professional_status: professionalStatus || null,
      });
    } else if (mode === "stadium") {
      void prepare({
        kind: "update_stadium",
        club_id: selectedClub.id,
        stadium: stadiumName.trim() || null,
        stadium_capacity: stadiumCapacity,
        average_attendance: averageAttendance,
      });
    } else if (mode === "finances") {
      void prepare({
        kind: "update_finances",
        club_id: selectedClub.id,
        finances: { balance, transfer_budget: transferBudget, wage_budget: wageBudget, debt },
      });
    } else if (mode === "facilities") {
      void prepare({
        kind: "update_facilities",
        club_id: selectedClub.id,
        facilities: { training, youth, youth_recruitment: youthRecruitment, junior_coaching: juniorCoaching },
      });
    } else if (mode === "branding") {
      void prepare({
        kind: "update_branding",
        club_id: selectedClub.id,
        branding: {
          primary_colour: primaryColour.trim() || null,
          secondary_colour: secondaryColour.trim() || null,
          kits: kits.map((kit) => ({
            ...kit,
            shirt_colour: kit.shirt_colour.trim(),
            shorts_colour: kit.shorts_colour.trim(),
            socks_colour: kit.socks_colour.trim(),
            trim_colour: kit.trim_colour?.trim() || null,
            pattern: kit.pattern?.trim() || null,
          })),
        },
      });
    }
  }

  if (!snapshot) {
    return <Card className="club-empty"><Card.Content><Building2 size={30} /><strong>Kein Snapshot geladen</strong><span>Die Club-Zentrale benötigt kanonische Vereinsdaten.</span></Card.Content></Card>;
  }

  const totalDebt = snapshot.clubs.reduce((sum, club) => sum + (club.finances?.debt ?? 0), 0);
  const totalBudget = snapshot.clubs.reduce((sum, club) => sum + (club.finances?.transfer_budget ?? 0), 0);
  const facilityValues = snapshot.clubs.flatMap((club) => Object.values(club.facilities ?? {}).filter((value): value is number => typeof value === "number"));
  const averageFacility = facilityValues.length
    ? (facilityValues.reduce((sum, value) => sum + value, 0) / facilityValues.length).toFixed(1)
    : "–";

  return <div className="club-workspace">
    <Card className="club-hero">
      <Card.Header><div className="club-heading"><span><Landmark size={21} /></span><div><span className="eyebrow">CLUB · FINANZEN · TRIKOTS · BEZIEHUNGEN</span><Card.Title>Club Operations Center</Card.Title><Card.Description>Vereinsstrukturen atomar und referenzsicher verwalten.</Card.Description></div></div><div className="club-safety"><ShieldCheck size={17} /><div><strong>{liveWriteEnabled ? "Live-Profil bereit" : "Sichere Arbeitskopie"}</strong><span>Vorschau · Backup · Journal · Undo</span></div></div></Card.Header>
      <Card.Content><span>{snapshot.clubs.length} VEREINE · SCHEMA {snapshot.schema_version}</span><span className={error ? "error" : ""}>{error || message}</span></Card.Content>
    </Card>

    <section className="club-metrics" aria-label="Clubübersicht">
      <Metric icon={<Building2 size={17} />} label="Vereine" value={snapshot.clubs.length.toLocaleString("de-DE")} />
      <Metric icon={<BadgeEuro size={17} />} label="Transferbudgets" value={formatMoney(totalBudget)} />
      <Metric icon={<Landmark size={17} />} label="Gesamtschulden" value={formatMoney(totalDebt)} />
      <Metric icon={<Sparkles size={17} />} label="Anlagenmittel" value={averageFacility} />
      <Metric icon={<Shirt size={17} />} label="Trikots" value={snapshot.clubs.reduce((sum, club) => sum + (club.branding?.kits.length ?? 0), 0).toLocaleString("de-DE")} />
      <Metric icon={<Link2 size={17} />} label="Beziehungen" value={snapshot.clubs.reduce((sum, club) => sum + (club.relationships?.length ?? 0), 0).toLocaleString("de-DE")} />
    </section>

    <div className="club-mode-tabs" role="group" aria-label="Club-Bereich">
      {modes.map((item) => <Button key={item} variant={mode === item ? "primary" : "secondary"} isDisabled={busy} onPress={() => { setMode(item); clearPreview(); }}>{modeIcon(item)} {modeLabel(item)}</Button>)}
    </div>

    <div className="club-layout">
      <Card className="club-list-card">
        <Card.Header><div><Card.Title>Verein auswählen</Card.Title><Card.Description>{filteredClubs.length} Datensätze</Card.Description></div><Search size={16} /></Card.Header>
        <Card.Content><TextField aria-label="Vereine durchsuchen" value={query} onChange={setQuery}><Search className="search-icon" size={14} /><Input placeholder="Name, Nation oder Wettbewerb …" /></TextField><div className="club-list">{filteredClubs.map((club) => <Button key={club.id} aria-label={`Verein ${club.name}`} variant={selectedClub?.id === club.id ? "secondary" : "ghost"} isDisabled={busy} onPress={() => selectClub(club)}><span className="club-avatar">{initials(club.name)}</span><span><strong>{club.name}</strong><small>{[club.competition, club.nation].filter(Boolean).join(" · ") || "Ohne Zuordnung"}</small></span><Building2 size={14} /></Button>)}</div></Card.Content>
      </Card>

      <Card className="club-editor-card">
        <Card.Header><div><Card.Title>{modeLabel(mode)}</Card.Title><Card.Description>{selectedClub?.name ?? "Kein Verein verfügbar"}</Card.Description></div>{modeIcon(mode)}</Card.Header>
        <Card.Content>{selectedClub ? <div className="club-editor-sections">
          {mode === "identity" && <>
            <Section title="Identität" count="01"><div className="club-form-grid"><TextInput label="Clubname" value={name} onChange={(value) => updateDraft(setName, value)} /><TextInput label="Kurzname" value={shortName} onChange={(value) => updateDraft(setShortName, value)} /><TextInput label="Nation" value={nation} onChange={(value) => updateDraft(setNation, value)} /><NumberInput label="Reputation" value={reputation} min={0} max={10_000} onChange={(value) => updateDraft(setReputation, value)} /></div></Section>
            <Section title="Wettbewerb" count="02"><div className="club-option-grid"><Button aria-label="Club ohne Wettbewerb" variant={!competitionId ? "primary" : "secondary"} onPress={() => updateDraft(setCompetitionId, "")}>Ohne Wettbewerb</Button>{snapshot.competitions.map((competition) => <Button key={competition.id} aria-label={`Club-Wettbewerb ${competition.name}`} variant={competitionId === competition.id ? "primary" : "secondary"} onPress={() => updateDraft(setCompetitionId, competition.id)}>{competition.name}</Button>)}</div></Section>
            <Section title="Profistatus" count="03"><div className="club-option-grid three">{professionalStatuses.map((status) => <Button key={status} aria-label={`Profistatus ${status}`} aria-pressed={professionalStatus === status} variant={professionalStatus === status ? "primary" : "secondary"} onPress={() => updateDraft(setProfessionalStatus, status)}>{statusLabel(status)}</Button>)}</div></Section>
          </>}
          {mode === "stadium" && <Section title="Stadion und Auslastung" count="01"><div className="club-form-grid"><TextInput label="Stadion" value={stadiumName} onChange={(value) => updateDraft(setStadiumName, value)} /><NumberInput label="Stadionkapazität" value={stadiumCapacity} min={1} max={2_000_000} onChange={(value) => updateDraft(setStadiumCapacity, value)} /><NumberInput label="Zuschauerschnitt" value={averageAttendance} min={0} max={2_000_000} onChange={(value) => updateDraft(setAverageAttendance, value)} /></div><div className="club-capacity-meter"><span><Users size={14} /> Auslastung</span><strong>{stadiumCapacity > 0 ? `${Math.round(averageAttendance / stadiumCapacity * 100)}%` : "–"}</strong><i><b style={{ width: `${Math.min(100, stadiumCapacity > 0 ? averageAttendance / stadiumCapacity * 100 : 0)}%` }} /></i></div></Section>}
          {mode === "finances" && <Section title="Finanzrahmen" count="01"><div className="club-form-grid"><NumberInput label="Kontostand" value={balance} onChange={(value) => updateDraft(setBalance, value)} /><NumberInput label="Transferbudget" value={transferBudget} min={0} onChange={(value) => updateDraft(setTransferBudget, value)} /><NumberInput label="Gehaltsbudget" value={wageBudget} min={0} onChange={(value) => updateDraft(setWageBudget, value)} /><NumberInput label="Schulden" value={debt} min={0} onChange={(value) => updateDraft(setDebt, value)} /></div><div className="club-finance-summary"><span>NETTOPOSITION</span><strong className={balance - debt < 0 ? "negative" : ""}>{formatMoney(balance - debt)}</strong><small>Kontostand abzüglich Schulden</small></div></Section>}
          {mode === "facilities" && <Section title="Anlagenqualität" count="01"><div className="club-form-grid"><NumberInput label="Trainingsanlagen" value={training} min={1} max={20} onChange={(value) => updateDraft(setTraining, value)} /><NumberInput label="Jugendeinrichtungen" value={youth} min={1} max={20} onChange={(value) => updateDraft(setYouth, value)} /><NumberInput label="Jugendrekrutierung" value={youthRecruitment} min={1} max={20} onChange={(value) => updateDraft(setYouthRecruitment, value)} /><NumberInput label="Juniorentraining" value={juniorCoaching} min={1} max={20} onChange={(value) => updateDraft(setJuniorCoaching, value)} /></div><div className="club-facility-bars">{[["Training", training], ["Jugend", youth], ["Rekrutierung", youthRecruitment], ["Coaching", juniorCoaching]].map(([label, value]) => <div key={label}><span>{label}</span><i><b style={{ width: `${Number(value) * 5}%` }} /></i><strong>{value}</strong></div>)}</div></Section>}
          {mode === "branding" && <>
            <Section title="Clubfarben" count="01"><div className="club-form-grid"><ColourInput label="Primärfarbe (Hex)" value={primaryColour} onChange={(value) => updateDraft(setPrimaryColour, value)} /><ColourInput label="Sekundärfarbe (Hex)" value={secondaryColour} onChange={(value) => updateDraft(setSecondaryColour, value)} /></div></Section>
            <Section title="Trikotsätze" count="02"><div className="club-option-grid">{kitKinds.map((kind) => <Button key={kind} aria-label={`Trikot ${kitKindLabel(kind)} hinzufügen`} isDisabled={kits.some((kit) => kit.kind === kind)} variant={kits.some((kit) => kit.kind === kind) ? "secondary" : "ghost"} onPress={() => addKit(kind)}><Shirt size={13} /> {kitKindLabel(kind)}</Button>)}</div><div className="club-kit-list">{kits.map((kit) => <div className="club-kit-card" key={kit.id}><header><strong>{kitKindLabel(kit.kind)}</strong><Button isIconOnly aria-label={`Trikot ${kitKindLabel(kit.kind)} entfernen`} variant="ghost" onPress={() => removeKit(kit.kind)}><Trash2 size={13} /></Button></header><div className="club-form-grid"><ColourInput label={`${kitKindLabel(kit.kind)} Trikotfarbe`} value={kit.shirt_colour} onChange={(value) => updateKit(kit.kind, "shirt_colour", value)} /><ColourInput label={`${kitKindLabel(kit.kind)} Hosenfarbe`} value={kit.shorts_colour} onChange={(value) => updateKit(kit.kind, "shorts_colour", value)} /><ColourInput label={`${kitKindLabel(kit.kind)} Stutzenfarbe`} value={kit.socks_colour} onChange={(value) => updateKit(kit.kind, "socks_colour", value)} /><ColourInput label={`${kitKindLabel(kit.kind)} Besatzfarbe`} value={kit.trim_colour ?? ""} onChange={(value) => updateKit(kit.kind, "trim_colour", value || null)} /><TextInput label={`${kitKindLabel(kit.kind)} Muster`} value={kit.pattern ?? ""} onChange={(value) => updateKit(kit.kind, "pattern", value || null)} /></div></div>)}</div></Section>
          </>}
          {mode === "relationships" && <>
            <Section title="Zielverein" count="01"><div className="club-option-grid">{snapshot.clubs.filter((club) => club.id !== selectedClub.id).map((club) => <Button key={club.id} aria-label={`Beziehungsziel ${club.name}`} aria-pressed={relationshipTargetId === club.id} variant={relationshipTargetId === club.id ? "primary" : "secondary"} onPress={() => updateDraft(setRelationshipTargetId, club.id)}>{club.name}</Button>)}</div></Section>
            <Section title="Beziehung" count="02"><div className="club-option-grid">{relationshipKinds.map((kind) => <Button key={kind} aria-label={`Beziehungsart ${relationshipKindLabel(kind)}`} aria-pressed={relationshipKind === kind} variant={relationshipKind === kind ? "primary" : "secondary"} onPress={() => updateDraft(setRelationshipKind, kind)}>{relationshipKindLabel(kind)}</Button>)}</div><NumberInput label="Beziehungsstärke" value={relationshipStrength} min={1} max={100} onChange={(value) => updateDraft(setRelationshipStrength, value)} /><Button className="w-full" aria-label="Beziehung-Vorschau erstellen" isDisabled={busy || !relationshipTargetId} onPress={prepareRelationship}><Link2 size={15} /> Beziehung exakt vorbereiten</Button></Section>
            <Section title="Bestehende Beziehungen" count="03"><div className="club-relationship-list">{(selectedClub.relationships ?? []).map((relationship) => <div key={relationship.id}><span><strong>{relationshipKindLabel(relationship.kind)}</strong><small>{clubName(snapshot, relationship.target_club_id)} · Stärke {relationship.strength}</small></span><Button isIconOnly aria-label={`Clubbeziehung ${relationship.id} entfernen`} isDisabled={busy} variant="ghost" onPress={() => prepareRelationshipRemoval(relationship.id)}><Trash2 size={13} /></Button></div>)}</div></Section>
          </>}
          {mode !== "relationships" && <Button className="w-full" aria-label={`${modeLabel(mode)}-Vorschau erstellen`} isDisabled={busy || !selectedClub} onPress={prepareCurrentMode}><ClipboardCheck size={15} /> Exakte Vorschau erstellen</Button>}
        </div> : <div className="club-no-selection">Kein Verein im Snapshot vorhanden.</div>}</Card.Content>
      </Card>

      <Card className="club-preview-card">
        <Card.Header><div><Card.Title>Vorschau & Commit</Card.Title><Card.Description>Eine atomare Editor-Transaktion</Card.Description></div><ClipboardCheck size={16} /></Card.Header>
        <Card.Content><div className="club-safety-proof"><ShieldCheck size={16} /><div><strong>Whole-snapshot validation</strong><span>Referenzen, Geldwerte, Kapazitäten und Anlagen werden vor jeder Mutation geprüft.</span></div></div>{prepared ? <div className="club-preview"><div><Check size={15} /><span><strong>Vorschau konfliktfrei</strong><small>{prepared.transaction.operations.length} Feldänderungen</small></span></div><div className="club-change-list">{prepared.transaction.operations.map((operation) => <p key={operation.field}><code>{operation.entity_id}</code><span>{operation.field}</span></p>)}</div><code>{prepared.transaction.id}</code><Button className="w-full" isDisabled={busy} onPress={commit}><ClipboardCheck size={15} /> Mit Backup & Journal anwenden</Button></div> : <div className="club-preview-empty">Bereich bearbeiten und zuerst eine exakte Vorschau erstellen.</div>}</Card.Content>
      </Card>
    </div>
  </div>;
}

function Section({ title, count, children }: { title: string; count: string; children: ReactNode }) {
  return <section className="club-editor-section"><header><strong>{title}</strong><span>{count}</span></header>{children}</section>;
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <TextField aria-label={label} value={value} onChange={onChange}><span>{label}</span><Input /></TextField>;
}

function ColourInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <TextField aria-label={label} value={value} onChange={onChange}><span>{label}</span><div className="club-colour-input"><i style={{ background: /^#[0-9a-f]{6}$/i.test(value) ? value : "transparent" }} /><Input placeholder="#RRGGBB" /></div></TextField>;
}

function NumberInput({ label, value, min, max, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void }) {
  return <label><span>{label}</span><NumberField aria-label={label} value={value} minValue={min} maxValue={max} onChange={onChange}><NumberField.Group><NumberField.Input /><NumberField.DecrementButton aria-label={`${label} verringern`}>−</NumberField.DecrementButton><NumberField.IncrementButton aria-label={`${label} erhöhen`}>+</NumberField.IncrementButton></NumberField.Group></NumberField></label>;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <Card><Card.Content>{icon}<div><span>{label}</span><strong>{value}</strong></div></Card.Content></Card>;
}

function inferCompetitionId(club: Club | null, snapshot: DatabaseSnapshot | null) {
  if (!club || !snapshot) return "";
  return club.competition_id
    ?? snapshot.competitions.find((competition) => competition.name === club.competition)?.id
    ?? "";
}

function modeLabel(mode: Mode) {
  return { identity: "Identität", stadium: "Stadion", finances: "Finanzen", facilities: "Anlagen", branding: "Farben & Trikots", relationships: "Clubbeziehungen" }[mode];
}

function modeIcon(mode: Mode) {
  const Icon = { identity: Building2, stadium: Landmark, finances: BadgeEuro, facilities: Sparkles, branding: Palette, relationships: Link2 }[mode];
  return <Icon size={14} />;
}

function kitKindLabel(kind: ClubKitKind) {
  return { home: "Heim", away: "Auswärts", third: "Dritt", goalkeeper: "Torwart" }[kind];
}

function relationshipKindLabel(kind: ClubRelationshipKind) {
  return { rival: "Rivale", affiliate: "Partner", parent: "Mutterverein", feeder: "Farmteam", friendly: "Befreundet" }[kind];
}

function clubName(snapshot: DatabaseSnapshot, clubId: string) {
  return snapshot.clubs.find((club) => club.id === clubId)?.name ?? clubId;
}

function statusLabel(status: typeof professionalStatuses[number]) {
  return { professional: "Professionell", semi_professional: "Semiprofessionell", amateur: "Amateur" }[status];
}

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 }).format(value);
}
