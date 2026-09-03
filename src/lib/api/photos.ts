import { readDemo, writeDemo } from '@/lib/demoStore'
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient'
import type { Photo } from '@/types'

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

export async function fetchPublishedPhotos(): Promise<Photo[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
    if (error) throw error
    return data.map(withPublicUrl)
  }

  const photos = readDemo<Omit<Photo, 'url'>[]>(DEMO_KEY, [])
  return photos.filter((p) => p.is_published).map(withPublicUrl)
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
