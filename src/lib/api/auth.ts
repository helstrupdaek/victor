import { supabase } from '@/lib/supabaseClient'

export async function signInAdmin(email: string, password: string) {
  if (!supabase) throw new Error('Supabase er ikke konfigureret.')
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signOutAdmin() {
  if (!supabase) return
  await supabase.auth.signOut()
}
