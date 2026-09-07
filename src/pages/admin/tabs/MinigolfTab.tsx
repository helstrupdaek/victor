import { useEffect, useState } from 'react'
import {
  deleteMinigolfScore,
  fetchAllMinigolfScores,
  updateMinigolfScore,
} from '@/lib/api/minigolf'
import type { MinigolfScore } from '@/types'

/**
 * The minigolf leaderboard, as the hosts see it.
 *
 * The public board (in the hole-out panel) shows the top 20 and nothing else.
 * This shows every row, with the things only a host needs: when it was set, the
 * email on the pre-0005 rows, and the ability to correct or remove an entry —
 * a guest typing a rude name, or a round that was obviously not played
 * honestly.
 *
 * It reads through the Supabase client rather than the /api routes on purpose.
 * minigolf_scores has RLS on with no anon policies at all, so this only returns
 * anything for a signed-in admin; the public endpoints reach it via the
 * service-role key on the server instead.
 */

/** Seconds as m:ss, matching how the public board prints a round. */
function formatTime(seconds: number): string {
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('da-DK', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function MinigolfTab() {
  const [scores, setScores] = useState<MinigolfScore[] | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [shots, setShots] = useState('')
  const [seconds, setSeconds] = useState('')
  const [error, setError] = useState<string | null>(null)

  function load() {
    fetchAllMinigolfScores()
      .then((rows) => {
        setScores(rows)
        setError(null)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Kunne ikke hente resultater.'))
  }

  useEffect(load, [])

  function startEdit(score: MinigolfScore) {
    setEditingId(score.id)
    setShots(String(score.shots))
    setSeconds(String(Math.round(score.seconds)))
  }

  async function saveEdit(id: string) {
    const s = Number(shots)
    const t = Number(seconds)
    if (!Number.isInteger(s) || s < 1 || !Number.isFinite(t) || t < 0) {
      setError('Slag skal være et helt tal, og tiden kan ikke være negativ.')
      return
    }
    try {
      await updateMinigolfScore(id, { shots: s, seconds: t })
      setEditingId(null)
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Kunne ikke gemme ændringen.')
    }
  }

  async function handleDelete(score: MinigolfScore) {
    if (!confirm(`Slet ${score.player_name}s resultat?`)) return
    try {
      await deleteMinigolfScore(score.id)
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Kunne ikke slette resultatet.')
    }
  }

  if (scores === null && !error) return <p className="text-ink-600">Henter resultater...</p>

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-ink-600">
          {scores?.length
            ? `${scores.length} ${scores.length === 1 ? 'resultat' : 'resultater'}. Bedste runde står øverst.`
            : 'Ingen har spillet endnu.'}
        </p>
        <button onClick={load} className="text-sm text-ink-600 underline hover:text-ink-900">
          Opdatér
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      <div className="space-y-2">
        {(scores ?? []).map((score, index) => (
          <div
            key={score.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-ink-900/10 px-4 py-3"
          >
            <span className="w-6 text-sm text-ink-400 tabular-nums">{index + 1}.</span>
            <span className="min-w-0 flex-1 truncate font-medium text-ink-900">
              {score.player_name}
            </span>

            {editingId === score.id ? (
              <>
                <label className="flex items-center gap-1 text-sm text-ink-600">
                  Slag
                  <input
                    type="number"
                    min={1}
                    value={shots}
                    onChange={(e) => setShots(e.target.value)}
                    className="w-16 rounded border border-ink-900/20 px-2 py-1"
                  />
                </label>
                <label className="flex items-center gap-1 text-sm text-ink-600">
                  Sek.
                  <input
                    type="number"
                    min={0}
                    value={seconds}
                    onChange={(e) => setSeconds(e.target.value)}
                    className="w-20 rounded border border-ink-900/20 px-2 py-1"
                  />
                </label>
                <button
                  onClick={() => saveEdit(score.id)}
                  className="rounded-full bg-ink-900 px-4 py-1.5 text-sm text-cream-50"
                >
                  Gem
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="text-sm text-ink-600 underline"
                >
                  Annullér
                </button>
              </>
            ) : (
              <>
                <span className="text-sm text-ink-700 tabular-nums">
                  {score.shots} slag · {formatTime(score.seconds)}
                </span>
                <span className="text-xs text-ink-400 tabular-nums">
                  score {score.score.toFixed(1)}
                </span>
                <span className="text-xs text-ink-400">{formatDate(score.created_at)}</span>
                {/* Only on rows written before the leaderboard moved to names. */}
                {score.guest_email && (
                  <span className="text-xs text-ink-400">{score.guest_email}</span>
                )}
                <button
                  onClick={() => startEdit(score)}
                  className="ml-auto text-sm text-ink-600 underline hover:text-ink-900"
                >
                  Redigér
                </button>
                <button
                  onClick={() => handleDelete(score)}
                  className="text-sm text-red-600 underline hover:text-red-700"
                >
                  Slet
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
