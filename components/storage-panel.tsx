"use client"

import { BrandedPanelHeader } from "@/components/branded-panel-header"
import { Button } from "@/components/ui/button"
import { getSupabaseClient } from "@/lib/supabase/supabase"
import { HardDrive, Loader2, Trash2, Upload } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

const BUCKET = "linkedout-assets"

type FileItem = { name: string; id?: string; updated_at?: string; metadata?: Record<string, unknown> }

export function StoragePanel() {
  const supabase = useMemo(() => getSupabaseClient(), [])
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const loadFiles = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.")
      setLoading(false)
      return
    }
    setError(null)
    setLoading(true)
    try {
      const { data, error: listError } = await supabase.storage.from(BUCKET).list("", { limit: 200 })
      if (listError) {
        if (listError.message?.includes("Bucket not found") || listError.message?.includes("does not exist")) {
          setError("Storage bucket not set up. Run the migration: supabase/migrations/20260305200000_storage_linkedout_assets.sql")
        } else {
          setError(listError.message)
        }
        setFiles([])
      } else {
        const items = (data ?? []).filter((o) => o.name) as FileItem[]
        setFiles(items.map((o) => ({ name: o.name, id: o.id, updated_at: o.updated_at, metadata: o.metadata })))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to list files")
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    void loadFiles()
  }, [loadFiles])

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !supabase) return
      setUploading(true)
      setError(null)
      try {
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(file.name, file, { upsert: true })
        if (uploadError) setError(uploadError.message)
        else await loadFiles()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed")
      } finally {
        setUploading(false)
        e.target.value = ""
      }
    },
    [loadFiles, supabase]
  )

  const handleRemove = useCallback(
    async (name: string) => {
      if (!supabase) return
      setError(null)
      try {
        const { error: removeError } = await supabase.storage.from(BUCKET).remove([name])
        if (removeError) setError(removeError.message)
        else await loadFiles()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed")
      }
    },
    [loadFiles, supabase]
  )

  const noBucket = !!error && (error.includes("Bucket not found") || error.includes("not set up"))

  return (
    <div className="flex flex-col h-full min-h-0">
      <BrandedPanelHeader
        compact
        title="Files & assets"
        description="Supabase Storage — campaign assets, avatars, uploads"
        icon={HardDrive}
        right={
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf,.txt,.csv,.json"
              onChange={handleUpload}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!supabase || uploading || noBucket}
              onClick={() => inputRef.current?.click()}
              className="gap-1.5"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload
            </Button>
          </div>
        }
      />
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            {error}
          </div>
        )}
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading files…</span>
          </div>
        ) : files.length === 0 && !noBucket ? (
          <p className="text-sm text-muted-foreground">No files yet. Upload images, PDFs, or text to get started.</p>
        ) : (
          <ul className="space-y-2">
            {files.map((f) => (
              <li
                key={f.name}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/80 bg-card px-3 py-2"
              >
                <span className="truncate text-sm font-medium text-foreground">{f.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={!supabase}
                  onClick={() => void handleRemove(f.name)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
