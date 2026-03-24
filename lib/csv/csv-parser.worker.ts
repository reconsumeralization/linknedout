/**
 * Web Worker for CSV parsing — offloads parseLinkedInCsv() from the main thread.
 *
 * Message protocol:
 *   Main → Worker: { type: "parse", csv: string, id: string }
 *   Worker → Main: { type: "result", id: string, profiles: ParsedProfile[] }
 *                 | { type: "error", id: string, message: string }
 */
import { parseLinkedInCsv } from "./csv-parser"

self.onmessage = (event: MessageEvent) => {
  const { type, csv, id } = event.data ?? {}
  if (type !== "parse" || typeof csv !== "string" || typeof id !== "string") {
    return
  }

  try {
    const profiles = parseLinkedInCsv(csv)
    self.postMessage({ type: "result", id, profiles })
  } catch (err) {
    const message = err instanceof Error ? err.message : "CSV parse failed"
    self.postMessage({ type: "error", id, message })
  }
}
