import { CanvasTexture, RepeatWrapping } from 'three'

/**
 * Generates a simple two-tone checkerboard CanvasTexture (mown-lawn stripe
 * look) with no network/asset dependency. Cached so repeated calls (e.g. on
 * remount) don't regenerate the canvas.
 */
let cachedTexture: CanvasTexture | null = null

export function createCheckerTexture(repeatX: number, repeatY: number): CanvasTexture {
  if (!cachedTexture) {
    const size = 64
    const squares = 8
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    const cell = size / squares
    for (let y = 0; y < squares; y++) {
      for (let x = 0; x < squares; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#4a8c3f' : '#3f7a35'
        ctx.fillRect(x * cell, y * cell, cell, cell)
      }
    }
    cachedTexture = new CanvasTexture(canvas)
    cachedTexture.wrapS = RepeatWrapping
    cachedTexture.wrapT = RepeatWrapping
  }
  cachedTexture.repeat.set(repeatX, repeatY)
  cachedTexture.needsUpdate = true
  return cachedTexture
}
