import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/Button'
import { Input } from '@/components/FormControls'
import { useAdminSession } from '@/hooks/useAdminSession'
import { addTodo, deleteTodo, fetchTodos, setTodoDone } from '@/lib/api/todos'
import type { AdminTodo } from '@/types'

/**
 * The hosts' shared to-do list.
 *
 * Two people on two phones: every change goes straight to the database and
 * the list is re-read after each one, so a tick from one phone shows up on the
 * other on its next action or refresh. Nothing is batched behind a Save button
 * the way the timeline tab is — a to-do list you have to remember to save is a
 * to-do list that loses ticks.
 *
 * Who added or ticked an item is recorded from the signed-in email and shown
 * as the part before the @, so with separate logins each of you can see who
 * did what, and with a shared login it just shows the same name.
 */

/**
 * The message off whatever supabase-js rejected with. Its PostgrestError is a
 * plain object, not an Error, so `instanceof Error` misses it and String(e)
 * yields "[object Object]".
 */
function errorMessage(e: unknown, fallback = 'Noget gik galt.'): string {
  const message =
    e && typeof e === 'object' && 'message' in e && typeof e.message === 'string'
      ? e.message
      : e instanceof Error
        ? e.message
        : fallback
  // The one setup failure worth naming: the tab shipped before the migration
  // was run. Translated HERE, in the shared helper, because doing it only on
  // the initial load meant that typing an item and pressing Tilføj before the
  // table existed showed the raw Postgres text instead.
  return /admin_todos/.test(message) && /does not exist|schema cache/.test(message)
    ? 'Listen er ikke sat op endnu. Kør supabase/migrations/0006_admin_todos.sql i Supabase.'
    : message
}

/** "malene@…" -> "malene". Null when there was no session to record. */
function who(email: string | null): string | null {
  return email ? email.split('@')[0] : null
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })
}

export function TodoTab() {
  const { session } = useAdminSession()
  const me = session?.user.email ?? null

  const [todos, setTodos] = useState<AdminTodo[] | null>(null)
  const [title, setTitle] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function load() {
    fetchTodos()
      .then((rows) => {
        setTodos(rows)
        setError(null)
      })
      .catch((e: unknown) => setError(errorMessage(e, 'Kunne ikke hente listen.')))
  }

  useEffect(load, [])

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    setIsAdding(true)
    try {
      await addTodo(trimmed, me)
      setTitle('')
      load()
    } catch (e: unknown) {
      setError(errorMessage(e, 'Kunne ikke tilføje punktet.'))
    } finally {
      setIsAdding(false)
    }
  }

  async function handleToggle(todo: AdminTodo) {
    // Optimistic: the tick appears the instant it is tapped. If the write
    // fails, load() puts the truth back and the error says why.
    setTodos((current) =>
      (current ?? []).map((t) => (t.id === todo.id ? { ...t, done: !todo.done } : t)),
    )
    try {
      await setTodoDone(todo.id, !todo.done, me)
    } catch (e: unknown) {
      setError(errorMessage(e, 'Kunne ikke gemme ændringen.'))
    } finally {
      load()
    }
  }

  async function handleDelete(todo: AdminTodo) {
    if (!confirm(`Slet "${todo.title}"?`)) return
    try {
      await deleteTodo(todo.id)
      load()
    } catch (e: unknown) {
      setError(errorMessage(e, 'Kunne ikke slette punktet.'))
    }
  }

  const open = (todos ?? []).filter((t) => !t.done)
  const done = (todos ?? []).filter((t) => t.done)

  return (
    <div className="max-w-2xl">
      <form onSubmit={handleAdd} className="mb-8 flex gap-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Hvad skal der gøres?"
          aria-label="Nyt punkt"
          className="flex-1"
        />
        <Button type="submit" disabled={isAdding || !title.trim()}>
          {isAdding ? 'Tilføjer...' : 'Tilføj'}
        </Button>
      </form>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {todos === null && !error && <p className="text-ink-600">Henter listen...</p>}

      {todos !== null && todos.length === 0 && !error && (
        <p className="text-ink-600">Ingen punkter endnu. Skriv det første ovenfor.</p>
      )}

      {open.length > 0 && (
        <ul className="space-y-2">
          {open.map((todo) => (
            <TodoRow key={todo.id} todo={todo} onToggle={handleToggle} onDelete={handleDelete} />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <>
          <h3 className="mt-8 mb-2 text-xs font-semibold tracking-wide text-ink-400 uppercase">
            Færdige ({done.length})
          </h3>
          <ul className="space-y-2">
            {done.map((todo) => (
              <TodoRow key={todo.id} todo={todo} onToggle={handleToggle} onDelete={handleDelete} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function TodoRow({
  todo,
  onToggle,
  onDelete,
}: {
  todo: AdminTodo
  onToggle: (todo: AdminTodo) => void
  onDelete: (todo: AdminTodo) => void
}) {
  const by = todo.done ? who(todo.done_by) : who(todo.created_by)
  const when = todo.done && todo.done_at ? todo.done_at : todo.created_at
  return (
    <li className="flex items-center gap-3 rounded-xl border border-ink-900/10 bg-cream-50 px-4 py-3">
      {/* The whole label is the tap target, not just the 16px box. */}
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={todo.done}
          onChange={() => onToggle(todo)}
          className="h-5 w-5 shrink-0 accent-ink-900"
        />
        <span className={todo.done ? 'min-w-0 flex-1 text-ink-400 line-through' : 'min-w-0 flex-1 text-ink-900'}>
          {todo.title}
        </span>
      </label>
      <span className="shrink-0 text-xs text-ink-400">
        {by ? `${by} · ` : ''}
        {formatWhen(when)}
      </span>
      <button
        onClick={() => onDelete(todo)}
        aria-label={`Slet ${todo.title}`}
        className="shrink-0 text-sm text-ink-400 hover:text-red-700"
      >
        Slet
      </button>
    </li>
  )
}
