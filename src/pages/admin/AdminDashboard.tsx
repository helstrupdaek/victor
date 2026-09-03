import { useState } from 'react'
import { signOutAdmin } from '@/lib/api/auth'
import { EventInfoTab } from './tabs/EventInfoTab'
import { GalleryTab } from './tabs/GalleryTab'
import { PracticalInfoTab } from './tabs/PracticalInfoTab'
import { RsvpTab } from './tabs/RsvpTab'
import { TimelineTab } from './tabs/TimelineTab'
import { WishlistTab } from './tabs/WishlistTab'

const TABS = [
  { id: 'rsvp', label: 'Tilmeldinger', component: RsvpTab },
  { id: 'event', label: 'Begivenhed', component: EventInfoTab },
  { id: 'wishlist', label: 'Ønskeliste', component: WishlistTab },
  { id: 'gallery', label: 'Billeder', component: GalleryTab },
  { id: 'practical', label: 'Praktisk', component: PracticalInfoTab },
  { id: 'timeline', label: 'Tidsplan', component: TimelineTab },
] as const

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]['id']>('rsvp')
  const ActiveComponent = TABS.find((tab) => tab.id === activeTab)?.component ?? RsvpTab

  return (
    <div className="min-h-screen bg-cream-100">
      <header className="border-b border-ink-900/10 bg-cream-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <h1 className="font-display text-xl text-ink-900">Admin</h1>
          <button onClick={() => signOutAdmin()} className="text-sm text-ink-600 hover:underline">
            Log ud
          </button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={
                'shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors ' +
                (activeTab === tab.id
                  ? 'border-green-700 text-green-800'
                  : 'border-transparent text-ink-600 hover:text-ink-900')
              }
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <ActiveComponent />
      </main>
    </div>
  )
}
