import { describe, expect, it } from "vitest";
import type { Message } from "./types";
import { filterStoryMessages, storyMessageSpeaker } from "./storyNavigator";

const messages: Message[] = [
  { role: "user", content: "Open the silver door.", timestamp: new Date("2026-01-01") },
  { role: "assistant", content: "Mara pockets the key.", speaker: "Mara", bookmarked: true, timestamp: new Date("2026-01-02") },
  { role: "user", content: "Rain begins over the old station.", narrator: true, timestamp: new Date("2026-01-03") },
  { role: "assistant", content: "I remember the silver promise.", speaker: "Ivo", timestamp: new Date("2026-01-04") },
];

const base = {
  query: "",
  scope: "all" as const,
  bookmarksOnly: false,
  userName: "Robin",
  assistantName: "Assistant",
};

describe("filterStoryMessages", () => {
  it("browses the complete story in transcript order for a blank search", () => {
    expect(filterStoryMessages(messages, base).map((result) => result.index))
      .toEqual([0, 1, 2, 3]);
  });

  it("searches case-insensitively through content and rendered speaker names", () => {
    expect(
      filterStoryMessages(messages, { ...base, query: "SILVER" })
        .map((result) => result.index),
    ).toEqual([0, 3]);
    expect(
      filterStoryMessages(messages, { ...base, query: "mara" })
        .map((result) => result.index),
    ).toEqual([1]);
    expect(
      filterStoryMessages(messages, { ...base, query: "   " })
        .map((result) => result.index),
    ).toEqual([0, 1, 2, 3]);
  });

  it("keeps narration separate from user and character scopes", () => {
    expect(
      filterStoryMessages(messages, { ...base, scope: "assistant" })
        .map((result) => result.index),
    ).toEqual([1, 3]);
    expect(
      filterStoryMessages(messages, { ...base, scope: "narrator" })
        .map((result) => result.index),
    ).toEqual([2]);
    expect(
      filterStoryMessages(messages, { ...base, scope: "user" })
        .map((result) => result.index),
    ).toEqual([0]);
  });

  it("composes bookmark filtering with text and speaker filters", () => {
    expect(
      filterStoryMessages(messages, { ...base, bookmarksOnly: true })
        .map((result) => result.index),
    ).toEqual([1]);
    expect(
      filterStoryMessages(messages, {
        ...base,
        query: "Ivo",
        bookmarksOnly: true,
      }),
    ).toEqual([]);
  });
});

describe("storyMessageSpeaker", () => {
  it("follows narrator, user, cast, and fallback precedence", () => {
    expect(storyMessageSpeaker(messages[0], "Robin", "Guide")).toBe("Robin");
    expect(storyMessageSpeaker(messages[1], "Robin", "Guide")).toBe("Mara");
    expect(storyMessageSpeaker(messages[2], "Robin", "Guide")).toBe("Narration");
    expect(storyMessageSpeaker(
      { role: "assistant", content: "", timestamp: new Date() },
      "Robin",
      "Guide",
    )).toBe("Guide");
    expect(storyMessageSpeaker(
      { role: "assistant", content: "", timestamp: new Date() },
      "",
      "",
    )).toBe("Assistant");
  });
});
