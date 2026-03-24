import "server-only"

import { createHash } from "node:crypto"
import type { C2PAManifest, SentinelRiskLevel, SentinelTransport } from "@/lib/sentinel/sentinel-types"

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function stableEncodeRecord(record: Record<string, unknown>): string {
  const keys = Object.keys(record).sort()
  const lines = keys.map((key) => `${key}=${JSON.stringify(record[key])}`)
  return lines.join("\n")
}

function toRiskLevel(score: number): SentinelRiskLevel {
  if (score >= 80) return "critical"
  if (score >= 60) return "high"
  if (score >= 35) return "medium"
  return "low"
}

export interface GenerateManifestInput {
  toolName: string
  transport: SentinelTransport
  argHash: string
  actorId: string
  sessionId: string | null
  riskScore: number
  vetoed: boolean
  injectionMatches: string[]
  credentialAccessDetected: boolean
  parentHash: string | null
}

export function generateC2PAManifest(input: GenerateManifestInput): C2PAManifest {
  const generatedAt = new Date().toISOString()
  const manifestId = `sentinel:1:${input.argHash.slice(0, 16)}:${Date.now().toString(36)}`
  const riskLevel = toRiskLevel(input.riskScore)

  const core = {
    manifestId,
    generatedAt,
    toolName: input.toolName,
    transport: input.transport,
    argHash: input.argHash,
    parentHash: input.parentHash,
    actorId: input.actorId,
    sessionId: input.sessionId,
    riskScore: input.riskScore,
    riskLevel,
    vetoed: input.vetoed,
    injectionMatches: input.injectionMatches,
    credentialAccessDetected: input.credentialAccessDetected,
  }

  return {
    ...core,
    manifestHash: sha256Hex(stableEncodeRecord(core)),
  }
}

export function verifyManifestIntegrity(manifest: C2PAManifest): boolean {
  const { manifestHash, ...core } = manifest
  const recomputed = sha256Hex(stableEncodeRecord(core))
  return recomputed === manifestHash
}
