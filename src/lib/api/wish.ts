import type { WishlistItem } from '@/types'

const PIN_STORAGE_KEY = 'wish_pin'

export function getStoredPin(): string | null {
  return localStorage.getItem(PIN_STORAGE_KEY)
}

function clearStoredPin(): void {
  localStorage.removeItem(PIN_STORAGE_KEY)
}

async function callWishApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const pin = getStoredPin()
  const response = await fetch(`/api/wish/${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(pin ? { Authorization: `Bearer ${pin}` } : {}),
      ...options.headers,
    },
  })
  if (response.status === 401) {
    clearStoredPin()
    throw new Error('Forkert pinkode. Prøv igen.')
  }
  const data = (await response.json()) as T & { ok: boolean; error?: string }
  if (!data.ok && data.error) throw new Error(data.error)
  return data
}

export async function verifyWishPin(pin: string): Promise<boolean> {
  const response = await fetch('/api/wish/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  })
  const data = (await response.json()) as { ok: boolean }
  if (data.ok) localStorage.setItem(PIN_STORAGE_KEY, pin)
  return data.ok
}

export interface WishPreview {
  ok: boolean
  reason?: string
  title?: string | null
  image_url?: string | null
  price?: number | null
}

export async function fetchWishPreview(url: string): Promise<WishPreview> {
  return callWishApi<WishPreview>('preview', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
}

export async function addWish(input: {
  title: string
  image_url: string | null
  external_url: string | null
  price: number | null
}): Promise<void> {
  await callWishApi('add', { method: 'POST', body: JSON.stringify(input) })
}

export async function fetchMyWishlist(): Promise<WishlistItem[]> {
  const data = await callWishApi<{ items: WishlistItem[] }>('list', { method: 'GET' })
  return data.items
}

export async function deleteWish(id: string): Promise<void> {
  await callWishApi('delete', { method: 'POST', body: JSON.stringify({ id }) })
}
