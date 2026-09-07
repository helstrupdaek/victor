import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import {
  CanvasTexture,
  Group,
  MathUtils,
  Mesh,
  Object3D,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { ballState } from './ballState'
import {
  AMBIENT,
  BALL_STATIONARY_SPEED,
  rollIdleThreshold,
  setVictorState,
  shouldStartSteal,
  stealTuning,
  victorState,
  type VictorState,
} from './victorState'

/**
 * Victor, living in the garden.
 *
 * SCENERY ONLY. No collider, no rigid body, nothing Rapier can see. He reads
 * ballState — which <Ball> writes one-way — and writes his own transform.
 * Nothing here feeds back into the simulation, so he cannot affect a shot.
 *
 * The one exception is the Easter egg, and it is deliberately narrow: for the
 * ten seconds of the steal he asks <Ball> to go kinematic, hide itself and
 * reappear at the tee, through the four fields in victorState. He never applies
 * a force, never touches the stroke count, and never changes a physics
 * parameter. See victorState.ts for the full list of what he may ask for.
 *
 * The character model itself is APPROVED and untouched: this file only moves
 * it. It has no skeleton, so the walk is built by re-parenting the existing
 * limb nodes onto pivots at runtime (see rigLimbs) — a hip pivot per leg and a
 * shoulder pivot per arm. That is enough for legs that swing rather than
 * slide. Knees do not bend; proper articulation is the rigging task.
 */

const MODEL = '/models/minigolf/victor.glb'

/**
 * Where he stands when he has nothing to walk towards.
 *
 * These used to be nine points hugging the EAST side, chosen to keep him at
 * least 4.4 m off the tee-to-hole line so he could never interfere. He is a
 * hazard now — he walks up to the ball and punts it — so staying out of play is
 * no longer the goal, and confining him to one edge just made the garden look
 * half-used. This set spans the whole lawn: the strip along the house, the
 * middle, the east side, and both ends.
 *
 * Still excluded: the cup and its green, both planters, the mower, the corner
 * bed and all three bushes. The one candidate in the north-west bay behind the
 * house corner was dropped because every straight path out of it crosses the
 * green — it was an orphan in the graph below rather than a place he could
 * actually leave.
 *
 * Which PAIRS he may walk between is not assumed — it is computed from the
 * geometry in NEIGHBOURS below.
 */
const WAYPOINTS: [number, number][] = [
  [-2.2, -10.6], [1, -11.2], [4.6, -11], [8.6, -8.6],
  [-2.2, -5.4], [2.8, -6.6], [6.6, -6], [9.8, -4.6],
  [-2.2, -1.2], [3.4, -1.6], [9.6, 0.4],
  [-2.2, 3.2], [3.2, 3], [7, 3.4], [9.9, 5.2],
  [0.4, 6.6], [5.2, 7.4], [8.8, 8.8],
  [4.4, 10.6], [8.4, 11.2],
]

/**
 * Everything he must not walk into, as (centre, clearance radius). The bushes
 * and the cup are real gameplay geometry; the rest is scenery he should not
 * appear to walk through.
 */
const SCENERY: [[number, number], number][] = [
  [[0.74, 1], 1.2], [[7.5, -3], 1.0], [[-1.6, 8.2], 1.0],
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

/**
 * Steers a destination around scenery.
 *
 * NEIGHBOURS above guarantees a clear path only BETWEEN waypoints, and the
 * Easter egg is the first thing that takes him off that graph: he jogs to
 * wherever the ball happens to be, and afterwards he is standing there. A
 * measured run had him cross seventeen metres of lawn to the tee, clearing the
 * nearest bush by 1.74 m — which is fine, and is luck rather than a guarantee.
 *
 * So when he is off the graph, the aim point is pushed to one side of the
 * first obstacle that fouls the straight line, and released once he is past
 * it. Cheap, and enough for a garden with nine convex obstacles in it.
 *
 * Used ONLY while approaching the ball and while rejoining afterwards. Normal
 * wandering still runs on the graph, untouched.
 */
function avoidScenery(fromX: number, fromZ: number, to: [number, number]): [number, number] {
  for (const [[cx, cz], r] of SCENERY) {
    const clear = r + 0.45
    // If the destination itself is up against the obstacle — a ball resting
    // beside a bush — there is nothing to steer around and he has to go in.
    if (Math.hypot(to[0] - cx, to[1] - cz) < clear) continue
    if (segmentDistance([cx, cz], [fromX, fromZ], to) >= clear) continue
    const vx = to[0] - fromX
    const vz = to[1] - fromZ
    const len = Math.hypot(vx, vz) || 1
    // Which side of his path the obstacle sits on, so he goes round the near
    // side rather than crossing in front of it.
    const cross = (vx * (cz - fromZ) - vz * (cx - fromX)) / len
    const side = cross > 0 ? -1 : 1
    return [cx + (-vz / len) * side * clear * 1.3, cz + (vx / len) * side * clear * 1.3]
  }
  return to
}

/** The nearest waypoint he can reach from here in a straight line. */
function rejoinTarget(fromX: number, fromZ: number) {
  let best = 0
  let bestD = Infinity
  for (let j = 0; j < WAYPOINTS.length; j++) {
    const d = Math.hypot(WAYPOINTS[j][0] - fromX, WAYPOINTS[j][1] - fromZ)
    const clear = SCENERY.every(([c, r]) => segmentDistance(c, [fromX, fromZ], WAYPOINTS[j]) > r)
    if (clear && d < bestD) { bestD = d; best = j }
  }
  return best
}

const WALK_SPEED = 0.62          // m/s — an unhurried amble
const ACCEL_TAU = 0.55           // eases in and out of walking, so no snapping
const ARRIVE_RADIUS = 0.28

// Idle pauses between waypoints. IDLE_MAX was 11 s, which with an 0.62 m/s
// amble meant he was standing still for 80% of any given minute and covered
// only about 30 m of ground in four — half the garden, which is what "he only
// walks on one side" looked like in practice even after the waypoints were
// spread out. Shortening the upper end roughly doubles how much of the garden
// he gets round in a session. The walk itself is untouched.
const IDLE_MIN = 2.5
const IDLE_MAX = 6.0

/** Neck geometry, unchanged from the approved tracking behaviour. */
const NECK_LIMIT = MathUtils.degToRad(68)
const HEAD_TAU = 0.22            // the head turns quickly...
const BODY_TAU = 0.9             // ...the body reluctantly

/** Step cycle, used for the leg swing and the body bob. */
const STRIDE_HZ = 1.35
const LEG_SWING = MathUtils.degToRad(26)
const ARM_SWING = MathUtils.degToRad(16)
const BOB_HEIGHT = 0.022

// --- The football Easter egg ----------------------------------------------
/**
 * He jogs, rather than ambles, to the ball — the whole gag reads as a
 * deliberate raid, and an unhurried amble across ten metres would take
 * seventeen seconds. Everything else about the locomotion is the approved
 * walk: the stride rate and swing amplitude are driven by SPEED, so a higher
 * speed produces a faster, longer stride for free without touching that code.
 */
const APPROACH_SPEED = 1.55
/**
 * How far short of the ball he stops.
 *
 * Was 0.62, with a 0.28 arrival tolerance on top, so he could pull up 0.9 m
 * away and then mime picking up a ball that was still visibly on the grass
 * beside him. The reach below is sized to match this, and the two must stay in
 * step: STOP_SHORT is roughly HAND_LOW's forward component.
 */
const STOP_SHORT = 0.48
/** Arrival tolerance for the approach — tighter than the wandering one. */
const REACH_TOLERANCE = 0.16
/** Beyond this from the ball he gives up and goes back to wandering. */
const APPROACH_TIMEOUT = 18

const NOTICE_TIME = 1.4          // stops, turns, registers the ball
const PICKUP_TIME = 0.9          // crouch down and take it
const HOLD_TIME = 0.85           // stands up holding it, the comedy beat
const TRANSFORM_TIME = 0.5       // golf ball becomes football
const PREPARE_TIME = 1.0         // turns to face out, drops it to his feet
const KICK_TIME = 1.7            // wind-up, strike, follow-through
const KICK_RELEASE = 0.88        // seconds into KICKING that boot meets ball
const WATCH_TIME = 1.6           // watches it sail away
const RETURN_TIME = 1.0          // beat before he goes back to wandering

/** Where in his local frame the ball sits once picked up (forward is +Z). */
const HAND_LOW = new Vector3(0.22, 0.40, 0.50)
const HAND_HIGH = new Vector3(0.34, 1.14, 0.40)

const FOOTBALL_RADIUS = 0.3
/**
 * The kick heads EAST, out over the boundary hedge, because that is the side
 * of the garden he lives on and it is across the frame from the behind-the-ball
 * camera rather than into it. The hedge is 0.95 m tall and its face is at
 * X = 11.1; from his roaming range the ball crosses it above 1.7 m, and the arc
 * peaks around 4.9 m. Verified numerically in the test rather than by eye.
 */
const KICK_DIR: [number, number] = [0.958, 0.287]
const KICK_SPEED_H = 11.5
const KICK_V0 = 9.5
const KICK_G = 9.81
/** Flight time before the football is removed — it is well out of the garden. */
const FOOTBALL_DESPAWN = 1.9

/**
 * Getting hit by the ball.
 *
 * Victor still has no collider — adding one would put him inside the physics
 * simulation, where he could deflect a shot, wedge a ball against a hedge or
 * change the course's behaviour depending on where he happened to be standing.
 * This is a proximity test read from ballState instead, so the ball's flight is
 * decided entirely by Rapier right up until the moment he catches it, and
 * nothing about the course changes when he walks across it.
 *
 * The radius is a little generous against his actual width (roughly 0.22 m at
 * the shoulders, plus the ball's 0.15 m): being clipped should count, because
 * from the player's side a near miss and a hit look the same at this distance.
 */
const CONTACT_RADIUS = 1.0
const CONTACT_HEIGHT = 1.85
/**
 * After a punt he leaves the ball alone for this long, wandering instead of
 * chasing. Without it he would walk straight to the freshly respawned ball at
 * the tee and punt it again before the player could line up, which is not a
 * hazard, it is a lock-out.
 */
const CONTACT_COOLDOWN = 6

/**
 * He walks the ball down at his normal amble, NOT the jog he uses for the idle
 * Easter egg. The speed is the entire difficulty dial: at 0.62 m/s he crosses
 * the garden in twenty to thirty seconds, which is time pressure, whereas at a
 * jog he would arrive before most players had lined up a shot.
 */
const CHASE_SPEED = WALK_SPEED

/** Body turns much more decisively during the sequence than while ambling. */
const SEQ_BODY_TAU = 0.32
/** How hard the camera is pulled toward the action, and how it makes room. */
const FOCUS_WEIGHT = 0.72
const FOCUS_TAU = 0.9
/**
 * How far the framed subject may lead Victor, in metres.
 *
 * Without this the focus point is the midpoint of Victor and the football, and
 * once the football is twenty metres downrange that midpoint drags the optical
 * axis right off him: a capture had the camera whipped round onto the
 * neighbour's roof with Victor out of frame entirely. Clamping the lead keeps
 * him and the launch corridor in shot and lets the football leave the frame the
 * way a real punt does.
 */
const FOCUS_MAX_LEAD = 5.5

const shortest = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/** Duration of each timed state, in seconds. */
const DURATION: Partial<Record<VictorState, number>> = {
  NOTICED_BALL: NOTICE_TIME,
  PICKING_UP: PICKUP_TIME,
  HOLDING: HOLD_TIME,
  TRANSFORMING: TRANSFORM_TIME,
  PREPARING_KICK: PREPARE_TIME,
  KICKING: KICK_TIME,
  WATCHING: WATCH_TIME,
  RETURNING_TO_WANDER: RETURN_TIME,
}

/**
 * A classic black-and-white football, as an equirectangular canvas texture.
 *
 * Cheaper and more legible than modelling a truncated icosahedron: at the
 * distance this is seen the pattern is the entire read, and a plain white
 * sphere would be indistinguishable from the golf ball it just replaced —
 * which would kill the joke.
 */
function makeFootballTexture() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#f4f4f0'
  g.fillRect(0, 0, c.width, c.height)

  // Pentagon centres in (longitude fraction, latitude fraction). Two poles and
  // two offset rings of five, which is the icosahedral arrangement as seen on
  // a real ball.
  const spots: [number, number][] = [[0, 0.02], [0, 0.98]]
  for (let i = 0; i < 5; i++) {
    spots.push([(i + 0.0) / 5, 0.31])
    spots.push([(i + 0.5) / 5, 0.69])
  }

  g.fillStyle = '#16181c'
  for (const [u, v] of spots) {
    const y = v * c.height
    // Longitudes converge toward the poles, so a patch has to be drawn wider
    // there to keep a constant size on the sphere.
    const stretch = 1 / Math.max(Math.sin(v * Math.PI), 0.28)
    const r = 26
    // Draw at u and at u +/- 1 so a patch straddling the seam is not clipped.
    for (const wrap of [-1, 0, 1]) {
      const x = (u + wrap) * c.width
      g.beginPath()
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 - Math.PI / 2
        const px = x + Math.cos(a) * r * stretch
        const py = y + Math.sin(a) * r
        if (k === 0) g.moveTo(px, py)
        else g.lineTo(px, py)
      }
      g.closePath()
      g.fill()
    }
  }
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}

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
  /**
   * Inner group carrying the sequence's forward hinge.
   *
   * It cannot go on the root. three.js Euler order 'XYZ' composes as
   * Rx . Ry . Rz, so root.rotation.x tilts about the WORLD X axis AFTER the
   * yaw — which is a sideways roll for any heading other than due north. The
   * approved walk gets away with it because its x and z terms are under two
   * degrees; a 35-degree bend to pick something up did not, and rendered as a
   * figure standing bolt upright reaching sideways at chest height. Inside the
   * yaw, the same rotation is a local pitch, which is the forward hinge.
   */
  const bendRef = useRef<Group>(null)
  const footballRef = useRef<Mesh>(null)
  const footballTexture = useMemo(makeFootballTexture, [])
  const limbs = useRef<ReturnType<typeof rigLimbs> | null>(null)
  const head = useRef<Object3D | null>(null)

  // Motion state. Refs throughout: this runs every frame and must never
  // trigger a React render.
  /**
   * He starts mid-garden, not at WAYPOINTS[0].
   *
   * The list is ordered south-to-north now, so index 0 is (-2.2, -10.6) — 3.3 m
   * from the tee. Starting there he would walk up and punt the ball about five
   * seconds after the page loaded, before the player had touched anything.
   */
  const pos = useRef(new Vector3(WAYPOINTS[13][0], 0, WAYPOINTS[13][1]))
  const target = useRef(13)
  const timer = useRef(2.0)
  const speed = useRef(0)
  const stride = useRef(0)
  const swingAmp = useRef(0)
  const bodyYaw = useRef(0)
  const headYaw = useRef(0)
  /** Whether he is currently interested in the ball, rather than looking on. */
  const watching = useRef(true)

  // --- Easter-egg state --------------------------------------------------
  /** Seconds since the player last did anything at all. */
  const idleSeconds = useRef(0)
  /** When the next — and only — decision for this idle stretch is due. */
  const nextDecisionAt = useRef(rollIdleThreshold())
  const lastShot = useRef(ballState.shotSerial)
  /** Where the ball was when he committed; the pickup animates to this. */
  const grabPoint = useRef(new Vector3())
  /** Where the football sits before the kick, and the kick's heading. */
  const kickSpot = useRef(new Vector3())
  /** Where the football was when he started to put it down. */
  const dropFrom = useRef(new Vector3())
  const kickYaw = useRef(0)
  /** Seconds of football flight, or null while it is not airborne. */
  const flight = useRef<number | null>(null)
  const footballPos = useRef(new Vector3())
  const footballVisible = useRef(false)
  const focusWeight = useRef(0)
  /** Counts down after a sequence, so he cannot punt twice back to back. */
  const contactCooldown = useRef(0)
  /** True while he is walking back onto the waypoint graph after a sequence. */
  const rejoining = useRef(false)

  /**
   * Enters the production sequence at NOTICED_BALL.
   *
   * This is the SAME entry point the natural trigger uses — see the
   * shouldStartSteal call below, which does nothing more than call this. There
   * is deliberately no separate test path: a rehearsal that runs different code
   * from the real thing proves nothing about the real thing.
   */
  function beginSteal() {
    const s = victorState.state
    if (s !== 'WANDERING' && s !== 'IDLE') return false
    victorState.trigger = 'forced'
    setVictorState('NOTICED_BALL')
    return true
  }

  /**
   * The ball has hit him. He traps it and punts it, with no notice-and-approach
   * beat — it arrived at his feet, so there is nothing to walk to.
   *
   * This enters the SAME sequence at PICKING_UP, which is the first committed
   * state: contact is not something the player can then take back. Trapping the
   * ball is what victorState.held already does — <Ball> switches to kinematic,
   * which stops it dead without an impulse in either direction.
   *
   * The stroke that was played still counts, exactly as it did the moment it
   * was played. Nothing here adds or removes one.
   */
  function beginPunt() {
    if (!AMBIENT.includes(victorState.state)) return false
    grabPoint.current.set(ballState.x, ballState.y, ballState.z)
    victorState.held = true
    victorState.inputLocked = true
    victorState.trigger = 'contact'
    setVictorState('PICKING_UP')
    return true
  }

  /** Puts everything back exactly as it was. Safe to call at any point. */
  function abandonSteal() {
    victorState.held = false
    victorState.hidden = false
    victorState.inputLocked = false
    victorState.trigger = 'none'
    flight.current = null
    footballVisible.current = false
    idleSeconds.current = 0
    nextDecisionAt.current = rollIdleThreshold()
    // He may have jogged well off the graph before the abort, so he walks back
    // onto it the same way a finished sequence does.
    target.current = rejoinTarget(pos.current.x, pos.current.z)
    rejoining.current = true
    contactCooldown.current = CONTACT_COOLDOWN
    setVictorState('WANDERING')
  }

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, Record<string, unknown>>
    // Merged, not assigned: MinigolfCanvas installs its own render/readback
    // handle on the same object and the two mount in an order that has already
    // changed once in this project.
    w.__minigolf = {
      ...(w.__minigolf ?? {}),
      victor: {
        forceSteal: beginSteal,
        forcePunt: beginPunt,
        abandon: abandonSteal,
        state: () => victorState.state,
        // The shipped decision function and the shipped tuning record, so the
        // trigger tests exercise what actually runs rather than a copy of it.
        shouldStartSteal,
        tuning: stealTuning,
        snapshot: () => ({
          state: victorState.state,
          trigger: victorState.trigger,
          elapsed: victorState.elapsed,
          history: [...victorState.history],
          x: pos.current.x,
          z: pos.current.z,
          held: victorState.held,
          hidden: victorState.hidden,
          inputLocked: victorState.inputLocked,
          respawnSerial: victorState.respawnSerial,
          flying: flight.current !== null,
          flightT: flight.current,
          football: footballVisible.current
            ? { x: footballPos.current.x, y: footballPos.current.y, z: footballPos.current.z }
            : null,
        }),
      },
    }
  }, [])

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

    // --- Player activity, and the one decision per idle stretch -----------
    const playerActive =
      ballState.aiming ||
      ballState.speed > BALL_STATIONARY_SPEED ||
      ballState.shotSerial !== lastShot.current
    if (ballState.shotSerial !== lastShot.current) lastShot.current = ballState.shotSerial
    if (playerActive) {
      idleSeconds.current = 0
      nextDecisionAt.current = rollIdleThreshold()
    } else {
      idleSeconds.current += dt
    }

    const st0 = victorState.state
    const inSequence = !AMBIENT.includes(st0)
    if (contactCooldown.current > 0) contactCooldown.current -= dt

    // --- He reaches the ball, or it reaches him ---------------------------
    // One test for both. It no longer requires the ball to be MOVING: he walks
    // the ball down now, so arriving at a ball that is sitting still has to
    // count exactly as much as being hit by one.
    //
    // Not while the player is mid-drag, though. Snatching a ball out from under
    // someone who is lining up their shot is the difference between a hazard
    // and a cheat, and the shot they are about to play is their way out.
    if (!inSequence && !ballState.holed && !ballState.aiming && contactCooldown.current <= 0) {
      const reached =
        ballState.y < CONTACT_HEIGHT &&
        Math.hypot(ballState.x - pos.current.x, ballState.z - pos.current.z) < CONTACT_RADIUS
      if (reached) beginPunt()
    }

    if (!inSequence && victorState.state === st0 && idleSeconds.current >= nextDecisionAt.current) {
      const go = shouldStartSteal({
        idleSeconds: idleSeconds.current,
        idleThreshold: nextDecisionAt.current,
        ballSpeed: ballState.speed,
        aiming: ballState.aiming,
        holed: ballState.holed,
        resetting: false,
        victorBusy: inSequence,
        rng: Math.random,
        probability: stealTuning.probability,
      })
      if (go) beginSteal()
      // Rolled either way: the decision for this window is spent. A miss just
      // pushes the next window out, so it is one roll per 25-35 s of idling
      // rather than one roll per frame, which at 30% would fire in 55 ms.
      else nextDecisionAt.current += rollIdleThreshold()
    }

    // --- Interrupt --------------------------------------------------------
    // Abortable right up to the moment he touches the ball, committed after.
    // The boundary is the PICKING_UP transition and nothing else.
    if (st0 === 'NOTICED_BALL' || st0 === 'APPROACHING_BALL') {
      if (ballState.aiming || ballState.speed > BALL_STATIONARY_SPEED || ballState.holed) {
        abandonSteal()
      }
    }

    victorState.elapsed += dt
    const state = victorState.state
    const elapsed = victorState.elapsed
    const ballPos = new Vector3(ballState.x, ballState.y, ballState.z)

    // --- Ambient behaviour ------------------------------------------------
    // He goes after the ball whenever there is a ball to go after. Wandering is
    // what he falls back on: during the cooldown after a punt, while the ball is
    // in flight, once it is holed, and while he has it in his hands.
    if (AMBIENT.includes(state)) {
      const chaseable =
        stealTuning.chase &&
        // Not before the player has actually played. A ball still sitting on
        // the tee at the start of a round is not fair game, and he would reach
        // it long before a first-time player had worked out the controls.
        ballState.shotSerial > 0 &&
        !ballState.holed &&
        !victorState.held &&
        contactCooldown.current <= 0 &&
        ballState.speed <= BALL_STATIONARY_SPEED
      if (chaseable) {
        setVictorState('CHASING_BALL')
      } else if (state === 'CHASING_BALL') {
        // Stop and watch it go rather than trudging after a moving ball.
        setVictorState('IDLE')
        timer.current = IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN)
        watching.current = true
      }
    }

    const ambient = victorState.state
    if (ambient === 'CHASING_BALL') {
      // He keeps his eyes on it the whole way in.
      watching.current = true
    } else if (ambient === 'IDLE' || ambient === 'WANDERING') {
      timer.current -= dt
      if (state === 'IDLE') {
        // While idle he mostly watches the ball, but not relentlessly — the
        // attention flickers so he reads as a person rather than a sensor.
        if (timer.current <= 0) {
          // Only ever choose a destination whose straight path is clear.
          const options = NEIGHBOURS[target.current]
          if (options.length > 0) {
            target.current = options[Math.floor(Math.random() * options.length)]
            setVictorState('WANDERING')
          }
          watching.current = Math.random() < 0.35
        }
      } else {
        const [tx, tz] = WAYPOINTS[target.current]
        const to = new Vector3(tx - pos.current.x, 0, tz - pos.current.z)
        if (to.length() < ARRIVE_RADIUS) {
          rejoining.current = false
          setVictorState('IDLE')
          timer.current = IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN)
          watching.current = Math.random() < 0.8
        }
      }
    }

    // --- Sequence transitions ---------------------------------------------
    if (state === 'APPROACHING_BALL') {
      const reach = Math.hypot(ballPos.x - pos.current.x, ballPos.z - pos.current.z)
      if (reach <= STOP_SHORT + REACH_TOLERANCE) {
        grabPoint.current.set(ballPos.x, ballPos.y, ballPos.z)
        // COMMITTED from here. The lock goes on in the same frame as the grab,
        // so there is no window in which a held ball is playable.
        victorState.held = true
        victorState.inputLocked = true
        setVictorState('PICKING_UP')
      } else if (elapsed > APPROACH_TIMEOUT) {
        // He could not get there — a ball wedged against the house, say. Give
        // up quietly rather than jog into a wall forever.
        abandonSteal()
      }
    } else {
      const due = DURATION[state]
      if (due !== undefined && elapsed >= due) {
        if (state === 'NOTICED_BALL') setVictorState('APPROACHING_BALL')
        else if (state === 'PICKING_UP') setVictorState('HOLDING')
        else if (state === 'HOLDING') {
          victorState.hidden = true
          footballVisible.current = true
          setVictorState('TRANSFORMING')
        } else if (state === 'TRANSFORMING') {
          // He turns out toward the hedge and puts it down at his feet. Both
          // ends of the drop are captured HERE, once: interpolating from the
          // live position every frame would compound into an exponential ease
          // that never quite arrives.
          kickYaw.current = Math.atan2(KICK_DIR[0], KICK_DIR[1])
          dropFrom.current.copy(footballPos.current)
          kickSpot.current.set(
            pos.current.x + KICK_DIR[0] * 0.72,
            FOOTBALL_RADIUS,
            pos.current.z + KICK_DIR[1] * 0.72,
          )
          setVictorState('PREPARING_KICK')
        } else if (state === 'PREPARING_KICK') setVictorState('KICKING')
        else if (state === 'KICKING') setVictorState('WATCHING')
        else if (state === 'WATCHING') {
          // The football is long gone. Give the ball back, unlock, no stroke.
          victorState.held = false
          victorState.hidden = false
          victorState.inputLocked = false
          victorState.respawnSerial += 1
          footballVisible.current = false
          flight.current = null
          setVictorState('RETURNING_TO_WANDER')
        } else if (state === 'RETURNING_TO_WANDER') {
          // He is standing wherever the ball was, which is off the waypoint
          // graph. Walk back onto it, to the nearest waypoint he can actually
          // reach, rather than resuming from a stale index and cutting across
          // whatever lies between.
          idleSeconds.current = 0
          nextDecisionAt.current = rollIdleThreshold()
          target.current = rejoinTarget(pos.current.x, pos.current.z)
          rejoining.current = true
          watching.current = true
          contactCooldown.current = CONTACT_COOLDOWN
          victorState.trigger = 'none'
          setVictorState('WANDERING')
        }
      }
    }

    // Re-read AFTER the transitions above, not before them.
    //
    // Reading it once at the top meant that on a transition frame the NEW
    // state ran for one frame on the OLD state's clock. Measured effect: the
    // football launched 0.12 s into its arc — 1.3 m out — and snapped back to
    // the tee spot on the next frame, a visible one-frame teleport. Every
    // timed pose below had the same defect in milder form, each starting on
    // its final frame's pose. setVictorState zeroes the clock, so re-reading
    // here gives 0 on a transition frame, which is what these all want.
    const phase = victorState.state
    const phaseElapsed = victorState.elapsed
    const sequence = !AMBIENT.includes(phase)

    // --- Locomotion --------------------------------------------------------
    // One rule for both behaviours: pick a destination and a speed, and the
    // approved acceleration and step cycle do the rest.
    let destination: [number, number] | null = null
    let wantSpeed = 0
    if (phase === 'CHASING_BALL') {
      // Straight at it, steered around anything in the way. He walks right up
      // to it — the contact test above is what stops him, not a stand-off
      // distance, so that reaching the ball and being hit by it are the same
      // event with the same outcome.
      destination = avoidScenery(pos.current.x, pos.current.z, [ballState.x, ballState.z])
      wantSpeed = CHASE_SPEED
    } else if (phase === 'WANDERING') {
      destination = rejoining.current
        ? avoidScenery(pos.current.x, pos.current.z, WAYPOINTS[target.current])
        : WAYPOINTS[target.current]
      wantSpeed = WALK_SPEED
    } else if (phase === 'APPROACHING_BALL') {
      // Aims at a point STOP_SHORT before the ball rather than at the ball, so
      // he pulls up beside it instead of standing on it.
      const dx = ballPos.x - pos.current.x
      const dz = ballPos.z - pos.current.z
      const len = Math.hypot(dx, dz) || 1
      destination = avoidScenery(pos.current.x, pos.current.z, [
        ballPos.x - (dx / len) * STOP_SHORT,
        ballPos.z - (dz / len) * STOP_SHORT,
      ])
      wantSpeed = APPROACH_SPEED
    }
    speed.current += (wantSpeed - speed.current) * (1 - Math.exp(-dt / ACCEL_TAU))

    let travelYaw = bodyYaw.current
    if (destination) {
      const dx = destination[0] - pos.current.x
      const dz = destination[1] - pos.current.z
      const len = Math.hypot(dx, dz) || 1
      // Model forward is local +Z (Blender -Y through the glTF Y-up
      // conversion), so a heading is atan2(dx, dz).
      travelYaw = Math.atan2(dx, dz)
      pos.current.x += (dx / len) * speed.current * dt
      pos.current.z += (dz / len) * speed.current * dt
    }

    // --- Where he is looking ----------------------------------------------
    // During the sequence his attention is on whatever he is doing: the ball
    // while he is taking it, the football once it exists.
    const lookAt =
      phase === 'PREPARING_KICK' || phase === 'KICKING' || phase === 'WATCHING'
        ? footballPos.current
        : ballPos
    const bdx = lookAt.x - pos.current.x
    const bdz = lookAt.z - pos.current.z
    const ballYaw = Math.atan2(bdx, bdz)
    // Walking, he mostly looks where he is going; idle, at the ball. Either
    // way the HEAD does the looking and the body only follows when the neck
    // runs out — the approved behaviour, unchanged.
    const gaze = sequence ? ballYaw : watching.current ? ballYaw : travelYaw

    // Body: while walking it must face the direction of travel, otherwise it
    // only turns when the gaze exceeds the neck.
    let bodyTarget = bodyYaw.current
    let bodyTau = BODY_TAU
    if (sequence) {
      // He is doing something on purpose, so he squares up to it rather than
      // drifting round. Applies ONLY inside the sequence — the ambient turn
      // behaviour below is the approved one and is not touched.
      bodyTau = SEQ_BODY_TAU
      if (phase === 'APPROACHING_BALL') bodyTarget = travelYaw
      else if (phase === 'PREPARING_KICK' || phase === 'KICKING' || phase === 'WATCHING') {
        bodyTarget = kickYaw.current
      } else bodyTarget = ballYaw
    } else if (phase === 'WANDERING' || phase === 'CHASING_BALL') {
      bodyTarget = travelYaw
    } else {
      const rel = shortest(gaze - bodyYaw.current)
      if (Math.abs(rel) > NECK_LIMIT) bodyTarget = gaze - Math.sign(rel) * NECK_LIMIT * 0.55
    }
    bodyYaw.current += shortest(bodyTarget - bodyYaw.current) * (1 - Math.exp(-dt / bodyTau))

    const wantHead = MathUtils.clamp(shortest(gaze - bodyYaw.current), -NECK_LIMIT, NECK_LIMIT)
    headYaw.current += (wantHead - headYaw.current) * (1 - Math.exp(-dt / HEAD_TAU))
    if (head.current) head.current.rotation.y = headYaw.current

    // --- Step cycle --------------------------------------------------------
    // Driven by actual speed, so the legs stop swinging exactly as he stops
    // rather than running on or freezing mid-stride.
    // Clamped only so the jog cannot produce a cartwheel: at the approved walk
    // speed `moving` never exceeds 1, so both clamps are no-ops there and the
    // approved motion is bit-for-bit unchanged.
    const moving = Math.min(speed.current / WALK_SPEED, 1.6)
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
    const amp = moving < 0.12 ? 0 : Math.min(moving * moving, 1.4)
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

    // --- Sequence poses ----------------------------------------------------
    // Layered ON TOP of the step cycle above, and only ever while `sequence`
    // is true, so nothing here can reach the ambient walk.
    let crouch = 0
    let lean = 0
    if (l && sequence) {
      if (phase === 'PICKING_UP') {
        // Down and back up over the state, with the reach happening at the
        // bottom. sin gives the ease at both ends for free.
        //
        // Weighted toward BENDING rather than sinking. With no knee joint a
        // deep crouch just lowers the whole figure into the paving, which read
        // as clipping rather than as reaching; most of the motion is therefore
        // in the forward hinge at the root, with the legs swung back under him
        // so his feet stay planted instead of sliding out in front.
        const u = MathUtils.clamp(phaseElapsed / PICKUP_TIME, 0, 1)
        const dip = Math.sin(u * Math.PI)
        crouch = -0.22 * dip
        lean = 0.62 * dip
        if (l.legs[0]) l.legs[0].rotation.x = -0.24 * dip
        if (l.legs[1]) l.legs[1].rotation.x = -0.24 * dip
        if (l.arms[1]) l.arms[1].rotation.x = -1.45 * dip
        if (l.arms[0]) l.arms[0].rotation.x = 0.2 * dip
      } else if (phase === 'HOLDING' || phase === 'TRANSFORMING') {
        // Holds it out in front of him and considers it.
        if (l.arms[1]) l.arms[1].rotation.x = -1.25
        if (l.arms[0]) l.arms[0].rotation.x = 0.1
      } else if (phase === 'PREPARING_KICK') {
        const u = MathUtils.clamp(phaseElapsed / PREPARE_TIME, 0, 1)
        // Lowers the arm as the ball goes down to his feet, then a small
        // crouch as he sets himself.
        if (l.arms[1]) l.arms[1].rotation.x = -1.25 * (1 - u)
        crouch = -0.1 * Math.sin(u * Math.PI)
        lean = 0.16 * u
      } else if (phase === 'KICKING') {
        const u = MathUtils.clamp(phaseElapsed / KICK_TIME, 0, 1)
        // Positive rotation.x swings a leg BACK (the pivot hangs down -Y, and
        // R_x maps -Y toward -Z, which is behind him). So: wind up positive,
        // strike through to negative, then settle.
        let kick: number
        // Amplitudes kept moderate on purpose: the leg is one rigid piece
        // pivoting at the hip, and past about 50 degrees the gap between the
        // thigh and the shorts opens up and the limb reads as detached.
        if (u < 0.45) kick = 0.55 * (u / 0.45)
        else if (u < 0.62) kick = 0.55 - 1.4 * ((u - 0.45) / 0.17)
        else kick = -0.85 * (1 - (u - 0.62) / 0.38)
        if (l.legs[1]) l.legs[1].rotation.x = kick
        if (l.legs[0]) l.legs[0].rotation.x = -0.12
        // Arms swing opposite for balance, and he leans back through the kick.
        if (l.arms[0]) l.arms[0].rotation.x = -kick * 0.5
        if (l.arms[1]) l.arms[1].rotation.x = kick * 0.35
        lean = -0.22 * Math.max(0, -kick)
      } else if (phase === 'WATCHING') {
        const u = MathUtils.clamp(phaseElapsed / WATCH_TIME, 0, 1)
        // Unwinds from the follow-through back to standing.
        if (l.legs[1]) l.legs[1].rotation.x = -0.28 * (1 - u)
        if (l.legs[0]) l.legs[0].rotation.x = 0
      }
    }

    root.position.set(
      pos.current.x,
      // Two bobs per stride: the body rises on each footfall.
      Math.abs(Math.sin(stride.current)) * BOB_HEIGHT * swingAmp.current + crouch,
      pos.current.z,
    )
    root.rotation.y = bodyYaw.current
    // A touch of lean into the walk, and a roll with the step.
    root.rotation.z = Math.sin(stride.current) * 0.018 * swingAmp.current
    root.rotation.x = -0.03 * swingAmp.current
    if (bendRef.current) bendRef.current.rotation.x = lean

    // --- Where the ball is while he has it --------------------------------
    // Written to victorState, which is the ONLY channel <Ball> reads. He is
    // moving a kinematic body's target position; no force is involved.
    const handWorld = (local: Vector3) => {
      const s = Math.sin(bodyYaw.current)
      const c = Math.cos(bodyYaw.current)
      return new Vector3(
        pos.current.x + local.x * c + local.z * s,
        root.position.y + local.y,
        pos.current.z - local.x * s + local.z * c,
      )
    }

    if (victorState.held) {
      let p: Vector3
      if (phase === 'PICKING_UP') {
        const u = MathUtils.clamp(phaseElapsed / PICKUP_TIME, 0, 1)
        // Sits on the grass until his hand actually reaches it at the bottom
        // of the crouch, then comes up with him.
        const lift = MathUtils.clamp((u - 0.4) / 0.6, 0, 1)
        p = grabPoint.current.clone().lerp(handWorld(HAND_LOW), lift * lift)
      } else {
        p = handWorld(HAND_HIGH)
      }
      victorState.heldX = p.x
      victorState.heldY = p.y
      victorState.heldZ = p.z
      footballPos.current.copy(p)
    }

    // --- The football ------------------------------------------------------
    // A purely visual object: no collider, no rigid body, and a scripted
    // trajectory rather than a Rapier one, so where it goes is decided here
    // and cannot vary with contacts, damping or frame rate.
    let footballScale = 1
    if (phase === 'TRANSFORMING') {
      const u = MathUtils.clamp(phaseElapsed / TRANSFORM_TIME, 0, 1)
      // A pop with a little overshoot, because a linear grow reads as a bug.
      footballScale = u < 0.7 ? (u / 0.7) * 1.18 : 1.18 - 0.18 * ((u - 0.7) / 0.3)
    } else if (phase === 'PREPARING_KICK') {
      const u = MathUtils.clamp(phaseElapsed / PREPARE_TIME, 0, 1)
      // Falls out of his hands rather than being teleported down: quadratic in
      // u, so it accelerates downward the way a dropped ball does, and settled
      // on the spot well before the wind-up starts.
      footballPos.current.lerpVectors(
        dropFrom.current,
        kickSpot.current,
        MathUtils.clamp(u * u * 1.6, 0, 1),
      )
    } else if (phase === 'KICKING') {
      if (phaseElapsed < KICK_RELEASE) {
        footballPos.current.copy(kickSpot.current)
      } else {
        flight.current = phaseElapsed - KICK_RELEASE
      }
    } else if (phase === 'WATCHING' && flight.current !== null) {
      flight.current += dt
    }

    if (flight.current !== null) {
      const t = flight.current
      footballPos.current.set(
        kickSpot.current.x + KICK_DIR[0] * KICK_SPEED_H * t,
        kickSpot.current.y + KICK_V0 * t - 0.5 * KICK_G * t * t,
        kickSpot.current.z + KICK_DIR[1] * KICK_SPEED_H * t,
      )
      if (t > FOOTBALL_DESPAWN) footballVisible.current = false
    }

    const fb = footballRef.current
    if (fb) {
      fb.visible = footballVisible.current
      if (footballVisible.current) {
        fb.position.copy(footballPos.current)
        fb.scale.setScalar(footballScale)
        // Spins about the axis it is travelling round, so the pattern reads as
        // motion rather than a sticker.
        if (flight.current !== null) {
          fb.rotation.x -= dt * 7
          fb.rotation.z += dt * 2.5
        }
      }
    }

    // --- Camera focus ------------------------------------------------------
    // A weight, not a takeover: <GameCamera> blends toward this point through
    // its own smoothing, so the reframe is a drift and the return is a drift.
    // Deliberately zero for the whole abortable stretch — a camera move before
    // he has committed would telegraph an event the player can still cancel.
    const wantFocus =
      phase === 'PICKING_UP' || phase === 'HOLDING' || phase === 'TRANSFORMING' ||
      phase === 'PREPARING_KICK' || phase === 'KICKING' || phase === 'WATCHING'
        ? FOCUS_WEIGHT
        : 0
    focusWeight.current += (wantFocus - focusWeight.current) * (1 - Math.exp(-dt / FOCUS_TAU))
    victorState.focusWeight = focusWeight.current < 0.004 ? 0 : focusWeight.current
    // Frame him and whatever he is holding or has just kicked, with the
    // subject pinned to within FOCUS_MAX_LEAD of him so a departing football
    // cannot drag the camera off the person the gag is about.
    const raw = footballVisible.current ? footballPos.current : ballPos
    const lx = raw.x - pos.current.x
    const ly = raw.y - 1.2
    const lz = raw.z - pos.current.z
    const lead = Math.hypot(lx, ly, lz)
    const k = lead > FOCUS_MAX_LEAD ? FOCUS_MAX_LEAD / lead : 1
    victorState.focusX = pos.current.x + (lx * k) / 2
    victorState.focusY = Math.max(1.0, 1.2 + (ly * k) / 2)
    victorState.focusZ = pos.current.z + (lz * k) / 2
  })

  return (
    <>
      <group ref={rootRef}>
        <group ref={bendRef}>
          <primitive object={model} />
        </group>
      </group>
      {/* The football. Outside <Physics> by virtue of living here rather than
          in <Course>, so it has no collider and cannot be hit, hit anything,
          or become a hazard. It is a temporary object: the golf ball asset is
          untouched and returns exactly as it was. */}
      <mesh ref={footballRef} visible={false} castShadow>
        <sphereGeometry args={[FOOTBALL_RADIUS, 24, 18]} />
        <meshStandardMaterial map={footballTexture} roughness={0.65} metalness={0} />
      </mesh>
    </>
  )
}

useGLTF.preload(MODEL)
