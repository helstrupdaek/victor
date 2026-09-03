import { Reveal } from '@/components/Reveal'
import { cn } from '@/lib/utils'

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  className,
}: {
  eyebrow?: string
  title: string
  description?: string
  align?: 'left' | 'center'
  className?: string
}) {
  return (
    <Reveal className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
      {eyebrow && (
        <p className="mb-3 text-sm font-medium tracking-[0.18em] text-green-700 uppercase">
          {eyebrow}
        </p>
      )}
      <h2 className="text-balance text-3xl text-ink-900 sm:text-4xl">{title}</h2>
      {description && (
        <p className="mt-4 text-balance text-lg leading-relaxed text-ink-600">{description}</p>
      )}
    </Reveal>
  )
}
