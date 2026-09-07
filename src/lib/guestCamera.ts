import { fitWithin } from '@/lib/imageFit'

/** The spec's numbers. 2000 px keeps a phone photo well under the 4 MB cap. */
const MAX_SIDE = 2000
const JPEG_QUALITY = 0.85

export class GuestCameraOff extends Error {
  constructor() {
    super('Kameraet er slukket.')
    this.name = 'GuestCameraOff'
  }
}

/**
 * Shrinks the photo ON THE PHONE before it goes anywhere.
 *
 * A modern phone photo is 5–12 MB and Vercel's request-body limit is 4.5 MB,
 * so this is not an optimisation, it is what makes the upload possible at
 * all. Re-encoding through a canvas also drops every EXIF field, including
 * GPS, so a guest's location never leaves their phone.
 *
 * createImageBitmap with imageOrientation: 'from-image' applies the EXIF
 * rotation first, so portrait shots come out upright rather than sideways.
 */
export async function resizeForUpload(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('Billedet kunne ikke læses. Prøv et andet.')
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_SIDE)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Kunne ikke behandle billedet.')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!blob) throw new Error('Kunne ikke behandle billedet.')
  return { blob, width, height }
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null
  return body?.error ?? fallback
}

/** Uploads the resized photo. Resolves to the photo's id for the caption step. */
export async function uploadGuestPhoto(photo: { blob: Blob; width: number; height: number }): Promise<string> {
  let response: Response
  try {
    response = await fetch('/api/photos/guest', {
      method: 'POST',
      headers: {
        // Vercel's Node runtime only exposes req.body as a Buffer for
        // application/octet-stream; for image/jpeg it drains the stream
        // before the handler runs and leaves nothing to read. Sending the
        // body as octet-stream and naming the real type in a header keeps
        // the upload readable in production. See api/photos/guest.ts.
        'Content-Type': 'application/octet-stream',
        'X-Image-Type': 'image/jpeg',
        'X-Image-Width': String(photo.width),
        'X-Image-Height': String(photo.height),
      },
      body: photo.blob,
    })
  } catch {
    throw new Error('Ingen forbindelse. Tjek netværket og prøv igen.')
  }
  if (response.status === 403) throw new GuestCameraOff()
  if (!response.ok) throw new Error(await errorMessage(response, 'Billedet kunne ikke sendes. Prøv igen.'))
  const body = (await response.json()) as { id: string }
  return body.id
}

export async function saveGuestCaption(id: string, caption: string, guestName: string): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/photos/guest', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, caption, guest_name: guestName }),
    })
  } catch {
    throw new Error('Ingen forbindelse. Tjek netværket og prøv igen.')
  }
  if (!response.ok) throw new Error(await errorMessage(response, 'Teksten kunne ikke gemmes. Prøv igen.'))
}
