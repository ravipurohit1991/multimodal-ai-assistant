import {
  CharacterStudyState,
  DEFAULT_CHARACTER_STUDY,
  STUDY_FACETS,
  STUDY_FIRM_AT,
  StudyEvidence,
  StudyFacet,
  StudyStatus,
  StudyTrait,
} from "./types";

/** How long a trait may go unobserved before it stops being current. */
export const STUDY_FADE_AFTER_TURNS = 80;

/** The human participant, as a rename-proof token rather than a display name. */
export const STUDY_USER = "@user";

export type StudyFilter = "current" | "provisional" | "faded" | "all";

export interface StudyCounts {
  total: number;
  /** Traits established enough to shape a reply. */
  firm: number;
  /** Seen once — recorded, but not yet shaping anything. */
  provisional: number;
  faded: number;
  pinned: number;
  /** Traits the reader wrote themself. */
  authored: number;
}

export interface StudyDraft {
  character: string;
  facet: StudyFacet;
  text: string;
  about: string;
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

/** The case- and space-insensitive identity two character names share. */
export function studyKey(name: unknown): string {
  return cleanString(name).toLocaleLowerCase();
}

export function isStudyUser(name: string): boolean {
  return studyKey(name) === studyKey(STUDY_USER);
}

/** Render a stored participant for display; the user token becomes their name. */
export function studyParticipantLabel(name: string, userName: string): string {
  return isStudyUser(name) ? (userName.trim() || "You") : name;
}

function normalizeFacet(value: unknown): StudyFacet {
  const candidate = studyKey(value) as StudyFacet;
  return STUDY_FACETS.includes(candidate) ? candidate : "manner";
}

function normalizeEvidence(value: unknown): StudyEvidence[] {
  const raw = Array.isArray(value) ? value : [];
  const rows: StudyEvidence[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      if (item.trim()) rows.push({ quote: cleanString(item), turn: 0 });
      continue;
    }
    const record = asRecord(item);
    if (!record) continue;
    const quote = cleanString(record.quote ?? record.text);
    if (!quote) continue;
    rows.push({ quote, turn: nonNegativeInteger(record.turn) });
  }
  return rows;
}

/** Coerce one persisted or backend value into the stable frontend shape. */
export function normalizeStudyTrait(value: unknown, fallbackIndex = 0): StudyTrait | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const text = cleanString(raw.text);
  const character = cleanString(raw.character);
  if (!text || !character) return null;

  const facet = normalizeFacet(raw.facet);
  const firstTurn = nonNegativeInteger(raw.firstTurn ?? raw.first_turn ?? raw.turn);
  return {
    id: cleanString(raw.id) || `trait_${fallbackIndex + 1}`,
    character,
    facet,
    text,
    // Only a bond points at somebody else; anywhere else it would render as noise.
    about: facet === "bond" ? cleanString(raw.about) : "",
    evidence: normalizeEvidence(raw.evidence),
    observations: Math.max(1, nonNegativeInteger(raw.observations, 1)),
    firstTurn,
    lastTurn: Math.max(firstTurn, nonNegativeInteger(raw.lastTurn ?? raw.last_turn)),
    origin: raw.origin === "authored" ? "authored" : "learned",
    pinned: raw.pinned === true,
    history: normalizeEvidence(raw.history),
  };
}

/**
 * Normalize saved or server-owned state without retaining references to the
 * input. Blank traits are ignored and duplicate ids are made deterministic.
 */
export function normalizeCharacterStudyState(value: unknown): CharacterStudyState {
  const raw = asRecord(value);
  if (!raw) return { ...DEFAULT_CHARACTER_STUDY, traits: [], locked: [] };

  const rawTraits = Array.isArray(raw.traits) ? raw.traits : [];
  const seenIds = new Map<string, number>();
  const traits: StudyTrait[] = [];

  rawTraits.forEach((candidate, index) => {
    const normalized = normalizeStudyTrait(candidate, index);
    if (!normalized) return;
    const occurrences = (seenIds.get(normalized.id) || 0) + 1;
    seenIds.set(normalized.id, occurrences);
    traits.push({
      ...normalized,
      id: occurrences === 1 ? normalized.id : `${normalized.id}_${occurrences}`,
    });
  });

  const locked: string[] = [];
  const seenLocks = new Set<string>();
  for (const name of Array.isArray(raw.locked) ? raw.locked : []) {
    const cleaned = cleanString(name);
    if (!cleaned || seenLocks.has(studyKey(cleaned))) continue;
    seenLocks.add(studyKey(cleaned));
    locked.push(cleaned);
  }

  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_CHARACTER_STUDY.enabled,
    auto: typeof raw.auto === "boolean" ? raw.auto : DEFAULT_CHARACTER_STUDY.auto,
    watch: typeof raw.watch === "boolean" ? raw.watch : DEFAULT_CHARACTER_STUDY.watch,
    interval: Math.min(40, Math.max(2, nonNegativeInteger(raw.interval, DEFAULT_CHARACTER_STUDY.interval))),
    traits,
    locked,
    covered: nonNegativeInteger(raw.covered),
    total: nonNegativeInteger(raw.total),
  };
}

/** Map the browser model onto the backend wire shape. */
export function serializeStudyTraits(traits: readonly StudyTrait[]) {
  return traits.map((trait) => ({
    id: trait.id,
    character: trait.character,
    facet: trait.facet,
    text: trait.text,
    about: trait.about,
    evidence: trait.evidence,
    observations: trait.observations,
    first_turn: trait.firstTurn,
    last_turn: trait.lastTurn,
    origin: trait.origin,
    pinned: trait.pinned,
    history: trait.history,
  }));
}

/**
 * Whether a trait is established enough to shape a reply. Anything the reader
 * wrote or pinned counts at once — there is nothing to be confident about.
 */
export function isStudyTraitFirm(trait: StudyTrait): boolean {
  return trait.pinned || trait.origin === "authored" || trait.observations >= STUDY_FIRM_AT;
}

/**
 * Where a trait stands right now. Derived rather than stored, because "faded"
 * depends on how far the story has moved on since it was last seen.
 */
export function studyTraitStatus(trait: StudyTrait, total: number): StudyStatus {
  if (!isStudyTraitFirm(trait)) return "provisional";
  if (trait.pinned || trait.origin === "authored") return "firm";
  if (total && total - trait.lastTurn > STUDY_FADE_AFTER_TURNS) return "faded";
  return "firm";
}

export function traitsForCharacter(
  traits: readonly StudyTrait[],
  character: string,
): StudyTrait[] {
  const target = studyKey(character);
  if (!target) return [];
  return traits.filter((trait) => studyKey(trait.character) === target);
}

export function isStudyLocked(locked: readonly string[], character: string): boolean {
  const target = studyKey(character);
  return locked.some((name) => studyKey(name) === target);
}

export function countStudy(traits: readonly StudyTrait[], total: number): StudyCounts {
  let firm = 0;
  let provisional = 0;
  let faded = 0;
  let pinned = 0;
  let authored = 0;

  for (const trait of traits) {
    const status = studyTraitStatus(trait, total);
    if (status === "firm") firm += 1;
    else if (status === "provisional") provisional += 1;
    else faded += 1;
    if (trait.pinned) pinned += 1;
    if (trait.origin === "authored") authored += 1;
  }

  return { total: traits.length, firm, provisional, faded, pinned, authored };
}

/**
 * A one-line "who they have become", composed from the sheet itself rather than
 * written by the model. Reads the strongest established observations, voice
 * first, because that is what a reader recognises a character by.
 */
export function studySummaryLine(traits: readonly StudyTrait[], total: number): string {
  const order: StudyFacet[] = ["voice", "manner", "bond", "want", "mark"];
  const established = traits
    .filter((trait) => studyTraitStatus(trait, total) === "firm" && trait.facet !== "line")
    .sort((left, right) => (
      order.indexOf(left.facet) - order.indexOf(right.facet)
      || right.observations - left.observations
      || right.lastTurn - left.lastTurn
    ));
  if (established.length === 0) return "";
  return established
    .slice(0, 3)
    .map((trait) => {
      const text = trait.text.replace(/\.$/, "");
      return text.charAt(0).toLocaleLowerCase() + text.slice(1);
    })
    .join("; ");
}

/**
 * Reading order for the card: established first, pinned above the rest, then
 * whatever the story saw most recently.
 */
export function sortStudyTraits(
  traits: readonly StudyTrait[],
  total: number,
): StudyTrait[] {
  const rank: Record<StudyStatus, number> = { firm: 0, provisional: 1, faded: 2 };
  return [...traits].sort((left, right) => (
    rank[studyTraitStatus(left, total)] - rank[studyTraitStatus(right, total)]
    || Number(right.pinned) - Number(left.pinned)
    || STUDY_FACETS.indexOf(left.facet) - STUDY_FACETS.indexOf(right.facet)
    || right.lastTurn - left.lastTurn
    || left.text.localeCompare(right.text)
  ));
}

export function filterStudyTraits(
  traits: readonly StudyTrait[],
  total: number,
  filter: StudyFilter,
  query = "",
): StudyTrait[] {
  const needle = query.trim().toLocaleLowerCase();
  const selected = traits.filter((trait) => {
    const status = studyTraitStatus(trait, total);
    const matchesFilter = filter === "all"
      || (filter === "current" ? status === "firm" : status === filter);
    if (!matchesFilter) return false;
    if (!needle) return true;
    const haystack = [
      trait.text,
      trait.facet,
      trait.about,
      ...trait.evidence.map((row) => row.quote),
    ].join("\n").toLocaleLowerCase();
    return haystack.includes(needle);
  });
  return sortStudyTraits(selected, total);
}

export function updateStudyTrait(
  traits: readonly StudyTrait[],
  id: string,
  patch: Partial<StudyTrait>,
): StudyTrait[] {
  return traits.map((trait) => (
    trait.id === id ? { ...trait, ...patch, id: trait.id } : trait
  ));
}

/**
 * Rewrite one observation by hand, keeping the old wording in its history — the
 * same bookkeeping the backend does when the story revises a trait, so an edit
 * made here still shows up on the timeline as a change rather than a silent swap.
 */
export function reviseStudyTrait(
  traits: readonly StudyTrait[],
  id: string,
  text: string,
): StudyTrait[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return traits.map((trait) => {
    if (trait.id !== id || !cleaned || cleaned === trait.text) return trait;
    return {
      ...trait,
      text: cleaned,
      history: [...trait.history, { quote: trait.text, turn: trait.lastTurn }].slice(-6),
    };
  });
}

export function removeStudyTrait(
  traits: readonly StudyTrait[],
  id: string,
): StudyTrait[] {
  return traits.filter((trait) => trait.id !== id);
}

/**
 * Move a character's whole sheet to a new name.
 *
 * The backend keys a study by character name, because names are all it is ever
 * told about the roster. Renaming a character in the card would therefore orphan
 * everything the story had learned about them, which is a genuinely upsetting way
 * to lose two hundred turns of observation.
 */
export function renameStudySubject(
  traits: readonly StudyTrait[],
  from: string,
  to: string,
): StudyTrait[] {
  const source = studyKey(from);
  const target = to.replace(/\s+/g, " ").trim();
  if (!source || !target || source === studyKey(target)) return [...traits];
  return traits.map((trait) => (
    studyKey(trait.character) === source ? { ...trait, character: target } : trait
  ));
}

export function renameStudyLock(
  locked: readonly string[],
  from: string,
  to: string,
): string[] {
  const source = studyKey(from);
  const target = to.replace(/\s+/g, " ").trim();
  if (!source || !target) return [...locked];
  return locked.map((name) => (studyKey(name) === source ? target : name));
}

export interface StudyTimelineEntry {
  turn: number;
  kind: "appeared" | "established" | "changed";
  trait: StudyTrait;
  /** For a change, what the line used to say. */
  previous?: string;
}

/**
 * The arc: when each observation appeared, firmed up, or changed, newest first.
 *
 * This is what makes evolution visible rather than merely true — the card can
 * show that a character *became* guarded at turn 40 and stopped being it by 130,
 * instead of only ever showing what they are now.
 */
export function studyTimeline(
  traits: readonly StudyTrait[],
  total: number,
): StudyTimelineEntry[] {
  const entries: StudyTimelineEntry[] = [];
  for (const trait of traits) {
    entries.push({ turn: trait.firstTurn, kind: "appeared", trait });
    // A history row holds what the line *used* to say, so each one is a change
    // recorded at the turn the story revised it.
    for (const row of trait.history) {
      entries.push({ turn: row.turn, kind: "changed", trait, previous: row.quote });
    }
    if (
      trait.origin === "learned"
      && !trait.pinned
      && trait.observations >= STUDY_FIRM_AT
      && trait.lastTurn > trait.firstTurn
    ) {
      entries.push({ turn: trait.lastTurn, kind: "established", trait });
    }
  }
  return entries.sort((left, right) => (
    right.turn - left.turn || left.trait.text.localeCompare(right.trait.text)
  )).filter((entry) => entry.turn <= Math.max(total, entry.turn));
}
