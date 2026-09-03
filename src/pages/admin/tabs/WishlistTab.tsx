import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/Button'
import { Input, Label, Textarea } from '@/components/FormControls'
import {
  createWishlistItem,
  deleteWishlistItem,
  fetchReservations,
  fetchWishlist,
  type WishlistItemInput,
} from '@/lib/api/wishlist'
import type { GiftReservation, WishlistItem } from '@/types'

const emptyForm: WishlistItemInput = {
  title: '',
  description: '',
  image_url: '',
  external_url: '',
  price: null,
  category: '',
  sort_order: 0,
}

export function WishlistTab() {
  const [items, setItems] = useState<WishlistItem[]>([])
  const [reservations, setReservations] = useState<GiftReservation[]>([])
  const [form, setForm] = useState<WishlistItemInput>(emptyForm)
  const [isSaving, setIsSaving] = useState(false)

  function load() {
    fetchWishlist().then(setItems)
    fetchReservations().then(setReservations)
  }

  useEffect(load, [])

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    setIsSaving(true)
    try {
      await createWishlistItem({
        ...form,
        description: form.description || null,
        image_url: form.image_url || null,
        external_url: form.external_url || null,
        category: form.category || null,
      })
      setForm(emptyForm)
      load()
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Slet denne ønske?')) return
    await deleteWishlistItem(id)
    load()
  }

  function reservationFor(itemId: string) {
    return reservations.find((r) => r.wishlist_item_id === itemId)
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
      <div>
        <h3 className="mb-4 font-display text-lg text-ink-900">Ønsker</h3>
        <div className="space-y-3">
          {items.map((item) => {
            const reservation = reservationFor(item.id)
            return (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-ink-900/10 bg-cream-50 p-4"
              >
                <div>
                  <p className="font-medium text-ink-900">{item.title}</p>
                  <p className="text-xs text-ink-600">
                    {item.category ?? '—'} {item.price != null && `· ${item.price} kr.`}
                  </p>
                  {reservation && (
                    <p className="mt-1 text-xs text-green-700">
                      Reserveret af {reservation.reserved_by_name}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="text-xs text-red-700 hover:underline"
                >
                  Slet
                </button>
              </div>
            )
          })}
          {items.length === 0 && <p className="text-ink-600">Ingen ønsker endnu.</p>}
        </div>
      </div>

      <form
        onSubmit={handleAdd}
        className="h-fit space-y-4 rounded-xl border border-ink-900/10 bg-cream-50 p-5"
      >
        <h3 className="font-display text-lg text-ink-900">Tilføj ønske</h3>
        <div>
          <Label htmlFor="wi-title">Titel</Label>
          <Input
            id="wi-title"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="wi-desc">Beskrivelse</Label>
          <Textarea
            id="wi-desc"
            value={form.description ?? ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="wi-image">Billede-URL</Label>
          <Input
            id="wi-image"
            value={form.image_url ?? ''}
            onChange={(e) => setForm({ ...form, image_url: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="wi-url">Ekstern URL</Label>
          <Input
            id="wi-url"
            value={form.external_url ?? ''}
            onChange={(e) => setForm({ ...form, external_url: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="wi-price">Pris (kr.)</Label>
            <Input
              id="wi-price"
              type="number"
              value={form.price ?? ''}
              onChange={(e) =>
                setForm({ ...form, price: e.target.value ? Number(e.target.value) : null })
              }
            />
          </div>
          <div>
            <Label htmlFor="wi-category">Kategori</Label>
            <Input
              id="wi-category"
              value={form.category ?? ''}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </div>
        </div>
        <Button type="submit" disabled={isSaving} className="w-full">
          {isSaving ? 'Gemmer...' : 'Tilføj'}
        </Button>
      </form>
    </div>
  )
}
