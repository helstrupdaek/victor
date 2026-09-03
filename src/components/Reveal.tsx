import type { ElementType, ReactNode } from 'react'
import { useInViewport } from '@/hooks/useInViewport'
import { cn } from '@/lib/utils'

export function Reveal({
  children,
  className,
  as: Tag = 'div',
  delayMs = 0,
}: {
  children: ReactNode
  className?: string
  as?: ElementType
  delayMs?: number
}) {
  const { ref, isVisible } = useInViewport<HTMLElement>({ once: true, threshold: 0.15 })

  return (
    <Tag
      // `as` makes this component polymorphic, so its concrete DOM element
      // type can't be known statically — safe in practice since every host
      // tag accepts a ref to its own HTMLElement.
      ref={ref as never}
      className={cn(
        'transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none',
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        className,
      )}
      style={{ transitionDelay: isVisible ? `${delayMs}ms` : '0ms' }}
    >
      {children}
    </Tag>
  )
}
