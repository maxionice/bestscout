import { useMemo, useState } from "react";
import { Button, Card, Input, TextField } from "@heroui/react";
import { Check, ChevronDown, Crosshair, Search, Shield, Sparkles } from "lucide-react";

import type { RoleFamily, RolePhase, RoleProfile } from "./types";

const familyLabels: Record<RoleFamily, string> = {
  goalkeeper: "Tor",
  centre_back: "Innenverteidigung",
  full_back: "Außenverteidigung",
  wing_back: "Wing-Back",
  defensive_midfield: "Defensives Mittelfeld",
  central_midfield: "Zentrales Mittelfeld",
  attacking_midfield: "Offensives Mittelfeld",
  wide_midfield: "Äußeres Mittelfeld",
  winger: "Flügel",
  forward: "Angriff",
};

export function RoleExplorer({ roles, selectedRoleId, phase, onPhaseChange, onRoleChange }: {
  roles: RoleProfile[];
  selectedRoleId: string;
  phase: RolePhase;
  onPhaseChange: (phase: RolePhase) => void;
  onRoleChange: (roleId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  const selected = roles.find((role) => role.id === selectedRoleId);
  const counts = {
    in_possession: roles.filter((role) => role.phase === "in_possession").length,
    out_of_possession: roles.filter((role) => role.phase === "out_of_possession").length,
  };
  const visibleRoles = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("de");
    return roles.filter((role) => role.phase === phase && (
      !needle || role.name.toLocaleLowerCase("de").includes(needle)
      || familyLabels[role.family].toLocaleLowerCase("de").includes(needle)
    ));
  }, [phase, query, roles]);

  return (
    <Card className="role-explorer" role="region" aria-label="FM26-Rollenprofil wählen">
      <Card.Header className="role-explorer-head">
        <div className="role-current">
          <span className={`role-phase-icon ${phase}`}><Crosshair size={18} /></span>
          <div>
            <span className="eyebrow">AKTIVES ROLLENPROFIL</span>
            <strong>{selected?.name ?? "Rolle wird geladen …"}</strong>
            <small>{selected ? familyLabels[selected.family] : "FM26-Katalog"} · erklärbare 0–100-Wertung</small>
          </div>
        </div>
        <div className="role-phase-switch" aria-label="Spielphase">
          <Button size="sm" variant={phase === "in_possession" ? "primary" : "secondary"} onPress={() => onPhaseChange("in_possession")}>
            <Sparkles size={14} /> Mit Ball <span>{counts.in_possession}</span>
          </Button>
          <Button size="sm" variant={phase === "out_of_possession" ? "primary" : "secondary"} onPress={() => onPhaseChange("out_of_possession")}>
            <Shield size={14} /> Gegen den Ball <span>{counts.out_of_possession}</span>
          </Button>
          <Button size="sm" variant="ghost" aria-expanded={open} onPress={() => setOpen((current) => !current)}>
            {open ? "Schließen" : "Rolle wählen"}<ChevronDown className={open ? "chevron-open" : ""} size={14} />
          </Button>
        </div>
      </Card.Header>
      {open && (
        <Card.Content className="role-explorer-content">
          <TextField aria-label="Rollen durchsuchen" value={query} onChange={setQuery} className="role-search-field">
            <Search className="search-icon" size={15} />
            <Input placeholder="Rolle oder Positionsgruppe …" />
          </TextField>
          <div className="role-grid" role="group" aria-label={phase === "in_possession" ? "Rollen mit Ball" : "Rollen gegen den Ball"}>
            {visibleRoles.map((role) => (
              <Button
                key={role.id}
                variant={role.id === selectedRoleId ? "secondary" : "ghost"}
                className={`role-option ${role.id === selectedRoleId ? "selected" : ""}`}
                aria-pressed={role.id === selectedRoleId}
                onPress={() => onRoleChange(role.id)}
              >
                <span><strong>{role.name}</strong><small>{familyLabels[role.family]} · {Object.keys(role.weights).length} Attribute</small></span>
                {role.id === selectedRoleId && <Check size={15} />}
              </Button>
            ))}
            {visibleRoles.length === 0 && <div className="role-empty">Keine passende Rolle in dieser Phase.</div>}
          </div>
        </Card.Content>
      )}
    </Card>
  );
}
