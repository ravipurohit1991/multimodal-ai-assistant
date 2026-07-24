import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Message } from "../types";
import { Theme } from "../theme";
import {
  filterStoryMessages,
  StorySearchScope,
} from "../storyNavigator";
import {
  IconBookmark,
  IconChevronLeft,
  IconChevronRight,
  IconSearch,
  IconX,
} from "./Icons";

interface StoryNavigatorProps {
  show: boolean;
  messages: Message[];
  userName: string;
  assistantName: string;
  theme: Theme;
  onClose: () => void;
  onJump: (index: number) => void;
  onToggleBookmark: (index: number) => void;
}

const SCOPES: Array<{ value: StorySearchScope; label: string }> = [
  { value: "all", label: "Everyone" },
  { value: "user", label: "You" },
  { value: "assistant", label: "Characters" },
  { value: "narrator", label: "Narration" },
];

function resultTime(timestamp: Date): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Searchable, keyboard-friendly index for a story. It deliberately operates on
 * the visible transcript only: a result always jumps to the exact words the
 * reader can see, including the currently selected swipe.
 */
export function StoryNavigator({
  show,
  messages,
  userName,
  assistantName,
  theme,
  onClose,
  onJump,
  onToggleBookmark,
}: StoryNavigatorProps) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<StorySearchScope>("all");
  const [bookmarksOnly, setBookmarksOnly] = useState(false);
  const [activeResult, setActiveResult] = useState(0);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultRefs = useRef<Array<HTMLDivElement | null>>([]);

  const results = useMemo(
    () => filterStoryMessages(messages, {
      query,
      scope,
      bookmarksOnly,
      userName,
      assistantName,
    }),
    [messages, query, scope, bookmarksOnly, userName, assistantName],
  );
  const bookmarkCount = useMemo(
    () => messages.filter((message) => message.bookmarked).length,
    [messages],
  );
  const activeResultAnnouncement = useMemo(() => {
    const result = results[activeResult];
    if (!result) return "No story results available.";

    const excerpt = result.message.content.replace(/\s+/g, " ").trim() || "Empty message";
    const shortenedExcerpt = excerpt.length > 120
      ? `${excerpt.slice(0, 117)}…`
      : excerpt;
    return `Result ${activeResult + 1} of ${results.length}: ${result.speaker}. ${shortenedExcerpt}`;
  }, [activeResult, results]);

  useEffect(() => {
    if (!show) return;
    setActiveResult(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [show]);

  useEffect(() => {
    setActiveResult(0);
  }, [query, scope, bookmarksOnly]);

  useEffect(() => {
    setActiveResult((current) => Math.min(current, Math.max(0, results.length - 1)));
  }, [results.length]);

  useEffect(() => {
    if (!show || results.length === 0) return;
    resultRefs.current[activeResult]?.scrollIntoView({ block: "nearest" });
  }, [activeResult, results.length, show]);

  if (!show) return null;

  const moveSelection = (delta: number) => {
    if (results.length === 0) return;
    setActiveResult((current) => (current + delta + results.length) % results.length);
  };

  const jumpToActive = () => {
    const result = results[activeResult];
    if (result) onJump(result.index);
  };

  const clearQuery = () => {
    setQuery("");
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const toggleResultBookmark = (index: number, isBookmarked: boolean) => {
    onToggleBookmark(index);
    if (bookmarksOnly && isBookmarked) {
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1);
      inputRef.current?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1);
      inputRef.current?.focus();
    } else if (event.key === "Enter" && event.target === inputRef.current) {
      event.preventDefault();
      jumpToActive();
    } else if (event.key === "Tab") {
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) || [],
      );
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
    }
  };

  const resultLabel = query.trim()
    ? `${results.length} ${results.length === 1 ? "match" : "matches"}`
    : `${results.length} ${results.length === 1 ? "moment" : "moments"}`;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal-card story-navigator"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Story navigator"
        style={{ width: 720, maxWidth: "94vw", height: 650, maxHeight: "86vh" }}
      >
        <div className="story-nav-header">
          <IconSearch size={18} style={{ color: theme.colors.primary }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: theme.colors.textPrimary }}>
              Story navigator
            </div>
            <div style={{ fontSize: 11.5, color: theme.colors.textTertiary }}>
              Find any line, or return to a moment you bookmarked
            </div>
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            title="Close story navigator"
            aria-label="Close Story navigator"
          >
            <IconX size={16} />
          </button>
        </div>

        <div className="story-nav-controls">
          <div style={{ position: "relative" }}>
            <IconSearch
              size={15}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: theme.colors.textTertiary,
                pointerEvents: "none",
              }}
            />
            <input
              ref={inputRef}
              className="input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search dialogue, narration, or a speaker…"
              aria-label="Search this story"
              aria-controls="story-nav-results"
              style={{ width: "100%", paddingLeft: 36, paddingRight: 34 }}
            />
            {query && (
              <button
                className="icon-btn sm"
                onClick={clearQuery}
                title="Clear search"
                aria-label="Clear story search"
                style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)" }}
              >
                <IconX size={13} />
              </button>
            )}
          </div>

          <div className="story-nav-filter-row">
            <div className="seg" role="group" aria-label="Filter by speaker">
              {SCOPES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  data-active={scope === option.value}
                  aria-pressed={scope === option.value}
                  onClick={() => setScope(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <button
              className="chip"
              type="button"
              data-active={bookmarksOnly}
              onClick={() => setBookmarksOnly((current) => !current)}
              title="Show only bookmarked moments"
              aria-pressed={bookmarksOnly}
            >
              <IconBookmark size={13} />
              Bookmarks
              {bookmarkCount > 0 && <span className="story-nav-count">{bookmarkCount}</span>}
            </button>

            <span
              className="meta-mono"
              aria-live="polite"
              style={{ marginLeft: "auto", whiteSpace: "nowrap" }}
            >
              {resultLabel}
            </span>

            <button
              className="icon-btn sm"
              onClick={() => moveSelection(-1)}
              disabled={results.length === 0}
              title="Previous result (↑)"
              aria-label="Select previous result"
            >
              <IconChevronLeft size={14} />
            </button>
            <button
              className="icon-btn sm"
              onClick={() => moveSelection(1)}
              disabled={results.length === 0}
              title="Next result (↓)"
              aria-label="Select next result"
            >
              <IconChevronRight size={14} />
            </button>
          </div>
          <span
            role="status"
            aria-live="polite"
            aria-atomic="true"
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: "hidden",
              clip: "rect(0, 0, 0, 0)",
              whiteSpace: "nowrap",
              border: 0,
            }}
          >
            {activeResultAnnouncement}
          </span>
        </div>

        <div
          id="story-nav-results"
          className="story-nav-results"
          role="list"
          aria-label="Story search results"
        >
          {results.length === 0 ? (
            <div className="story-nav-empty">
              <IconSearch size={22} />
              <div style={{ color: theme.colors.textSecondary, fontFamily: theme.fonts.prose, fontStyle: "italic" }}>
                {bookmarksOnly && bookmarkCount === 0
                  ? "No moments have been bookmarked yet."
                  : "No lines in this story match those filters."}
              </div>
              <div style={{ fontSize: 12, color: theme.colors.textTertiary }}>
                Try another phrase, speaker, or bookmark filter.
              </div>
            </div>
          ) : (
            results.map((result, resultIndex) => (
              <div
                key={result.index}
                ref={(node) => { resultRefs.current[resultIndex] = node; }}
                className="story-nav-result"
                data-active={activeResult === resultIndex}
                role="listitem"
                onMouseEnter={() => setActiveResult(resultIndex)}
              >
                <button
                  id={`story-nav-result-${result.index}`}
                  type="button"
                  className="story-nav-result-main"
                  aria-current={activeResult === resultIndex ? "true" : undefined}
                  onClick={() => onJump(result.index)}
                  onFocus={() => setActiveResult(resultIndex)}
                >
                  <span className="story-nav-turn">#{result.index + 1}</span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="story-nav-result-meta">
                      <strong>{result.speaker}</strong>
                      {result.message.unprompted && <span>spoke first</span>}
                      <span>{resultTime(result.message.timestamp)}</span>
                    </span>
                    <span className="story-nav-snippet">
                      {result.message.content.trim() || "(empty message)"}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-btn story-nav-bookmark"
                  data-active={result.message.bookmarked === true}
                  onClick={() => toggleResultBookmark(
                    result.index,
                    result.message.bookmarked === true,
                  )}
                  title={result.message.bookmarked ? "Remove bookmark" : "Bookmark this moment"}
                  aria-label={
                    result.message.bookmarked
                      ? `Remove bookmark from message ${result.index + 1}`
                      : `Bookmark message ${result.index + 1}`
                  }
                  aria-pressed={result.message.bookmarked === true}
                >
                  <IconBookmark size={15} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="story-nav-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> choose</span>
          <span><kbd>Enter</kbd> jump</span>
          <span><kbd>Esc</kbd> close</span>
          <span style={{ marginLeft: "auto" }}>
            <IconBookmark size={12} /> Bookmarks travel with saved stories
          </span>
        </div>
      </div>
    </div>
  );
}
