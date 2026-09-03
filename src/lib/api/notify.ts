/**
 * Triggers the server-side confirmation email (see api/send-confirmation.ts).
 * Best-effort: email delivery is never allowed to block the on-site success
 * state, since the RSVP/reservation itself is already safely saved in the
 * database by the time this is called. Returns whether it actually sent,
 * so callers can show a soft "we couldn't email you" note if useful.
 */
export async function sendConfirmationEmail(email: string): Promise<boolean> {
  try {
    const response = await fetch('/api/send-confirmation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (!response.ok) return false
    const data = (await response.json()) as { ok: boolean }
    return data.ok
  } catch {
    return false
  }
}
