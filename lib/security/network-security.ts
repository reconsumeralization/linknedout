export function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase()
  if (!host) return true

  if (host === "localhost" || host === "::1" || host === "[::1]") return true
  if (host === "169.254.169.254" || host === "metadata.google.internal") return true

  if (host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.")) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true

  if (host.endsWith(".local") || host.endsWith(".internal")) return true

  if (/^fc[0-9a-f]{2}:/i.test(host) || /^fd[0-9a-f]{2}:/i.test(host) || /^fe80:/i.test(host)) return true

  return false
}
