import type { ComponentType } from "react"
import type { ActiveView } from "@/lib/shared/app-context"

export interface PanelRegistration {
  view: ActiveView
  label: string
  requiresAuth: boolean
  authMessage: string
  /** If set, panel is loaded via next/dynamic instead of statically imported */
  lazyImport?: () => Promise<{ default: ComponentType }>
  /** Statically imported component */
  component?: ComponentType
}

/** Auth gate messages for protected views */
const AUTH_MESSAGES: Partial<Record<ActiveView, string>> = {
  email: "Email workspace stores credentials securely. Sign in with Supabase to connect Gmail, Outlook, or IMAP.",
  sentinel: "SENTINEL security control plane requires authentication to view activity, veto queue, and threat intel.",
  agents: "Agent control and guardrails require sign-in to manage tool access and policies.",
  profiles: "Profiles CRM and Supabase-backed data require sign-in.",
  projects: "Projects and hiring data require sign-in.",
  tribes: "Tribe Builder and Supabase-backed tribes require sign-in.",
  fundraising: "Fundraising campaigns, donors, and donations require sign-in to manage data.",
  data: "Data hub and Supabase-backed areas require sign-in.",
  storage: "Files & assets (Supabase Storage) require sign-in.",
  marketplace: "Labor of Love marketplace requires sign-in to list, buy, and trade human experiences.",
}

/**
 * Panel registry — defines all panels, their auth requirements, and import strategy.
 * Components are attached at runtime in page.tsx (to keep this file free of "use client" imports).
 */
export const PANEL_DEFINITIONS: Omit<PanelRegistration, "component" | "lazyImport">[] = [
  { view: "dashboard", label: "Dashboard", requiresAuth: false, authMessage: "" },
  { view: "chat", label: "Chat", requiresAuth: false, authMessage: "" },
  { view: "profiles", label: "Profiles", requiresAuth: true, authMessage: AUTH_MESSAGES.profiles ?? "" },
  { view: "tribes", label: "Tribes", requiresAuth: true, authMessage: AUTH_MESSAGES.tribes ?? "" },
  { view: "projects", label: "Projects", requiresAuth: true, authMessage: AUTH_MESSAGES.projects ?? "" },
  { view: "fundraising", label: "Fundraising", requiresAuth: true, authMessage: AUTH_MESSAGES.fundraising ?? "" },
  { view: "data", label: "Data Hub", requiresAuth: true, authMessage: AUTH_MESSAGES.data ?? "" },
  { view: "storage", label: "Storage", requiresAuth: true, authMessage: AUTH_MESSAGES.storage ?? "" },
  { view: "email", label: "Email", requiresAuth: true, authMessage: AUTH_MESSAGES.email ?? "" },
  { view: "analytics", label: "Analytics", requiresAuth: false, authMessage: "" },
  { view: "linkedout", label: "LinkedOut", requiresAuth: false, authMessage: "" },
  { view: "network", label: "Network", requiresAuth: false, authMessage: "" },
  { view: "agents", label: "Agents", requiresAuth: true, authMessage: AUTH_MESSAGES.agents ?? "" },
  { view: "globe", label: "Globe", requiresAuth: false, authMessage: "" },
  { view: "sentinel", label: "SENTINEL", requiresAuth: true, authMessage: AUTH_MESSAGES.sentinel ?? "" },
  { view: "settings", label: "Settings", requiresAuth: false, authMessage: "" },
  { view: "marketplace", label: "Marketplace", requiresAuth: true, authMessage: AUTH_MESSAGES.marketplace ?? "" },
  { view: "transparency", label: "Transparency", requiresAuth: false, authMessage: "" },
  { view: "evolution", label: "Evolution", requiresAuth: false, authMessage: "" },
  { view: "workflows", label: "Workflows", requiresAuth: false, authMessage: "" },
  { view: "sovereign-mind", label: "Sovereign Mind", requiresAuth: true, authMessage: "Psychological and thermodynamic sovereign tools require sign-in." },
  { view: "genesis", label: "Genesis", requiresAuth: true, authMessage: "Genesis protocols and memory vaults require sign-in." },
  { view: "command-center", label: "Command Center", requiresAuth: true, authMessage: "Sovereign Command Center requires sign-in." },
  { view: "creators", label: "Creators", requiresAuth: true, authMessage: "Micro-Creators marketplace requires sign-in." },
  { view: "portfolio", label: "Portfolio", requiresAuth: true, authMessage: "Portfolio Command requires sign-in to manage your companies." },
]
