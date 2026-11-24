import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient'
import type { Invitation } from '@/types'

/** Admin-only (RLS), except fetchInvitationByToken, which goes through the anon RPC. */

export async function fetchInvitations(): Promise<Invitation[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function addInvitation(row: { name: string; email: string | null; phone: string | null }) {
  if (!isSupabaseConfigured || !supabase) return
  const { error } = await supabase.from('invitations').insert(row)
  if (error) throw error
}

export async function deleteInvitation(id: string) {
  if (!isSupabaseConfigured || !supabase) return
  const { error } = await supabase.from('invitations').delete().eq('id', id)
  if (error) throw error
}

export type Channel = 'email' | 'sms'
/** 'sent', 'skipped', or the error text. */
export type SendResult = Record<Channel, string>

export async function sendInvitation(
  id: string,
  channels: Channel[],
  message: string,
  resend = false,
): Promise<SendResult> {
  if (!supabase) throw new Error('Supabase er ikke konfigureret.')
  const { data } = await supabase.auth.getSession()
  const response = await fetch('/api/invitations/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ id, channels, message, resend }),
  })
  const body = (await response.json().catch(() => ({}))) as { result?: SendResult; error?: string }
  if (!response.ok || !body.result) throw new Error(body.error ?? `Fejl ${response.status}`)
  return body.result
}

export async function fetchInvitationByToken(
  token: string,
): Promise<{ name: string; email: string | null } | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase.rpc('get_invitation', { p_token: token })
  if (error) throw error
  return (data as Array<{ name: string; email: string | null }>)[0] ?? null
}
