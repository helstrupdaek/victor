import type { VenueLocation } from '@/types'

export const CONFIRMAND_NAME = 'Victor'

/** Midnight local time on the confirmation date. */
export const CONFIRMATION_DATE = new Date(2027, 4, 1)

export const NAV_SECTIONS: Array<{ id: string; label: string }> = [
  { id: 'forside', label: 'Forside' },
  { id: 'dagen', label: 'Dagen' },
  { id: 'tilmelding', label: 'Tilmelding' },
  { id: 'oenskeliste', label: 'Ønskeliste' },
  { id: 'praktisk-info', label: 'Praktisk' },
  { id: 'vejret', label: 'Vejret' },
  { id: 'billeder', label: 'Billeder' },
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
