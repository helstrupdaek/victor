import type { FormEvent } from 'react'
import { useState } from 'react'
import { Button } from '@/components/Button'
import { Input, Label } from '@/components/FormControls'
import { signInAdmin } from '@/lib/api/auth'

export function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)
    try {
      await signInAdmin(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login mislykkedes.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-100 px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-ink-900/10 bg-cream-50 p-8 shadow-card"
      >
        <h1 className="font-display text-2xl text-ink-900">Admin</h1>
        <p className="mt-1 text-sm text-ink-600">Log ind for at administrere sitet.</p>

        <div className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="password">Adgangskode</Label>
            <Input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        )}

        <Button type="submit" disabled={isSubmitting} className="mt-6 w-full">
          {isSubmitting ? 'Logger ind...' : 'Log ind'}
        </Button>
      </form>
    </div>
  )
}
