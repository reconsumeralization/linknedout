"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  BarChart3,
  Bot,
  FileText,
  Globe,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Network,
  Plus,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Store,
  Users,
  Wallet,
  Folder,
  HelpCircle,
  Keyboard,
} from "lucide-react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import type { ActiveView } from "@/lib/shared/app-context"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate: (view: ActiveView) => void
  onShowKeyboardHelp: () => void
}

interface CommandEntry {
  id: string
  label: string
  icon: React.ReactNode
  action: () => void
  shortcut?: string
  group: string
  keywords?: string[]
}

// ---------------------------------------------------------------------------
// Panel icon map
// ---------------------------------------------------------------------------

const PANEL_ICONS: Record<string, React.ReactNode> = {
  dashboard: <LayoutDashboard className="size-4" />,
  chat: <MessageSquare className="size-4" />,
  profiles: <Users className="size-4" />,
  tribes: <Users className="size-4" />,
  projects: <Folder className="size-4" />,
  fundraising: <Wallet className="size-4" />,
  data: <FileText className="size-4" />,
  storage: <Store className="size-4" />,
  email: <Mail className="size-4" />,
  analytics: <BarChart3 className="size-4" />,
  linkedout: <Search className="size-4" />,
  network: <Network className="size-4" />,
  agents: <Bot className="size-4" />,
  globe: <Globe className="size-4" />,
  sentinel: <Shield className="size-4" />,
  settings: <Settings className="size-4" />,
  marketplace: <ShoppingBag className="size-4" />,
}

const PANEL_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  chat: "Chat",
  profiles: "Profiles",
  tribes: "Tribes",
  projects: "Projects",
  fundraising: "Fundraising",
  data: "Data Hub",
  storage: "Storage",
  email: "Email",
  analytics: "Analytics",
  linkedout: "LinkedOut",
  network: "Network",
  agents: "Agents",
  globe: "Globe",
  sentinel: "SENTINEL",
  settings: "Settings",
  marketplace: "Marketplace",
}

const PANEL_SHORTCUTS: Record<string, string> = {
  dashboard: "Ctrl+1",
  chat: "Ctrl+2",
  profiles: "Ctrl+3",
  tribes: "Ctrl+4",
  projects: "Ctrl+5",
  analytics: "Ctrl+6",
  network: "Ctrl+7",
  email: "Ctrl+8",
  settings: "Ctrl+9",
}

// ---------------------------------------------------------------------------
// Recent searches persistence
// ---------------------------------------------------------------------------

const RECENT_KEY = "linkedout:command-palette:recent"
const MAX_RECENT = 5

function getRecentSearches(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as string[]).slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}

function addRecentSearch(id: string): void {
  if (typeof window === "undefined") return
  try {
    const prev = getRecentSearches().filter((s) => s !== id)
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...prev].slice(0, MAX_RECENT)))
  } catch {
    // ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette({ open, onOpenChange, onNavigate, onShowKeyboardHelp }: CommandPaletteProps) {
  const [recentIds, setRecentIds] = useState<string[]>([])

  useEffect(() => {
    if (open) setRecentIds(getRecentSearches())
  }, [open])

  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  // Build command entries
  const commands = useMemo<CommandEntry[]>(() => {
    const nav: CommandEntry[] = Object.keys(PANEL_LABELS).map((view) => ({
      id: `nav:${view}`,
      label: `Go to ${PANEL_LABELS[view]}`,
      icon: PANEL_ICONS[view] ?? <LayoutDashboard className="size-4" />,
      action: () => {
        onNavigate(view as ActiveView)
        addRecentSearch(`nav:${view}`)
        close()
      },
      shortcut: PANEL_SHORTCUTS[view],
      group: "Navigation",
      keywords: [view, PANEL_LABELS[view].toLowerCase()],
    }))

    const actions: CommandEntry[] = [
      {
        id: "action:new-profile",
        label: "New Profile",
        icon: <Plus className="size-4" />,
        action: () => {
          onNavigate("profiles")
          addRecentSearch("action:new-profile")
          close()
        },
        shortcut: "Ctrl+N",
        group: "Actions",
        keywords: ["create", "add", "profile", "contact"],
      },
      {
        id: "action:new-tribe",
        label: "New Tribe",
        icon: <Plus className="size-4" />,
        action: () => {
          onNavigate("tribes")
          addRecentSearch("action:new-tribe")
          close()
        },
        shortcut: "Ctrl+Shift+N",
        group: "Actions",
        keywords: ["create", "add", "tribe", "group"],
      },
      {
        id: "action:keyboard-help",
        label: "Keyboard Shortcuts",
        icon: <Keyboard className="size-4" />,
        action: () => {
          close()
          // Small delay to let the palette close before opening help
          setTimeout(onShowKeyboardHelp, 150)
        },
        shortcut: "Ctrl+/",
        group: "Actions",
        keywords: ["help", "shortcuts", "keys", "hotkeys"],
      },
    ]

    return [...nav, ...actions]
  }, [onNavigate, onShowKeyboardHelp, close])

  const commandMap = useMemo(() => new Map(commands.map((c) => [c.id, c])), [commands])

  const recentCommands = useMemo(
    () => recentIds.map((id) => commandMap.get(id)).filter(Boolean) as CommandEntry[],
    [recentIds, commandMap],
  )

  const handleSelect = useCallback(
    (value: string) => {
      const entry = commands.find((c) => c.id === value)
      entry?.action()
    },
    [commands],
  )

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command Palette" description="Search for panels, actions, and more.">
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {recentCommands.length > 0 && (
          <>
            <CommandGroup heading="Recent">
              {recentCommands.map((cmd) => (
                <CommandItem key={`recent-${cmd.id}`} value={cmd.id} onSelect={handleSelect}>
                  {cmd.icon}
                  <span>{cmd.label}</span>
                  {cmd.shortcut && <CommandShortcut>{cmd.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Navigation">
          {commands
            .filter((c) => c.group === "Navigation")
            .map((cmd) => (
              <CommandItem key={cmd.id} value={cmd.id} keywords={cmd.keywords} onSelect={handleSelect}>
                {cmd.icon}
                <span>{cmd.label}</span>
                {cmd.shortcut && <CommandShortcut>{cmd.shortcut}</CommandShortcut>}
              </CommandItem>
            ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          {commands
            .filter((c) => c.group === "Actions")
            .map((cmd) => (
              <CommandItem key={cmd.id} value={cmd.id} keywords={cmd.keywords} onSelect={handleSelect}>
                {cmd.icon}
                <span>{cmd.label}</span>
                {cmd.shortcut && <CommandShortcut>{cmd.shortcut}</CommandShortcut>}
              </CommandItem>
            ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
