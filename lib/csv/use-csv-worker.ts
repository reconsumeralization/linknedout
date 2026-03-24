"use client"

import { useCallback, useRef, useState } from "react"
import { parseLinkedInCsv, type ParsedProfile } from "./csv-parser"

/** Threshold below which we skip the worker and parse on the main thread. */
const MAIN_THREAD_THRESHOLD = 100_000 // 100 KB
const MAX_CSV_SIZE = 50 * 1024 * 1024 // 50 MB

interface UseCsvWorkerResult {
  parse: (csv: string) => Promise<ParsedProfile[]>
  isProcessing: boolean
}

/**
 * Hook that parses CSV data — small files on main thread, large files in a Web Worker.
 */
export function useCsvWorker(): UseCsvWorkerResult {
  const [isProcessing, setIsProcessing] = useState(false)
  const workerRef = useRef<Worker | null>(null)

  const getWorker = useCallback((): Worker | null => {
    if (typeof window === "undefined") return null
    if (!workerRef.current) {
      try {
        workerRef.current = new Worker(
          new URL("./csv-parser.worker.ts", import.meta.url),
        )
      } catch {
        return null
      }
    }
    return workerRef.current
  }, [])

  const parse = useCallback(
    (csv: string): Promise<ParsedProfile[]> => {
      if (csv.length > MAX_CSV_SIZE) {
        return Promise.reject(new Error("CSV file exceeds 50 MB limit."))
      }

      // Small files: parse on main thread (no worker overhead)
      if (csv.length < MAIN_THREAD_THRESHOLD) {
        return Promise.resolve(parseLinkedInCsv(csv))
      }

      const worker = getWorker()
      if (!worker) {
        // Fallback: parse on main thread if Worker unavailable
        return Promise.resolve(parseLinkedInCsv(csv))
      }

      setIsProcessing(true)
      const id = crypto.randomUUID()

      return new Promise<ParsedProfile[]>((resolve, reject) => {
        const handleMessage = (event: MessageEvent) => {
          const data = event.data
          if (data?.id !== id) return

          worker.removeEventListener("message", handleMessage)
          worker.removeEventListener("error", handleError)
          setIsProcessing(false)

          if (data.type === "result") {
            resolve(data.profiles)
          } else {
            reject(new Error(data.message ?? "CSV parse failed"))
          }
        }

        const handleError = (event: ErrorEvent) => {
          worker.removeEventListener("message", handleMessage)
          worker.removeEventListener("error", handleError)
          setIsProcessing(false)
          reject(new Error(event.message || "Worker error"))
        }

        worker.addEventListener("message", handleMessage)
        worker.addEventListener("error", handleError)
        worker.postMessage({ type: "parse", csv, id })
      })
    },
    [getWorker],
  )

  return { parse, isProcessing }
}
