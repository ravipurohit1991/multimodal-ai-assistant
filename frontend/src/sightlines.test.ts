import { describe, expect, it } from "vitest";
import { SIGHTLINE_USER, type SightlineEntry } from "./types";
import {
  countSightlines,
  filterSightlines,
  isPrivateSightline,
  knowsSightline,
  normalizeSightlinesState,
  participantLabel,
  removeSightlineEntry,
  serializeSightlines,
  sortSightlines,
  toggleKnower,
  updateSightlineEntry,
} from "./sightlines";

const CAST = ["Mira", "Tomas", SIGHTLINE_USER];

function entry(
  id: string,
  knows: string[],
  overrides: Partial<SightlineEntry> = {},
): SightlineEntry {
  return {
    id,
    topic: `topic ${id}`,
    text: `Something known as ${id}`,
    knows,
    pinned: false,
    turn: 1,
    ...overrides,
  };
}

describe("normalizeSightlinesState", () => {
  it("keeps ids, folds the user alias, and rejects entries with no content", () => {
    const normalized = normalizeSightlinesState({
      enabled: true,
      auto: true,
      covered: "4.8",
      participants: ["Mira", "user"],
      entries: [
        {
          id: "keep",
          topic: "what happened to the wine",
          text: "  Mira   poisoned the wine ",
          knows: ["Mira", "user", "Mira"],
          pinned: true,
          turn: "3",
        },
        { text: "   " },
        "not an entry",
        { id: "keep", text: "A different secret." },
      ],
    });

    expect(normalized.covered).toBe(4);
    expect(normalized.participants).toEqual(["Mira", SIGHTLINE_USER]);
    expect(normalized.entries).toHaveLength(2);
    expect(normalized.entries[0]).toMatchObject({
      id: "keep",
      text: "Mira poisoned the wine",
      knows: ["Mira", SIGHTLINE_USER],
      pinned: true,
      turn: 3,
    });
    // A duplicate id is made deterministic rather than silently shadowing.
    expect(normalized.entries[1].id).toBe("keep_2");
  });

  it("falls back to defaults for anything unusable", () => {
    const normalized = normalizeSightlinesState(null);

    expect(normalized.entries).toEqual([]);
    expect(normalized.participants).toEqual([]);
    expect(normalized.enabled).toBe(false);
    expect(normalized.auto).toBe(false);
  });
});

describe("audiences", () => {
  it("treats something everyone present knows as shared context, not a secret", () => {
    expect(isPrivateSightline(entry("a", CAST), CAST)).toBe(false);
    expect(isPrivateSightline(entry("b", ["Mira"]), CAST)).toBe(true);
  });

  it("matches participants regardless of case and spacing", () => {
    expect(knowsSightline(entry("a", ["Mira "]), "  mira")).toBe(true);
    expect(knowsSightline(entry("a", ["Mira"]), "Tomas")).toBe(false);
    expect(knowsSightline(entry("a", ["Mira"]), "   ")).toBe(false);
  });

  it("renders the user token as the reader's own name", () => {
    expect(participantLabel(SIGHTLINE_USER, "Alex")).toBe("Alex");
    expect(participantLabel(SIGHTLINE_USER, "  ")).toBe("You");
    expect(participantLabel("Mira", "Alex")).toBe("Mira");
  });

  it("lets a participant in and back out again without touching the others", () => {
    const entries = [entry("a", ["Mira"]), entry("b", ["Tomas"])];

    const granted = toggleKnower(entries, "a", "Tomas");
    expect(granted[0].knows).toEqual(["Mira", "Tomas"]);
    expect(granted[1]).toBe(entries[1]);

    const revoked = toggleKnower(granted, "a", " tomas ");
    expect(revoked[0].knows).toEqual(["Mira"]);
  });

  it("keeps a knower who has stepped out of the current scene", () => {
    // Snapping audiences to the cast would make a character forget what they
    // were told the moment they leave a scene.
    const entries = toggleKnower([entry("a", ["Mira"])], "a", "Off-scene Rook");

    expect(entries[0].knows).toEqual(["Mira", "Off-scene Rook"]);
    expect(isPrivateSightline(entries[0], CAST)).toBe(true);
  });
});

describe("counting and ordering", () => {
  it("separates what is withheld from what is shared, and what is hidden from you", () => {
    const counts = countSightlines(
      [entry("a", ["Mira"]), entry("b", CAST), entry("c", CAST, { pinned: true })],
      CAST,
    );

    expect(counts).toEqual({
      total: 3,
      private: 1,
      shared: 2,
      pinned: 1,
      hiddenFromUser: 1,
    });
  });

  it("puts withheld material first, then pins, then the most recent", () => {
    const ordered = sortSightlines(
      [
        entry("shared", CAST, { turn: 9 }),
        entry("old-secret", ["Mira"], { turn: 2 }),
        entry("new-secret", ["Mira"], { turn: 8 }),
        entry("pinned-secret", ["Mira"], { turn: 1, pinned: true }),
      ],
      CAST,
    );

    expect(ordered.map((item) => item.id)).toEqual([
      "pinned-secret",
      "new-secret",
      "old-secret",
      "shared",
    ]);
  });

  it("filters by whether anyone is being kept out, and searches every field", () => {
    const entries = [
      entry("a", ["Mira"], { topic: "the wine", text: "Mira poisoned it" }),
      entry("b", CAST, { topic: "the weather", text: "It is raining" }),
    ];

    expect(filterSightlines(entries, CAST, "private").map((item) => item.id)).toEqual(["a"]);
    expect(filterSightlines(entries, CAST, "shared").map((item) => item.id)).toEqual(["b"]);
    expect(filterSightlines(entries, CAST, "all", "WINE").map((item) => item.id)).toEqual(["a"]);
    expect(filterSightlines(entries, CAST, "all", "Tomas").map((item) => item.id)).toEqual(["b"]);
  });
});

describe("editing", () => {
  it("patches one entry without letting its id be rewritten", () => {
    const entries = [entry("a", ["Mira"]), entry("b", ["Tomas"])];

    const updated = updateSightlineEntry(entries, "a", {
      text: "Reworded.",
      id: "hijacked",
    } as Partial<SightlineEntry>);

    expect(updated[0].id).toBe("a");
    expect(updated[0].text).toBe("Reworded.");
    expect(updated[1]).toBe(entries[1]);
  });

  it("removes exactly one entry", () => {
    const entries = [entry("a", ["Mira"]), entry("b", ["Tomas"])];

    expect(removeSightlineEntry(entries, "a").map((item) => item.id)).toEqual(["b"]);
  });

  it("round-trips through the wire shape without losing an audience", () => {
    const entries = [entry("a", ["Mira", SIGHTLINE_USER], { pinned: true, turn: 6 })];

    const restored = normalizeSightlinesState({
      entries: serializeSightlines(entries),
    });

    expect(restored.entries).toEqual(entries);
  });
});
