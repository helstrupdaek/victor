import { useEffect, useState } from 'react'
import { Button } from '@/components/Button'
import { Input, Label, Textarea } from '@/components/FormControls'
import { DEFAULT_PRACTICAL_INFO } from '@/data/practicalInfo'
import { fetchSiteSetting, updateSiteSetting } from '@/lib/api/siteSettings'
import type { PracticalInfoCard, PracticalInfoIcon } from '@/types'

const ICON_OPTIONS: PracticalInfoIcon[] = [
  'map-pin',
  'car',
  'shirt',
  'tent',
  'phone',
  'bed',
  'info',
]

export function PracticalInfoTab() {
  const [cards, setCards] = useState<PracticalInfoCard[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchSiteSetting('practical_info', DEFAULT_PRACTICAL_INFO).then(setCards)
  }, [])

  function updateCard(id: string, patch: Partial<PracticalInfoCard>) {
    setCards((current) => current.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    setSaved(false)
  }

  function addCard() {
    setCards((current) => [
      ...current,
      { id: crypto.randomUUID(), title: 'Ny kategori', body: '', icon: 'info' },
    ])
  }

  function removeCard(id: string) {
    setCards((current) => current.filter((c) => c.id !== id))
    setSaved(false)
  }

  async function handleSave() {
    setIsSaving(true)
    try {
      await updateSiteSetting('practical_info', cards)
      setSaved(true)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div>
      <div className="space-y-4">
        {cards.map((card) => (
          <div key={card.id} className="rounded-xl border border-ink-900/10 bg-cream-50 p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <div>
                <Label htmlFor={`title-${card.id}`}>Titel</Label>
                <Input
                  id={`title-${card.id}`}
                  value={card.title}
                  onChange={(e) => updateCard(card.id, { title: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor={`icon-${card.id}`}>Ikon</Label>
                <select
                  id={`icon-${card.id}`}
                  value={card.icon}
                  onChange={(e) =>
                    updateCard(card.id, { icon: e.target.value as PracticalInfoIcon })
                  }
                  className="w-full rounded-xl border border-ink-900/15 bg-cream-50 px-4 py-2.5"
                >
                  {ICON_OPTIONS.map((icon) => (
                    <option key={icon} value={icon}>
                      {icon}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button onClick={() => removeCard(card.id)} className="text-sm text-red-700">
                  Slet
                </button>
              </div>
            </div>
            <div className="mt-3">
              <Label htmlFor={`body-${card.id}`}>Indhold</Label>
              <Textarea
                id={`body-${card.id}`}
                value={card.body}
                onChange={(e) => updateCard(card.id, { body: e.target.value })}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-4">
        <Button variant="outline" onClick={addCard}>
          + Tilføj kort
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Gemmer...' : 'Gem ændringer'}
        </Button>
        {saved && <span className="text-sm text-green-700">Gemt!</span>}
      </div>
    </div>
  )
}
