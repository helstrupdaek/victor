import { FlagTriangleRight, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Container } from '@/components/Container'
import { Reveal } from '@/components/Reveal'
import { SectionHeading } from '@/components/SectionHeading'
import { fetchMinigolfLeaderboard, type MinigolfLeaderboardEntry } from '@/lib/api/minigolf'

/**
 * An invitation to the game, not a part of it: the course itself lives on
 * /minigolf. Naming whoever currently leads gives guests someone to beat,
 * and the line simply does not render if the leaderboard is empty or
 * unreachable, so the section never shows an error of its own.
 */
export function MinigolfTeaser() {
  const [leader, setLeader] = useState<MinigolfLeaderboardEntry | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchMinigolfLeaderboard()
      .then((entries) => { if (!cancelled) setLeader(entries[0] ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  return (
    <section id="minigolf" className="scroll-mt-24 bg-cream-50 py-24 sm:py-32">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading
              eyebrow="Minigolf"
              title="Kan du slå Victor i hans egen have?"
              description="Vi har bygget Victors baghave som en minigolfbane. Ét hul, så få slag som muligt. Men pas på: Victor går rundt derude, og får han fat i bolden, sparker han den over hækken."
            />
            <Reveal className="mt-8 flex items-start gap-3 rounded-2xl border border-ink-900/10 bg-cream-100 p-5">
              <Trophy size={22} className="mt-0.5 flex-shrink-0 text-green-900" aria-hidden />
              <p className="text-ink-900/80">
                Måske venter der en præmie til nummer 1 på ranglisten. Det bliver afsløret til festen.
                {leader && (
                  <span className="mt-1 block font-medium text-ink-900">
                    Lige nu fører {leader.display_name} med {leader.shots} slag.
                  </span>
                )}
              </p>
            </Reveal>
            <Reveal className="mt-8">
              <Link
                to="/minigolf"
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-ink-900 px-7 font-medium tracking-wide text-cream-50 shadow-card transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-green-900"
              >
                <FlagTriangleRight size={18} strokeWidth={2.25} aria-hidden />
                Spil minigolf
              </Link>
            </Reveal>
          </div>
          <Reveal>
            <Link to="/minigolf" aria-label="Åbn minigolfspillet" className="group block">
              <img
                src="/images/minigolf-have.webp"
                alt="Minigolfbanen i Victors have: græsplæne, bunkers, huset og Victor, der går rundt på banen"
                width={1190}
                height={694}
                loading="lazy"
                className="w-full rounded-2xl shadow-soft ring-1 ring-ink-900/10 transition-transform duration-300 ease-out group-hover:-translate-y-1"
              />
            </Link>
          </Reveal>
        </div>
      </Container>
    </section>
  )
}
