import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { KeyValueStore } from "@/lib/shared/kv-store"

describe("KeyValueStore", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("stores and retrieves values", () => {
    const store = new KeyValueStore<string>()
    store.set("a", "hello")
    expect(store.get("a")).toBe("hello")
    expect(store.has("a")).toBe(true)
    expect(store.size).toBe(1)
  })

  it("expires values with ttl", () => {
    const store = new KeyValueStore<string>()
    store.set("token", "abc", { ttlMs: 1000 })

    vi.advanceTimersByTime(999)
    expect(store.get("token")).toBe("abc")

    vi.advanceTimersByTime(2)
    expect(store.get("token")).toBeNull()
    expect(store.has("token")).toBe(false)
  })

  it("supports compare-and-set using version", () => {
    const store = new KeyValueStore<number>()
    const entry = store.set("counter", 1)

    const didSet = store.compareAndSet("counter", entry.version, 2)
    expect(didSet).toBe(true)
    expect(store.get("counter")).toBe(2)

    const rejected = store.compareAndSet("counter", entry.version, 3)
    expect(rejected).toBe(false)
    expect(store.get("counter")).toBe(2)
  })

  it("increments numeric values", () => {
    const store = new KeyValueStore<number>()
    expect(store.increment("n")).toBe(1)
    expect(store.increment("n", 4)).toBe(5)
  })

  it("serializes and restores state", () => {
    const source = new KeyValueStore<string>()
    source.set("one", "1")
    source.set("two", "2", { ttlMs: 1000 })
    const state = source.toJSON()

    const target = new KeyValueStore<string>()
    target.load(state)
    expect(target.get("one")).toBe("1")
    expect(target.get("two")).toBe("2")
  })
})

