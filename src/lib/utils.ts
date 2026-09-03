export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t
}

/** Tiny classnames joiner — avoids pulling in clsx for a one-liner. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

/**
 * Parses "YYYY-MM-DD" as a local date (midnight in the viewer's own
 * timezone) rather than UTC — `new Date(isoString)` parses as UTC, which
 * can display as the wrong calendar day for viewers behind UTC.
 */
export function parseIsoDateLocal(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function formatDanishDateLong(date: Date): string {
  return new Intl.DateTimeFormat('da-DK', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export function scrollToSection(id: string): void {
  const element = document.getElementById(id)
  if (!element) return
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  element.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' })
}

export function daysUntil(date: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24
  const now = new Date()
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((startOfTarget.getTime() - startOfNow.getTime()) / msPerDay)
}
