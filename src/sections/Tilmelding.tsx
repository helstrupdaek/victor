import { useActionState, useState } from 'react'
import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import { Input, Label, RadioCard, Textarea } from '@/components/FormControls'
import { Reveal } from '@/components/Reveal'
import { SectionHeading } from '@/components/SectionHeading'
import { DEFAULT_EVENT_INFO } from '@/data/eventInfo'
import { useSiteSetting } from '@/hooks/useSiteSetting'
import { submitRsvp } from '@/lib/api/guests'
import { sendConfirmationEmail } from '@/lib/api/notify'
import { fetchReservedTitlesByEmail } from '@/lib/api/wishlist'
import { formatDanishDateLong, parseIsoDateLocal } from '@/lib/utils'
import type { EventInfo, GuestSubmission } from '@/types'

interface RsvpFormState {
  status: 'idle' | 'success' | 'error'
  message?: string
  submission?: GuestSubmission
  reservedGiftTitles?: string[]
  emailSent?: boolean
}

const initialState: RsvpFormState = { status: 'idle' }

async function handleSubmit(_previous: RsvpFormState, formData: FormData): Promise<RsvpFormState> {
  const attending = formData.get('attending') === 'yes'
  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const adultsCount = Number(formData.get('adults') ?? 0)
  const childrenCount = Number(formData.get('children') ?? 0)
  const attendeeNames = String(formData.get('attendeeNames') ?? '')
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean)
  const allergies = String(formData.get('allergies') ?? '').trim() || null
  const comment = String(formData.get('comment') ?? '').trim() || null

  const submission: GuestSubmission = {
    name,
    email,
    attending,
    adults_count: Number.isFinite(adultsCount) ? adultsCount : 0,
    children_count: Number.isFinite(childrenCount) ? childrenCount : 0,
    attendee_names: attendeeNames,
    allergies,
    comment,
  }

  try {
    await submitRsvp(submission)

    const [emailSent, reservedGiftTitles] = await Promise.all([
      sendConfirmationEmail(submission.email),
      fetchReservedTitlesByEmail(submission.email).catch(() => []),
    ])

    return { status: 'success', submission, emailSent, reservedGiftTitles }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Der skete en fejl. Prøv igen.',
      submission,
    }
  }
}

export function Tilmelding() {
  const [isEditing, setIsEditing] = useState(false)
  const [state, formAction, isPending] = useActionState(handleSubmit, initialState)
  const { value: event } = useSiteSetting<EventInfo>('event_info', DEFAULT_EVENT_INFO)

  const showConfirmation = state.status === 'success' && !isEditing
  const showForm = !showConfirmation

  return (
    <section id="tilmelding" className="scroll-mt-24 bg-green-50/60 py-24 sm:py-32">
      <Container className="max-w-2xl">
        <SectionHeading
          eyebrow="Tilmelding"
          title="Vi håber, I vil fejre dagen med os"
          description={`Udfyld formularen nedenfor senest ${formatDanishDateLong(parseIsoDateLocal(event.rsvpDeadline))} — det betyder meget for os at vide, hvem der kommer.`}
          align="center"
        />

        {showConfirmation && (
          <Reveal className="mt-12 rounded-2xl border border-green-200 bg-cream-50 p-8 text-center shadow-card">
            <h3 className="font-display text-2xl text-ink-900">
              {state.submission?.attending ? 'Tak for jeres tilmelding!' : 'Tak for beskeden'}
            </h3>
            <p className="mt-3 text-ink-600">
              {state.submission?.attending
                ? 'Vi glæder os til at fejre Victor sammen med jer.'
                : 'Vi vil savne jer, men tak fordi I gav besked.'}
            </p>

            {state.submission?.attending && (
              <div className="mt-6 space-y-1 text-left text-sm text-ink-700">
                <p>
                  <span className="font-medium">{state.submission.adults_count}</span> voksne,{' '}
                  <span className="font-medium">{state.submission.children_count}</span> børn ·{' '}
                  <span className="font-medium">
                    {state.submission.adults_count + state.submission.children_count}
                  </span>{' '}
                  personer i alt
                </p>
                {state.submission.attendee_names.length > 0 && (
                  <p>Deltagere: {state.submission.attendee_names.join(', ')}</p>
                )}
              </div>
            )}

            <div className="mt-6 rounded-xl bg-green-100/60 p-4 text-left text-sm text-ink-700">
              {state.reservedGiftTitles && state.reservedGiftTitles.length > 0 ? (
                <>
                  <p className="font-medium text-ink-900">Reserverede ønsker:</p>
                  <ul className="mt-1 list-inside list-disc">
                    {state.reservedGiftTitles.map((title) => (
                      <li key={title}>{title}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>Du har endnu ikke reserveret en gave fra ønskelisten.</p>
              )}
            </div>

            {state.emailSent === false && (
              <p className="mt-4 text-xs text-ink-400">
                Vi kunne ikke sende en bekræftelsesmail lige nu, men jeres tilmelding er
                registreret.
              </p>
            )}

            <button
              onClick={() => setIsEditing(true)}
              className="mt-5 text-sm font-medium text-green-700 underline underline-offset-4"
            >
              Ret jeres tilmelding
            </button>
          </Reveal>
        )}

        {showForm && (
          <Reveal className="mt-12">
            <form action={formAction} className="space-y-6">
              <fieldset className="grid grid-cols-2 gap-3">
                <legend className="mb-1.5 block text-sm font-medium text-ink-800">
                  Kommer I?
                </legend>
                <RadioCard
                  name="attending"
                  value="yes"
                  label="Vi kommer"
                  defaultChecked={state.submission ? state.submission.attending : false}
                />
                <RadioCard
                  name="attending"
                  value="no"
                  label="Vi kommer desværre ikke"
                  defaultChecked={state.submission ? !state.submission.attending : false}
                />
              </fieldset>

              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <Label htmlFor="name">Navn</Label>
                  <Input
                    id="name"
                    name="name"
                    required
                    autoComplete="name"
                    defaultValue={state.submission?.name}
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    defaultValue={state.submission?.email}
                  />
                </div>
                <div>
                  <Label htmlFor="adults">Antal voksne</Label>
                  <Input
                    id="adults"
                    name="adults"
                    type="number"
                    min={0}
                    defaultValue={state.submission?.adults_count ?? 1}
                  />
                </div>
                <div>
                  <Label htmlFor="children">Antal børn</Label>
                  <Input
                    id="children"
                    name="children"
                    type="number"
                    min={0}
                    defaultValue={state.submission?.children_count ?? 0}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="attendeeNames">Navne på deltagere</Label>
                <Textarea
                  id="attendeeNames"
                  name="attendeeNames"
                  placeholder="Skriv ét navn pr. linje"
                  defaultValue={state.submission?.attendee_names.join('\n')}
                />
              </div>

              <div>
                <Label htmlFor="allergies">Allergier eller særlige kostbehov</Label>
                <Textarea
                  id="allergies"
                  name="allergies"
                  placeholder="Skriv 'ingen', hvis det ikke er relevant"
                  defaultValue={state.submission?.allergies ?? ''}
                />
              </div>

              <div>
                <Label htmlFor="comment">Kommentar</Label>
                <Textarea id="comment" name="comment" defaultValue={state.submission?.comment ?? ''} />
              </div>

              {state.status === 'error' && (
                <p role="alert" className="text-sm text-red-700">
                  {state.message}
                </p>
              )}

              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? 'Sender...' : 'Send tilmelding'}
              </Button>
            </form>
          </Reveal>
        )}
      </Container>
    </section>
  )
}
