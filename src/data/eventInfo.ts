import type { EventInfo } from '@/types'

/**
 * Fallback shown before Supabase is connected, or while `site_settings`
 * ("event_info" key) is still loading — see the `EventInfo` type for how
 * this flows through to /admin, the invitation section, the confirmation
 * email, and the .ics file. `churchStartTime` stays `null` until the
 * church confirms one; nothing here invents a time.
 */
export const DEFAULT_EVENT_INFO: EventInfo = {
  eventDate: '2027-05-01',
  churchName: 'Sct. Mortens Kirke',
  churchCity: 'Randers',
  churchAddress: null,
  churchStartTime: null,
  churchEndTime: null,
  partyAddressLine1: 'Verdisvej 9',
  partyPostalCode: '8920',
  partyCity: 'Randers NV',
  rsvpDeadline: '2026-12-01',
  hosts: 'Mark, Malene & Victor',
  invitationBody:
    'Den 1. maj 2027 er en helt særlig dag for Victor, og vi håber, at I har lyst til at fejre den sammen med os.\n\n' +
    'Victor bliver konfirmeret i Sct. Mortens Kirke i Randers, og bagefter fortsætter vi festen hjemme hos os på Verdisvej 9, hvor vi dækker op til fest i haven.\n\n' +
    'Vi glæder os til en dag med god mad, kolde drikke og de mennesker, Victor holder af.',
}
