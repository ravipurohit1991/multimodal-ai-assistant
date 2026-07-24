import { describe, expect, it } from "vitest";
import type { StoryThread } from "./types";
import {
  countStoryThreads,
  filterStoryThreads,
  normalizeStoryThreadsState,
  removeStoryThread,
  sortStoryThreads,
  updateStoryThread,
} from "./storyThreads";

function thread(
  id: string,
  status: StoryThread["status"],
  updatedTurn: number,
  pinned = false,
): StoryThread {
  return {
    id,
    title: `Thread ${id}`,
    summary: `Summary for ${id}`,
    kind: "other",
    status,
    pinned,
    createdTurn: 1,
    updatedTurn,
  };
}

describe("normalizeStoryThreadsState", () => {
  it("accepts wire aliases and legacy detail while rejecting blank entries", () => {
    const normalized = normalizeStoryThreadsState({
      enabled: false,
      auto: false,
      covered: "7.9",
      threads: [
        {
          id: "shared",
          title: "Who stole the map?",
          detail: "The map disappeared during the storm.",
          kind: "mystery",
          status: "resolved",
          pinned: true,
          created_turn: "2",
          updated_turn: 5,
          resolved_turn: "6",
        },
        {
          id: "shared",
          summary: "Mira still owes Rowan an answer.",
          kind: "unknown",
          status: "unknown",
          turn: -4,
        },
        { title: " ", summary: " " },
        null,
      ],
    });

    expect(normalized.enabled).toBe(false);
    expect(normalized.auto).toBe(false);
    expect(normalized.covered).toBe(7);
    expect(normalized.threads).toHaveLength(2);
    expect(normalized.threads[0]).toEqual({
      id: "shared",
      title: "Who stole the map?",
      summary: "The map disappeared during the storm.",
      kind: "mystery",
      status: "resolved",
      pinned: true,
      createdTurn: 2,
      updatedTurn: 5,
      resolvedTurn: 6,
    });
    expect(normalized.threads[1]).toMatchObject({
      id: "shared_2",
      title: "Mira still owes Rowan an answer.",
      kind: "other",
      status: "active",
      createdTurn: 0,
      updatedTurn: 0,
    });
  });

  it("returns independent defaults for absent or malformed state", () => {
    const first = normalizeStoryThreadsState(null);
    const second = normalizeStoryThreadsState({ threads: "not-an-array" });

    expect(first).toEqual({
      enabled: true,
      auto: true,
      threads: [],
      covered: 0,
    });
    expect(second).toEqual(first);
    expect(second.threads).not.toBe(first.threads);
  });
});

describe("story thread selection", () => {
  const threads = [
    thread("old-active", "active", 3),
    thread("new-active", "active", 12),
    thread("pinned-active", "active", 2, true),
    { ...thread("resolved", "resolved", 20), kind: "promise" as const },
    thread("dropped", "dropped", 30),
  ];

  it("sorts by status, pin, recency, without mutating the input", () => {
    const originalIds = threads.map((item) => item.id);

    expect(sortStoryThreads(threads).map((item) => item.id)).toEqual([
      "pinned-active",
      "new-active",
      "old-active",
      "resolved",
      "dropped",
    ]);
    expect(threads.map((item) => item.id)).toEqual(originalIds);
  });

  it("filters active and archived statuses and composes a text search", () => {
    expect(filterStoryThreads(threads, "active").map((item) => item.id))
      .toEqual(["pinned-active", "new-active", "old-active"]);
    expect(filterStoryThreads(threads, "archived").map((item) => item.id))
      .toEqual(["resolved", "dropped"]);
    expect(filterStoryThreads(threads, "resolved", "PROMISE").map((item) => item.id))
      .toEqual(["resolved"]);
    expect(filterStoryThreads(threads, "dropped", "missing")).toEqual([]);
  });

  it("counts every state and distinguishes active pins", () => {
    expect(countStoryThreads(threads)).toEqual({
      total: 5,
      active: 3,
      resolved: 1,
      dropped: 1,
      archived: 2,
      pinned: 1,
      pinnedActive: 1,
    });
  });
});

describe("story thread list updates", () => {
  it("updates and removes immutably while preserving identity", () => {
    const original = [thread("one", "active", 1), thread("two", "active", 2)];
    const updated = updateStoryThread(original, "one", {
      id: "replacement",
      status: "resolved",
      summary: "The promise was kept.",
    });

    expect(updated).not.toBe(original);
    expect(updated[0]).not.toBe(original[0]);
    expect(updated[1]).toBe(original[1]);
    expect(updated[0]).toMatchObject({
      id: "one",
      status: "resolved",
      summary: "The promise was kept.",
    });
    expect(removeStoryThread(updated, "one")).toEqual([original[1]]);
  });
});
