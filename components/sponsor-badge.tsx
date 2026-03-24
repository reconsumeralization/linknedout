"use client"

import { SPONSORS, type Sponsor } from "@/lib/shared/sponsors"

interface SponsorBadgeProps {
  /** The tool name to find the sponsor for, OR a direct sponsor name */
  toolName?: string
  sponsorName?: string
  className?: string
}

export function SponsorBadge({ toolName, sponsorName, className }: SponsorBadgeProps) {
  let sponsor: Sponsor | undefined
  if (sponsorName) {
    sponsor = SPONSORS.find(s => s.name.toLowerCase() === sponsorName.toLowerCase())
  } else if (toolName) {
    sponsor = SPONSORS.find(s => s.featureTools.includes(toolName))
  }
  if (!sponsor) return null

  return (
    <a
      href={sponsor.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 rounded-md border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:border-border transition-colors ${className ?? ""}`}
    >
      {sponsor.badge}
    </a>
  )
}

interface SponsorRowProps {
  sponsors: string[]
  className?: string
}

export function SponsorRow({ sponsors, className }: SponsorRowProps) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className ?? ""}`}>
      {sponsors.map(name => (
        <SponsorBadge key={name} sponsorName={name} />
      ))}
    </div>
  )
}
