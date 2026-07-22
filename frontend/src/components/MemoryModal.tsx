import React from "react";
import { MemoryState } from "../types";
import { Theme } from "../theme";
import { downloadText } from "../io";
import { IconX, IconBrain, IconRefresh, IconTrash, IconDownload } from "./Icons";

interface MemoryModalProps {
  show: boolean;
  memory: MemoryState;
  busy: boolean;
  connected: boolean;
  theme: Theme;
  onClose: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onToggleAuto: (auto: boolean) => void;
  onKeepRecentChange: (turns: number) => void;
  onTriggerChange: (turns: number) => void;
  onSummaryChange: (summary: string) => void;
  onSummaryCommit: () => void;
  onSummarizeNow: () => void;
  onForget: () => void;
}

/**
 * Story memory — the model's long-term recall for a conversation that has grown
 * past its context window. Older turns are folded into the record shown here and
 * sent as a single "story so far" block, while the most recent exchanges still
 * go out word for word. The record is the model's, but it is yours to edit:
 * correcting a line here corrects what the character believes happened.
 */
export function MemoryModal({
  show,
  memory,
  busy,
  connected,
  theme,
  onClose,
  onToggleEnabled,
  onToggleAuto,
  onKeepRecentChange,
  onTriggerChange,
  onSummaryChange,
  onSummaryCommit,
  onSummarizeNow,
  onForget,
}: MemoryModalProps) {
  if (!show) return null;

  const verbatim = Math.max(0, memory.total - memory.covered);
  const words = memory.summary.trim() ? memory.summary.trim().split(/\s+/).length : 0;

  const handleForget = () => {
    if (!memory.summary.trim() || window.confirm("Forget the story so far? The conversation stays; only the model's long-term record is erased.")) {
      onForget();
    }
  };

  const handleExport = () => {
    if (!memory.summary.trim()) {
      alert("There is nothing remembered yet.");
      return;
    }
    downloadText(`story-memory-${new Date().toISOString().slice(0, 10)}.md`, `# Story so far\n\n${memory.summary.trim()}\n`);
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 4,
    fontSize: 11.5,
    fontWeight: 500,
    color: theme.colors.textSecondary,
  };

  const checkboxRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    cursor: "pointer",
    color: theme.colors.textSecondary,
  };

  const Stat = ({ value, label }: { value: React.ReactNode; label: string }) => (
    <div style={{ flex: 1, minWidth: 96 }}>
      <div style={{ fontSize: 19, fontWeight: 600, color: theme.colors.textPrimary, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 11, color: theme.colors.textTertiary, marginTop: 2 }}>{label}</div>
    </div>
  );

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
          <IconBrain size={17} style={{ color: theme.colors.primary }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: theme.colors.textPrimary }}>Story memory</div>
            <div style={{ fontSize: 11.5, color: theme.colors.textTertiary }}>
              What the character still remembers once the conversation outgrows its context
              {!connected && <span style={{ color: theme.colors.warning }}> · connect to apply changes live</span>}
            </div>
          </div>
          <button
            className="btn btn-quiet"
            onClick={handleExport}
            title="Save the record as a Markdown file"
            style={{ padding: "5px 10px", fontSize: 12 }}
          >
            <IconDownload size={13} /> Export
          </button>
          <button className="icon-btn" onClick={onClose} title="Close">
            <IconX size={16} />
          </button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
          {/* At-a-glance: how the current conversation is being spent */}
          <div style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            padding: "14px 16px",
            borderRadius: 12,
            background: theme.colors.field,
            border: `1px solid ${theme.colors.border}`,
            marginBottom: 16,
          }}>
            <Stat value={memory.covered} label="messages remembered" />
            <Stat value={verbatim} label="sent word for word" />
            <Stat value={memory.pending} label="waiting to be folded in" />
            <Stat
              value={busy ? "…" : words || "—"}
              label={busy ? "remembering now" : "words in the record"}
            />
          </div>

          {/* Controls */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginBottom: 16 }}>
            <label style={checkboxRow}>
              <input
                type="checkbox"
                checked={memory.enabled}
                onChange={(e) => onToggleEnabled(e.target.checked)}
              />
              Keep a long-term memory
            </label>
            <label style={{ ...checkboxRow, opacity: memory.enabled ? 1 : 0.5 }}>
              <input
                type="checkbox"
                checked={memory.auto}
                disabled={!memory.enabled}
                onChange={(e) => onToggleAuto(e.target.checked)}
              />
              Update it on its own
            </label>
          </div>

          <div style={{ display: "flex", gap: 14, marginBottom: 18, opacity: memory.enabled ? 1 : 0.5 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Recent messages kept word for word: {memory.keepRecent}</label>
              <input
                type="range"
                min={4}
                max={40}
                step={2}
                value={memory.keepRecent}
                disabled={!memory.enabled}
                onChange={(e) => onKeepRecentChange(Number(e.target.value))}
                style={{ width: "100%" }}
              />
              <div style={{ fontSize: 11, color: theme.colors.textTertiary, marginTop: 2 }}>
                Everything older is represented by the record instead.
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Remember after every {memory.trigger} older messages</label>
              <input
                type="range"
                min={4}
                max={60}
                step={2}
                value={memory.trigger}
                disabled={!memory.enabled}
                onChange={(e) => onTriggerChange(Number(e.target.value))}
                style={{ width: "100%" }}
              />
              <div style={{ fontSize: 11, color: theme.colors.textTertiary, marginTop: 2 }}>
                Larger means fewer summarization passes, so less background work.
              </div>
            </div>
          </div>

          {/* The record itself */}
          <label style={labelStyle}>The story so far</label>
          {memory.summary.trim() ? (
            <textarea
              className="input"
              value={memory.summary}
              onChange={(e) => onSummaryChange(e.target.value)}
              onBlur={onSummaryCommit}
              rows={14}
              spellCheck={false}
              style={{
                width: "100%",
                resize: "vertical",
                lineHeight: 1.6,
                fontSize: 13,
                fontFamily: theme.fonts.prose,
              }}
            />
          ) : (
            <div style={{
              textAlign: "center",
              padding: "36px 16px",
              color: theme.colors.textTertiary,
              border: `1px dashed ${theme.colors.border}`,
              borderRadius: 12,
            }}>
              <div style={{ fontFamily: theme.fonts.prose, fontStyle: "italic", fontSize: 16, marginBottom: 6, color: theme.colors.textSecondary }}>
                {busy ? "Reading back over the story…" : "Nothing has scrolled out of reach yet."}
              </div>
              <div style={{ fontSize: 12.5 }}>
                Once the story grows past the recent window, its earlier events are gathered here —
                and the character keeps them even after the messages themselves stop being sent.
              </div>
            </div>
          )}
          <div style={{ fontSize: 11, color: theme.colors.textTertiary, marginTop: 6 }}>
            Written by the model, edited by you — a correction here changes what the character believes happened.
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px",
          borderTop: `1px solid ${theme.colors.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}>
          <span className="meta-mono">
            {memory.covered} of {memory.total} messages remembered
            {busy && " · remembering…"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-quiet"
              onClick={handleForget}
              disabled={!connected || busy || !memory.summary.trim()}
              title="Erase the record without touching the conversation"
            >
              <IconTrash size={14} /> Forget
            </button>
            <button
              className="btn btn-primary"
              onClick={onSummarizeNow}
              disabled={!connected || busy || !memory.enabled}
              title="Fold everything older than the recent window into the record now"
            >
              <IconRefresh size={14} className={busy ? "spin" : undefined} /> {busy ? "Remembering…" : "Remember now"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
