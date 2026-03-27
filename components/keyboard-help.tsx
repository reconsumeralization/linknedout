"use client"

import { useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Kbd } from "@/components/ui/kbd"
import { getShortcutMap, type Shortcut } from "@/lib/shortcuts/keyboard-shortcuts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KeyboardHelpProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_ORDER: Shortcut["category"][] = ["Global", "Navigation", "Chat", "Actions"]

/** Split a combo like "Ctrl+Shift+N" into renderable key tokens. */
function comboTokens(combo: string): string[] {
  return combo.split("+").map((t) => t.trim())
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KeyboardHelp({ open, onOpenChange }: KeyboardHelpProps) {
  const grouped = useMemo(() => {
    const all = getShortcutMap()
    const map = new Map<Shortcut["category"], Shortcut[]>()
    for (const cat of CATEGORY_ORDER) map.set(cat, [])
    for (const s of all) {
      const list = map.get(s.category)
      if (list) list.push(s)
      else map.set(s.category, [s])
    }
    // Remove empty groups
    for (const [cat, items] of map) {
      if (items.length === 0) map.delete(cat)
    }
    return map
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps -- re-compute when opened

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Use these shortcuts to navigate and perform actions quickly.
          </DialogDescription>
        </DialogHeader>

        {Array.from(grouped.entries()).map(([category, shortcuts]) => (
          <div key={category} className="mb-4">
            <h3 className="text-sm font-semibold text-muted-foreground mb-2">{category}</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[55%]">Action</TableHead>
                  <TableHead>Shortcut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shortcuts.map((s) => (
                  <TableRow key={s.combo}>
                    <TableCell className="text-sm">{s.description}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1">
                        {comboTokens(s.combo).map((token, i) => (
                          <Kbd key={i}>{token}</Kbd>
                        ))}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
      </DialogContent>
    </Dialog>
  )
}
