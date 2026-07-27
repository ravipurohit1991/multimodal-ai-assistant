export interface BrowserWipeResult {
  errors: string[];
  indexedDatabasesDeleted: number;
  cachesDeleted: number;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function cookiePaths(): string[] {
  if (typeof location === "undefined") return ["/"];
  const parts = location.pathname.split("/").filter(Boolean);
  const paths = new Set<string>(["/", location.pathname || "/"]);
  while (parts.length > 0) {
    paths.add(`/${parts.join("/")}`);
    parts.pop();
  }
  return [...paths];
}

async function deleteIndexedDatabase(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (deleted: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(deleted);
    };
    const timer = setTimeout(() => finish(false), 750);
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => finish(true);
      request.onerror = () => finish(false);
      request.onblocked = () => finish(false);
    } catch {
      finish(false);
    }
  });
}

/**
 * Remove every browser-side persistence surface available to the app.
 *
 * Wipe is intentionally origin-wide. The app owns its local origin, and older
 * releases may have used storage keys or database names that current code no
 * longer knows about.
 */
export async function wipeBrowserPersistence(): Promise<BrowserWipeResult> {
  const result: BrowserWipeResult = {
    errors: [],
    indexedDatabasesDeleted: 0,
    cachesDeleted: 0,
  };

  try {
    localStorage.clear();
  } catch (error) {
    result.errors.push(`localStorage: ${describeError(error)}`);
  }

  try {
    sessionStorage.clear();
  } catch (error) {
    result.errors.push(`sessionStorage: ${describeError(error)}`);
  }

  try {
    if (typeof document !== "undefined") {
      const names = document.cookie
        .split(";")
        .map((cookie) => cookie.split("=")[0]?.trim())
        .filter((name): name is string => Boolean(name));
      for (const name of names) {
        for (const path of cookiePaths()) {
          document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}; SameSite=Lax`;
        }
      }
    }
  } catch (error) {
    result.errors.push(`cookies: ${describeError(error)}`);
  }

  try {
    if (typeof caches !== "undefined") {
      const cacheNames = await caches.keys();
      const deleted = await Promise.all(cacheNames.map((name) => caches.delete(name)));
      result.cachesDeleted = deleted.filter(Boolean).length;
    }
  } catch (error) {
    result.errors.push(`CacheStorage: ${describeError(error)}`);
  }

  try {
    if (typeof indexedDB !== "undefined") {
      // Keep the former database name so a full wipe also clears data left by
      // releases from before the PersonaParlour rename.
      const databaseNames = new Set<string>(["personaparlour", "aiassistant"]);
      if (typeof indexedDB.databases === "function") {
        const databases = await indexedDB.databases();
        for (const database of databases) {
          if (database.name) databaseNames.add(database.name);
        }
      }
      const deleted = await Promise.all(
        [...databaseNames].map((name) => deleteIndexedDatabase(name)),
      );
      result.indexedDatabasesDeleted = deleted.filter(Boolean).length;
      if (deleted.some((wasDeleted) => !wasDeleted)) {
        result.errors.push("IndexedDB: one or more databases were blocked");
      }
    }
  } catch (error) {
    result.errors.push(`IndexedDB: ${describeError(error)}`);
  }

  return result;
}
