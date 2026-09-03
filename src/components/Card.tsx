import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-ink-900/[0.06] bg-cream-50 p-6 shadow-card',
        'transition-transform duration-300 ease-out',
        className,
      )}
      {...props}
    />
  )
}
