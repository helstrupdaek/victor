import { useEffect, useRef, useState } from 'react'

interface UseInViewportOptions extends IntersectionObserverInit {
  /** Once true, stop observing — used for one-shot scroll reveals. */
  once?: boolean
}

export function useInViewport<T extends Element>(options: UseInViewportOptions = {}) {
  const { once, ...observerInit } = options
  const ref = useRef<T | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting)
      if (entry.isIntersecting && once) {
        observer.disconnect()
      }
    }, observerInit)

    observer.observe(el)
    return () => observer.disconnect()
  }, [once])

  return { ref, isVisible }
}
