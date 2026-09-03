import { useState } from 'react'

export function useIsTouchDevice(): boolean {
  const [isTouch] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
  )
  return isTouch
}
