import {
  DEFAULT_SIGHTLINES,
  SIGHTLINE_USER,
  SightlineEntry,
  SightlinesState,
} from "./types";

export type SightlineFilter = "private" | "shared" | "all";

export interface SightlineCounts {
  total: number;
  /** Entries at least one participant is being kept out of. */
  private: number;
  /** Entries everyone present already knows — ordinary context, not a secret. */
  shared: number;
  pinned: number;
  /** Entries the reader themself has not been let in on. */
  hiddenFromUser: number;
}

export interface SightlineDraft {
  text: string;
  topic: string;
  knows: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

/** The case- and space-insensitive identity two participant names share. */
export function participantKey(name: unknown): string {
  return cleanString(name).toLocaleLowerCase();
}

export function isUserParticipant(name: string): boolean {
  return participantKey(name) === participantKey(SIGHTLINE_USER);
}

/** Render a stored participant for display; the user token becomes their name. */
export function participantLabel(name: string, userName: string): string {
  return isUserParticipant(name) ? (userName.trim() || "You") : name;
}

export function knowsSightline(entry: SightlineEntry, name: string): boolean {
  const target = participantKey(name);
  if (!target) return false;
  return entry.knows.some((knower) => participantKey(knower) === target);
}

/**
 * Whether anyone present is being kept out of this entry. An entry everyone
 * knows is not a sightline at all — it is ordinary shared context, and the
 * backend leaves it out of the prompt entirely.
 */
export function isPrivateSightline(
  entry: SightlineEntry,
  participants: readonly string[],
): boolean {
  return participants.some((name) => !knowsSightline(entry, name));
}

function normalizeKnowers(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const knowers: string[] = [];
  for (const item of raw) {
    const name = cleanString(item);
    if (!name) continue;
    const stored = participantKey(name) === "user" ? SIGHTLINE_USER : name;
    const key = participantKey(stored);
    if (seen.has(key)) continue;
    seen.add(key);
    knowers.push(stored);
  }
  return knowers;
}

/** Coerce one persisted or backend value into the stable frontend shape. */
export function normalizeSightlineEntry(
  value: unknown,
  fallbackIndex = 0,
): SightlineEntry | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const text = cleanString(raw.text);
  if (!text) return null;

  return {
    id: cleanString(raw.id) || `sightline_${fallbackIndex + 1}`,
    topic: cleanString(raw.topic),
    text,
    knows: normalizeKnowers(raw.knows ?? raw.audience),
    pinned: raw.pinned === true,
    turn: nonNegativeInteger(raw.turn),
  };
}

/**
 * Normalize saved or server-owned state without retaining references to the
 * input. Blank entries are ignored and duplicate ids are made deterministic.
 */
export function normalizeSightlinesState(value: unknown): SightlinesState {
  const raw = asRecord(value);
  if (!raw) return { ...DEFAULT_SIGHTLINES, entries: [], participants: [] };

  const rawEntries = Array.isArray(raw.entries) ? raw.entries : [];
  const seenIds = new Map<string, number>();
  const entries: SightlineEntry[] = [];

  rawEntries.forEach((candidate, index) => {
    const normalized = normalizeSightlineEntry(candidate, index);
    if (!normalized) return;
    const occurrences = (seenIds.get(normalized.id) || 0) + 1;
    seenIds.set(normalized.id, occurrences);
    entries.push({
      ...normalized,
      id: occurrences === 1 ? normalized.id : `${normalized.id}_${occurrences}`,
    });
  });

  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_SIGHTLINES.enabled,
    auto: typeof raw.auto === "boolean" ? raw.auto : DEFAULT_SIGHTLINES.auto,
    entries,
    participants: normalizeKnowers(raw.participants),
    covered: nonNegativeInteger(raw.covered),
  };
}

/** Map the browser model onto the backend wire shape. */
export function serializeSightlines(entries: readonly SightlineEntry[]) {
  return entries.map((entry) => ({
    id: entry.id,
    topic: entry.topic,
    text: entry.text,
    knows: entry.knows,
    pinned: entry.pinned,
    turn: entry.turn,
  }));
}

export function countSightlines(
  entries: readonly SightlineEntry[],
  participants: readonly string[],
): SightlineCounts {
  let privateCount = 0;
  let pinned = 0;
  let hiddenFromUser = 0;

  for (const entry of entries) {
    if (isPrivateSightline(entry, participants)) privateCount += 1;
    if (entry.pinned) pinned += 1;
    if (!knowsSightline(entry, SIGHTLINE_USER)) hiddenFromUser += 1;
  }

  return {
    total: entries.length,
    private: privateCount,
    shared: entries.length - privateCount,
    pinned,
    hiddenFromUser,
  };
}

/**
 * Return a new list in reading order: what is being withheld first, pinned
 * material first within that, then the most recently established.
 */
export function sortSightlines(
  entries: readonly SightlineEntry[],
  participants: readonly string[],
): SightlineEntry[] {
  return [...entries].sort((left, right) => (
    Number(isPrivateSightline(right, participants))
      - Number(isPrivateSightline(left, participants))
    || Number(right.pinned) - Number(left.pinned)
    || right.turn - left.turn
    || left.text.localeCompare(right.text)
  ));
}

export function filterSightlines(
  entries: readonly SightlineEntry[],
  participants: readonly string[],
  filter: SightlineFilter,
  query = "",
): SightlineEntry[] {
  const needle = query.trim().toLocaleLowerCase();
  const selected = entries.filter((entry) => {
    const withheld = isPrivateSightline(entry, participants);
    const matchesFilter = filter === "all"
      || (filter === "private" ? withheld : !withheld);
    if (!matchesFilter) return false;
    if (!needle) return true;
    return `${entry.topic}\n${entry.text}\n${entry.knows.join(" ")}`
      .toLocaleLowerCase()
      .includes(needle);
  });
  return sortSightlines(selected, participants);
}

export function updateSightlineEntry(
  entries: readonly SightlineEntry[],
  id: string,
  patch: Partial<SightlineEntry>,
): SightlineEntry[] {
  return entries.map((entry) => (
    entry.id === id ? { ...entry, ...patch, id: entry.id } : entry
  ));
}

export function removeSightlineEntry(
  entries: readonly SightlineEntry[],
  id: string,
): SightlineEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

/**
 * Add or remove one participant from an entry's audience. Names are stored as
 * given rather than snapped to the current cast, so a character who steps out of
 * a scene does not silently forget what they were told.
 */
export function toggleKnower(
  entries: readonly SightlineEntry[],
  id: string,
  name: string,
): SightlineEntry[] {
  return entries.map((entry) => {
    if (entry.id !== id) return entry;
    const key = participantKey(name);
    if (!key) return entry;
    return knowsSightline(entry, name)
      ? { ...entry, knows: entry.knows.filter((knower) => participantKey(knower) !== key) }
      : { ...entry, knows: [...entry.knows, name] };
  });
}
