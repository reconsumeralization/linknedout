/**
 * Global keyboard shortcut registry.
 *
 * Handles registration, conflict avoidance (input/textarea focus),
 * and provides a queryable map for the help modal.
 */

export interface Shortcut {
  /** Human-readable combo, e.g. "Ctrl+K" */
  combo: string
  /** Callback invoked when the combo fires */
  handler: () => void
  /** Shown in the keyboard-help modal */
  description: string
  /** Grouping label for the help modal */
  category: "Navigation" | "Chat" | "Actions" | "Global"
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const shortcuts: Map<string, Shortcut> = new Map()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise a combo string so lookups are deterministic. */
function normaliseCombo(raw: string): string {
  return raw
    .toLowerCase()
    .split("+")
    .map((s) => s.trim())
    .sort()
    .join("+")
}

/** Return true when the user is typing into an editable element. */
function isEditableTarget(e: KeyboardEvent): boolean {
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  if ((e.target as HTMLElement)?.isContentEditable) return true
  return false
}

/** Build the normalised combo string from a live KeyboardEvent. */
function comboFromEvent(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push("ctrl")
  if (e.shiftKey) parts.push("shift")
  if (e.altKey) parts.push("alt")

  const key = e.key.toLowerCase()
  // Avoid duplicating modifier-only presses
  if (!["control", "shift", "alt", "meta"].includes(key)) {
    // Map common key aliases
    const mapped = key === " " ? "space" : key === "escape" ? "escape" : key
    parts.push(mapped)
  }

  return parts.sort().join("+")
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a keyboard shortcut.
 *
 * @param combo       e.g. "Ctrl+K", "Ctrl+Shift+N", "Escape", "?"
 * @param handler     callback
 * @param description shown in the help modal
 * @param category    grouping for the help modal
 * @returns a dispose function that removes this registration
 */
export function registerShortcut(
  combo: string,
  handler: () => void,
  description: string,
  category: Shortcut["category"] = "Global",
): () => void {
  const key = normaliseCombo(combo)
  shortcuts.set(key, { combo, handler, description, category })
  return () => {
    shortcuts.delete(key)
  }
}

/** Return every registered shortcut (snapshot). */
export function getShortcutMap(): Shortcut[] {
  return Array.from(shortcuts.values())
}

/** Remove all registered shortcuts. */
export function clearShortcuts(): void {
  shortcuts.clear()
}

// ---------------------------------------------------------------------------
// Global listener
// ---------------------------------------------------------------------------

let listenerAttached = false

function handleKeyDown(e: KeyboardEvent) {
  const norm = comboFromEvent(e)
  const match = shortcuts.get(norm)
  if (!match) return

  // Special handling: allow Escape everywhere (close modals)
  const isEscape = e.key === "Escape"

  // For non-Escape shortcuts, skip when user is typing in inputs
  // Exception: Ctrl-combos should still fire even in inputs (Ctrl+K, Ctrl+Enter, etc.)
  const hasModifier = e.ctrlKey || e.metaKey
  if (!isEscape && !hasModifier && isEditableTarget(e)) return

  e.preventDefault()
  e.stopPropagation()
  match.handler()
}

/** Attach the global keydown listener (idempotent). */
export function attachShortcutListener(): void {
  if (listenerAttached) return
  if (typeof window === "undefined") return
  window.addEventListener("keydown", handleKeyDown, true)
  listenerAttached = true
}

/** Detach the global keydown listener. */
export function detachShortcutListener(): void {
  if (!listenerAttached) return
  if (typeof window === "undefined") return
  window.removeEventListener("keydown", handleKeyDown, true)
  listenerAttached = false
}
