import { lazy, Suspense, useState } from 'react'
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
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-6 font-display text-2xl text-ink-900">Minigolf</h1>
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
    </div>
  )
}
