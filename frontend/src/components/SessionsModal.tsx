import { useEffect, useState } from "react";
import { Theme } from "../theme";
import { SessionSummary } from "../types";
import { IconX, IconSave, IconTrash, IconFolder, IconRefresh } from "./Icons";

const API = "http://127.0.0.1:8000/api/sessions";

interface SessionsModalProps {
  show: boolean;
  theme: Theme;
  onClose: () => void;
  /** Called with the session payload of a library entry the user opens. */
  onLoadSession: (session: any) => void;
  /** Builds the current session snapshot for saving. */
  buildSession: () => any;
}

/**
 * Story library — server-side saved sessions. Save the current story with a
 * name, browse what's shelved, reopen or delete entries. Stored under the
 * backend's user_data folder, so stories survive browser storage resets.
 */
export function SessionsModal({ show, theme, onClose, onLoadSession, buildSession }: SessionsModalProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(API);
      const data = await res.json();
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch (e) {
      console.error("Failed to list sessions:", e);
      setError("Could not reach the backend. Is the server running?");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (show) refresh();
  }, [show]);

  if (!show) return null;

  const saveCurrent = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: buildSession(), name: name.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setName("");
      await refresh();
    } catch (e) {
      console.error("Failed to save session:", e);
      setError("Saving failed. Check the backend logs.");
    } finally {
      setSaving(false);
    }
  };

  const open = async (id: string) => {
    setError("");
    try {
      const res = await fetch(`${API}/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const record = await res.json();
      onLoadSession(record.session);
      onClose();
    } catch (e) {
      console.error("Failed to load session:", e);
      setError("Could not open that story.");
    }
  };

  const remove = async (id: string, sessionName: string) => {
    if (!window.confirm(`Delete "${sessionName}" from the library? There is no undo.`)) return;
    try {
      await fetch(`${API}/${encodeURIComponent(id)}`, { method: "DELETE" });
      await refresh();
    } catch (e) {
      console.error("Failed to delete session:", e);
    }
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 620, maxWidth: "92vw", maxHeight: "84vh" }}
      >
        {/* Header */}
        <div style={{
          padding: "14px 18px",
          borderBottom: `1px solid ${theme.colors.border}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <IconFolder size={17} style={{ color: theme.colors.primary }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: theme.colors.textPrimary }}>Story library</div>
            <div style={{ fontSize: 11.5, color: theme.colors.textTertiary }}>
              Saved on this machine, in the app's data folder
            </div>
          </div>
          <button className="icon-btn" onClick={refresh} title="Refresh list" disabled={loading}>
            <IconRefresh size={15} className={loading ? "spin" : undefined} />
          </button>
          <button className="icon-btn" onClick={onClose} title="Close">
            <IconX size={16} />
          </button>
        </div>

        {/* Save current */}
        <div style={{
          padding: "12px 18px",
          borderBottom: `1px solid ${theme.colors.border}`,
          display: "flex",
          gap: 8,
        }}>
          <input
            type="text"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !saving) saveCurrent(); }}
            placeholder="Name this story… (optional)"
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={saveCurrent} disabled={saving}>
            <IconSave size={14} /> {saving ? "Saving…" : "Save current story"}
          </button>
        </div>

        {/* List */}
        <div style={{ overflowY: "auto", padding: "10px 12px", flex: 1 }}>
          {error && (
            <div style={{
              margin: "6px 6px 10px",
              padding: "9px 12px",
              borderRadius: 9,
              background: theme.colors.errorLight,
              color: theme.colors.textPrimary,
              fontSize: 12.5,
            }}>
              {error}
            </div>
          )}
          {sessions.length === 0 && !loading && !error ? (
            <div style={{ textAlign: "center", padding: "38px 20px", color: theme.colors.textTertiary }}>
              <div style={{ fontFamily: theme.fonts.prose, fontStyle: "italic", fontSize: 16, marginBottom: 6, color: theme.colors.textSecondary }}>
                The shelves are empty.
              </div>
              <div style={{ fontSize: 12.5 }}>Save the current story above and it will appear here.</div>
            </div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => open(s.id)}
                title="Open this story (replaces the current one)"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 10px",
                  borderRadius: 12,
                  cursor: "pointer",
                  border: "1px solid transparent",
                  transition: "background 0.13s ease, border-color 0.13s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = theme.colors.buttonSecondary;
                  e.currentTarget.style.borderColor = theme.colors.border;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderColor = "transparent";
                }}
              >
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 11,
                  flexShrink: 0,
                  background: `color-mix(in srgb, ${theme.colors.secondary} 14%, transparent)`,
                  color: theme.colors.secondary,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: theme.fonts.prose,
                  fontSize: 16,
                  fontWeight: 600,
                }}>
                  {(s.character || s.name || "?").trim().charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: theme.colors.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.name}
                    </span>
                    <span className="meta-mono" style={{ whiteSpace: "nowrap" }}>
                      {s.message_count} msgs · {fmtDate(s.saved_at)}
                    </span>
                  </div>
                  {s.preview && (
                    <div style={{
                      fontSize: 12,
                      color: theme.colors.textTertiary,
                      fontFamily: theme.fonts.prose,
                      fontStyle: "italic",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      marginTop: 2,
                    }}>
                      {s.preview}
                    </div>
                  )}
                </div>
                <button
                  className="icon-btn sm danger"
                  onClick={(e) => { e.stopPropagation(); remove(s.id, s.name); }}
                  title="Delete from library"
                >
                  <IconTrash size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
