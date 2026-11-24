import type { FormEvent, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/Button'
import { Input, Label, Textarea } from '@/components/FormControls'
import {
  addInvitation,
  deleteInvitation,
  fetchInvitations,
  sendInvitation,
  type Channel,
} from '@/lib/api/invitations'
import { fetchSiteSetting, updateSiteSetting } from '@/lib/api/siteSettings'
import type { Invitation } from '@/types'

/**
 * The guest list for personal invitations. Each guest gets their own link,
 * /i/<token>, which opens the envelope and prefills Tilmelding. Sending goes
 * through /api/invitations/send one guest at a time, so a bulk send shows
 * progress, and a channel already sent is skipped unless "Send igen" is used.
 */

const MESSAGE_KEY = 'invitation_message'
const DEFAULT_MESSAGE =
  'Kære {navn}\n\nDu er inviteret til Victors konfirmation lørdag den 1. maj 2027. Åbn din personlige invitation og tilmeld dig her:\n{link}'

// GSM-7 covers æøå; anything else (emoji, curly quotes) switches the SMS to
// unicode, which cuts a message from 160 to 70 characters.
const GSM = /^[A-Za-z0-9 \n\r@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/

function smsCount(text: string): string {
  const gsm = GSM.test(text)
  const single = gsm ? 160 : 70
  const multi = gsm ? 153 : 67
  const parts = text.length <= single ? 1 : Math.ceil(text.length / multi)
  return `${text.length} tegn · ${parts} SMS${gsm ? '' : ' (indeholder specialtegn/emoji)'}`
}

function errorMessage(e: unknown): string {
  const message =
    e && typeof e === 'object' && 'message' in e && typeof e.message === 'string'
      ? e.message
      : 'Noget gik galt.'
  return /invitations/.test(message) && /does not exist|schema cache/.test(message)
    ? 'Listen er ikke sat op endnu. Kør supabase/migrations/0009_invitations.sql i Supabase.'
    : message
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })
}

const linkFor = (inv: Invitation) => `${window.location.origin}/i/${inv.token}`

export function InvitationsTab() {
  const [rows, setRows] = useState<Invitation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState(DEFAULT_MESSAGE)
  const [savedMessage, setSavedMessage] = useState(DEFAULT_MESSAGE)
  const [form, setForm] = useState({ name: '', email: '', phone: '' })
  const [channels, setChannels] = useState<Record<Channel, boolean>>({ email: true, sms: true })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])

  function load() {
    fetchInvitations()
      .then((data) => {
        setRows(data)
        setError(null)
      })
      .catch((e: unknown) => setError(errorMessage(e)))
  }

  useEffect(() => {
    load()
    fetchSiteSetting(MESSAGE_KEY, DEFAULT_MESSAGE).then((m) => {
      setMessage(m)
      setSavedMessage(m)
    })
  }, [])

  async function saveMessage() {
    await updateSiteSetting(MESSAGE_KEY, message)
    setSavedMessage(message)
  }

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    const name = form.name.trim()
    const email = form.email.trim().toLowerCase() || null
    const phone = form.phone.trim() || null
    if (!name || (!email && !phone)) return
    try {
      await addInvitation({ name, email, phone })
      setForm({ name: '', email: '', phone: '' })
      load()
    } catch (e: unknown) {
      setError(errorMessage(e))
    }
  }

  async function handleDelete(inv: Invitation) {
    if (!confirm(`Slet ${inv.name}? Linket holder op med at virke.`)) return
    try {
      await deleteInvitation(inv.id)
      setSelected((s) => new Set([...s].filter((id) => id !== inv.id)))
      load()
    } catch (e: unknown) {
      setError(errorMessage(e))
    }
  }

  const chosen = (Object.keys(channels) as Channel[]).filter((c) => channels[c])

  async function send(targets: Invitation[], resend: boolean) {
    if (chosen.length === 0 || targets.length === 0) return
    const what = chosen.map((c) => (c === 'sms' ? 'SMS' : 'email')).join(' og ')
    const who = targets.length === 1 ? targets[0].name : `${targets.length} gæster`
    if (!confirm(`Send ${what} til ${who}?`)) return
    if (message !== savedMessage) await saveMessage().catch(() => {})
    const lines: string[] = []
    for (const [i, inv] of targets.entries()) {
      setProgress(`Sender ${i + 1} af ${targets.length}...`)
      try {
        const result = await sendInvitation(inv.id, chosen, message, resend)
        for (const c of chosen) {
          const r = result[c]
          if (r !== 'sent' && r !== 'skipped') lines.push(`${inv.name} (${c}): ${r}`)
        }
      } catch (e: unknown) {
        lines.push(`${inv.name}: ${errorMessage(e)}`)
      }
    }
    setProgress(null)
    setLog(lines.length > 0 ? lines : ['Alt sendt.'])
    load()
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const list = rows ?? []
  const allSelected = list.length > 0 && list.every((r) => selected.has(r.id))
  const longestName = list.reduce((a, r) => (r.name.length > a.length ? r.name : a), 'Mormor og Morfar')
  const preview = message
    .replaceAll('{navn}', longestName)
    .replaceAll('{link}', `${window.location.origin}/i/abcdef123456`)

  return (
    <div className="max-w-3xl space-y-10">
      <section>
        <h2 className="mb-3 font-display text-xl text-ink-900">Beskeden</h2>
        <Label htmlFor="inv-message">
          Bruges til både SMS og email. {'{navn}'} og {'{link}'} udfyldes for hver gæst.
        </Label>
        <Textarea
          id="inv-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="min-h-36"
        />
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-ink-600">
          <span>SMS: {smsCount(preview)}</span>
          <Button variant="outline" className="px-4 py-2 text-sm" onClick={saveMessage} disabled={message === savedMessage}>
            {message === savedMessage ? 'Gemt' : 'Gem tekst'}
          </Button>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl text-ink-900">Tilføj gæst</h2>
        <form onSubmit={handleAdd} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <Input placeholder="Navn" aria-label="Navn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input placeholder="Email" aria-label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input placeholder="Mobil, fx 12345678" aria-label="Mobil" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Button type="submit" disabled={!form.name.trim() || (!form.email.trim() && !form.phone.trim())}>
            Tilføj
          </Button>
        </form>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-4">
          <h2 className="font-display text-xl text-ink-900">Gæster ({list.length})</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={channels.email} onChange={(e) => setChannels({ ...channels, email: e.target.checked })} className="accent-ink-900" />
            Email
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={channels.sms} onChange={(e) => setChannels({ ...channels, sms: e.target.checked })} className="accent-ink-900" />
            SMS
          </label>
          <Button
            className="ml-auto px-5 py-2.5 text-sm"
            disabled={selected.size === 0 || chosen.length === 0 || progress !== null}
            onClick={() => send(list.filter((r) => selected.has(r.id)), false)}
          >
            {progress ?? `Send til valgte (${selected.size})`}
          </Button>
        </div>
        <p className="mb-3 text-xs text-ink-600">
          Gæster, der allerede har fået en SMS eller email, springes over for den kanal. Brug "Send igen" på
          en enkelt gæst for at sende igen.
        </p>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {log.length > 0 && (
          <div className="mb-4 rounded-lg bg-cream-200 px-4 py-3 text-sm text-ink-800">
            {log.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
        {rows === null && !error && <p className="text-ink-600">Henter listen...</p>}
        {rows?.length === 0 && <p className="text-ink-600">Ingen gæster endnu. Tilføj den første ovenfor.</p>}

        {list.length > 0 && (
          <>
            <label className="mb-2 flex items-center gap-3 px-4 text-sm text-ink-600">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(list.map((r) => r.id)))}
                className="h-5 w-5 accent-ink-900"
              />
              Vælg alle
            </label>
            <ul className="space-y-2">
              {list.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-900/10 bg-cream-50 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(inv.id)}
                    onChange={() => toggle(inv.id)}
                    aria-label={`Vælg ${inv.name}`}
                    className="h-5 w-5 shrink-0 accent-ink-900"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-900">{inv.name}</p>
                    <p className="truncate text-xs text-ink-600">{[inv.email, inv.phone].filter(Boolean).join(' · ')}</p>
                    <p className="mt-1 flex flex-wrap gap-2 text-xs">
                      {inv.email_sent_at && <Badge>Email {formatWhen(inv.email_sent_at)}</Badge>}
                      {inv.sms_sent_at && <Badge>SMS {formatWhen(inv.sms_sent_at)}</Badge>}
                      {inv.opened_at && <Badge>Åbnet {formatWhen(inv.opened_at)}</Badge>}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-3 text-sm">
                    <button onClick={() => navigator.clipboard.writeText(linkFor(inv))} className="text-ink-600 hover:underline">
                      Kopiér link
                    </button>
                    <button onClick={() => send([inv], true)} disabled={progress !== null} className="text-green-700 hover:underline">
                      {inv.email_sent_at || inv.sms_sent_at ? 'Send igen' : 'Send'}
                    </button>
                    <button onClick={() => handleDelete(inv)} className="text-ink-400 hover:text-red-700">
                      Slet
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-900">{children}</span>
}
