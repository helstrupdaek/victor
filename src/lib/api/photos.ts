import { readDemo, writeDemo } from '@/lib/demoStore'
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient'
import type { GalleryDirection, Photo } from '@/types'

const DEMO_KEY = 'photos'
const BUCKET = 'gallery'

function withPublicUrl(photo: Omit<Photo, 'url'>): Photo {
  if (isSupabaseConfigured && supabase) {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(photo.storage_path)
    return { ...photo, url: data.publicUrl }
  }
  // In demo mode storage_path already holds a data: URL (see uploadPhoto).
  return { ...photo, url: photo.storage_path }
}

/** Pinned first, then by date in the direction the hosts chose. */
function orderPhotos(photos: Omit<Photo, 'url'>[], direction: GalleryDirection) {
  const sign = direction === 'newest' ? -1 : 1
  return [...photos].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
    return sign * a.created_at.localeCompare(b.created_at)
  })
}

// Every column of `photos` except uploader_hash — an HMAC of the uploader's
// IP kept only for the guest-upload rate limit, never meant for a public
// read. Naming columns instead of select('*') keeps it out of this response
// even before migration 0008 (supabase/migrations/0008_photos_anon_columns.sql)
// is applied to revoke anon's column-level access at the database itself.
const PUBLIC_PHOTO_COLUMNS =
  'id, created_at, storage_path, caption, width, height, sort_order, is_published, source, guest_name, is_pinned'

export async function fetchPublishedPhotos(direction: GalleryDirection = 'newest'): Promise<Photo[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('photos')
      .select(PUBLIC_PHOTO_COLUMNS)
      .eq('is_published', true)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: direction === 'oldest' })
    if (error) throw error
    return data.map(withPublicUrl)
  }

  const photos = readDemo<Omit<Photo, 'url'>[]>(DEMO_KEY, [])
  return orderPhotos(photos.filter((p) => p.is_published), direction).map(withPublicUrl)
}

/** Admin-only: includes unpublished photos, requires an authenticated session (RLS). */
export async function fetchAllPhotosAdmin(): Promise<Photo[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data.map(withPublicUrl)
  }

  const photos = readDemo<Omit<Photo, 'url'>[]>(DEMO_KEY, [])
  return photos.map(withPublicUrl)
}

export async function uploadPhoto(
  file: File,
  options: { caption?: string; isPublished?: boolean } = {},
): Promise<void> {
  const dimensions = await readImageDimensions(file)

  if (isSupabaseConfigured && supabase) {
    const path = `${crypto.randomUUID()}-${file.name}`
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '31536000',
      upsert: false,
    })
    if (uploadError) throw uploadError

    const { error } = await supabase.from('photos').insert({
      storage_path: path,
      caption: options.caption ?? null,
      is_published: options.isPublished ?? true,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      sort_order: 0,
      source: 'admin',
      guest_name: null,
      is_pinned: false,
    })
    if (error) throw error
    return
  }

  const dataUrl = await readFileAsDataUrl(file)
  const photos = readDemo<Omit<Photo, 'url'>[]>(DEMO_KEY, [])
  photos.unshift({
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    storage_path: dataUrl,
    caption: options.caption ?? null,
    is_published: options.isPublished ?? true,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    sort_order: 0,
    source: 'admin',
    guest_name: null,
    is_pinned: false,
  })
  writeDemo(DEMO_KEY, photos)
}

export async function togglePhotoPublished(id: string, isPublished: boolean): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('photos')
      .update({ is_published: isPublished })
      .eq('id', id)
    if (error) throw error
    return
  }

  const photos = readDemo<Omit<Photo, 'url'>[]>(DEMO_KEY, [])
  writeDemo(
    DEMO_KEY,
    photos.map((p) => (p.id === id ? { ...p, is_published: isPublished } : p)),
  )
}

export async function deletePhoto(id: string, storagePath: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error: dbError } = await supabase.from('photos').delete().eq('id', id)
    if (dbError) throw dbError
    await supabase.storage.from(BUCKET).remove([storagePath])
    return
  }

  const photos = readDemo<Omit<Photo, 'url'>[]>(DEMO_KEY, [])
  writeDemo(
    DEMO_KEY,
    photos.filter((p) => p.id !== id),
  )
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(objectUrl)
    }
    img.onerror = () => {
      resolve(null)
      URL.revokeObjectURL(objectUrl)
    }
    img.src = objectUrl
  })
}

export async function setPhotoPinned(id: string, pinned: boolean): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('photos').update({ is_pinned: pinned }).eq('id', id)
    if (error) throw error
    return
  }
  const photos = readDemo<Omit<Photo, 'url'>[]>(DEMO_KEY, [])
  writeDemo(DEMO_KEY, photos.map((p) => (p.id === id ? { ...p, is_pinned: pinned } : p)))
}

export async function updatePhotoText(
  id: string,
  text: { caption: string | null; guest_name: string | null },
): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('photos').update(text).eq('id', id)
    if (error) throw error
    return
  }
  const photos = readDemo<Omit<Photo, 'url'>[]>(DEMO_KEY, [])
  writeDemo(DEMO_KEY, photos.map((p) => (p.id === id ? { ...p, ...text } : p)))
}

/**
 * Removes every guest photo and its file. This is what makes testing before
 * the party clean: switch on, shoot, look, delete all, switch off.
 */
export async function deleteAllGuestPhotos(): Promise<number> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('photos')
      .select('id, storage_path')
      .eq('source', 'guest')
    if (error) throw error
    if (data.length === 0) return 0
    const { error: dbError } = await supabase.from('photos').delete().eq('source', 'guest')
    if (dbError) throw dbError
    // Files second: a row without a file is invisible; a file without a row
    // is an orphan nobody can see either, so this order loses nothing if the
    // second call fails.
    await supabase.storage.from(BUCKET).remove(data.map((p) => p.storage_path))
    return data.length
  }
  const photos = readDemo<Omit<Photo, 'url'>[]>(DEMO_KEY, [])
  const kept = photos.filter((p) => p.source !== 'guest')
  writeDemo(DEMO_KEY, kept)
  return photos.length - kept.length
}
