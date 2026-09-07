import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  BufferAttribute,
  CanvasTexture,
  ClampToEdgeWrapping,
  Group,
  PlaneGeometry,
  Vector3,
  SRGBColorSpace,
} from 'three'

/**
 * A light aircraft towing a "Victor Konfirmation '27" banner across the sky,
 * as a periodic background Easter egg.
 *
 * Deliberately NOT a gameplay element: it lives outside <Physics>, has no
 * collider, never touches the ball, the camera or OrbitControls, and is a
 * sibling of the scenery rather than a child of anything the player can hit.
 * It is also not a DOM overlay — it is real geometry in the 3D world, so it
 * sits correctly behind the property in depth and moves with the camera when
 * the player orbits.
 */

// --- Flight path -----------------------------------------------------------
// The default camera sits at (9, 10.6, -20.5) and looks at (0.5, 0.4, 2.5)
// (see CAMERA_TARGET in MinigolfCanvas.tsx), i.e. its optical axis points
// mostly +Z and 22.6 degrees down. Everything below is derived from that so
// the crossing is square to the view rather than skewed across it.
//
// Horizontal view direction, normalised: the XZ part of (target - position).
const VIEW_X = -0.347
const VIEW_Z = 0.938
// Screen-horizontal axis: the XZ vector perpendicular to the above, oriented
// so it points to the RIGHT of frame. Travel runs along this, so the plane
// crosses the frame rather than flying into it.
//
// Sign matters, and getting it wrong is what mirrored the banner on the first
// attempt. three.js's screen-right for a camera looking along f is
// cross(f, up), which for this view is (-VIEW_Z, 0, VIEW_X) — the NEGATIVE of
// the obvious perpendicular. With the obvious one, local +X pointed screen-
// LEFT, so the lettering ran right-to-left and the front face pointed away
// from the camera; the visible face was then the U-flipped back face, and the
// text rendered reversed.
const TRAVEL_X = -VIEW_Z
const TRAVEL_Z = VIEW_X

/** Metres ahead of the camera, along its horizontal view direction. */
const PATH_DISTANCE = 110
/**
 * Where in the frame the crossing should sit, as a fraction from the optical
 * axis to the top edge. The altitude is DERIVED from this and from the
 * camera's live pitch, rather than being a fixed height.
 *
 * That is not over-engineering, it is forced by the ball-centric camera. The
 * old overview camera sat 10.6 m up; the new one sits ~3.4 m up and looks down
 * about 18 degrees, which on a 46-degree fov leaves only the top ~11% of the
 * frame above the horizon. A fixed altitude tuned for either camera puts the
 * plane far outside the other's sky band — the first value, 15.5 m above the
 * camera, flew it clean over the top of the frame and it never appeared.
 *
 * 0.92 places it just inside the top edge, which is the only sky there is.
 * 0.86 was tried first and put the crossing level with the background
 * treeline, where the banner kept passing behind trees and lost its middle
 * words — and legibility is the whole point of it. There is no altitude that
 * clears the trees in WORLD terms (they subtend 12 degrees and the frame top
 * is 5), so the fix is to sit as high in the frame as the aircraft's own
 * height allows: at 110 m the plane plus banner subtends about 2.8% of frame
 * height, so a centre 4% from the top clears the edge and clears the trees.
 */
const SKY_FRACTION = 0.92
/**
 * Half-length of the run. At PATH_DISTANCE the 54-degree vertical fov on a
 * ~16:9 canvas is ~165 m wide, so 130 m either side of centre starts and ends
 * the aircraft — and the whole 24 m banner behind it — comfortably outside the
 * frustum on both sides, not merely at its edge.
 */
const PATH_HALF_LENGTH = 130

// --- Timing ----------------------------------------------------------------
/** Seconds from one appearance to the next. */
const CYCLE_SECONDS = 45
/**
 * Seconds for one full run. The visible part is roughly the middle 70% of the
 * path, so a 19 s run reads as a ~13 s on-screen crossing: slow enough to
 * notice the banner, read it, and watch it go.
 */
const FLIGHT_SECONDS = 19
/** Garden first. The plane does not appear the instant the page loads. */
const INITIAL_DELAY_SECONDS = 9
/**
 * requestAnimationFrame stops in a background tab, so the first frame after
 * returning carries a delta of however long the tab was hidden. Clamping it
 * means the aircraft resumes from where it was instead of teleporting across
 * the sky (or skipping a whole cycle) on that one frame.
 */
const MAX_DELTA = 1 / 20

// --- Proportions -----------------------------------------------------------
const BANNER_LENGTH = 24
const BANNER_HEIGHT = 5
/** Leading edge of the banner, in local X, measured back from the aircraft. */
const BANNER_GAP = 8
const BANNER_SEGMENTS = 36
const WAVE_AMPLITUDE = 0.32
const WAVE_LENGTH = 9
const WAVE_SPEED = 1.7

const BANNER_TEXT = "Victor Konfirmation '27"

/**
 * The scene gained distance fog in this pass (see MinigolfCanvas.tsx) to push
 * the neighbouring properties back. The aircraft and its banner opt OUT of it,
 * on every material: at 82 m the fog factor is ~0.4, which would wash the navy
 * lettering toward the sky colour and cost most of its contrast — and the
 * banner being readable is the whole point of it. Opting the aircraft out too
 * keeps the two visually consistent, rather than a crisp banner behind a
 * hazed-out plane.
 */

/**
 * Paints the banner. Runtime CanvasTexture, matching how every other bespoke
 * surface in this scene is made (houseMaterials.ts, checkerTexture.ts, the sky)
 * — no new asset to download, and the text is real texels on real geometry.
 */
function makeBannerTexture(): CanvasTexture {
  const w = 1024
  const h = Math.round((w * BANNER_HEIGHT) / BANNER_LENGTH)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // Off-white fabric with a faint vertical gradient, so it does not read as a
  // flat sticker even before the wave deforms it.
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, '#faf7ef')
  grad.addColorStop(0.55, '#f2eee2')
  grad.addColorStop(1, '#e6e1d3')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  // Sewn hem top and bottom, and the reinforced leading edge the tow line
  // attaches to.
  ctx.fillStyle = '#d8d2c2'
  ctx.fillRect(0, 0, w, 5)
  ctx.fillRect(0, h - 5, w, 5)
  ctx.fillRect(w - 7, 0, 7, h)

  // The text. Drawn LAST so nothing sits over it, and measured so it always
  // fits the fabric regardless of how the string changes.
  ctx.fillStyle = '#1b2a5c'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let size = Math.round(h * 0.52)
  do {
    ctx.font = `700 ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`
    if (ctx.measureText(BANNER_TEXT).width <= w * 0.9) break
    size -= 2
  } while (size > 8)
  ctx.fillText(BANNER_TEXT, w / 2, h * 0.52)

  const tex = new CanvasTexture(canvas)
  // Canvas hexes are sRGB. Without this the banner uploads as linear data and
  // washes out — the exact bug checkerTexture.ts shipped with.
  tex.colorSpace = SRGBColorSpace
  tex.wrapS = ClampToEdgeWrapping
  tex.wrapT = ClampToEdgeWrapping
  return tex
}

export function BannerPlane() {
  const { camera } = useThree()
  const groupRef = useRef<Group>(null)
  // The flight path used to be baked from a fixed camera. <GameCamera> now
  // moves and re-aims every frame, so a baked path would often cross sky the
  // player is not looking at. Instead the path is re-derived from the camera's
  // heading at the MOMENT EACH CROSSING BEGINS, then held fixed for the run —
  // so the crossing is always square to the view, but does not slide around if
  // the player aims mid-crossing.
  const path = useRef({ rise: 6, view: [VIEW_X, VIEW_Z], travel: [TRAVEL_X, TRAVEL_Z], heading: 0 })
  const wasFlying = useRef(false)
  // Starts negative so the first appearance is INITIAL_DELAY_SECONDS away.
  const clock = useRef(-INITIAL_DELAY_SECONDS)

  // ONE texture, unflipped, on BOTH faces. See the note above the two meshes:
  // the 180-degree rotation of the back mesh is itself the mirror correction,
  // so flipping its texture as well double-mirrors it.
  const bannerTexture = useMemo(makeBannerTexture, [])

  // ONE geometry shared by both faces, so a single vertex update animates the
  // sheet on both sides and they can never drift apart.
  const bannerGeometry = useMemo(
    () => new PlaneGeometry(BANNER_LENGTH, BANNER_HEIGHT, BANNER_SEGMENTS, 1),
    [],
  )
  const restPositions = useMemo(
    () => Float32Array.from(bannerGeometry.attributes.position.array),
    [bannerGeometry],
  )

  // Heading is recomputed per crossing in useFrame (see path.current), from
  // the camera's live direction: local +Z faces the CAMERA, so local +X lands
  // on screen-right and the texture's U axis runs left-to-right on screen.
  // That is what makes the text orientation provable rather than empirical —
  // and, with the back face rotated 180 degrees, correct from either side no
  // matter where <GameCamera> has put the player.

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group) return

    let t = clock.current + Math.min(delta, MAX_DELTA)
    if (t > CYCLE_SECONDS) t -= CYCLE_SECONDS
    clock.current = t

    // Absent between crossings — genuinely not rendered, not parked offscreen.
    if (t < 0 || t > FLIGHT_SECONDS) {
      group.visible = false
      wasFlying.current = false
      return
    }
    if (!wasFlying.current) {
      // Crossing starts: snapshot the camera's horizontal heading and build
      // this run's path from it.
      wasFlying.current = true
      const f = camera.getWorldDirection(new Vector3())
      const len = Math.hypot(f.x, f.z) || 1
      const vx = f.x / len
      const vz = f.z / len
      // Altitude from the camera's actual pitch: put the crossing SKY_FRACTION
      // of the way from the optical axis to the top of the frame.
      const halfFovV = (((camera as { fov?: number }).fov ?? 46) * Math.PI) / 360
      const axisElev = Math.asin(Math.max(-1, Math.min(1, f.y)))
      path.current = {
        rise: PATH_DISTANCE * Math.tan(axisElev + SKY_FRACTION * halfFovV),
        view: [vx, vz],
        // Screen-right is cross(forward, up) = (-vz, 0, vx). Local +X follows
        // it, which is what keeps the lettering running left-to-right.
        travel: [-vz, vx],
        heading: Math.atan2(-vx, -vz),
      }
    }
    group.visible = true

    const progress = t / FLIGHT_SECONDS
    const along = -PATH_HALF_LENGTH + progress * PATH_HALF_LENGTH * 2
    const [vx, vz] = path.current.view
    const [tx, tz] = path.current.travel
    const centreX = camera.position.x + vx * PATH_DISTANCE
    const centreZ = camera.position.z + vz * PATH_DISTANCE
    group.position.set(
      centreX + tx * along,
      // A very slight rise and fall over the run, so it is not a perfectly
      // ruled line across the sky.
      camera.position.y + path.current.rise + Math.sin(progress * Math.PI) * 0.55,
      centreZ + tz * along,
    )
    group.rotation.y = path.current.heading
    // Subtle bank and nose attitude only — a tow plane flies flat and slow.
    group.rotation.z = Math.sin(t * 0.42) * 0.045
    group.rotation.x = -0.02

    // Travelling wave down the fabric, anchored at the towed (leading) edge and
    // loosest at the free end.
    const pos = bannerGeometry.attributes.position as BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = restPositions[i * 3]
      // local +X is forward, so the leading edge is at +BANNER_LENGTH/2.
      const slack = (BANNER_LENGTH / 2 - x) / BANNER_LENGTH
      pos.setZ(i, Math.sin((x / WAVE_LENGTH) * Math.PI * 2 - t * WAVE_SPEED) * WAVE_AMPLITUDE * slack)
    }
    pos.needsUpdate = true
  })

  return (
    // No <RigidBody>, no collider, nothing physical: this group is a sibling of
    // the physics world, not part of it.
    <group ref={groupRef} visible={false}>
      {/* --- Aircraft. Low-poly primitives rather than a downloaded model:
          at this distance it reads as a high-wing light aircraft from its
          silhouette alone, and it adds nothing to the payload. --- */}
      <group position={[0, 0, 0]}>
        {/* Fuselage, nose at local +X. */}
        <mesh rotation={[0, 0, -Math.PI / 2]}>
          <capsuleGeometry args={[0.55, 4.2, 4, 10]} />
          <meshStandardMaterial fog={false} color="#f4f2ed" roughness={0.5} />
        </mesh>
        {/* Cowling / spinner. */}
        <mesh position={[3.1, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.5, 1.0, 10]} />
          <meshStandardMaterial fog={false} color="#c8483a" roughness={0.45} />
        </mesh>
        {/* Cabin glazing. */}
        <mesh position={[0.9, 0.42, 0]}>
          <boxGeometry args={[1.9, 0.55, 1.02]} />
          <meshStandardMaterial fog={false} color="#2f3a48" roughness={0.25} metalness={0.2} />
        </mesh>
        {/* High wing, spanning local Z. */}
        <mesh position={[0.5, 0.78, 0]}>
          <boxGeometry args={[1.7, 0.16, 9.2]} />
          <meshStandardMaterial fog={false} color="#f4f2ed" roughness={0.5} />
        </mesh>
        {/* Wing struts. */}
        {[-1.9, 1.9].map((z) => (
          <mesh key={z} position={[0.5, 0.34, z]} rotation={[0, 0, 0]}>
            <boxGeometry args={[0.12, 0.9, 0.12]} />
            <meshStandardMaterial fog={false} color="#dcd9d2" roughness={0.6} />
          </mesh>
        ))}
        {/* Red cheat line along the fuselage — the one bit of colour that
            makes the silhouette read as an aircraft rather than a white dash. */}
        <mesh position={[0.2, -0.1, 0]}>
          <boxGeometry args={[4.3, 0.22, 1.14]} />
          <meshStandardMaterial fog={false} color="#c8483a" roughness={0.5} />
        </mesh>
        {/* Tailplane and fin. */}
        <mesh position={[-2.5, 0.15, 0]}>
          <boxGeometry args={[1.1, 0.12, 3.4]} />
          <meshStandardMaterial fog={false} color="#f4f2ed" roughness={0.5} />
        </mesh>
        <mesh position={[-2.6, 0.95, 0]}>
          <boxGeometry args={[1.3, 1.5, 0.14]} />
          <meshStandardMaterial fog={false} color="#f4f2ed" roughness={0.5} />
        </mesh>
        {/* Fixed undercarriage — two struts and wheels, enough at this size. */}
        {[-1.0, 1.0].map((z) => (
          <mesh key={z} position={[0.4, -0.75, z]}>
            <boxGeometry args={[0.14, 0.7, 0.14]} />
            <meshStandardMaterial fog={false} color="#3a3f47" roughness={0.7} />
          </mesh>
        ))}
      </group>

      {/* --- Tow line. Visible, and actually spans the gap: it starts at the
          tail and ends on the banner's leading edge. --- */}
      <mesh position={[-(2.9 + (BANNER_GAP - 2.9) / 2), -0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, BANNER_GAP - 2.9, 5]} />
        <meshStandardMaterial fog={false} color="#4a4a48" roughness={0.85} />
      </mesh>

      {/* --- Banner. Two single-sided faces sharing one deforming geometry.
          THE TEXT MUST READ CORRECTLY FROM ANY CAMERA ANGLE, so work through
          why this arrangement does that:

          A DoubleSide plane mirrors from behind, because the same vertex — the
          one carrying u = 1, the "'27" end — sits at local +X, and local +X
          appears on screen-RIGHT from the front but screen-LEFT from behind.

          Rotating a second mesh 180 degrees physically moves that vertex to
          local -X, which from behind appears on screen-RIGHT again. The
          rotation IS the mirror correction, so both faces take the SAME
          unflipped texture. Flipping the back one as well — which is what the
          first version did — mirrors it a second time and puts it right back
          where it started.

          The two faces are coplanar, which would normally z-fight; here it is
          safe, because each is FrontSide and exactly one of them is ever
          unculled from any given side. --- */}
      <group position={[-(BANNER_GAP + BANNER_LENGTH / 2), -0.35, 0]}>
        <mesh geometry={bannerGeometry}>
          <meshBasicMaterial map={bannerTexture} toneMapped={false} fog={false} />
        </mesh>
        <mesh geometry={bannerGeometry} rotation={[0, Math.PI, 0]}>
          <meshBasicMaterial map={bannerTexture} toneMapped={false} fog={false} />
        </mesh>
      </group>
    </group>
  )
}
