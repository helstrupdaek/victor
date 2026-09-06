import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

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
        // VISUAL PASS E. History: #58ab3f/#479236, brightened to #78cf4e/
        // #63b93f during the visual-integration pass because the fairway was
        // "reading as dark olive". It was not: this texture was missing a
        // colorSpace (see below), so three uploaded it as LINEAR data. #78cf4e
        // interpreted linearly is (0.47, 0.81, 0.31) — an albedo brighter than
        // white paint — and it rendered as pale mint with the two squares only
        // a few units apart in sRGB, which is why "the checkered fairway
        // pattern has almost vanished". Brightening the hexes had made the
        // real problem worse.
        //
        // With the colorSpace declared, these hexes now mean what a colour
        // picker says they mean, and they are matched to House/course
        // layout.png, whose mown squares measure #84bd23 and #8ac726 — a
        // vivid, distinctly yellow-green chartreuse rather than the blue-green
        // we had. Authored ~8% above the reference because the rig renders a
        // lit up-facing surface at ~0.9x its albedo, and with extra blue
        // because the Khronos Neutral curve subtracts a min-channel offset
        // (x - 6.25x^2 below 0.08) before it compresses anything, which pushes
        // saturation UP in exactly this value range: measured, the fairway's
        // blue channel came out of the pipe at 15 against the reference's 35
        // until this was compensated at source.
        ctx.fillStyle = (x + y) % 2 === 0 ? '#93ce3a' : '#7fba34'
        ctx.fillRect(x * cell, y * cell, cell, cell)
      }
    }
    cachedTexture = new CanvasTexture(canvas)
    cachedTexture.wrapS = RepeatWrapping
    cachedTexture.wrapT = RepeatWrapping
    // THE BUG THIS FILE SHIPPED WITH. Texture.colorSpace defaults to
    // NoColorSpace, i.e. "this data is already linear", so an sRGB hex drawn
    // into a canvas is uploaded ~2.2 stops too bright and desaturated. Every
    // other texture in this codebase (houseMaterials.ts's six tiles, pass D's
    // sky) already declares SRGBColorSpace; pass A's report flagged this file
    // as the one inconsistency and left it because its greens had been tuned
    // around the wrong behaviour. Fixed here together with those greens.
    cachedTexture.colorSpace = SRGBColorSpace
  }
  cachedTexture.repeat.set(repeatX, repeatY)
  cachedTexture.needsUpdate = true
  return cachedTexture
}
