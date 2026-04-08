"use client"

import { BrandedPanelHeader } from "@/components/branded-panel-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
  FulfillmentYieldScore,
  MarketplaceListing,
  MarketplaceListingType,
  MarketplaceOrder,
} from "@/lib/shared/types"
import { cn } from "@/lib/shared/utils"
import {
  type IntegrationCategory,
  type IntegrationEntry,
  CATEGORY_LABELS,
} from "@/lib/connectors/integration-catalog"
import { resolveSupabaseAccessToken } from "@/lib/supabase/supabase-client-auth"
import {
  BarChart3,
  Check,
  ChevronDown,
  CircleDot,
  ExternalLink,
  Filter,
  Heart,
  MapPin,
  Package,
  Palette,
  Plug,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Star,
  Target,
  Users,
  Video,
  Zap,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"

// ─── Integration Types (from API response) ──────────────────────────────────

interface CatalogEntry extends IntegrationEntry {
  installed: boolean
  status: string
  enabled: boolean
  healthStatus: string
  installedAt: string | null
  userToolCount: number
  /** True when this repo implements real API/client calls for this provider id. */
  runtimeWired?: boolean
  /** True when POST /api/integrations/execute supports this provider id. */
  marketplaceExecute?: boolean
  implementationStatus?: "live" | "partial" | "planned"
  /** Server hint when implementationStatus is partial. */
  partialHint?: string | null
  envValidation?: {
    configured: boolean
    missingEnvKeys: string[]
    oauth: boolean
    docsUrl: string
    envKeys: string[]
  } | null
}

function integrationAuthHeaders(): HeadersInit {
  const token = resolveSupabaseAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

interface IntegrationUsageLogRow {
  id: string
  provider: string
  tool_name: string
  agent_id: string | null
  status: string
  latency_ms: number | null
  error_message: string | null
  created_at: string
}

function formatUsageAgentLabel(agentId: string | null | undefined): string {
  if (agentId == null || agentId === "") return "Direct"
  if (agentId === "sovereign") return "Sovereign"
  return agentId
}

function truncateUsageError(msg: string | null | undefined, max = 100): string {
  if (!msg) return "—"
  const t = msg.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

// ─── Constants ───────────────────────────────────────────────────────────────

const LISTING_TYPE_LABELS: Record<MarketplaceListingType, string> = {
  philosophy_session: "Philosophy Session",
  handcrafted_art: "Handcrafted Art",
  physical_mentorship: "Physical Mentorship",
  live_performance: "Live Performance",
  culinary_experience: "Culinary Experience",
  custom: "Custom",
}

const LISTING_TYPE_COLORS: Record<MarketplaceListingType, string> = {
  philosophy_session: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  handcrafted_art: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  physical_mentorship: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  live_performance: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  culinary_experience: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  custom: "bg-gray-500/15 text-gray-700 dark:text-gray-400",
}

const ORDER_STATUS_COLORS: Record<MarketplaceOrder["status"], string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  confirmed: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  in_progress: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  delivered: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  completed: "bg-green-500/15 text-green-700 dark:text-green-400",
  disputed: "bg-red-500/15 text-red-700 dark:text-red-400",
  refunded: "bg-gray-500/15 text-gray-700 dark:text-gray-400",
}

const LISTING_STATUS_COLORS: Record<MarketplaceListing["status"], string> = {
  draft: "bg-gray-500/15 text-gray-700 dark:text-gray-400",
  active: "bg-green-500/15 text-green-700 dark:text-green-400",
  paused: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  sold_out: "bg-red-500/15 text-red-700 dark:text-red-400",
  archived: "bg-gray-500/15 text-gray-600 dark:text-gray-500",
}

const DELIVERY_ICONS: Record<MarketplaceListing["deliveryMethod"], React.ReactNode> = {
  in_person: <MapPin className="h-3.5 w-3.5" />,
  video_call: <Video className="h-3.5 w-3.5" />,
  shipped_physical: <Package className="h-3.5 w-3.5" />,
  hybrid: <Users className="h-3.5 w-3.5" />,
}

const DELIVERY_LABELS: Record<MarketplaceListing["deliveryMethod"], string> = {
  in_person: "In Person",
  video_call: "Video Call",
  shipped_physical: "Shipped",
  hybrid: "Hybrid",
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPrice(listing: MarketplaceListing): string {
  const parts: string[] = []
  if (listing.priceTokens != null) parts.push(`${listing.priceTokens} tokens`)
  if (listing.priceUsd != null) parts.push(`$${listing.priceUsd.toFixed(2)}`)
  return parts.length > 0 ? parts.join(" / ") : "Free"
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ListingCard({
  listing,
  compact = false,
  onSelect,
}: {
  listing: MarketplaceListing
  compact?: boolean
  onSelect?: (l: MarketplaceListing) => void
}) {
  return (
    <Card
      className={cn(
        "group cursor-pointer transition-all hover:shadow-md hover:border-primary/30",
        compact && "border-dashed"
      )}
      onClick={() => onSelect?.(listing)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold leading-tight line-clamp-2">
            {listing.title}
          </CardTitle>
          <Badge variant="outline" className={cn("shrink-0 text-[10px]", LISTING_TYPE_COLORS[listing.listingType])}>
            {LISTING_TYPE_LABELS[listing.listingType]}
          </Badge>
        </div>
        {!compact && (
          <CardDescription className="line-clamp-2 text-xs mt-1">
            {listing.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {/* Delivery + Location */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            {DELIVERY_ICONS[listing.deliveryMethod]}
            {DELIVERY_LABELS[listing.deliveryMethod]}
          </span>
          {listing.location && listing.deliveryMethod === "in_person" && (
            <span className="flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{listing.location}</span>
            </span>
          )}
        </div>

        {/* Price + Rating */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">{formatPrice(listing)}</span>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {listing.avgRating != null && (
              <>
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span>{listing.avgRating.toFixed(1)}</span>
                <span className="text-muted-foreground/60">({listing.ratingCount})</span>
              </>
            )}
          </div>
        </div>

        {/* Fulfillment Yield bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Fulfillment Yield</span>
            <span>{Math.round(listing.fulfillmentYield * 100)}%</span>
          </div>
          <Progress value={listing.fulfillmentYield * 100} className="h-1.5" />
        </div>

        {/* Status for compact cards */}
        {compact && (
          <div className="flex items-center justify-between pt-1">
            <Badge variant="outline" className={cn("text-[10px]", LISTING_STATUS_COLORS[listing.status])}>
              {listing.status.replace("_", " ")}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {listing.ratingCount} rating{listing.ratingCount !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function OrderCard({ order }: { order: MarketplaceOrder }) {
  return (
    <Card className="transition-all hover:shadow-sm">
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">Order #{order.id.slice(0, 8)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Listing: {order.listingId.slice(0, 8)}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className={cn("text-[10px]", ORDER_STATUS_COLORS[order.status])}>
              {order.status.replace("_", " ")}
            </Badge>
          </div>
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
          <span className="capitalize">{order.paymentMethod}</span>
          <span>
            {order.amountTokens != null && `${order.amountTokens} tokens`}
            {order.amountTokens != null && order.amountUsd != null && " / "}
            {order.amountUsd != null && `$${order.amountUsd.toFixed(2)}`}
            {order.amountTokens == null && order.amountUsd == null && "Barter"}
          </span>
          <span>{formatDate(order.createdAt)}</span>
        </div>
        {order.rating != null && (
          <div className="flex items-center gap-1 mt-2 text-xs">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            <span>{order.rating.toFixed(1)}</span>
            {order.reviewText && (
              <span className="text-muted-foreground truncate ml-1">&mdash; {order.reviewText}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardContent className="py-3 px-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div>
          <p className="text-lg font-bold leading-tight">{value}</p>
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/60 mb-4">
        <Icon className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-xs">{description}</p>
    </div>
  )
}

// ─── Create Listing Form ─────────────────────────────────────────────────────

function CreateListingForm({
  onCreated,
  onCancel,
}: {
  onCreated: (listing: MarketplaceListing) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [listingType, setListingType] = useState<MarketplaceListingType>("custom")
  const [deliveryMethod, setDeliveryMethod] = useState<MarketplaceListing["deliveryMethod"]>("video_call")
  const [priceTokens, setPriceTokens] = useState("")
  const [priceUsd, setPriceUsd] = useState("")
  const [location, setLocation] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_listing",
          title: title.trim(),
          description: description.trim(),
          listingType,
          deliveryMethod,
          priceTokens: priceTokens ? Number(priceTokens) : undefined,
          priceUsd: priceUsd ? Number(priceUsd) : undefined,
          location: location.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error("Failed to create listing")
      const data = await res.json()
      onCreated(data.listing)
    } catch {
      // Silently handle - parent can show toast
    } finally {
      setSubmitting(false)
    }
  }, [title, description, listingType, deliveryMethod, priceTokens, priceUsd, location, onCreated])

  return (
    <Card className="border-primary/30 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Create New Listing</CardTitle>
        <CardDescription className="text-xs">Share a non-scalable human experience</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="Listing title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-sm"
        />
        <Input
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <Select value={listingType} onValueChange={(v) => setListingType(v as MarketplaceListingType)}>
            <SelectTrigger className="text-xs h-9">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LISTING_TYPE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key} className="text-xs">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={deliveryMethod}
            onValueChange={(v) => setDeliveryMethod(v as MarketplaceListing["deliveryMethod"])}
          >
            <SelectTrigger className="text-xs h-9">
              <SelectValue placeholder="Delivery" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DELIVERY_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key} className="text-xs">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            placeholder="Price (tokens)"
            value={priceTokens}
            onChange={(e) => setPriceTokens(e.target.value)}
            className="text-sm h-9"
          />
          <Input
            type="number"
            placeholder="Price (USD)"
            value={priceUsd}
            onChange={(e) => setPriceUsd(e.target.value)}
            className="text-sm h-9"
          />
        </div>
        {deliveryMethod === "in_person" && (
          <Input
            placeholder="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="text-sm"
          />
        )}
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={handleSubmit} disabled={!title.trim() || submitting}>
            {submitting ? "Creating..." : "Create Listing"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Domain Progress ─────────────────────────────────────────────────────────

const DOMAIN_COLORS: Record<string, string> = {
  philosophy_session: "bg-violet-500",
  handcrafted_art: "bg-amber-500",
  physical_mentorship: "bg-blue-500",
  live_performance: "bg-rose-500",
  culinary_experience: "bg-emerald-500",
  custom: "bg-gray-500",
}

function DomainProgressBar({ domain, value }: { domain: string; value: number }) {
  const label = LISTING_TYPE_LABELS[domain as MarketplaceListingType] ?? domain
  const colorClass = DOMAIN_COLORS[domain] ?? "bg-primary"

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", colorClass)}
          style={{ width: `${Math.min(100, value * 100)}%` }}
        />
      </div>
    </div>
  )
}

// ─── Integration Card ────────────────────────────────────────────────────────

const TIER_BADGES: Record<string, string> = {
  native: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  agent: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  external: "bg-gray-500/15 text-gray-700 dark:text-gray-400",
}

const STATUS_COLORS: Record<string, string> = {
  connected: "text-green-500",
  disconnected: "text-muted-foreground",
  error: "text-red-500",
  pending: "text-amber-500",
}

const IMPL_BADGES: Record<string, string> = {
  live: "border-emerald-500/40 text-emerald-800 dark:text-emerald-400",
  partial: "border-amber-500/40 text-amber-800 dark:text-amber-400",
  planned: "border-muted-foreground/40 text-muted-foreground",
}

function IntegrationCard({
  entry,
  onInstall,
  onUninstall,
  installing,
}: {
  entry: CatalogEntry
  onInstall: (id: string) => void
  onUninstall: (id: string) => void
  installing: string | null
}) {
  const isInstalling = installing === entry.id
  const [healthLoading, setHealthLoading] = useState(false)
  const [healthLine, setHealthLine] = useState<string | null>(null)

  const runHealthCheck = useCallback(async () => {
    setHealthLoading(true)
    setHealthLine(null)
    try {
      const res = await fetch(
        `/api/integrations?action=health&provider=${encodeURIComponent(entry.id)}`,
        { headers: { ...integrationAuthHeaders() } },
      )
      const j = (await res.json()) as { ok?: boolean; health?: { probe: string; message?: string }; error?: string }
      if (j.health) {
        setHealthLine(`${j.health.probe}: ${j.health.message ?? ""}`.trim())
      } else {
        setHealthLine(j.error ?? `HTTP ${res.status}`)
      }
    } catch {
      setHealthLine("Health check failed")
    } finally {
      setHealthLoading(false)
    }
  }, [entry.id])

  const impl = entry.implementationStatus ?? "planned"

  return (
    <Card className={cn(
      "transition-all hover:shadow-md hover:border-primary/20",
      entry.installed && "border-green-500/30 bg-green-500/5",
      !entry.available && "opacity-50"
    )}>
      <CardContent className="py-3 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-semibold truncate">{entry.name}</h4>
              {entry.installed && <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />}
              <Badge variant="outline" className={cn("text-[8px] h-5", IMPL_BADGES[impl] ?? IMPL_BADGES.planned)}>
                {impl === "live" ? "Runner live" : impl === "partial" ? "Partial wiring" : "Catalog only"}
              </Badge>
            </div>
            {impl === "partial" && entry.partialHint ? (
              <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{entry.partialHint}</p>
            ) : null}
            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{entry.description}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <Badge variant="outline" className={cn("text-[9px]", TIER_BADGES[entry.tier] ?? "")}>
              {entry.tier}
            </Badge>
            <Badge variant="outline" className="text-[9px]">
              {CATEGORY_LABELS[entry.category] ?? entry.category}
            </Badge>
          </div>
        </div>
        <div className="flex items-center justify-between mt-2.5">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <Zap className="h-3 w-3" />
              {entry.agentTools.length} tools
            </span>
            {entry.installed && (
              <span className={cn("flex items-center gap-0.5", STATUS_COLORS[entry.status])}>
                <CircleDot className="h-3 w-3" />
                {entry.status}
              </span>
            )}
          </div>
          {entry.available ? (
            entry.installed ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px] text-red-500 hover:text-red-600"
                onClick={() => onUninstall(entry.id)}
                disabled={isInstalling}
              >
                Uninstall
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={() => onInstall(entry.id)}
                disabled={isInstalling}
              >
                {isInstalling ? "Installing..." : "Install"}
              </Button>
            )
          ) : (
            <Badge variant="outline" className="text-[9px] text-muted-foreground">Coming Soon</Badge>
          )}
        </div>

        <Collapsible className="mt-2 border-t border-border/60 pt-2">
          <CollapsibleTrigger className="flex w-full items-center justify-between text-left text-[11px] font-medium text-muted-foreground hover:text-foreground">
            Setup, docs, and health
            <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform [[data-state=open]_&]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            <a
              href={entry.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Official documentation
            </a>
            {entry.oauth ? (
              <p className="text-[10px] text-muted-foreground">
                OAuth: configure redirect URLs in the provider console to match this app (see Email / LinkedIn OAuth routes).
              </p>
            ) : null}
            <div className="text-[10px] text-muted-foreground">
              <span className="font-medium text-foreground">Env vars (server)</span>
              {entry.envValidation?.envKeys?.length ? (
                <ul className="mt-1 list-inside list-disc font-mono text-[9px]">
                  {entry.envValidation.envKeys.map((k) => (
                    <li key={k} className={entry.envValidation?.missingEnvKeys.includes(k) ? "text-amber-600 dark:text-amber-400" : ""}>
                      {k}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1">None listed in catalog.</p>
              )}
              {entry.envValidation && !entry.envValidation.oauth ? (
                <p className="mt-1">
                  Status:{" "}
                  {entry.envValidation.configured ? (
                    <span className="text-emerald-600 dark:text-emerald-400">all keys present on server</span>
                  ) : (
                    <span>missing: {entry.envValidation.missingEnvKeys.join(", ") || "—"}</span>
                  )}
                </p>
              ) : null}
            </div>
            {impl === "live" ? (
              <p className="text-[10px] text-muted-foreground">
                Executable after install via <code className="text-[9px]">POST /api/integrations/execute</code> (optional{" "}
                <code className="text-[9px]">x-user-openai-key</code>, <code className="text-[9px]">x-user-groq-key</code>,{" "}
                <code className="text-[9px]">x-user-mistral-key</code> for those providers), Sovereign{" "}
                <code className="text-[9px]">invokeMarketplaceIntegration</code>, and agent tool{" "}
                <code className="text-[9px]">invoke_marketplace_integration</code>. Calls are logged to usage history.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => void runHealthCheck()} disabled={healthLoading}>
                {healthLoading ? "Checking…" : "Run health check"}
              </Button>
            </div>
            {healthLine ? <p className="text-[10px] text-muted-foreground">{healthLine}</p> : null}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}

// ─── Integrations Tab ────────────────────────────────────────────────────────

function IntegrationsTab() {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [filterTier, setFilterTier] = useState<string>("all")
  const [installing, setInstalling] = useState<string | null>(null)
  const [totalInstalled, setTotalInstalled] = useState(0)
  const [usageRows, setUsageRows] = useState<IntegrationUsageLogRow[]>([])
  const [usageLoading, setUsageLoading] = useState(false)
  const [usageError, setUsageError] = useState<string | null>(null)

  const fetchCatalog = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/integrations?action=catalog", {
        headers: { ...integrationAuthHeaders() },
      })
      if (!res.ok) throw new Error("Failed to fetch catalog")
      const data = await res.json()
      setCatalog(data.catalog ?? [])
      setTotalInstalled(data.totalInstalled ?? 0)
    } catch {
      setCatalog([])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchUsage = useCallback(async () => {
    if (!resolveSupabaseAccessToken()) {
      setUsageRows([])
      setUsageError(null)
      setUsageLoading(false)
      return
    }
    setUsageLoading(true)
    setUsageError(null)
    try {
      const res = await fetch("/api/integrations?action=usage", {
        headers: { ...integrationAuthHeaders() },
      })
      if (!res.ok) throw new Error("Could not load usage history")
      const data = (await res.json()) as { usage?: IntegrationUsageLogRow[] }
      setUsageRows(Array.isArray(data.usage) ? data.usage : [])
    } catch (e) {
      setUsageRows([])
      setUsageError(e instanceof Error ? e.message : "Could not load usage history")
    } finally {
      setUsageLoading(false)
    }
  }, [])

  useEffect(() => { fetchCatalog() }, [fetchCatalog])

  useEffect(() => {
    if (!loading) {
      void fetchUsage()
    }
  }, [loading, fetchUsage])

  const handleInstall = useCallback(async (provider: string) => {
    setInstalling(provider)
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...integrationAuthHeaders() },
        body: JSON.stringify({ action: "install", provider }),
      })
      if (res.ok) {
        setCatalog((prev) => prev.map((e) =>
          e.id === provider ? { ...e, installed: true, status: "connected", enabled: true } : e
        ))
        setTotalInstalled((prev) => prev + 1)
        void fetchUsage()
      }
    } finally {
      setInstalling(null)
    }
  }, [fetchUsage])

  const handleUninstall = useCallback(async (provider: string) => {
    setInstalling(provider)
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...integrationAuthHeaders() },
        body: JSON.stringify({ action: "uninstall", provider }),
      })
      if (res.ok) {
        setCatalog((prev) => prev.map((e) =>
          e.id === provider ? { ...e, installed: false, status: "disconnected", enabled: false } : e
        ))
        setTotalInstalled((prev) => Math.max(0, prev - 1))
        void fetchUsage()
      }
    } finally {
      setInstalling(null)
    }
  }, [fetchUsage])

  // Gather unique categories from catalog
  const categories = [...new Set(catalog.map((e) => e.category))].sort()

  const filtered = catalog.filter((e) => {
    if (filterCategory !== "all" && e.category !== filterCategory) return false
    if (filterTier !== "all" && e.tier !== filterTier) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return (
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q)
      )
    }
    return true
  })

  const featured = filtered.filter((e) => e.featured)
  const installed = filtered.filter((e) => e.installed && !e.featured)
  const available = filtered.filter((e) => !e.installed && !e.featured && e.available)
  const comingSoon = filtered.filter((e) => !e.available)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/80 bg-muted/20">
        <CardContent className="py-3 text-[11px] text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Install</span> records which providers you want the workspace to treat as enabled.
          Each card shows one implementation badge:{" "}
          <span className="text-emerald-700 dark:text-emerald-400 font-medium">Runner live</span> (tools run via{" "}
          <code className="text-[9px]">POST /api/integrations/execute</code>
          ),{" "}
          <span className="text-amber-800 dark:text-amber-400 font-medium">Partial wiring</span> (real routes or clients exist, but not the marketplace runner — see card hint), or{" "}
          <span className="text-muted-foreground font-medium">Catalog only</span> (metadata until wired in this repo).
          Health checks and usage logging still apply where configured.
        </CardContent>
      </Card>

      <Card className="border-border/80">
        <CardHeader className="py-3 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold">Recent integration runs</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-[10px]"
              onClick={() => void fetchUsage()}
              disabled={usageLoading || !resolveSupabaseAccessToken()}
              title="Refresh usage history"
            >
              <RefreshCw className={cn("h-3 w-3", usageLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>
          <CardDescription className="text-[10px] leading-relaxed">
            Last 100 tool calls logged from the execute API, agents, and Sovereign (latency and errors when present).
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {!resolveSupabaseAccessToken() ? (
            <p className="text-[10px] text-muted-foreground">Sign in to view usage history.</p>
          ) : usageLoading && usageRows.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : usageError ? (
            <p className="text-[10px] text-destructive">{usageError}</p>
          ) : usageRows.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">No runs yet. Invoke a live integration to see entries here.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border/60">
              <table className="w-full text-left text-[10px]">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30 text-muted-foreground">
                    <th className="px-2 py-1.5 font-medium whitespace-nowrap">Time</th>
                    <th className="px-2 py-1.5 font-medium whitespace-nowrap">Provider</th>
                    <th className="px-2 py-1.5 font-medium whitespace-nowrap">Tool</th>
                    <th className="px-2 py-1.5 font-medium whitespace-nowrap">Status</th>
                    <th className="px-2 py-1.5 font-medium whitespace-nowrap">ms</th>
                    <th className="px-2 py-1.5 font-medium whitespace-nowrap">Source</th>
                    <th className="px-2 py-1.5 font-medium min-w-[120px]">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {usageRows.map((row) => (
                    <tr key={row.id} className="border-b border-border/40 last:border-0">
                      <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                        {row.created_at
                          ? new Date(row.created_at).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-[9px]">{row.provider}</td>
                      <td className="px-2 py-1.5 font-mono text-[9px] max-w-[140px] truncate" title={row.tool_name}>
                        {row.tool_name}
                      </td>
                      <td className="px-2 py-1.5">
                        <span
                          className={cn(
                            "rounded px-1 py-0.5",
                            row.status === "success"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                              : row.status === "rate_limited"
                                ? "bg-amber-500/15 text-amber-800 dark:text-amber-400"
                                : "bg-destructive/15 text-destructive",
                          )}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                        {row.latency_ms != null ? row.latency_ms : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground max-w-[100px] truncate" title={formatUsageAgentLabel(row.agent_id)}>
                        {formatUsageAgentLabel(row.agent_id)}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground max-w-[200px]" title={row.error_message ?? undefined}>
                        {truncateUsageError(row.error_message)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={Plug} label="Available" value={catalog.filter((e) => e.available).length} />
        <StatCard icon={Check} label="Installed" value={totalInstalled} />
        <StatCard icon={Zap} label="Total Tools" value={catalog.reduce((sum, e) => sum + e.agentTools.length, 0)} />
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search integrations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 text-sm h-9"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[140px] text-xs h-9">
            <Filter className="mr-1 h-3.5 w-3.5" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat} className="text-xs">
                {CATEGORY_LABELS[cat as IntegrationCategory] ?? cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterTier} onValueChange={setFilterTier}>
          <SelectTrigger className="w-[110px] text-xs h-9">
            <SelectValue placeholder="Tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Tiers</SelectItem>
            <SelectItem value="native" className="text-xs">Native</SelectItem>
            <SelectItem value="agent" className="text-xs">Agent</SelectItem>
            <SelectItem value="external" className="text-xs">External</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Featured Section */}
      {featured.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Featured</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {featured.map((entry) => (
              <IntegrationCard
                key={entry.id}
                entry={entry}
                onInstall={handleInstall}
                onUninstall={handleUninstall}
                installing={installing}
              />
            ))}
          </div>
        </div>
      )}

      {/* Installed Section */}
      {installed.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Installed</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {installed.map((entry) => (
              <IntegrationCard
                key={entry.id}
                entry={entry}
                onInstall={handleInstall}
                onUninstall={handleUninstall}
                installing={installing}
              />
            ))}
          </div>
        </div>
      )}

      {/* Available Section */}
      {available.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Available</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {available.map((entry) => (
              <IntegrationCard
                key={entry.id}
                entry={entry}
                onInstall={handleInstall}
                onUninstall={handleUninstall}
                installing={installing}
              />
            ))}
          </div>
        </div>
      )}

      {/* Coming Soon */}
      {comingSoon.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Coming Soon</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {comingSoon.map((entry) => (
              <IntegrationCard
                key={entry.id}
                entry={entry}
                onInstall={handleInstall}
                onUninstall={handleUninstall}
                installing={installing}
              />
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <EmptyState
          icon={Plug}
          title="No integrations found"
          description="Try adjusting your search or filters."
        />
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function MarketplacePanel() {
  const [activeTab, setActiveTab] = useState("browse")
  const [listings, setListings] = useState<MarketplaceListing[]>([])
  const [myListings, setMyListings] = useState<MarketplaceListing[]>([])
  const [myOrders, setMyOrders] = useState<MarketplaceOrder[]>([])
  const [fulfillmentScore, setFulfillmentScore] = useState<FulfillmentYieldScore | null>(null)

  const [loadingBrowse, setLoadingBrowse] = useState(false)
  const [loadingMyListings, setLoadingMyListings] = useState(false)
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [loadingFulfillment, setLoadingFulfillment] = useState(false)

  const [searchQuery, setSearchQuery] = useState("")
  const [filterType, setFilterType] = useState<string>("all")
  const [showCreateForm, setShowCreateForm] = useState(false)

  // ── Data Fetching ──────────────────────────────────────────────────────────

  const fetchBrowseListings = useCallback(async () => {
    setLoadingBrowse(true)
    try {
      const params = new URLSearchParams({ action: "browse" })
      if (searchQuery.trim()) params.set("q", searchQuery.trim())
      if (filterType !== "all") params.set("type", filterType)
      const res = await fetch(`/api/marketplace?${params.toString()}`)
      if (!res.ok) throw new Error("Failed to fetch listings")
      const data = await res.json()
      setListings(data.listings ?? [])
    } catch {
      setListings([])
    } finally {
      setLoadingBrowse(false)
    }
  }, [searchQuery, filterType])

  const fetchMyListings = useCallback(async () => {
    setLoadingMyListings(true)
    try {
      const res = await fetch("/api/marketplace?action=my_listings")
      if (!res.ok) throw new Error("Failed to fetch my listings")
      const data = await res.json()
      setMyListings(data.listings ?? [])
    } catch {
      setMyListings([])
    } finally {
      setLoadingMyListings(false)
    }
  }, [])

  const fetchMyOrders = useCallback(async () => {
    setLoadingOrders(true)
    try {
      const res = await fetch("/api/marketplace?action=my_orders")
      if (!res.ok) throw new Error("Failed to fetch orders")
      const data = await res.json()
      setMyOrders(data.orders ?? [])
    } catch {
      setMyOrders([])
    } finally {
      setLoadingOrders(false)
    }
  }, [])

  const fetchFulfillmentScore = useCallback(async () => {
    setLoadingFulfillment(true)
    try {
      const res = await fetch("/api/marketplace?action=fulfillment_score")
      if (!res.ok) throw new Error("Failed to fetch fulfillment")
      const data = await res.json()
      setFulfillmentScore(data.score ?? null)
    } catch {
      setFulfillmentScore(null)
    } finally {
      setLoadingFulfillment(false)
    }
  }, [])

  // ── Tab-driven Loading ─────────────────────────────────────────────────────

  useEffect(() => {
    if (activeTab === "browse") fetchBrowseListings()
  }, [activeTab, fetchBrowseListings])

  useEffect(() => {
    if (activeTab === "my-listings") fetchMyListings()
  }, [activeTab, fetchMyListings])

  useEffect(() => {
    if (activeTab === "my-orders") fetchMyOrders()
  }, [activeTab, fetchMyOrders])

  useEffect(() => {
    if (activeTab === "fulfillment") fetchFulfillmentScore()
  }, [activeTab, fetchFulfillmentScore])

  // ── Filtered browse listings ───────────────────────────────────────────────

  const filteredListings = listings.filter((l) => {
    if (filterType !== "all" && l.listingType !== filterType) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return (
        l.title.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.location?.toLowerCase().includes(q)
      )
    }
    return true
  })

  // ── Handle listing created ─────────────────────────────────────────────────

  const handleListingCreated = useCallback(
    (listing: MarketplaceListing) => {
      setMyListings((prev) => [listing, ...prev])
      setShowCreateForm(false)
    },
    []
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <BrandedPanelHeader
        icon={Heart}
        title="Labor of Love"
        description="Marketplace for non-scalable human experiences"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b px-4">
          <TabsList className="h-9 w-full justify-start bg-transparent p-0">
            <TabsTrigger
              value="browse"
              className="rounded-none border-b-2 border-transparent px-3 py-1.5 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              <Search className="mr-1.5 h-3.5 w-3.5" />
              Browse
            </TabsTrigger>
            <TabsTrigger
              value="my-listings"
              className="rounded-none border-b-2 border-transparent px-3 py-1.5 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              <Palette className="mr-1.5 h-3.5 w-3.5" />
              My Listings
            </TabsTrigger>
            <TabsTrigger
              value="my-orders"
              className="rounded-none border-b-2 border-transparent px-3 py-1.5 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              <ShoppingBag className="mr-1.5 h-3.5 w-3.5" />
              My Orders
            </TabsTrigger>
            <TabsTrigger
              value="fulfillment"
              className="rounded-none border-b-2 border-transparent px-3 py-1.5 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
              Fulfillment
            </TabsTrigger>
            <TabsTrigger
              value="bounties"
              className="rounded-none border-b-2 border-transparent px-3 py-1.5 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              <Target className="mr-1.5 h-3.5 w-3.5" />
              Bounties
            </TabsTrigger>
            <TabsTrigger
              value="integrations"
              className="rounded-none border-b-2 border-transparent px-3 py-1.5 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              <Plug className="mr-1.5 h-3.5 w-3.5" />
              Integrations
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── Browse Tab ──────────────────────────────────────────────────── */}
          <TabsContent value="browse" className="m-0 p-4 space-y-4">
            {/* Search + Filter Bar */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search experiences..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 text-sm h-9"
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[160px] text-xs h-9">
                  <Filter className="mr-1.5 h-3.5 w-3.5" />
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Types</SelectItem>
                  {Object.entries(LISTING_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key} className="text-xs">
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Listings Grid */}
            {loadingBrowse ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : filteredListings.length > 0 ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredListings.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Heart}
                title="No experiences found"
                description="Try adjusting your search or filters, or check back later for new human experiences."
              />
            )}
          </TabsContent>

          {/* ── My Listings Tab ─────────────────────────────────────────────── */}
          <TabsContent value="my-listings" className="m-0 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Your Listings</h2>
              {!showCreateForm && (
                <Button size="sm" variant="outline" onClick={() => setShowCreateForm(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Create Listing
                </Button>
              )}
            </div>

            {showCreateForm && (
              <CreateListingForm
                onCreated={handleListingCreated}
                onCancel={() => setShowCreateForm(false)}
              />
            )}

            {loadingMyListings ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : myListings.length > 0 ? (
              <div className="space-y-3">
                {myListings.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} compact />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Palette}
                title="No listings yet"
                description="Share your unique human experiences with the community. Create your first listing to get started."
              />
            )}
          </TabsContent>

          {/* ── My Orders Tab ──────────────────────────────────────────────── */}
          <TabsContent value="my-orders" className="m-0 p-4 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Your Orders</h2>

            {loadingOrders ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : myOrders.length > 0 ? (
              <div className="space-y-3">
                {myOrders.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={ShoppingBag}
                title="No orders yet"
                description="Browse the marketplace to find unique human experiences and place your first order."
              />
            )}
          </TabsContent>

          {/* ── Fulfillment Dashboard ──────────────────────────────────────── */}
          <TabsContent value="fulfillment" className="m-0 p-4 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Fulfillment Dashboard</h2>

            {loadingFulfillment ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : fulfillmentScore ? (
              <>
                {/* Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatCard
                    icon={Package}
                    label="Total Sold"
                    value={fulfillmentScore.totalExperiencesSold}
                  />
                  <StatCard
                    icon={ShoppingBag}
                    label="Total Bought"
                    value={fulfillmentScore.totalExperiencesBought}
                  />
                  <StatCard
                    icon={Star}
                    label="Combined Yield"
                    value={`${Math.round(fulfillmentScore.combinedFulfillmentYield * 100)}%`}
                  />
                  <StatCard
                    icon={Heart}
                    label="Top Domain"
                    value={
                      fulfillmentScore.topDomains.length > 0
                        ? LISTING_TYPE_LABELS[fulfillmentScore.topDomains[0] as MarketplaceListingType] ??
                          fulfillmentScore.topDomains[0]
                        : "None"
                    }
                  />
                </div>

                {/* Seller / Buyer Yield */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Yield Breakdown</CardTitle>
                    <CardDescription className="text-xs">
                      Your fulfillment yield as a seller and buyer
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Seller Yield</span>
                        <span className="font-medium">
                          {Math.round(fulfillmentScore.avgSellerFulfillment * 100)}%
                        </span>
                      </div>
                      <Progress value={fulfillmentScore.avgSellerFulfillment * 100} className="h-2" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Buyer Yield</span>
                        <span className="font-medium">
                          {Math.round(fulfillmentScore.avgBuyerFulfillment * 100)}%
                        </span>
                      </div>
                      <Progress value={fulfillmentScore.avgBuyerFulfillment * 100} className="h-2" />
                    </div>
                  </CardContent>
                </Card>

                {/* Domain Progress Bars */}
                {fulfillmentScore.topDomains.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Domain Activity</CardTitle>
                      <CardDescription className="text-xs">
                        Your engagement across experience domains
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {fulfillmentScore.topDomains.map((domain, idx) => (
                        <DomainProgressBar
                          key={domain}
                          domain={domain}
                          value={Math.max(0.1, 1 - idx * 0.2)}
                        />
                      ))}
                    </CardContent>
                  </Card>
                )}

                {fulfillmentScore.lastActivityAt && (
                  <p className="text-[10px] text-muted-foreground text-right">
                    Last activity: {formatDate(fulfillmentScore.lastActivityAt)}
                  </p>
                )}
              </>
            ) : (
              <EmptyState
                icon={BarChart3}
                title="No fulfillment data"
                description="Complete buying or selling experiences to build your fulfillment yield score."
              />
            )}
          </TabsContent>

          {/* ── Bounties Tab ───────────────────────────────────────────── */}
          <TabsContent value="bounties" className="m-0 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Bounty Board</h3>
              <Button variant="outline" size="sm" className="text-xs gap-1">
                <Plus className="h-3 w-3" />
                Add Bounty
              </Button>
            </div>
            <Card className="bg-card border-border">
              <CardContent className="p-6 text-center">
                <Target className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">No bounties discovered</p>
                <p className="text-xs text-muted-foreground mt-1">Add external challenges from DEV.to, Notion, GitHub, or Product Hunt to track submissions</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Integrations Tab ──────────────────────────────────────── */}
          <TabsContent value="integrations" className="m-0 p-4 space-y-4">
            <IntegrationsTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
