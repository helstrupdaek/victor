import type { ChangeEvent } from 'react'
import { useEffect, useState } from 'react'
import {
  deletePhoto,
  fetchAllPhotosAdmin,
  togglePhotoPublished,
  uploadPhoto,
} from '@/lib/api/photos'
import type { Photo } from '@/types'

export function GalleryTab() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [isUploading, setIsUploading] = useState(false)

  function load() {
    fetchAllPhotosAdmin().then(setPhotos)
  }

  useEffect(load, [])

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files || files.length === 0) return
    setIsUploading(true)
    try {
      for (const file of Array.from(files)) {
        await uploadPhoto(file)
      }
      load()
    } finally {
      setIsUploading(false)
      event.target.value = ''
    }
  }

  async function handleDelete(photo: Photo) {
    if (!confirm('Slet dette billede?')) return
    await deletePhoto(photo.id, photo.storage_path)
    load()
  }

  return (
    <div>
      <label className="mb-6 flex w-fit cursor-pointer items-center gap-3 rounded-full bg-ink-900 px-6 py-3 text-sm font-medium text-cream-50">
        {isUploading ? 'Uploader...' : 'Upload billeder'}
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleUpload}
          disabled={isUploading}
          className="hidden"
        />
      </label>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo) => (
          <div key={photo.id} className="overflow-hidden rounded-xl border border-ink-900/10">
            <img src={photo.url} alt={photo.caption ?? ''} className="aspect-square w-full object-cover" />
            <div className="flex items-center justify-between p-2 text-xs">
              <button
                onClick={() => {
                  togglePhotoPublished(photo.id, !photo.is_published).then(load)
                }}
                className={photo.is_published ? 'text-green-700' : 'text-ink-400'}
              >
                {photo.is_published ? 'Offentlig' : 'Skjult'}
              </button>
              <button onClick={() => handleDelete(photo)} className="text-red-700">
                Slet
              </button>
            </div>
          </div>
        ))}
      </div>
      {photos.length === 0 && <p className="text-ink-600">Ingen billeder endnu.</p>}
    </div>
  )
}
