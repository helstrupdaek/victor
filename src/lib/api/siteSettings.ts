import { readDemo, writeDemo } from '@/lib/demoStore'
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient'

export async function fetchSiteSetting<T>(key: string, fallback: T): Promise<T> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle()
    if (error) throw error
    return (data?.value as T) ?? fallback
  }

  return readDemo<T>(`site_settings:${key}`, fallback)
}

/** Admin-only: requires an authenticated session (RLS). */
export async function updateSiteSetting<T>(key: string, value: T): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('site_settings')
      .upsert({ key, value, is_public: true }, { onConflict: 'key' })
    if (error) throw error
    return
  }

  writeDemo(`site_settings:${key}`, value)
}
