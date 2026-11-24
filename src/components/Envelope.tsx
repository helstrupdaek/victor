import { useEffect, useState } from 'react'

/**
 * The personal-invitation intro on /i/<token>: an envelope arrives, the flap
 * opens, the letter slides up with the guest's name, and a tap sends the whole
 * thing flying off the top to reveal the site. Pure CSS transitions; the
 * global reduced-motion rule in index.css shortens them to nothing.
 */

type Phase = 'arrive' | 'open' | 'fly'

// The envelope leaves first (FLY_MS), then the green backdrop fades (FADE_MS).
const FLY_MS = 850
const FADE_MS = 450

export function Envelope({
  name,
  dateLabel,
  onDone,
}: {
  name: string | null
  dateLabel: string
  onDone: () => void
}) {
  const [phase, setPhase] = useState<Phase>('arrive')

  useEffect(() => {
    const timer = setTimeout(() => setPhase((p) => (p === 'arrive' ? 'open' : p)), 900)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      clearTimeout(timer)
      document.body.style.overflow = overflow
    }
  }, [])

  useEffect(() => {
    if (phase !== 'fly') return
    const timer = setTimeout(onDone, FLY_MS + FADE_MS)
    return () => clearTimeout(timer)
  }, [phase, onDone])

  const advance = () => setPhase((p) => (p === 'arrive' ? 'open' : 'fly'))
  const open = phase !== 'arrive'
  const flying = phase === 'fly'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPhase('fly')
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Din invitation"
      onClick={advance}
      className="fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-green-900 px-4"
      style={{
        opacity: flying ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease ${FLY_MS - 150}ms`,
      }}
    >
      <div
        className="relative mt-[30vh] aspect-[7/5] w-[min(86vw,380px)] animate-[fadeIn_700ms_ease-out]"
        style={{
          perspective: '1200px',
          transform: flying ? 'translateY(-130vh) rotate(-12deg) scale(0.9)' : 'none',
          transition: `transform ${FLY_MS}ms cubic-bezier(0.55, 0, 0.75, 0)`,
        }}
      >
        {/* Inside of the envelope */}
        <div className="absolute inset-0 rounded-md bg-[#3a4c33]" />

        {/* The letter */}
        <div
          className="absolute inset-x-[5%] top-[6%] z-[1] h-[90%] rounded-sm bg-cream-50 px-5 pt-5 text-center shadow-soft sm:px-7"
          style={{
            transform: open ? 'translateY(-72%)' : 'none',
            transition: 'transform 900ms cubic-bezier(0.2, 0.7, 0.2, 1) 450ms',
          }}
        >
          <p className="font-hand text-2xl text-green-700 sm:text-3xl">Kære {name ?? 'gæst'}</p>
          <p className="mt-2 font-display text-lg leading-snug text-ink-900 sm:text-xl">
            Du er inviteret til Victors konfirmation
          </p>
          <p className="mt-1 text-sm text-ink-600">{dateLabel}</p>
        </div>

        {/* Front pocket, with the V notch the letter rises out of */}
        <div
          className="absolute inset-0 z-[2] rounded-md bg-gradient-to-b from-green-700 to-green-600 shadow-soft"
          style={{ clipPath: 'polygon(0 0, 50% 54%, 100% 0, 100% 100%, 0 100%)' }}
        />

        {/* Flap: in front while closed, swings up and behind the letter */}
        <div
          className="absolute inset-x-0 top-0 h-[56%] bg-green-600"
          style={{
            clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
            transformOrigin: 'top',
            transform: open ? 'rotateX(180deg)' : 'none',
            zIndex: open ? 0 : 3,
            transition: 'transform 700ms ease-in-out, z-index 0s linear 350ms',
          }}
        />

        {/* Wax seal on the flap's tip */}
        <div
          className="absolute top-[56%] left-1/2 z-[4] grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gold-600 font-display text-xl text-cream-50 shadow-card"
          style={{ opacity: open ? 0 : 1, transition: 'opacity 250ms ease' }}
        >
          V
        </div>
      </div>

      <button
        type="button"
        className="mt-10 text-sm tracking-widest text-cream-100/80 uppercase"
        style={{ opacity: flying ? 0 : 1, transition: 'opacity 200ms' }}
      >
        <span className={open ? 'animate-pulse' : ''}>{open ? 'Tryk for at åbne' : 'Du har fået post'}</span>
      </button>
    </div>
  )
}
