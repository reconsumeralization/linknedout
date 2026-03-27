export interface KvEntry<T> {
  value: T
  createdAt: number
  updatedAt: number
  expiresAt: number | null
  version: number
}

export interface KvSetOptions {
  ttlMs?: number
}

export interface KvSerializedState {
  entries: Array<[string, KvEntry<unknown>]>
}

function nowMs(): number {
  return Date.now()
}

function computeExpiresAt(ttlMs?: number): number | null {
  if (!Number.isFinite(ttlMs) || !ttlMs || ttlMs <= 0) {
    return null
  }
  return nowMs() + ttlMs
}

function isExpired(entry: KvEntry<unknown>, at = nowMs()): boolean {
  return entry.expiresAt !== null && at >= entry.expiresAt
}

/**
 * In-memory key-value store with optional TTL expiration and CAS semantics.
 * Useful for short-lived coordination, request caches, and local workflows.
 */
export class KeyValueStore<T = unknown> {
  private store = new Map<string, KvEntry<T>>()

  get size(): number {
    this.pruneExpired()
    return this.store.size
  }

  set(key: string, value: T, options: KvSetOptions = {}): KvEntry<T> {
    const existing = this.store.get(key)
    const timestamp = nowMs()
    const entry: KvEntry<T> = {
      value,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      expiresAt: computeExpiresAt(options.ttlMs),
      version: (existing?.version ?? 0) + 1,
    }
    this.store.set(key, entry)
    return entry
  }

  get(key: string): T | null {
    const entry = this.getEntry(key)
    return entry?.value ?? null
  }

  getEntry(key: string): KvEntry<T> | null {
    const entry = this.store.get(key)
    if (!entry) return null
    if (isExpired(entry)) {
      this.store.delete(key)
      return null
    }
    return entry
  }

  has(key: string): boolean {
    return this.getEntry(key) !== null
  }

  delete(key: string): boolean {
    return this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  keys(): string[] {
    this.pruneExpired()
    return [...this.store.keys()]
  }

  values(): T[] {
    this.pruneExpired()
    return [...this.store.values()].map((entry) => entry.value)
  }

  entries(): Array<[string, KvEntry<T>]> {
    this.pruneExpired()
    return [...this.store.entries()]
  }

  /**
   * Compare-and-set based on the expected current version.
   */
  compareAndSet(key: string, expectedVersion: number, nextValue: T, options: KvSetOptions = {}): boolean {
    const entry = this.getEntry(key)
    if (!entry) return false
    if (entry.version !== expectedVersion) return false
    this.set(key, nextValue, options)
    return true
  }

  /**
   * Increment numeric values atomically. Missing keys start from 0.
   */
  increment(key: string, delta = 1, options: KvSetOptions = {}): number {
    const current = this.get(key)
    const baseline = typeof current === "number" ? current : 0
    const next = baseline + delta
    this.set(key, next as T, options)
    return next
  }

  /**
   * Extend or set expiration without changing current value/version.
   */
  touch(key: string, ttlMs: number): boolean {
    const entry = this.getEntry(key)
    if (!entry) return false
    entry.expiresAt = computeExpiresAt(ttlMs)
    entry.updatedAt = nowMs()
    this.store.set(key, entry)
    return true
  }

  pruneExpired(at = nowMs()): number {
    let pruned = 0
    for (const [key, entry] of this.store.entries()) {
      if (isExpired(entry, at)) {
        this.store.delete(key)
        pruned++
      }
    }
    return pruned
  }

  toJSON(): KvSerializedState {
    this.pruneExpired()
    return { entries: this.entries() as Array<[string, KvEntry<unknown>]> }
  }

  load(state: KvSerializedState): void {
    this.store.clear()
    for (const [key, entry] of state.entries) {
      if (!entry || typeof key !== "string") continue
      const typedEntry = entry as KvEntry<T>
      if (isExpired(typedEntry)) continue
      this.store.set(key, typedEntry)
    }
  }
}

