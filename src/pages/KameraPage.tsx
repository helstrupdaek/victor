import { Camera } from 'lucide-react'
import type { ChangeEvent, FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { Input } from '@/components/FormControls'
import { Polaroid } from '@/components/Polaroid'
import { fetchGuestCameraEnabled } from '@/lib/api/guestCameraSettings'
import { GuestCameraOff, resizeForUpload, saveGuestCaption, uploadGuestPhoto } from '@/lib/guestCamera'

/**
 * The disposable camera. One screen, held in one hand.
 *
 * The camera itself is the phone's: a file input with capture="environment"
 * opens the rear camera directly on iOS Safari and Android Chrome, with no
 * in-page viewfinder to build or maintain. When the OS hands the image back
 * it is shrunk on the phone (guestCamera.ts), sent, and shown as a polaroid
 * with two optional lines under it.
 */
type State =
  | { kind: 'loading' }
  | { kind: 'off' }
  | { kind: 'ready'; error: string | null }
  | { kind: 'uploading'; preview: string; width: number; height: number }
  | { kind: 'caption'; id: string; preview: string; width: number; height: number; saved: boolean; error: string | null }

export function KameraPage() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [caption, setCaption] = useState('')
  const [name, setName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchGuestCameraEnabled()
      .then((enabled) => setState(enabled ? { kind: 'ready', error: null } : { kind: 'off' }))
      .catch(() => setState({ kind: 'off' }))
  }, [])

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setState({ kind: 'ready', error: 'Det skal være et billede.' })
      return
    }
    let preview = ''
    try {
      const resized = await resizeForUpload(file)
      preview = URL.createObjectURL(resized.blob)
      setState({ kind: 'uploading', preview, width: resized.width, height: resized.height })
      const id = await uploadGuestPhoto(resized)
      setCaption('')
      setName('')
      setState({ kind: 'caption', id, preview, width: resized.width, height: resized.height, saved: false, error: null })
    } catch (e) {
      if (preview) URL.revokeObjectURL(preview)
      if (e instanceof GuestCameraOff) setState({ kind: 'off' })
      else setState({ kind: 'ready', error: e instanceof Error ? e.message : 'Noget gik galt. Prøv igen.' })
    }
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    if (state.kind !== 'caption') return
    setIsSaving(true)
    try {
      await saveGuestCaption(state.id, caption, name)
      setState({ ...state, saved: true, error: null })
    } catch (e) {
      setState({ ...state, error: e instanceof Error ? e.message : 'Teksten kunne ikke gemmes. Prøv igen.' })
    } finally {
      setIsSaving(false)
    }
  }

  function reset() {
    if (state.kind === 'caption' || state.kind === 'uploading') URL.revokeObjectURL(state.preview)
    setState({ kind: 'ready', error: null })
  }

  const shutter = (
    <label className="flex cursor-pointer flex-col items-center gap-4">
      <span className="flex h-28 w-28 items-center justify-center rounded-full bg-ink-900 text-cream-50 shadow-card active:scale-95">
        <Camera size={44} aria-hidden />
      </span>
      <span className="text-lg font-medium text-ink-900">Tag et billede</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="sr-only"
        aria-label="Tag et billede"
      />
    </label>
  )

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 px-6 py-10 text-center">
      <p className="text-xs tracking-[0.2em] text-green-700 uppercase">Victors konfirmation</p>

      {state.kind === 'loading' && <p className="text-ink-600">Et øjeblik...</p>}

      {state.kind === 'off' && (
        <>
          <h1 className="font-display text-3xl text-ink-900">Kameraet åbner til festen</h1>
          <p className="text-ink-600">Kom tilbage den 1. maj, så kan du tage billeder her.</p>
        </>
      )}

      {state.kind === 'ready' && (
        <>
          <h1 className="font-display text-3xl text-ink-900">Tag et billede til væggen</h1>
          <p className="text-ink-600">Det dukker op på hjemmesiden med det samme.</p>
          {shutter}
          {state.error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>}
        </>
      )}

      {(state.kind === 'uploading' || state.kind === 'caption') && (
        <div className="w-full max-w-xs">
          <Polaroid
            id={state.kind === 'caption' ? state.id : 'uploading'}
            url={state.preview}
            caption={state.kind === 'caption' && state.saved ? caption || null : null}
            guestName={state.kind === 'caption' && state.saved ? name || null : null}
            width={state.width}
            height={state.height}
            tilted={false}
          />
        </div>
      )}

      {state.kind === 'uploading' && <p className="text-ink-600">Sender billedet...</p>}

      {state.kind === 'caption' && !state.saved && (
        <form onSubmit={handleSave} className="flex w-full max-w-xs flex-col gap-3">
          <p className="text-ink-600">Det er på væggen. Vil du skrive noget under det?</p>
          <Input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={120} placeholder="Skriv noget under billedet" aria-label="Tekst under billedet" />
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="Dit fornavn (valgfrit)" aria-label="Dit fornavn" />
          {state.error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>}
          <div className="flex gap-3">
            <Button type="submit" disabled={isSaving} className="flex-1">{isSaving ? 'Gemmer...' : 'Gem'}</Button>
            <Button type="button" variant="outline" onClick={reset}>Tag et til</Button>
          </div>
        </form>
      )}

      {state.kind === 'caption' && state.saved && (
        <>
          <p className="text-ink-600">Tak! Det hænger på væggen nu.</p>
          <Button onClick={reset}>Tag et til</Button>
        </>
      )}
    </main>
  )
}
