import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import { Group, MathUtils, Object3D, Vector3 } from 'three'
import { ballState } from './ballState'

/**
 * Victor, living in the garden.
 *
 * SCENERY ONLY. No collider, no rigid body, nothing Rapier can see. He reads
 * ballState — which <Ball> writes one-way — and writes his own transform.
 * Nothing here feeds back into the simulation, so he cannot affect a shot.
 *
 * The character model itself is APPROVED and untouched: this file only moves
 * it. It has no skeleton, so the walk is built by re-parenting the existing
 * limb nodes onto pivots at runtime (see rigLimbs) — a hip pivot per leg and a
 * shoulder pivot per arm. That is enough for legs that swing rather than
 * slide. Knees do not bend; proper articulation is the rigging task.
 */

const MODEL = '/models/minigolf/victor.glb'

/**
 * Where he is allowed to be. Hand-placed rather than randomly sampled. They
 * sit on the east side of the lawn because that keeps him:
 *
 *   - at least 4.4 m off the tee-to-hole line, which runs near X = 0.75
 *   - clear of the house, terrace and deck (all X < -2.4)
 *   - inside the boundary with over a metre of margin (R2's face is X 11.1,
 *     the end caps are Z +/-12.25)
 *   - away from the cup and its green, the apple tree, both planters, the
 *     mower, the corner planting bed and all three bushes
 *
 * Which PAIRS he may walk between is not assumed — it is computed from the
 * geometry in NEIGHBOURS below.
 */
const WAYPOINTS: [number, number][] = [
  [8.8, 6.4],
  [9.6, 2.0],
  [8.2, -1.0],
  [9.8, -5.5],
  [6.4, -7.5],
  [5.2, -2.0],
  [6.0, 3.5],
  [7.4, 8.2],
  [9.9, 9.4],
]

/**
 * Everything he must not walk into, as (centre, clearance radius). The bushes
 * and the cup are real gameplay geometry; the rest is scenery he should not
 * appear to walk through.
 */
const SCENERY: [[number, number], number][] = [
  [[1.5, 1], 1.2], [[7.5, -3], 1.0], [[-1.6, 8.2], 1.0],
  [[0.5, 10.8], 3.0], [[2.2, 12.2], 1.5], [[-1.5, -8], 0.9],
  [[-2.9, 7.0], 0.9], [[-2.5, -9], 0.9], [[10.25, -11.32], 1.6],
]

/** Perpendicular distance from point p to the segment a-b. */
function segmentDistance(p: [number, number], a: [number, number], b: [number, number]) {
  const vx = b[0] - a[0]
  const vz = b[1] - a[1]
  const len2 = vx * vx + vz * vz
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / len2))
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vz))
}

/**
 * Which waypoints he may walk to directly from each one.
 *
 * He picks his next destination at random rather than following the list in
 * order, so the route does not read as an obvious loop — but that means the
 * straight line between ANY two waypoints can be walked, not just between
 * consecutive ones. A three-minute observation run caught exactly that: the
 * diagonal from (8.2, -1.0) to (6.4, -7.5), which the ordered list never uses,
 * passes 0.14 m from the small bush at (7.5, -3).
 *
 * So the legal moves are computed once from the geometry instead of assumed,
 * and he can only ever choose a destination whose path is clear.
 */
const NEIGHBOURS: number[][] = WAYPOINTS.map((from, i) =>
  WAYPOINTS.map((_, j) => j).filter(
    (j) => j !== i && SCENERY.every(([c, r]) => segmentDistance(c, from, WAYPOINTS[j]) > r),
  ),
)

const WALK_SPEED = 0.62          // m/s — an unhurried amble
const ACCEL_TAU = 0.55           // eases in and out of walking, so no snapping
const ARRIVE_RADIUS = 0.28

const IDLE_MIN = 3.5
const IDLE_MAX = 11.0

/** Neck geometry, unchanged from the approved tracking behaviour. */
const NECK_LIMIT = MathUtils.degToRad(68)
const HEAD_TAU = 0.22            // the head turns quickly...
const BODY_TAU = 0.9             // ...the body reluctantly

/** Step cycle, used for the leg swing and the body bob. */
const STRIDE_HZ = 1.35
const LEG_SWING = MathUtils.degToRad(26)
const ARM_SWING = MathUtils.degToRad(16)
const BOB_HEIGHT = 0.022

const shortest = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/**
 * Re-parents the limb meshes onto pivots so they can rotate about a hip or a
 * shoulder instead of about their own centres.
 *
 * The glb's limbs are separate nodes whose origins sit at each part's middle —
 * rotating one directly would swing its top backwards as its bottom swings
 * forward, tearing it off the body. Grouping the parts of a limb under a new
 * Group placed at the joint, and shifting their local positions to compensate,
 * makes rotation happen about the joint instead.
 */
function rigLimbs(root: Object3D) {
  const byName = (frag: string) =>
    root.children.filter((c) => c.name.toLowerCase().includes(frag))

  const pivotFor = (parts: Object3D[], jointY: number) => {
    if (parts.length === 0) return null
    const cx = parts.reduce((s, p) => s + p.position.x, 0) / parts.length
    const cz = parts.reduce((s, p) => s + p.position.z, 0) / parts.length
    const pivot = new Group()
    pivot.position.set(cx, jointY, cz)
    root.add(pivot)
    for (const p of parts) {
      p.position.sub(pivot.position)
      pivot.add(p)
    }
    return pivot
  }

  // Split each limb group into left and right by their X sign.
  const legParts = ['shortleg', 'shin', 'sock', 'shoe', 'sole'].flatMap(byName)
  const armParts = ['arm', 'hand', 'sleeve'].flatMap(byName)
  const split = (parts: Object3D[]) => [
    parts.filter((p) => p.position.x < 0),
    parts.filter((p) => p.position.x >= 0),
  ]
  const [legL, legR] = split(legParts)
  const [armL, armR] = split(armParts)

  // The joint sits at the TOP of the limb's parts — the hip, and the shoulder.
  const topOf = (parts: Object3D[]) =>
    parts.reduce((m, p) => Math.max(m, p.position.y), -Infinity)

  return {
    legs: [pivotFor(legL, topOf(legL)), pivotFor(legR, topOf(legR))],
    arms: [pivotFor(armL, topOf(armL)), pivotFor(armR, topOf(armR))],
  }
}

type Phase = 'idle' | 'walk'

export function Victor() {
  const { scene } = useGLTF(MODEL) as unknown as { scene: Group }
  const model = useMemo(() => {
    const clone = scene.clone(true)
    clone.traverse((c) => {
      const m = c as { isMesh?: boolean; castShadow?: boolean; receiveShadow?: boolean }
      if (m.isMesh) {
        m.castShadow = true
        m.receiveShadow = true
      }
    })
    return clone
  }, [scene])

  const rootRef = useRef<Group>(null)
  const limbs = useRef<ReturnType<typeof rigLimbs> | null>(null)
  const head = useRef<Object3D | null>(null)

  // Motion state. Refs throughout: this runs every frame and must never
  // trigger a React render.
  const pos = useRef(new Vector3(WAYPOINTS[0][0], 0, WAYPOINTS[0][1]))
  const target = useRef(1)
  const phase = useRef<Phase>('idle')
  const timer = useRef(2.0)
  const speed = useRef(0)
  const stride = useRef(0)
  const swingAmp = useRef(0)
  const bodyYaw = useRef(0)
  const headYaw = useRef(0)
  /** Whether he is currently interested in the ball, rather than looking on. */
  const watching = useRef(true)

  useFrame((_, rawDelta) => {
    const root = rootRef.current
    if (!root) return
    if (!limbs.current) {
      limbs.current = rigLimbs(model)
      model.traverse((o) => {
        if (!head.current && o.name.toLowerCase().includes('head')) head.current = o
      })
    }
    // Clamped: one frame after a backgrounded tab otherwise carries the whole
    // hidden duration and would teleport him across the garden.
    const dt = Math.min(rawDelta, 1 / 20)

    // --- State machine -----------------------------------------------------
    timer.current -= dt
    if (phase.current === 'idle') {
      // While idle he mostly watches the ball, but not relentlessly — the
      // attention flickers so he reads as a person rather than a sensor.
      if (timer.current <= 0) {
        // Only ever choose a destination whose straight path is clear.
        const options = NEIGHBOURS[target.current]
        if (options.length > 0) {
          target.current = options[Math.floor(Math.random() * options.length)]
          phase.current = 'walk'
        }
        watching.current = Math.random() < 0.35
      }
    } else {
      const [tx, tz] = WAYPOINTS[target.current]
      const to = new Vector3(tx - pos.current.x, 0, tz - pos.current.z)
      if (to.length() < ARRIVE_RADIUS) {
        phase.current = 'idle'
        timer.current = IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN)
        watching.current = Math.random() < 0.8
      }
    }

    // --- Locomotion --------------------------------------------------------
    const wantSpeed = phase.current === 'walk' ? WALK_SPEED : 0
    speed.current += (wantSpeed - speed.current) * (1 - Math.exp(-dt / ACCEL_TAU))

    let travelYaw = bodyYaw.current
    if (phase.current === 'walk') {
      const [tx, tz] = WAYPOINTS[target.current]
      const dx = tx - pos.current.x
      const dz = tz - pos.current.z
      const len = Math.hypot(dx, dz) || 1
      // Model forward is local +Z (Blender -Y through the glTF Y-up
      // conversion), so a heading is atan2(dx, dz).
      travelYaw = Math.atan2(dx, dz)
      pos.current.x += (dx / len) * speed.current * dt
      pos.current.z += (dz / len) * speed.current * dt
    }

    // --- Where he is looking ----------------------------------------------
    const bdx = ballState.x - pos.current.x
    const bdz = ballState.z - pos.current.z
    const ballYaw = Math.atan2(bdx, bdz)
    // Walking, he mostly looks where he is going; idle, at the ball. Either
    // way the HEAD does the looking and the body only follows when the neck
    // runs out — the approved behaviour, unchanged.
    const gaze = watching.current ? ballYaw : travelYaw

    // Body: while walking it must face the direction of travel, otherwise it
    // only turns when the gaze exceeds the neck.
    let bodyTarget = bodyYaw.current
    if (phase.current === 'walk') {
      bodyTarget = travelYaw
    } else {
      const rel = shortest(gaze - bodyYaw.current)
      if (Math.abs(rel) > NECK_LIMIT) bodyTarget = gaze - Math.sign(rel) * NECK_LIMIT * 0.55
    }
    bodyYaw.current += shortest(bodyTarget - bodyYaw.current) * (1 - Math.exp(-dt / BODY_TAU))

    const wantHead = MathUtils.clamp(shortest(gaze - bodyYaw.current), -NECK_LIMIT, NECK_LIMIT)
    headYaw.current += (wantHead - headYaw.current) * (1 - Math.exp(-dt / HEAD_TAU))
    if (head.current) head.current.rotation.y = headYaw.current

    // --- Step cycle --------------------------------------------------------
    // Driven by actual speed, so the legs stop swinging exactly as he stops
    // rather than running on or freezing mid-stride.
    const moving = speed.current / WALK_SPEED
    stride.current += dt * STRIDE_HZ * Math.PI * 2 * moving
    // The swing amplitude collapses FASTER than the walk speed does. Sharing
    // the slow acceleration constant left the legs visibly apart and still
    // swinging 13 degrees after he had stopped; squaring it, and forcing it to
    // zero below a threshold, brings the feet together as he settles.
    // Deliberately driven by SPEED, not by the phase.
    //
    // Cutting the swing the instant the phase flips to idle is technically
    // tidier — the legs stop dead the moment he stops translating — and it
    // looks wrong: the legs freeze mid-stride while the figure eases to a
    // halt. Letting the amplitude fall away with the remaining speed lets him
    // walk it out and bring his feet together. Judged by eye, not by the
    // metric; the owner picked this version over the phase-driven one.
    const amp = moving < 0.12 ? 0 : moving * moving
    swingAmp.current += (amp - swingAmp.current) * (1 - Math.exp(-dt / 0.18))
    const swing = Math.sin(stride.current) * LEG_SWING * swingAmp.current
    const l = limbs.current
    if (l) {
      if (l.legs[0]) l.legs[0].rotation.x = swing
      if (l.legs[1]) l.legs[1].rotation.x = -swing
      // Arms counter-swing, which is what stops a walk reading as a shuffle.
      if (l.arms[0]) l.arms[0].rotation.x = -swing * (ARM_SWING / LEG_SWING)
      if (l.arms[1]) l.arms[1].rotation.x = swing * (ARM_SWING / LEG_SWING)
    }

    root.position.set(
      pos.current.x,
      // Two bobs per stride: the body rises on each footfall.
      Math.abs(Math.sin(stride.current)) * BOB_HEIGHT * swingAmp.current,
      pos.current.z,
    )
    root.rotation.y = bodyYaw.current
    // A touch of lean into the walk, and a roll with the step.
    root.rotation.z = Math.sin(stride.current) * 0.018 * swingAmp.current
    root.rotation.x = -0.03 * swingAmp.current
  })

  return (
    <group ref={rootRef}>
      <primitive object={model} />
    </group>
  )
}

useGLTF.preload(MODEL)
