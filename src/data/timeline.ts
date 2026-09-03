import type { TimelineEvent } from '@/types'

/**
 * Fallback shown before Supabase is connected, or while `site_settings`
 * ("timeline" key) is still loading. Edit freely — this is the single
 * source of truth for the day's running order until it's managed from
 * /admin. Leave `time` empty for steps that don't have a fixed time yet;
 * the UI simply omits it rather than inventing one.
 */
export const DEFAULT_TIMELINE: TimelineEvent[] = [
  { id: 'kirke', label: 'Kirke', time: '', description: 'Konfirmationen finder sted i kirken.' },
  { id: 'ankomst', label: 'Ankomst', time: '', description: 'I haven — velkomstdrink og hygge.' },
  { id: 'forret', label: 'Forret', time: '', description: '' },
  { id: 'hovedret', label: 'Hovedret', time: '', description: '' },
  { id: 'dessert', label: 'Dessert', time: '', description: '' },
  { id: 'kaffe', label: 'Kaffe', time: '', description: '' },
  { id: 'fest', label: 'Fest', time: '', description: 'Musik og dans under teltet.' },
]
