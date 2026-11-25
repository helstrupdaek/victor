import { CanvasTexture, SRGBColorSpace } from 'three'

/**
 * The printed artwork for the 3D pop-up card, painted on 2D canvases at load
 * time: no image downloads, crisp at any size, and every piece in one palette
 * (the site's greens, cream and fairway gold). A seeded random keeps the
 * painterly foliage identical on every visit.
 */

export const PALETTE = {
  cream: '#fbf8f1',
  paperEdge: '#efe8d8',
  ink: '#211f1a',
  green900: '#2c3b26',
  green700: '#4b6244',
  fairway: '#7fae4e',
  fairwayDark: '#6c9a40',
  green: '#93c35c',
  greenLight: '#a9d16f',
  rough: '#5f8a3a',
  sand: '#efe0b8',
  path: '#f3ead3',
  water: '#6fb4d6',
  gold: '#cdaf76',
  flag: '#d0452f',
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!] as const
}

function texture(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** Fine paper grain over whatever is already painted. */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, amount = 0.05) {
  const r = rng(seed)
  for (let i = 0; i < (w * h) / 90; i++) {
    ctx.fillStyle = r() > 0.5 ? `rgba(255,255,255,${amount})` : `rgba(0,0,0,${amount * 0.7})`
    ctx.fillRect(r() * w, r() * h, 1.5, 1.5)
  }
}

/** A clump of painterly foliage: dark core, mid tones, sunlit highlights up-left. */
function foliage(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, seed: number) {
  const r = rng(seed)
  const layers: [string, number, number][] = [
    ['#2f5a24', 0, 1],
    ['#3f7a2c', -0.06, 0.92],
    ['#58993a', -0.12, 0.8],
    ['#7cba4a', -0.2, 0.62],
    ['#a8d468', -0.28, 0.42],
  ]
  for (const [color, shift, scale] of layers) {
    ctx.fillStyle = color
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2
      const d = Math.sqrt(r())
      const x = cx + Math.cos(a) * rx * d * scale + shift * rx
      const y = cy + Math.sin(a) * ry * d * scale + shift * ry
      ctx.beginPath()
      ctx.arc(x, y, (0.16 + r() * 0.16) * rx * scale, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

/** A single big tree cutout, transparent around it. Aspect 1:1.25. */
export function paintTree(seed: number): CanvasTexture {
  const [c, ctx] = canvas(512, 640)
  ctx.strokeStyle = '#7a5a3a'
  ctx.lineCap = 'round'
  ctx.lineWidth = 34
  ctx.beginPath()
  ctx.moveTo(256, 640)
  ctx.bezierCurveTo(250, 560, 270, 470, 246, 330)
  ctx.stroke()
  ctx.lineWidth = 14
  ctx.beginPath()
  ctx.moveTo(250, 440)
  ctx.quadraticCurveTo(320, 380, 350, 300)
  ctx.moveTo(252, 470)
  ctx.quadraticCurveTo(190, 410, 160, 330)
  ctx.stroke()
  foliage(ctx, 256, 250, 220, 200, seed)
  foliage(ctx, 150, 320, 110, 90, seed + 1)
  foliage(ctx, 370, 300, 120, 100, seed + 2)
  return texture(c)
}

/** The far tree line and hills that stand nearest the back panel. Aspect 3:1. */
export function paintTreeline(): CanvasTexture {
  const [c, ctx] = canvas(1536, 512)
  ctx.fillStyle = '#6c9a40'
  ctx.beginPath()
  ctx.moveTo(0, 512)
  ctx.lineTo(0, 330)
  ctx.bezierCurveTo(260, 250, 500, 300, 760, 320)
  ctx.bezierCurveTo(1020, 260, 1300, 250, 1536, 320)
  ctx.lineTo(1536, 512)
  ctx.fill()
  const r = rng(7)
  for (let x = 30; x < 1536; x += 70 + r() * 60) {
    const s = 0.55 + r() * 0.6
    foliage(ctx, x, 300 - s * 60, 80 * s, 95 * s, Math.floor(r() * 1000))
  }
  ctx.fillStyle = '#5f8a3a'
  ctx.fillRect(0, 440, 1536, 72)
  return texture(c)
}

/** A soft paper cloud. Aspect 2:1. */
export function paintCloud(): CanvasTexture {
  const [c, ctx] = canvas(512, 256)
  const puffs: [number, number, number][] = [
    [140, 160, 70],
    [230, 120, 90],
    [330, 140, 78],
    [400, 175, 55],
    [90, 185, 45],
  ]
  ctx.fillStyle = '#ffffff'
  for (const [x, y, rad] of puffs) {
    ctx.beginPath()
    ctx.arc(x, y, rad, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillRect(90, 160, 330, 70)
  ctx.globalCompositeOperation = 'source-atop'
  const g = ctx.createLinearGradient(0, 60, 0, 240)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(1, 'rgba(180,200,215,0.45)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 512, 256)
  return texture(c)
}

/** Inside of the back panel: sky, sun, distant hills and a lake. Aspect 1.6:1. */
export function paintBackPanel(): CanvasTexture {
  const [c, ctx] = canvas(1600, 1000)
  const sky = ctx.createLinearGradient(0, 0, 0, 1000)
  sky.addColorStop(0, '#7fb8e0')
  sky.addColorStop(0.55, '#cfe6f2')
  sky.addColorStop(1, '#f4f1e2')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, 1600, 1000)
  const sun = ctx.createRadialGradient(1260, 220, 10, 1260, 220, 260)
  sun.addColorStop(0, 'rgba(255,240,200,0.95)')
  sun.addColorStop(0.25, 'rgba(255,230,180,0.5)')
  sun.addColorStop(1, 'rgba(255,230,180,0)')
  ctx.fillStyle = sun
  ctx.fillRect(900, 0, 700, 600)
  ctx.fillStyle = '#9fb7a8'
  ctx.beginPath()
  ctx.moveTo(0, 760)
  ctx.bezierCurveTo(250, 520, 420, 560, 600, 650)
  ctx.bezierCurveTo(780, 470, 1000, 470, 1180, 640)
  ctx.bezierCurveTo(1330, 560, 1480, 560, 1600, 660)
  ctx.lineTo(1600, 1000)
  ctx.lineTo(0, 1000)
  ctx.fill()
  ctx.fillStyle = '#8fb07a'
  ctx.beginPath()
  ctx.moveTo(0, 850)
  ctx.bezierCurveTo(300, 700, 640, 760, 900, 820)
  ctx.bezierCurveTo(1150, 740, 1400, 730, 1600, 800)
  ctx.lineTo(1600, 1000)
  ctx.lineTo(0, 1000)
  ctx.fill()
  ctx.fillStyle = PALETTE.water
  ctx.beginPath()
  ctx.ellipse(420, 905, 330, 46, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.fillRect(260, 895, 160, 4)
  ctx.fillRect(480, 912, 110, 3)
  grain(ctx, 1600, 1000, 3)
  return texture(c)
}

/**
 * Top of the base panel: fairway stripes, bunkers, and the cream cart path
 * the buggy drives (an ellipse; see CART in PopupCard3D, which must match).
 */
export function paintBasePanel(cart: { cx: number; cz: number; rx: number; rz: number }, w: number, d: number): CanvasTexture {
  const px = 1024 / w
  const [c, ctx] = canvas(1024, Math.round(d * px))
  const H = c.height
  ctx.fillStyle = PALETTE.rough
  ctx.fillRect(0, 0, 1024, H)
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = i % 2 ? PALETTE.fairway : PALETTE.fairwayDark
    ctx.save()
    ctx.translate(512, H / 2)
    ctx.rotate(-0.35)
    ctx.fillRect(-900 + i * 130, -900, 130, 1800)
    ctx.restore()
  }
  // Darker rough frame so the card edge reads as a printed border.
  ctx.strokeStyle = PALETTE.rough
  ctx.lineWidth = 34
  ctx.strokeRect(0, 0, 1024, H)
  ctx.fillStyle = PALETTE.sand
  for (const [x, y, rx, ry] of [
    [130, H * 0.86, 70, 28],
    [900, H * 0.88, 80, 26],
    [860, H * 0.2, 54, 22],
  ]) {
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, 0.2, 0, Math.PI * 2)
    ctx.fill()
  }
  const toX = (x: number) => (x + w / 2) * px
  const toY = (z: number) => (z + d / 2) * px
  ctx.strokeStyle = PALETTE.path
  ctx.lineWidth = 0.075 * px
  ctx.beginPath()
  ctx.ellipse(toX(cart.cx), toY(cart.cz), cart.rx * px, cart.rz * px, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'
  ctx.lineWidth = 2
  ctx.stroke()
  grain(ctx, 1024, H, 5)
  return texture(c)
}

/** Top of the raised putting green: mown stripes and a lighter collar. */
export function paintGreenTop(): CanvasTexture {
  const [c, ctx] = canvas(1024, 512)
  ctx.fillStyle = PALETTE.green
  ctx.fillRect(0, 0, 1024, 512)
  for (let i = 0; i < 16; i++) {
    if (i % 2) continue
    ctx.fillStyle = PALETTE.greenLight
    ctx.fillRect(i * 64, 0, 64, 512)
  }
  grain(ctx, 1024, 512, 9, 0.04)
  return texture(c)
}

/** The closed card's cover. Aspect 1.6:1 like the back panel. */
export function paintCover(): CanvasTexture {
  const [c, ctx] = canvas(1600, 1000)
  ctx.fillStyle = PALETTE.green900
  ctx.fillRect(0, 0, 1600, 1000)
  ctx.strokeStyle = PALETTE.gold
  ctx.lineWidth = 6
  ctx.strokeRect(48, 48, 1504, 904)
  ctx.lineWidth = 2
  ctx.strokeRect(66, 66, 1468, 868)
  ctx.fillStyle = PALETTE.cream
  ctx.textAlign = 'center'
  ctx.font = '500 44px Inter, Arial, sans-serif'
  ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '18px'
  ctx.fillText('KONFIRMATION', 800, 380)
  ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '24px'
  ctx.font = '500 200px Fraunces, Georgia, serif'
  ctx.fillText('VICTOR', 812, 590)
  ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '6px'
  ctx.fillStyle = PALETTE.gold
  ctx.font = '400 46px Fraunces, Georgia, serif'
  ctx.fillText('1. maj 2027', 800, 700)
  // Tiny flag mark.
  ctx.strokeStyle = PALETTE.gold
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(800, 250)
  ctx.lineTo(800, 160)
  ctx.stroke()
  ctx.fillStyle = PALETTE.gold
  ctx.beginPath()
  ctx.moveTo(800, 160)
  ctx.lineTo(850, 178)
  ctx.lineTo(800, 196)
  ctx.fill()
  grain(ctx, 1600, 1000, 11, 0.03)
  return texture(c)
}

/** One small leaf for the wind. */
export function paintLeaf(): CanvasTexture {
  const [c, ctx] = canvas(64, 64)
  ctx.fillStyle = '#7cba4a'
  ctx.beginPath()
  ctx.moveTo(8, 32)
  ctx.quadraticCurveTo(32, 2, 58, 32)
  ctx.quadraticCurveTo(32, 62, 8, 32)
  ctx.fill()
  ctx.strokeStyle = '#4f8a2e'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(8, 32)
  ctx.lineTo(56, 32)
  ctx.stroke()
  return texture(c)
}
