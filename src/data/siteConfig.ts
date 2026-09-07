import type { VenueLocation } from '@/types'

export const CONFIRMAND_NAME = 'Victor'

/** Midnight local time on the confirmation date. */
export const CONFIRMATION_DATE = new Date(2027, 4, 1)

/**
 * The main navigation.
 *
 * Every entry but one scrolls to a section of the front page. Minigolf is the
 * exception: it is a route of its own, so it carries `to` instead of an `id`
 * and <Navigation> routes rather than scrolls. It sits between Vejret and
 * Billeder because that is where it belongs in the running order of the
 * evening, even though there is no matching section on the page.
 */
export const NAV_SECTIONS: Array<{ id: string; label: string; to?: string }> = [
  { id: 'forside', label: 'Forside' },
  { id: 'dagen', label: 'Dagen' },
  { id: 'tilmelding', label: 'Tilmelding' },
  { id: 'oenskeliste', label: 'Ønskeliste' },
  { id: 'praktisk-info', label: 'Praktisk' },
  { id: 'vejret', label: 'Vejret' },
  { id: 'minigolf', label: 'Minigolf', to: '/minigolf' },
  { id: 'billeder', label: 'Billeder' },
]

/** Victor's own profiles, linked from the footer. */
export const SOCIAL_LINKS: Array<{ icon: 'instagram' | 'tiktok'; label: string; href: string }> = [
  { icon: 'instagram', label: 'Instagram', href: 'https://www.instagram.com/vicneergaard' },
  {
    icon: 'tiktok',
    label: 'TikTok',
    // The share link Victor supplied carries _r/_t tracking parameters; the
    // bare profile URL resolves to the same place without them.
    href: 'https://www.tiktok.com/@vicigolfing.dk',
  },
]

// City-level coordinates for Randers NV (party address) — precise enough
// for the "Vejret" section's forecast lookup. Drives that section only;
// edit from /admin (site_settings → venue_location) if a more exact fix is
// wanted later.
export const DEFAULT_VENUE_LOCATION: VenueLocation = {
  lat: 56.47,
  lon: 10.02,
  label: 'Randers NV',
}

// PLACEHOLDER: fill in once known, or manage from /admin.
export const CONTACT_EMAIL = 'PLACEHOLDER@eksempel.dk'
