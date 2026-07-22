import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Card, Input, NumberField, TextField } from "@heroui/react";
import { invoke } from "@tauri-apps/api/core";
import {
  CalendarDays, Check, ClipboardCheck, ListOrdered, Search, ShieldCheck, TableProperties,
  Trophy,
} from "lucide-react";

import type {
  AppliedTransaction, Competition, CompetitionActionRequest, CompetitionCommand,
  CompetitionFixture, CompetitionStage, CompetitionStageKind, CompetitionStanding,
  DatabaseSnapshot, FixtureStatus, GameDate, PreparedCompetitionAction,
} from "./types";

export type CompetitionGateway = {
  prepare: (
    snapshot: DatabaseSnapshot,
    request: CompetitionActionRequest,
  ) => Promise<PreparedCompetitionAction>;
  apply: (
    journalId: string,
    snapshot: DatabaseSnapshot,
    transaction: PreparedCompetitionAction["transaction"],
  ) => Promise<AppliedTransaction>;
};

export type CompetitionIdentityProvider = {
  createId: () => string;
  now: () => Date;
};

const tauriGateway: CompetitionGateway = {
  prepare: (snapshot, request) => invoke("prepare_competition_action", { snapshot, request }),
  apply: (journalId, snapshot, transaction) => invoke("apply_snapshot_transaction", {
    journalId, snapshot, transaction,
  }),
};

const defaultIdentity: CompetitionIdentityProvider = {
  createId: () => `competition-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  now: () => new Date(),
};

type Mode = "profile" | "stages" | "fixtures" | "standings";
const modes: Mode[] = ["profile", "stages", "fixtures", "standings"];
const stageKinds: CompetitionStageKind[] = ["league", "group", "knockout", "qualifying", "playoff", "final"];
const fixtureStatuses: FixtureStatus[] = ["scheduled", "in_progress", "played", "postponed", "cancelled"];

export function CompetitionWorkspace({
  snapshot,
  onSnapshotChange,
  liveWriteEnabled = false,
  gateway = tauriGateway,
  identity = defaultIdentity,
}: {
  snapshot: DatabaseSnapshot | null;
  onSnapshotChange: (snapshot: DatabaseSnapshot) => void;
  liveWriteEnabled?: boolean;
  gateway?: CompetitionGateway;
  identity?: CompetitionIdentityProvider;
}) {
  const firstCompetition = snapshot?.competitions[0] ?? null;
  const [mode, setMode] = useState<Mode>("profile");
  const [query, setQuery] = useState("");
  const [competitionId, setCompetitionId] = useState(firstCompetition?.id ?? "");
  const [name, setName] = useState(firstCompetition?.name ?? "");
  const [shortName, setShortName] = useState(firstCompetition?.short_name ?? "");
  const [nation, setNation] = useState(firstCompetition?.nation ?? "");
  const [reputation, setReputation] = useState(firstCompetition?.reputation ?? 0);
  const [level, setLevel] = useState(firstCompetition?.level ?? 1);
  const [championClubId, setChampionClubId] = useState(firstCompetition?.current_champion_club_id ?? "");

  const [stageId, setStageId] = useState(firstCompetition?.stages?.[0]?.id ?? "");
  const [stageName, setStageName] = useState(firstCompetition?.stages?.[0]?.name ?? "");
  const [stageKind, setStageKind] = useState<CompetitionStageKind>(firstCompetition?.stages?.[0]?.kind ?? "league");
  const [stageOrder, setStageOrder] = useState(firstCompetition?.stages?.[0]?.order ?? 1);
  const [stageStartsOn, setStageStartsOn] = useState(toIsoDate(firstCompetition?.stages?.[0]?.starts_on));
  const [stageEndsOn, setStageEndsOn] = useState(toIsoDate(firstCompetition?.stages?.[0]?.ends_on));
  const [stageCurrent, setStageCurrent] = useState(firstCompetition?.stages?.[0]?.current ?? true);

  const [fixtureId, setFixtureId] = useState(firstCompetition?.fixtures?.[0]?.id ?? "");
  const [fixtureStageId, setFixtureStageId] = useState(firstCompetition?.fixtures?.[0]?.stage_id ?? "");
  const [homeClubId, setHomeClubId] = useState(firstCompetition?.fixtures?.[0]?.home_club_id ?? snapshot?.clubs[0]?.id ?? "");
  const [awayClubId, setAwayClubId] = useState(firstCompetition?.fixtures?.[0]?.away_club_id ?? snapshot?.clubs[1]?.id ?? "");
  const [scheduledOn, setScheduledOn] = useState(toIsoDate(firstCompetition?.fixtures?.[0]?.scheduled_on));
  const [fixtureStatus, setFixtureStatus] = useState<FixtureStatus>(firstCompetition?.fixtures?.[0]?.status ?? "scheduled");
  const [homeScore, setHomeScore] = useState(firstCompetition?.fixtures?.[0]?.home_score ?? 0);
  const [awayScore, setAwayScore] = useState(firstCompetition?.fixtures?.[0]?.away_score ?? 0);
  const [round, setRound] = useState(firstCompetition?.fixtures?.[0]?.round ?? "");
  const [venue, setVenue] = useState(firstCompetition?.fixtures?.[0]?.venue ?? "");

  const [standingClubId, setStandingClubId] = useState(firstCompetition?.standings?.[0]?.club_id ?? snapshot?.clubs[0]?.id ?? "");
  const [standingStageId, setStandingStageId] = useState(firstCompetition?.standings?.[0]?.stage_id ?? "");
  const [position, setPosition] = useState(firstCompetition?.standings?.[0]?.position ?? 1);
  const [played, setPlayed] = useState(firstCompetition?.standings?.[0]?.played ?? 0);
  const [won, setWon] = useState(firstCompetition?.standings?.[0]?.won ?? 0);
  const [drawn, setDrawn] = useState(firstCompetition?.standings?.[0]?.drawn ?? 0);
  const [lost, setLost] = useState(firstCompetition?.standings?.[0]?.lost ?? 0);
  const [goalsFor, setGoalsFor] = useState(firstCompetition?.standings?.[0]?.goals_for ?? 0);
  const [goalsAgainst, setGoalsAgainst] = useState(firstCompetition?.standings?.[0]?.goals_against ?? 0);
  const [points, setPoints] = useState(firstCompetition?.standings?.[0]?.points ?? 0);

  const [prepared, setPrepared] = useState<PreparedCompetitionAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Wettbewerbsdaten sicher in der kanonischen Arbeitskopie bearbeiten");
  const [error, setError] = useState("");
  const draftRevision = useRef(0);
  const prepareSequence = useRef(0);

  const selectedCompetition = snapshot?.competitions.find((item) => item.id === competitionId)
    ?? snapshot?.competitions[0] ?? null;
  const normalizedQuery = query.trim().toLocaleLowerCase("de");
  const filteredCompetitions = useMemo(() => (snapshot?.competitions ?? []).filter((competition) => {
    const values = [competition.name, competition.short_name, competition.nation];
    return !normalizedQuery || values.some((value) => value?.toLocaleLowerCase("de").includes(normalizedQuery));
  }), [normalizedQuery, snapshot]);

  useEffect(() => {
    if (!snapshot) return;
    const competition = snapshot.competitions.find((item) => item.id === competitionId)
      ?? snapshot.competitions[0] ?? null;
    if (competition) {
      setCompetitionId(competition.id);
      synchronizeDraft(competition, snapshot);
    }
    clearPreview();
  }, [snapshot]);

  function synchronizeDraft(competition: Competition, source: DatabaseSnapshot) {
    setName(competition.name);
    setShortName(competition.short_name ?? "");
    setNation(competition.nation ?? "");
    setReputation(competition.reputation ?? 0);
    setLevel(competition.level ?? 1);
    setChampionClubId(competition.current_champion_club_id ?? "");
    synchronizeStage(competition.stages?.[0] ?? null);
    synchronizeFixture(competition.fixtures?.[0] ?? null, source);
    synchronizeStanding(competition.standings?.[0] ?? null, source);
  }

  function synchronizeStage(stage: CompetitionStage | null) {
    setStageId(stage?.id ?? "");
    setStageName(stage?.name ?? "");
    setStageKind(stage?.kind ?? "league");
    setStageOrder(stage?.order ?? 1);
    setStageStartsOn(toIsoDate(stage?.starts_on));
    setStageEndsOn(toIsoDate(stage?.ends_on));
    setStageCurrent(stage?.current ?? true);
  }

  function synchronizeFixture(fixture: CompetitionFixture | null, source: DatabaseSnapshot) {
    setFixtureId(fixture?.id ?? "");
    setFixtureStageId(fixture?.stage_id ?? "");
    setHomeClubId(fixture?.home_club_id ?? source.clubs[0]?.id ?? "");
    setAwayClubId(fixture?.away_club_id ?? source.clubs[1]?.id ?? source.clubs[0]?.id ?? "");
    setScheduledOn(toIsoDate(fixture?.scheduled_on));
    setFixtureStatus(fixture?.status ?? "scheduled");
    setHomeScore(fixture?.home_score ?? 0);
    setAwayScore(fixture?.away_score ?? 0);
    setRound(fixture?.round ?? "");
    setVenue(fixture?.venue ?? "");
  }

  function synchronizeStanding(standing: CompetitionStanding | null, source: DatabaseSnapshot) {
    setStandingClubId(standing?.club_id ?? source.clubs[0]?.id ?? "");
    setStandingStageId(standing?.stage_id ?? "");
    setPosition(standing?.position ?? 1);
    setPlayed(standing?.played ?? 0);
    setWon(standing?.won ?? 0);
    setDrawn(standing?.drawn ?? 0);
    setLost(standing?.lost ?? 0);
    setGoalsFor(standing?.goals_for ?? 0);
    setGoalsAgainst(standing?.goals_against ?? 0);
    setPoints(standing?.points ?? 0);
  }

  function selectCompetition(competition: Competition) {
    setCompetitionId(competition.id);
    if (snapshot) synchronizeDraft(competition, snapshot);
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

  async function prepare(command: CompetitionCommand) {
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
        `competitions-${snapshot.source}-workspace-v1`, snapshot, prepared.transaction,
      );
      onSnapshotChange(result.snapshot);
      const competition = result.snapshot.competitions.find((item) => item.id === competitionId)
        ?? result.snapshot.competitions[0];
      if (competition) synchronizeDraft(competition, result.snapshot);
      clearPreview();
      setMessage(`${result.journal_entry.changes.length} Änderungen mit Backup, Journal und Undo übernommen`);
    } catch (reason) {
      setError(`Übernahme fehlgeschlagen: ${String(reason)}`);
    } finally {
      setBusy(false);
    }
  }

  function prepareCurrentMode() {
    if (!selectedCompetition) return;
    if (mode === "profile") {
      if (!name.trim()) {
        setError("Der Wettbewerbsname darf nicht leer sein");
        return;
      }
      void prepare({
        kind: "update_profile",
        competition_id: selectedCompetition.id,
        name: name.trim(),
        short_name: shortName.trim() || null,
        nation: nation.trim() || null,
        reputation,
        current_champion_club_id: championClubId || null,
        level,
      });
      return;
    }
    if (mode === "stages") {
      if (!stageName.trim()) {
        setError("Der Stufenname darf nicht leer sein");
        return;
      }
      const nextStage: CompetitionStage = {
        id: stageId || `stage-${identity.createId()}`,
        name: stageName.trim(),
        kind: stageKind,
        order: stageOrder,
        starts_on: fromIsoDate(stageStartsOn),
        ends_on: fromIsoDate(stageEndsOn),
        current: stageCurrent,
      };
      const stages = (selectedCompetition.stages ?? []).map((stage) => ({
        ...stage,
        current: nextStage.current && stage.id !== nextStage.id ? false : stage.current,
      }));
      const index = stages.findIndex((stage) => stage.id === nextStage.id);
      if (index >= 0) stages[index] = nextStage;
      else stages.push(nextStage);
      void prepare({ kind: "set_stages", competition_id: selectedCompetition.id, stages });
      return;
    }
    if (mode === "fixtures") {
      if (!homeClubId || !awayClubId || homeClubId === awayClubId) {
        setError("Heim- und Auswärtsclub müssen vorhanden und verschieden sein");
        return;
      }
      const scored = fixtureStatus === "played" || fixtureStatus === "in_progress";
      void prepare({
        kind: "upsert_fixture",
        competition_id: selectedCompetition.id,
        fixture: {
          id: fixtureId || `fixture-${identity.createId()}`,
          stage_id: fixtureStageId || null,
          home_club_id: homeClubId,
          away_club_id: awayClubId,
          scheduled_on: fromIsoDate(scheduledOn),
          status: fixtureStatus,
          home_score: scored ? homeScore : null,
          away_score: scored ? awayScore : null,
          round: round.trim() || null,
          venue: venue.trim() || null,
        },
      });
      return;
    }
    if (!standingClubId || played !== won + drawn + lost) {
      setError("Tabellenclub fehlt oder Spiele entsprechen nicht Sieg + Remis + Niederlage");
      return;
    }
    const nextStanding: CompetitionStanding = {
      stage_id: standingStageId || null,
      club_id: standingClubId,
      position,
      played,
      won,
      drawn,
      lost,
      goals_for: goalsFor,
      goals_against: goalsAgainst,
      goal_difference: goalsFor - goalsAgainst,
      points,
    };
    const standings = [...(selectedCompetition.standings ?? [])];
    const index = standings.findIndex((standing) => (
      standing.club_id === standingClubId && (standing.stage_id ?? "") === standingStageId
    ));
    if (index >= 0) standings[index] = nextStanding;
    else standings.push(nextStanding);
    void prepare({ kind: "set_standings", competition_id: selectedCompetition.id, standings });
  }

  function prepareFixtureRemoval() {
    if (!selectedCompetition || !fixtureId) return;
    void prepare({
      kind: "remove_fixture",
      competition_id: selectedCompetition.id,
      fixture_id: fixtureId,
    });
  }

  if (!snapshot) return <Card className="competition-empty"><Card.Content>Kein kanonischer Snapshot geladen.</Card.Content></Card>;

  const totalStages = snapshot.competitions.reduce((sum, item) => sum + (item.stages?.length ?? 0), 0);
  const totalFixtures = snapshot.competitions.reduce((sum, item) => sum + (item.fixtures?.length ?? 0), 0);
  const totalStandings = snapshot.competitions.reduce((sum, item) => sum + (item.standings?.length ?? 0), 0);

  return <div className="club-workspace competition-workspace">
    <Card className="club-hero competition-hero">
      <Card.Header><div className="club-heading"><span><Trophy size={21} /></span><div><span className="eyebrow">WETTBEWERBE · STUFEN · SPIELPLAN · TABELLE</span><Card.Title>Competition Operations Center</Card.Title><Card.Description>Wettbewerbsstrukturen atomar und referenzsicher verwalten.</Card.Description></div></div><div className="club-safety"><ShieldCheck size={17} /><div><strong>{liveWriteEnabled ? "Live-Profil bereit" : "Sichere Arbeitskopie"}</strong><span>Vorschau · Backup · Journal · Undo</span></div></div></Card.Header>
      <Card.Content><span>{snapshot.competitions.length} WETTBEWERBE · SCHEMA {snapshot.schema_version}</span><span className={error ? "error" : ""}>{error || message}</span></Card.Content>
    </Card>

    <section className="club-metrics" aria-label="Wettbewerbsübersicht">
      <Metric icon={<Trophy size={17} />} label="Wettbewerbe" value={snapshot.competitions.length.toLocaleString("de-DE")} />
      <Metric icon={<ListOrdered size={17} />} label="Stufen" value={totalStages.toLocaleString("de-DE")} />
      <Metric icon={<CalendarDays size={17} />} label="Paarungen" value={totalFixtures.toLocaleString("de-DE")} />
      <Metric icon={<TableProperties size={17} />} label="Tabellenzeilen" value={totalStandings.toLocaleString("de-DE")} />
    </section>

    <div className="club-mode-tabs" role="group" aria-label="Wettbewerbs-Bereich">
      {modes.map((item) => <Button key={item} variant={mode === item ? "primary" : "secondary"} isDisabled={busy} onPress={() => { setMode(item); clearPreview(); }}>{modeIcon(item)} {modeLabel(item)}</Button>)}
    </div>

    <div className="club-layout">
      <Card className="club-list-card">
        <Card.Header><div><Card.Title>Wettbewerb auswählen</Card.Title><Card.Description>{filteredCompetitions.length} Datensätze</Card.Description></div><Search size={16} /></Card.Header>
        <Card.Content><TextField aria-label="Wettbewerbe durchsuchen" value={query} onChange={setQuery}><Search className="search-icon" size={14} /><Input placeholder="Name oder Nation …" /></TextField><div className="club-list">{filteredCompetitions.map((competition) => <Button key={competition.id} aria-label={`Wettbewerb ${competition.name}`} variant={selectedCompetition?.id === competition.id ? "secondary" : "ghost"} isDisabled={busy} onPress={() => selectCompetition(competition)}><span className="club-avatar"><Trophy size={14} /></span><span><strong>{competition.name}</strong><small>{[competition.nation, competition.level ? `Stufe ${competition.level}` : null].filter(Boolean).join(" · ") || "Ohne Zuordnung"}</small></span><Trophy size={14} /></Button>)}</div></Card.Content>
      </Card>

      <Card className="club-editor-card">
        <Card.Header><div><Card.Title>{modeLabel(mode)}</Card.Title><Card.Description>{selectedCompetition?.name ?? "Kein Wettbewerb verfügbar"}</Card.Description></div>{modeIcon(mode)}</Card.Header>
        <Card.Content>{selectedCompetition ? <div className="club-editor-sections">
          {mode === "profile" && <>
            <Section title="Wettbewerbsprofil" count="01"><div className="club-form-grid"><TextInput label="Wettbewerbsname" value={name} onChange={(value) => updateDraft(setName, value)} /><TextInput label="Kurzname" value={shortName} onChange={(value) => updateDraft(setShortName, value)} /><TextInput label="Nation" value={nation} onChange={(value) => updateDraft(setNation, value)} /><NumberInput label="Reputation" value={reputation} min={0} max={10_000} onChange={(value) => updateDraft(setReputation, value)} /><NumberInput label="Ligaebene" value={level} min={1} max={255} onChange={(value) => updateDraft(setLevel, value)} /></div></Section>
            <Section title="Titelverteidiger" count="02"><div className="club-option-grid"><Button aria-label="Kein Titelverteidiger" variant={!championClubId ? "primary" : "secondary"} onPress={() => updateDraft(setChampionClubId, "")}>Nicht gesetzt</Button>{snapshot.clubs.map((club) => <Button key={club.id} aria-label={`Titelverteidiger ${club.name}`} variant={championClubId === club.id ? "primary" : "secondary"} onPress={() => updateDraft(setChampionClubId, club.id)}>{club.name}</Button>)}</div></Section>
          </>}
          {mode === "stages" && <>
            <Section title="Stufe auswählen" count="01"><div className="club-option-grid">{(selectedCompetition.stages ?? []).map((stage) => <Button key={stage.id} aria-label={`Stufe ${stage.name}`} variant={stageId === stage.id ? "primary" : "secondary"} onPress={() => { synchronizeStage(stage); clearPreview(); }}>{stage.order}. {stage.name}</Button>)}<Button variant={!stageId ? "primary" : "secondary"} onPress={() => { synchronizeStage(null); clearPreview(); }}>Neue Stufe</Button></div></Section>
            <Section title="Stufendetails" count="02"><div className="club-form-grid"><TextInput label="Stufenname" value={stageName} onChange={(value) => updateDraft(setStageName, value)} /><SelectInput label="Stufentyp" value={stageKind} options={stageKinds} onChange={(value) => updateDraft(setStageKind, value as CompetitionStageKind)} /><NumberInput label="Reihenfolge" value={stageOrder} min={1} max={1_000} onChange={(value) => updateDraft(setStageOrder, value)} /><DateInput label="Startdatum" value={stageStartsOn} onChange={(value) => updateDraft(setStageStartsOn, value)} /><DateInput label="Enddatum" value={stageEndsOn} onChange={(value) => updateDraft(setStageEndsOn, value)} /><Button aria-pressed={stageCurrent} variant={stageCurrent ? "primary" : "secondary"} onPress={() => updateDraft(setStageCurrent, !stageCurrent)}>Aktuelle Stufe: {stageCurrent ? "Ja" : "Nein"}</Button></div></Section>
          </>}
          {mode === "fixtures" && <>
            <Section title="Paarung auswählen" count="01"><div className="club-option-grid">{(selectedCompetition.fixtures ?? []).map((fixture) => <Button key={fixture.id} aria-label={`Paarung ${fixture.id}`} variant={fixtureId === fixture.id ? "primary" : "secondary"} onPress={() => { synchronizeFixture(fixture, snapshot); clearPreview(); }}>{clubName(snapshot, fixture.home_club_id)} – {clubName(snapshot, fixture.away_club_id)}</Button>)}<Button variant={!fixtureId ? "primary" : "secondary"} onPress={() => { synchronizeFixture(null, snapshot); clearPreview(); }}>Neue Paarung</Button></div></Section>
            <Section title="Spielplandetails" count="02"><div className="club-form-grid"><SelectInput label="Stufe der Paarung" value={fixtureStageId} options={["", ...(selectedCompetition.stages ?? []).map((stage) => stage.id)]} optionLabel={(value) => selectedCompetition.stages?.find((stage) => stage.id === value)?.name ?? "Ohne Stufe"} onChange={(value) => updateDraft(setFixtureStageId, value)} /><SelectInput label="Heimclub" value={homeClubId} options={snapshot.clubs.map((club) => club.id)} optionLabel={(value) => clubName(snapshot, value)} onChange={(value) => updateDraft(setHomeClubId, value)} /><SelectInput label="Auswärtsclub" value={awayClubId} options={snapshot.clubs.map((club) => club.id)} optionLabel={(value) => clubName(snapshot, value)} onChange={(value) => updateDraft(setAwayClubId, value)} /><DateInput label="Anstoßdatum" value={scheduledOn} onChange={(value) => updateDraft(setScheduledOn, value)} /><SelectInput label="Spielstatus" value={fixtureStatus} options={fixtureStatuses} optionLabel={fixtureStatusLabel} onChange={(value) => updateDraft(setFixtureStatus, value as FixtureStatus)} /><NumberInput label="Heimtore" value={homeScore} min={0} max={99} onChange={(value) => updateDraft(setHomeScore, value)} /><NumberInput label="Auswärtstore" value={awayScore} min={0} max={99} onChange={(value) => updateDraft(setAwayScore, value)} /><TextInput label="Runde" value={round} onChange={(value) => updateDraft(setRound, value)} /><TextInput label="Spielort" value={venue} onChange={(value) => updateDraft(setVenue, value)} /></div>{fixtureId && <Button variant="secondary" aria-label="Paarung zum Entfernen vormerken" onPress={prepareFixtureRemoval}>Entfernen-Vorschau erstellen</Button>}</Section>
          </>}
          {mode === "standings" && <>
            <Section title="Tabellenzeile auswählen" count="01"><div className="club-option-grid">{(selectedCompetition.standings ?? []).map((standing) => <Button key={`${standing.stage_id}-${standing.club_id}`} aria-label={`Tabellenzeile ${clubName(snapshot, standing.club_id)}`} variant={standingClubId === standing.club_id && standingStageId === (standing.stage_id ?? "") ? "primary" : "secondary"} onPress={() => { synchronizeStanding(standing, snapshot); clearPreview(); }}>{standing.position}. {clubName(snapshot, standing.club_id)}</Button>)}</div></Section>
            <Section title="Tabellenwerte" count="02"><div className="club-form-grid"><SelectInput label="Tabellenclub" value={standingClubId} options={snapshot.clubs.map((club) => club.id)} optionLabel={(value) => clubName(snapshot, value)} onChange={(value) => updateDraft(setStandingClubId, value)} /><SelectInput label="Tabellenstufe" value={standingStageId} options={["", ...(selectedCompetition.stages ?? []).map((stage) => stage.id)]} optionLabel={(value) => selectedCompetition.stages?.find((stage) => stage.id === value)?.name ?? "Gesamt"} onChange={(value) => updateDraft(setStandingStageId, value)} /><NumberInput label="Position" value={position} min={1} max={10_000} onChange={(value) => updateDraft(setPosition, value)} /><NumberInput label="Spiele" value={played} min={0} max={10_000} onChange={(value) => updateDraft(setPlayed, value)} /><NumberInput label="Siege" value={won} min={0} max={10_000} onChange={(value) => updateDraft(setWon, value)} /><NumberInput label="Remis" value={drawn} min={0} max={10_000} onChange={(value) => updateDraft(setDrawn, value)} /><NumberInput label="Niederlagen" value={lost} min={0} max={10_000} onChange={(value) => updateDraft(setLost, value)} /><NumberInput label="Tore" value={goalsFor} min={0} max={10_000} onChange={(value) => updateDraft(setGoalsFor, value)} /><NumberInput label="Gegentore" value={goalsAgainst} min={0} max={10_000} onChange={(value) => updateDraft(setGoalsAgainst, value)} /><NumberInput label="Punkte" value={points} min={-10_000} max={10_000} onChange={(value) => updateDraft(setPoints, value)} /></div><p className="competition-calculated">Tordifferenz wird kanonisch berechnet: <strong>{goalsFor - goalsAgainst}</strong></p></Section>
          </>}
          <Button className="w-full" aria-label={`${modeLabel(mode)}-Vorschau erstellen`} isDisabled={busy || !selectedCompetition} onPress={prepareCurrentMode}><ClipboardCheck size={15} /> Exakte Vorschau erstellen</Button>
        </div> : <div className="club-no-selection">Kein Wettbewerb im Snapshot vorhanden.</div>}</Card.Content>
      </Card>

      <Card className="club-preview-card">
        <Card.Header><div><Card.Title>Vorschau & Commit</Card.Title><Card.Description>Eine atomare Editor-Transaktion</Card.Description></div><ClipboardCheck size={16} /></Card.Header>
        <Card.Content><div className="club-safety-proof"><ShieldCheck size={16} /><div><strong>Whole-snapshot validation</strong><span>Champion, Stufen, Paarungen und Tabellenreferenzen werden vor jeder Mutation geprüft.</span></div></div>{prepared ? <div className="club-preview"><div><Check size={15} /><span><strong>Vorschau konfliktfrei</strong><small>{prepared.transaction.operations.length} Feldänderungen</small></span></div><div className="club-change-list">{prepared.transaction.operations.map((operation, index) => <p key={`${operation.entity_id}-${operation.field}-${index}`}><code>{operation.entity_id}</code><span>{operation.field}</span></p>)}</div><code>{prepared.transaction.id}</code><Button className="w-full" isDisabled={busy} onPress={commit}><ClipboardCheck size={15} /> Mit Backup & Journal anwenden</Button></div> : <div className="club-preview-empty">Bereich bearbeiten und zuerst eine exakte Vorschau erstellen.</div>}</Card.Content>
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

function NumberInput({ label, value, min, max, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void }) {
  return <label><span>{label}</span><NumberField aria-label={label} value={value} minValue={min} maxValue={max} onChange={onChange}><NumberField.Group><NumberField.Input /><NumberField.DecrementButton aria-label={`${label} verringern`}>−</NumberField.DecrementButton><NumberField.IncrementButton aria-label={`${label} erhöhen`}>+</NumberField.IncrementButton></NumberField.Group></NumberField></label>;
}

function SelectInput({ label, value, options, optionLabel = (item) => item, onChange }: { label: string; value: string; options: string[]; optionLabel?: (value: string) => string; onChange: (value: string) => void }) {
  return <label className="competition-native-field"><span>{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option || "none"} value={option}>{optionLabel(option)}</option>)}</select></label>;
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="competition-native-field"><span>{label}</span><input aria-label={label} type="date" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <Card><Card.Content>{icon}<div><span>{label}</span><strong>{value}</strong></div></Card.Content></Card>;
}

function modeLabel(mode: Mode) {
  return { profile: "Profil", stages: "Stufen", fixtures: "Spielplan", standings: "Tabelle" }[mode];
}

function modeIcon(mode: Mode) {
  const Icon = { profile: Trophy, stages: ListOrdered, fixtures: CalendarDays, standings: TableProperties }[mode];
  return <Icon size={14} />;
}

function clubName(snapshot: DatabaseSnapshot, clubId: string) {
  return snapshot.clubs.find((club) => club.id === clubId)?.name ?? clubId;
}

function fixtureStatusLabel(status: string) {
  return { scheduled: "Geplant", in_progress: "Läuft", played: "Gespielt", postponed: "Verschoben", cancelled: "Abgesagt" }[status] ?? status;
}

function toIsoDate(date?: GameDate | null) {
  if (!date) return "";
  return `${date.year.toString().padStart(4, "0")}-${date.month.toString().padStart(2, "0")}-${date.day.toString().padStart(2, "0")}`;
}

function fromIsoDate(value: string): GameDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}
