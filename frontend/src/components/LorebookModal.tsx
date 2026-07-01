import { useRef } from "react";
import { LorebookEntry } from "../types";
import { Theme } from "../theme";
import { downloadJson, readJsonFile, parseLorebookJson } from "../io";

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
 * Lorebook / Memory editor. Each entry is a fact about the world or characters
 * that the backend injects into the model's context when one of its keywords
 * is mentioned (or always, if marked "constant"). This keeps long roleplays
 * consistent — names, relationships, locations, secrets — without bloating the
 * visible conversation.
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
    fontSize: 12,
    fontWeight: 600,
    color: theme.colors.textSecondary,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "7px 9px",
    fontSize: 13,
    fontFamily: "inherit",
    borderRadius: 6,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    color: theme.colors.textPrimary,
    boxSizing: "border-box",
  };

  const enabledCount = entries.filter((e) => e.enabled).length;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.colors.surface,
          borderRadius: 12,
          padding: 24,
          width: "90%",
          maxWidth: 720,
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: theme.colors.shadowLg,
          color: theme.colors.textPrimary,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 22 }}>📖 Lorebook / Memory</h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: theme.colors.textTertiary }}
          >
            ✕
          </button>
        </div>
        <p style={{ marginTop: 0, marginBottom: 16, fontSize: 13, color: theme.colors.textTertiary, lineHeight: 1.5 }}>
          Facts injected into the AI's context when a keyword is mentioned in recent messages. Use this for character
          backstories, relationships, locations, and world rules. Mark an entry <strong>Always</strong> to inject it
          every turn.
          {!connected && <span style={{ color: theme.colors.warning }}> Connect to apply changes live.</span>}
        </p>

        {/* Import / Export toolbar */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImport}
            style={{ display: "none" }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Import entries from a JSON file (SillyTavern world info supported)"
            style={{
              padding: "8px 14px",
              background: theme.colors.buttonSecondary,
              color: theme.colors.textPrimary,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            📥 Import JSON
          </button>
          <button
            onClick={handleExport}
            title="Download all entries as a JSON file"
            style={{
              padding: "8px 14px",
              background: theme.colors.buttonSecondary,
              color: theme.colors.textPrimary,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            📤 Export JSON
          </button>
          <span style={{ fontSize: 11, color: theme.colors.textTertiary, alignSelf: "center" }}>
            Imports are added to your current entries
          </span>
        </div>

        {entries.length === 0 && (
          <div style={{
            textAlign: "center",
            padding: "32px 16px",
            color: theme.colors.textTertiary,
            border: `1px dashed ${theme.colors.border}`,
            borderRadius: 10,
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🗂️</div>
            No memory entries yet. Add one to give your character lasting knowledge.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {entries.map((entry) => (
            <div
              key={entry.id}
              style={{
                border: `1px solid ${theme.colors.border}`,
                borderLeft: `4px solid ${entry.enabled ? theme.colors.secondary : theme.colors.buttonDisabled}`,
                borderRadius: 10,
                padding: 14,
                background: theme.colors.background,
                opacity: entry.enabled ? 1 : 0.6,
              }}
            >
              <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Title</label>
                  <input
                    type="text"
                    value={entry.title}
                    onChange={(e) => update(entry.id, { title: e.target.value })}
                    placeholder="e.g. Mia's backstory"
                    style={inputStyle}
                  />
                </div>
                <button
                  onClick={() => remove(entry.id)}
                  title="Delete entry"
                  style={{
                    alignSelf: "flex-end",
                    height: 33,
                    padding: "0 10px",
                    background: theme.colors.error,
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  🗑️
                </button>
              </div>

              <div style={{ marginBottom: 10, opacity: entry.constant ? 0.5 : 1 }}>
                <label style={labelStyle}>
                  Trigger keywords {entry.constant && "(ignored — entry is always on)"}
                </label>
                <input
                  type="text"
                  value={entry.keys}
                  onChange={(e) => update(entry.id, { keys: e.target.value })}
                  placeholder="comma, separated, keywords"
                  disabled={entry.constant}
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Content</label>
                <textarea
                  value={entry.content}
                  onChange={(e) => update(entry.id, { content: e.target.value })}
                  placeholder="The fact the AI should remember..."
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
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

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
          <span style={{ fontSize: 12, color: theme.colors.textTertiary }}>
            {entries.length} {entries.length === 1 ? "entry" : "entries"} · {enabledCount} active
          </span>
          <button
            onClick={add}
            style={{
              padding: "9px 16px",
              background: theme.colors.buttonPrimary,
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            ➕ Add Entry
          </button>
        </div>
      </div>
    </div>
  );
}
