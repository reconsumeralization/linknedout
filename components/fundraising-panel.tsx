"use client"

import type { ActiveView } from "@/app/page"
import { CrmTalentNav } from "@/components/crm-talent-nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  type FundraisingCampaignStatus,
  type FundraisingCampaignView,
  type FundraisingDonationStatus,
  type FundraisingDonationView,
  type FundraisingDonorView,
  type FundraisingGoalStatus,
  type FundraisingGoalView,
  type FundraisingSnapshot,
  fetchFundraisingSnapshot,
  subscribeToFundraisingCampaigns,
  subscribeToFundraisingDonations,
  subscribeToFundraisingDonors,
  subscribeToFundraisingGoals,
  upsertFundraisingCampaign,
  upsertFundraisingDonation,
  upsertFundraisingDonor,
  upsertFundraisingGoal,
} from "@/lib/supabase/supabase-data"
import { cn } from "@/lib/shared/utils"
import { BrandedPanelHeader } from "@/components/branded-panel-header"
import { resolveSupabaseAccessToken } from "@/lib/supabase/supabase-client-auth"
import {
  Calendar,
  DollarSign,
  Goal,
  HandCoins,
  Link2,
  Mail,
  Plus,
  Send,
  Target,
  TrendingUp,
  Users,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Progress } from "@/components/ui/progress"

type OutreachCampaign = {
  id: string
  fundraisingCampaignId: string
  channel: "email" | "linkedin"
  name: string
  subject: string | null
  bodyText: string
  status: string
  scheduledAt: string | null
  sentAt: string | null
  linkedinPostId: string | null
  emailIntegrationId: string | null
  createdAt: string
  updatedAt: string
}

const CAMPAIGN_STATUS: FundraisingCampaignStatus[] = ["draft", "active", "paused", "completed", "archived"]
const DONATION_STATUS: FundraisingDonationStatus[] = ["pledged", "received", "recurring", "refunded", "cancelled"]
const GOAL_STATUS: FundraisingGoalStatus[] = ["active", "met", "missed", "cancelled"]
const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "OTHER"]

function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency === "OTHER" ? "USD" : currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(s: string | undefined): string {
  if (!s) return "—"
  try {
    return new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
  } catch {
    return s
  }
}

export interface FundraisingPanelProps {
  onNavigate?: (view: ActiveView) => void
}

export function FundraisingPanel({ onNavigate }: FundraisingPanelProps) {
  const [snapshot, setSnapshot] = useState<FundraisingSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("campaigns")

  const [createCampaignOpen, setCreateCampaignOpen] = useState(false)
  const [createDonorOpen, setCreateDonorOpen] = useState(false)
  const [createDonationOpen, setCreateDonationOpen] = useState(false)
  const [createGoalOpen, setCreateGoalOpen] = useState(false)

  const [newCampaignName, setNewCampaignName] = useState("")
  const [newCampaignDesc, setNewCampaignDesc] = useState("")
  const [newCampaignGoal, setNewCampaignGoal] = useState("")
  const [newCampaignCurrency, setNewCampaignCurrency] = useState("USD")
  const [newCampaignStatus, setNewCampaignStatus] = useState<FundraisingCampaignStatus>("draft")
  const [newCampaignStart, setNewCampaignStart] = useState("")
  const [newCampaignEnd, setNewCampaignEnd] = useState("")

  const [newDonorName, setNewDonorName] = useState("")
  const [newDonorEmail, setNewDonorEmail] = useState("")
  const [newDonorCompany, setNewDonorCompany] = useState("")
  const [newDonorNotes, setNewDonorNotes] = useState("")
  const [newDonorCampaignId, setNewDonorCampaignId] = useState<string>("")

  const [newDonationCampaignId, setNewDonationCampaignId] = useState("")
  const [newDonationDonorId, setNewDonationDonorId] = useState("")
  const [newDonationAmount, setNewDonationAmount] = useState("")
  const [newDonationCurrency, setNewDonationCurrency] = useState("USD")
  const [newDonationStatus, setNewDonationStatus] = useState<FundraisingDonationStatus>("pledged")
  const [newDonationNote, setNewDonationNote] = useState("")

  const [newGoalCampaignId, setNewGoalCampaignId] = useState("")
  const [newGoalTitle, setNewGoalTitle] = useState("")
  const [newGoalTarget, setNewGoalTarget] = useState("")
  const [newGoalDue, setNewGoalDue] = useState("")

  const [outreachCampaigns, setOutreachCampaigns] = useState<OutreachCampaign[]>([])
  const [outreachLoading, setOutreachLoading] = useState(false)
  const [emailIntegrations, setEmailIntegrations] = useState<Array<{ id: string; email: string; status: string }>>([])
  const [newEmailOutreachOpen, setNewEmailOutreachOpen] = useState(false)
  const [newLinkedInOutreachOpen, setNewLinkedInOutreachOpen] = useState(false)
  const [addRecipientsOpen, setAddRecipientsOpen] = useState(false)
  const [selectedOutreachId, setSelectedOutreachId] = useState<string | null>(null)
  const [outreachSending, setOutreachSending] = useState<string | null>(null)
  const [outreachError, setOutreachError] = useState<string | null>(null)

  const [newEmailOutreachCampaignId, setNewEmailOutreachCampaignId] = useState("")
  const [newEmailOutreachName, setNewEmailOutreachName] = useState("")
  const [newEmailOutreachSubject, setNewEmailOutreachSubject] = useState("")
  const [newEmailOutreachBody, setNewEmailOutreachBody] = useState("")
  const [newEmailOutreachIntegrationId, setNewEmailOutreachIntegrationId] = useState("")

  const [newLinkedInOutreachCampaignId, setNewLinkedInOutreachCampaignId] = useState("")
  const [newLinkedInOutreachName, setNewLinkedInOutreachName] = useState("")
  const [newLinkedInOutreachBody, setNewLinkedInOutreachBody] = useState("")

  const [recipientDonorIds, setRecipientDonorIds] = useState<string[]>([])
  const [recipientSaving, setRecipientSaving] = useState(false)

  const loadSnapshot = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchFundraisingSnapshot()
      setSnapshot(data ?? { campaigns: [], donors: [], donations: [], goals: [] })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSnapshot()
    const unsubCampaigns = subscribeToFundraisingCampaigns(loadSnapshot)
    const unsubDonors = subscribeToFundraisingDonors(loadSnapshot)
    const unsubDonations = subscribeToFundraisingDonations(loadSnapshot)
    const unsubGoals = subscribeToFundraisingGoals(loadSnapshot)
    return () => {
      unsubCampaigns?.()
      unsubDonors?.()
      unsubDonations?.()
      unsubGoals?.()
    }
  }, [loadSnapshot])

  const summary = useMemo(() => {
    const campaigns = snapshot?.campaigns ?? []
    const donations = snapshot?.donations ?? []
    const donors = snapshot?.donors ?? []
    const totalRaised = donations
      .filter((d) => d.status !== "refunded" && d.status !== "cancelled")
      .reduce((sum, d) => sum + d.amount, 0)
    const activeCampaigns = campaigns.filter((c) => c.status === "active").length
    return {
      totalRaised,
      activeCampaigns,
      donorCount: donors.length,
      recentDonations: donations.slice(0, 5),
    }
  }, [snapshot])

  const handleCreateCampaign = useCallback(async () => {
    if (!newCampaignName.trim()) return
    const goalAmount = parseFloat(newCampaignGoal) || 0
    await upsertFundraisingCampaign({
      name: newCampaignName.trim(),
      description: newCampaignDesc.trim() || undefined,
      goalAmount,
      currency: newCampaignCurrency,
      status: newCampaignStatus,
      startDate: newCampaignStart || undefined,
      endDate: newCampaignEnd || undefined,
    })
    setNewCampaignName("")
    setNewCampaignDesc("")
    setNewCampaignGoal("")
    setNewCampaignStart("")
    setNewCampaignEnd("")
    setCreateCampaignOpen(false)
    void loadSnapshot()
  }, [newCampaignName, newCampaignDesc, newCampaignGoal, newCampaignCurrency, newCampaignStatus, newCampaignStart, newCampaignEnd, loadSnapshot])

  const handleCreateDonor = useCallback(async () => {
    if (!newDonorName.trim()) return
    await upsertFundraisingDonor({
      name: newDonorName.trim(),
      email: newDonorEmail.trim() || undefined,
      company: newDonorCompany.trim() || undefined,
      notes: newDonorNotes.trim() || undefined,
      campaignId: newDonorCampaignId || undefined,
    })
    setNewDonorName("")
    setNewDonorEmail("")
    setNewDonorCompany("")
    setNewDonorNotes("")
    setNewDonorCampaignId("")
    setCreateDonorOpen(false)
    void loadSnapshot()
  }, [newDonorName, newDonorEmail, newDonorCompany, newDonorNotes, newDonorCampaignId, loadSnapshot])

  const handleCreateDonation = useCallback(async () => {
    if (!newDonationCampaignId || !newDonationAmount.trim()) return
    const amount = parseFloat(newDonationAmount)
    if (amount <= 0) return
    await upsertFundraisingDonation({
      campaignId: newDonationCampaignId,
      donorId: newDonationDonorId || undefined,
      amount,
      currency: newDonationCurrency,
      status: newDonationStatus,
      note: newDonationNote.trim() || undefined,
    })
    setNewDonationCampaignId("")
    setNewDonationDonorId("")
    setNewDonationAmount("")
    setNewDonationNote("")
    setCreateDonationOpen(false)
    void loadSnapshot()
  }, [newDonationCampaignId, newDonationDonorId, newDonationAmount, newDonationCurrency, newDonationStatus, newDonationNote, loadSnapshot])

  const handleCreateGoal = useCallback(async () => {
    if (!newGoalCampaignId || !newGoalTitle.trim()) return
    const targetAmount = parseFloat(newGoalTarget) || 0
    await upsertFundraisingGoal({
      campaignId: newGoalCampaignId,
      title: newGoalTitle.trim(),
      targetAmount,
      dueDate: newGoalDue || undefined,
      currency: "USD",
    })
    setNewGoalCampaignId("")
    setNewGoalTitle("")
    setNewGoalTarget("")
    setNewGoalDue("")
    setCreateGoalOpen(false)
    void loadSnapshot()
  }, [newGoalCampaignId, newGoalTitle, newGoalTarget, newGoalDue, loadSnapshot])

  const getAuthHeaders = useCallback((): HeadersInit => {
    const token = resolveSupabaseAccessToken()
    const h: HeadersInit = { "Content-Type": "application/json" }
    if (token) (h as Record<string, string>).Authorization = `Bearer ${token}`
    return h
  }, [])

  const loadOutreach = useCallback(async () => {
    setOutreachLoading(true)
    setOutreachError(null)
    try {
      const res = await fetch("/api/fundraising/outreach", { headers: getAuthHeaders() })
      const data = await res.json().catch(() => ({}))
      if (data.ok && Array.isArray(data.campaigns)) {
        setOutreachCampaigns(data.campaigns)
      }
    } catch (e) {
      setOutreachError(e instanceof Error ? e.message : "Failed to load outreach")
    } finally {
      setOutreachLoading(false)
    }
  }, [getAuthHeaders])

  const loadEmailIntegrations = useCallback(async () => {
    try {
      const res = await fetch("/api/email/integrations", { headers: getAuthHeaders() })
      const data = await res.json().catch(() => ({}))
      if (data.ok && Array.isArray(data.integrations)) {
        setEmailIntegrations(
          data.integrations.map((i: { id: string; email: string; status: string }) => ({
            id: i.id,
            email: i.email,
            status: i.status,
          })),
        )
      }
    } catch {
      /* ignore */
    }
  }, [getAuthHeaders])

  useEffect(() => {
    if (activeTab === "outreach") void loadOutreach()
  }, [activeTab, loadOutreach])

  useEffect(() => {
    if (newEmailOutreachOpen) void loadEmailIntegrations()
  }, [newEmailOutreachOpen, loadEmailIntegrations])

  const handleCreateEmailOutreach = useCallback(async () => {
    if (!newEmailOutreachCampaignId || !newEmailOutreachName.trim()) return
    setOutreachError(null)
    try {
      const res = await fetch("/api/fundraising/outreach", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          fundraisingCampaignId: newEmailOutreachCampaignId,
          channel: "email",
          name: newEmailOutreachName.trim(),
          subject: newEmailOutreachSubject.trim() || undefined,
          bodyText: newEmailOutreachBody.trim() || "",
          integrationId: newEmailOutreachIntegrationId || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setOutreachError(data.message || data.error || "Create failed")
        return
      }
      setNewEmailOutreachCampaignId("")
      setNewEmailOutreachName("")
      setNewEmailOutreachSubject("")
      setNewEmailOutreachBody("")
      setNewEmailOutreachIntegrationId("")
      setNewEmailOutreachOpen(false)
      await loadOutreach()
      if (data.campaign?.id) {
        setSelectedOutreachId(data.campaign.id)
        setRecipientDonorIds([])
        setAddRecipientsOpen(true)
      }
    } catch (e) {
      setOutreachError(e instanceof Error ? e.message : "Request failed")
    }
  }, [newEmailOutreachCampaignId, newEmailOutreachName, newEmailOutreachSubject, newEmailOutreachBody, newEmailOutreachIntegrationId, getAuthHeaders, loadOutreach])

  const handleCreateLinkedInOutreach = useCallback(async () => {
    if (!newLinkedInOutreachCampaignId || !newLinkedInOutreachName.trim() || !newLinkedInOutreachBody.trim()) return
    setOutreachError(null)
    try {
      const res = await fetch("/api/fundraising/outreach", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          fundraisingCampaignId: newLinkedInOutreachCampaignId,
          channel: "linkedin",
          name: newLinkedInOutreachName.trim(),
          bodyText: newLinkedInOutreachBody.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setOutreachError(data.message || data.error || "Create failed")
        return
      }
      const outreachId = data.campaign?.id
      setNewLinkedInOutreachCampaignId("")
      setNewLinkedInOutreachName("")
      setNewLinkedInOutreachBody("")
      setNewLinkedInOutreachOpen(false)
      await loadOutreach()
      if (outreachId) {
        setSelectedOutreachId(outreachId)
        setOutreachSending(outreachId)
        setOutreachError(null)
        const sendRes = await fetch(`/api/fundraising/outreach/${outreachId}/send`, {
          method: "POST",
          headers: getAuthHeaders(),
        })
        const sendData = await sendRes.json().catch(() => ({}))
        setOutreachSending(null)
        if (!sendRes.ok) setOutreachError(sendData.message || sendData.error || "Post failed")
        else await loadOutreach()
      }
    } catch (e) {
      setOutreachError(e instanceof Error ? e.message : "Request failed")
      setOutreachSending(null)
    }
  }, [newLinkedInOutreachCampaignId, newLinkedInOutreachName, newLinkedInOutreachBody, getAuthHeaders, loadOutreach])

  const handleAddRecipients = useCallback(async () => {
    if (!selectedOutreachId) return
    setRecipientSaving(true)
    setOutreachError(null)
    try {
      const res = await fetch(`/api/fundraising/outreach/${selectedOutreachId}/recipients`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ donorIds: recipientDonorIds }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setOutreachError(data.message || data.error || "Failed to add recipients")
        return
      }
      setAddRecipientsOpen(false)
      setSelectedOutreachId(null)
      setRecipientDonorIds([])
      await loadOutreach()
    } catch (e) {
      setOutreachError(e instanceof Error ? e.message : "Request failed")
    } finally {
      setRecipientSaving(false)
    }
  }, [selectedOutreachId, recipientDonorIds, getAuthHeaders, loadOutreach])

  const handleSendOutreach = useCallback(async (outreachId: string) => {
    setOutreachSending(outreachId)
    setOutreachError(null)
    try {
      const res = await fetch(`/api/fundraising/outreach/${outreachId}/send`, {
        method: "POST",
        headers: getAuthHeaders(),
      })
      const data = await res.json().catch(() => ({}))
      setOutreachSending(null)
      if (!res.ok) setOutreachError(data.message || data.error || "Send failed")
      else await loadOutreach()
    } catch (e) {
      setOutreachError(e instanceof Error ? e.message : "Request failed")
      setOutreachSending(null)
    }
  }, [getAuthHeaders, loadOutreach])

  const campaigns = snapshot?.campaigns ?? []
  const donors = snapshot?.donors ?? []
  const donations = snapshot?.donations ?? []
  const goals = snapshot?.goals ?? []

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <BrandedPanelHeader
        title="Fundraising"
        description="Campaigns, donors, donations, and goals"
        icon={HandCoins}
        right={onNavigate ? <CrmTalentNav activeView="fundraising" onNavigate={onNavigate} /> : undefined}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="border-border/60 bg-card">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Total raised</span>
                <DollarSign className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-1 text-xl font-bold text-foreground">{formatCurrency(summary.totalRaised)}</p>
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-card">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Active campaigns</span>
                <Target className="h-4 w-4 text-accent" />
              </div>
              <p className="mt-1 text-xl font-bold text-foreground">{summary.activeCampaigns}</p>
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-card">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Donors</span>
                <Users className="h-4 w-4 text-chart-3" />
              </div>
              <p className="mt-1 text-xl font-bold text-foreground">{summary.donorCount}</p>
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-card">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Recent</span>
                <TrendingUp className="h-4 w-4 text-chart-5" />
              </div>
              <p className="mt-1 text-sm font-medium text-foreground">
                {summary.recentDonations.length} latest
              </p>
            </CardContent>
          </Card>
        </div>
      </BrandedPanelHeader>

      <div className="flex-1 overflow-hidden p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="w-fit shrink-0">
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="donors">Donors</TabsTrigger>
            <TabsTrigger value="donations">Donations</TabsTrigger>
            <TabsTrigger value="goals">Goals</TabsTrigger>
            <TabsTrigger value="outreach">Outreach</TabsTrigger>
          </TabsList>

          {loading ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">Loading…</div>
          ) : (
            <>
              <TabsContent value="campaigns" className="mt-4 flex-1 overflow-auto data-[state=inactive]:hidden">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-sm text-muted-foreground">{campaigns.length} campaign(s)</span>
                  <Button size="sm" onClick={() => setCreateCampaignOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" /> New campaign
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {campaigns.map((c) => (
                    <CampaignCard key={c.id} campaign={c} />
                  ))}
                </div>
                {campaigns.length === 0 && (
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                      <HandCoins className="h-10 w-10 text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground">No campaigns yet</p>
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => setCreateCampaignOpen(true)}>
                        Create campaign
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="donors" className="mt-4 flex-1 overflow-auto data-[state=inactive]:hidden">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-sm text-muted-foreground">{donors.length} donor(s)</span>
                  <Button size="sm" onClick={() => setCreateDonorOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" /> New donor
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {donors.map((d) => (
                    <DonorCard key={d.id} donor={d} />
                  ))}
                </div>
                {donors.length === 0 && (
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                      <Users className="h-10 w-10 text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground">No donors yet</p>
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => setCreateDonorOpen(true)}>
                        Add donor
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="donations" className="mt-4 flex-1 overflow-auto data-[state=inactive]:hidden">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-sm text-muted-foreground">{donations.length} donation(s)</span>
                  <Button size="sm" onClick={() => setCreateDonationOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" /> New donation
                  </Button>
                </div>
                <div className="space-y-2">
                  {donations.map((d) => (
                    <DonationRow key={d.id} donation={d} donorName={donors.find((x) => x.id === d.donorId)?.name} />
                  ))}
                </div>
                {donations.length === 0 && (
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                      <DollarSign className="h-10 w-10 text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground">No donations yet</p>
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => setCreateDonationOpen(true)}>
                        Record donation
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="goals" className="mt-4 flex-1 overflow-auto data-[state=inactive]:hidden">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-sm text-muted-foreground">{goals.length} goal(s)</span>
                  <Button size="sm" onClick={() => setCreateGoalOpen(true)} disabled={campaigns.length === 0}>
                    <Plus className="h-4 w-4 mr-1" /> New goal
                  </Button>
                </div>
                <div className="space-y-3">
                  {goals.map((g) => (
                    <GoalCard key={g.id} goal={g} campaignName={campaigns.find((c) => c.id === g.campaignId)?.name} />
                  ))}
                </div>
                {goals.length === 0 && (
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                      <Goal className="h-10 w-10 text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground">No goals yet. Create a campaign first.</p>
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => setCreateGoalOpen(true)} disabled={campaigns.length === 0}>
                        Add goal
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="outreach" className="mt-4 flex-1 overflow-auto data-[state=inactive]:hidden">
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <span className="text-sm text-muted-foreground">{outreachCampaigns.length} outreach campaign(s)</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setNewEmailOutreachOpen(true)} disabled={campaigns.length === 0}>
                      <Mail className="h-4 w-4 mr-1" /> Email campaign
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setNewLinkedInOutreachOpen(true)} disabled={campaigns.length === 0}>
                      <Link2 className="h-4 w-4 mr-1" /> LinkedIn post
                    </Button>
                  </div>
                </div>
                {outreachError && (
                  <div className="mb-3 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                    {outreachError}
                  </div>
                )}
                {outreachLoading ? (
                  <div className="text-sm text-muted-foreground">Loading outreach…</div>
                ) : (
                  <div className="space-y-2">
                    {outreachCampaigns.map((o) => {
                      const isSending = outreachSending === o.id
                      const canSend = o.status === "draft"
                      return (
                        <Card key={o.id} className="border-border/60">
                          <CardContent className="py-3 px-4 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-3">
                              {o.channel === "email" ? (
                                <Mail className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Link2 className="h-4 w-4 text-muted-foreground" />
                              )}
                              <div>
                                <p className="font-medium">{o.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {campaigns.find((c) => c.id === o.fundraisingCampaignId)?.name ?? o.fundraisingCampaignId} · {o.channel} · {o.status}
                                  {o.sentAt && ` · ${formatDate(o.sentAt)}`}
                                </p>
                              </div>
                              <Badge variant="secondary" className={cn(o.status === "sent" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400")}>
                                {o.status}
                              </Badge>
                            </div>
                            <div className="flex gap-2">
                              {o.channel === "email" && o.status === "draft" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedOutreachId(o.id)
                                    setRecipientDonorIds(donors.filter((d) => !d.campaignId || d.campaignId === o.fundraisingCampaignId).map((d) => d.id))
                                    setAddRecipientsOpen(true)
                                  }}
                                >
                                  Add recipients
                                </Button>
                              )}
                              {canSend && (
                                <Button
                                  size="sm"
                                  disabled={isSending}
                                  onClick={() => handleSendOutreach(o.id)}
                                >
                                  {isSending ? "Sending…" : o.channel === "linkedin" ? "Post now" : "Send"}
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )}
                {!outreachLoading && outreachCampaigns.length === 0 && (
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                      <Send className="h-10 w-10 text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground">No email or LinkedIn campaigns yet. Create a fundraising campaign first, then launch an email or LinkedIn outreach.</p>
                      <div className="flex gap-2 mt-3">
                        <Button variant="outline" size="sm" onClick={() => setNewEmailOutreachOpen(true)} disabled={campaigns.length === 0}>
                          Email campaign
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setNewLinkedInOutreachOpen(true)} disabled={campaigns.length === 0}>
                          LinkedIn post
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>

      {/* Create Campaign Dialog */}
      <Dialog open={createCampaignOpen} onOpenChange={setCreateCampaignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New campaign</DialogTitle>
            <DialogDescription>Create a fundraising campaign with a goal and dates.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="campaign-name">Name</Label>
              <Input id="campaign-name" value={newCampaignName} onChange={(e) => setNewCampaignName(e.target.value)} placeholder="e.g. Annual Fund 2026" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="campaign-desc">Description</Label>
              <Textarea id="campaign-desc" value={newCampaignDesc} onChange={(e) => setNewCampaignDesc(e.target.value)} placeholder="Optional" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="campaign-goal">Goal amount</Label>
                <Input id="campaign-goal" type="number" min={0} value={newCampaignGoal} onChange={(e) => setNewCampaignGoal(e.target.value)} placeholder="0" />
              </div>
              <div className="grid gap-2">
                <Label>Currency</Label>
                <Select value={newCampaignCurrency} onValueChange={setNewCampaignCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={newCampaignStatus} onValueChange={(v) => setNewCampaignStatus(v as FundraisingCampaignStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_STATUS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="campaign-start">Start date</Label>
                <Input id="campaign-start" type="date" value={newCampaignStart} onChange={(e) => setNewCampaignStart(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="campaign-end">End date</Label>
                <Input id="campaign-end" type="date" value={newCampaignEnd} onChange={(e) => setNewCampaignEnd(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateCampaignOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateCampaign} disabled={!newCampaignName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Donor Dialog */}
      <Dialog open={createDonorOpen} onOpenChange={setCreateDonorOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New donor</DialogTitle>
            <DialogDescription>Add a donor; optionally link to a campaign.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="donor-name">Name</Label>
              <Input id="donor-name" value={newDonorName} onChange={(e) => setNewDonorName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="donor-email">Email</Label>
              <Input id="donor-email" type="email" value={newDonorEmail} onChange={(e) => setNewDonorEmail(e.target.value)} placeholder="Optional" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="donor-company">Company</Label>
              <Input id="donor-company" value={newDonorCompany} onChange={(e) => setNewDonorCompany(e.target.value)} placeholder="Optional" />
            </div>
            <div className="grid gap-2">
              <Label>Campaign</Label>
              <Select value={newDonorCampaignId} onValueChange={setNewDonorCampaignId}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="donor-notes">Notes</Label>
              <Textarea id="donor-notes" value={newDonorNotes} onChange={(e) => setNewDonorNotes(e.target.value)} placeholder="Optional" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDonorOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateDonor} disabled={!newDonorName.trim()}>Add donor</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Donation Dialog */}
      <Dialog open={createDonationOpen} onOpenChange={setCreateDonationOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New donation</DialogTitle>
            <DialogDescription>Record a donation for a campaign; optionally link to a donor.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Campaign</Label>
              <Select value={newDonationCampaignId} onValueChange={setNewDonationCampaignId}>
                <SelectTrigger><SelectValue placeholder="Select campaign" /></SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Donor</Label>
              <Select value={newDonationDonorId} onValueChange={setNewDonationDonorId}>
                <SelectTrigger><SelectValue placeholder="Anonymous" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Anonymous</SelectItem>
                  {donors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="donation-amount">Amount</Label>
                <Input id="donation-amount" type="number" min={0.01} step={0.01} value={newDonationAmount} onChange={(e) => setNewDonationAmount(e.target.value)} placeholder="0" />
              </div>
              <div className="grid gap-2">
                <Label>Currency</Label>
                <Select value={newDonationCurrency} onValueChange={setNewDonationCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={newDonationStatus} onValueChange={(v) => setNewDonationStatus(v as FundraisingDonationStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DONATION_STATUS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="donation-note">Note</Label>
              <Input id="donation-note" value={newDonationNote} onChange={(e) => setNewDonationNote(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDonationOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateDonation} disabled={!newDonationCampaignId || !newDonationAmount.trim()}>Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Goal Dialog */}
      <Dialog open={createGoalOpen} onOpenChange={setCreateGoalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New goal</DialogTitle>
            <DialogDescription>Add a milestone goal to a campaign.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Campaign</Label>
              <Select value={newGoalCampaignId} onValueChange={setNewGoalCampaignId}>
                <SelectTrigger><SelectValue placeholder="Select campaign" /></SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="goal-title">Title</Label>
              <Input id="goal-title" value={newGoalTitle} onChange={(e) => setNewGoalTitle(e.target.value)} placeholder="e.g. Match challenge" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="goal-target">Target amount</Label>
                <Input id="goal-target" type="number" min={0} value={newGoalTarget} onChange={(e) => setNewGoalTarget(e.target.value)} placeholder="0" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="goal-due">Due date</Label>
                <Input id="goal-due" type="date" value={newGoalDue} onChange={(e) => setNewGoalDue(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateGoalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateGoal} disabled={!newGoalCampaignId || !newGoalTitle.trim()}>Add goal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Email Outreach Dialog */}
      <Dialog open={newEmailOutreachOpen} onOpenChange={setNewEmailOutreachOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New email campaign</DialogTitle>
            <DialogDescription>Create an email campaign for a fundraising campaign. Use {"{{name}}"}, {"{{firstName}}"}, {"{{lastName}}"}, {"{{campaignName}}"} in subject and body for personalization.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Fundraising campaign</Label>
              <Select value={newEmailOutreachCampaignId} onValueChange={setNewEmailOutreachCampaignId}>
                <SelectTrigger><SelectValue placeholder="Select campaign" /></SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email-outreach-name">Campaign name</Label>
              <Input id="email-outreach-name" value={newEmailOutreachName} onChange={(e) => setNewEmailOutreachName(e.target.value)} placeholder="e.g. Q1 Ask" />
            </div>
            <div className="grid gap-2">
              <Label>Send from (optional)</Label>
              <Select value={newEmailOutreachIntegrationId} onValueChange={setNewEmailOutreachIntegrationId}>
                <SelectTrigger><SelectValue placeholder="Use default" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Use default</SelectItem>
                  {emailIntegrations.filter((i) => i.status === "connected").map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email-outreach-subject">Subject</Label>
              <Input id="email-outreach-subject" value={newEmailOutreachSubject} onChange={(e) => setNewEmailOutreachSubject(e.target.value)} placeholder="Support {{campaignName}}" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email-outreach-body">Body</Label>
              <Textarea id="email-outreach-body" value={newEmailOutreachBody} onChange={(e) => setNewEmailOutreachBody(e.target.value)} placeholder="Hi {{firstName}}, ..." rows={6} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewEmailOutreachOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateEmailOutreach} disabled={!newEmailOutreachCampaignId || !newEmailOutreachName.trim()}>Create & add recipients</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New LinkedIn Outreach Dialog */}
      <Dialog open={newLinkedInOutreachOpen} onOpenChange={setNewLinkedInOutreachOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New LinkedIn post</DialogTitle>
            <DialogDescription>Create a LinkedIn post for a fundraising campaign. Connect LinkedIn in Settings with Share permission to post.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Fundraising campaign</Label>
              <Select value={newLinkedInOutreachCampaignId} onValueChange={setNewLinkedInOutreachCampaignId}>
                <SelectTrigger><SelectValue placeholder="Select campaign" /></SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="li-outreach-name">Post name (internal)</Label>
              <Input id="li-outreach-name" value={newLinkedInOutreachName} onChange={(e) => setNewLinkedInOutreachName(e.target.value)} placeholder="e.g. March appeal" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="li-outreach-body">Post text</Label>
              <Textarea id="li-outreach-body" value={newLinkedInOutreachBody} onChange={(e) => setNewLinkedInOutreachBody(e.target.value)} placeholder="Share your fundraising message…" rows={6} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewLinkedInOutreachOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateLinkedInOutreach} disabled={!newLinkedInOutreachCampaignId || !newLinkedInOutreachName.trim() || !newLinkedInOutreachBody.trim()}>Create & post now</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Recipients Dialog */}
      <Dialog open={addRecipientsOpen} onOpenChange={setAddRecipientsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add recipients</DialogTitle>
            <DialogDescription>Select donors to receive this email campaign. Only donors with an email are included.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-80 overflow-y-auto">
            {donors.filter((d) => d.email).map((d) => (
              <label key={d.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={recipientDonorIds.includes(d.id)}
                  onChange={(e) => {
                    if (e.target.checked) setRecipientDonorIds((ids) => [...ids, d.id])
                    else setRecipientDonorIds((ids) => ids.filter((id) => id !== d.id))
                  }}
                  className="rounded border-border"
                />
                <span className="text-sm">{d.name}</span>
                <span className="text-xs text-muted-foreground">{d.email}</span>
              </label>
            ))}
            {donors.filter((d) => d.email).length === 0 && (
              <p className="text-sm text-muted-foreground">No donors with email. Add donors with email addresses first.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddRecipientsOpen(false)}>Cancel</Button>
            <Button onClick={handleAddRecipients} disabled={recipientSaving || recipientDonorIds.length === 0}>
              {recipientSaving ? "Saving…" : `Add ${recipientDonorIds.length} recipient(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CampaignCard({ campaign }: { campaign: FundraisingCampaignView }) {
  const totalRaised = campaign.totalRaised ?? 0
  const goalAmount = campaign.goalAmount || 1
  const pct = Math.min(100, Math.round((totalRaised / goalAmount) * 100))
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{campaign.name}</CardTitle>
          <Badge variant="secondary" className={cn(
            campaign.status === "active" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
            campaign.status === "completed" && "bg-muted text-muted-foreground",
          )}>{campaign.status}</Badge>
        </div>
        {campaign.description && (
          <CardDescription className="line-clamp-2 text-xs">{campaign.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Raised</span>
          <span className="font-medium">{formatCurrency(totalRaised, campaign.currency)} / {formatCurrency(campaign.goalAmount, campaign.currency)}</span>
        </div>
        <Progress value={pct} className="h-2" />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          <span>{campaign.donorCount ?? 0} donors</span>
          {(campaign.startDate || campaign.endDate) && (
            <>
              <Calendar className="h-3 w-3 ml-2" />
              <span>{formatDate(campaign.startDate)} – {formatDate(campaign.endDate)}</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function DonorCard({ donor }: { donor: FundraisingDonorView }) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{donor.name}</CardTitle>
        {(donor.company || donor.email) && (
          <CardDescription className="text-xs">
            {[donor.company, donor.email].filter(Boolean).join(" · ")}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total donated</span>
          <span className="font-medium">{formatCurrency(donor.totalDonated)}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{donor.donationCount} donation(s)</p>
      </CardContent>
    </Card>
  )
}

function DonationRow({ donation, donorName }: { donation: FundraisingDonationView; donorName?: string }) {
  return (
    <Card className="border-border/60">
      <CardContent className="py-3 px-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="font-medium">{formatCurrency(donation.amount, donation.currency)}</span>
          <Badge variant="secondary" className="text-xs">{donation.status}</Badge>
          {(donorName || donation.donorName) && (
            <span className="text-sm text-muted-foreground">{(donorName || donation.donorName) ?? "Anonymous"}</span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{formatDate(donation.donatedAt)}</span>
      </CardContent>
    </Card>
  )
}

function GoalCard({ goal, campaignName }: { goal: FundraisingGoalView; campaignName?: string }) {
  const pct = goal.targetAmount > 0 ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)) : 0
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{goal.title}</CardTitle>
          <Badge variant="secondary" className={cn(
            goal.status === "met" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
            goal.status === "active" && "bg-primary/15 text-primary",
          )}>{goal.status}</Badge>
        </div>
        {campaignName && <CardDescription className="text-xs">{campaignName}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-medium">{formatCurrency(goal.currentAmount, goal.currency)} / {formatCurrency(goal.targetAmount, goal.currency)}</span>
        </div>
        <Progress value={pct} className="h-2" />
        {goal.dueDate && (
          <p className="text-xs text-muted-foreground">Due {formatDate(goal.dueDate)}</p>
        )}
      </CardContent>
    </Card>
  )
}
