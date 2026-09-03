import { Footer } from '@/components/Footer'
import { Navigation } from '@/components/Navigation'
import { Billeder } from '@/sections/Billeder'
import { Dagen } from '@/sections/Dagen'
import { Hero } from '@/sections/Hero'
import { Invitation } from '@/sections/Invitation'
import { Onskeliste } from '@/sections/Onskeliste'
import { PraktiskInfo } from '@/sections/PraktiskInfo'
import { Tilmelding } from '@/sections/Tilmelding'
import { Vejret } from '@/sections/Vejret'

export function HomePage() {
  return (
    <>
      <Navigation />
      <main>
        <Hero />
        <Invitation />
        <Dagen />
        <Tilmelding />
        <Onskeliste />
        <PraktiskInfo />
        <Vejret />
        <Billeder />
      </main>
      <Footer />
    </>
  )
}
