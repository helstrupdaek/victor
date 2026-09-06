import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

/**
 * Generates a simple two-tone checkerboard CanvasTexture (mown-lawn stripe
 * look) with no network/asset dependency. Cached so repeated calls (e.g. on
 * remount) don't regenerate the canvas.
 */
let cachedTexture: CanvasTexture | null = null

export function createCheckerTexture(repeatX: number, repeatY: number): CanvasTexture {
  if (!cachedTexture) {
    // VISUAL PASS F — "residential lawn first, playable golf surface second".
    //
    // What was here: a 64px canvas of 8x8 hard-edged squares in #93ce3a and
    // #7fba34. Measured off the live render those came out at #8cc929 and
    // #79b622, a luminance ratio of 1.22 — and against House/course layout.png,
    // whose mown squares measure #8ac926 and #79b923, ratio 1.22. So the
    // CONTRAST was already right; what made it read as a chessboard was the
    // edges. The reference's mowing bands blur into each other over tens of
    // centimetres; ours switched between tones inside a single 8px texel with
    // no transition at all, on a texture stretched so one square covers 2.3 m.
    //
    // Three changes, all edge-and-noise, none of them physics:
    //   1. 4x the resolution, so a soft edge has room to exist at all.
    //   2. The checker is blurred by ~9% of a square before anything else is
    //      drawn on it, which is what a mower actually leaves behind.
    //   3. Tileable mottling on top, at a much finer scale than the squares,
    //      so the surface carries organic variation rather than reading as two
    //      flat fills. This is the part that stops it looking printed.
    //
    // Contrast is reduced too, but only modestly: the brief
    // asks to keep enough tonal information to read terrain and ball movement,
    // and the squares are the only scale cue the open lawn has.
    const size = 256
    const squares = 8
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    const cell = size / squares

    // Same chartreuse family as before (matched to course layout.png), pulled
    // closer together. See the long note in git history for why these hexes
    // mean what a colour picker says: the texture declares SRGBColorSpace.
    // Re-tuned once the ball-centric camera put the player 6 m from the turf
    // rather than 25: at that range the first pass read as flat plastic. Wider
    // again, but still well under the original hard-edged pair — the softness
    // is now doing the work the low contrast was doing before.
    const LIGHT = '#93ce3e'
    const DARK = '#7ab332'

    ctx.fillStyle = LIGHT
    ctx.fillRect(0, 0, size, size)
    // The blur is applied while drawing the dark squares, so the transition is
    // symmetric and the tile still wraps: each square is drawn with its
    // wrap-around neighbours present, so no seam appears at the texture edge.
    ctx.filter = `blur(${(cell * 0.09).toFixed(2)}px)`
    ctx.fillStyle = DARK
    for (let y = -1; y <= squares; y++) {
      for (let x = -1; x <= squares; x++) {
        if ((x + y) % 2 !== 0) continue
        ctx.fillRect(x * cell, y * cell, cell, cell)
      }
    }
    ctx.filter = 'none'

    // Organic mottling. Soft radial blobs at a fifth of the square size, drawn
    // with their eight wrapped copies so the pattern tiles seamlessly, at very
    // low alpha so no individual blob is ever visible as a blob. A fixed
    // sequence (no Math.random) keeps every session identical.
    let seed = 20260906
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    for (let i = 0; i < 260; i++) {
      const cx = rnd() * size
      const cy = rnd() * size
      const r = cell * (0.12 + rnd() * 0.34)
      const light = rnd() > 0.5
      for (const dx of [-size, 0, size]) {
        for (const dy of [-size, 0, size]) {
          const g = ctx.createRadialGradient(cx + dx, cy + dy, 0, cx + dx, cy + dy, r)
          g.addColorStop(0, light ? 'rgba(214,238,150,0.115)' : 'rgba(74,116,30,0.115)')
          g.addColorStop(1, light ? 'rgba(214,238,150,0)' : 'rgba(74,116,30,0)')
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    // A faint mow-stripe grain running with the squares, one direction only.
    // Real mowing leaves directional lay within a band, not just the band.
    ctx.globalAlpha = 0.055
    for (let y = 0; y < size; y += 3) {
      ctx.fillStyle = y % 6 === 0 ? '#d6ee96' : '#4a741e'
      ctx.fillRect(0, y, size, 1)
    }
    ctx.globalAlpha = 1

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
