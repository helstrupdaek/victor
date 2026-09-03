import { CONFIRMAND_NAME, CONFIRMATION_DATE } from '@/data/siteConfig'
import { formatDanishDateLong } from '@/lib/utils'
import { Container } from './Container'

export function Footer() {
  return (
    <footer className="border-t border-ink-900/[0.06] bg-cream-50 py-10">
      <Container className="flex flex-col items-center gap-2 text-center text-sm text-ink-600">
        <p className="font-display text-base text-ink-900">{CONFIRMAND_NAME}s konfirmation</p>
        <p>{formatDanishDateLong(CONFIRMATION_DATE)}</p>
      </Container>
    </footer>
  )
}
