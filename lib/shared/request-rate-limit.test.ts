import { describe, expect, it, beforeEach } from "vitest"
import {
  checkInMemoryRateLimit,
  clearRateLimitBuckets,
  getRateLimitBucketCount,
  type CheckRateLimitOptions,
} from "@/lib/shared/request-rate-limit"

function check(options: Partial<CheckRateLimitOptions> & Pick<CheckRateLimitOptions, "key">) {
  return checkInMemoryRateLimit({
    key: options.key,
    max: options.max ?? 2,
    windowMs: options.windowMs ?? 1000,
    now: options.now ?? 0,
  })
}

describe("request-rate-limit in-memory store", () => {
  beforeEach(() => {
    clearRateLimitBuckets()
  })

  it("allows within window and blocks above limit", () => {
    const first = check({ key: "ip:1", now: 100 })
    const second = check({ key: "ip:1", now: 200 })
    const third = check({ key: "ip:1", now: 300 })

    expect(first.allowed).toBe(true)
    expect(second.allowed).toBe(true)
    expect(third.allowed).toBe(false)
    expect(third.remaining).toBe(0)
  })

  it("resets after window expiry", () => {
    check({ key: "ip:2", now: 0 })
    check({ key: "ip:2", now: 100 })
    const blocked = check({ key: "ip:2", now: 200 })
    expect(blocked.allowed).toBe(false)

    const reset = check({ key: "ip:2", now: 1200 })
    expect(reset.allowed).toBe(true)
    expect(reset.remaining).toBe(1)
  })

  it("tracks bucket counts and can clear state", () => {
    check({ key: "ip:a", now: 0 })
    check({ key: "ip:b", now: 0 })
    expect(getRateLimitBucketCount()).toBe(2)
    clearRateLimitBuckets()
    expect(getRateLimitBucketCount()).toBe(0)
  })
})

