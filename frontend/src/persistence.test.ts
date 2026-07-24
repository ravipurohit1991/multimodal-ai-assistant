import { afterEach, describe, expect, it, vi } from "vitest";
import { wipeBrowserPersistence } from "./persistence";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("wipeBrowserPersistence", () => {
  it("clears current and legacy browser persistence surfaces", async () => {
    const localClear = vi.fn();
    const sessionClear = vi.fn();
    const cacheDelete = vi.fn(async () => true);
    const deleteDatabase = vi.fn((name: string) => {
      const request: {
        onsuccess?: () => void;
        onerror?: () => void;
        onblocked?: () => void;
      } = {};
      queueMicrotask(() => request.onsuccess?.());
      return request;
    });

    vi.stubGlobal("localStorage", { clear: localClear });
    vi.stubGlobal("sessionStorage", { clear: sessionClear });
    vi.stubGlobal("caches", {
      keys: vi.fn(async () => ["old-assets", "story-cache"]),
      delete: cacheDelete,
    });
    vi.stubGlobal("indexedDB", {
      databases: vi.fn(async () => [{ name: "legacy-story-db" }]),
      deleteDatabase,
    });
    vi.stubGlobal("document", { cookie: "" });
    vi.stubGlobal("location", { pathname: "/story/current" });

    const result = await wipeBrowserPersistence();

    expect(localClear).toHaveBeenCalledOnce();
    expect(sessionClear).toHaveBeenCalledOnce();
    expect(cacheDelete).toHaveBeenCalledTimes(2);
    expect(deleteDatabase).toHaveBeenCalledWith("aiassistant");
    expect(deleteDatabase).toHaveBeenCalledWith("legacy-story-db");
    expect(result).toEqual({
      errors: [],
      indexedDatabasesDeleted: 2,
      cachesDeleted: 2,
    });
  });

  it("continues clearing other stores when one storage API fails", async () => {
    const sessionClear = vi.fn();
    vi.stubGlobal("localStorage", {
      clear: () => {
        throw new Error("denied");
      },
    });
    vi.stubGlobal("sessionStorage", { clear: sessionClear });
    vi.stubGlobal("document", { cookie: "" });

    const result = await wipeBrowserPersistence();

    expect(sessionClear).toHaveBeenCalledOnce();
    expect(result.errors).toContain("localStorage: denied");
  });
});
