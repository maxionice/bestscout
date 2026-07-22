import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Card, Input, NumberField, TextArea, TextField } from "@heroui/react";
import { invoke } from "@tauri-apps/api/core";
import {
  BadgeCheck, BriefcaseBusiness, Check, ClipboardCheck, GraduationCap,
  Languages, Link2, Search, ShieldCheck, Trash2, UserRoundCog, Users,
} from "lucide-react";

import type {
  AppliedTransaction, Contract, DatabaseSnapshot, GameDate, LanguageSkill, PeopleActionRequest,
  PeopleCommand, PersonRelationship, Player, PlayerRegistration, PreparedPeopleAction,
  RelationshipKind, RelationshipTargetKind, Staff,
} from "./types";

export type PeopleGateway = {
  prepare: (snapshot: DatabaseSnapshot, request: PeopleActionRequest) => Promise<PreparedPeopleAction>;
  apply: (
    journalId: string,
    snapshot: DatabaseSnapshot,
    transaction: PreparedPeopleAction["transaction"],
  ) => Promise<AppliedTransaction>;
};

export type PeopleIdentityProvider = {
  createId: (prefix: string) => string;
  now: () => Date;
};

const tauriGateway: PeopleGateway = {
  prepare: (snapshot, request) => invoke("prepare_people_action", { snapshot, request }),
  apply: (journalId, snapshot, transaction) => invoke("apply_snapshot_transaction", {
    journalId, snapshot, transaction,
  }),
};

const defaultIdentityProvider: PeopleIdentityProvider = {
  createId: newId,
  now: () => new Date(),
};

type Mode = "staff" | "registrations" | "languages" | "relationships";
type PersonKind = "player" | "staff";

const roles = [
  "manager", "assistant_manager", "coach", "goalkeeping_coach", "fitness_coach",
  "performance_analyst", "recruitment_analyst", "scout", "director_of_football",
  "technical_director", "head_of_youth_development", "physio", "sports_scientist",
] as const;
const responsibilities = [
  "team_selection", "tactics", "team_training", "individual_training", "set_pieces",
  "opposition_instructions", "team_talks", "recruitment", "contract_negotiations", "loans",
  "youth_development", "media",
] as const;
const relationshipKinds: RelationshipKind[] = [
  "favorite_person", "disliked_person", "friend", "mentor", "family", "agent",
  "favorite_club", "disliked_club",
];

export function PeopleWorkspace({
  snapshot,
  onSnapshotChange,
  liveWriteEnabled = false,
  gateway = tauriGateway,
  identity = defaultIdentityProvider,
}: {
  snapshot: DatabaseSnapshot | null;
  onSnapshotChange: (snapshot: DatabaseSnapshot) => void;
  liveWriteEnabled?: boolean;
  gateway?: PeopleGateway;
  identity?: PeopleIdentityProvider;
}) {
  const initialStaff = snapshot?.staff[0] ?? null;
  const initialPlayer = snapshot?.players[0] ?? null;
  const [mode, setMode] = useState<Mode>("staff");
  const [query, setQuery] = useState("");
  const [staffId, setStaffId] = useState(initialStaff?.id ?? "");
  const [playerId, setPlayerId] = useState(initialPlayer?.id ?? "");
  const [selectedRoles, setSelectedRoles] = useState<string[]>(initialStaff?.roles ?? []);
  const [selectedResponsibilities, setSelectedResponsibilities] = useState<string[]>(initialStaff?.details?.responsibilities ?? []);
  const [staffClubId, setStaffClubId] = useState(initialStaff?.contract?.club_id ?? "");
  const [staffWage, setStaffWage] = useState(initialStaff?.contract?.wage ?? 0);
  const [staffContractEnd, setStaffContractEnd] = useState(formatInputDate(initialStaff?.contract?.expires_on) ?? defaultContractEnd(snapshot?.game_date));
  const [staffDateOfBirth, setStaffDateOfBirth] = useState(formatInputDate(initialStaff?.details?.date_of_birth) ?? "");
  const [staffNote, setStaffNote] = useState(initialStaff?.details?.note ?? "");
  const [qualificationName, setQualificationName] = useState("");
  const [qualificationLevel, setQualificationLevel] = useState(1);
  const [qualificationAwarded, setQualificationAwarded] = useState(formatInputDate(snapshot?.game_date) ?? "");
  const [qualificationEnd, setQualificationEnd] = useState("");
  const [personKind, setPersonKind] = useState<PersonKind>("player");
  const [languageName, setLanguageName] = useState("");
  const [languageSpeaking, setLanguageSpeaking] = useState(5);
  const [languageReading, setLanguageReading] = useState(5);
  const [languageWriting, setLanguageWriting] = useState(5);
  const [competitionId, setCompetitionId] = useState(snapshot?.competitions[0]?.id ?? "");
  const [registrationStatus, setRegistrationStatus] = useState<PlayerRegistration["status"]>("registered");
  const [squadNumber, setSquadNumber] = useState(1);
  const [hasSquadNumber, setHasSquadNumber] = useState(true);
  const [registrationEnd, setRegistrationEnd] = useState(defaultRegistrationEnd(snapshot?.game_date));
  const [homegrownClub, setHomegrownClub] = useState(false);
  const [homegrownNation, setHomegrownNation] = useState(false);
  const [targetKind, setTargetKind] = useState<RelationshipTargetKind>("staff");
  const [targetId, setTargetId] = useState(snapshot?.staff[0]?.id ?? "");
  const [relationshipKind, setRelationshipKind] = useState<RelationshipKind>("favorite_person");
  const [relationshipStrength, setRelationshipStrength] = useState(50);
  const [prepared, setPrepared] = useState<PreparedPeopleAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Personen-, Staff- und Registrierungsdaten sicher bearbeiten");
  const [error, setError] = useState("");
  const draftRevision = useRef(0);
  const prepareSequence = useRef(0);

  const selectedStaff = snapshot?.staff.find((item) => item.id === staffId) ?? snapshot?.staff[0] ?? null;
  const selectedPlayer = snapshot?.players.find((item) => item.id === playerId) ?? snapshot?.players[0] ?? null;
  const selectedPerson = personKind === "player" ? selectedPlayer : selectedStaff;
  const people = personKind === "player" ? snapshot?.players ?? [] : snapshot?.staff ?? [];
  const existingLanguages = selectedPerson?.details?.languages ?? [];
  const existingRelationships = selectedPerson?.details?.relationships ?? [];
  const targetOptions = useMemo(() => {
    if (!snapshot) return [];
    if (targetKind === "player") return snapshot.players.map(toTarget).filter((item) => !(personKind === "player" && item.id === selectedPerson?.id));
    if (targetKind === "staff") return snapshot.staff.map(toTarget).filter((item) => !(personKind === "staff" && item.id === selectedPerson?.id));
    return snapshot.clubs.map((club) => ({ id: club.id, name: club.name, subtitle: club.competition ?? club.nation ?? "Verein" }));
  }, [personKind, selectedPerson?.id, snapshot, targetKind]);
  const normalizedQuery = query.trim().toLocaleLowerCase("de");
  const filteredStaff = (snapshot?.staff ?? []).filter((item) => !normalizedQuery || searchable(item).includes(normalizedQuery));
  const filteredPlayers = (snapshot?.players ?? []).filter((item) => !normalizedQuery || searchable(item).includes(normalizedQuery));
  const gameDate = snapshot?.game_date ?? null;

  useEffect(() => {
    if (!snapshot) return;
    synchronizeDrafts(snapshot);
    clearPreview();
  }, [snapshot]);

  function synchronizeDrafts(nextSnapshot: DatabaseSnapshot) {
    const staff = nextSnapshot.staff.find((item) => item.id === staffId) ?? nextSnapshot.staff[0] ?? null;
    const player = nextSnapshot.players.find((item) => item.id === playerId) ?? nextSnapshot.players[0] ?? null;
    const nextCompetitionId = nextSnapshot.competitions.some((item) => item.id === competitionId)
      ? competitionId
      : nextSnapshot.competitions[0]?.id ?? "";
    if (staff) {
      setStaffId(staff.id);
      synchronizeStaffDraft(staff, nextSnapshot.game_date);
    }
    if (player) {
      setPlayerId(player.id);
      synchronizeRegistrationDraft(player, nextCompetitionId, nextSnapshot.game_date);
    }
    setCompetitionId(nextCompetitionId);
  }

  function synchronizeStaffDraft(staff: Staff, snapshotDate: GameDate | null | undefined) {
    setSelectedRoles(staff.roles);
    setSelectedResponsibilities(staff.details?.responsibilities ?? []);
    setStaffClubId(staff.contract?.club_id ?? "");
    setStaffWage(staff.contract?.wage ?? 0);
    setStaffContractEnd(formatInputDate(staff.contract?.expires_on) ?? defaultContractEnd(snapshotDate));
    setStaffDateOfBirth(formatInputDate(staff.details?.date_of_birth) ?? "");
    setStaffNote(staff.details?.note ?? "");
    setQualificationName("");
    setQualificationLevel(1);
    setQualificationAwarded(formatInputDate(snapshotDate) ?? "");
    setQualificationEnd("");
  }

  function synchronizeRegistrationDraft(
    player: Player,
    selectedCompetitionId: string,
    snapshotDate: GameDate | null | undefined,
  ) {
    const registration = player.details?.registrations?.find(
      (item) => item.competition_id === selectedCompetitionId,
    );
    setRegistrationStatus(registration?.status ?? "registered");
    setSquadNumber(registration?.squad_number ?? 1);
    setHasSquadNumber(registration ? registration.squad_number != null : true);
    setRegistrationEnd(
      formatInputDate(registration?.expires_on) ?? defaultRegistrationEnd(snapshotDate),
    );
    setHomegrownClub(registration?.homegrown_at_club ?? false);
    setHomegrownNation(registration?.homegrown_in_nation ?? false);
  }

  function selectStaff(item: Staff) {
    setStaffId(item.id);
    synchronizeStaffDraft(item, snapshot?.game_date);
    clearPreview();
  }

  function selectPlayer(item: Player) {
    setPlayerId(item.id);
    synchronizeRegistrationDraft(item, competitionId, snapshot?.game_date);
    clearPreview();
  }

  function selectPerson(kind: PersonKind, id: string) {
    setPersonKind(kind);
    if (kind === "player") setPlayerId(id);
    else {
      setStaffId(id);
      const staff = snapshot?.staff.find((item) => item.id === id);
      if (staff) synchronizeStaffDraft(staff, snapshot?.game_date);
    }
    setTargetId(firstRelationshipTargetId(snapshot, targetKind, kind, id));
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

  async function prepare(command: PeopleCommand) {
    if (!snapshot) return;
    const revision = draftRevision.current;
    const sequence = ++prepareSequence.current;
    setBusy(true);
    setError("");
    setPrepared(null);
    try {
      const result = await gateway.prepare(snapshot, {
        transaction_id: identity.createId("people"),
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
      const result = await gateway.apply(`people-${snapshot.source}-workspace-v1`, snapshot, prepared.transaction);
      onSnapshotChange(result.snapshot);
      synchronizeDrafts(result.snapshot);
      clearPreview();
      setMessage(`${result.journal_entry.changes.length} Änderungen mit Backup, Journal und Undo übernommen`);
    } catch (reason) {
      setError(`Übernahme fehlgeschlagen: ${String(reason)}`);
    } finally {
      setBusy(false);
    }
  }

  function prepareStaffAssignment() {
    if (!selectedStaff) return;
    let contract: Contract | null = null;
    try {
      if (staffClubId) {
        contract = {
          club_id: staffClubId,
          starts_on: gameDate,
          expires_on: parseDate(staffContractEnd, "Vertragsende"),
          contract_type: "full_time",
          wage: staffWage,
          release_clause: null,
          squad_status: null,
        };
      }
      void prepare({
        kind: "update_staff_assignment",
        staff_id: selectedStaff.id,
        roles: selectedRoles,
        responsibilities: selectedResponsibilities,
        contract,
      });
    } catch (reason) {
      setError(String(reason));
    }
  }

  function prepareStaffProfile() {
    if (!selectedStaff) return;
    try {
      void prepare({
        kind: "update_staff_profile",
        staff_id: selectedStaff.id,
        date_of_birth: parseOptionalDate(staffDateOfBirth, "Geburtsdatum"),
        note: staffNote.trim() || null,
      });
    } catch (reason) {
      setError(String(reason));
    }
  }

  function upsertLanguage() {
    if (!selectedPerson || !languageName.trim()) return;
    const language: LanguageSkill = {
      language: languageName.trim(),
      speaking: languageSpeaking,
      reading: languageReading,
      writing: languageWriting,
    };
    const languages = upsertLanguageList(existingLanguages, language);
    void prepare(personKind === "player"
      ? { kind: "set_player_languages", player_id: selectedPerson.id, languages }
      : { kind: "set_staff_languages", staff_id: selectedPerson.id, languages });
  }

  function removeLanguage(language: string) {
    if (!selectedPerson) return;
    const languages = existingLanguages.filter((item) => normalize(item.language) !== normalize(language));
    void prepare(personKind === "player"
      ? { kind: "set_player_languages", player_id: selectedPerson.id, languages }
      : { kind: "set_staff_languages", staff_id: selectedPerson.id, languages });
  }

  function upsertQualification() {
    if (!selectedStaff || !qualificationName.trim()) return;
    try {
      const current = selectedStaff.details?.qualifications ?? [];
      const normalized = normalize(qualificationName);
      const existing = current.find((item) => normalize(item.name) === normalized);
      const qualifications = [
        ...current.filter((item) => item.id !== existing?.id),
        {
          id: existing?.id ?? identity.createId(`qualification-${selectedStaff.id}`),
          name: qualificationName.trim(),
          level: qualificationLevel,
          awarded_on: parseOptionalDate(qualificationAwarded, "Verleihungsdatum"),
          expires_on: parseOptionalDate(qualificationEnd, "Qualifikationsende"),
        },
      ];
      void prepare({ kind: "set_staff_qualifications", staff_id: selectedStaff.id, qualifications });
    } catch (reason) {
      setError(String(reason));
    }
  }

  function removeQualification(id: string) {
    if (!selectedStaff) return;
    void prepare({
      kind: "set_staff_qualifications",
      staff_id: selectedStaff.id,
      qualifications: (selectedStaff.details?.qualifications ?? []).filter((item) => item.id !== id),
    });
  }

  function upsertRegistration() {
    if (!selectedPlayer || !competitionId) return;
    const clubId = selectedPlayer.details?.contract?.club_id;
    if (!clubId) {
      setError("Der Spieler benötigt einen kanonischen Vertragsverein");
      return;
    }
    try {
      const existing = selectedPlayer.details?.registrations?.find((item) => item.competition_id === competitionId);
      const registration: PlayerRegistration = {
        id: existing?.id ?? identity.createId(`registration-${selectedPlayer.id}`),
        competition_id: competitionId,
        club_id: clubId,
        status: registrationStatus,
        registered_on: gameDate,
        expires_on: parseOptionalDate(registrationEnd, "Registrierungsende"),
        squad_number: hasSquadNumber ? squadNumber : null,
        homegrown_at_club: homegrownClub,
        homegrown_in_nation: homegrownNation,
      };
      void prepare({ kind: "upsert_player_registration", player_id: selectedPlayer.id, registration });
    } catch (reason) {
      setError(String(reason));
    }
  }

  function removeRegistration(id: string) {
    if (selectedPlayer) void prepare({ kind: "remove_player_registration", player_id: selectedPlayer.id, registration_id: id });
  }

  function selectCompetition(id: string) {
    setCompetitionId(id);
    if (selectedPlayer) synchronizeRegistrationDraft(selectedPlayer, id, snapshot?.game_date);
    clearPreview();
  }

  function changeTargetKind(kind: RelationshipTargetKind) {
    setTargetKind(kind);
    setTargetId(firstRelationshipTargetId(snapshot, kind, personKind, selectedPerson?.id ?? ""));
    if (kind === "club" && !["favorite_club", "disliked_club"].includes(relationshipKind)) setRelationshipKind("favorite_club");
    if (kind !== "club" && ["favorite_club", "disliked_club"].includes(relationshipKind)) setRelationshipKind("favorite_person");
    clearPreview();
  }

  function upsertRelationship() {
    if (!selectedPerson || !targetId) return;
    const existing = existingRelationships.find((item) => item.kind === relationshipKind
      && item.target_kind === targetKind && item.target_id === targetId);
    const relationship: PersonRelationship = {
      id: existing?.id ?? identity.createId(`relationship-${selectedPerson.id}`),
      kind: relationshipKind,
      target_kind: targetKind,
      target_id: targetId,
      strength: relationshipStrength,
    };
    void prepare(personKind === "player"
      ? { kind: "upsert_player_relationship", player_id: selectedPerson.id, relationship }
      : { kind: "upsert_staff_relationship", staff_id: selectedPerson.id, relationship });
  }

  function removeRelationship(id: string) {
    if (!selectedPerson) return;
    void prepare(personKind === "player"
      ? { kind: "remove_player_relationship", player_id: selectedPerson.id, relationship_id: id }
      : { kind: "remove_staff_relationship", staff_id: selectedPerson.id, relationship_id: id });
  }

  if (!snapshot) {
    return <Card className="people-empty"><Card.Content><UserRoundCog size={30} /><strong>Kein Snapshot geladen</strong><span>Staff, Registrierungen und Beziehungen benötigen kanonische Daten.</span></Card.Content></Card>;
  }

  return <div className="people-workspace">
    <Card className="people-hero">
      <Card.Header><div className="people-heading"><span><UserRoundCog size={21} /></span><div><span className="eyebrow">STAFF · REGISTRIERUNG · SPRACHEN · BEZIEHUNGEN</span><Card.Title>People & Registration Center</Card.Title><Card.Description>Personen- und Kaderdaten referenzsicher verwalten.</Card.Description></div></div><div className="people-safety"><ShieldCheck size={17} /><div><strong>{liveWriteEnabled ? "Live-Profil bereit" : "Sichere Arbeitskopie"}</strong><span>Vorschau · Backup · Journal · Undo</span></div></div></Card.Header>
      <Card.Content><span>SPIELTAG {gameDate ? formatDate(gameDate) : "NICHT VERFÜGBAR"}</span><span className={error ? "error" : ""}>{error || message}</span></Card.Content>
    </Card>

    <section className="people-metrics" aria-label="Personenübersicht">
      <Metric icon={UserRoundCog} label="Staff" value={snapshot.staff.length} />
      <Metric icon={Users} label="Spieler" value={snapshot.players.length} />
      <Metric icon={BadgeCheck} label="Registrierungen" value={snapshot.players.reduce((sum, item) => sum + (item.details?.registrations?.length ?? 0), 0)} />
      <Metric icon={Link2} label="Beziehungen" value={snapshot.players.reduce((sum, item) => sum + (item.details?.relationships?.length ?? 0), 0) + snapshot.staff.reduce((sum, item) => sum + (item.details?.relationships?.length ?? 0), 0)} />
    </section>

    <div className="people-mode-tabs" role="group" aria-label="People-Bereich">
      {(["staff", "registrations", "languages", "relationships"] as Mode[]).map((item) => <Button key={item} variant={mode === item ? "primary" : "secondary"} isDisabled={busy} onPress={() => { setMode(item); clearPreview(); }}>{modeIcon(item)} {modeLabel(item)}</Button>)}
    </div>

    <div className="people-layout">
      <Card className="people-list-card">
        <Card.Header><div><Card.Title>{mode === "staff" ? "Staff auswählen" : mode === "registrations" ? "Spieler auswählen" : "Person auswählen"}</Card.Title><Card.Description>{mode === "staff" ? filteredStaff.length : mode === "registrations" ? filteredPlayers.length : people.length} Datensätze</Card.Description></div><Search size={16} /></Card.Header>
        <Card.Content><TextField aria-label="Personen durchsuchen" value={query} onChange={setQuery}><Search className="search-icon" size={14} /><Input placeholder="Name, Verein oder Nation …" /></TextField><div className="people-list">
          {mode === "staff" ? filteredStaff.map((item) => <PersonButton key={item.id} item={item} selected={selectedStaff?.id === item.id} label="Staff" disabled={busy} onPress={() => selectStaff(item)} />)
            : mode === "registrations" ? filteredPlayers.map((item) => <PersonButton key={item.id} item={item} selected={selectedPlayer?.id === item.id} label="Spieler" disabled={busy} onPress={() => selectPlayer(item)} />)
              : <><div className="people-kind-toggle"><Button size="sm" variant={personKind === "player" ? "primary" : "ghost"} isDisabled={busy} onPress={() => selectPerson("player", selectedPlayer?.id ?? snapshot.players[0]?.id ?? "")}>Spieler</Button><Button size="sm" variant={personKind === "staff" ? "primary" : "ghost"} isDisabled={busy} onPress={() => selectPerson("staff", selectedStaff?.id ?? snapshot.staff[0]?.id ?? "")}>Staff</Button></div>{people.filter((item) => !normalizedQuery || searchable(item).includes(normalizedQuery)).map((item) => <PersonButton key={item.id} item={item} selected={selectedPerson?.id === item.id} label={personKind === "player" ? "Spieler" : "Staff"} disabled={busy} onPress={() => selectPerson(personKind, item.id)} />)}</>}
        </div></Card.Content>
      </Card>

      <Card className="people-editor-card">
        <Card.Header><div><Card.Title>{modeLabel(mode)}</Card.Title><Card.Description>{mode === "staff" ? selectedStaff?.name : mode === "registrations" ? selectedPlayer?.name : selectedPerson?.name}</Card.Description></div>{modeIcon(mode)}</Card.Header>
        <Card.Content>
          {mode === "staff" && selectedStaff && <StaffEditor
            staff={selectedStaff}
            snapshot={snapshot}
            selectedRoles={selectedRoles}
            selectedResponsibilities={selectedResponsibilities}
            staffClubId={staffClubId}
            staffWage={staffWage}
            staffContractEnd={staffContractEnd}
            staffDateOfBirth={staffDateOfBirth}
            staffNote={staffNote}
            qualificationName={qualificationName}
            qualificationLevel={qualificationLevel}
            qualificationAwarded={qualificationAwarded}
            qualificationEnd={qualificationEnd}
            onToggleRole={(role) => updateDraft(setSelectedRoles, toggle(selectedRoles, role))}
            onToggleResponsibility={(item) => updateDraft(setSelectedResponsibilities, toggle(selectedResponsibilities, item))}
            onClub={(value) => updateDraft(setStaffClubId, value)}
            onWage={(value) => updateDraft(setStaffWage, value)}
            onContractEnd={(value) => updateDraft(setStaffContractEnd, value)}
            onDateOfBirth={(value) => updateDraft(setStaffDateOfBirth, value)}
            onNote={(value) => updateDraft(setStaffNote, value)}
            onQualificationName={(value) => updateDraft(setQualificationName, value)}
            onQualificationLevel={(value) => updateDraft(setQualificationLevel, value)}
            onQualificationAwarded={(value) => updateDraft(setQualificationAwarded, value)}
            onQualificationEnd={(value) => updateDraft(setQualificationEnd, value)}
            onPrepare={prepareStaffAssignment}
            onPrepareProfile={prepareStaffProfile}
            onUpsertQualification={upsertQualification}
            onRemoveQualification={removeQualification}
            busy={busy}
          />}
          {mode === "registrations" && selectedPlayer && <RegistrationEditor
            player={selectedPlayer}
            snapshot={snapshot}
            competitionId={competitionId}
            status={registrationStatus}
            squadNumber={squadNumber}
            hasSquadNumber={hasSquadNumber}
            registrationEnd={registrationEnd}
            homegrownClub={homegrownClub}
            homegrownNation={homegrownNation}
            onCompetition={selectCompetition}
            onStatus={(value) => updateDraft(setRegistrationStatus, value)}
            onSquadNumber={(value) => updateDraft(setSquadNumber, value)}
            onHasSquadNumber={(value) => updateDraft(setHasSquadNumber, value)}
            onEnd={(value) => updateDraft(setRegistrationEnd, value)}
            onHomegrownClub={(value) => updateDraft(setHomegrownClub, value)}
            onHomegrownNation={(value) => updateDraft(setHomegrownNation, value)}
            onUpsert={upsertRegistration}
            onRemove={removeRegistration}
            busy={busy}
          />}
          {mode === "languages" && selectedPerson && <LanguageEditor languages={existingLanguages} name={languageName} speaking={languageSpeaking} reading={languageReading} writing={languageWriting} onName={(value) => updateDraft(setLanguageName, value)} onSpeaking={(value) => updateDraft(setLanguageSpeaking, value)} onReading={(value) => updateDraft(setLanguageReading, value)} onWriting={(value) => updateDraft(setLanguageWriting, value)} onUpsert={upsertLanguage} onRemove={removeLanguage} busy={busy} />}
          {mode === "relationships" && selectedPerson && <RelationshipEditor snapshot={snapshot} relationships={existingRelationships} targetKind={targetKind} targetId={targetId} targetOptions={targetOptions} relationshipKind={relationshipKind} strength={relationshipStrength} onTargetKind={changeTargetKind} onTarget={(value) => updateDraft(setTargetId, value)} onKind={(value) => updateDraft(setRelationshipKind, value)} onStrength={(value) => updateDraft(setRelationshipStrength, value)} onUpsert={upsertRelationship} onRemove={removeRelationship} busy={busy} />}
        </Card.Content>
      </Card>

      <Card className="people-preview-card">
        <Card.Header><div><Card.Title>Vorschau & Commit</Card.Title><Card.Description>Eine atomare Editor-Transaktion</Card.Description></div><ClipboardCheck size={16} /></Card.Header>
        <Card.Content><div className="people-safety-proof"><ShieldCheck size={16} /><div><strong>Referenzen vor Mutation</strong><span>IDs, Vereine, Wettbewerbe, Daten und Grenzwerte werden komplett geprüft.</span></div></div>{prepared ? <div className="people-preview"><div><Check size={15} /><span><strong>Vorschau konfliktfrei</strong><small>{prepared.transaction.operations.length} Feldänderungen</small></span></div><div className="people-change-list">{prepared.transaction.operations.map((operation) => <p key={`${operation.entity_kind}-${operation.entity_id}-${operation.field}`}><code>{operation.entity_id}</code><span>{operation.field}</span></p>)}</div><code>{prepared.transaction.id}</code><Button className="w-full" onPress={commit} isDisabled={busy}><ClipboardCheck size={15} /> Mit Backup & Journal anwenden</Button></div> : <div className="people-preview-empty">Aktion konfigurieren und zuerst eine exakte Vorschau erstellen.</div>}</Card.Content>
      </Card>
    </div>
  </div>;
}

function StaffEditor(props: {
  staff: Staff; snapshot: DatabaseSnapshot; selectedRoles: string[]; selectedResponsibilities: string[];
  staffClubId: string; staffWage: number; staffContractEnd: string; staffDateOfBirth: string; staffNote: string;
  qualificationName: string; qualificationLevel: number; qualificationAwarded: string; qualificationEnd: string;
  onToggleRole: (value: string) => void; onToggleResponsibility: (value: string) => void;
  onClub: (value: string) => void; onWage: (value: number) => void; onContractEnd: (value: string) => void;
  onDateOfBirth: (value: string) => void; onNote: (value: string) => void;
  onQualificationName: (value: string) => void; onQualificationLevel: (value: number) => void;
  onQualificationAwarded: (value: string) => void; onQualificationEnd: (value: string) => void;
  onPrepare: () => void; onPrepareProfile: () => void; onUpsertQualification: () => void;
  onRemoveQualification: (id: string) => void; busy: boolean;
}) {
  return <div className="people-editor-sections">
    <EditorSection title="Person">
      <div className="people-form-grid">
        <label><span>Geburtsdatum</span><input aria-label="Staff-Geburtsdatum" type="date" value={props.staffDateOfBirth} disabled={props.busy} onChange={(event) => props.onDateOfBirth(event.target.value)} /></label>
        <div className="people-profile-summary"><small>PERSONEN-ID</small><strong>{props.staff.id}</strong></div>
      </div>
      <TextArea aria-label="Staff-Notiz" className="people-note" value={props.staffNote} maxLength={4_000} disabled={props.busy} placeholder="Interne Notiz zu Rolle, Entwicklung oder nächster Aktion …" onChange={(event) => props.onNote(event.target.value)} />
      <Button className="w-full" variant="secondary" onPress={props.onPrepareProfile} isDisabled={props.busy}><UserRoundCog size={14} /> Profildaten-Vorschau erstellen</Button>
    </EditorSection>
    <EditorSection title="Rollen" count={props.selectedRoles.length}>
      <div className="people-token-grid">{roles.map((role) => <Button
        key={role}
        size="sm"
        variant={props.selectedRoles.includes(role) ? "primary" : "ghost"}
        aria-pressed={props.selectedRoles.includes(role)}
        isDisabled={props.busy}
        onPress={() => props.onToggleRole(role)}
      >{humanize(role)}</Button>)}</div>
    </EditorSection>
    <EditorSection title="Verantwortungen" count={props.selectedResponsibilities.length}>
      <div className="people-token-grid">{responsibilities.map((item) => <Button
        key={item}
        size="sm"
        variant={props.selectedResponsibilities.includes(item) ? "primary" : "ghost"}
        aria-pressed={props.selectedResponsibilities.includes(item)}
        isDisabled={props.busy}
        onPress={() => props.onToggleResponsibility(item)}
      >{humanize(item)}</Button>)}</div>
    </EditorSection>
    <EditorSection title="Vertrag & Verein">
      <div className="people-club-grid">
        <Button
          size="sm"
          variant={!props.staffClubId ? "primary" : "secondary"}
          aria-label="Staff-Verein Vereinslos"
          isDisabled={props.busy}
          onPress={() => props.onClub("")}
        >Vereinslos</Button>
        {props.snapshot.clubs.map((club) => <Button
          key={club.id}
          size="sm"
          variant={props.staffClubId === club.id ? "primary" : "secondary"}
          aria-label={`Staff-Verein ${club.name}`}
          isDisabled={props.busy}
          onPress={() => props.onClub(club.id)}
        >{club.name}</Button>)}
      </div>
      <div className="people-form-grid">
        <NumberInput label="Staff-Wochengehalt" value={props.staffWage} onChange={props.onWage} maximum={100_000_000} disabled={props.busy || !props.staffClubId} />
        <label><span>Vertragsende</span><input aria-label="Staff-Vertragsende" type="date" value={props.staffContractEnd} disabled={props.busy || !props.staffClubId} onChange={(event) => props.onContractEnd(event.target.value)} /></label>
      </div>
      <Button className="w-full" onPress={props.onPrepare} isDisabled={props.busy || props.selectedRoles.length === 0 || Boolean(props.staffClubId && !props.staffContractEnd)}><ShieldCheck size={14} /> Staff-Vorschau erstellen</Button>
    </EditorSection>
    <EditorSection title="Qualifikationen" count={props.staff.details?.qualifications?.length ?? 0}>
      <div className="people-existing-list">{props.staff.details?.qualifications?.map((item) => <div key={item.id}>
        <span><strong>{item.name}</strong><small>Level {item.level}</small></span>
        <Button size="sm" variant="ghost" aria-label={`Qualifikation ${item.name} entfernen`} isDisabled={props.busy} onPress={() => props.onRemoveQualification(item.id)}><Trash2 size={12} /></Button>
      </div>)}</div>
      <div className="people-form-grid">
        <TextField aria-label="Qualifikation" value={props.qualificationName} isDisabled={props.busy} onChange={props.onQualificationName}><span className="people-input-label">Qualifikation</span><Input /></TextField>
        <NumberInput label="Qualifikationslevel" value={props.qualificationLevel} onChange={props.onQualificationLevel} maximum={5} minimum={1} disabled={props.busy} />
      </div>
      <div className="people-form-grid">
        <label><span>Verliehen am</span><input aria-label="Qualifikation verliehen am" type="date" value={props.qualificationAwarded} disabled={props.busy} onChange={(event) => props.onQualificationAwarded(event.target.value)} /></label>
        <label><span>Gültig bis</span><input aria-label="Qualifikation gültig bis" type="date" value={props.qualificationEnd} disabled={props.busy} onChange={(event) => props.onQualificationEnd(event.target.value)} /></label>
      </div>
      <Button variant="secondary" onPress={props.onUpsertQualification} isDisabled={props.busy || !props.qualificationName.trim()}><GraduationCap size={14} /> Qualifikation vormerken</Button>
    </EditorSection>
  </div>;
}

function RegistrationEditor(props: {
  player: Player; snapshot: DatabaseSnapshot; competitionId: string; status: PlayerRegistration["status"];
  squadNumber: number; hasSquadNumber: boolean; registrationEnd: string; homegrownClub: boolean; homegrownNation: boolean;
  onCompetition: (value: string) => void; onStatus: (value: PlayerRegistration["status"]) => void;
  onSquadNumber: (value: number) => void; onHasSquadNumber: (value: boolean) => void;
  onEnd: (value: string) => void; onHomegrownClub: (value: boolean) => void;
  onHomegrownNation: (value: boolean) => void; onUpsert: () => void; onRemove: (id: string) => void; busy: boolean;
}) {
  const clubId = props.player.details?.contract?.club_id;
  return <div className="people-editor-sections">
    <div className="registration-route"><span><small>SPIELER</small><strong>{props.player.name}</strong></span><span><small>VERTRAGSVEREIN</small><strong>{props.snapshot.clubs.find((club) => club.id === clubId)?.name ?? "Kein Verein"}</strong></span></div>
    <EditorSection title="Wettbewerb">
      <div className="people-club-grid">{props.snapshot.competitions.map((item) => <Button
        key={item.id}
        variant={props.competitionId === item.id ? "primary" : "secondary"}
        aria-label={`Registrierungswettbewerb ${item.name}`}
        isDisabled={props.busy}
        onPress={() => props.onCompetition(item.id)}
      >{item.name}</Button>)}</div>
    </EditorSection>
    <EditorSection title="Status & Nummer">
      <div className="people-token-grid four">{(["registered", "pending", "unregistered", "ineligible"] as const).map((status) => <Button
        key={status}
        size="sm"
        variant={props.status === status ? "primary" : "ghost"}
        aria-pressed={props.status === status}
        isDisabled={props.busy}
        onPress={() => props.onStatus(status)}
      >{humanize(status)}</Button>)}</div>
      <div className="people-form-grid">
        <NumberInput label="Rückennummer" value={props.squadNumber} onChange={props.onSquadNumber} maximum={99} minimum={1} disabled={props.busy || !props.hasSquadNumber} />
        <label><span>Registrierungsende</span><input aria-label="Registrierungsende" type="date" value={props.registrationEnd} disabled={props.busy} onChange={(event) => props.onEnd(event.target.value)} /></label>
      </div>
      <Button variant={props.hasSquadNumber ? "secondary" : "primary"} aria-pressed={!props.hasSquadNumber} isDisabled={props.busy} onPress={() => props.onHasSquadNumber(!props.hasSquadNumber)}>{props.hasSquadNumber ? "Ohne Rückennummer" : "Rückennummer verwenden"}</Button>
      <div className="people-boolean-grid">
        <Button variant={props.homegrownClub ? "primary" : "secondary"} aria-pressed={props.homegrownClub} isDisabled={props.busy} onPress={() => props.onHomegrownClub(!props.homegrownClub)}>Im Verein ausgebildet</Button>
        <Button variant={props.homegrownNation ? "primary" : "secondary"} aria-pressed={props.homegrownNation} isDisabled={props.busy} onPress={() => props.onHomegrownNation(!props.homegrownNation)}>Im Land ausgebildet</Button>
      </div>
      <Button className="w-full" onPress={props.onUpsert} isDisabled={props.busy || !clubId || !props.competitionId}><BadgeCheck size={14} /> Registrierungsvorschau erstellen</Button>
    </EditorSection>
    <EditorSection title="Bestehende Registrierungen" count={props.player.details?.registrations?.length ?? 0}>
      <div className="people-existing-list">{props.player.details?.registrations?.map((item) => <div key={item.id}>
        <span><strong>{props.snapshot.competitions.find((competition) => competition.id === item.competition_id)?.name ?? item.competition_id}</strong><small>{humanize(item.status)} · #{item.squad_number ?? "–"}</small></span>
        <Button size="sm" variant="ghost" aria-label={`Registrierung ${item.id} entfernen`} isDisabled={props.busy} onPress={() => props.onRemove(item.id)}><Trash2 size={12} /></Button>
      </div>)}</div>
    </EditorSection>
  </div>;
}

function LanguageEditor(props: {
  languages: LanguageSkill[]; name: string; speaking: number; reading: number; writing: number;
  onName: (value: string) => void; onSpeaking: (value: number) => void; onReading: (value: number) => void;
  onWriting: (value: number) => void; onUpsert: () => void; onRemove: (name: string) => void; busy: boolean;
}) {
  return <div className="people-editor-sections">
    <EditorSection title="Sprachprofil" count={props.languages.length}>
      <div className="language-list">{props.languages.map((item) => <div key={item.language}>
        <span><strong>{item.language}</strong><small>Sprechen {item.speaking} · Lesen {item.reading} · Schreiben {item.writing}</small></span>
        <Button size="sm" variant="ghost" aria-label={`Sprache ${item.language} entfernen`} isDisabled={props.busy} onPress={() => props.onRemove(item.language)}><Trash2 size={12} /></Button>
      </div>)}</div>
    </EditorSection>
    <EditorSection title="Sprache hinzufügen oder aktualisieren">
      <TextField aria-label="Sprache" value={props.name} isDisabled={props.busy} onChange={props.onName}><span className="people-input-label">Sprache</span><Input placeholder="z. B. Deutsch" /></TextField>
      <div className="people-form-grid three">
        <NumberInput label="Sprechen" value={props.speaking} onChange={props.onSpeaking} maximum={10} minimum={1} disabled={props.busy} />
        <NumberInput label="Lesen" value={props.reading} onChange={props.onReading} maximum={10} minimum={1} disabled={props.busy} />
        <NumberInput label="Schreiben" value={props.writing} onChange={props.onWriting} maximum={10} minimum={1} disabled={props.busy} />
      </div>
      <Button className="w-full" onPress={props.onUpsert} isDisabled={props.busy || !props.name.trim()}><Languages size={14} /> Sprachvorschau erstellen</Button>
    </EditorSection>
  </div>;
}

function RelationshipEditor(props: {
  snapshot: DatabaseSnapshot; relationships: PersonRelationship[]; targetKind: RelationshipTargetKind; targetId: string;
  targetOptions: Array<{ id: string; name: string; subtitle: string }>; relationshipKind: RelationshipKind;
  strength: number; onTargetKind: (kind: RelationshipTargetKind) => void; onTarget: (id: string) => void;
  onKind: (kind: RelationshipKind) => void; onStrength: (value: number) => void; onUpsert: () => void;
  onRemove: (id: string) => void; busy: boolean;
}) {
  const allowedKinds = relationshipKinds.filter((kind) => props.targetKind === "club" ? kind.endsWith("_club") : !kind.endsWith("_club") && (props.targetKind === "staff" || kind !== "agent"));
  return <div className="people-editor-sections">
    <EditorSection title="Zieltyp">
      <div className="people-token-grid three">{(["player", "staff", "club"] as const).map((kind) => <Button
        key={kind}
        variant={props.targetKind === kind ? "primary" : "ghost"}
        aria-pressed={props.targetKind === kind}
        isDisabled={props.busy}
        onPress={() => props.onTargetKind(kind)}
      >{humanize(kind)}</Button>)}</div>
    </EditorSection>
    <EditorSection title="Ziel">
      <div className="relationship-target-list">{props.targetOptions.map((item) => <Button
        key={item.id}
        variant={props.targetId === item.id ? "primary" : "secondary"}
        aria-label={`Beziehungsziel ${item.name}`}
        isDisabled={props.busy}
        onPress={() => props.onTarget(item.id)}
      ><span><strong>{item.name}</strong><small>{item.subtitle}</small></span>{props.targetId === item.id && <Check size={11} />}</Button>)}</div>
    </EditorSection>
    <EditorSection title="Art & Stärke">
      <div className="people-token-grid">{allowedKinds.map((kind) => <Button
        key={kind}
        size="sm"
        variant={props.relationshipKind === kind ? "primary" : "ghost"}
        aria-pressed={props.relationshipKind === kind}
        isDisabled={props.busy}
        onPress={() => props.onKind(kind)}
      >{humanize(kind)}</Button>)}</div>
      <NumberInput label="Beziehungsstärke" value={props.strength} onChange={props.onStrength} maximum={100} minimum={1} disabled={props.busy} />
      <Button className="w-full" onPress={props.onUpsert} isDisabled={props.busy || !props.targetId}><Link2 size={14} /> Beziehungsvorschau erstellen</Button>
    </EditorSection>
    <EditorSection title="Bestehende Beziehungen" count={props.relationships.length}>
      <div className="people-existing-list">{props.relationships.map((item) => <div key={item.id}>
        <span><strong>{humanize(item.kind)}</strong><small>{humanize(item.target_kind)} · {relationshipTargetName(props.snapshot, item)} · {item.strength}</small></span>
        <Button size="sm" variant="ghost" aria-label={`Beziehung ${item.id} entfernen`} isDisabled={props.busy} onPress={() => props.onRemove(item.id)}><Trash2 size={12} /></Button>
      </div>)}</div>
    </EditorSection>
  </div>;
}

function EditorSection({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return <section className="people-editor-section"><header><strong>{title}</strong>{count != null && <span>{count}</span>}</header>{children}</section>;
}

function PersonButton({ item, selected, label, disabled, onPress }: { item: Player | Staff; selected: boolean; label: string; disabled: boolean; onPress: () => void }) {
  return <Button variant={selected ? "primary" : "ghost"} aria-label={`${label} ${item.name}`} aria-pressed={selected} isDisabled={disabled} onPress={onPress}><span className="people-avatar">{initials(item.name)}</span><span><strong>{item.name}</strong><small>{item.club ?? "Vereinslos"} · {item.nationality ?? "–"}</small></span>{selected && <Check size={12} />}</Button>;
}

function NumberInput({ label, value, onChange, maximum, minimum = 0, disabled = false }: { label: string; value: number; onChange: (value: number) => void; maximum: number; minimum?: number; disabled?: boolean }) {
  return <label><span>{label}</span><NumberField aria-label={label} value={value} minValue={minimum} maxValue={maximum} isDisabled={disabled} onChange={onChange}><NumberField.Group><NumberField.Input /><NumberField.DecrementButton aria-label={`${label} verringern`}>−</NumberField.DecrementButton><NumberField.IncrementButton aria-label={`${label} erhöhen`}>+</NumberField.IncrementButton></NumberField.Group></NumberField></label>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return <Card><Card.Content><Icon size={16} /><div><span>{label}</span><strong>{value.toLocaleString("de-DE")}</strong></div></Card.Content></Card>;
}

function modeIcon(mode: Mode) {
  const Icon = mode === "staff" ? BriefcaseBusiness : mode === "registrations" ? BadgeCheck : mode === "languages" ? Languages : Link2;
  return <Icon size={14} />;
}
function modeLabel(mode: Mode) { return { staff: "Staff & Aufgaben", registrations: "Registrierungen", languages: "Sprachen", relationships: "Beziehungen" }[mode]; }
function toTarget(item: Player | Staff) { return { id: item.id, name: item.name, subtitle: [item.club, item.nationality].filter(Boolean).join(" · ") || "Person" }; }
function firstRelationshipTargetId(snapshot: DatabaseSnapshot | null | undefined, targetKind: RelationshipTargetKind, personKind: PersonKind, personId: string) {
  if (!snapshot) return "";
  const targets = targetKind === "player" ? snapshot.players : targetKind === "staff" ? snapshot.staff : snapshot.clubs;
  return targets.find((item) => !(targetKind === personKind && item.id === personId))?.id ?? "";
}
function relationshipTargetName(snapshot: DatabaseSnapshot, relationship: PersonRelationship) {
  const targets = relationship.target_kind === "player" ? snapshot.players : relationship.target_kind === "staff" ? snapshot.staff : snapshot.clubs;
  return targets.find((item) => item.id === relationship.target_id)?.name ?? relationship.target_id;
}
function toggle(values: string[], value: string) { return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]; }
function upsertLanguageList(values: LanguageSkill[], language: LanguageSkill) { const name = normalize(language.language); return [...values.filter((item) => normalize(item.language) !== name), language]; }
function normalize(value: string) { return value.trim().toLocaleLowerCase("de"); }
function searchable(item: Player | Staff) { return [item.name, item.club, item.nationality].filter(Boolean).join(" ").toLocaleLowerCase("de"); }
function initials(name: string) { return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toLocaleUpperCase("de"); }
function humanize(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("de")); }
function newId(prefix: string) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function defaultContractEnd(date: GameDate | null | undefined) { return date ? `${date.year + 4}-06-30` : ""; }
function defaultRegistrationEnd(date: GameDate | null | undefined) { return date ? `${date.year + 1}-06-30` : ""; }
function parseDate(value: string, label: string): GameDate { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); if (!match) throw new Error(`${label} ist ungültig`); return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }; }
function parseOptionalDate(value: string, label: string): GameDate | null { return value ? parseDate(value, label) : null; }
function formatInputDate(date: GameDate | null | undefined) { return date ? `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}` : null; }
function formatDate(date: GameDate) { return `${String(date.day).padStart(2, "0")}.${String(date.month).padStart(2, "0")}.${date.year}`; }
