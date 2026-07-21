export type Player = {
  id: string;
  name: string;
  age: number | null;
  club: string | null;
  nationality: string | null;
  positions: string[];
  preferred_foot: "left" | "right" | "both" | "unknown";
  value: number | null;
  wage: number | null;
  current_ability: number | null;
  potential_ability: number | null;
  attributes: Record<string, number>;
};

export type ImportResult = {
  players: Player[];
  warnings: string[];
  delimiter: string;
};

export type LiveEnvironment = {
  installations: Array<{
    root: string;
    executable: string;
    game_assembly: string;
    fingerprint: { sha256: string; size: number } | null;
  }>;
  processes: Array<{ pid: number; command: string }>;
  editor_allowed: boolean;
  message: string;
};
