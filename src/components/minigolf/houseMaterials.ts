import {
  BufferAttribute,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  RepeatWrapping,
  SRGBColorSpace,
  type BufferGeometry,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
} from 'three'

/**
 * ARCHITECTURAL MATERIALS FOR THE HOUSE — runtime CanvasTextures + runtime
 * box-projected UVs, applied by material name to the loaded garden.glb.
 *
 * WHY THIS AND NOT BLENDER MATERIALS (the pipeline decision for the whole
 * visual-fidelity phase — passes B-E should follow the same route):
 *
 *  * glTF cannot carry Blender's procedural node graphs. build_environment.py
 *    already documents this the hard way: Noise/Wave/Brick setups export as
 *    the Principled BSDF's untouched default. So "just do it in Blender" is
 *    not on the table without baking.
 *  * Baking to image textures would work but costs real download weight on a
 *    741KB model, and puts a Blender re-bake in the loop for every art tweak.
 *    Brick coursing, roof tiles, timber slats and block paving are all exact
 *    repeating patterns — the worst possible use of a baked bitmap.
 *  * Vertex colours export fine but cannot express a crisp repeating pattern
 *    at all; they are the right tool for soft large-scale variation (a hedge
 *    or a lawn), not for architecture. Reserved for pass B if needed.
 *  * Runtime 2D-canvas textures already have precedent in this exact codebase
 *    (checkerTexture.ts draws the fairway stripes). Zero download weight, zero
 *    Blender round-trip, fully art-directable from TypeScript, and each
 *    pattern costs a few KB of GPU memory because it is a small tile.
 *
 * THE CATCH, AND HOW IT IS SOLVED: garden.glb's meshes carry POSITION and
 * NORMAL only — no TEXCOORD_0 — so `map` alone would render black/undefined.
 * Rather than re-export the GLB with UVs (payload + a Blender step for every
 * future change), UVs are generated here at load time by world-space box
 * projection. That is cheap (the house meshes total ~2k verts), exact for
 * axis-aligned architecture, and it keeps texel density identical on every
 * face regardless of how big the face is.
 *
 * The projection is normal-driven rather than a plain XYZ box map, so it
 * handles the hip roof correctly:
 *   * near-vertical face (|n.y| < 0.5): V is world height, U runs horizontally
 *     along the wall. Brick courses therefore stay level and continue around
 *     corners instead of tumbling.
 *   * sloped/flat face: V runs down the slope (along the horizontal part of
 *     the normal), U along the ridge. Tile courses therefore run parallel to
 *     the ridge on the long slopes AND on the hip ends, with no seam.
 * Blender exports these meshes flat-shaded, i.e. vertices are already split
 * per face, so each vertex belongs to exactly one plane and a per-vertex
 * decision is exact — no smoothing artefacts.
 *
 * ADDRESSABILITY: garden.glb is joined by material (27 meshes for ~240 source
 * objects, each node named `garden_<material>`), so the finest granularity
 * available is "everything sharing a material". That is enough here because
 * the house's materials happen to be house-exclusive — brick_cream,
 * roof_charcoal, glass_blue and wood_slat contain no other geometry. It would
 * NOT be enough to, say, restyle one window: that would need the GLB rebuilt
 * with a separate material. Noted for passes B-E.
 *
 * NOTHING HERE TOUCHES GEOMETRY, TRANSFORMS OR COLLIDERS — only the `uv`
 * attribute (added, never replaced) and material appearance.
 */

// --- tile painters ---------------------------------------------------------
// Each returns a small seamless tile. Sizes are powers of two so mipmapping
// stays clean at the shallow grazing angles the game camera looks at the roof
// and the driveway from.

function canvas(w: number, h: number) {
  const el = document.createElement('canvas')
  el.width = w
  el.height = h
  return [el, el.getContext('2d')!] as const
}

function finish(el: HTMLCanvasElement, clampV = false) {
  const tex = new CanvasTexture(el)
  tex.wrapS = RepeatWrapping
  tex.wrapT = clampV ? ClampToEdgeWrapping : RepeatWrapping
  // The tile is authored by eye in sRGB, so it must be declared as sRGB or
  // three would upload it as linear and every surface would come out a stop
  // too bright — the exact failure the flat/NoToneMapping setup would hide
  // until side-by-side with House/course layout.png.
  tex.colorSpace = SRGBColorSpace
  // Roof and driveway are seen at very shallow angles from the game camera;
  // without this the tile courses smear into flat grey at the far end.
  // Clamped to the device max by three at upload time.
  tex.anisotropy = 8
  return tex
}

/**
 * Danish light brick, running bond: 4 bricks x 8 courses over 0.96 x 0.53 m.
 *
 * VALUES ARE AUTHORED IN sRGB, WHICH IS NOT THE SAME SCALE AS THE glTF
 * BASE-COLOUR FACTORS THEY REPLACE. A glTF baseColorFactor is *linear*, but a
 * `map` declared SRGBColorSpace is linearised on upload, so "the same number"
 * in hex is far darker than the old factor: brick_cream's 0.84/0.77/0.63 is
 * #edE3d1-ish in sRGB, not #d6c4a1. Round 1 of this pass got that wrong on the
 * roof and rendered it near-black. Every tile below is therefore authored
 * against the LINEAR target, then converted — do not "correct" these hexes to
 * look right in a colour picker.
 * Target here: linear ~(0.63, 0.51, 0.31) — deliberately warmer and a touch
 * deeper than the original factor, which washed out to grey-white under this
 * scene's hemisphere+sun rig (the "warm brick, not grey" note for this pass).
 */
function paintBrick() {
  const [el, ctx] = canvas(256, 128)
  const bw = 64
  const bh = 16
  ctx.fillStyle = '#ded3ba' // mortar
  ctx.fillRect(0, 0, 256, 128)
  const tones = ['#cbb790', '#d3c09c', '#c5b088', '#d7c5a3', '#cdba95']
  for (let row = 0; row < 8; row++) {
    const offset = row % 2 === 0 ? 0 : bw / 2
    for (let col = -1; col < 4; col++) {
      const x = col * bw + offset
      ctx.fillStyle = tones[(row * 7 + col * 3 + 35) % tones.length]
      ctx.fillRect(x + 1, row * bh + 1.5, bw - 2, bh - 3)
    }
  }
  return finish(el)
}

/**
 * Dark profiled concrete roof tile — the single biggest fidelity gap on the
 * house, which reads as one flat charcoal slab without this. 2 tiles across x
 * 1 course down, over 0.66 x 0.40 m, matching the real roof in House/*.JPG.
 * V runs DOWN the slope, so a course boundary is a horizontal line here.
 */
function paintRoofTile() {
  // Two courses per tile rather than one, so alternate courses can carry a
  // slightly different tone. With a single course the roof came out as a
  // perfectly regular corduroy, which reads as machined metal decking; real
  // tile has a little course-to-course drift.
  const [el, ctx] = canvas(128, 192)
  // VISUAL PASS F — the roof was still reading too light beside the brick.
  //
  // Measured off the live render, the lit field came out around #666b74
  // (linear luminance 0.146). course layout.png's roof measures #737082 /
  // #67647b in its lit areas — NOMINALLY brighter than ours. So the problem
  // was never the base value: it was that the reference gets its weight from
  // deep, high-contrast shadow BETWEEN big barrel tiles, while ours was a
  // nearly flat field with a hairline course mark. A flat mid-grey plane reads
  // lighter than a strongly modelled one at the same mean value.
  //
  // So the field is darkened by roughly a third AND the course shadow is
  // deepened and widened, which is what actually makes it read as charcoal
  // tile. Detail goes UP, not down — the brief explicitly rules out crushing
  // it to featureless black, and the lit lip is kept bright enough that every
  // course still catches the sun.
  //
  // The hue also loses most of its blue. Ours was a slate-blue #787c86
  // (b - r = 14); the reference is a warmer graphite (#737082, b - r = 13 but
  // at a much lower saturation relative to its value). At our new darker
  // value the same blue delta reads as cold plastic, so it is halved.
  //
  // Calibrated, not guessed. Region medians of linear luminance over the main
  // sunlit slope: before this pass 0.136, course layout.png 0.112. The first
  // attempt landed on 0.077 — past the reference and into the "crushed to
  // featureless black" the brief rules out — so the field was brought back up
  // about a third and the course shadow eased from #24262b/11px to
  // #2d3036/10px, which also pulls the p90/p10 spread back from 18.0 toward
  // the reference's 9.0.
  for (const [i, tone] of (['#5f6268', '#5a5d64'] as const).entries()) {
    const y0 = i * 96
    const grad = ctx.createLinearGradient(0, y0, 0, y0 + 96)
    grad.addColorStop(0, tone)
    grad.addColorStop(0.7, '#565961')
    grad.addColorStop(1, '#4e5158')
    ctx.fillStyle = grad
    ctx.fillRect(0, y0, 128, 96)
    // Shadow cast by the course above — now 11px rather than 7 and much
    // darker, because this is the detail that carries the whole read.
    ctx.fillStyle = '#2d3036'
    ctx.fillRect(0, y0, 128, 10)
    // The lit lip of this course catching the sun. Kept bright on purpose:
    // it is the only thing preventing the darker field from going flat.
    ctx.fillStyle = '#7e838d'
    ctx.fillRect(0, y0 + 11, 128, 5)
    ctx.fillStyle = '#666a72'
    ctx.fillRect(0, y0 + 16, 128, 3)
  }
  // Vertical roll/rib between tiles. Still deliberately lower contrast than
  // the course lines, so the roof reads as courses of tile rather than as
  // corrugated metal streaked from ridge to eaves.
  for (const x of [0, 64]) {
    ctx.fillStyle = '#383b40'
    ctx.fillRect(x, 0, 3, 192)
    ctx.fillStyle = '#63676e'
    ctx.fillRect(x + 3, 0, 2, 192)
  }
  return finish(el)
}

/** Vertical timber slat screen on the carport, ~95mm boards with a groove. */
function paintSlats() {
  const [el, ctx] = canvas(64, 64)
  ctx.fillStyle = '#bb8b55' // target linear ~(0.50, 0.26, 0.09)
  ctx.fillRect(0, 0, 64, 64)
  for (const x of [0, 32]) {
    ctx.fillStyle = '#78522e' // shadowed gap between boards
    ctx.fillRect(x, 0, 4, 64)
    ctx.fillStyle = '#d1a06a' // lit edge of the next board
    ctx.fillRect(x + 4, 0, 5, 64)
    ctx.fillStyle = '#a5763f' // board falls away toward the far edge
    ctx.fillRect(x + 24, 0, 8, 64)
  }
  // Faint lengthwise grain so a big flat board is not a dead colour field.
  ctx.globalAlpha = 0.12
  ctx.fillStyle = '#8d6231'
  for (let i = 0; i < 10; i++) ctx.fillRect((i * 13) % 64, (i * 7) % 64, 1, 20)
  ctx.globalAlpha = 1
  return finish(el)
}

/** Grey block paving for the drive and paths, stretcher bond, 0.42 x 0.44 m. */
function paintPaving() {
  const [el, ctx] = canvas(128, 128)
  ctx.fillStyle = '#9b978f' // joints
  ctx.fillRect(0, 0, 128, 128)
  const tones = ['#bcb9b3', '#b3b0aa', '#c3c0ba', '#b8b5af']
  for (let row = 0; row < 4; row++) {
    const offset = row % 2 === 0 ? 0 : 32
    for (let col = -1; col < 3; col++) {
      ctx.fillStyle = tones[(row * 3 + col * 5 + 12) % tones.length]
      ctx.fillRect(col * 64 + offset + 1, row * 32 + 1, 62, 30)
    }
  }
  return finish(el)
}

/**
 * Dark hardwood terrace decking — boards running along the house, 0.29 m pitch.
 *
 * VISUAL PASS E. Pass C named this "the single biggest remaining colour
 * difference on the terrace" and correctly could not fix it: `RECIPES.wood_deck`
 * sets `color: '#ffffff'`, so the map is the only thing that decides the deck's
 * colour and no Blender-side `baseColorFactor` can reach it.
 *
 * The complaint was "lighter and more orange than the reference and than the
 * real house". Measured against House/course layout.png, whose deck runs
 * #a06e54 in the open to #6f5349 under the furniture, the value was roughly
 * right but the HUE was the problem: the old field/board pair (#876143 /
 * #96704f) had a red-to-blue spread of 0x44/0x47, i.e. a strongly orange
 * pine-deck, where the reference's is 0x4c and much closer to a red-brown
 * stained hardwood. IMG_1490/IMG_1493 push the same way — the real terrace is
 * near-black stained timber, so of the two errors the orange one is the one
 * both sources agree on.
 *
 * Now authored straight against the reference's two measured values, with the
 * board face at the lit reading and the field a step under it, and everything
 * rotated toward red-brown. Divided by the rig's ~0.9x, so it reproduces those
 * hexes rather than landing a step below them.
 */
function paintDeck() {
  const [el, ctx] = canvas(64, 64)
  ctx.fillStyle = '#7e5949' // target linear ~(0.21, 0.098, 0.068)
  ctx.fillRect(0, 0, 64, 64)
  for (const x of [0, 32]) {
    ctx.fillStyle = '#4b3229' // gap between boards
    ctx.fillRect(x, 0, 3, 64)
    ctx.fillStyle = '#a2705a' // board face — the reference's lit deck reading
    ctx.fillRect(x + 3, 0, 26, 64)
    ctx.globalAlpha = 0.2
    ctx.fillStyle = '#583a30'
    ctx.fillRect(x + 8, 0, 2, 64)
    ctx.fillRect(x + 20, 0, 3, 64)
    ctx.globalAlpha = 1
  }
  return finish(el)
}

/**
 * Sunroom glazing. There is no environment map in this scene (deliberate — see
 * MinigolfCanvas), so a dark low-roughness surface would just go flat black
 * with one specular dot. Instead the glass gets a painted vertical gradient
 * standing in for a sky reflection: bright at the head, dark at the cill where
 * you see into the room. Stretched once over the glass's own height rather
 * than tiled, so it always lands the same way up.
 */
function paintGlass() {
  const [el, ctx] = canvas(8, 128)
  const grad = ctx.createLinearGradient(0, 0, 0, 128)
  // Values sit deliberately ABOVE trim_black: the frames around these panes
  // are near-black, so a dark-tinted glass merges with them into one black
  // band and the "large garden-facing glazing" reads as a hole in the wall.
  // The pane has to stay lighter than its own frame for the wing to read as
  // glazed at all from the game camera.
  // …but not so light that it out-values the brick. In House/course layout.png
  // the sunroom glazing is clearly DARKER than the wall it sits in, with only
  // the head catching sky; an earlier take that read lighter than the brick
  // turned the wing into a white stripe.
  //
  // ORIENTATION, and this is a bug fix — the stops used to be written in the
  // opposite order with the comment "V=0 is the bottom", and the gradient
  // therefore rendered UPSIDE DOWN for the whole of passes A–E. `finish()`
  // does not touch `flipY`, and `CanvasTexture` defaults it to true, so the
  // texture is flipped on upload: V=0 samples the canvas's LAST row and V=1
  // its first. `projectUv(normalizedV)` puts V=0 at the pane's cill, so
  // gradient stop 1 lands at the cill and stop 0 at the head. On the punched
  // windows (0.9–1.75 m tall) that only made them a bit bottom-heavy and it
  // went unnoticed; on the sunroom's 4.4 x 1.55 m band it put the palest
  // value along the bottom edge, right against the pale stone kerb, and the
  // wing washed out into exactly the "white stripe" this comment warns about.
  // The stops below are therefore ordered canvas-top-first = pane-HEAD-first.
  // If anyone ever sets `flipY = false`, reverse them again.
  //
  // VALUES. Measured against the sunroom crop of House/course layout.png,
  // where the glazing sits at 0.22-0.39 of the lit brick's luminance and is
  // almost flat top-to-bottom. The pre-existing stops ran to #b8d8e8, which
  // on a 0.9 m punched window was one bright corner and on the wing's 4.4 m
  // band became a lit stripe at 0.68 of the brick running the full width of
  // the elevation — the "white stripe" failure, just rotated. Flattened and
  // pulled down so the lit part of the band lands at 0.40-0.50 of the brick
  // and the cill at ~0.30, while still staying clear of trim_black.
  grad.addColorStop(0, '#88a5b3') // head, catching the sky (canvas top -> V=1)
  grad.addColorStop(0.32, '#6b8794')
  grad.addColorStop(0.66, '#546c78')
  grad.addColorStop(1, '#3f535c') // cill / room interior (canvas bottom -> V=0)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 8, 128)
  return finish(el, true)
}

// --- world-space UV projection --------------------------------------------

/**
 * Writes a `uv` attribute derived from world position + face normal. See the
 * file header for why this exists and how the wall/slope split works.
 * `normalizedV` instead stretches V once across the mesh's own Y extent, for
 * the glazing gradient.
 */
function projectUv(
  geometry: BufferGeometry,
  ox: number,
  oy: number,
  oz: number,
  tileU: number,
  tileV: number,
  normalizedV: boolean,
) {
  const pos = geometry.getAttribute('position')
  const nor = geometry.getAttribute('normal')
  if (!pos || !nor) return
  const uv = new Float32Array(pos.count * 2)

  let yMin = Infinity
  let yMax = -Infinity
  if (normalizedV) {
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      if (y < yMin) yMin = y
      if (y > yMax) yMax = y
    }
  }
  const ySpan = yMax - yMin || 1
  /** Angular quantum for the projection basis — see the MOIRE FIX below. */
  const SNAP = (Math.PI * 2) / 64

  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i) + ox
    const py = pos.getY(i) + oy
    const pz = pos.getZ(i) + oz
    const ny = nor.getY(i)
    let hx = nor.getX(i)
    let hz = nor.getZ(i)
    const hLen = Math.hypot(hx, hz)

    let u: number
    let v: number
    if (hLen > 1e-4) {
      hx /= hLen
      hz /= hLen
      // Pass F — MOIRE FIX. This basis is built per VERTEX, so on a bevelled,
      // smooth-shaded roof plane the normal drifts a fraction of a degree from
      // one vertex to the next and the projection stops being affine across
      // the face. The result was concentric arc banding right across the main
      // roof slopes, clearly visible in the live capture: the texture appeared
      // to swirl rather than run in straight courses.
      //
      // Snapping the horizontal normal to the nearest 1/64 turn (5.6 degrees)
      // makes every vertex on one planar face agree on the same basis, so the
      // projection is affine again and the courses run straight. Faces that
      // genuinely differ in orientation — the four slopes of a hip roof are
      // 90 degrees apart — keep their own basis, which a single per-mesh
      // average normal would have destroyed.
      const snapped = Math.round(Math.atan2(hz, hx) / SNAP) * SNAP
      hx = Math.cos(snapped)
      hz = Math.sin(snapped)
      // U always runs horizontally along the surface (perpendicular to the
      // normal's horizontal part), for both walls and roof slopes.
      u = -hz * px + hx * pz
      // Vertical face -> V is height. Sloped face -> V runs down the slope.
      v = Math.abs(ny) < 0.5 ? py : hx * px + hz * pz
    } else {
      // Perfectly horizontal (decking, paving, flat roofs).
      u = px
      v = pz
    }

    uv[i * 2] = u / tileU
    uv[i * 2 + 1] = normalizedV ? (pos.getY(i) - yMin) / ySpan : v / tileV
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2))
}

// --- recipes ---------------------------------------------------------------

type Recipe = {
  paint: () => CanvasTexture
  /** World metres covered by one tile, along U and V. */
  tileU: number
  tileV: number
  /** Multiplied with the map. White keeps the painted colour verbatim. */
  color?: string
  roughness?: number
  metalness?: number
  normalizedV?: boolean
}

const RECIPES: Record<string, Recipe> = {
  // Warm light Danish brick. The base colour becomes white because the tile
  // carries the colour now — the old flat 0.84/0.77/0.63 was nominally warm
  // but under this scene's hemisphere+sun rig it washed out to a grey-white
  // slab, which is exactly the "not grey" note on this pass.
  brick_cream: { paint: paintBrick, tileU: 0.96, tileV: 0.53, color: '#ffffff', roughness: 0.88 },
  // tileV covers TWO courses (see paintRoofTile), i.e. 2 x 0.40 m.
  roof_charcoal: { paint: paintRoofTile, tileU: 0.66, tileV: 0.8, color: '#ffffff', roughness: 0.62 },
  wood_slat: { paint: paintSlats, tileU: 0.19, tileV: 1.0, color: '#ffffff', roughness: 0.6 },
  paving_gray: { paint: paintPaving, tileU: 0.42, tileV: 0.44, color: '#ffffff', roughness: 0.9 },
  wood_deck: { paint: paintDeck, tileU: 0.29, tileV: 1.2, color: '#ffffff', roughness: 0.55 },
  glass_blue: {
    paint: paintGlass,
    tileU: 4,
    tileV: 1,
    color: '#ffffff',
    roughness: 0.12,
    metalness: 0.1,
    normalizedV: true,
  },
}

/**
 * Flat-colour-only corrections, for materials that need a different colour but
 * no pattern.
 */
const RECOLOUR: Record<string, { color: string; roughness?: number; metalness?: number }> = {
  // Ridge caps were a light grey (0.42/0.43/0.48) that read as a bright metal
  // capping strip drawn down the middle of the roof — the most conspicuous
  // wrong note on the roof after the missing tiles. On the real house (and in
  // House/course layout.png) the ridge is the same dark tile as the field,
  // only slightly catching the light.
  // Pass F: followed the tiled field down (see paintRoofTile). At #8d929b it
  // was brighter than the new field's LIT LIP, so it went back to reading as a
  // metal capping strip the moment the field darkened.
  roof_ridge: { color: '#666a72', roughness: 0.6 },
  // The sunroom wing's flat roof (x -5.1..-3.15, z -0.8..4.8). It was a hair
  // LIGHTER than the main roof, so it separated from it as a pale slab. Set
  // just below the tiled field's value so it reads as the same building.
  // Pass F: same move, kept just below the tiled field's mean so the wing's
  // flat roof still reads as the same building rather than a pale slab.
  roof_flat_charcoal: { color: '#565961', roughness: 0.65 },

  // ---------------------------------------------------------------------
  // trim_black — THE THIRD REPORT TO FLAG THIS, AND THE ONE THAT FIXES IT.
  //
  // Pass A, pass E and the sunroom-glazing task each named this and each
  // scoped it out. The sunroom task put it best: "the frames read at the same
  // luminance as the glass rather than darker". Measured there: mullion/jamb
  // 0.274 vs glass mid 0.282 on the same elevation — the frames were
  // *indistinguishable in value* from the panes they exist to define, so the
  // window openings had no drawn edge and the whole facade flattened.
  //
  // WHY IT WAS MID-GREY. `trim_black` never had a recipe or a recolour, so
  // what rendered was its raw glTF baseColorFactor, (0.13, 0.13, 0.145)
  // LINEAR — which is sRGB #656569, a mid grey. The name was aspirational.
  //
  // WHAT THE REFERENCE ACTUALLY DOES. Measured off House/course layout.png
  // (relative luminance, linearised — see the colour-space note below):
  //     lit brick .............. 0.64 - 0.68
  //     sunroom head band ...... 0.019 - 0.031      = 0.03 - 0.05 of brick
  //     sunroom mullion/jamb ... 0.035 - 0.056      = 0.05 - 0.09 of brick
  //     eaves fascia ........... 0.039              = 0.06 of brick
  //     roof tile, lit ......... 0.105 - 0.188      = 0.16 - 0.28 of brick
  // So the reference's trim is a genuine near-black: about a THIRD of the
  // roof tile's value and under a tenth of the brick's. Ours rendered at
  // 0.162 of the brick — 2-3x too bright, and level with the roof.
  //
  // THE NUMBER, AND THE SECOND TONE-MAPPING TRAP THIS FILE HAS NOW HIT.
  // "NeutralToneMapping is the identity below 0.76 linear" (the comment in
  // MinigolfCanvas.tsx) is only true of the HIGHLIGHT half of the Khronos PBR
  // Neutral curve. It also has a black offset toe: for the darkest channel
  // x < 0.08 it subtracts `x - 6.25x²`, so what survives is ~6.25x², i.e.
  // output goes as roughly the SQUARE of input down here. Measured on this
  // very material — albedo Y 0.131 renders at 0.0633, albedo Y 0.0504 renders
  // at 0.0111 — a log-log slope of 1.82, not 1.0. So a first pass authored by
  // straight-line reasoning (albedo x0.40 for render x0.40) landed at 0.032 of
  // the brick, under the reference's whole band. Anything darkened in this
  // scene must budget for that exponent.
  //
  // The value below was chosen by rendering four candidates at the wing
  // camera and measuring the mullions and the eaves fascia against the lit
  // brick pier (which renders at Y 0.3257, sRGB #ab996e):
  //     #3f3f45 -> 0.032 / 0.036   under the reference band
  //     #454550 -> 0.048 / 0.051   low edge
  //     #4a4a51 -> 0.060 / 0.065   <- reference mullion 0.05-0.09, fascia 0.06
  //     #50505a -> 0.082 / 0.088   high edge
  // #4a4a51 is linear (0.0685, 0.0685, 0.0823), albedo Y 0.0695 against the
  // old 0.1311 — a 0.53x albedo that buys a 0.31x render. The slight blue
  // lean of the original is kept: the reference's trim is a cool charcoal
  // (#36333d, #3d3839), not a neutral black. `roughness` is left at 0.35;
  // no blown specular appeared on the fascia at any candidate value.
  //
  // COLOUR SPACE, since this project has been bitten twice: `new Color(hex)`
  // treats the hex as sRGB and linearises it, so #4a4a51 here means what a
  // colour picker says. The value it REPLACES, (0.13, 0.13, 0.145), is raw
  // linear from glTF — which is sRGB #65656a, so the change is #65656a ->
  // #4a4a51 in picker terms and 0.1311 -> 0.0695 in albedo luminance. Never
  // paste a linear factor in here as a hex. build_environment.py's MAT_TRIM
  // is mirrored to `srgb("#4a4a51")` so a future Blender run agrees, at which
  // point this override becomes a no-op instead of a fight.
  //
  // NOT SPLIT INTO A SECOND MATERIAL, and this is a deliberate call against
  // pass A's note. Pass A recorded trim_black as spanning world x -16.5..29.6
  // and bundling the neighbours' trim with the house's. That is now STALE:
  // pass D moved every background building onto its own distant_bg /
  // distant_roof / distant_window materials. Dumping garden.glb today gives
  // `garden_trim_black` a world AABB of x -8.5..-3.2, z -13.3..8.3 — the
  // house footprint and nothing else. Its members are window and door
  // surrounds, mullions, the slat-screen grooves, the house and carport eaves
  // fascias, the terrace screen's board lines, the fire-pit rim and the car's
  // wheels. Every one of those wants to be near-black. A split would have
  // cost a 28th mesh and draw call, and a new material name inherits no
  // recipe here (this map is keyed by name), to buy separation from
  // neighbours that no longer share the material.
  trim_black: { color: '#4a4a51' },

  // ---------------------------------------------------------------------
  // SCENE PALETTE — VISUAL PASS E. Everything below this line is new.
  //
  // WHY IT IS HERE AND NOT IN build_environment.py
  //
  // Passes B, C and D each closed by saying the palette was too pale and that
  // the lighting rig was the limiting factor, so each of them deliberately
  // stopped short of darkening their own materials. They were half right. The
  // rig was over-ambient (fixed in MinigolfCanvas.tsx), but the greens are
  // ALSO wrong at source, and no rig can fix a hue.
  //
  // Dumping garden.glb's baseColorFactors and converting them to sRGB shows
  // what the player is actually looking at, because the rig renders a lit
  // surface at ~0.9x its albedo. A sample:
  //     hedge          -> #79d16b        canopy_lime  -> #d1ff8b
  //     lawn_green     -> #a2e57c        shrub_light  -> #bef694
  //     foliage_light  -> #ade78b        green_pad    -> #b6ef95
  // Every one of those is a pale mint. House/course layout.png's equivalents,
  // measured: fairway #84bd23, lit hedge crown #778914, hedge flank #405f19,
  // lit canopy #9ec232, shaded canopy #8aac1b. The reference greens are a
  // stop or more darker, MUCH less blue, and pulled toward chartreuse. That
  // difference is the whole "washed-out pale mint" note.
  //
  // Doing it here rather than in Blender: it is a pure colour change, so it
  // costs zero download bytes, needs no GLB rebuild, cannot perturb
  // build_environment.py's global `random` stream (which passes B and C both
  // recorded as a real hazard), and is live-reloadable — which matters because
  // this is the pass that has to be judged in the browser, not in EEVEE. The
  // matching values are mirrored into build_environment.py's material table
  // so a future Blender run produces the same colours and the previews stop
  // misleading; if that run happens, these overrides become no-ops rather than
  // fighting it.
  //
  // COLOUR SPACE, because this file has been burned by it once already:
  // `new Color(hex)` treats the hex as sRGB and linearises it, whereas the
  // glTF baseColorFactor it replaces is raw linear. So the hexes below mean
  // what a colour picker says they mean and can be held straight against
  // course layout.png. Do NOT copy a linear factor in here as a hex.
  //
  // VERTEX COLOURS: glTF COLOR_0 multiplies baseColorFactor, and pass B/C/D
  // baked their lit/shade ramps and pass D's aerial-perspective haze into it.
  // Replacing the factor scales those ramps uniformly, so every relationship
  // they tuned survives — only the base colour moves. Materials marked (vc)
  // below carry one, and their hex is therefore the LIT end, not the average.

  // -- lawn and hedge: the two biggest fields in the frame ----------------
  // (vc) The boundary hedge. Reference lit crown #778914, flank #405f19; the
  // baked ramp spans roughly 0.45..0.97, so authoring the crown here lands the
  // flank close to the reference on its own.
  hedge: { color: '#7fa83e' },
  hedge_far: { color: '#6f9452' }, // (vc) hazier, one step back in depth
  // The garden lawn inside the GLB, which must not separate from the fairway
  // plate — matched to checkerTexture.ts's new pair.
  lawn_green: { color: '#8ac53c' },
  lawn_outer: { color: '#7cae5e' }, // (vc) surround plate; carries pass D's haze ramp
  green_pad: { color: '#93cf46' }, // the putting collar, a shade finer/brighter than the fairway

  // -- shrubs, foliage, canopies ------------------------------------------
  foliage_green: { color: '#5e9439' },
  foliage_light: { color: '#79ae44' },
  shrub_green: { color: '#5f9a3d' }, // (vc) also bush_large/bush_small
  shrub_light: { color: '#7cb449' }, // (vc)
  canopy_deep: { color: '#4d8b4f' }, // (vc)
  canopy_mid: { color: '#6fa845' }, // (vc)
  canopy_olive: { color: '#8dab53' }, // (vc)
  canopy_lime: { color: '#a5c656' }, // (vc) was #d1ff8b — a fully clipped white-green
  // The copper beech. At #c679a2 it was candy pink and the single loudest
  // wrong hue in the frame; the reference's is a deep wine purple.
  canopy_purple: { color: '#8b4a6a' }, // (vc)
  apple_leaf: { color: '#74ad45' }, // (vc) tree_apple.glb
  apple_leaf_light: { color: '#8cc24e' }, // (vc) kept a step above the background canopies, per pass B
  trunk_brown: { color: '#806649' },

  // -- background, per pass D's handover ----------------------------------
  // ROUND 3 lifted every value in this block ~12%. Measured against the
  // reference band for band, the foreground had landed almost exactly right
  // (median 156 vs 166) but the background's dark tail had not: our p10 across
  // the treeline band was 29 against course layout.png's 52. Round 1 had
  // over-corrected here — the reference's distance is lighter and airier than
  // its foreground, which is the aerial perspective doing its job, and pulling
  // the canopies down to foreground darkness turned the whole top of the frame
  // into one dark wall.
  // (vc, haze ramp) Pass D reported the neighbours "cooler and greyer than the
  // reference's cream" and predicted they would land once the rig stopped
  // pulling blue. The warm sun in MinigolfCanvas.tsx does most of that; this
  // takes the last of the neutrality out of the base so the ramp's warm near
  // end has somewhere to go.
  // Pass F — BACKGROUND RESTRAINT. The neighbours' walls measured #c2d7e9 in
  // the live render against the sky's own #a2ccf0: brighter than the sky they
  // sit in front of, which is why they pulled the eye. course layout.png's
  // equivalents measure #b9afb4 — a touch DARKER than its sky and noticeably
  // less saturated. Pulled down and desaturated to sit behind the sky rather
  // than in front of it, which is what atmospheric distance actually does.
  // Scale, geometry and hedge height are untouched: the camera is locked and
  // regrowing the hedge to hide them was already rejected.
  distant_bg: { color: '#cfcdc6' },
  // Pass D's haze ramp multiplies this down hard on the nearest houses
  // (their COLOR_0 is ~0.43), so it has to sit higher than it looks: at
  // #8e9096 the near rank rendered as near-black caps once the ambient came
  // down, which reinstated exactly the 'dark slab' silhouette pass D fixed.
  // Pass F: the neighbours' roofs were LIGHTER than our own roof even before
  // ours was darkened, so they read as the nearest bright objects in frame.
  // Now well below the sky and far below our brick.
  distant_roof: { color: '#8d8b8a' }, // was #adafb2, and #a2a8b1 before that
  // Pass F: window detail is the single loudest cue that a background building
  // is "close". Dropped toward its wall value so the neighbours read as massing
  // rather than as buildings with readable facades.
  distant_window: { color: '#6d6f74' }, // was #7d7f86
  skyline_near_a: { color: '#7eb164' }, // (vc)
  skyline_near_b: { color: '#6b9959' }, // (vc)
  skyline_mid: { color: '#8db476' }, // (vc)
  skyline_far: { color: '#9db594' }, // (vc) stays pale on purpose — this is the haze layer

  // -- odds and ends ------------------------------------------------------
  // Pass A: "still near-white and reads as bright pillars", left alone because
  // it could not tell what the geometry was. It is the carport frontage, and
  // in the reference those posts are painted white but sit in shade under a
  // deep roof; the fix that survives either reading is to stop them being the
  // brightest object in the frame.
  post_white: { color: '#ded8cc' },
  sign_board: { color: '#4a7a4a' },
}

const textureCache = new Map<string, CanvasTexture>()

function textureFor(name: string, recipe: Recipe) {
  let tex = textureCache.get(name)
  if (!tex) {
    tex = recipe.paint()
    textureCache.set(name, tex)
  }
  return tex
}

/**
 * Applies the recipes above to every mesh in `root` whose material matches by
 * name. Idempotent: safe to call on every mount/clone, because glTF materials
 * and geometries are shared by reference between clones and each one is
 * flagged once it has been styled.
 *
 * Purely cosmetic — no geometry, transform, collider or gameplay state is
 * touched.
 */
export function applyHouseMaterials(root: Object3D) {
  root.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    const material = mesh.material as MeshStandardMaterial
    if (!material || Array.isArray(mesh.material)) return

    const recolour = RECOLOUR[material.name]
    if (recolour && !material.userData.houseStyled) {
      material.userData.houseStyled = true
      material.color = new Color(recolour.color)
      if (recolour.roughness !== undefined) material.roughness = recolour.roughness
      if (recolour.metalness !== undefined) material.metalness = recolour.metalness
      material.needsUpdate = true
      return
    }

    const recipe = RECIPES[material.name]
    if (!recipe) return

    // UVs live on the geometry, which is shared across clones — generate once.
    if (!mesh.geometry.getAttribute('uv')) {
      // These nodes are direct children of the glTF scene root with a
      // translation and no rotation/scale, so local + position is already the
      // world position; that keeps the pattern phase-locked between meshes.
      projectUv(
        mesh.geometry,
        mesh.position.x,
        mesh.position.y,
        mesh.position.z,
        recipe.tileU,
        recipe.tileV,
        recipe.normalizedV === true,
      )
    }

    if (material.userData.houseStyled) return
    material.userData.houseStyled = true
    material.map = textureFor(material.name, recipe)
    if (recipe.color) material.color = new Color(recipe.color)
    if (recipe.roughness !== undefined) material.roughness = recipe.roughness
    if (recipe.metalness !== undefined) material.metalness = recipe.metalness
    material.needsUpdate = true
  })
}
