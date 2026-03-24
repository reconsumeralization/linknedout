import { describe, it, expect } from "vitest"
import {
  validateUuidParam,
  validateRouteParams,
  routeParamSchemas,
} from "./route-params"

const validUuid = "550e8400-e29b-41d4-a716-446655440000"

describe("validateUuidParam", () => {
  it("accepts valid UUID v4", () => {
    const result = validateUuidParam(validUuid, "integrationId")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe(validUuid)
    }
  })

  it("rejects empty string", () => {
    const result = validateUuidParam("", "draftId")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("draftId")
      expect(result.error).toMatch(/Missing|required|UUID/i)
      expect(result.status).toBe(400)
    }
  })

  it("rejects non-UUID string", () => {
    const result = validateUuidParam("not-a-uuid", "integrationId")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("integrationId")
      expect(result.status).toBe(400)
    }
  })

  it("rejects too-short value", () => {
    const result = validateUuidParam("abc", "draftId")
    expect(result.ok).toBe(false)
    expect(result.ok ? undefined : result.status).toBe(400)
  })

  it("rejects value with wrong format (no hyphens)", () => {
    const result = validateUuidParam("550e8400e29b41d4a716446655440000", "integrationId")
    expect(result.ok).toBe(false)
  })
})

const integrationAndDraftSchema = {
  integrationId: routeParamSchemas.integrationId,
  draftId: routeParamSchemas.draftId,
}

describe("validateRouteParams", () => {
  it("returns value (record of params) when all params are valid UUIDs", () => {
    const result = validateRouteParams(
      { integrationId: validUuid, draftId: validUuid },
      integrationAndDraftSchema,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.integrationId).toBe(validUuid)
      expect(result.value.draftId).toBe(validUuid)
    }
  })

  it("returns error when a param is missing", () => {
    const result = validateRouteParams(
      { integrationId: validUuid },
      integrationAndDraftSchema,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("draftId")
      expect(result.error).toContain("Missing")
      expect(result.status).toBe(400)
    }
  })

  it("returns error when a param is empty string", () => {
    const result = validateRouteParams(
      { integrationId: validUuid, draftId: "" },
      integrationAndDraftSchema,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("draftId")
      expect(result.status).toBe(400)
    }
  })

  it("returns error when a param is invalid UUID", () => {
    const result = validateRouteParams(
      { integrationId: "bad", draftId: validUuid },
      integrationAndDraftSchema,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("integrationId")
      expect(result.status).toBe(400)
    }
  })

  it("returns value when slug param is valid", () => {
    const result = validateRouteParams(
      { slug: "my-valid-slug" },
      { slug: routeParamSchemas.slug },
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.slug).toBe("my-valid-slug")
    }
  })

  it("returns error when param contains dangerous pattern (e.g. path traversal)", () => {
    const result = validateRouteParams(
      { integrationId: validUuid, draftId: "../../../etc/passwd" },
      integrationAndDraftSchema,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("draftId")
      expect(result.error).toMatch(/invalid|dangerous/i)
      expect(result.status).toBe(400)
    }
  })
})
