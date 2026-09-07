import type { ChangeEvent } from 'react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/Button'
import { Input } from '@/components/FormControls'
import { Polaroid } from '@/components/Polaroid'
import { QrCode, downloadQrPng } from '@/components/QrCode'
import {
  fetchGalleryOrder,
  fetchGuestCameraEnabled,
  setGalleryOrder,
  setGuestCameraEnabled,
} from '@/lib/api/guestCameraSettings'
import {
  deleteAllGuestPhotos,
  deletePhoto,
  fetchAllPhotosAdmin,
  setPhotoPinned,
  togglePhotoPublished,
  updatePhotoText,
  uploadPhoto,
} from '@/lib/api/photos'
import type { GalleryDirection, Photo } from '@/types'

/**
 * The hosts' side of the wall: the switch that lets guests upload at all, the
 * order, the QR code to print, and every photo with pin / show / delete and
 * the text editable in place. Everything writes straight to the database.
 */
export function GalleryTab() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [cameraOn, setCameraOn] = useState(false)
  const [order, setOrder] = useState<GalleryDirection>('newest')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const kameraUrl = `${window.location.origin}/kamera`

  function load() {
    Promise.all([fetchAllPhotosAdmin(), fetchGuestCameraEnabled(), fetchGalleryOrder()])
      .then(([rows, enabled, direction]) => {
        setPhotos(rows)
        setCameraOn(enabled)
        setOrder(direction)
        setError(null)
      })
      .catch((e: unknown) => setError(messageOf(e)))
  }

  useEffect(load, [])

  async function guard(action: () => Promise<unknown>) {
    try {
      await action()
      load()
    } catch (e: unknown) {
      setError(messageOf(e))
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files || files.length === 0) return
    setIsUploading(true)
    try {
      for (const file of Array.from(files)) await uploadPhoto(file)
    } catch (e: unknown) {
      setError(messageOf(e))
    } finally {
      // Refresh either way: files uploaded before a failure are on the server and must show.
      load()
      setIsUploading(false)
      event.target.value = ''
    }
  }

  const guestCount = photos.filter((p) => p.source === 'guest').length

  return (
    <div>
      {/* Control strip */}
      <div className="mb-8 grid gap-4 rounded-xl border border-ink-900/10 bg-cream-50 p-4 sm:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-4">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={cameraOn}
              onChange={(e) => guard(() => setGuestCameraEnabled(e.target.checked))}
              className="h-5 w-5 accent-ink-900"
              aria-label="Gæstekamera"
            />
            <span className="font-medium text-ink-900">{cameraOn ? 'Kameraet er tændt' : 'Kameraet er slukket'}</span>
            {cameraOn && <span className="text-sm text-green-700">Gæster kan uploade nu</span>}
          </label>
          <label className="flex items-center gap-3 text-sm text-ink-700">
            Rækkefølge
            <select
              value={order}
              onChange={(e) => guard(() => setGalleryOrder(e.target.value as GalleryDirection))}
              className="rounded border border-ink-900/20 bg-white px-2 py-1"
            >
              <option value="newest">Nyeste først</option>
              <option value="oldest">Ældste først</option>
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex w-fit cursor-pointer items-center gap-3 rounded-full bg-ink-900 px-6 py-3 text-sm font-medium text-cream-50">
              {isUploading ? 'Uploader...' : 'Upload billeder'}
              <input type="file" accept="image/*" multiple onChange={handleUpload} disabled={isUploading} className="hidden" />
            </label>
            {guestCount > 0 && (
              <button
                onClick={() => {
                  if (confirm(`Slet alle ${guestCount} gæstebilleder? Det kan ikke fortrydes.`)) guard(deleteAllGuestPhotos)
                }}
                className="text-sm text-red-700 underline"
              >
                Slet alle gæstebilleder ({guestCount})
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <QrCode value={kameraUrl} size={128} className="rounded bg-white p-1" />
          <Button variant="outline" className="!px-4 !py-2 text-sm" onClick={() => downloadQrPng(kameraUrl, 'victor-kamera-qr.png')}>
            Download til print
          </Button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo) => (
          <PhotoCard key={photo.id} photo={photo} onChange={guard} />
        ))}
      </div>
      {photos.length === 0 && <p className="text-ink-600">Ingen billeder endnu.</p>}
    </div>
  )
}

function PhotoCard({ photo, onChange }: { photo: Photo; onChange: (action: () => Promise<unknown>) => void }) {
  const [caption, setCaption] = useState(photo.caption ?? '')
  const [name, setName] = useState(photo.guest_name ?? '')
  useEffect(() => { setCaption(photo.caption ?? ''); setName(photo.guest_name ?? '') }, [photo.caption, photo.guest_name])

  function saveText() {
    if (caption === (photo.caption ?? '') && name === (photo.guest_name ?? '')) return
    onChange(() => updatePhotoText(photo.id, { caption: caption.trim() || null, guest_name: name.trim() || null }))
  }

  return (
    <div className={photo.is_published ? '' : 'opacity-50'}>
      <Polaroid id={photo.id} url={photo.url} caption={photo.caption} guestName={photo.guest_name} width={photo.width} height={photo.height} tilted={false} />
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className={photo.source === 'guest' ? 'rounded bg-green-100 px-1.5 py-0.5 text-green-800' : 'rounded bg-ink-900/[0.06] px-1.5 py-0.5 text-ink-600'}>
          {photo.source === 'guest' ? 'Gæst' : 'Jer'}
        </span>
        <span className="text-ink-400">{new Date(photo.created_at).toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div className="mt-2 flex flex-col gap-1">
        <Input value={caption} onChange={(e) => setCaption(e.target.value)} onBlur={saveText} maxLength={120} placeholder="Tekst" aria-label="Tekst" className="!py-1 text-sm" />
        <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveText} maxLength={30} placeholder="Navn" aria-label="Navn" className="!py-1 text-sm" />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <button onClick={() => onChange(() => setPhotoPinned(photo.id, !photo.is_pinned))} className={photo.is_pinned ? 'text-amber-600' : 'text-ink-400'} aria-pressed={photo.is_pinned} aria-label={photo.is_pinned ? 'Fjern fra toppen' : 'Sæt øverst'}>
          {photo.is_pinned ? '★ Øverst' : '☆ Sæt øverst'}
        </button>
        <button onClick={() => onChange(() => togglePhotoPublished(photo.id, !photo.is_published))} className={photo.is_published ? 'text-green-700' : 'text-ink-400'}>
          {photo.is_published ? 'Offentlig' : 'Skjult'}
        </button>
        <button onClick={() => { if (confirm('Slet dette billede?')) onChange(() => deletePhoto(photo.id, photo.storage_path)) }} className="text-red-700">
          Slet
        </button>
      </div>
    </div>
  )
}

/** supabase-js rejects with a plain object, not an Error; read its message either way. */
function messageOf(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') return e.message
  return e instanceof Error ? e.message : 'Noget gik galt.'
}
