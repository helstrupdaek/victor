import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import { Reveal } from '@/components/Reveal'
import { DEFAULT_EVENT_INFO } from '@/data/eventInfo'
import { useSiteSetting } from '@/hooks/useSiteSetting'
import { formatDanishDateLong, parseIsoDateLocal, scrollToSection } from '@/lib/utils'
import type { EventInfo } from '@/types'

/**
 * Very faint topographic/putting-green contour lines — a quiet nod to the
 * golf motif without becoming decoration. Kept to a handful of soft
 * curves at low opacity so it reads as texture, not illustration.
 */
function ContourLines() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full text-green-700/[0.07]"
      preserveAspectRatio="none"
      viewBox="0 0 800 900"
    >
      <path
        d="M -50 120 Q 200 60, 420 130 T 850 90"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M -50 190 Q 220 140, 440 200 T 850 160"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M -50 780 Q 250 710, 500 790 T 850 740"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M -50 840 Q 260 790, 520 850 T 850 810"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  )
}

export function Invitation() {
  const { value: event } = useSiteSetting<EventInfo>('event_info', DEFAULT_EVENT_INFO)
  const eventDate = parseIsoDateLocal(event.eventDate)
  const deadlineDate = parseIsoDateLocal(event.rsvpDeadline)

  return (
    <section id="invitation" className="relative overflow-hidden bg-cream-100">
      {/* Transition from the dark hero into the warm invitation — reads as
          one continuous piece rather than a hard section break. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-ink-900 to-cream-100"
        aria-hidden="true"
      />
      <ContourLines />

      <Container className="relative max-w-2xl py-28 text-center sm:py-36">
        <Reveal>
          <p className="text-sm font-medium tracking-[0.3em] text-green-700 uppercase">
            Du er inviteret
          </p>
          <h2 className="mt-4 font-display text-3xl text-ink-900 sm:text-4xl">
            Victors konfirmation
          </h2>
        </Reveal>

        <Reveal delayMs={80} className="mt-8 space-y-4 leading-relaxed text-ink-600">
          {event.invitationBody.split('\n\n').map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </Reveal>

        <Reveal delayMs={140} className="mt-14 border-t border-green-700/15 pt-14">
          <p className="font-display text-2xl tracking-wide text-ink-900 sm:text-3xl">
            {formatDanishDateLong(eventDate).toUpperCase()}
          </p>
          <p className="mt-5 text-ink-700">
            {event.churchName}, {event.churchCity}
          </p>
          <p className="mt-4 text-ink-700">
            Efterfølgende fest på
            <br />
            {event.partyAddressLine1}
            <br />
            {event.partyPostalCode} {event.partyCity}
          </p>
        </Reveal>

        <Reveal delayMs={200} className="mt-14">
          <p className="text-ink-700 italic">Vi glæder os til at fejre Victor sammen med jer.</p>
          <p className="mt-2 font-display text-lg text-ink-900">{event.hosts}</p>
        </Reveal>

        <Reveal delayMs={260} className="mt-12 flex flex-col items-center gap-3">
          <Button variant="primary" onClick={() => scrollToSection('tilmelding')}>
            Tilmeld jer
          </Button>
          <p className="text-sm text-ink-400">Svar senest {formatDanishDateLong(deadlineDate)}</p>
        </Reveal>
      </Container>
    </section>
  )
}
