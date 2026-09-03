import type { WishlistItem } from '@/types'

/**
 * Seed data used only in demo mode (no Supabase configured) so the
 * wishlist section has something real to reserve against. Once Supabase is
 * connected, add real wishes from /admin — this file stops being read.
 */
export const DEMO_WISHLIST: WishlistItem[] = [
  {
    id: 'demo-1',
    created_at: new Date().toISOString(),
    title: 'Golfbag',
    description: 'PLACEHOLDER: En letvægts standbag til træningsrunder.',
    image_url: null,
    external_url: null,
    price: 899,
    category: 'Golf',
    sort_order: 0,
    is_reserved: false,
  },
  {
    id: 'demo-2',
    created_at: new Date().toISOString(),
    title: 'Gavekort til Golfbutik',
    description: 'PLACEHOLDER: Så Victor selv kan vælge nyt udstyr.',
    image_url: null,
    external_url: null,
    price: 500,
    category: 'Gavekort',
    sort_order: 1,
    is_reserved: false,
  },
  {
    id: 'demo-3',
    created_at: new Date().toISOString(),
    title: 'Trådløse høretelefoner',
    description: 'PLACEHOLDER: Til skole og træning.',
    image_url: null,
    external_url: null,
    price: 1200,
    category: 'Elektronik',
    sort_order: 2,
    is_reserved: false,
  },
  {
    id: 'demo-4',
    created_at: new Date().toISOString(),
    title: 'Armbåndsur',
    description: 'PLACEHOLDER: Et enkelt, klassisk ur.',
    image_url: null,
    external_url: null,
    price: null,
    category: 'Accessories',
    sort_order: 3,
    is_reserved: false,
  },
]
