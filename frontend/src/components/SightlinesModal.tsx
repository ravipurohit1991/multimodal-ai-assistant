import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { SIGHTLINE_USER, type SightlineEntry, type SightlinesState } from "../types";
import {
  countSightlines,
  filterSightlines,
  isPrivateSightline,
  knowsSightline,
  participantLabel,
  removeSightlineEntry,
  toggleKnower,
  type SightlineDraft,
  type SightlineFilter,
} from "../sightlines";
import type { Theme } from "../theme";
import {
  IconBookOpen,
  IconEye,
  IconEyeOff,
  IconPin,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconX,
} from "./Icons";

export interface SightlinesModalProps {
  show: boolean;
  sightlines: SightlinesState;
  busy: boolean;
  connected: boolean;
  userName: string;
  theme: Theme;
  onClose: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onToggleAuto: (auto: boolean) => void;
  /** Commits the complete ledger after an edit, an audience change, or a removal. */
  onEntriesChange: (entries: SightlineEntry[]) => void;
  onAdd: (draft: SightlineDraft) => void;
  /** Read the whole transcript and map who has been kept out of what. */
  onHarvest: () => void;
  /** Check the latest reply for knowledge its speaker should not have had. */
  onCheckNow: () => void;
  /** Remove every entry while leaving the visible conversation untouched. */
  onForget: () => void;
}

interface EntryRowProps {
  entry: SightlineEntry;
  allEntries: readonly SightlineEntry[];
  participants: readonly string[];
  userName: string;
  disabled: boolean;
  revealed: boolean;
  onReveal: () => void;
  onEntriesChange: (entries: SightlineEntry[]) => void;
}

function EntryRow({
  entry,
  allEntries,
  participants,
  userName,
  disabled,
  revealed,
  onReveal,
  onEntriesChange,
}: EntryRowProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState(entry.text);
  const [topic, setTopic] = useState(entry.topic);

  // Server echoes are authoritative, but never move the user's caret or replace
  // an in-progress edit if a background pass finishes while this row has focus.
  useEffect(() => {
    if (rowRef.current?.contains(document.activeElement)) return;
    setText(entry.text);
    setTopic(entry.topic);
  }, [entry.text, entry.topic]);

  const withheld = isPrivateSightline(entry, participants);
  // Something the reader has not been let in on stays covered until they ask.
  // A story that can surprise you is the entire point of keeping it.
  const spoiler = !knowsSightline(entry, SIGHTLINE_USER) && !revealed;

  const commit = (patch: Partial<SightlineEntry> = {}) => {
    const nextText = text.trim() || entry.text;
    const nextTopic = topic.trim();
    setText(nextText);
    setTopic(nextTopic);
    onEntriesChange(allEntries.map((candidate) => (
      candidate.id === entry.id
        ? { ...candidate, text: nextText, topic: nextTopic, ...patch, id: candidate.id }
        : candidate
    )));
  };

  const remove = () => {
    if (window.confirm(`Remove “${entry.topic || entry.text}” from Sightlines?`)) {
      onEntriesChange(removeSightlineEntry(allEntries, entry.id));
    }
  };

  return (
    <div
      ref={rowRef}
      className="sightline-row"
      data-withheld={withheld}
      data-pinned={entry.pinned}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") commit();
      }}
    >
      <div className="sightline-row-main">
        <button
          type="button"
          className="icon-btn sm sightline-pin"
          data-active={entry.pinned}
          aria-pressed={entry.pinned}
          aria-label={entry.pinned ? `Unpin ${entry.topic || entry.text}` : `Pin ${entry.topic || entry.text}`}
          title={entry.pinned
            ? "Pinned — always reaches the model and survives a rebuild"
            : "Always send this to the model"}
          disabled={disabled}
          onClick={() => commit({ pinned: !entry.pinned })}
        >
          <IconPin size={13} />
        </button>

        <div className="sightline-copy">
          <input
            className="sightline-topic-input"
            value={topic}
            disabled={disabled}
            aria-label={`Spoiler-free topic for ${entry.topic || entry.text}`}
            placeholder="Spoiler-free topic — “what happened to the wine”"
            onChange={(event) => setTopic(event.target.value)}
          />
          {spoiler ? (
            <button
              type="button"
              className="sightline-spoiler"
              onClick={onReveal}
              title="You have not been let in on this. Show it anyway?"
            >
              <IconEyeOff size={13} />
              <span>Kept from you — reveal</span>
            </button>
          ) : (
            <textarea
              className="sightline-text-input"
              value={text}
              disabled={disabled}
              rows={2}
              aria-label={`What is known in ${entry.topic || entry.text}`}
              placeholder="What is actually known…"
              onChange={(event) => setText(event.target.value)}
            />
          )}
        </div>

        <button
          type="button"
          className="icon-btn sm danger sightline-remove"
          disabled={disabled}
          onClick={remove}
          title="Remove this entry"
          aria-label={`Remove ${entry.topic || entry.text}`}
        >
          <IconTrash size={13} />
        </button>
      </div>

      <div className="sightline-audience" role="group" aria-label="Who knows this">
        <span className="label-caps">Knows</span>
        {participants.map((name) => {
          const inTheKnow = knowsSightline(entry, name);
          const label = participantLabel(name, userName);
          return (
            <button
              key={name}
              type="button"
              className="sightline-knower"
              data-active={inTheKnow}
              aria-pressed={inTheKnow}
              disabled={disabled}
              title={inTheKnow
                ? `${label} knows this — click to take it back`
                : `${label} does not know this — click to let them in`}
              onClick={() => onEntriesChange(toggleKnower(allEntries, entry.id, name))}
            >
              {inTheKnow ? <IconEye size={12} /> : <IconEyeOff size={12} />}
              {label}
            </button>
          );
        })}
        {!withheld && (
          <span className="meta-mono sightline-shared-note">
            Everyone knows this — nothing is withheld
          </span>
        )}
      </div>
    </div>
  );
}

const FILTERS: Array<{ value: SightlineFilter; label: string }> = [
  { value: "private", label: "Withheld" },
  { value: "shared", label: "Shared" },
  { value: "all", label: "All" },
];

/**
 * The who-knows-what grid. Every other story ledger in the app is a list; this
 * one is a matrix, because the interesting part of an entry is not what it says
 * but who is being kept out of it.
 */
export function SightlinesModal({
  show,
  sightlines,
  busy,
  connected,
  userName,
  theme,
  onClose,
  onToggleEnabled,
  onToggleAuto,
  onEntriesChange,
  onAdd,
  onHarvest,
  onCheckNow,
  onForget,
}: SightlinesModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const addTextRef = useRef<HTMLInputElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const focusHistoryRef = useRef<HTMLElement[]>([]);
  const wasShownRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const [filter, setFilter] = useState<SightlineFilter>("private");
  const [query, setQuery] = useState("");
  const [draftText, setDraftText] = useState("");
  const [draftTopic, setDraftTopic] = useState("");
  const [draftKnows, setDraftKnows] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const participants = sightlines.participants;
  const counts = useMemo(
    () => countSightlines(sightlines.entries, participants),
    [sightlines.entries, participants],
  );
  const visibleEntries = useMemo(
    () => filterSightlines(sightlines.entries, participants, filter, query),
    [sightlines.entries, participants, filter, query],
  );

  // Remember a short focus trail while hidden. When opened from a portal-backed
  // menu the menu item disappears, and the toolbar trigger behind it is the
  // correct return target.
  useEffect(() => {
    if (show) return;
    const rememberFocus = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      focusHistoryRef.current = [
        event.target,
        ...focusHistoryRef.current.filter((item) => item !== event.target),
      ].slice(0, 8);
    };
    document.addEventListener("focusin", rememberFocus);
    return () => document.removeEventListener("focusin", rememberFocus);
  }, [show]);

  useLayoutEffect(() => {
    let focusFrame = 0;
    if (show && !wasShownRef.current) {
      setFilter("private");
      setQuery("");
      setDraftText("");
      setDraftTopic("");
      // A new entry starts as shared context; withholding it is a deliberate act.
      setDraftKnows(participants.slice());
      // Reopening the workspace re-covers anything the reader revealed, so a
      // spoiler stays a one-time decision rather than a permanent one.
      setRevealed(new Set());
      focusFrame = window.requestAnimationFrame(() => {
        if (connected && !busy) addTextRef.current?.focus();
        else closeButtonRef.current?.focus();
      });
    } else if (!show && wasShownRef.current) {
      focusFrame = window.requestAnimationFrame(() => {
        focusHistoryRef.current.find((item) => item.isConnected)?.focus();
      });
    }
    wasShownRef.current = show;
    return () => window.cancelAnimationFrame(focusFrame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  if (!show) return null;

  const requestClose = () => onClose();

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      requestClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) || [],
    ).filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const submitDraft = () => {
    const text = draftText.trim();
    if (!text) {
      addTextRef.current?.focus();
      return;
    }
    onAdd({ text, topic: draftTopic.trim(), knows: draftKnows });
    setDraftText("");
    setDraftTopic("");
    setDraftKnows(participants.slice());
    window.requestAnimationFrame(() => addTextRef.current?.focus());
  };

  const harvest = () => {
    if (window.confirm(
      "Read the whole conversation and map who knows what? Entries you have not pinned will be replaced; pinned entries are preserved.",
    )) {
      onHarvest();
    }
  };

  const forget = () => {
    if (!counts.total || window.confirm(
      "Forget who knows what? Every character becomes able to use everything again, and the conversation itself stays unchanged.",
    )) {
      onForget();
    }
  };

  const toggleDraftKnower = (name: string) => {
    setDraftKnows((current) => (
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name]
    ));
  };

  const emptyMessage = query.trim()
    ? "Nothing here matches that search."
    : filter === "private"
      ? "Nobody is being kept out of anything yet."
      : filter === "shared"
        ? "Nothing has been recorded as common knowledge."
        : "Nothing has been recorded yet.";

  return (
    <div
      className="modal-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={dialogRef}
        className="modal-card sightlines-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy}
        onKeyDown={handleDialogKeyDown}
      >
        <header className="sightlines-header">
          <IconEye size={18} style={{ color: theme.colors.primary }} />
          <div className="sightlines-heading">
            <div id={titleId}>Sightlines</div>
            <div id={descriptionId}>
              What each character knows, and what they were never told
              {!connected && (
                <span style={{ color: theme.colors.warning }}>
                  {" "}· connect to apply changes
                </span>
              )}
            </div>
          </div>
          <span className="sightlines-count" aria-live="polite">
            {counts.private} withheld
            {counts.hiddenFromUser > 0 && ` · ${counts.hiddenFromUser} from you`}
          </span>
          <button
            ref={closeButtonRef}
            className="icon-btn"
            type="button"
            onClick={requestClose}
            title="Close Sightlines"
            aria-label="Close Sightlines"
          >
            <IconX size={16} />
          </button>
        </header>

        <div className="sightlines-body">
          <section className="sightlines-settings" aria-label="Sightlines settings">
            <label>
              <input
                type="checkbox"
                checked={sightlines.enabled}
                disabled={!connected || busy}
                onChange={(event) => onToggleEnabled(event.target.checked)}
              />
              Keep characters to what they know
            </label>
            <label data-disabled={!sightlines.enabled}>
              <input
                type="checkbox"
                checked={sightlines.auto}
                disabled={!connected || busy || !sightlines.enabled}
                onChange={(event) => onToggleAuto(event.target.checked)}
              />
              Watch replies for leaks
            </label>
            <span className="meta-mono">
              {sightlines.auto
                ? `${sightlines.covered} messages examined`
                : "costs one extra pass per reply"}
            </span>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={!connected || busy || !sightlines.enabled}
              onClick={harvest}
              title="Read the conversation and map who has been kept out of what"
            >
              <IconBookOpen size={13} />
              Read the story
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!connected || busy || !sightlines.enabled || counts.private === 0}
              onClick={onCheckNow}
              title="Check the latest reply for knowledge its speaker never had"
            >
              <IconRefresh size={13} className={busy ? "spin" : undefined} />
              {busy ? "Reading…" : "Check latest"}
            </button>
          </section>

          <section className="sightline-add" aria-labelledby={`${titleId}-add`}>
            <div className="label-caps" id={`${titleId}-add`}>Record something known</div>
            <div className="sightline-add-fields">
              <input
                ref={addTextRef}
                className="input"
                value={draftText}
                disabled={!connected || busy}
                placeholder="What is known — “Mira poisoned the wine”"
                aria-label="What is known"
                onChange={(event) => setDraftText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitDraft();
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-quiet"
                disabled={!connected || busy || !draftText.trim()}
                onClick={submitDraft}
              >
                <IconPlus size={13} />
                Add
              </button>
            </div>
            <input
              className="input"
              value={draftTopic}
              disabled={!connected || busy}
              placeholder="Spoiler-free topic — “what happened to the wine”. This is all anyone kept out of it will ever see."
              aria-label="Spoiler-free topic"
              onChange={(event) => setDraftTopic(event.target.value)}
            />
            <div className="sightline-audience" role="group" aria-label="Who knows this yet">
              <span className="label-caps">Knows</span>
              {participants.map((name) => {
                const inTheKnow = draftKnows.includes(name);
                const label = participantLabel(name, userName);
                return (
                  <button
                    key={name}
                    type="button"
                    className="sightline-knower"
                    data-active={inTheKnow}
                    aria-pressed={inTheKnow}
                    disabled={!connected || busy}
                    title={inTheKnow ? `${label} knows this` : `${label} does not know this`}
                    onClick={() => toggleDraftKnower(name)}
                  >
                    {inTheKnow ? <IconEye size={12} /> : <IconEyeOff size={12} />}
                    {label}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="sightlines-list-tools">
            <div className="seg" role="group" aria-label="Filter Sightlines">
              {FILTERS.map((option) => {
                const count = option.value === "private"
                  ? counts.private
                  : option.value === "shared"
                    ? counts.shared
                    : counts.total;
                return (
                  <button
                    key={option.value}
                    type="button"
                    data-active={filter === option.value}
                    aria-pressed={filter === option.value}
                    onClick={() => setFilter(option.value)}
                  >
                    {option.label}
                    <span>{count}</span>
                  </button>
                );
              })}
            </div>
            <label className="sightlines-search">
              <IconSearch size={13} />
              <span className="sr-only">Search Sightlines</span>
              <input
                value={query}
                type="search"
                placeholder="Search what is known"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>

          <section className="sightlines-list" aria-label="Sightlines" aria-live="polite">
            {visibleEntries.length === 0 ? (
              <div className="sightlines-empty">
                <IconEye size={22} />
                <div>{busy ? "Reading who knows what…" : emptyMessage}</div>
                <span>
                  {filter === "private" && !query.trim()
                    ? "Record a secret above, or read the story to find one."
                    : "Try another filter or search."}
                </span>
              </div>
            ) : (
              visibleEntries.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  allEntries={sightlines.entries}
                  participants={participants}
                  userName={userName}
                  disabled={!connected || busy}
                  revealed={revealed.has(entry.id)}
                  onReveal={() => setRevealed((current) => new Set(current).add(entry.id))}
                  onEntriesChange={onEntriesChange}
                />
              ))
            )}
          </section>
        </div>

        <footer className="sightlines-footer">
          <span className="meta-mono">
            {counts.private} withheld · {counts.shared} shared · {counts.pinned} pinned
          </span>
          <button
            type="button"
            className="btn btn-danger"
            disabled={!connected || busy || counts.total === 0}
            onClick={forget}
            title="Forget who knows what without changing the conversation"
          >
            <IconTrash size={13} />
            Forget all
          </button>
        </footer>
      </div>
    </div>
  );
}
