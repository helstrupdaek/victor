import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, DoubleSide, Group, Mesh, MeshBasicMaterial, Shape, ShapeGeometry, Vector3 } from 'three'

/**
 * Pull-back aiming indicator, on Open-Golf's visual language: a broad tapered
 * colour ribbon lying on the ground BEHIND the ball for power, and a short run
 * of small white chevrons in FRONT of it for direction.
 *
 * Numbers taken from Open-Golf's own `data/config/game.cfg` rather than
 * guessed (read, not copied — no Open-Golf code is in this project):
 *
 *   aim_green_color      0.2 0.9 0.3      aim_green_power   0.40
 *   aim_yellow_color     0.7 0.8 0.2      aim_yellow_power  0.65
 *   aim_red_color        0.8 0.6 0.1      aim_red_power     0.90
 *   aim_dark_red_color   0.9 0.2 0.1
 *   aim_min_length 100   aim_max_length 420    -> 4.2 : 1 growth
 *   aim_line_min_length 1   aim_line_max_length 4   (world units)
 *   game.aim_line.offset.x += -3 * dt        -> chevrons scroll at 3 u/s
 *
 * Note its "red" (0.8, 0.6, 0.1) is really orange and its "dark red" is the
 * actual red, which is exactly the green -> yellow -> orange -> red ramp asked
 * for. The four are interpolated smoothly at those thresholds rather than
 * switched, matching Open-Golf's own frame-to-frame colour smoothing.
 *
 * PHYSICS: none. No collider, no rigid body, nothing readable by Rapier. It is
 * three unlit meshes that are hidden whenever the player is not dragging.
 */

// Ribbon length in world units at zero and full power. The 4.2:1 ratio is
// Open-Golf's; the absolute size is ours, scaled to a 0.15 m ball.
const ARROW_MIN_LENGTH = 0.62
const ARROW_MAX_LENGTH = 2.6
/** Half-width at the ball end, at the shoulder, and at the flared tail. */
const ARROW_W_NECK = 0.085
const ARROW_W_BODY = 0.2
const ARROW_W_TAIL = 0.235
/** How far the tail's notch cuts back in, as a fraction of length. */
const TAIL_NOTCH = 0.16

const CHEVRON_MIN_RUN = 1.0
const CHEVRON_MAX_RUN = 4.0
const CHEVRON_SPACING = 0.44
const CHEVRON_MAX = 10
const CHEVRON_HALF_WIDTH = 0.15
const CHEVRON_DEPTH = 0.17
const CHEVRON_THICKNESS = 0.075
const CHEVRON_SCROLL = 3.0

/** Ground clearance. Small enough to read as painted on, large enough not to fight. */
const LIFT = 0.028

const STOPS: { at: number; color: Color }[] = [
  { at: 0.0, color: new Color(0.2, 0.9, 0.3) },
  { at: 0.4, color: new Color(0.7, 0.8, 0.2) },
  { at: 0.65, color: new Color(0.8, 0.6, 0.1) },
  { at: 0.9, color: new Color(0.9, 0.2, 0.1) },
  { at: 1.0, color: new Color(0.72, 0.1, 0.06) },
]

function powerColor(t: number, out: Color) {
  const p = Math.min(Math.max(t, 0), 1)
  for (let i = 1; i < STOPS.length; i++) {
    if (p <= STOPS[i].at || i === STOPS.length - 1) {
      const a = STOPS[i - 1]
      const b = STOPS[i]
      const f = b.at === a.at ? 0 : (p - a.at) / (b.at - a.at)
      out.copy(a.color).lerp(b.color, Math.min(Math.max(f, 0), 1))
      return
    }
  }
}

/**
 * The ribbon outline, authored at unit length along +Y so it can be scaled
 * along that axis alone — width then stays constant as power changes, which is
 * what the reference does. Built as a Shape rather than a hand-rolled triangle
 * strip because the silhouette IS the feature: narrow at the ball, swelling
 * through the body, flaring at the tail corners, and cut back by a concave
 * notch between them.
 */
function makeArrowGeometry() {
  const s = new Shape()
  s.moveTo(-ARROW_W_NECK, 0)
  s.bezierCurveTo(-ARROW_W_BODY * 0.9, 0.3, -ARROW_W_BODY, 0.55, -ARROW_W_TAIL, 1)
  s.lineTo(0, 1 - TAIL_NOTCH)
  s.lineTo(ARROW_W_TAIL, 1)
  s.bezierCurveTo(ARROW_W_BODY, 0.55, ARROW_W_BODY * 0.9, 0.3, ARROW_W_NECK, 0)
  s.closePath()
  const g = new ShapeGeometry(s, 20)
  // Author in XY, lie it flat in XZ with +Y mapping to -Z (backwards).
  g.rotateX(Math.PI / 2)
  return g
}

/** One chevron: a constant-thickness V pointing along +Y (forward). */
function makeChevronGeometry() {
  const w = CHEVRON_HALF_WIDTH
  const d = CHEVRON_DEPTH
  const t = CHEVRON_THICKNESS
  const s = new Shape()
  s.moveTo(-w, 0)
  s.lineTo(0, d)
  s.lineTo(w, 0)
  s.lineTo(w, -t)
  s.lineTo(0, d - t)
  s.lineTo(-w, -t)
  s.closePath()
  const g = new ShapeGeometry(s)
  g.rotateX(Math.PI / 2)
  // Forward is -Z in the group's local frame (see AimIndicator), and the shape
  // points along +Y which rotateX sends to -Z. Nothing further needed.
  return g
}

export type AimIndicatorHandle = {
  /** Called every drag frame. `direction` is the unit launch direction. */
  update: (position: Vector3, direction: Vector3, power: number) => void
  hide: () => void
}

export function AimIndicator({ handleRef }: { handleRef: { current: AimIndicatorHandle | null } }) {
  const groupRef = useRef<Group>(null)
  const arrowRef = useRef<Mesh>(null)
  const chevronsRef = useRef<Group>(null)
  const scroll = useRef(0)
  const power = useRef(0)
  const visible = useRef(false)

  const arrowGeometry = useMemo(makeArrowGeometry, [])
  const chevronGeometry = useMemo(makeChevronGeometry, [])
  const arrowMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: new Color(0.2, 0.9, 0.3),
        toneMapped: false,
        transparent: true,
        opacity: 0.94,
        side: DoubleSide,
        // Painted on the ground: it must never z-fight with lawn or paving, and
        // must never write depth over the ball.
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -6,
        polygonOffsetUnits: -6,
      }),
    [],
  )
  const chevronMaterials = useMemo(
    () =>
      Array.from({ length: CHEVRON_MAX }, (_, i) =>
        new MeshBasicMaterial({
          color: new Color('#ffffff'),
          toneMapped: false,
          transparent: true,
          // Fade with distance, as the reference does.
          opacity: 0.95 - (i / CHEVRON_MAX) * 0.55,
          side: DoubleSide,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -6,
          polygonOffsetUnits: -6,
        }),
      ),
    [],
  )

  // Imperative handle: <Ball> already computes direction and power for the
  // shot itself, so the indicator is driven from that single source rather
  // than recomputing it — the arrow can therefore never disagree with the
  // impulse that is actually applied.
  handleRef.current = {
    update(position, direction, p) {
      const group = groupRef.current
      if (!group) return
      visible.current = true
      group.visible = true
      group.position.set(position.x, LIFT, position.z)
      // Local -Z is the launch direction. A three.js Y-rotation by b sends
      // local -Z to (-sin b, 0, -cos b), so:
      group.rotation.y = Math.atan2(-direction.x, -direction.z)
      power.current = p
    },
    hide() {
      visible.current = false
      if (groupRef.current) groupRef.current.visible = false
    },
  }

  useFrame((_, delta) => {
    if (!visible.current) return
    const p = power.current

    // Ribbon: scale along its length only, so it grows backwards from the ball
    // while its width stays put.
    const arrow = arrowRef.current
    if (arrow) {
      arrow.scale.z = ARROW_MIN_LENGTH + p * (ARROW_MAX_LENGTH - ARROW_MIN_LENGTH)
      powerColor(p, (arrow.material as MeshBasicMaterial).color)
    }

    // Chevrons: a short run whose LENGTH grows with power (1 -> 4 units, as in
    // Open-Golf), scrolling forward so the direction reads as flowing rather
    // than as a static dotted line.
    scroll.current = (scroll.current + delta * CHEVRON_SCROLL) % CHEVRON_SPACING
    const run = CHEVRON_MIN_RUN + p * (CHEVRON_MAX_RUN - CHEVRON_MIN_RUN)
    const group = chevronsRef.current
    if (group) {
      for (let i = 0; i < group.children.length; i++) {
        const child = group.children[i]
        const d = 0.34 + i * CHEVRON_SPACING + scroll.current
        child.visible = d <= run
        child.position.z = -d
      }
    }
  })

  return (
    <group ref={groupRef} visible={false}>
      {/* Power ribbon, BEHIND the ball: local +Z, i.e. opposite the launch
          direction. The scale is applied on +Z and the geometry runs +Z, so
          growing it always moves away from the ball, never through it. */}
      <mesh ref={arrowRef} geometry={arrowGeometry} material={arrowMaterial} renderOrder={2} />
      {/* Direction chevrons, IN FRONT: local -Z. */}
      <group ref={chevronsRef}>
        {chevronMaterials.map((m, i) => (
          <mesh key={i} geometry={chevronGeometry} material={m} renderOrder={3} />
        ))}
      </group>
    </group>
  )
}
