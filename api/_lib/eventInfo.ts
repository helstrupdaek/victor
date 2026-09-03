import { DEFAULT_EVENT_INFO } from '@/data/eventInfo'
import type { EventInfo } from '@/types'
import { getSupabaseAdmin } from './supabaseAdmin'

/** Server-side equivalent of the client's `useSiteSetting('event_info', ...)`. */
export async function getEventInfo(): Promise<EventInfo> {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'event_info')
      .maybeSingle()
    if (error) throw error
    return (data?.value as EventInfo) ?? DEFAULT_EVENT_INFO
  } catch {
    return DEFAULT_EVENT_INFO
  }
}
