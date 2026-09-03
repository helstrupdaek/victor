import { Gift, SquareArrowOutUpRight, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Input, Label } from '@/components/FormControls'
import {
  addWish,
  deleteWish,
  fetchMyWishlist,
  fetchWishPreview,
  getStoredPin,
  verifyWishPin,
  type WishPreview,
} from '@/lib/api/wish'
import { cn } from '@/lib/utils'
import type { WishlistItem } from '@/types'

const PIN_LENGTH = 4

function PinGate({ onVerified }: { onVerified: () => void }) {
  const [digits, setDigits] = useState<string[]>(Array(PIN_LENGTH).fill(''))
  const [error, setError] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  async function submit(pin: string) {
    setIsChecking(true)
    setError(null)
    try {
      const ok = await verifyWishPin(pin)
      if (ok) {
        onVerified()
        return
      }
      setError('Forkert pinkode.')
      setDigits(Array(PIN_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    } finally {
      setIsChecking(false)
    }
  }

  function handleChange(index: number, rawValue: string) {
    const value = rawValue.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = value
    setDigits(next)
    setError(null)

    if (value && index < PIN_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
    if (value && next.every((d) => d)) {
      void submit(next.join(''))
    }
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, PIN_LENGTH)
    if (!pasted) return
    event.preventDefault()
    const next = Array(PIN_LENGTH).fill('')
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i]
    setDigits(next)
    if (pasted.length === PIN_LENGTH) void submit(pasted)
    else inputRefs.current[pasted.length]?.focus()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-100 px-6">
      <div className="w-full max-w-xs space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="font-display text-2xl text-ink-900">Indtast pinkode</h1>
          <p className="text-sm text-ink-600">
            Skriv din pinkode for at komme ind på din ønskeliste.
          </p>
        </div>

        <div className="flex justify-center gap-3">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(el) => {
                inputRefs.current[index] = el
              }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              disabled={isChecking}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              className={cn(
                'h-16 w-14 rounded-xl border text-center text-2xl font-medium text-ink-900',
                'bg-cream-50 transition-colors focus:outline-none focus-visible:ring-2',
                'focus-visible:ring-green-600/30',
                error ? 'border-red-400' : 'border-ink-900/15 focus:border-green-600',
              )}
            />
          ))}
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>
    </div>
  )
}

function AddWishForm({ onAdded }: { onAdded: () => void }) {
  const [url, setUrl] = useState('')
  const [isFetching, setIsFetching] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [preview, setPreview] = useState<WishPreview | null>(null)
  const [title, setTitle] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [price, setPrice] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleFetchPreview(event: FormEvent) {
    event.preventDefault()
    if (!url.trim()) return
    setIsFetching(true)
    setError(null)
    try {
      const result = await fetchWishPreview(url.trim())
      setPreview(result)
      setTitle(result.title ?? '')
      setImageUrl(result.image_url ?? '')
      setPrice(result.price != null ? String(result.price) : '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Der skete en fejl.')
    } finally {
      setIsFetching(false)
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      setError('Skriv en titel.')
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await addWish({
        title: title.trim(),
        image_url: imageUrl.trim() || null,
        external_url: url.trim() || null,
        price: price ? Number(price) : null,
      })
      setUrl('')
      setPreview(null)
      setTitle('')
      setImageUrl('')
      setPrice('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Der skete en fejl.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-ink-900/10 bg-cream-50 p-6">
      <h2 className="font-display text-lg text-ink-900">Tilføj et ønske</h2>

      {!preview && (
        <form onSubmit={handleFetchPreview} className="flex gap-2">
          <Input
            placeholder="Indsæt link til produktet"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={isFetching}>
            {isFetching ? 'Henter...' : 'Hent'}
          </Button>
        </form>
      )}

      {preview && (
        <div className="space-y-3 rounded-xl border border-ink-900/10 bg-cream-100 p-4">
          {preview.ok === false && (
            <p className="text-sm text-ink-600">
              Kunne ikke hente billede/titel automatisk — udfyld det selv herunder.
            </p>
          )}
          {imageUrl && (
            <img src={imageUrl} alt="" className="h-40 w-full rounded-lg object-cover" />
          )}
          <div>
            <Label htmlFor="title">Titel</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="image">Billede-URL</Label>
            <Input id="image" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="price">Pris (kr.)</Label>
            <Input
              id="price"
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={isSaving} className="flex-1">
              {isSaving ? 'Gemmer...' : 'Tilføj til ønskeliste'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setPreview(null)
                setUrl('')
              }}
            >
              Annuller
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  )
}

function MyWishCard({ item, onDelete }: { item: WishlistItem; onDelete: (id: string) => void }) {
  return (
    <Card className="flex flex-col overflow-hidden !p-0">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-green-100">
        {item.image_url ? (
          <img src={item.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-green-100 to-green-50">
            <Gift className="text-green-500" size={32} strokeWidth={1.5} />
          </div>
        )}
        {item.is_reserved && (
          <span className="absolute top-3 left-3 rounded-full bg-cream-50/90 px-3 py-1 text-xs font-medium text-ink-800">
            Reserveret
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="font-medium text-ink-900">{item.title}</p>
        <div className="mt-2 flex items-center justify-between text-sm">
          {item.price != null && <span className="text-ink-700">{item.price} kr.</span>}
          {item.external_url && (
            <a
              href={item.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-green-700 hover:underline"
            >
              Se <SquareArrowOutUpRight size={12} />
            </a>
          )}
        </div>
        <button
          onClick={() => onDelete(item.id)}
          className="mt-3 inline-flex items-center gap-1 self-start text-xs text-red-700 hover:underline"
        >
          <Trash2 size={12} /> Fjern
        </button>
      </div>
    </Card>
  )
}

function WishDashboard() {
  const [items, setItems] = useState<WishlistItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  function load() {
    setIsLoading(true)
    fetchMyWishlist()
      .then(setItems)
      .catch(() => {
        if (!getStoredPin()) window.location.reload()
      })
      .finally(() => setIsLoading(false))
  }

  useEffect(load, [])

  async function handleDelete(id: string) {
    if (!confirm('Fjern dette ønske?')) return
    await deleteWish(id)
    load()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <h1 className="font-display text-2xl text-ink-900">Din ønskeliste</h1>
      <AddWishForm onAdded={load} />

      <div>
        <h2 className="mb-4 font-display text-lg text-ink-900">Dine ønsker</h2>
        {isLoading && <p className="text-ink-600">Indlæser...</p>}
        {!isLoading && items.length === 0 && (
          <p className="text-ink-600">Du har ikke tilføjet nogen ønsker endnu.</p>
        )}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {items.map((item) => (
            <MyWishCard key={item.id} item={item} onDelete={handleDelete} />
          ))}
        </div>
      </div>
    </div>
  )
}

export function WishPage() {
  const [isVerified, setIsVerified] = useState(() => Boolean(getStoredPin()))

  if (!isVerified) return <PinGate onVerified={() => setIsVerified(true)} />
  return <WishDashboard />
}
