import React, { useMemo, useState } from "react";
import {
  CharacterStudyState,
  STUDY_FACETS,
  STUDY_FACET_HINTS,
  STUDY_FACET_LABELS,
  StudyFacet,
  StudyTrait,
} from "../types";
import { Theme } from "../theme";
import {
  StudyDraft,
  STUDY_USER,
  countStudy,
  filterStudyTraits,
  isStudyLocked,
  removeStudyTrait,
  reviseStudyTrait,
  studyParticipantLabel,
  studySummaryLine,
  studyTimeline,
  studyTraitStatus,
  traitsForCharacter,
  updateStudyTrait,
  type StudyFilter,
} from "../characterStudy";
import {
  IconCheck,
  IconEraser,
  IconHistory,
  IconLock,
  IconPencil,
  IconPin,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconStudy,
  IconTrash,
  IconX,
} from "./Icons";

type StudyTab = "played" | "history";

interface CharacterStudyPanelProps {
  /** The character whose sheet this is — the name, since studies are keyed by it. */
  character: string;
  /** Everyone a bond may point at, for the "about" picker. */
  cast: string[];
  userName: string;
  study: CharacterStudyState;
  busy: boolean;
  connected: boolean;
  theme: Theme;
  onUpdateTraits: (traits: StudyTrait[]) => void;
  onAddTrait: (draft: StudyDraft) => void;
  onSetLock: (character: string, locked: boolean) => void;
  onSettings: (patch: Partial<CharacterStudyState>) => void;
  onRefresh: (rebuild: boolean) => void;
  onForget: () => void;
}

/** A small status pill: where an observation stands right now. */
function StatusChip({ status, theme }: { status: string; theme: Theme }) {
  const tone = status === "firm"
    ? { color: theme.colors.success, bg: theme.colors.successLight, label: "shaping replies" }
    : status === "provisional"
      ? { color: theme.colors.warning, bg: theme.colors.warningLight, label: "seen once" }
      : { color: theme.colors.textTertiary, bg: "transparent", label: "faded" };
  return (
    <span
      title={
        status === "firm"
          ? "Established — this is sent with every reply this character writes"
          : status === "provisional"
            ? "Seen once. It shapes nothing until the story shows it again"
            : "Not seen for a long stretch, so it no longer reaches the model"
      }
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: "1px 6px",
        borderRadius: 999,
        color: tone.color,
        background: tone.bg,
        border: `1px solid color-mix(in srgb, ${tone.color} 35%, transparent)`,
        whiteSpace: "nowrap",
      }}
    >
      {tone.label}
    </span>
  );
}

/**
 * Character Study — the sheet the story wrote, shown inside the character card.
 *
 * "As played" is the current portrait: every observation with where it stands,
 * how often it has been seen, and the words behind it. "How they got here" is the
 * same material as an arc — when each line appeared, firmed up, or changed — which
 * is the part that makes the evolution visible rather than merely true.
 *
 * Nothing here writes to the authored card above it. That text is the author's;
 * this is what the story added to it.
 */
export function CharacterStudyPanel({
  character,
  cast,
  userName,
  study,
  busy,
  connected,
  theme,
  onUpdateTraits,
  onAddTrait,
  onSetLock,
  onSettings,
  onRefresh,
  onForget,
}: CharacterStudyPanelProps) {
  const [tab, setTab] = useState<StudyTab>("played");
  const [filter, setFilter] = useState<StudyFilter>("all");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<StudyDraft>({
    character,
    facet: "voice",
    text: "",
    about: "",
  });

  const mine = useMemo(
    () => traitsForCharacter(study.traits, character),
    [study.traits, character],
  );
  const counts = useMemo(() => countStudy(mine, study.total), [mine, study.total]);
  const visible = useMemo(
    () => filterStudyTraits(mine, study.total, filter, query),
    [mine, study.total, filter, query],
  );
  const timeline = useMemo(() => studyTimeline(mine, study.total), [mine, study.total]);
  const summary = useMemo(() => studySummaryLine(mine, study.total), [mine, study.total]);
  const locked = isStudyLocked(study.locked, character);
  const others = cast.filter((name) => name.trim() && name !== character);

  const commitEdit = (trait: StudyTrait) => {
    const next = reviseStudyTrait(study.traits, trait.id, editText);
    if (next !== study.traits) onUpdateTraits(next);
    setEditingId(null);
    setEditText("");
  };

  const submitDraft = () => {
    if (!draft.text.trim()) return;
    onAddTrait({ ...draft, character, text: draft.text.trim() });
    setDraft({ character, facet: "voice", text: "", about: "" });
    setAdding(false);
  };

  const tabButton = (value: StudyTab, label: string, icon: React.ReactNode) => (
    <button
      className="btn btn-quiet"
      onClick={() => setTab(value)}
      style={{
        padding: "4px 10px",
        fontSize: 12,
        fontWeight: 600,
        borderColor: tab === value ? theme.colors.secondary : "transparent",
        color: tab === value ? theme.colors.textPrimary : theme.colors.textTertiary,
        background: tab === value
          ? `color-mix(in srgb, ${theme.colors.secondary} 12%, transparent)`
          : "transparent",
      }}
    >
      {icon} {label}
    </button>
  );

  return (
    <div
      style={{
        marginTop: 6,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: 12,
        background: theme.colors.surface,
        overflow: "hidden",
      }}
    >
      {/* Header: what the story has made of them, and the switches */}
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${theme.colors.borderLight}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <IconStudy size={15} style={{ color: theme.colors.secondary }} className={busy ? "spin" : undefined} />
          <div style={{ fontSize: 13, fontWeight: 600, color: theme.colors.textPrimary }}>
            As played
          </div>
          <span style={{ fontSize: 11, color: theme.colors.textTertiary }}>
            {counts.total === 0
              ? busy ? "reading the story…" : "nothing observed yet"
              : `${counts.firm} shaping replies · ${counts.provisional} provisional${counts.faded ? ` · ${counts.faded} faded` : ""}`}
          </span>
          {locked && (
            <span
              title="This portrait is finished: it still shapes replies, but the story will not add to it"
              style={{
                display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5,
                fontWeight: 600, color: theme.colors.textTertiary,
              }}
            >
              <IconLock size={11} /> locked
            </span>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            {tabButton("played", "Sheet", <IconStudy size={12} />)}
            {tabButton("history", "How they got here", <IconHistory size={12} />)}
          </div>
        </div>

        {summary && (
          <div
            style={{
              marginTop: 8,
              fontSize: 12.5,
              lineHeight: 1.55,
              color: theme.colors.textSecondary,
              fontFamily: theme.fonts.prose,
              fontStyle: "italic",
            }}
          >
            Who {character || "they"} has become: {summary}.
          </div>
        )}

        <div style={{ marginTop: 9, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: theme.colors.textSecondary, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={study.enabled}
              onChange={(e) => onSettings({ enabled: e.target.checked })}
            />
            <span title="Send each character their own sheet. Costs nothing — it is only prompt assembly.">
              Write them from this
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: theme.colors.textSecondary, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={study.auto}
              disabled={!study.enabled}
              onChange={(e) => onSettings({ auto: e.target.checked })}
            />
            <span title={`Keep observing as the story goes, every ${study.interval} turns`}>
              Keep watching ({study.interval} turns)
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: theme.colors.textSecondary, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={study.watch}
              disabled={!study.enabled}
              onChange={(e) => onSettings({ watch: e.target.checked })}
            />
            <span title="Check each reply against the sheet and flag one that is not this character. Costs one extra pass per reply.">
              Flag replies that aren't them
            </span>
          </label>
        </div>

        <div style={{ marginTop: 9, display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            className="btn btn-quiet"
            onClick={() => onRefresh(false)}
            disabled={!connected || busy || !study.enabled || study.covered >= study.total}
            title={
              study.covered >= study.total
                ? "Everything so far has been read"
                : `Read the ${study.total - study.covered} turn(s) nobody has read yet`
            }
            style={{ padding: "4px 9px", fontSize: 11.5 }}
          >
            <IconRefresh size={12} /> Catch up
          </button>
          <button
            className="btn btn-quiet"
            onClick={() => onRefresh(true)}
            disabled={!connected || busy || !study.enabled || study.total === 0}
            title="Read the whole story from the beginning and rebuild every sheet. Pinned and hand-written lines are kept."
            style={{ padding: "4px 9px", fontSize: 11.5 }}
          >
            <IconStudy size={12} /> Read the whole story
          </button>
          <button
            className="btn btn-quiet"
            onClick={() => setAdding((value) => !value)}
            title="Write an observation yourself. It shapes replies at once and is never auto-revised."
            style={{ padding: "4px 9px", fontSize: 11.5 }}
          >
            <IconPlus size={12} /> Add a line
          </button>
          <button
            className="btn btn-quiet"
            onClick={() => onSetLock(character, !locked)}
            disabled={!character.trim()}
            title={
              locked
                ? "Let the story keep observing this character"
                : "Finish this portrait: it keeps shaping replies, but the story stops adding to it"
            }
            style={{ padding: "4px 9px", fontSize: 11.5 }}
          >
            <IconLock size={12} /> {locked ? "Unlock" : "Lock"}
          </button>
          {counts.total > 0 && (
            <button
              className="btn btn-quiet"
              onClick={() => {
                if (window.confirm(
                  `Forget every observation about ${character || "this character"}? `
                  + "The card you wrote is untouched.",
                )) {
                  onUpdateTraits(mine.reduce(
                    (traits, trait) => removeStudyTrait(traits, trait.id),
                    study.traits,
                  ));
                }
              }}
              title="Drop this character's whole sheet, keeping the card you wrote"
              style={{ padding: "4px 9px", fontSize: 11.5, marginLeft: "auto" }}
            >
              <IconEraser size={12} /> Forget the sheet
            </button>
          )}
        </div>

        {adding && (
          <div
            style={{
              marginTop: 9,
              padding: 10,
              borderRadius: 10,
              border: `1px dashed ${theme.colors.border}`,
              background: theme.colors.surfaceElevated,
            }}
          >
            <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
              <select
                className="input"
                value={draft.facet}
                onChange={(e) => setDraft({ ...draft, facet: e.target.value as StudyFacet, about: "" })}
                style={{ width: 130, fontSize: 12 }}
              >
                {STUDY_FACETS.map((facet) => (
                  <option key={facet} value={facet}>{STUDY_FACET_LABELS[facet]}</option>
                ))}
              </select>
              {draft.facet === "bond" && (
                <select
                  className="input"
                  value={draft.about}
                  onChange={(e) => setDraft({ ...draft, about: e.target.value })}
                  style={{ width: 150, fontSize: 12 }}
                >
                  <option value="">with…</option>
                  <option value={STUDY_USER}>{userName.trim() || "You"}</option>
                  {others.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              )}
              <span style={{ fontSize: 11, color: theme.colors.textTertiary, alignSelf: "center" }}>
                {STUDY_FACET_HINTS[draft.facet]}
              </span>
            </div>
            <textarea
              className="input"
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              rows={2}
              placeholder={
                draft.facet === "line"
                  ? "A line they actually say, in their own words…"
                  : "One specific habit — \"answers a hard question with a question of her own\""
              }
              style={{ width: "100%", resize: "vertical", fontSize: 12.5, lineHeight: 1.5 }}
            />
            <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
              <button
                className="btn btn-primary"
                onClick={submitDraft}
                disabled={!draft.text.trim() || (draft.facet === "bond" && !draft.about)}
                style={{ padding: "4px 10px", fontSize: 12 }}
              >
                <IconCheck size={12} /> Add
              </button>
              <button
                className="btn btn-quiet"
                onClick={() => setAdding(false)}
                style={{ padding: "4px 10px", fontSize: 12 }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "10px 12px", maxHeight: 340, overflowY: "auto" }}>
        {tab === "played" ? (
          <>
            {counts.total > 3 && (
              <div style={{ display: "flex", gap: 6, marginBottom: 9, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ position: "relative", flex: "1 1 150px", minWidth: 130 }}>
                  <IconSearch
                    size={12}
                    style={{ position: "absolute", left: 8, top: 8, color: theme.colors.textTertiary }}
                  />
                  <input
                    className="input"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search the sheet…"
                    style={{ width: "100%", fontSize: 12, paddingLeft: 24 }}
                  />
                </div>
                {(["all", "current", "provisional", "faded"] as StudyFilter[]).map((value) => (
                  <button
                    key={value}
                    className="btn btn-quiet"
                    onClick={() => setFilter(value)}
                    style={{
                      padding: "3px 8px",
                      fontSize: 11,
                      borderColor: filter === value ? theme.colors.secondary : undefined,
                      color: filter === value ? theme.colors.textPrimary : theme.colors.textTertiary,
                    }}
                  >
                    {value === "current" ? "shaping replies" : value}
                  </button>
                ))}
              </div>
            )}

            {visible.length === 0 ? (
              <div style={{ fontSize: 12.5, lineHeight: 1.6, color: theme.colors.textTertiary }}>
                {counts.total === 0 ? (
                  <>
                    Nothing observed yet. As {character || "this character"} is played, the story
                    records how they actually speak and behave here — and writes them from it.
                    {study.total > 0 && <> Or read the story now to build the sheet from what has already happened.</>}
                  </>
                ) : (
                  <>Nothing matches that.</>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {visible.map((trait) => {
                  const status = studyTraitStatus(trait, study.total);
                  const isEditing = editingId === trait.id;
                  const isOpen = expandedId === trait.id;
                  return (
                    <div
                      key={trait.id}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: `1px solid ${trait.pinned ? theme.colors.border : theme.colors.borderLight}`,
                        background: theme.colors.surfaceElevated,
                        opacity: status === "faded" ? 0.65 : 1,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                        <span
                          title={STUDY_FACET_HINTS[trait.facet]}
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: 0.3,
                            textTransform: "uppercase",
                            color: theme.colors.secondary,
                          }}
                        >
                          {STUDY_FACET_LABELS[trait.facet]}
                          {trait.facet === "bond" && trait.about
                            ? ` · ${studyParticipantLabel(trait.about, userName)}`
                            : ""}
                        </span>
                        <StatusChip status={status} theme={theme} />
                        {trait.origin === "authored" && (
                          <span
                            title="You wrote this. The story never revises it."
                            style={{ fontSize: 10, fontWeight: 600, color: theme.colors.primary }}
                          >
                            yours
                          </span>
                        )}
                        <span className="meta-mono" style={{ marginLeft: "auto", fontSize: 10 }}>
                          seen {trait.observations}× · turn {trait.firstTurn}
                          {trait.lastTurn > trait.firstTurn ? `–${trait.lastTurn}` : ""}
                        </span>
                      </div>

                      {isEditing ? (
                        <div>
                          <textarea
                            className="input"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows={2}
                            style={{ width: "100%", resize: "vertical", fontSize: 12.5, lineHeight: 1.5 }}
                          />
                          <div style={{ marginTop: 5, display: "flex", gap: 5 }}>
                            <button className="btn btn-primary" onClick={() => commitEdit(trait)} style={{ padding: "3px 9px", fontSize: 11.5 }}>
                              <IconCheck size={12} /> Save
                            </button>
                            <button className="btn btn-quiet" onClick={() => setEditingId(null)} style={{ padding: "3px 9px", fontSize: 11.5 }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          style={{
                            fontSize: 12.5,
                            lineHeight: 1.55,
                            color: theme.colors.textPrimary,
                            fontFamily: trait.facet === "line" ? theme.fonts.prose : undefined,
                            fontStyle: trait.facet === "line" ? "italic" : undefined,
                          }}
                        >
                          {trait.facet === "line" ? `“${trait.text}”` : trait.text}
                        </div>
                      )}

                      <div style={{ marginTop: 5, display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                        {trait.evidence.length > 0 && (
                          <button
                            className="btn btn-quiet"
                            onClick={() => setExpandedId(isOpen ? null : trait.id)}
                            title="The words in the story that put this line here"
                            style={{ padding: "2px 7px", fontSize: 11, color: theme.colors.textTertiary }}
                          >
                            {isOpen ? "Hide the moments" : `Show the moments (${trait.evidence.length})`}
                          </button>
                        )}
                        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                          <button
                            className="icon-btn"
                            onClick={() => onUpdateTraits(updateStudyTrait(study.traits, trait.id, { pinned: !trait.pinned }))}
                            title={trait.pinned ? "Unpin" : "Pin: always sent, never fades, survives a rebuild"}
                            style={{ color: trait.pinned ? theme.colors.primary : theme.colors.textTertiary }}
                          >
                            <IconPin size={13} />
                          </button>
                          <button
                            className="icon-btn"
                            onClick={() => { setEditingId(trait.id); setEditText(trait.text); }}
                            title="Reword this observation"
                          >
                            <IconPencil size={13} />
                          </button>
                          <button
                            className="icon-btn"
                            onClick={() => onUpdateTraits(removeStudyTrait(study.traits, trait.id))}
                            title="Drop this observation"
                          >
                            <IconTrash size={13} />
                          </button>
                        </div>
                      </div>

                      {isOpen && (
                        <div
                          style={{
                            marginTop: 6,
                            paddingTop: 6,
                            borderTop: `1px solid ${theme.colors.borderLight}`,
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                          }}
                        >
                          {trait.evidence.map((row, index) => (
                            <div key={`${trait.id}_ev_${index}`} style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                              <span className="meta-mono" style={{ fontSize: 10, marginRight: 6 }}>
                                turn {row.turn}
                              </span>
                              <span style={{ color: theme.colors.textSecondary, fontFamily: theme.fonts.prose, fontStyle: "italic" }}>
                                “{row.quote}”
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* The arc — when each line appeared, firmed up, or changed. */
          timeline.length === 0 ? (
            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: theme.colors.textTertiary }}>
              No arc yet. Once the story has observed {character || "this character"} for a while,
              this is where you can watch who they were become who they are.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {timeline.map((entry, index) => (
                <div
                  key={`${entry.trait.id}_${entry.kind}_${index}`}
                  style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
                >
                  {/* The rail */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 5 }}>
                    <div
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: entry.kind === "changed"
                          ? theme.colors.primary
                          : entry.kind === "established"
                            ? theme.colors.success
                            : theme.colors.secondary,
                        flexShrink: 0,
                      }}
                    />
                    {index < timeline.length - 1 && (
                      <div style={{ width: 1, flex: 1, minHeight: 26, background: theme.colors.borderLight }} />
                    )}
                  </div>
                  <div style={{ flex: 1, paddingBottom: 12, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                      <span className="meta-mono" style={{ fontSize: 10 }}>turn {entry.turn}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: theme.colors.textTertiary }}>
                        {entry.kind === "appeared"
                          ? `${STUDY_FACET_LABELS[entry.trait.facet].toLocaleLowerCase()} first noticed`
                          : entry.kind === "established"
                            ? "confirmed — began shaping replies"
                            : "changed"}
                      </span>
                    </div>
                    {entry.kind === "changed" && entry.previous && (
                      <div
                        style={{
                          fontSize: 12,
                          lineHeight: 1.5,
                          color: theme.colors.textTertiary,
                          textDecoration: "line-through",
                        }}
                      >
                        {entry.previous}
                      </div>
                    )}
                    <div style={{ fontSize: 12.5, lineHeight: 1.55, color: theme.colors.textPrimary }}>
                      {entry.trait.facet === "line" ? `“${entry.trait.text}”` : entry.trait.text}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {study.traits.length > mine.length && (
        <div
          style={{
            padding: "7px 12px",
            borderTop: `1px solid ${theme.colors.borderLight}`,
            fontSize: 11,
            color: theme.colors.textTertiary,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>
            {study.traits.length - mine.length} more observation(s) about the rest of the cast.
          </span>
          <button
            className="btn btn-quiet"
            onClick={() => {
              if (window.confirm("Forget every observation about the whole cast? The cards you wrote are untouched.")) {
                onForget();
              }
            }}
            style={{ padding: "2px 8px", fontSize: 11, marginLeft: "auto" }}
          >
            <IconX size={11} /> Forget all studies
          </button>
        </div>
      )}
    </div>
  );
}
