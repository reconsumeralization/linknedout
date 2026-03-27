import { describe, expect, it } from "vitest"
import { getDataBackend, resetBackendCache } from "@/lib/shared/backend-factory"

describe("backend-factory", () => {
  it("returns a DataBackend instance for default (supabase)", () => {
    resetBackendCache()
    const backend = getDataBackend("supabase")
    expect(backend).toBeDefined()
    expect(typeof backend.fetchProfiles).toBe("function")
    expect(typeof backend.fetchTribes).toBe("function")
    expect(typeof backend.fetchProjects).toBe("function")
  })

  it("returns a DataBackend instance for mongodb", () => {
    resetBackendCache()
    const backend = getDataBackend("mongodb")
    expect(backend).toBeDefined()
    expect(typeof backend.fetchProfiles).toBe("function")
  })

  it("returns a DataBackend instance for notion", () => {
    resetBackendCache()
    const backend = getDataBackend("notion")
    expect(backend).toBeDefined()
    expect(typeof backend.fetchProfiles).toBe("function")
  })

  it("returns cached instance on repeated calls with same type", () => {
    resetBackendCache()
    const a = getDataBackend("supabase")
    const b = getDataBackend("supabase")
    expect(a).toBe(b)
  })

  it("resetBackendCache clears the singleton cache", () => {
    resetBackendCache()
    const a = getDataBackend("supabase")
    resetBackendCache()
    const b = getDataBackend("supabase")
    expect(a).not.toBe(b)
  })
})
