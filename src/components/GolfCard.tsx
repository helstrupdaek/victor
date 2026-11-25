import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'

/**
 * The pop-up card that unfolds out of the invitation envelope: a little golf
 * course in paper layers (far hills, trees, Victor, the fairway) that stand up
 * one after another, then a buggy drives the cart path, Victor's ball arcs into
 * the hole, and the wind moves clouds, trees, grass and the flag.
 *
 * All layers share one 360×230 viewBox so they line up at any width. Wind and
 * the pop-up are CSS (the global reduced-motion rule stills them); the buggy
 * and ball follow curved paths with SVG animateMotion, which CSS can't stop,
 * so those are left out entirely when the viewer prefers reduced motion.
 */

const VIEWBOX = '0 0 360 230'
const CART_PATH = 'M-40 214 C 60 196, 140 207, 220 199 S 330 190, 410 197'
const BALL_PATH = 'M122 186 Q 210 70 300 171'

function usePrefersReducedMotion(): boolean {
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  return reduced
}

/** One paper layer of the pop-up: lies flat, then stands up from its bottom edge. */
function PopLayer({ shown, index, children }: { shown: boolean; index: number; children: ReactNode }) {
  return (
    <div
      className="absolute inset-0"
      style={{
        transformOrigin: '50% 100%',
        transform: shown ? 'rotateX(0deg)' : 'rotateX(88deg)',
        transition: `transform 750ms cubic-bezier(0.2, 0.8, 0.25, 1.15) ${350 + index * 160}ms`,
      }}
    >
      {children}
    </div>
  )
}

function Tree({ x, y, s, dark, delay }: { x: number; y: number; s: number; dark?: boolean; delay: number }) {
  return (
    <g className="gc-sway" style={{ animationDelay: `${delay}s` } as CSSProperties}>
      <rect x={x - 1.6 * s} y={y - 12 * s} width={3.2 * s} height={12 * s} fill="#6b5a3e" />
      <circle cx={x} cy={y - 18 * s} r={9 * s} fill={dark ? '#4b6244' : '#64795a'} />
      <circle cx={x - 5 * s} cy={y - 13 * s} r={6 * s} fill={dark ? '#3f5539' : '#57704d'} />
      <circle cx={x + 5 * s} cy={y - 14 * s} r={6.5 * s} fill={dark ? '#567050' : '#7c9473'} />
    </g>
  )
}

function Buggy() {
  return (
    <g>
      <line x1={-11} y1={-14} x2={-12} y2={-25} stroke="#55503f" strokeWidth={1.2} />
      <line x1={8} y1={-14} x2={9} y2={-25} stroke="#55503f" strokeWidth={1.2} />
      <rect x={-16} y={-27} width={28} height={3.5} rx={1.5} fill="#fdfcf9" stroke="#e6ddc6" strokeWidth={0.6} />
      <path d="M-17 -4 L-14 -13 L8 -13 L17 -8 L17 -4 Z" fill="#e2bd57" />
      <rect x={-12} y={-17} width={8} height={4} rx={1} fill="#f8f5ee" />
      <circle cx={-10} cy={-3} r={3.6} fill="#211f1a" />
      <circle cx={-10} cy={-3} r={1.4} fill="#86806c" />
      <circle cx={11} cy={-3} r={3.6} fill="#211f1a" />
      <circle cx={11} cy={-3} r={1.4} fill="#86806c" />
    </g>
  )
}

export function GolfCard({
  name,
  dateLabel,
  visible,
  flying,
}: {
  name: string | null
  dateLabel: string
  visible: boolean
  flying: boolean
}) {
  const reduced = usePrefersReducedMotion()
  // Mount flat, then stand up on the next frame so the transitions run.
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!visible) return
    const frame = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(frame)
  }, [visible])

  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center px-4"
      style={{ perspective: '1400px' }}
      aria-hidden={!visible}
    >
      <div
        className="w-[min(92vw,420px)] overflow-hidden rounded-xl bg-cream-50 shadow-soft"
        style={{
          transformOrigin: '50% 100%',
          opacity: shown ? 1 : 0,
          transform: flying
            ? 'translateY(-130vh) rotate(-10deg) scale(0.9)'
            : shown
              ? 'none'
              : 'translateY(18vh) rotateX(70deg) scale(0.85)',
          transition: flying
            ? 'transform 850ms cubic-bezier(0.55, 0, 0.75, 0)'
            : 'transform 800ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 400ms ease',
        }}
      >
        {/* The scene */}
        <div className="relative aspect-[360/230] w-full" style={{ perspective: '900px' }}>
          {/* Sky, sun and drifting clouds: the card's flat back */}
          <svg viewBox={VIEWBOX} className="absolute inset-0 h-full w-full">
            <defs>
              <linearGradient id="gc-sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#dfe9ee" />
                <stop offset="1" stopColor="#fdfcf9" />
              </linearGradient>
            </defs>
            <rect width="360" height="230" fill="url(#gc-sky)" />
            <circle cx="296" cy="42" r="17" fill="#cdaf76" opacity="0.55" />
            {[
              { y: 30, s: 1, d: -4 },
              { y: 58, s: 0.7, d: -17 },
              { y: 22, s: 0.55, d: -26 },
            ].map((c, i) => (
              <g key={i} className="gc-cloud" style={{ animationDelay: `${c.d}s` } as CSSProperties}>
                <g transform={`translate(0 ${c.y}) scale(${c.s})`}>
                  <ellipse cx="0" cy="0" rx="22" ry="8" fill="#ffffff" opacity="0.95" />
                  <ellipse cx="-10" cy="-5" rx="11" ry="8" fill="#ffffff" opacity="0.95" />
                  <ellipse cx="8" cy="-7" rx="13" ry="10" fill="#ffffff" opacity="0.95" />
                </g>
              </g>
            ))}
          </svg>

          <PopLayer shown={shown} index={0}>
            <svg viewBox={VIEWBOX} className="absolute inset-0 h-full w-full">
              <path
                d="M0 150 C 40 98, 80 92, 122 122 C 152 82, 200 62, 242 112 C 272 92, 322 86, 360 118 L360 230 L0 230 Z"
                fill="#c3d3b1"
              />
              <path d="M200 70 L214 84 L206 82 L198 90 L190 83 Z" fill="#fdfcf9" opacity="0.8" />
              <path
                d="M0 172 C 60 132, 120 142, 180 162 C 230 132, 300 127, 360 152 L360 230 L0 230 Z"
                fill="#a3bb8f"
              />
            </svg>
          </PopLayer>

          <PopLayer shown={shown} index={1}>
            <svg viewBox={VIEWBOX} className="absolute inset-0 h-full w-full">
              <Tree x={30} y={176} s={1.1} delay={0} />
              <Tree x={58} y={170} s={0.85} dark delay={0.6} />
              <Tree x={236} y={166} s={0.8} delay={0.3} />
              <Tree x={262} y={164} s={1} dark delay={1.1} />
              <Tree x={336} y={168} s={1.15} delay={0.8} />
            </svg>
          </PopLayer>

          <PopLayer shown={shown} index={2}>
            <img
              src="/images/victor-cutout.webp"
              alt=""
              className="gc-bob absolute bottom-[16%] left-[13%] h-[62%] w-auto"
              style={{ aspectRatio: '807 / 1100', objectFit: 'cover', objectPosition: 'top' }}
            />
          </PopLayer>

          <PopLayer shown={shown} index={3}>
            <svg viewBox={VIEWBOX} className="absolute inset-0 h-full w-full">
              <path
                d="M0 186 C 70 166, 150 178, 205 170 C 262 161, 322 152, 360 160 L360 230 L0 230 Z"
                fill="#7c9473"
              />
              <path d="M0 204 C 90 186, 190 196, 360 178 L360 230 L0 230 Z" fill="#6f8966" />
              <ellipse cx="292" cy="171" rx="40" ry="10" fill="#b3c69f" />
              <ellipse cx="300" cy="171.5" rx="4" ry="1.6" fill="#211f1a" />
              <line x1="300" y1="171" x2="300" y2="127" stroke="#fdfcf9" strokeWidth="1.4" />
              <path className="gc-flag" d="M300.5 127 L324 132.5 L300.5 139 Z" fill="#c4553c" />
              <path d={CART_PATH} stroke="#e6ddc6" strokeWidth="7" fill="none" strokeLinecap="round" />

              {reduced ? (
                <g transform="translate(150 203) rotate(-3)">
                  <Buggy />
                </g>
              ) : (
                <>
                  <g>
                    <Buggy />
                    <animateMotion dur="10s" begin="1.8s" repeatCount="indefinite" rotate="auto" path={CART_PATH} />
                  </g>
                  <circle r="3.4" fill="#ffffff" stroke="#86806c" strokeWidth="0.5" cx="0" cy="0">
                    <animateMotion
                      dur="4.5s"
                      begin="2.4s"
                      repeatCount="indefinite"
                      path={BALL_PATH}
                      keyPoints="0;0;1;1"
                      keyTimes="0;0.2;0.72;1"
                      calcMode="linear"
                    />
                  </circle>
                </>
              )}

              {[18, 44, 96, 170, 214, 318, 342].map((x, i) => (
                <path
                  key={x}
                  className="gc-sway"
                  style={{ animationDelay: `${i * 0.37}s` } as CSSProperties}
                  d={`M${x} 230 q 1.5 -9 3.5 -11 M${x + 3} 230 q 1 -7 -1 -10 M${x + 6} 230 q 0 -6 3 -8`}
                  stroke="#4b6244"
                  strokeWidth="1.3"
                  fill="none"
                  strokeLinecap="round"
                />
              ))}
            </svg>
          </PopLayer>
        </div>

        {/* The words */}
        <div className="px-6 pt-5 pb-6 text-center">
          <p className="font-hand text-3xl text-green-700">Kære {name ?? 'gæst'}</p>
          <p className="mt-1 font-display text-xl leading-snug text-ink-900">Du er inviteret til Victors konfirmation</p>
          <p className="mt-1 text-sm text-ink-600">{dateLabel}</p>
        </div>
      </div>
    </div>
  )
}
