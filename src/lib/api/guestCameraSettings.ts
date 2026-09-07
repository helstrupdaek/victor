import { fetchSiteSetting, updateSiteSetting } from '@/lib/api/siteSettings'
import type { GalleryDirection } from '@/types'

/**
 * The two site_settings rows behind the guest camera. Both are public, so the
 * anon client on /kamera and Billeder can read them; writes go through
 * updateSiteSetting, which is admin-only under RLS.
 *
 * Reading is deliberately forgiving: a missing or malformed row means "off"
 * and "newest", never an exception, because these are read on the public
 * site where the right failure mode is the safe default.
 */

interface GuestCameraSetting { enabled: boolean }
interface GalleryOrderSetting { direction: GalleryDirection }

export async function fetchGuestCameraEnabled(): Promise<boolean> {
  const value = await fetchSiteSetting<GuestCameraSetting>('guest_camera', { enabled: false })
  return value?.enabled === true
}

export function setGuestCameraEnabled(enabled: boolean): Promise<void> {
  return updateSiteSetting<GuestCameraSetting>('guest_camera', { enabled })
}

export async function fetchGalleryOrder(): Promise<GalleryDirection> {
  const value = await fetchSiteSetting<GalleryOrderSetting>('gallery_order', { direction: 'newest' })
  return value?.direction === 'oldest' ? 'oldest' : 'newest'
}

export function setGalleryOrder(direction: GalleryDirection): Promise<void> {
  return updateSiteSetting<GalleryOrderSetting>('gallery_order', { direction })
}
