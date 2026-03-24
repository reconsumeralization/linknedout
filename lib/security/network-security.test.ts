import { describe, expect, it } from "vitest"
import { isPrivateOrLocalHostname } from "@/lib/security/network-security"

describe("isPrivateOrLocalHostname", () => {
  it("blocks localhost and private IPv4 ranges", () => {
    expect(isPrivateOrLocalHostname("localhost")).toBe(true)
    expect(isPrivateOrLocalHostname("127.0.0.1")).toBe(true)
    expect(isPrivateOrLocalHostname("10.0.1.4")).toBe(true)
    expect(isPrivateOrLocalHostname("172.20.4.12")).toBe(true)
    expect(isPrivateOrLocalHostname("192.168.1.2")).toBe(true)
  })

  it("blocks metadata and internal hostnames", () => {
    expect(isPrivateOrLocalHostname("169.254.169.254")).toBe(true)
    expect(isPrivateOrLocalHostname("metadata.google.internal")).toBe(true)
    expect(isPrivateOrLocalHostname("service.internal")).toBe(true)
    expect(isPrivateOrLocalHostname("corp.local")).toBe(true)
  })

  it("blocks private IPv6 prefixes", () => {
    expect(isPrivateOrLocalHostname("::1")).toBe(true)
    expect(isPrivateOrLocalHostname("fe80::1")).toBe(true)
    expect(isPrivateOrLocalHostname("fd12:3456:789a::1")).toBe(true)
  })

  it("allows public hostnames", () => {
    expect(isPrivateOrLocalHostname("api.openai.com")).toBe(false)
    expect(isPrivateOrLocalHostname("example.com")).toBe(false)
  })
})
