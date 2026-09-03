import { useEffect, useRef, useState } from 'react'
import { fetchSiteSetting } from '@/lib/api/siteSettings'

/**
 * Loads a `site_settings` value (falling back to local defaults before
 * Supabase is connected, or while the row hasn't loaded yet). `fallback`
 * is read once via ref so callers can pass an inline literal without
 * re-triggering the fetch every render.
 */
export function useSiteSetting<T>(key: string, fallback: T) {
  const fallbackRef = useRef(fallback)
  const [value, setValue] = useState<T>(fallback)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    fetchSiteSetting(key, fallbackRef.current)
      .then((result) => {
        if (!cancelled) setValue(result)
      })
      .catch(() => {
        if (!cancelled) setValue(fallbackRef.current)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [key])

  return { value, isLoading }
}
