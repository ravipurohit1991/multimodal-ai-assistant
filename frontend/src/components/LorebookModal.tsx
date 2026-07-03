import { useRef } from "react";
import { LorebookEntry } from "../types";
import { Theme } from "../theme";
import { downloadJson, readJsonFile, parseLorebookJson } from "../io";
import { IconX, IconBookOpen, IconUpload, IconDownload, IconTrash, IconPlus } from "./Icons";

interface LorebookModalProps {
  show: boolean;
  entries: LorebookEntry[];
  connected: boolean;
  theme: Theme;
  onClose: () => void;
  onChange: (entries: LorebookEntry[]) => void;
}

function newEntry(): LorebookEntry {
  return {
    id: `lore_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: "",
    keys: "",
    content: "",
    enabled: true,
    constant: false,
  };
}

/**
 * Lorebook / world info editor. Each entry is a fact about the world or
 * characters that the backend injects into the model's context when one of
 * its keywords appears (or always, if marked "Always inject"). Keeps long
 * roleplays consistent without bloating the visible conversation.
 */
export function LorebookModal({
  show,
  entries,
  connected,
  theme,
  onClose,
  onChange,
}: LorebookModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!show) return null;

  const update = (id: string, patch: Partial<LorebookEntry>) => {
    onChange(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const remove = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  const add = () => {
    onChange([...entries, newEntry()]);
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-importing the same file
    if (!file) return;
    try {
      const data = await readJsonFile(file);
      const imported = parseLorebookJson(data);
      if (imported.length === 0) {
        alert("No usable entries found in that file.");
        return;
      }
      onChange([...entries, ...imported]);
      alert(`Imported ${imported.length} ${imported.length === 1 ? "entry" : "entries"} from "${file.name}".`);
    } catch (err) {
      console.error("Lorebook import failed:", err);
      alert("Could not read that file. Make sure it is a valid lorebook JSON.");
    }
  };

  const handleExport = () => {
    if (entries.length === 0) {
      alert("There are no entries to export yet.");
      return;
    }
    downloadJson("lorebook.json", { type: "aiassistant_lorebook", version: 1, entries });
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 4,
    fontSize: 11.5,
    fontWeight: 500,
    color: theme.colors.textSecondary,
  };

  const enabledCount = entries.filter((e) => e.enabled).length;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 720, maxWidth: "92vw", maxHeight: "88vh" }}
      >
        {/* Header */}
        <div style={{
          padding: "14px 20px",
          borderBottom: `1px solid ${theme.colors.border}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <IconBookOpen size={17} style={{ color: theme.colors.primary }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: theme.colors.textPrimary }}>Lorebook</div>
            <div style={{ fontSize: 11.5, color: theme.colors.textTertiary }}>
              Facts the model remembers when their keywords come up
              {!connected && <span style={{ color: theme.colors.warning }}> · connect to apply changes live</span>}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImport}
            style={{ display: "none" }}
          />
          <button
            className="btn btn-quiet"
            onClick={() => fileInputRef.current?.click()}
            title="Import entries from a JSON file (SillyTavern world info supported)"
            style={{ padding: "5px 10px", fontSize: 12 }}
          >
            <IconUpload size={13} /> Import
          </button>
          <button
            className="btn btn-quiet"
            onClick={handleExport}
            title="Download all entries as a JSON file"
            style={{ padding: "5px 10px", fontSize: 12 }}
          >
            <IconDownload size={13} /> Export
          </button>
          <button className="icon-btn" onClick={onClose} title="Close">
            <IconX size={16} />
          </button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
          {entries.length === 0 && (
            <div style={{
              textAlign: "center",
              padding: "36px 16px",
              color: theme.colors.textTertiary,
              border: `1px dashed ${theme.colors.border}`,
              borderRadius: 12,
            }}>
              <div style={{ fontFamily: theme.fonts.prose, fontStyle: "italic", fontSize: 16, marginBottom: 6, color: theme.colors.textSecondary }}>
                Nothing written in the margins yet.
              </div>
              <div style={{ fontSize: 12.5 }}>
                Add backstories, relationships, places and world rules — the model recalls them when they matter.
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {entries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  border: `1px solid ${theme.colors.border}`,
                  borderLeft: `3px solid ${entry.enabled ? theme.colors.secondary : theme.colors.buttonDisabled}`,
                  borderRadius: 12,
                  padding: 14,
                  background: theme.colors.field,
                  opacity: entry.enabled ? 1 : 0.6,
                }}
              >
                <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-end" }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Title</label>
                    <input
                      type="text"
                      className="input"
                      value={entry.title}
                      onChange={(e) => update(entry.id, { title: e.target.value })}
                      placeholder="e.g. Mia's backstory"
                      style={{ width: "100%" }}
                    />
                  </div>
                  <button className="icon-btn danger" onClick={() => remove(entry.id)} title="Delete entry">
                    <IconTrash size={15} />
                  </button>
                </div>

                <div style={{ marginBottom: 10, opacity: entry.constant ? 0.55 : 1 }}>
                  <label style={labelStyle}>
                    Trigger keywords {entry.constant && "(ignored — entry is always on)"}
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={entry.keys}
                    onChange={(e) => update(entry.id, { keys: e.target.value })}
                    placeholder="comma, separated, keywords"
                    disabled={entry.constant}
                    style={{ width: "100%" }}
                  />
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={labelStyle}>Content</label>
                  <textarea
                    className="input"
                    value={entry.content}
                    onChange={(e) => update(entry.id, { content: e.target.value })}
                    placeholder="The fact the model should remember…"
                    rows={3}
                    style={{ width: "100%", resize: "vertical", lineHeight: 1.5 }}
                  />
                </div>

                <div style={{ display: "flex", gap: 18 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", color: theme.colors.textSecondary }}>
                    <input
                      type="checkbox"
                      checked={entry.enabled}
                      onChange={(e) => update(entry.id, { enabled: e.target.checked })}
                    />
                    Enabled
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", color: theme.colors.textSecondary }}>
                    <input
                      type="checkbox"
                      checked={entry.constant}
                      onChange={(e) => update(entry.id, { constant: e.target.checked })}
                    />
                    Always inject
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px",
          borderTop: `1px solid ${theme.colors.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <span className="meta-mono">
            {entries.length} {entries.length === 1 ? "entry" : "entries"} · {enabledCount} active
          </span>
          <button className="btn btn-primary" onClick={add}>
            <IconPlus size={14} /> Add entry
          </button>
        </div>
      </div>
    </div>
  );
}
