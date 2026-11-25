import type { EventInfo, Guest } from '@/types'

function formatDanishDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(y, m - 1, d),
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const COLORS = {
  cream: '#f8f5ee',
  ink: '#211f1a',
  inkMuted: '#55503f',
  green: '#4b6244',
  greenDark: '#2c3b26',
  border: '#e6ddc6',
}

function wrapHtml(bodyHtml: string, headerExtra = ''): string {
  return `<!doctype html>
<html lang="da">
  <body style="margin:0;padding:0;background-color:${COLORS.cream};font-family:Georgia,'Times New Roman',serif;color:${COLORS.ink};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.cream};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#fdfcf9;border-radius:16px;overflow:hidden;border:1px solid ${COLORS.border};">
            <tr>
              <td style="background-color:${COLORS.greenDark};padding:28px 32px;text-align:center;">
                <p style="margin:0;color:#f8f5ee;letter-spacing:4px;font-size:12px;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">Konfirmation</p>
                <p style="margin:6px 0 0;color:#ffffff;font-size:32px;letter-spacing:2px;">VICTOR</p>${headerExtra}
              </td>
            </tr>
            <tr>
              <td style="padding:32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${COLORS.ink};">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background-color:${COLORS.cream};text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${COLORS.inkMuted};">
                Victors konfirmation · 1. maj 2027
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function summaryRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:4px 0;color:${COLORS.inkMuted};font-size:13px;width:140px;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:4px 0;font-size:14px;font-weight:bold;vertical-align:top;">${value}</td>
  </tr>`
}

export function buildConfirmationEmail(params: {
  guest: Guest
  event: EventInfo
  reservedGiftTitles: string[]
  calendarUrl: string
}): { subject: string; html: string; text: string } {
  const { guest, event, reservedGiftTitles, calendarUrl } = params
  const dateLabel = formatDanishDate(event.eventDate)
  const giftText =
    reservedGiftTitles.length > 0
      ? `Reserverede ønsker:\n${reservedGiftTitles.map((t) => `- ${t}`).join('\n')}`
      : 'Du har endnu ikke reserveret en gave fra ønskelisten.'
  const giftHtml =
    reservedGiftTitles.length > 0
      ? `Reserverede ønsker:<br/>${reservedGiftTitles.map((t) => `- ${escapeHtml(t)}`).join('<br/>')}`
      : 'Du har endnu ikke reserveret en gave fra ønskelisten.'
  const allergiesText = guest.allergies?.trim() || 'Ingen oplyst'
  const attendeeNames = guest.attendee_names.length > 0 ? guest.attendee_names.join(', ') : '—'
  const totalGuests = guest.adults_count + guest.children_count

  if (!guest.attending) {
    const subject = 'Tak for jeres besked – Victors konfirmation'
    const text = `Hej ${guest.name}

Tak fordi I gav besked om, at I desværre ikke kan deltage i Victors konfirmation den ${dateLabel}.

Vi vil savne jer, men sætter stor pris på at I sagde til.

De bedste hilsner
${event.hosts}`
    const html = wrapHtml(`
      <p style="margin:0 0 16px;">Hej ${escapeHtml(guest.name)}</p>
      <p style="margin:0 0 16px;">Tak fordi I gav besked om, at I desværre ikke kan deltage i Victors konfirmation den ${escapeHtml(dateLabel)}.</p>
      <p style="margin:0 0 24px;">Vi vil savne jer, men sætter stor pris på at I sagde til.</p>
      <p style="margin:0;">De bedste hilsner<br/>${escapeHtml(event.hosts)}</p>
    `)
    return { subject, html, text }
  }

  const subject = 'Vi glæder os til at se jer til Victors konfirmation ❤️'

  const text = `Hej ${guest.name}

Tak for jeres tilmelding til Victors konfirmation.

Vi glæder os rigtig meget til at fejre dagen sammen med jer.

Victors konfirmation
${dateLabel}

Kirke:
${event.churchName}, ${event.churchCity}

Fest:
${event.partyAddressLine1}
${event.partyPostalCode} ${event.partyCity}

Tilmeldte:
${guest.adults_count} voksne
${guest.children_count} børn
${totalGuests} personer i alt

Deltagere:
${attendeeNames}

${giftText}

Allergier / kostbehov:
${allergiesText}

Vi sender flere praktiske informationer, når vi kommer tættere på dagen.

De bedste hilsner
${event.hosts}`

  const html = wrapHtml(`
    <p style="margin:0 0 16px;">Hej ${escapeHtml(guest.name)}</p>
    <p style="margin:0 0 16px;">Tak for jeres tilmelding til Victors konfirmation.</p>
    <p style="margin:0 0 24px;">Vi glæder os rigtig meget til at fejre dagen sammen med jer.</p>

    <p style="margin:0 0 4px;font-family:Georgia,serif;font-size:18px;color:${COLORS.greenDark};">Victors konfirmation</p>
    <p style="margin:0 0 20px;color:${COLORS.inkMuted};">${escapeHtml(dateLabel)}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      ${summaryRow('Kirke', `${escapeHtml(event.churchName)}, ${escapeHtml(event.churchCity)}`)}
      ${summaryRow('Fest', `${escapeHtml(event.partyAddressLine1)}<br/>${escapeHtml(event.partyPostalCode)} ${escapeHtml(event.partyCity)}`)}
      ${summaryRow('Tilmeldte', `${guest.adults_count} voksne, ${guest.children_count} børn<br/>${totalGuests} personer i alt`)}
      ${summaryRow('Deltagere', escapeHtml(attendeeNames))}
      ${summaryRow('Gave', giftHtml)}
      ${summaryRow('Allergier', escapeHtml(allergiesText))}
    </table>

    <div style="text-align:center;margin:28px 0;">
      <a href="${calendarUrl}" style="display:inline-block;background-color:${COLORS.ink};color:#f8f5ee;text-decoration:none;padding:12px 28px;border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">Tilføj til kalender</a>
    </div>

    <p style="margin:0 0 16px;color:${COLORS.inkMuted};font-size:13px;">Vi sender flere praktiske informationer, når vi kommer tættere på dagen.</p>
    <p style="margin:0;">De bedste hilsner<br/>${escapeHtml(event.hosts)}</p>
  `)

  return { subject, html, text }
}

/**
 * The invitation mail: Victor's photo in the green header, the hosts' message,
 * a big button, then the church photo and the key facts. Images are absolute
 * URLs on the site itself (PNG/JPG, since Outlook won't show WebP); the mail
 * still reads fine when a client blocks images.
 */
export function buildInvitationEmail(
  message: string,
  link: string,
  event: EventInfo,
): { subject: string; html: string; text: string } {
  const origin = new URL(link).origin
  const dateLabel = formatDanishDate(event.eventDate)
  const churchLine = `${event.churchName}, ${event.churchCity}${event.churchStartTime ? ` kl. ${event.churchStartTime}` : ''}`
  const partyLine = `${event.partyAddressLine1}, ${event.partyPostalCode} ${event.partyCity}`

  const header = `<img src="${origin}/images/email/victor.png" width="180" alt="Victor" style="display:block;margin:20px auto -28px;width:180px;max-width:60%;height:auto;border:0;" />`
  const button = `<p style="margin:28px 0;text-align:center;"><a href="${escapeHtml(link)}" style="display:inline-block;background:${COLORS.greenDark};color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:bold;font-size:15px;">Åbn din invitation</a></p>`
  const paragraphs = escapeHtml(message)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('')
  // The link stays clickable where the template put it, and the button below
  // gives the big obvious target.
  const linked = paragraphs.replaceAll(
    escapeHtml(link),
    `<a href="${escapeHtml(link)}" style="color:${COLORS.green};">${escapeHtml(link)}</a>`,
  )
  const church = `
    <img src="${origin}/images/email/church.jpg" width="496" alt="${escapeHtml(event.churchName)}" style="display:block;width:100%;max-width:496px;height:auto;border:0;border-radius:12px;margin:8px 0 20px;" />
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${summaryRow('Dato', escapeHtml(dateLabel))}
      ${summaryRow('Kirke', escapeHtml(churchLine))}
      ${summaryRow('Fest', escapeHtml(partyLine))}
    </table>`

  return {
    subject: 'Du er inviteret til Victors konfirmation',
    html: wrapHtml(linked + button + church, header),
    text: `${message}\n\nDato: ${dateLabel}\nKirke: ${churchLine}\nFest: ${partyLine}`,
  }
}
