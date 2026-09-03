import { Container } from '@/components/Container'
import { Reveal } from '@/components/Reveal'
import { SectionHeading } from '@/components/SectionHeading'
import { DEFAULT_TIMELINE } from '@/data/timeline'
import { useSiteSetting } from '@/hooks/useSiteSetting'
import type { TimelineEvent } from '@/types'

export function Dagen() {
  const { value: timeline } = useSiteSetting<TimelineEvent[]>('timeline', DEFAULT_TIMELINE)

  return (
    <section id="dagen" className="scroll-mt-24 bg-cream-100 py-24 sm:py-32">
      <Container>
        <SectionHeading
          eyebrow="Dagen"
          title="Sådan kommer dagen til at forløbe"
          description={
            'Victor konfirmeres i kirken den 1. maj 2027. Bagefter fejrer vi det sammen ' +
            'hjemme hos os — festen holdes i vores baghave, hvor vi sætter et stort festtelt op.'
          }
        />

        <ol className="relative mt-16 space-y-10 border-l border-green-300/60 pl-8 sm:pl-10">
          {timeline.map((event, index) => (
            <Reveal as="li" key={event.id} delayMs={index * 60} className="relative">
              <span
                className="absolute top-1 -left-[calc(2rem+5px)] h-2.5 w-2.5 rounded-full bg-green-600 sm:-left-[calc(2.5rem+5px)]"
                aria-hidden="true"
              />
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="font-display text-xl text-ink-900">{event.label}</h3>
                {event.time && (
                  <span className="text-sm font-medium text-green-700">{event.time}</span>
                )}
              </div>
              {event.description && (
                <p className="mt-1.5 max-w-xl text-ink-600">{event.description}</p>
              )}
            </Reveal>
          ))}
        </ol>
      </Container>
    </section>
  )
}
