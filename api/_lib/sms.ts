const SURESMS_ENDPOINT = 'https://apiv2.suresms.com/Script/SendSMS.aspx'

/**
 * One SMS through SureSMS. Server-only: SURESMS_API_KEY must never reach the
 * client. SURESMS_SENDER is the approved sender name (max 11 chars); without
 * it SureSMS sends from its default number.
 */
export async function sendSms(to: string, text: string): Promise<void> {
  const apiKey = process.env.SURESMS_API_KEY
  if (!apiKey) throw new Error('SMS er ikke sat op på serveren (mangler SURESMS_API_KEY).')

  const params = new URLSearchParams({ login: 'apikey', password: apiKey, to, Text: text })
  const sender = process.env.SURESMS_SENDER
  if (sender) params.set('from', sender)

  const response = await fetch(`${SURESMS_ENDPOINT}?${params}`)
  const body = await response.text().catch(() => '')
  if (!response.ok) {
    // 400 = wrong key/params, 401 = sender name not approved or country blocked.
    throw new Error(`SureSMS svarede ${response.status}: ${body.slice(0, 200)}`)
  }
}
