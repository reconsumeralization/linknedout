import { describe, expect, it } from "vitest"
import { PANEL_DEFINITIONS } from "@/lib/shared/panel-registry"

const EXPECTED_VIEWS = [
  "dashboard", "chat", "profiles", "tribes", "projects",
  "fundraising", "data", "storage", "email", "analytics",
  "linkedout", "network", "agents", "globe", "sentinel",
  "settings", "marketplace", "transparency", "evolution", "workflows",
]

const PUBLIC_VIEWS = new Set([
  "dashboard", "chat", "analytics", "linkedout", "network",
  "globe", "settings", "transparency", "evolution", "workflows",
])

describe("panel-registry", () => {
  it("registers all 20 expected panels", () => {
    const views = PANEL_DEFINITIONS.map((p) => p.view)
    for (const v of EXPECTED_VIEWS) {
      expect(views).toContain(v)
    }
    expect(PANEL_DEFINITIONS).toHaveLength(20)
  })

  it("has no duplicate view IDs", () => {
    const views = PANEL_DEFINITIONS.map((p) => p.view)
    expect(new Set(views).size).toBe(views.length)
  })

  it("public panels do not require auth", () => {
    for (const panel of PANEL_DEFINITIONS) {
      if (PUBLIC_VIEWS.has(panel.view)) {
        expect(panel.requiresAuth).toBe(false)
      }
    }
  })

  it("protected panels require auth and have a non-empty authMessage", () => {
    for (const panel of PANEL_DEFINITIONS) {
      if (!PUBLIC_VIEWS.has(panel.view)) {
        expect(panel.requiresAuth).toBe(true)
        expect(panel.authMessage.length).toBeGreaterThan(0)
      }
    }
  })

  it("every panel has a non-empty label", () => {
    for (const panel of PANEL_DEFINITIONS) {
      expect(panel.label.length).toBeGreaterThan(0)
    }
  })
})
