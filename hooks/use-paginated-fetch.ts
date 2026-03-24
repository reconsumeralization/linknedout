import { useCallback, useState } from "react"
import type { PaginatedResult, PaginationOptions } from "@/lib/supabase/supabase-data"

interface UsePaginatedFetchResult<T> {
  data: T[]
  isLoading: boolean
  hasMore: boolean
  loadMore: () => Promise<void>
  reset: () => void
}

export function usePaginatedFetch<T>(
  fetchFn: (opts: PaginationOptions) => Promise<PaginatedResult<T>>,
  pageSize = 50,
): UsePaginatedFetchResult<T> {
  const [data, setData] = useState<T[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [isLoading, setIsLoading] = useState(false)

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return
    setIsLoading(true)
    try {
      const result = await fetchFn({ pageSize, cursor })
      setData((prev) => [...prev, ...result.data])
      setCursor(result.nextCursor)
      setHasMore(result.hasMore)
    } finally {
      setIsLoading(false)
    }
  }, [fetchFn, pageSize, cursor, isLoading, hasMore])

  const reset = useCallback(() => {
    setData([])
    setCursor(null)
    setHasMore(true)
    setIsLoading(false)
  }, [])

  return { data, isLoading, hasMore, loadMore, reset }
}
