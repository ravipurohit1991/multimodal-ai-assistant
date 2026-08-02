import { describe, expect, it } from "vitest";
import { STUDY_FIRM_AT, type StudyTrait } from "./types";
import {
  STUDY_FADE_AFTER_TURNS,
  STUDY_USER,
  countStudy,
  filterStudyTraits,
  isStudyLocked,
  isStudyTraitFirm,
  normalizeCharacterStudyState,
  removeStudyTrait,
  renameStudyLock,
  renameStudySubject,
  reviseStudyTrait,
  serializeStudyTraits,
  sortStudyTraits,
  studyParticipantLabel,
  studySummaryLine,
  studyTimeline,
  studyTraitStatus,
  traitsForCharacter,
  updateStudyTrait,
} from "./characterStudy";

function trait(id: string, overrides: Partial<StudyTrait> = {}): StudyTrait {
  return {
    id,
    character: "Mira",
    facet: "voice",
    text: `Habit ${id}`,
    about: "",
    evidence: [{ quote: `words behind ${id}`, turn: 4 }],
    observations: STUDY_FIRM_AT,
    firstTurn: 4,
    lastTurn: 4,
    origin: "learned",
    pinned: false,
    history: [],
    ...overrides,
  };
}

describe("normalizeCharacterStudyState", () => {
  it("drops traits with nothing usable in them", () => {
    const state = normalizeCharacterStudyState({
      traits: [
        { id: "a", character: "Mira", text: "clips her sentences", facet: "voice" },
        { id: "b", character: "Mira", text: "   " },
        { id: "c", text: "nobody this is about" },
        "not an object",
        null,
      ],
    });
    expect(state.traits).toHaveLength(1);
    expect(state.traits[0].text).toBe("clips her sentences");
  });

  it("accepts the backend's snake_case turn fields", () => {
    const state = normalizeCharacterStudyState({
      traits: [
        {
          id: "a",
          character: "Mira",
          text: "clips her sentences",
          facet: "voice",
          first_turn: 12,
          last_turn: 88,
        },
      ],
    });
    expect(state.traits[0].firstTurn).toBe(12);
    expect(state.traits[0].lastTurn).toBe(88);
  });

  it("falls back to a real facet rather than dropping the trait", () => {
    const state = normalizeCharacterStudyState({
      traits: [{ id: "a", character: "Mira", text: "something", facet: "vibes" }],
    });
    expect(state.traits[0].facet).toBe("manner");
  });

  it("keeps `about` only on a bond", () => {
    const state = normalizeCharacterStudyState({
      traits: [
        { id: "a", character: "Mira", text: "guarded", facet: "bond", about: "Tomas" },
        { id: "b", character: "Mira", text: "clipped", facet: "voice", about: "Tomas" },
      ],
    });
    expect(state.traits[0].about).toBe("Tomas");
    expect(state.traits[1].about).toBe("");
  });

  it("makes duplicate ids deterministic instead of ambiguous", () => {
    const state = normalizeCharacterStudyState({
      traits: [
        { id: "same", character: "Mira", text: "one" },
        { id: "same", character: "Mira", text: "two" },
      ],
    });
    expect(state.traits.map((row) => row.id)).toEqual(["same", "same_2"]);
  });

  it("clamps the interval and de-duplicates locks", () => {
    expect(normalizeCharacterStudyState({ interval: 0 }).interval).toBe(2);
    expect(normalizeCharacterStudyState({ interval: 9999 }).interval).toBe(40);
    expect(normalizeCharacterStudyState({ locked: ["Mira", "mira", " "] }).locked).toEqual(["Mira"]);
  });

  it("returns a safe default for junk", () => {
    const state = normalizeCharacterStudyState("nope");
    expect(state.traits).toEqual([]);
    expect(state.enabled).toBe(false);
    expect(state.watch).toBe(false);
  });

  it("survives a round trip through the wire shape", () => {
    const original = trait("a", { facet: "bond", about: STUDY_USER, history: [{ quote: "was", turn: 2 }] });
    const restored = normalizeCharacterStudyState({
      traits: serializeStudyTraits([original]),
    });
    expect(restored.traits[0]).toEqual(original);
  });
});

describe("firmness and fading", () => {
  it("treats a single sighting as provisional", () => {
    const provisional = trait("a", { observations: 1 });
    expect(isStudyTraitFirm(provisional)).toBe(false);
    expect(studyTraitStatus(provisional, 10)).toBe("provisional");
  });

  it("treats what the reader wrote or pinned as established at once", () => {
    expect(isStudyTraitFirm(trait("a", { observations: 1, origin: "authored" }))).toBe(true);
    expect(isStudyTraitFirm(trait("b", { observations: 1, pinned: true }))).toBe(true);
  });

  it("fades a trait the story has not seen for a long stretch", () => {
    const stale = trait("a", { lastTurn: 5 });
    expect(studyTraitStatus(stale, 5 + STUDY_FADE_AFTER_TURNS + 1)).toBe("faded");
    expect(studyTraitStatus(stale, 5 + STUDY_FADE_AFTER_TURNS)).toBe("firm");
  });

  it("never fades what the reader pinned", () => {
    const pinned = trait("a", { lastTurn: 5, pinned: true });
    expect(studyTraitStatus(pinned, 100_000)).toBe("firm");
  });
});

describe("countStudy", () => {
  it("counts each trait once, by where it stands", () => {
    const counts = countStudy(
      [
        trait("a"),
        trait("b", { observations: 1 }),
        trait("c", { lastTurn: 1 }),
        trait("d", { pinned: true }),
        trait("e", { origin: "authored", observations: 1 }),
      ],
      1 + STUDY_FADE_AFTER_TURNS + 1,
    );
    expect(counts.total).toBe(5);
    expect(counts.firm).toBe(3); // a is stale too, but d and e never fade
    expect(counts.provisional).toBe(1);
    expect(counts.faded).toBe(1);
    expect(counts.pinned).toBe(1);
    expect(counts.authored).toBe(1);
  });
});

describe("traitsForCharacter", () => {
  it("matches a name regardless of case or spacing", () => {
    const traits = [trait("a"), trait("b", { character: "Tomas" }), trait("c", { character: "mira" })];
    expect(traitsForCharacter(traits, " MIRA ")).toHaveLength(2);
    expect(traitsForCharacter(traits, "")).toEqual([]);
  });
});

describe("sorting and filtering", () => {
  it("reads established first, pinned above the rest", () => {
    const traits = [
      trait("provisional", { observations: 1 }),
      trait("firm"),
      trait("pinned", { pinned: true }),
    ];
    expect(sortStudyTraits(traits, 10).map((row) => row.id)).toEqual([
      "pinned",
      "firm",
      "provisional",
    ]);
  });

  it("filters by where a trait stands", () => {
    const traits = [
      trait("firm"),
      trait("prov", { observations: 1 }),
      trait("old", { lastTurn: 1 }),
    ];
    const total = 1 + STUDY_FADE_AFTER_TURNS + 1;
    expect(filterStudyTraits(traits, total, "current").map((r) => r.id)).toEqual(["firm"]);
    expect(filterStudyTraits(traits, total, "provisional").map((r) => r.id)).toEqual(["prov"]);
    expect(filterStudyTraits(traits, total, "faded").map((r) => r.id)).toEqual(["old"]);
    expect(filterStudyTraits(traits, total, "all")).toHaveLength(3);
  });

  it("searches the words behind a trait, not only its text", () => {
    const traits = [
      trait("a", { text: "deflects a question", evidence: [{ quote: "would you believe me", turn: 3 }] }),
      trait("b", { text: "stares at the fire", evidence: [{ quote: "he turns a log", turn: 3 }] }),
    ];
    expect(filterStudyTraits(traits, 10, "all", "believe").map((r) => r.id)).toEqual(["a"]);
    expect(filterStudyTraits(traits, 10, "all", "fire").map((r) => r.id)).toEqual(["b"]);
  });
});

describe("studySummaryLine", () => {
  it("composes who they have become from the established sheet, voice first", () => {
    const line = studySummaryLine(
      [
        trait("w", { facet: "want", text: "Wants the letter back." }),
        trait("v", { facet: "voice", text: "Answers a question with a question." }),
        trait("q", { facet: "line", text: "Ask him yourself." }),
        trait("p", { facet: "voice", text: "Never raises her voice.", observations: 1 }),
      ],
      10,
    );
    expect(line).toBe("answers a question with a question; wants the letter back");
  });

  it("says nothing until something is established", () => {
    expect(studySummaryLine([trait("a", { observations: 1 })], 10)).toBe("");
    expect(studySummaryLine([], 10)).toBe("");
  });
});

describe("editing", () => {
  it("patches one trait without letting its id be replaced", () => {
    const traits = [trait("a"), trait("b")];
    const next = updateStudyTrait(traits, "a", { pinned: true, id: "hijacked" } as Partial<StudyTrait>);
    expect(next[0].pinned).toBe(true);
    expect(next[0].id).toBe("a");
    expect(next[1]).toBe(traits[1]);
  });

  it("keeps the old wording when a line is revised by hand", () => {
    const next = reviseStudyTrait([trait("a", { text: "guarded" })], "a", "lets him finish");
    expect(next[0].text).toBe("lets him finish");
    expect(next[0].history.at(-1)?.quote).toBe("guarded");
  });

  it("ignores a revision that changes nothing", () => {
    const original = trait("a", { text: "guarded" });
    expect(reviseStudyTrait([original], "a", "guarded")[0]).toBe(original);
    expect(reviseStudyTrait([original], "a", "  ")[0]).toBe(original);
  });

  it("removes a trait by id", () => {
    expect(removeStudyTrait([trait("a"), trait("b")], "a").map((r) => r.id)).toEqual(["b"]);
  });
});

describe("renaming a character", () => {
  it("moves their whole sheet rather than orphaning it", () => {
    const traits = [trait("a"), trait("b", { character: "Tomas" }), trait("c", { character: "mira" })];
    const next = renameStudySubject(traits, "Mira", "Mirabel");
    expect(next.filter((row) => row.character === "Mirabel")).toHaveLength(2);
    expect(next.find((row) => row.id === "b")?.character).toBe("Tomas");
  });

  it("is a no-op for a blank or unchanged name", () => {
    const traits = [trait("a")];
    expect(renameStudySubject(traits, "Mira", "  ")).toEqual(traits);
    expect(renameStudySubject(traits, "Mira", "mira")).toEqual(traits);
    expect(renameStudySubject(traits, "", "Nobody")).toEqual(traits);
  });

  it("carries a lock across with the name", () => {
    expect(renameStudyLock(["Mira", "Tomas"], "Mira", "Mirabel")).toEqual(["Mirabel", "Tomas"]);
  });
});

describe("isStudyLocked", () => {
  it("matches regardless of case", () => {
    expect(isStudyLocked(["Mira"], "mira")).toBe(true);
    expect(isStudyLocked(["Mira"], "Tomas")).toBe(false);
  });
});

describe("studyParticipantLabel", () => {
  it("renders the user token as their own name", () => {
    expect(studyParticipantLabel(STUDY_USER, "Alex")).toBe("Alex");
    expect(studyParticipantLabel(STUDY_USER, "  ")).toBe("You");
    expect(studyParticipantLabel("Tomas", "Alex")).toBe("Tomas");
  });
});

describe("studyTimeline", () => {
  it("shows when a trait appeared, firmed up, and changed — newest first", () => {
    const entries = studyTimeline(
      [
        trait("a", {
          text: "lets him finish his sentences",
          firstTurn: 40,
          lastTurn: 130,
          history: [{ quote: "guarded, keeps the table between them", turn: 90 }],
        }),
      ],
      130,
    );
    expect(entries.map((row) => [row.turn, row.kind])).toEqual([
      [130, "established"],
      [90, "changed"],
      [40, "appeared"],
    ]);
    expect(entries[1].previous).toBe("guarded, keeps the table between them");
  });

  it("does not claim a provisional trait was ever established", () => {
    const entries = studyTimeline([trait("a", { observations: 1, firstTurn: 4, lastTurn: 9 })], 9);
    expect(entries.map((row) => row.kind)).toEqual(["appeared"]);
  });
});
