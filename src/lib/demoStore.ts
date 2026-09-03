/**
 * LocalStorage-backed persistence used only when Supabase isn't configured
 * (see `isSupabaseConfigured` in `supabaseClient.ts`). This keeps the site
 * genuinely interactive — RSVPs, reservations, uploads — during local
 * development or a preview deploy that hasn't been wired to a real project
 * yet, without pretending to be a real multi-user backend.
 */

const PREFIX = 'victor-konfirmation:demo:'

export function readDemo<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeDemo<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Storage full or unavailable (private browsing) — demo mode degrades
    // to in-memory-only for the remainder of the session, which is fine.
  }
}
