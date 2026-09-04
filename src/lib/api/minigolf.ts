import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient'
import type { MinigolfScore } from '@/types'

const EMAIL_STORAGE_KEY = 'minigolf_email'

export function getStoredMinigolfEmail(): string | null {
  return localStorage.getItem(EMAIL_STORAGE_KEY)
}

export function storeMinigolfEmail(email: string): void {
  localStorage.setItem(EMAIL_STORAGE_KEY, email)
}

export interface MinigolfLeaderboardEntry {
  display_name: string
  shots: number
  seconds: number
  score: number
}

export async function submitMinigolfScore(
  email: string,
  shots: number,
  seconds: number,
): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch('/api/minigolf/submit-score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, shots, seconds }),
  })
  return (await response.json()) as { ok: boolean; error?: string }
}

export async function fetchMinigolfLeaderboard(): Promise<MinigolfLeaderboardEntry[]> {
  const response = await fetch('/api/minigolf/leaderboard')
  const data = (await response.json()) as { ok: boolean; entries?: MinigolfLeaderboardEntry[] }
  return data.entries ?? []
}

/** Admin-only: requires an authenticated Supabase session (enforced by RLS). */
export async function fetchAllMinigolfScores(): Promise<MinigolfScore[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('minigolf_scores')
      .select('*')
      .order('score', { ascending: true })
    if (error) throw error
    return data
  }
  return []
}

export async function updateMinigolfScore(
  id: string,
  input: { shots: number; seconds: number },
): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const score = input.shots * 10 + input.seconds
    const { error } = await supabase
      .from('minigolf_scores')
      .update({ shots: input.shots, seconds: input.seconds, score })
      .eq('id', id)
    if (error) throw error
  }
}

export async function deleteMinigolfScore(id: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('minigolf_scores').delete().eq('id', id)
    if (error) throw error
  }
}
