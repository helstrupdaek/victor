import { lazy, Suspense } from 'react'

const MinigolfCanvas = lazy(() => import('@/components/minigolf/MinigolfCanvas'))

export function MinigolfPage() {
  function handleComplete(result: { shots: number; seconds: number }) {
    console.log('Hole complete:', result) // Task 9 replaces this with the real result panel
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-6 font-display text-2xl text-ink-900">Minigolf</h1>
      <Suspense fallback={<p className="text-ink-600">Indlæser banen...</p>}>
        <MinigolfCanvas onComplete={handleComplete} />
      </Suspense>
    </div>
  )
}
