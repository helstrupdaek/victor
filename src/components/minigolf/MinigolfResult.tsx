import { useEffect, useRef, useState } from 'react'
import {
  fetchMinigolfLeaderboard,
  getStoredMinigolfEmail,
  storeMinigolfEmail,
  submitMinigolfScore,
  type MinigolfLeaderboardEntry,
} from '@/lib/api/minigolf'

/**
 * The panel that appears when the ball drops into the cup: the result, a place
 * to identify yourself, and the leaderboard.
 *
 * IDENTITY IS THE GUEST'S EMAIL, not a free-text name, and that is deliberate.
 * api/minigolf/submit-score.ts looks the address up in the `guests` table and
 * rejects anything that is not on it, and the leaderboard's `display_name`
 * comes from that guest record. A free-text name box would bypass the guest
 * check and let anyone post under any name — including someone else's. So the
 * player types their email and their real name appears on the board.
 */
export function MinigolfResult({
  shots,
  seconds,
  onPlayAgain,
}: {
  shots: number
  seconds: number
  onPlayAgain: () => void
}) {
  const [email, setEmail] = useState(() => getStoredMinigolfEmail() ?? '')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<MinigolfLeaderboardEntry[] | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) {
      setError('Skriv din e-mail, så vi ved hvem du er.')
      return
    }
    setStatus('sending')
    setError(null)
    try {
      const result = await submitMinigolfScore(trimmed, shots, seconds)
      if (!result.ok) {
        setError(result.error ?? 'Kunne ikke gemme dit resultat.')
        setStatus('idle')
        return
      }
      storeMinigolfEmail(trimmed)
      setEntries(await fetchMinigolfLeaderboard())
      setStatus('done')
    } catch {
      setError('Kunne ikke få fat i serveren. Prøv igen.')
      setStatus('idle')
    }
  }

  const time = `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink-900/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-cream-50 p-6 shadow-xl">
        <p className="font-display text-2xl text-ink-900">I hul! 🏌️</p>
        <p className="mt-1 text-ink-600">
          {shots} {shots === 1 ? 'slag' : 'slag'} på {time}
        </p>

        {status !== 'done' ? (
          <form onSubmit={handleSubmit} className="mt-5">
            <label htmlFor="mg-email" className="block text-sm font-medium text-ink-900">
              Din e-mail
            </label>
            <p className="mt-1 text-xs text-ink-600">
              Den samme som på invitationen — så kommer dit navn på listen.
            </p>
            <input
              ref={inputRef}
              id="mg-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-lg border border-ink-900/15 bg-white px-3 py-2 text-ink-900 outline-none focus:border-ink-900/40"
              placeholder="navn@eksempel.dk"
            />
            {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                disabled={status === 'sending'}
                className="rounded-full bg-ink-900 px-5 py-2 text-cream-50 disabled:opacity-60"
              >
                {status === 'sending' ? 'Gemmer...' : 'Gem resultat'}
              </button>
              <button
                type="button"
                onClick={onPlayAgain}
                className="rounded-full px-5 py-2 text-ink-900 underline-offset-4 hover:underline"
              >
                Spil igen
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-5">
            <p className="text-sm font-medium text-ink-900">Bedste runder</p>
            <ol className="mt-2 divide-y divide-ink-900/10">
              {(entries ?? []).map((entry, i) => {
                const isYou = entry.shots === shots && Math.abs(entry.seconds - seconds) < 1.5
                return (
                  <li
                    key={`${entry.display_name}-${i}`}
                    className={`flex items-baseline gap-3 py-2 text-sm ${
                      isYou ? 'font-semibold text-ink-900' : 'text-ink-600'
                    }`}
                  >
                    <span className="w-5 tabular-nums">{i + 1}.</span>
                    <span className="flex-1 truncate">{entry.display_name}</span>
                    <span className="tabular-nums">{entry.shots} slag</span>
                    <span className="tabular-nums text-ink-600">
                      {Math.floor(entry.seconds / 60)}:
                      {String(Math.round(entry.seconds % 60)).padStart(2, '0')}
                    </span>
                  </li>
                )
              })}
              {(entries ?? []).length === 0 && (
                <li className="py-2 text-sm text-ink-600">Ingen resultater endnu.</li>
              )}
            </ol>
            <button
              type="button"
              onClick={onPlayAgain}
              className="mt-4 rounded-full bg-ink-900 px-5 py-2 text-cream-50"
            >
              Spil igen
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
