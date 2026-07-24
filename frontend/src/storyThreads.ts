import {
  DEFAULT_STORY_THREADS,
  StoryThread,
  StoryThreadKind,
  StoryThreadsState,
  StoryThreadStatus,
} from "./types";

export const STORY_THREAD_KINDS: readonly StoryThreadKind[] = [
  "goal",
  "promise",
  "mystery",
  "secret",
  "threat",
  "relationship",
  "other",
];

export const STORY_THREAD_STATUSES: readonly StoryThreadStatus[] = [
  "active",
  "resolved",
  "dropped",
];

export const STORY_THREAD_KIND_LABELS: Record<StoryThreadKind, string> = {
  goal: "Goal",
  promise: "Promise",
  mystery: "Mystery",
  secret: "Secret",
  threat: "Threat",
  relationship: "Relationship",
  other: "Other",
};

export const STORY_THREAD_STATUS_LABELS: Record<StoryThreadStatus, string> = {
  active: "In play",
  resolved: "Resolved",
  dropped: "Dropped",
};

export type StoryThreadFilter =
  | "active"
  | "resolved"
  | "dropped"
  | "archived"
  | "all";

export interface StoryThreadCounts {
  total: number;
  active: number;
  resolved: number;
  dropped: number;
  archived: number;
  pinned: number;
  pinnedActive: number;
}

export interface StoryThreadDraft {
  title: string;
  summary: string;
  kind: StoryThreadKind;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

function isKind(value: unknown): value is StoryThreadKind {
  return typeof value === "string"
    && STORY_THREAD_KINDS.includes(value as StoryThreadKind);
}

function isStatus(value: unknown): value is StoryThreadStatus {
  return typeof value === "string"
    && STORY_THREAD_STATUSES.includes(value as StoryThreadStatus);
}

function titleFromSummary(summary: string): string {
  const firstLine = summary.split(/\r?\n/, 1)[0]?.trim() || "";
  if (firstLine.length <= 80) return firstLine;
  return `${firstLine.slice(0, 77).trimEnd()}…`;
}

/**
 * Coerce one persisted/backend value into the stable frontend shape.
 * Snake-case wire fields and the early `detail` prototype are accepted so a
 * story remains portable across app versions.
 */
export function normalizeStoryThread(
  value: unknown,
  fallbackIndex = 0,
): StoryThread | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const summary = cleanString(raw.summary) || cleanString(raw.detail);
  const title = cleanString(raw.title) || titleFromSummary(summary);
  if (!title && !summary) return null;

  const createdTurn = nonNegativeInteger(
    raw.createdTurn ?? raw.created_turn ?? raw.turn,
  );
  const updatedTurn = Math.max(
    createdTurn,
    nonNegativeInteger(
      raw.updatedTurn ?? raw.updated_turn,
      createdTurn,
    ),
  );
  const status = isStatus(raw.status) ? raw.status : "active";
  const resolvedCandidate = raw.resolvedTurn ?? raw.resolved_turn;
  const hasResolvedTurn = resolvedCandidate !== undefined
    && resolvedCandidate !== null
    && resolvedCandidate !== "";

  return {
    id: cleanString(raw.id) || `thread_${fallbackIndex + 1}`,
    title,
    summary,
    kind: isKind(raw.kind) ? raw.kind : "other",
    status,
    pinned: raw.pinned === true,
    createdTurn,
    updatedTurn,
    ...(status !== "active" && hasResolvedTurn
      ? { resolvedTurn: nonNegativeInteger(resolvedCandidate, updatedTurn) }
      : {}),
  };
}

/**
 * Normalize saved or server-owned state without retaining references to the
 * input. Blank entries are ignored and duplicate ids are made deterministic.
 */
export function normalizeStoryThreadsState(value: unknown): StoryThreadsState {
  const raw = asRecord(value);
  if (!raw) {
    return {
      ...DEFAULT_STORY_THREADS,
      threads: [],
    };
  }

  const rawThreads = Array.isArray(raw.threads)
    ? raw.threads
    : Array.isArray(raw.items)
      ? raw.items
      : [];
  const seenIds = new Map<string, number>();
  const threads: StoryThread[] = [];

  rawThreads.forEach((candidate, index) => {
    const normalized = normalizeStoryThread(candidate, index);
    if (!normalized) return;

    const occurrences = (seenIds.get(normalized.id) || 0) + 1;
    seenIds.set(normalized.id, occurrences);
    threads.push({
      ...normalized,
      id: occurrences === 1
        ? normalized.id
        : `${normalized.id}_${occurrences}`,
    });
  });

  return {
    enabled: typeof raw.enabled === "boolean"
      ? raw.enabled
      : DEFAULT_STORY_THREADS.enabled,
    auto: typeof raw.auto === "boolean"
      ? raw.auto
      : DEFAULT_STORY_THREADS.auto,
    threads,
    covered: nonNegativeInteger(raw.covered),
  };
}

export function countStoryThreads(threads: readonly StoryThread[]): StoryThreadCounts {
  let active = 0;
  let resolved = 0;
  let dropped = 0;
  let pinned = 0;
  let pinnedActive = 0;

  for (const thread of threads) {
    if (thread.status === "active") active += 1;
    else if (thread.status === "resolved") resolved += 1;
    else dropped += 1;

    if (thread.pinned) {
      pinned += 1;
      if (thread.status === "active") pinnedActive += 1;
    }
  }

  return {
    total: threads.length,
    active,
    resolved,
    dropped,
    archived: resolved + dropped,
    pinned,
    pinnedActive,
  };
}

const STATUS_ORDER: Record<StoryThreadStatus, number> = {
  active: 0,
  resolved: 1,
  dropped: 2,
};

/**
 * Return a new dramatic-order list: unresolved material first, pinned material
 * first within each status, then the most recently changed thread.
 */
export function sortStoryThreads(
  threads: readonly StoryThread[],
): StoryThread[] {
  return [...threads].sort((left, right) => (
    STATUS_ORDER[left.status] - STATUS_ORDER[right.status]
    || Number(right.pinned) - Number(left.pinned)
    || right.updatedTurn - left.updatedTurn
    || right.createdTurn - left.createdTurn
    || left.title.localeCompare(right.title)
  ));
}

export function filterStoryThreads(
  threads: readonly StoryThread[],
  filter: StoryThreadFilter,
  query = "",
): StoryThread[] {
  const needle = query.trim().toLowerCase();
  const selected = threads.filter((thread) => {
    const matchesStatus = filter === "all"
      || (filter === "archived"
        ? thread.status !== "active"
        : thread.status === filter);
    if (!matchesStatus) return false;
    if (!needle) return true;
    return `${thread.title}\n${thread.summary}\n${thread.kind}`
      .toLowerCase()
      .includes(needle);
  });

  return sortStoryThreads(selected);
}

export function updateStoryThread(
  threads: readonly StoryThread[],
  id: string,
  patch: Partial<StoryThread>,
): StoryThread[] {
  return threads.map((thread) => (
    thread.id === id ? { ...thread, ...patch, id: thread.id } : thread
  ));
}

export function removeStoryThread(
  threads: readonly StoryThread[],
  id: string,
): StoryThread[] {
  return threads.filter((thread) => thread.id !== id);
}
