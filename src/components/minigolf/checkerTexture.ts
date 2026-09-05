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
        // Brightened from #58ab3f/#479236 during the visual-integration pass:
        // against the glTF garden's flat stylized greens the old pair read as
        // a dark olive fairway rather than the vivid mown lawn in
        // House/course layout.png.
        ctx.fillStyle = (x + y) % 2 === 0 ? '#78cf4e' : '#63b93f'
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
