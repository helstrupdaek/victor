import { DEFAULT_EVENT_INFO } from '@/data/eventInfo'
import type { EventInfo, PracticalInfoCard } from '@/types'

/**
 * Fallback shown before Supabase is connected, or while `site_settings`
 * ("practical_info" key) is still loading. The address/church cards are
 * derived from `EventInfo` so they never drift out of sync with it;
 * parking, dress code, contact and accommodation are still placeholders —
 * replace them (or edit from /admin) once the real details are known.
 */
export function buildDefaultPracticalInfo(event: EventInfo): PracticalInfoCard[] {
  return [
    {
      id: 'adresse',
      title: 'Adresse',
      body: `${event.partyAddressLine1}\n${event.partyPostalCode} ${event.partyCity}`,
      icon: 'map-pin',
    },
    {
      id: 'parkering',
      title: 'Parkering',
      body: 'PLACEHOLDER: Der er parkering på og omkring vejen.',
      icon: 'car',
    },
    {
      id: 'paaklaedning',
      title: 'Påklædning',
      body: 'PLACEHOLDER: Pænt tøj / festtøj.',
      icon: 'shirt',
    },
    {
      id: 'lokation',
      title: 'Festen foregår i haven',
      body: `Efter kirken fortsætter vi festen i haven på ${event.partyAddressLine1}, ${event.partyCity}.`,
      icon: 'tent',
    },
    {
      id: 'kontakt',
      title: 'Kontakt',
      body: 'PLACEHOLDER: Navn, telefon eller email.',
      icon: 'phone',
    },
    {
      id: 'overnatning',
      title: 'Overnatningsmuligheder',
      body: 'PLACEHOLDER: Nærmeste hotel/B&B, hvis relevant.',
      icon: 'bed',
    },
  ]
}

export const DEFAULT_PRACTICAL_INFO: PracticalInfoCard[] =
  buildDefaultPracticalInfo(DEFAULT_EVENT_INFO)
