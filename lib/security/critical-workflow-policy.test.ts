import { afterEach, describe, expect, it } from "vitest"

import {
  getActionToolForVerification,
  getCriticalWorkflowVerifyMode,
  getCriticalWorkflowVerifyWindowSeconds,
  getVerificationToolForAction,
  isCriticalActionTool,
  isVerificationTool,
  resolveCriticalWorkflowContext,
} from "@/lib/security/critical-workflow-policy"

const ORIGINAL_ENV = { ...process.env }

function resetEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key]
    }
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value
  }
}

describe("critical-workflow-policy", () => {
  afterEach(() => {
    resetEnv()
  })

  it("maps destructive tools to verification tools", () => {
    expect(isCriticalActionTool("deleteRapidFireDb")).toBe(true)
    expect(getVerificationToolForAction("deleteRapidFireDb")).toBe("verifyRapidFireDbDeleted")
    expect(getVerificationToolForAction("deleteRapidFireCollection")).toBe(
      "verifyRapidFireCollectionDeleted",
    )
    expect(getVerificationToolForAction("deleteRapidFireDocument")).toBe(
      "verifyRapidFireDocumentDeleted",
    )
  })

  it("maps verification tools back to target action tools", () => {
    expect(isVerificationTool("verifyRapidFireDbDeleted")).toBe(true)
    expect(getActionToolForVerification("verifyRapidFireDbDeleted")).toBe("deleteRapidFireDb")
    expect(getActionToolForVerification("verifyRapidFireCollectionDeleted")).toBe(
      "deleteRapidFireCollection",
    )
    expect(getActionToolForVerification("verifyRapidFireDocumentDeleted")).toBe(
      "deleteRapidFireDocument",
    )
  })

  it("normalizes workflow subjects for destructive tools", () => {
    const workspace = resolveCriticalWorkflowContext("deleteRapidFireDb", {
      workspaceId: "11111111-1111-1111-1111-111111111111",
    })
    expect(workspace.subject).toBe("workspace:11111111-1111-1111-1111-111111111111")

    const collection = resolveCriticalWorkflowContext("deleteRapidFireCollection", {
      workspaceId: "w-1",
      collectionId: "c-1",
    })
    expect(collection.subject).toBe("workspace:w-1|collection:c-1")

    const document = resolveCriticalWorkflowContext("deleteRapidFireDocument", {
      workspaceId: "w-1",
      collectionId: "c-1",
      documentKey: "doc-1",
    })
    expect(document.subject).toBe("workspace:w-1|collection:c-1|document:doc-1")
  })

  it("uses warn mode and 120s window defaults", () => {
    delete process.env.MCP_CRITICAL_WORKFLOW_VERIFY_MODE
    delete process.env.MCP_CRITICAL_WORKFLOW_VERIFY_WINDOW_SECONDS
    expect(getCriticalWorkflowVerifyMode()).toBe("warn")
    expect(getCriticalWorkflowVerifyWindowSeconds()).toBe(120)
  })

  it("honors env overrides for mode and window", () => {
    process.env.MCP_CRITICAL_WORKFLOW_VERIFY_MODE = "enforce"
    process.env.MCP_CRITICAL_WORKFLOW_VERIFY_WINDOW_SECONDS = "240"
    expect(getCriticalWorkflowVerifyMode()).toBe("enforce")
    expect(getCriticalWorkflowVerifyWindowSeconds()).toBe(240)
  })
})
