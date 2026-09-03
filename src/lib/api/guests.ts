import { readDemo, writeDemo } from '@/lib/demoStore'
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient'
import type { Guest, GuestSubmission } from '@/types'

const DEMO_KEY = 'guests'

export async function submitRsvp(submission: GuestSubmission): Promise<void> {
  const normalized: GuestSubmission = {
    ...submission,
    email: submission.email.trim().toLowerCase(),
    name: submission.name.trim(),
  }

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.rpc('submit_rsvp', {
      p_name: normalized.name,
      p_email: normalized.email,
      p_attending: normalized.attending,
      p_adults_count: normalized.adults_count,
      p_children_count: normalized.children_count,
      p_attendee_names: normalized.attendee_names,
      p_allergies: normalized.allergies,
      p_comment: normalized.comment,
    })
    if (error) throw error
    return
  }

  const guests = readDemo<Guest[]>(DEMO_KEY, [])
  const now = new Date().toISOString()
  const existingIndex = guests.findIndex((g) => g.email === normalized.email)
  const record: Guest = {
    id: existingIndex >= 0 ? guests[existingIndex].id : crypto.randomUUID(),
    created_at: existingIndex >= 0 ? guests[existingIndex].created_at : now,
    updated_at: now,
    ...normalized,
  }

  if (existingIndex >= 0) {
    guests[existingIndex] = record
  } else {
    guests.push(record)
  }
  writeDemo(DEMO_KEY, guests)
}

/** Admin-only: requires an authenticated Supabase session (enforced by RLS). */
export async function fetchAllGuests(): Promise<Guest[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('guests')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  }

  return readDemo<Guest[]>(DEMO_KEY, [])
}

export async function deleteGuest(id: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('guests').delete().eq('id', id)
    if (error) throw error
    return
  }

  const guests = readDemo<Guest[]>(DEMO_KEY, [])
  writeDemo(
    DEMO_KEY,
    guests.filter((g) => g.id !== id),
  )
}
