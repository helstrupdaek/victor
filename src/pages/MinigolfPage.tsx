import { ArrowLeft } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { MinigolfResult } from '@/components/minigolf/MinigolfResult'

const MinigolfCanvas = lazy(() => import('@/components/minigolf/MinigolfCanvas'))

export function MinigolfPage() {
  const [result, setResult] = useState<{ shots: number; seconds: number } | null>(null)
  // Bumping this remounts the canvas, which is the whole reset: a fresh ball at
  // the tee, shot count back to zero and the camera re-seated behind it. Every
  // piece of round state already lives inside <MinigolfCanvas>, so there is
  // nothing else to unwind.
  const [round, setRound] = useState(0)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      {/*
        A way back that is not the browser's Back button.

        Guests reach this from the invitation, most of them on a phone, and a
        full-bleed 3D canvas gives no clue that the rest of the site is still
        there. A <Link> rather than a button so it is a real, shareable
        navigation the browser understands.
      */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <Link
          to="/"
          // 44px of touch target, per the phone-first gate — the text alone
          // would be a 20px tap target on a small screen.
          className="-ml-2 flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-medium text-ink-600 transition-colors hover:text-ink-900"
        >
          <ArrowLeft size={17} aria-hidden />
          Tilbage til invitationen
        </Link>
        <h1 className="font-display text-xl text-ink-900 sm:text-2xl">Minigolf</h1>
      </div>
      <div className="relative">
        <Suspense fallback={<p className="text-ink-600">Indlæser banen...</p>}>
          <MinigolfCanvas key={round} onComplete={setResult} />
        </Suspense>
        {result && (
          <MinigolfResult
            shots={result.shots}
            seconds={result.seconds}
            onPlayAgain={() => {
              setResult(null)
              setRound((n) => n + 1)
            }}
          />
        )}
      </div>
      <p className="mt-4 text-center text-sm text-ink-600">
        Victors have er blevet til en minigolfbane. Pas på Victor! Rammer du ham,
        sparker han bolden ud af haven.
      </p>
    </div>
  )
}
