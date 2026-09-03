const RESEND_ENDPOINT = 'https://api.resend.com/emails'

interface SendEmailParams {
  to: string
  subject: string
  html: string
  text: string
  attachments?: Array<{ filename: string; content: string }> // content: base64
}

/**
 * Thin wrapper over Resend's REST API (plain fetch — no SDK dependency).
 * Server-only: RESEND_API_KEY must never reach the client.
 */
export async function sendEmail(params: SendEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM

  if (!apiKey || !from) {
    throw new Error('Email is not configured on the server (missing RESEND_API_KEY or EMAIL_FROM).')
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      attachments: params.attachments,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Resend request failed (${response.status}): ${body}`)
  }
}
