import { useEffect, useState } from 'react'
import { Button } from '@/components/Button'
import { Input, Label } from '@/components/FormControls'
import { DEFAULT_TIMELINE } from '@/data/timeline'
import { fetchSiteSetting, updateSiteSetting } from '@/lib/api/siteSettings'
import type { TimelineEvent } from '@/types'

export function TimelineTab() {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchSiteSetting('timeline', DEFAULT_TIMELINE).then(setEvents)
  }, [])

  function updateEvent(id: string, patch: Partial<TimelineEvent>) {
    setEvents((current) => current.map((e) => (e.id === id ? { ...e, ...patch } : e)))
    setSaved(false)
  }

  function addEvent() {
    setEvents((current) => [
      ...current,
      { id: crypto.randomUUID(), label: 'Nyt punkt', time: '', description: '' },
    ])
  }

  function removeEvent(id: string) {
    setEvents((current) => current.filter((e) => e.id !== id))
    setSaved(false)
  }

  async function handleSave() {
    setIsSaving(true)
    try {
      await updateSiteSetting('timeline', events)
      setSaved(true)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div>
      <div className="space-y-4">
        {events.map((event) => (
          <div key={event.id} className="rounded-xl border border-ink-900/10 bg-cream-50 p-4">
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
              <div>
                <Label htmlFor={`label-${event.id}`}>Punkt</Label>
                <Input
                  id={`label-${event.id}`}
                  value={event.label}
                  onChange={(e) => updateEvent(event.id, { label: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor={`time-${event.id}`}>Tidspunkt (valgfrit)</Label>
                <Input
                  id={`time-${event.id}`}
                  placeholder="fx 13:00"
                  value={event.time}
                  onChange={(e) => updateEvent(event.id, { time: e.target.value })}
                />
              </div>
              <div className="flex items-end">
                <button onClick={() => removeEvent(event.id)} className="text-sm text-red-700">
                  Slet
                </button>
              </div>
            </div>
            <div className="mt-3">
              <Label htmlFor={`desc-${event.id}`}>Beskrivelse</Label>
              <Input
                id={`desc-${event.id}`}
                value={event.description}
                onChange={(e) => updateEvent(event.id, { description: e.target.value })}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-4">
        <Button variant="outline" onClick={addEvent}>
          + Tilføj punkt
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Gemmer...' : 'Gem ændringer'}
        </Button>
        {saved && <span className="text-sm text-green-700">Gemt!</span>}
      </div>
    </div>
  )
}
