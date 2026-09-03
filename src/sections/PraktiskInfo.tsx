import { Bed, Car, Info, MapPin, Phone, Shirt, Tent } from 'lucide-react'
import type { ComponentType } from 'react'
import { Card } from '@/components/Card'
import { Container } from '@/components/Container'
import { Reveal } from '@/components/Reveal'
import { SectionHeading } from '@/components/SectionHeading'
import { DEFAULT_PRACTICAL_INFO } from '@/data/practicalInfo'
import { useSiteSetting } from '@/hooks/useSiteSetting'
import type { PracticalInfoCard, PracticalInfoIcon } from '@/types'

const ICONS: Record<PracticalInfoIcon, ComponentType<{ size?: number; className?: string }>> = {
  'map-pin': MapPin,
  car: Car,
  shirt: Shirt,
  tent: Tent,
  phone: Phone,
  bed: Bed,
  info: Info,
}

export function PraktiskInfo() {
  const { value: cards } = useSiteSetting<PracticalInfoCard[]>(
    'practical_info',
    DEFAULT_PRACTICAL_INFO,
  )

  return (
    <section id="praktisk-info" className="scroll-mt-24 bg-cream-100 py-24 sm:py-32">
      <Container>
        <SectionHeading eyebrow="Praktisk" title="Godt at vide" />

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card, index) => {
            const Icon = ICONS[card.icon] ?? Info
            return (
              <Reveal key={card.id} delayMs={Math.min(index * 50, 200)}>
                <Card className="h-full">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-green-100 text-green-700">
                    <Icon size={20} />
                  </div>
                  <h3 className="font-display text-lg text-ink-900">{card.title}</h3>
                  <p className="mt-2 text-sm whitespace-pre-line text-ink-600">{card.body}</p>
                </Card>
              </Reveal>
            )
          })}
        </div>
      </Container>
    </section>
  )
}
