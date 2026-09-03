import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost'
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-ink-900 text-cream-50 hover:bg-green-900 shadow-card',
  outline:
    'border border-ink-900/20 text-ink-900 hover:border-ink-900/40 hover:bg-ink-900/[0.03]',
  ghost: 'text-ink-900 hover:bg-ink-900/[0.05]',
}

export function Button({ variant = 'primary', className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5',
        'font-medium tracking-wide transition-all duration-200 ease-out',
        'hover:-translate-y-0.5 active:translate-y-0 active:duration-75',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
