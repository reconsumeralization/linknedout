/**
 * Deep Space Latency Buffer — IndexedDB-backed offline sync
 *
 * This client-side library queues mutations (workflow steps, votes, trades,
 * attestations, marketplace actions) in IndexedDB while the device is offline
 * or experiencing high latency. When connectivity returns the queue is flushed
 * to the server via POST /api/sync.
 *
 * Shadow-state snapshots let the UI render optimistic updates before the sync
 * round-trip completes — the snapshot is the "last known good" server state
 * against which conflicts are detected.
 *
 * All IndexedDB access is guarded so the module degrades gracefully during
 * SSR or in environments where IndexedDB is unavailable (Node, older browsers).
 */

import type {
  LatencyBufferEntry,
  ShadowStateSnapshot,
  SyncConflict,
  BufferOperationType,
} from "@/lib/shared/types"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_NAME = "linkedout-latency-buffer"
const DB_VERSION = 1
const STORES = {
  queue: "buffer-queue",
  snapshots: "shadow-snapshots",
} as const

const DEFAULT_MAX_RETRIES = 5
const DEFAULT_AUTO_SYNC_INTERVAL_MS = 30_000 // 30 seconds
const DEFAULT_API_BASE = "/api"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when IndexedDB is available in the current environment. */
function isIndexedDBAvailable(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    typeof globalThis.indexedDB !== "undefined"
  )
}

/** Generates a URL-safe unique ID (no external dependency). */
function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for older browsers
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).substring(2, 10)
  )
}

/** Wraps an IDBRequest in a Promise. */
function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// ---------------------------------------------------------------------------
// Database lifecycle
// ---------------------------------------------------------------------------

let cachedDb: IDBDatabase | null = null

/**
 * Opens (or creates) the IndexedDB database. The schema has two object
 * stores:
 *
 * - `buffer-queue`       — pending mutations (LatencyBufferEntry)
 * - `shadow-snapshots`   — optimistic-UI snapshots (ShadowStateSnapshot)
 *
 * Re-uses a cached connection when available.
 */
export function openDatabase(): Promise<IDBDatabase> {
  if (cachedDb) return Promise.resolve(cachedDb)

  if (!isIndexedDBAvailable()) {
    return Promise.reject(
      new Error("IndexedDB is not available in this environment."),
    )
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(STORES.queue)) {
        const queueStore = db.createObjectStore(STORES.queue, {
          keyPath: "id",
        })
        queueStore.createIndex("by_status", "status", { unique: false })
        queueStore.createIndex("by_priority", "priority", { unique: false })
        queueStore.createIndex("by_created", "createdOfflineAt", {
          unique: false,
        })
      }

      if (!db.objectStoreNames.contains(STORES.snapshots)) {
        const snapStore = db.createObjectStore(STORES.snapshots, {
          keyPath: "id",
        })
        snapStore.createIndex("by_state", ["stateType", "stateKey"], {
          unique: false,
        })
      }
    }

    request.onsuccess = () => {
      cachedDb = request.result
      // Clear cache when the browser closes the connection.
      cachedDb.onclose = () => {
        cachedDb = null
      }
      resolve(cachedDb)
    }

    request.onerror = () => reject(request.error)
  })
}

// ---------------------------------------------------------------------------
// Queue operations
// ---------------------------------------------------------------------------

/**
 * Stores a new operation in the buffer queue. The caller provides the
 * domain-specific fields; `id`, `status`, `syncedAt`, `retryCount` and
 * `maxRetries` are generated automatically.
 *
 * Returns the generated entry ID.
 */
export async function queueOperation(
  entry: Omit<
    LatencyBufferEntry,
    "id" | "status" | "syncedAt" | "retryCount" | "maxRetries"
  >,
): Promise<string> {
  const db = await openDatabase()
  const id = generateId()

  const record: LatencyBufferEntry = {
    ...entry,
    id,
    status: "queued",
    retryCount: 0,
    maxRetries: DEFAULT_MAX_RETRIES,
  }

  const tx = db.transaction(STORES.queue, "readwrite")
  tx.objectStore(STORES.queue).put(record)

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  return id
}

/**
 * Returns every entry currently sitting in the buffer queue, ordered by the
 * time they were created offline (oldest first).
 */
export async function getQueuedOperations(): Promise<LatencyBufferEntry[]> {
  const db = await openDatabase()
  const tx = db.transaction(STORES.queue, "readonly")
  const store = tx.objectStore(STORES.queue)
  const index = store.index("by_created")

  return promisify(index.getAll())
}

/**
 * Attempts to flush all queued entries to the server.
 *
 * For each entry the function:
 * 1. Sets its status to `syncing`.
 * 2. POSTs the entry to `{apiBaseUrl}/sync` with `action=flush_queue`.
 * 3. On success marks it `synced`; on conflict marks it `conflict`; on
 *    failure increments `retryCount` and marks it `failed` if retries are
 *    exhausted, or resets it to `queued` otherwise.
 *
 * Returns aggregate counts.
 */
export async function flushQueue(
  apiBaseUrl: string = DEFAULT_API_BASE,
): Promise<{ synced: number; failed: number; conflicts: number }> {
  const entries = await getQueuedOperations()
  const result = { synced: 0, failed: 0, conflicts: 0 }

  if (entries.length === 0) return result

  const db = await openDatabase()

  for (const entry of entries) {
    if (entry.status === "synced") continue

    // Mark as syncing
    await updateEntryStatus(db, entry.id, "syncing")

    try {
      const response = await fetch(`${apiBaseUrl}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "flush_queue", entries: [entry] }),
      })

      if (response.ok) {
        await updateEntryStatus(db, entry.id, "synced", new Date().toISOString())
        result.synced++
      } else if (response.status === 409) {
        await updateEntryStatus(db, entry.id, "conflict")
        result.conflicts++
      } else {
        await handleRetry(db, entry)
        result.failed++
      }
    } catch {
      // Network error — schedule retry
      await handleRetry(db, entry)
      result.failed++
    }
  }

  return result
}

/** Updates the status (and optionally syncedAt) of an entry in IndexedDB. */
async function updateEntryStatus(
  db: IDBDatabase,
  id: string,
  status: LatencyBufferEntry["status"],
  syncedAt?: string,
): Promise<void> {
  const tx = db.transaction(STORES.queue, "readwrite")
  const store = tx.objectStore(STORES.queue)
  const existing: LatencyBufferEntry | undefined = await promisify(
    store.get(id),
  )
  if (!existing) return

  existing.status = status
  if (syncedAt) existing.syncedAt = syncedAt
  store.put(existing)

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Increments retryCount; marks failed if exhausted, queued otherwise. */
async function handleRetry(
  db: IDBDatabase,
  entry: LatencyBufferEntry,
): Promise<void> {
  const nextRetry = entry.retryCount + 1
  const tx = db.transaction(STORES.queue, "readwrite")
  const store = tx.objectStore(STORES.queue)

  entry.retryCount = nextRetry
  entry.status = nextRetry >= entry.maxRetries ? "failed" : "queued"
  store.put(entry)

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ---------------------------------------------------------------------------
// Shadow snapshots
// ---------------------------------------------------------------------------

/**
 * Persists an optimistic-UI snapshot in IndexedDB. Returns the generated ID.
 */
export async function saveShadowSnapshot(
  snapshot: Omit<ShadowStateSnapshot, "id">,
): Promise<string> {
  const db = await openDatabase()
  const id = generateId()

  const record: ShadowStateSnapshot = { ...snapshot, id }

  const tx = db.transaction(STORES.snapshots, "readwrite")
  tx.objectStore(STORES.snapshots).put(record)

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  return id
}

/**
 * Retrieves the most recent shadow snapshot for a given state type and key.
 * Returns `null` when no matching snapshot exists.
 */
export async function getShadowSnapshot(
  stateType: string,
  stateKey: string,
): Promise<ShadowStateSnapshot | null> {
  const db = await openDatabase()
  const tx = db.transaction(STORES.snapshots, "readonly")
  const store = tx.objectStore(STORES.snapshots)
  const index = store.index("by_state")

  const results: ShadowStateSnapshot[] = await promisify(
    index.getAll([stateType, stateKey]),
  )

  if (results.length === 0) return null

  // Return the newest snapshot by snapshotAt timestamp.
  results.sort(
    (a, b) =>
      new Date(b.snapshotAt).getTime() - new Date(a.snapshotAt).getTime(),
  )
  return results[0]
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

/**
 * Removes all entries whose status is `synced` from the buffer queue.
 * Returns the number of entries deleted.
 */
export async function clearSyncedEntries(): Promise<number> {
  const db = await openDatabase()
  const tx = db.transaction(STORES.queue, "readwrite")
  const store = tx.objectStore(STORES.queue)
  const index = store.index("by_status")

  const synced: LatencyBufferEntry[] = await promisify(index.getAll("synced"))

  for (const entry of synced) {
    store.delete(entry.id)
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  return synced.length
}

// ---------------------------------------------------------------------------
// Connectivity
// ---------------------------------------------------------------------------

/**
 * Returns the browser's online status. Always returns `true` during SSR so
 * server-rendered pages assume connectivity.
 */
export function getOnlineStatus(): boolean {
  if (typeof navigator === "undefined") return true
  return navigator.onLine
}

// ---------------------------------------------------------------------------
// Auto-sync
// ---------------------------------------------------------------------------

/**
 * Starts a periodic flush loop that runs every `intervalMs` milliseconds
 * whenever the device is online. Returns a cleanup function that stops the
 * loop — call it from a React `useEffect` cleanup or equivalent.
 */
export function setupAutoSync(
  intervalMs: number = DEFAULT_AUTO_SYNC_INTERVAL_MS,
): () => void {
  if (!isIndexedDBAvailable()) {
    // Nothing to sync — return a no-op cleanup.
    return () => {}
  }

  let timer: ReturnType<typeof setInterval> | null = null

  const tick = async () => {
    if (!getOnlineStatus()) return
    try {
      const { synced, failed, conflicts } = await flushQueue()
      if (synced > 0) {
        await clearSyncedEntries()
      }
      if (synced + failed + conflicts > 0) {
        console.info(
          `[latency-buffer] auto-sync: ${synced} synced, ${failed} failed, ${conflicts} conflicts`,
        )
      }
    } catch (err) {
      console.warn("[latency-buffer] auto-sync error:", err)
    }
  }

  timer = setInterval(tick, intervalMs)

  // Also attempt an immediate flush on reconnect.
  const onOnline = () => {
    void tick()
  }

  if (typeof window !== "undefined") {
    window.addEventListener("online", onOnline)
  }

  return () => {
    if (timer !== null) clearInterval(timer)
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onOnline)
    }
  }
}
