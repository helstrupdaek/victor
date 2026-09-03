import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAdminSession } from '@/hooks/useAdminSession'
import { isSupabaseConfigured } from '@/lib/supabaseClient'
import { AdminDashboard } from './AdminDashboard'
import { AdminLogin } from './AdminLogin'

function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-100 px-6 text-center text-ink-600">
      {children}
    </div>
  )
}

function DemoModeNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-100 px-6">
      <div className="max-w-md rounded-2xl border border-ink-900/10 bg-cream-50 p-8 text-center shadow-card">
        <h1 className="font-display text-xl text-ink-900">Supabase er ikke forbundet</h1>
        <p className="mt-3 text-sm text-ink-600">
          Admin kræver rigtig autentificering via Supabase. Tilføj{' '}
          <code className="rounded bg-ink-900/5 px-1">VITE_SUPABASE_URL</code> og{' '}
          <code className="rounded bg-ink-900/5 px-1">VITE_SUPABASE_ANON_KEY</code> i{' '}
          <code className="rounded bg-ink-900/5 px-1">.env</code> (se README.md) og opret en
          admin-bruger i Supabase Authentication.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block text-sm font-medium text-green-700 hover:underline"
        >
          ← Tilbage til forsiden
        </Link>
      </div>
    </div>
  )
}

export function AdminPage() {
  const { session, isLoading } = useAdminSession()

  if (!isSupabaseConfigured) return <DemoModeNotice />
  if (isLoading) return <CenteredMessage>Indlæser...</CenteredMessage>
  if (!session) return <AdminLogin />

  return <AdminDashboard />
}
