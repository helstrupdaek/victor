import type { EventInfo } from '@/types'

/** Public filename used for both the email attachment and the download route. */
export const ICS_FILENAME = 'Victors-konfirmation-1-maj-2027.ics'

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n')
}

/** RFC5545 §3.1 line folding at 75 octets, continuation lines lead with a space. */
function foldLine(line: string): string {
  if (line.length <= 75) return line
  const chunks: string[] = [line.slice(0, 75)]
  let rest = line.slice(75)
  while (rest.length > 0) {
    chunks.push(' ' + rest.slice(0, 74))
    rest = rest.slice(74)
  }
  return chunks.join('\r\n')
}

function formatDateOnly(isoDate: string): string {
  return isoDate.replaceAll('-', '')
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * Floating local date-time (no Z / TZID) — every guest is expected to be in
 * the same timezone as the event, so this deliberately skips a full
 * VTIMEZONE block rather than mis-converting for a non-existent audience.
 */
function formatLocalDateTime(isoDate: string, time: string): string {
  const [hh, mm] = time.split(':')
  return `${formatDateOnly(isoDate)}T${hh.padStart(2, '0')}${mm.padStart(2, '0')}00`
}

function addHours(time: string, hours: number): string {
  const [hh, mm] = time.split(':').map(Number)
  const total = (((hh * 60 + mm + hours * 60) % 1440) + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function nowUtcStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

export function buildConfirmationIcs(params: {
  event: EventInfo
  attendeeCount: number
  reservedGiftTitles: string[]
  /** Stable per-guest UID so a resend updates the same calendar entry instead of duplicating it. */
  uid: string
}): string {
  const { event, attendeeCount, reservedGiftTitles, uid } = params

  const giftLine =
    reservedGiftTitles.length > 0
      ? `Reserveret gave: ${reservedGiftTitles.join(', ')}`
      : 'Reserveret gave: Ingen endnu'

  const description = [
    'Victors konfirmation',
    '',
    'Kirke:',
    `${event.churchName}, ${event.churchCity}`,
    '',
    'Efterfølgende fest:',
    event.partyAddressLine1,
    `${event.partyPostalCode} ${event.partyCity}`,
    '',
    `Tilmeldte: ${attendeeCount}`,
    '',
    giftLine,
    '',
    'Vi glæder os til at fejre dagen sammen med jer.',
    event.hosts,
  ].join('\n')

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Victors Konfirmation//da',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${nowUtcStamp()}`,
  ]

  if (event.churchStartTime) {
    const endTime = event.churchEndTime ?? addHours(event.churchStartTime, 1)
    lines.push(`DTSTART:${formatLocalDateTime(event.eventDate, event.churchStartTime)}`)
    lines.push(`DTEND:${formatLocalDateTime(event.eventDate, endTime)}`)
  } else {
    // No confirmed time yet — an all-day event rather than an invented time.
    // DTEND is exclusive per RFC5545, so it's the day *after*.
    lines.push(`DTSTART;VALUE=DATE:${formatDateOnly(event.eventDate)}`)
    lines.push(`DTEND;VALUE=DATE:${formatDateOnly(addDays(event.eventDate, 1))}`)
  }

  lines.push(
    `SUMMARY:${escapeIcsText('Victors konfirmation')}`,
    `LOCATION:${escapeIcsText(`${event.churchName}, ${event.churchCity}`)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  )

  return lines.map(foldLine).join('\r\n') + '\r\n'
}
