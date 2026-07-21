import { useMemo, useState } from "react";
import { Button, Card, Input, TextField } from "@heroui/react";
import { Bookmark, Check, Columns3, Save, Search, Trash2 } from "lucide-react";

import { playerColumns, type SavedPlayerView } from "./view-preferences";

export function ViewToolbar({ savedViews, activeViewId, visibleColumns, onApply, onDelete, onReset, onSave, onVisibleColumnsChange }: {
  savedViews: SavedPlayerView[];
  activeViewId: string | null;
  visibleColumns: string[];
  onApply: (view: SavedPlayerView) => void;
  onDelete: (viewId: string) => void;
  onReset: () => void;
  onSave: (name: string) => void;
  onVisibleColumnsChange: (columns: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [columnQuery, setColumnQuery] = useState("");
  const filteredColumns = useMemo(() => {
    const needle = columnQuery.trim().toLocaleLowerCase("de");
    return playerColumns.filter((column) => !needle
      || column.label.toLocaleLowerCase("de").includes(needle)
      || column.category.toLocaleLowerCase("de").includes(needle));
  }, [columnQuery]);

  function toggleColumn(id: string) {
    const next = visibleColumns.includes(id)
      ? visibleColumns.filter((columnId) => columnId !== id)
      : [...visibleColumns, id];
    onVisibleColumnsChange(next);
  }

  function save() {
    if (!name.trim()) return;
    onSave(name);
    setName("");
  }

  return (
    <Card className="view-toolbar" role="region" aria-label="Gespeicherte Ansichten und Spalten">
      <Card.Header className="view-toolbar-head">
        <div className="saved-view-list">
          <Button size="sm" variant={activeViewId === null ? "secondary" : "ghost"} onPress={onReset}><Bookmark size={14} /> Standard</Button>
          {savedViews.map((view) => (
            <div className="saved-view" key={view.id}>
              <Button size="sm" variant={activeViewId === view.id ? "secondary" : "ghost"} onPress={() => onApply(view)}>{view.name}</Button>
              <Button isIconOnly size="sm" variant="ghost" aria-label={`Ansicht ${view.name} löschen`} onPress={() => onDelete(view.id)}><Trash2 size={13} /></Button>
            </div>
          ))}
        </div>
        <Button size="sm" variant={open ? "primary" : "secondary"} aria-expanded={open} onPress={() => setOpen((current) => !current)}>
          <Columns3 size={15} /> Spalten · {visibleColumns.length}
        </Button>
      </Card.Header>
      {open && (
        <Card.Content className="view-editor">
          <div className="view-save">
            <div><strong>Aktuelle Ansicht speichern</strong><span>Rolle, Phase, Filter und Spalten bleiben lokal erhalten.</span></div>
            <div className="view-save-controls">
              <TextField aria-label="Name der Ansicht" value={name} onChange={setName}><Input placeholder="z. B. U21-Spielmacher" /></TextField>
              <Button size="sm" isDisabled={!name.trim()} onPress={save}><Save size={14} /> Speichern</Button>
            </div>
          </div>
          <div className="column-picker-head">
            <div><strong>Tabellenspalten</strong><span>{playerColumns.length} Felder inklusive aller 47 FM26-Attribute</span></div>
            <TextField aria-label="Spalten durchsuchen" value={columnQuery} onChange={setColumnQuery} className="column-search">
              <Search className="search-icon" size={14} /><Input placeholder="Feld oder Gruppe …" />
            </TextField>
          </div>
          <div className="column-picker" role="group" aria-label="Sichtbare Tabellenspalten">
            {filteredColumns.map((column) => {
              const selected = column.locked || visibleColumns.includes(column.id);
              return (
                <Button key={column.id} size="sm" variant={selected ? "secondary" : "ghost"} className="column-option" aria-pressed={selected} isDisabled={column.locked} onPress={() => toggleColumn(column.id)}>
                  <span><strong>{column.label}</strong><small>{column.category}</small></span>{selected && <Check size={13} />}
                </Button>
              );
            })}
          </div>
        </Card.Content>
      )}
    </Card>
  );
}
