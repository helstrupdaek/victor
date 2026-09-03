import { createClient } from '@supabase/supabase-js'

/**
 * Server-only Supabase client using the service-role key — bypasses RLS
 * entirely, so it must never be imported from anything that ships to the
 * browser (nothing under `src/` should import this file). Used by the
 * `/api` routes to read/write data (guests, gift reservations, event
 * settings) regardless of the public RLS policies that rightly restrict
 * what the anon key can see.
 */
export function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Supabase is not configured on the server (missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).',
    )
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
