"use client"

import type { ActiveView } from "@/app/page"
import type { ImportSummary } from "@/lib/csv/import-session"
import { APP_NAME, APP_TAGLINE } from "@/lib/shared/branding"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/shared/utils"
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  Database,
  FileUp,
  FolderKanban,
  Globe,
  HandCoins,
  HardDrive,
  Heart,
  Layers,
  LayoutDashboard,
  Link2,
  Linkedin,
  LogIn,
  Mail,
  MessageSquare,
  Network,
  Rocket,
  Settings,
  ShieldAlert,
  Sparkles,
  Users,
  Zap,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

type NavItem = {
  id: ActiveView
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  badgeVariant?: "default" | "accent" | "success" | "warning"
  description?: string
  shortcut?: string
}

type NavGroup = { label: string; items: NavItem[] }

const navGroups: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Overview & metrics", shortcut: "⌘D" },
      { id: "chat", label: "AI Assistant", icon: MessageSquare, badge: "AI", badgeVariant: "accent", description: "Chat with Claude & GPT", shortcut: "⌘K" },
      { id: "email", label: "Email", icon: Mail, badge: "SECURE", badgeVariant: "success", description: "Encrypted messaging", shortcut: "⌘E" },
    ],
  },
  {
    label: "CRM & Talent",
    items: [
      { id: "data", label: "Data hub", icon: Database, description: "All Supabase-backed data" },
      { id: "profiles", label: "Profiles CRM", icon: Users, description: "Manage contacts", shortcut: "⌘P" },
      { id: "tribes", label: "Tribe Builder", icon: Layers, description: "Build dream teams", shortcut: "⌘T" },
      { id: "projects", label: "Projects", icon: FolderKanban, description: "Track initiatives" },
      { id: "fundraising", label: "Fundraising", icon: HandCoins, description: "Campaigns, donors, goals" },
      { id: "storage", label: "Files & assets", icon: HardDrive, description: "Supabase Storage" },
      { id: "linkedout", label: "LinkedOut", icon: Link2, description: "LinkedIn integration" },
    ],
  },
  {
    label: "Insights",
    items: [
      { id: "network", label: "Network Insights", icon: Network, description: "Connection analysis" },
      { id: "analytics", label: "Analytics", icon: BarChart3, description: "Data visualization" },
      { id: "globe", label: "3D Globe", icon: Globe, badge: "NEW", badgeVariant: "warning", description: "Geographic view" },
    ],
  },
  {
    label: "Security & Control",
    items: [
      { id: "agents", label: "Agent Control", icon: Bot, description: "Manage AI agents" },
      { id: "sentinel", label: "SENTINEL", icon: ShieldAlert, badge: "SEC", badgeVariant: "default", description: "Security monitor" },
    ],
  },
  {
    label: "Sovereign Economy",
    items: [
      { id: "marketplace", label: "Labor of Love", icon: Heart, badge: "NEW", badgeVariant: "warning", description: "Trade human experiences" },
    ],
  },
]

const badgeStyles = {
  default: "bg-muted text-muted-foreground",
  accent: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20",
  success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
  warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20",
}

interface AppSidebarProps {
  activeView: ActiveView
  onNavigate: (view: ActiveView) => void
  importSummary: ImportSummary | null
}

export function AppSidebar({ activeView, onNavigate, importSummary }: AppSidebarProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [currentTime, setCurrentTime] = useState<string>("")

  // Update time every minute
  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    }
    updateTime()
    const interval = setInterval(updateTime, 60000)
    return () => clearInterval(interval)
  }, [])

  const handleNavigate = useCallback((view: ActiveView) => {
    onNavigate(view)
  }, [onNavigate])

  const activeGroup = useMemo(() => {
    for (const group of navGroups) {
      if (group.items.some(item => item.id === activeView)) {
        return group.label
      }
    }
    return null
  }, [activeView])

  // Calculate stats for footer
  const totalViews = navGroups.reduce((acc, group) => acc + group.items.length, 0)

  return (
    <aside 
      className={cn(
        "group/sidebar flex flex-col border-r border-border/60 bg-gradient-to-b from-sidebar via-sidebar to-sidebar/95 shrink-0 overflow-y-auto transition-all duration-300 ease-out",
        isCollapsed ? "w-16 min-w-16" : "w-60 min-w-60"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-border/50 bg-gradient-to-r from-primary/5 via-transparent to-transparent backdrop-blur-sm sticky top-0 z-10">
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-primary/30 via-primary/20 to-primary/10 text-primary shadow-lg shadow-primary/10 ring-1 ring-primary/20 transition-transform hover:scale-105">
          <Linkedin className="w-5 h-5" />
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full ring-2 ring-sidebar animate-pulse shadow-lg shadow-emerald-500/30" />
        </div>
        {!isCollapsed && (
          <div className="leading-tight flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-bold text-foreground tracking-tight bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">{APP_NAME}</span>
              <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
            </div>
            <div className="text-[10px] text-muted-foreground font-medium tracking-wide">{APP_TAGLINE}</div>
          </div>
        )}
      </div>

      {/* Import Status */}
      {importSummary && !isCollapsed ? (
        <section 
          aria-label="Import Status" 
          className="mx-3 mt-3 px-3 py-3 rounded-xl bg-gradient-to-br from-accent/20 via-accent/10 to-accent/5 border border-accent/30 shadow-md shadow-accent/5 backdrop-blur-sm"
        >
          <div className="flex items-center gap-2.5 text-[11px] text-accent font-semibold">
            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-accent/25 shadow-sm">
              <FileUp className="w-3.5 h-3.5 shrink-0" />
            </div>
            <span className="truncate flex-1 font-medium">{importSummary.label}</span>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <Zap className="w-3 h-3 text-amber-500 animate-pulse" />
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-1.5 ml-8">
            <Activity className="w-3 h-3 text-emerald-500" />
            <span>
              {importSummary.sourceCount > 1
                ? `${importSummary.profileCount} profiles from ${importSummary.sourceCount} files ready for analysis`
                : `${importSummary.profileCount} profiles ready for analysis`}
            </span>
          </div>
        </section>
      ) : importSummary && isCollapsed ? (
        <div className="mx-auto mt-3 flex items-center justify-center w-8 h-8 rounded-lg bg-accent/20 border border-accent/30">
          <FileUp className="w-4 h-4 text-accent" />
        </div>
      ) : null}

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-5" aria-label="Sidebar Main Navigation">
        {navGroups.map((group, groupIndex) => (
          <div key={group.label} className="relative">
            {!isCollapsed && (
              <div className={cn(
                "px-3 pb-2 text-[10px] uppercase tracking-[0.15em] font-bold transition-colors flex items-center gap-2",
                activeGroup === group.label ? "text-primary" : "text-muted-foreground/80"
              )}>
                <span>{group.label}</span>
                {activeGroup === group.label && (
                  <div className="h-px flex-1 bg-gradient-to-r from-primary/40 to-transparent" />
                )}
              </div>
            )}
            {isCollapsed && groupIndex > 0 && (
              <div className="mx-auto my-2 h-px w-6 bg-border/50" />
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon
                const isActive = activeView === item.id
                const isHovered = hoveredItem === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigate(item.id)}
                    onMouseEnter={() => setHoveredItem(item.id)}
                    onMouseLeave={() => setHoveredItem(null)}
                    className={cn(
                      "group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ease-out",
                      isCollapsed && "justify-center px-2",
                      isActive
                        ? "bg-gradient-to-r from-primary/25 via-primary/15 to-primary/5 text-primary font-medium shadow-md shadow-primary/10 ring-1 ring-primary/25"
                        : "text-sidebar-foreground hover:bg-gradient-to-r hover:from-sidebar-accent/90 hover:to-sidebar-accent/60 hover:text-sidebar-accent-foreground hover:shadow-sm hover:translate-x-0.5"
                    )}
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <div className={cn(
                      "flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200",
                      isActive 
                        ? "bg-primary/25 text-primary shadow-sm shadow-primary/20" 
                        : "bg-muted/60 text-muted-foreground group-hover:bg-sidebar-accent group-hover:text-inherit group-hover:shadow-sm"
                    )}>
                      <Icon className="w-4.5 h-4.5" />
                    </div>
                    {!isCollapsed && (
                      <>
                        <div className="flex-1 text-left min-w-0">
                          <div className="leading-tight font-medium">{item.label}</div>
                          {(isHovered || isActive) && item.description && (
                            <div className={cn(
                              "text-[9px] mt-0.5 transition-all duration-200 truncate",
                              isActive ? "text-primary/70" : "text-muted-foreground"
                            )}>
                              {item.description}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.shortcut && isHovered && !isActive && (
                            <span className="text-[9px] text-muted-foreground/60 font-mono bg-muted/50 px-1 py-0.5 rounded">
                              {item.shortcut}
                            </span>
                          )}
                          {item.badge ? (
                            <Badge
                              variant="secondary"
                              className={cn(
                                "h-5 px-1.5 text-[9px] font-bold rounded-md shadow-sm",
                                isActive 
                                  ? "bg-primary/30 text-primary border border-primary/30" 
                                  : badgeStyles[item.badgeVariant || "default"]
                              )}
                            >
                              {item.badge}
                            </Badge>
                          ) : null}
                          <ChevronRight 
                            className={cn(
                              "w-3.5 h-3.5 shrink-0 transition-all duration-200",
                              isActive 
                                ? "text-primary opacity-100 translate-x-0" 
                                : "opacity-0 -translate-x-2 group-hover:opacity-60 group-hover:translate-x-0"
                            )} 
                          />
                        </div>
                      </>
                    )}
                    {/* Active indicator line */}
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full shadow-lg shadow-primary/30" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <footer className="px-2 py-3 border-t border-border/50 bg-gradient-to-t from-muted/40 via-muted/20 to-transparent space-y-1.5 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => handleNavigate("settings")}
          className={cn(
            "group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200",
            isCollapsed && "justify-center px-2",
            activeView === "settings"
              ? "bg-gradient-to-r from-primary/25 via-primary/15 to-primary/5 text-primary ring-1 ring-primary/25 shadow-md shadow-primary/10"
              : "text-sidebar-foreground hover:bg-gradient-to-r hover:from-sidebar-accent/90 hover:to-sidebar-accent/60 hover:shadow-sm"
          )}
          aria-current={activeView === "settings" ? "page" : undefined}
          title={isCollapsed ? "Settings" : undefined}
        >
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg border transition-all duration-200",
              activeView === "settings"
                ? "border-primary/30 bg-primary/20 text-primary shadow-sm"
                : "border-border/70 bg-background/80 text-muted-foreground group-hover:text-inherit group-hover:border-border group-hover:bg-sidebar-accent",
            )}
          >
            <Settings className="w-4 h-4" />
          </div>
          {!isCollapsed && (
            <>
              <div className="flex-1 text-left leading-tight min-w-0">
                <div className="text-sm font-medium">Settings</div>
                <div
                  className={cn(
                    "mt-0.5 text-[10px] truncate",
                    activeView === "settings" ? "text-primary/80" : "text-muted-foreground",
                  )}
                >
                  Theme, onboarding, workspace
                </div>
              </div>
              <ChevronRight
                className={cn(
                  "w-3.5 h-3.5 shrink-0 transition-all duration-200",
                  activeView === "settings" 
                    ? "text-primary opacity-100" 
                    : "text-muted-foreground opacity-0 group-hover:opacity-60",
                )}
              />
            </>
          )}
        </button>

        <Link
          href="/auth"
          className={cn(
            "group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 text-sidebar-foreground hover:bg-gradient-to-r hover:from-sidebar-accent/90 hover:to-sidebar-accent/60 hover:shadow-sm",
            isCollapsed && "justify-center px-2"
          )}
          title={isCollapsed ? "Auth Center" : undefined}
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background/80 text-muted-foreground group-hover:text-inherit group-hover:border-border transition-all">
            <ShieldAlert className="w-4 h-4" />
          </div>
          {!isCollapsed && (
            <>
              <div className="flex-1 text-left leading-tight min-w-0">
                <div className="text-sm font-medium">Auth Center</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground truncate">Service authentication</div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-60 transition-all -translate-x-2 group-hover:translate-x-0" />
            </>
          )}
        </Link>

        <Link
          href="/login?redirect=/auth"
          className={cn(
            "group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 text-sidebar-foreground hover:bg-gradient-to-r hover:from-sidebar-accent/90 hover:to-sidebar-accent/60 hover:shadow-sm",
            isCollapsed && "justify-center px-2"
          )}
          title={isCollapsed ? "Login" : undefined}
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background/80 text-muted-foreground group-hover:text-inherit group-hover:border-border transition-all">
            <LogIn className="w-4 h-4" />
          </div>
          {!isCollapsed && (
            <>
              <div className="flex-1 text-left leading-tight min-w-0">
                <div className="text-sm font-medium">Login</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground truncate">Supabase sign-in</div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-60 transition-all -translate-x-2 group-hover:translate-x-0" />
            </>
          )}
        </Link>

        <Link
          href="/setup"
          className={cn(
            "group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 text-sidebar-foreground hover:bg-gradient-to-r hover:from-primary/15 hover:via-primary/10 hover:to-transparent hover:shadow-md hover:shadow-primary/5",
            isCollapsed && "justify-center px-2"
          )}
          title={isCollapsed ? "Setup Guide" : undefined}
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 text-primary group-hover:from-primary/30 group-hover:to-primary/15 transition-all shadow-sm shadow-primary/10">
            <Rocket className="w-4 h-4" />
          </div>
          {!isCollapsed && (
            <>
              <div className="flex-1 text-left leading-tight min-w-0">
                <div className="text-sm font-medium text-primary">Setup Guide</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground truncate">Supabase, Docker, LinkedIn</div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 shrink-0 text-primary opacity-60 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
            </>
          )}
        </Link>

        {!isCollapsed && (
          <div className="px-3 pt-3 pb-1.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-50" />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium">Online</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>{currentTime}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[9px] text-muted-foreground/80">
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-500">
                <span className="font-semibold">Claude 4.6</span>
              </div>
              <div className="h-3 w-px bg-border/50" />
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500">
                <span className="font-semibold">GPT-4o</span>
              </div>
            </div>
          </div>
        )}
      </footer>
    </aside>
  )
}
