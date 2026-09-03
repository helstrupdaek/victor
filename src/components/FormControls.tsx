import type { InputHTMLAttributes, LabelHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('mb-1.5 block text-sm font-medium text-ink-800', className)}
      {...props}
    />
  )
}

const fieldClasses = cn(
  'w-full rounded-xl border border-ink-900/15 bg-cream-50 px-4 py-2.5 text-ink-900',
  'placeholder:text-ink-400 transition-colors focus:border-green-600',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600/30',
)

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClasses, className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldClasses, 'min-h-24 resize-y', className)} {...props} />
}

export function RadioCard({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string
  value: string
  label: string
  defaultChecked?: boolean
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center justify-center rounded-xl border px-4 py-3 text-center',
        'border-ink-900/15 font-medium text-ink-800 transition-colors',
        'has-[:checked]:border-green-700 has-[:checked]:bg-green-50 has-[:checked]:text-green-900',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        required
        className="sr-only"
      />
      {label}
    </label>
  )
}
