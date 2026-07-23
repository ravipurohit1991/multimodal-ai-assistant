import React, { useState } from "react";
import { CanonFact, ContinuityState } from "../types";
import { Theme } from "../theme";
import { downloadText } from "../io";
import {
  IconX, IconShield, IconTrash, IconPlus, IconPin, IconDownload, IconRefresh, IconBookOpen,
} from "./Icons";

interface CanonModalProps {
  show: boolean;
  continuity: ContinuityState;
  busy: boolean;
  connected: boolean;
  theme: Theme;
  onClose: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onToggleAuto: (auto: boolean) => void;
  onFactsChange: (facts: CanonFact[]) => void;
  onAddFact: (text: string) => void;
  onHarvest: () => void;
  onForget: () => void;
}

/**
 * The story's canon — every durable detail this story has established, and the
 * ledger the Continuity Guard checks each new reply against.
 *
 * The model writes most of it, but the record is yours: a line edited here
 * changes what is true, a pinned line can never be quietly revised away, and a
 * line deleted here stops being enforced. Pinning is how you say "this one
 * matters" — pinned facts always reach the model and are never evicted when the
 * ledger fills up.
 */
export function CanonModal({
  show,
  continuity,
  busy,
  connected,
  theme,
  onClose,
  onToggleEnabled,
  onToggleAuto,
  onFactsChange,
  onAddFact,
  onHarvest,
  onForget,
}: CanonModalProps) {
  const [draft, setDraft] = useState("");

  if (!show) return null;

  const facts = continuity.facts;
  const pinnedCount = facts.filter((f) => f.pinned).length;

  const update = (id: string, patch: Partial<CanonFact>) => {
    onFactsChange(facts.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const remove = (id: string) => onFactsChange(facts.filter((f) => f.id !== id));

  const submitDraft = () => {
    const text = draft.trim();
    if (!text) return;
    onAddFact(text);
    setDraft("");
  };

  const handleForget = () => {
    if (!facts.length || window.confirm("Forget everything the story established? The conversation stays; only the canon is erased.")) {
      onForget();
    }
  };

  const handleExport = () => {
    if (!facts.length) {
      alert("Nothing has been established yet.");
      return;
    }
    const body = facts
      .map((f) => `- ${f.subject ? `**${f.subject}** — ` : ""}${f.text}${f.pinned ? "  _(pinned)_" : ""}`)
      .join("\n");
    downloadText(`story-canon-${new Date().toISOString().slice(0, 10)}.md`, `# Story canon\n\n${body}\n`);
  };

  const checkboxRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    cursor: "pointer",
    color: theme.colors.textSecondary,
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 740, maxWidth: "92vw", maxHeight: "88vh" }}
      >
        {/* Header */}
        <div style={{
          padding: "14px 20px",
          borderBottom: `1px solid ${theme.colors.border}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <IconShield size={17} style={{ color: theme.colors.primary }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: theme.colors.textPrimary }}>Story canon</div>
            <div style={{ fontSize: 11.5, color: theme.colors.textTertiary }}>
              What this story has established — and what the guard holds every new reply to
              {!connected && <span style={{ color: theme.colors.warning }}> · connect to apply changes live</span>}
            </div>
          </div>
          <button
            className="btn btn-quiet"
            onClick={handleExport}
            title="Save the canon as a Markdown file"
            style={{ padding: "5px 10px", fontSize: 12 }}
          >
            <IconDownload size={13} /> Export
          </button>
          <button className="icon-btn" onClick={onClose} title="Close">
            <IconX size={16} />
          </button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
          {/* Controls */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginBottom: 14, alignItems: "center" }}>
            <label style={checkboxRow}>
              <input
                type="checkbox"
                checked={continuity.enabled}
                onChange={(e) => onToggleEnabled(e.target.checked)}
              />
              Guard the story's continuity
            </label>
            <label style={{ ...checkboxRow, opacity: continuity.enabled ? 1 : 0.5 }}>
              <input
                type="checkbox"
                checked={continuity.auto}
                disabled={!continuity.enabled}
                onChange={(e) => onToggleAuto(e.target.checked)}
              />
              Check every reply as it arrives
            </label>
            <span className="meta-mono" style={{ marginLeft: "auto" }}>
              {facts.length} fact{facts.length === 1 ? "" : "s"}
              {pinnedCount > 0 && ` · ${pinnedCount} pinned`}
            </span>
          </div>

          <div style={{
            fontSize: 11.5,
            color: theme.colors.textTertiary,
            lineHeight: 1.55,
            marginBottom: 16,
          }}>
            Every fact below is sent with each turn, so the character keeps it true. Checking costs
            one extra generation per reply — turn it off and use “Check now” if your hardware would
            rather not.
          </div>

          {/* Add a fact by hand — the user's own line in the record */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input
              className="input"
              value={draft}
              placeholder="Establish something yourself — “Mira's eyes are grey”"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitDraft(); }}
              style={{ flex: 1, fontSize: 13 }}
            />
            <button className="btn btn-quiet" onClick={submitDraft} disabled={!draft.trim()}>
              <IconPlus size={14} /> Add
            </button>
          </div>

          {/* The ledger */}
          {facts.length === 0 ? (
            <div style={{
              textAlign: "center",
              padding: "36px 16px",
              color: theme.colors.textTertiary,
              border: `1px dashed ${theme.colors.border}`,
              borderRadius: 12,
            }}>
              <div style={{ fontFamily: theme.fonts.prose, fontStyle: "italic", fontSize: 16, marginBottom: 6, color: theme.colors.textSecondary }}>
                {busy ? "Reading back over the story…" : "Nothing established yet."}
              </div>
              <div style={{ fontSize: 12.5, maxWidth: 460, margin: "0 auto", lineHeight: 1.6 }}>
                As the story establishes details, they are gathered here. Already deep into a story?
                Use “Read the story” below and the whole transcript is read at once.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {facts.map((fact) => (
                <div
                  key={fact.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 10,
                    background: theme.colors.field,
                    border: `1px solid ${fact.pinned ? `color-mix(in srgb, ${theme.colors.primary} 40%, transparent)` : theme.colors.border}`,
                  }}
                >
                  <button
                    className="icon-btn sm"
                    data-active={fact.pinned}
                    onClick={() => update(fact.id, { pinned: !fact.pinned })}
                    title={fact.pinned ? "Pinned — always sent, never revised on its own" : "Pin this fact"}
                    style={{ marginTop: 2 }}
                  >
                    <IconPin size={13} />
                  </button>
                  <input
                    className="input"
                    value={fact.subject}
                    placeholder="—"
                    onChange={(e) => update(fact.id, { subject: e.target.value })}
                    title="Who or what this is about"
                    style={{ width: 110, fontSize: 12, padding: "5px 8px", flexShrink: 0 }}
                  />
                  <input
                    className="input"
                    value={fact.text}
                    onChange={(e) => update(fact.id, { text: e.target.value })}
                    style={{ flex: 1, fontSize: 13, padding: "5px 8px", fontFamily: theme.fonts.prose }}
                  />
                  <button
                    className="icon-btn sm danger"
                    onClick={() => remove(fact.id)}
                    title="Stop holding the story to this"
                    style={{ marginTop: 2 }}
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {facts.length > 0 && (
            <div style={{ fontSize: 11, color: theme.colors.textTertiary, marginTop: 8 }}>
              Written by the model, edited by you — a correction here changes what the story is held to.
            </div>
          )}
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
            {continuity.enabled
              ? `guarding ${facts.length} fact${facts.length === 1 ? "" : "s"}`
              : "guard is off"}
            {busy && " · reading…"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-quiet"
              onClick={handleForget}
              disabled={!connected || busy || !facts.length}
              title="Erase the canon without touching the conversation"
            >
              <IconTrash size={14} /> Forget
            </button>
            <button
              className="btn btn-primary"
              onClick={onHarvest}
              disabled={!connected || busy || !continuity.enabled}
              title="Read the whole conversation and rebuild the canon from it — your pinned facts are kept"
            >
              {busy ? <IconRefresh size={14} className="spin" /> : <IconBookOpen size={14} />}
              {busy ? " Reading…" : " Read the story"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
