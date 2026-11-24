import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Envelope } from '@/components/Envelope'
import { Footer } from '@/components/Footer'
import { Navigation } from '@/components/Navigation'
import { Billeder } from '@/sections/Billeder'
import { Dagen } from '@/sections/Dagen'
import { Hero } from '@/sections/Hero'
import { Invitation } from '@/sections/Invitation'
import { MinigolfTeaser } from '@/sections/MinigolfTeaser'
import { Onskeliste } from '@/sections/Onskeliste'
import { PraktiskInfo } from '@/sections/PraktiskInfo'
import { Tilmelding } from '@/sections/Tilmelding'
import { Vejret } from '@/sections/Vejret'
import { DEFAULT_EVENT_INFO } from '@/data/eventInfo'
import { useSiteSetting } from '@/hooks/useSiteSetting'
import { fetchInvitationByToken } from '@/lib/api/invitations'
import { formatDanishDateLong, parseIsoDateLocal } from '@/lib/utils'
import type { EventInfo } from '@/types'

type Invitee = { name: string; email: string | null }

export function HomePage() {
  // /i/<token>: a personal invitation link. Opens the envelope first and
  // prefills Tilmelding with the guest's name and email.
  const { token } = useParams()
  const [invitee, setInvitee] = useState<Invitee | null | undefined>(token ? undefined : null)
  const [showEnvelope, setShowEnvelope] = useState(Boolean(token))
  const { value: event } = useSiteSetting<EventInfo>('event_info', DEFAULT_EVENT_INFO)
  const closeEnvelope = useCallback(() => setShowEnvelope(false), [])

  useEffect(() => {
    if (!token) return
    fetchInvitationByToken(token)
      .then(setInvitee)
      .catch(() => setInvitee(null))
  }, [token])

  return (
    <>
      {showEnvelope &&
        (invitee === undefined ? (
          <div className="fixed inset-0 z-[100] bg-green-900" />
        ) : (
          <Envelope
            name={invitee?.name ?? null}
            dateLabel={formatDanishDateLong(parseIsoDateLocal(event.eventDate))}
            onDone={closeEnvelope}
          />
        ))}
      <Navigation />
      <main>
        <Hero />
        <Invitation />
        <Dagen />
        <Tilmelding prefill={invitee ?? undefined} />
        <Onskeliste />
        <PraktiskInfo />
        <Vejret />
        <MinigolfTeaser />
        <Billeder />
      </main>
      <Footer />
    </>
  )
}
