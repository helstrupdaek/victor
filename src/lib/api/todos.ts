import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient'
import type { AdminTodo } from '@/types'

/**
 * The hosts' shared to-do list. Admin-only: admin_todos has RLS on with no anon
 * policies, so every call here needs a signed-in session (enforced by the
 * database, not by this file). In demo mode, with no Supabase configured, the
 * list is simply empty and writes are no-ops, like the other admin APIs.
 */

export async function fetchTodos(): Promise<AdminTodo[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase
    .from('admin_todos')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function addTodo(title: string, createdBy: string | null): Promise<AdminTodo | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('admin_todos')
    .insert({ title, created_by: createdBy })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function setTodoDone(id: string, done: boolean, doneBy: string | null): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  const { error } = await supabase
    .from('admin_todos')
    .update(
      done
        ? { done: true, done_at: new Date().toISOString(), done_by: doneBy }
        // Un-ticking clears who did it, so the row does not keep claiming a
        // completion that was taken back.
        : { done: false, done_at: null, done_by: null },
    )
    .eq('id', id)
  if (error) throw error
}

export async function deleteTodo(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  const { error } = await supabase.from('admin_todos').delete().eq('id', id)
  if (error) throw error
}
