export interface Guest {
  id: string
  created_at: string
  updated_at: string
  name: string
  email: string
  attending: boolean
  adults_count: number
  children_count: number
  attendee_names: string[]
  allergies: string | null
  comment: string | null
}

export type GuestSubmission = Omit<Guest, 'id' | 'created_at' | 'updated_at'>

export interface WishlistItem {
  id: string
  created_at: string
  title: string
  description: string | null
  image_url: string | null
  external_url: string | null
  price: number | null
  category: string | null
  sort_order: number
  is_reserved: boolean
}

export interface GiftReservation {
  id: string
  created_at: string
  wishlist_item_id: string
  reserved_by_name: string
  /** Optional — lets a reservation be associated with an RSVP by email. */
  guest_email: string | null
  reservation_token: string
}

export interface Photo {
  id: string
  created_at: string
  storage_path: string
  caption: string | null
  width: number | null
  height: number | null
  sort_order: number
  is_published: boolean
  url: string
}

export interface TimelineEvent {
  id: string
  label: string
  time: string
  description: string
}

export type PracticalInfoIcon =
  | 'map-pin'
  | 'car'
  | 'shirt'
  | 'tent'
  | 'phone'
  | 'bed'
  | 'info'

export interface PracticalInfoCard {
  id: string
  title: string
  body: string
  icon: PracticalInfoIcon
}

export interface VenueLocation {
  lat: number
  lon: number
  label: string
}

export interface WeatherClothingTip {
  condition: string
  tip: string
}

export interface WeatherSnapshot {
  kind: 'forecast' | 'seasonal-outlook'
  temperatureC: number
  windKph: number
  precipitationProbability: number | null
  conditionLabel: string
  clothingTip: string
  asOf: string
  source: string
}

/**
 * The single source of truth for the event's core facts. Stored in
 * `site_settings` (key: "event_info") so it's editable from /admin;
 * `src/data/eventInfo.ts` holds the fallback used before Supabase is
 * connected or while the row is loading. Server-side code (the `/api`
 * routes that build emails/ICS files) reads the same row directly via the
 * service-role client, so admin edits apply everywhere without a
 * redeploy.
 */
export interface EventInfo {
  eventDate: string // ISO date, e.g. "2027-05-01"
  churchName: string
  churchCity: string
  /** Not yet known for most confirmations — left null rather than guessed. */
  churchAddress: string | null
  /** 24h "HH:MM", or null until the church confirms a time. */
  churchStartTime: string | null
  /** 24h "HH:MM". If a start time is set but this isn't, the .ics defaults to a 1-hour block. */
  churchEndTime: string | null
  partyAddressLine1: string
  partyPostalCode: string
  partyCity: string
  rsvpDeadline: string // ISO date
  hosts: string
  invitationBody: string
}

export interface ReservedGiftsSummary {
  titles: string[]
}
