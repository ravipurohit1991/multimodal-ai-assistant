import { LorebookEntry } from "./types";

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Trigger a browser download of an object serialized as pretty JSON. */
export function downloadJson(filename: string, obj: unknown) {
  downloadBlob(filename, new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
}

/** Trigger a browser download of plain text (e.g. an exported Markdown story). */
export function downloadText(filename: string, text: string, mime = "text/markdown") {
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}

/** Read a File as parsed JSON. Rejects on invalid JSON. */
export function readJsonFile(file: File): Promise<any> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result as string));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function makeId(): string {
  return `lore_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** First candidate that is a non-empty (trimmed) string. */
function firstNonEmpty(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

function coerceKeys(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (Array.isArray(c) && c.length) {
      const joined = c.filter((k) => typeof k === "string" && k.trim()).join(", ");
      if (joined) return joined;
    }
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

function orderKey(raw: any): number {
  const candidates = [raw?.displayIndex, raw?.order, raw?.insertion_order, raw?.uid, raw?.id];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
  }
  return Number.MAX_SAFE_INTEGER;
}

function normalizeEntry(raw: any): LorebookEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const content = firstNonEmpty(raw.content, raw.text, raw.entry);
  // SillyTavern uses "comment"/"name" for the title; native export uses "title".
  // Note: comment can be empty while name is set, so skip empty strings.
  const title = firstNonEmpty(raw.title, raw.comment, raw.name);
  const keys = coerceKeys(raw.keys, raw.key, raw.keysecondary, raw.secondary_keys);

  // Only import entries that actually carry text to inject.
  if (!content) return null;

  const constant = Boolean(raw.constant ?? false);
  let enabled: boolean;
  if (typeof raw.enabled === "boolean") enabled = raw.enabled;
  else if (typeof raw.disable === "boolean") enabled = !raw.disable;
  else if (typeof raw.disabled === "boolean") enabled = !raw.disabled;
  else enabled = true;

  return { id: makeId(), title, keys, content, enabled, constant };
}

/**
 * Convert a parsed lorebook JSON into our LorebookEntry[]. Handles:
 *  - SillyTavern world info: { entries: { "0": {...}, "1": {...} } }
 *  - Character-card embedded books: { character_book: { entries: [...] } }
 *  - Our native export: { entries: [ {title, keys, content, ...} ] }
 *  - A bare array of entries.
 */
export function parseLorebookJson(data: any): LorebookEntry[] {
  let rawEntries: any[] = [];

  const entriesFrom = (obj: any): any[] | null => {
    if (!obj) return null;
    if (Array.isArray(obj.entries)) return obj.entries;
    if (obj.entries && typeof obj.entries === "object") return Object.values(obj.entries);
    return null;
  };

  if (Array.isArray(data)) {
    rawEntries = data;
  } else if (data && typeof data === "object") {
    rawEntries =
      entriesFrom(data) ??
      entriesFrom(data.character_book) ??
      entriesFrom(data.data?.character_book) ??
      entriesFrom(data.originalData) ??
      [];
  }

  rawEntries = [...rawEntries].sort((a, b) => orderKey(a) - orderKey(b));
  return rawEntries.map(normalizeEntry).filter((e): e is LorebookEntry => e !== null);
}
