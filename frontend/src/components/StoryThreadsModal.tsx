import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type {
  StoryThread,
  StoryThreadKind,
  StoryThreadsState,
  StoryThreadStatus,
} from "../types";
import {
  countStoryThreads,
  filterStoryThreads,
  removeStoryThread,
  STORY_THREAD_KIND_LABELS,
  STORY_THREAD_KINDS,
  STORY_THREAD_STATUS_LABELS,
  type StoryThreadDraft,
  type StoryThreadFilter,
} from "../storyThreads";
import type { Theme } from "../theme";
import {
  IconBookOpen,
  IconEraser,
  IconPin,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconThreads,
  IconTrash,
  IconX,
} from "./Icons";

export interface StoryThreadsModalProps {
  show: boolean;
  storyThreads: StoryThreadsState;
  busy: boolean;
  connected: boolean;
  theme: Theme;
  onClose: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onToggleAuto: (auto: boolean) => void;
  /** Commits the complete ledger after an edit, pin, status, or removal action. */
  onThreadsChange: (threads: StoryThread[]) => void;
  onAdd: (draft: StoryThreadDraft) => void;
  /** Incrementally inspect only transcript turns not covered yet. */
  onScanLatest: () => void;
  /** Re-read the complete transcript and reconstruct unpinned threads. */
  onRebuild: () => void;
  /** Remove every thread while leaving the visible conversation untouched. */
  onForget: () => void;
  /** Remove resolved and dropped threads, preserving everything still active. */
  onClearArchived: () => void;
}

interface ThreadEditorProps {
  thread: StoryThread;
  allThreads: readonly StoryThread[];
  disabled: boolean;
  onThreadsChange: (threads: StoryThread[]) => void;
}

function ThreadEditor({
  thread,
  allThreads,
  disabled,
  onThreadsChange,
}: ThreadEditorProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [title, setTitle] = useState(thread.title);
  const [summary, setSummary] = useState(thread.summary);

  // Server echoes are authoritative, but never move the user's caret or replace
  // an in-progress edit if an automatic scan finishes while this card has focus.
  useEffect(() => {
    if (cardRef.current?.contains(document.activeElement)) return;
    setTitle(thread.title);
    setSummary(thread.summary);
  }, [thread.title, thread.summary]);

  const commit = (patch: Partial<StoryThread> = {}) => {
    const nextTitle = title.trim() || thread.title;
    const nextSummary = summary.trim();
    const nextThreads = allThreads.map((candidate) => {
      if (candidate.id !== thread.id) return candidate;
      const next: StoryThread = {
        ...candidate,
        title: nextTitle,
        summary: nextSummary,
        ...patch,
        id: candidate.id,
      };
      if (next.status === "active") delete next.resolvedTurn;
      return next;
    });
    setTitle(nextTitle);
    setSummary(nextSummary);
    onThreadsChange(nextThreads);
  };

  const remove = () => {
    const prompt = thread.pinned
      ? `Remove the pinned thread “${thread.title}”?`
      : `Remove “${thread.title}” from the story threads?`;
    if (window.confirm(prompt)) {
      onThreadsChange(removeStoryThread(allThreads, thread.id));
    }
  };

  const turnLabel = thread.updatedTurn > 0
    ? `Updated near message ${thread.updatedTurn}`
    : "Added by you";

  return (
    <div
      ref={cardRef}
      className="story-thread-card"
      data-status={thread.status}
      data-pinned={thread.pinned}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") commit();
      }}
    >
      <div className="story-thread-card-main">
        <button
          type="button"
          className="icon-btn sm story-thread-pin"
          data-active={thread.pinned}
          aria-pressed={thread.pinned}
          aria-label={thread.pinned ? `Unpin ${thread.title}` : `Pin ${thread.title}`}
          title={thread.pinned
            ? "Pinned — retained and prioritized even after it leaves play"
            : "Retain and prioritize this thread"}
          disabled={disabled}
          onClick={() => commit({ pinned: !thread.pinned })}
        >
          <IconPin size={13} />
        </button>

        <div className="story-thread-copy">
          <input
            className="story-thread-title-input"
            value={title}
            disabled={disabled}
            aria-label={`Title for ${thread.title}`}
            onChange={(event) => setTitle(event.target.value)}
          />
          <textarea
            className="story-thread-summary-input"
            value={summary}
            disabled={disabled}
            rows={2}
            aria-label={`Summary for ${thread.title}`}
            placeholder="What remains unresolved, and why it matters…"
            onChange={(event) => setSummary(event.target.value)}
          />
        </div>

        <button
          type="button"
          className="icon-btn sm danger story-thread-remove"
          disabled={disabled}
          onClick={remove}
          title="Remove this thread"
          aria-label={`Remove ${thread.title}`}
        >
          <IconTrash size={13} />
        </button>
      </div>

      <div className="story-thread-card-meta">
        <label>
          <span className="sr-only">Thread kind</span>
          <select
            value={thread.kind}
            disabled={disabled}
            aria-label={`Kind for ${thread.title}`}
            onChange={(event) => commit({
              kind: event.target.value as StoryThreadKind,
            })}
          >
            {STORY_THREAD_KINDS.map((kind) => (
              <option key={kind} value={kind}>{STORY_THREAD_KIND_LABELS[kind]}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Thread status</span>
          <select
            value={thread.status}
            disabled={disabled}
            aria-label={`Status for ${thread.title}`}
            onChange={(event) => commit({
              status: event.target.value as StoryThreadStatus,
            })}
          >
            <option value="active">{STORY_THREAD_STATUS_LABELS.active}</option>
            <option value="resolved">{STORY_THREAD_STATUS_LABELS.resolved}</option>
            <option value="dropped">{STORY_THREAD_STATUS_LABELS.dropped}</option>
          </select>
        </label>
        <span className="meta-mono story-thread-turn">{turnLabel}</span>
      </div>
    </div>
  );
}

const FILTERS: Array<{ value: StoryThreadFilter; label: string }> = [
  { value: "active", label: "In play" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
];

/**
 * The editable dramatic ledger. It stays deliberately compact: the app surfaces
 * only a count in the Story menu, while the full active/archive workflow lives
 * in this focused dialog.
 */
export function StoryThreadsModal({
  show,
  storyThreads,
  busy,
  connected,
  theme,
  onClose,
  onToggleEnabled,
  onToggleAuto,
  onThreadsChange,
  onAdd,
  onScanLatest,
  onRebuild,
  onForget,
  onClearArchived,
}: StoryThreadsModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const addTitleRef = useRef<HTMLInputElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const focusHistoryRef = useRef<HTMLElement[]>([]);
  const wasShownRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const [filter, setFilter] = useState<StoryThreadFilter>("active");
  const [query, setQuery] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftSummary, setDraftSummary] = useState("");
  const [draftKind, setDraftKind] = useState<StoryThreadKind>("other");

  const counts = useMemo(
    () => countStoryThreads(storyThreads.threads),
    [storyThreads.threads],
  );
  const visibleThreads = useMemo(
    () => filterStoryThreads(storyThreads.threads, filter, query),
    [storyThreads.threads, filter, query],
  );

  // Remember a short focus trail while hidden. When opened from a portal-backed
  // menu, the menu item disappears; the preceding toolbar trigger remains and
  // becomes the correct return target.
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
      setFilter("active");
      setQuery("");
      setDraftTitle("");
      setDraftSummary("");
      setDraftKind("other");
      focusFrame = window.requestAnimationFrame(() => {
        if (connected && !busy) addTitleRef.current?.focus();
        else closeButtonRef.current?.focus();
      });
    } else if (!show && wasShownRef.current) {
      focusFrame = window.requestAnimationFrame(() => {
        focusHistoryRef.current.find((item) => item.isConnected)?.focus();
      });
    }
    wasShownRef.current = show;
    return () => window.cancelAnimationFrame(focusFrame);
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
    const title = draftTitle.trim();
    if (!title) {
      addTitleRef.current?.focus();
      return;
    }
    const draft: StoryThreadDraft = {
      title,
      summary: draftSummary.trim(),
      kind: draftKind,
    };
    onAdd(draft);
    setDraftTitle("");
    setDraftSummary("");
    setDraftKind("other");
    window.requestAnimationFrame(() => addTitleRef.current?.focus());
  };

  const rebuild = () => {
    if (window.confirm(
      "Rebuild story threads from the whole conversation? Unpinned threads and archived history will be replaced; pinned threads will be preserved.",
    )) {
      onRebuild();
    }
  };

  const forget = () => {
    if (!counts.total || window.confirm(
      "Forget every story thread? The conversation itself will stay unchanged.",
    )) {
      onForget();
    }
  };

  const clearArchived = () => {
    if (!counts.archived || window.confirm(
      `Remove ${counts.archived} archived ${counts.archived === 1 ? "thread" : "threads"}?`,
    )) {
      onClearArchived();
    }
  };

  const emptyMessage = query.trim()
    ? "No story threads match that search."
    : filter === "active"
      ? "Nothing is pulling at the story yet."
      : filter === "archived"
        ? "No threads have left play yet."
        : "No story threads have been gathered yet.";

  return (
    <div
      className="modal-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={dialogRef}
        className="modal-card story-threads-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy}
        onKeyDown={handleDialogKeyDown}
      >
        <header className="story-threads-header">
          <IconThreads size={18} style={{ color: theme.colors.primary }} />
          <div className="story-threads-heading">
            <div id={titleId}>Story threads</div>
            <div id={descriptionId}>
              The promises, mysteries, goals, and tensions still pulling at this story
              {!connected && (
                <span style={{ color: theme.colors.warning }}>
                  {" "}· connect to apply changes
                </span>
              )}
            </div>
          </div>
          <span className="story-threads-count" aria-live="polite">
            {counts.active} in play
            {counts.pinnedActive > 0 && ` · ${counts.pinnedActive} pinned`}
          </span>
          <button
            ref={closeButtonRef}
            className="icon-btn"
            type="button"
            onClick={requestClose}
            title="Close story threads"
            aria-label="Close Story threads"
          >
            <IconX size={16} />
          </button>
        </header>

        <div className="story-threads-body">
          <section className="story-threads-settings" aria-label="Thread tracking">
            <label>
              <input
                type="checkbox"
                checked={storyThreads.enabled}
                disabled={!connected || busy}
                onChange={(event) => onToggleEnabled(event.target.checked)}
              />
              Track what is still in play
            </label>
            <label data-disabled={!storyThreads.enabled}>
              <input
                type="checkbox"
                checked={storyThreads.auto}
                disabled={!connected || busy || !storyThreads.enabled}
                onChange={(event) => onToggleAuto(event.target.checked)}
              />
              Update after new scenes
            </label>
            <span className="meta-mono">
              {storyThreads.covered} messages examined
            </span>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={!connected || busy || !storyThreads.enabled}
              onClick={rebuild}
              title="Re-read the conversation; replace unpinned threads and preserve pins"
            >
              <IconBookOpen size={13} />
              Rebuild
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!connected || busy || !storyThreads.enabled}
              onClick={onScanLatest}
              title="Inspect story turns not examined yet"
            >
              <IconRefresh size={13} className={busy ? "spin" : undefined} />
              {busy ? "Reading…" : "Scan latest"}
            </button>
          </section>

          <section className="story-thread-add" aria-labelledby={`${titleId}-add`}>
            <div className="label-caps" id={`${titleId}-add`}>Add a thread yourself</div>
            <div className="story-thread-add-fields">
              <input
                ref={addTitleRef}
                className="input"
                value={draftTitle}
                disabled={!connected || busy}
                placeholder="A promise, mystery, goal, or threat…"
                aria-label="New story thread title"
                onChange={(event) => setDraftTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitDraft();
                  }
                }}
              />
              <select
                className="input"
                value={draftKind}
                disabled={!connected || busy}
                aria-label="New story thread kind"
                onChange={(event) => setDraftKind(event.target.value as StoryThreadKind)}
              >
                {STORY_THREAD_KINDS.map((kind) => (
                  <option key={kind} value={kind}>{STORY_THREAD_KIND_LABELS[kind]}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-quiet"
                disabled={!connected || busy || !draftTitle.trim()}
                onClick={submitDraft}
              >
                <IconPlus size={13} />
                Add
              </button>
            </div>
            <textarea
              className="input story-thread-add-summary"
              value={draftSummary}
              disabled={!connected || busy}
              rows={2}
              placeholder="Optional: what remains unresolved, and why it matters"
              aria-label="New story thread summary"
              onChange={(event) => setDraftSummary(event.target.value)}
            />
          </section>

          <div className="story-threads-list-tools">
            <div className="seg" role="group" aria-label="Filter story threads">
              {FILTERS.map((option) => {
                const count = option.value === "active"
                  ? counts.active
                  : option.value === "archived"
                    ? counts.archived
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
            <label className="story-threads-search">
              <IconSearch size={13} />
              <span className="sr-only">Search story threads</span>
              <input
                value={query}
                type="search"
                placeholder="Search threads"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>

          <section
            className="story-threads-list"
            aria-label="Story thread list"
            aria-live="polite"
          >
            {visibleThreads.length === 0 ? (
              <div className="story-threads-empty">
                <IconThreads size={22} />
                <div>{busy ? "Reading for what matters…" : emptyMessage}</div>
                <span>
                  {filter === "active" && !query.trim()
                    ? "Add one yourself, or scan the latest scene."
                    : "Try another filter or search."}
                </span>
              </div>
            ) : (
              visibleThreads.map((thread) => (
                <ThreadEditor
                  key={thread.id}
                  thread={thread}
                  allThreads={storyThreads.threads}
                  disabled={!connected || busy}
                  onThreadsChange={onThreadsChange}
                />
              ))
            )}
          </section>
        </div>

        <footer className="story-threads-footer">
          <span className="meta-mono">
            {counts.active} in play · {counts.resolved} resolved · {counts.dropped} dropped
          </span>
          <div>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={!connected || busy || counts.archived === 0}
              onClick={clearArchived}
              title="Permanently remove resolved and dropped threads"
            >
              <IconEraser size={13} />
              Clear archived
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={!connected || busy || counts.total === 0}
              onClick={forget}
              title="Forget all threads without changing the conversation"
            >
              <IconTrash size={13} />
              Forget all
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
