import { useEffect, useState } from 'react'
import { Button } from '@/components/Button'
import { Input, Label, Textarea } from '@/components/FormControls'
import { DEFAULT_EVENT_INFO } from '@/data/eventInfo'
import { fetchSiteSetting, updateSiteSetting } from '@/lib/api/siteSettings'
import type { EventInfo } from '@/types'

export function EventInfoTab() {
  const [event, setEvent] = useState<EventInfo>(DEFAULT_EVENT_INFO)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchSiteSetting('event_info', DEFAULT_EVENT_INFO).then(setEvent)
  }, [])

  function update(patch: Partial<EventInfo>) {
    setEvent((current) => ({ ...current, ...patch }))
    setSaved(false)
  }

  async function handleSave() {
    setIsSaving(true)
    try {
      await updateSiteSetting('event_info', event)
      setSaved(true)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <section>
        <h3 className="mb-3 font-display text-lg text-ink-900">Kirke</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="churchName">Kirkens navn</Label>
            <Input
              id="churchName"
              value={event.churchName}
              onChange={(e) => update({ churchName: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="churchCity">By</Label>
            <Input
              id="churchCity"
              value={event.churchCity}
              onChange={(e) => update({ churchCity: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="churchAddress">Kirkens adresse (valgfrit)</Label>
            <Input
              id="churchAddress"
              value={event.churchAddress ?? ''}
              onChange={(e) => update({ churchAddress: e.target.value || null })}
            />
          </div>
          <div>
            <Label htmlFor="churchStartTime">Starttidspunkt (HH:MM)</Label>
            <Input
              id="churchStartTime"
              placeholder="Endnu ikke bekræftet"
              value={event.churchStartTime ?? ''}
              onChange={(e) => update({ churchStartTime: e.target.value || null })}
            />
            <p className="mt-1 text-xs text-ink-400">
              Tom = kalenderinvitationen sendes som en heldagsbegivenhed.
            </p>
          </div>
          <div>
            <Label htmlFor="churchEndTime">Sluttidspunkt (HH:MM, valgfrit)</Label>
            <Input
              id="churchEndTime"
              placeholder="Standard: 1 time efter start"
              value={event.churchEndTime ?? ''}
              onChange={(e) => update({ churchEndTime: e.target.value || null })}
            />
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-3 font-display text-lg text-ink-900">Fest</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="partyAddressLine1">Adresse</Label>
            <Input
              id="partyAddressLine1"
              value={event.partyAddressLine1}
              onChange={(e) => update({ partyAddressLine1: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="partyPostalCode">Postnummer</Label>
            <Input
              id="partyPostalCode"
              value={event.partyPostalCode}
              onChange={(e) => update({ partyPostalCode: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="partyCity">By</Label>
            <Input
              id="partyCity"
              value={event.partyCity}
              onChange={(e) => update({ partyCity: e.target.value })}
            />
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-3 font-display text-lg text-ink-900">Tilmelding &amp; tekst</h3>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="eventDate">Dato (ÅÅÅÅ-MM-DD)</Label>
              <Input
                id="eventDate"
                value={event.eventDate}
                onChange={(e) => update({ eventDate: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="rsvpDeadline">Svarfrist (ÅÅÅÅ-MM-DD)</Label>
              <Input
                id="rsvpDeadline"
                value={event.rsvpDeadline}
                onChange={(e) => update({ rsvpDeadline: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="hosts">Værter</Label>
            <Input id="hosts" value={event.hosts} onChange={(e) => update({ hosts: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="invitationBody">Invitationstekst</Label>
            <Textarea
              id="invitationBody"
              rows={6}
              value={event.invitationBody}
              onChange={(e) => update({ invitationBody: e.target.value })}
            />
            <p className="mt-1 text-xs text-ink-400">
              Adskil afsnit med en tom linje — vises som separate afsnit på sitet.
            </p>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-4">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Gemmer...' : 'Gem ændringer'}
        </Button>
        {saved && <span className="text-sm text-green-700">Gemt!</span>}
      </div>
    </div>
  )
}
