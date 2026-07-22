import { useMemo, useState } from "react";
import { Button, Card, Input, TextField } from "@heroui/react";
import { invoke } from "@tauri-apps/api/core";
import {
  Check, FileImage, FolderInput, Images, RefreshCw, ShieldCheck, Trash2, Users,
} from "lucide-react";

import type {
  DatabaseSnapshot, FacepackFilesystemRequest, FacepackPreview, InstalledFacepack,
  RemovedFacepack,
} from "./types";

export type FacepackGateway = {
  preview: (snapshot: DatabaseSnapshot, request: FacepackFilesystemRequest) => Promise<FacepackPreview>;
  install: (
    snapshot: DatabaseSnapshot,
    request: FacepackFilesystemRequest,
    expectedPlanHash: string,
  ) => Promise<InstalledFacepack>;
  remove: (destinationRoot: string, packId: string) => Promise<RemovedFacepack>;
};

const tauriGateway: FacepackGateway = {
  preview: (snapshot, request) => invoke("preview_facepack", { snapshot, request }),
  install: (snapshot, request, expectedPlanHash) => invoke("install_facepack", {
    snapshot, request, expectedPlanHash,
  }),
  remove: (destinationRoot, packId) => invoke("remove_facepack", { destinationRoot, packId }),
};

export function FacepackWorkspace({
  snapshot, gateway = tauriGateway,
}: {
  snapshot: DatabaseSnapshot | null;
  gateway?: FacepackGateway;
}) {
  const [sourceDirectory, setSourceDirectory] = useState("");
  const [destinationRoot, setDestinationRoot] = useState("");
  const [packId, setPackId] = useState("career-newgens");
  const [seed, setSeed] = useState("career-1");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<FacepackPreview | null>(null);
  const [installed, setInstalled] = useState<InstalledFacepack | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeArmed, setRemoveArmed] = useState(false);
  const [message, setMessage] = useState("Ordner und eindeutig bestätigte Newgens auswählen.");
  const [error, setError] = useState("");

  const eligiblePlayers = useMemo(
    () => snapshot?.players.filter((player) => /^(?:r-)?\d{1,20}$/.test(player.id)) ?? [],
    [snapshot],
  );
  const request: FacepackFilesystemRequest = {
    source_directory: sourceDirectory.trim(),
    destination_root: destinationRoot.trim(),
    plan: {
      pack_id: packId.trim(),
      selected_player_ids: selectedIds,
      seed,
      confirm_newgens: confirmed,
    },
  };

  function invalidate() {
    setPreview(null);
    setInstalled(null);
    setRemoveArmed(false);
    setError("");
  }

  function togglePlayer(playerId: string) {
    invalidate();
    setSelectedIds((current) => current.includes(playerId)
      ? current.filter((item) => item !== playerId)
      : [...current, playerId]);
  }

  async function prepare() {
    if (!snapshot) return;
    setBusy(true);
    setError("");
    setInstalled(null);
    try {
      const next = await gateway.preview(snapshot, request);
      setPreview(next);
      setMessage(`${next.plan.assignments.length} eindeutige Zuordnungen konfliktfrei vorbereitet.`);
    } catch (reason) {
      setPreview(null);
      setError(`Vorschau fehlgeschlagen: ${String(reason)}`);
    } finally {
      setBusy(false);
    }
  }

  async function install() {
    if (!snapshot || !preview) return;
    setBusy(true);
    setError("");
    try {
      const result = await gateway.install(snapshot, request, preview.plan.plan_hash);
      setInstalled(result);
      setMessage(`${result.assignment_count} Gesichter atomar installiert und per Manifest geschützt.`);
    } catch (reason) {
      setInstalled(null);
      setError(`Installation fehlgeschlagen: ${String(reason)}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!removeArmed) {
      setRemoveArmed(true);
      setMessage("Entfernung erneut bestätigen. Geänderte oder fremde Dateien werden niemals gelöscht.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await gateway.remove(destinationRoot.trim(), packId.trim());
      setInstalled(null);
      setPreview(null);
      setRemoveArmed(false);
      setMessage(`${result.removed_file_count} verifizierte BestScout-Dateien sicher entfernt.`);
    } catch (reason) {
      setError(`Entfernung verweigert: ${String(reason)}`);
    } finally {
      setBusy(false);
    }
  }

  if (!snapshot) {
    return <Card className="facepack-empty"><Card.Content>Kein kanonischer Snapshot geladen.</Card.Content></Card>;
  }

  return <div className="facepack-workspace">
    <Card className="facepack-hero">
      <Card.Header>
        <div className="facepack-heading"><span><Images size={22} /></span><div><span className="eyebrow">LOKAL · DETERMINISTISCH · RÜCKNEHMBAR</span><Card.Title>Newgen Facepack Studio</Card.Title><Card.Description>Vorhandene Portraits konfliktfrei zu FM-UIDs zuordnen – ohne Bilder hochzuladen.</Card.Description></div></div>
        <div className="facepack-safety"><ShieldCheck size={17} /><div><strong>Keine Savegame-Mutation</strong><span>Vorschau · Hashes · Manifest · exakte Entfernung</span></div></div>
      </Card.Header>
      <Card.Content><span>SCHEMA 1 · {eligiblePlayers.length} NUMERISCHE UIDs</span><span className={error ? "error" : ""}>{error || message}</span></Card.Content>
    </Card>

    <div className="facepack-layout">
      <Card className="facepack-setup-card">
        <Card.Header><div><Card.Title>01 · Paket konfigurieren</Card.Title><Card.Description>Quelle bleibt unverändert; Ziel muss frei sein.</Card.Description></div><FolderInput size={17} /></Card.Header>
        <Card.Content>
          <TextField aria-label="Facepack-Bildordner" value={sourceDirectory} onChange={(value) => { setSourceDirectory(value); invalidate(); }}><span>Bildordner (PNG/JPG)</span><Input placeholder="/home/maxi/Bilder/newgen-faces" /></TextField>
          <TextField aria-label="Facepack-Zielordner" value={destinationRoot} onChange={(value) => { setDestinationRoot(value); invalidate(); }}><span>Zielwurzel für FM-Grafiken</span><Input placeholder="…/Football Manager 2026/graphics" /></TextField>
          <div className="facepack-input-row">
            <TextField aria-label="Facepack-Paket-ID" value={packId} onChange={(value) => { setPackId(value); invalidate(); }}><span>Paket-ID</span><Input /></TextField>
            <TextField aria-label="Facepack-Zuordnungsschlüssel" value={seed} onChange={(value) => { setSeed(value); invalidate(); }}><span>Zuordnungsschlüssel</span><Input /></TextField>
          </div>
          <div className="facepack-proof"><ShieldCheck size={16} /><span>Nur reguläre, nicht verlinkte Bilder bis 32 MiB. Doppelte Inhalte und überlappende Ordner werden abgelehnt.</span></div>
        </Card.Content>
      </Card>

      <Card className="facepack-player-card">
        <Card.Header><div><Card.Title>02 · Newgens bestätigen</Card.Title><Card.Description>{selectedIds.length} von {eligiblePlayers.length} ausgewählt</Card.Description></div><Users size={17} /></Card.Header>
        <Card.Content>
          <div className="facepack-player-actions"><Button variant="secondary" isDisabled={busy || eligiblePlayers.length === 0} onPress={() => { invalidate(); setSelectedIds(eligiblePlayers.map((player) => player.id)); }}>Alle numerischen UIDs</Button><Button variant="ghost" isDisabled={busy || selectedIds.length === 0} onPress={() => { invalidate(); setSelectedIds([]); }}>Leeren</Button></div>
          <div className="facepack-player-list">
            {eligiblePlayers.map((player) => <Button key={player.id} aria-label={`Newgen auswählen ${player.name}`} aria-pressed={selectedIds.includes(player.id)} variant={selectedIds.includes(player.id) ? "primary" : "secondary"} isDisabled={busy} onPress={() => togglePlayer(player.id)}><span className="facepack-player-check">{selectedIds.includes(player.id) && <Check size={12} />}</span><span><strong>{player.name}</strong><small>{player.id} · {player.club ?? "Vereinslos"}</small></span></Button>)}
            {eligiblePlayers.length === 0 && <div className="facepack-player-empty">Der aktuelle Snapshot enthält keine numerischen FM-UIDs.</div>}
          </div>
          <label className="facepack-confirm"><input aria-label="Auswahl ausdrücklich als Newgens bestätigen" type="checkbox" checked={confirmed} onChange={(event) => { setConfirmed(event.target.checked); invalidate(); }} /><span><strong>Diese Auswahl besteht ausschließlich aus Newgens</strong><small>BestScout leitet das niemals nur aus Alter oder UID-Höhe ab.</small></span></label>
          <Button className="w-full" isDisabled={busy || !confirmed || selectedIds.length === 0 || !sourceDirectory.trim() || !destinationRoot.trim()} onPress={prepare}>{busy ? <RefreshCw className="spin" size={15} /> : <FileImage size={15} />} Exakte Zuordnungsvorschau</Button>
        </Card.Content>
      </Card>

      <Card className="facepack-preview-card">
        <Card.Header><div><Card.Title>03 · Vorschau & Aktivierung</Card.Title><Card.Description>Keine Überschreibung bestehender Ordner</Card.Description></div><FileImage size={17} /></Card.Header>
        <Card.Content>
          {preview ? <>
            <div className="facepack-preview-proof"><Check size={16} /><div><strong>{preview.plan.assignments.length} Zuordnungen validiert</strong><span>{preview.plan.unused_image_count} Bilder bleiben unbenutzt · {preview.plan.plan_hash.slice(0, 16)}…</span></div></div>
            <div className="facepack-assignment-list" role="grid" aria-label="Facepack-Zuordnungen">
              <div className="facepack-assignment-head" role="row"><span>Newgen</span><span>Quelldatei</span><span>FM-Ziel</span></div>
              {preview.plan.assignments.slice(0, 200).map((assignment) => <div key={assignment.player_id} className="facepack-assignment" role="row"><span><strong>{assignment.player_name}</strong><small>{assignment.player_id}</small></span><code>{assignment.source_name}</code><code>{assignment.target_id}</code></div>)}
              {preview.plan.assignments.length > 200 && <div className="facepack-more">Weitere {preview.plan.assignments.length - 200} Zuordnungen sind im Plan enthalten.</div>}
            </div>
            <code className="facepack-target">{preview.target_directory}</code>
            <Button className="w-full" isDisabled={busy || Boolean(installed)} onPress={install}><ShieldCheck size={15} /> {installed ? "Manifestgeschützt installiert" : "Atomar installieren"}</Button>
          </> : <div className="facepack-preview-empty"><Images size={24} /><strong>Noch keine Vorschau</strong><span>Erst die explizite Auswahl und die Bilddateien werden vollständig validiert.</span></div>}
          <div className="facepack-remove"><div><Trash2 size={15} /><span><strong>Verifiziert entfernen</strong><small>Nur ein vollständig unverändertes BestScout-Manifest wird gelöscht.</small></span></div><Button variant={removeArmed ? "danger" : "secondary"} isDisabled={busy || !destinationRoot.trim() || !packId.trim()} onPress={remove}>{removeArmed ? "Entfernung bestätigen" : "Paket entfernen"}</Button></div>
        </Card.Content>
      </Card>
    </div>
  </div>;
}
