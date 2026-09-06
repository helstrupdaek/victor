import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { MathUtils, Vector3 } from 'three'
import { ballState } from './ballState'

/**
 * Ball-centric gameplay camera, on Open-Golf's principle: the player stands
 * BEHIND the ball and looks forward over it into the course.
 *
 * The ball is the anchor of the whole system. The camera never orbits a fixed
 * world point — it orbits the ball, chases the ball, and re-settles behind the
 * ball. This replaces <OrbitControls target={CAMERA_TARGET}>, which orbited the
 * middle of the garden and gave an estate-agent overview rather than a golf
 * view.
 *
 * It is purely a camera. It reads ballState and writes camera.position /
 * camera.quaternion, and nothing else. No physics value, collider, course
 * constant, tee or hole position is touched.
 *
 * STATE MACHINE
 *   READY    ball at rest. Camera sits behind it on `yaw`, which defaults to
 *            the bearing to the hole and which the player can orbit.
 *   MOVING   ball in flight. Camera trails it on a SMOOTHED travel heading, so
 *            a hedge rebound swings the view round rather than snapping it.
 *   SETTLING ball has just come to rest. Same as READY, but the yaw is still
 *            turning back toward the hole, so the transition is a movement
 *            rather than a cut.
 *   HOLED    pull back and hold on the cup.
 */

// --- Rig geometry ----------------------------------------------------------
/**
 * Horizontal distance behind the ball, and height above it. The brief's
 * starting range was 3-6 m back and 2.5-5 m up; these sit at the far end of
 * both, deliberately. There is a real trade-off here — a low, close camera is
 * the most golf-like but it throws away the house and garden that this project
 * spent its whole visual phase making recognisable. At 6.2/3.6 the ball still
 * dominates the lower-middle of the frame and the shot direction is
 * unmistakable, while the house, the hedge line and the far trees stay in shot.
 */
const BACK_DISTANCE = 6.2
const CAMERA_HEIGHT = 3.25
/**
 * The camera aims AHEAD of the ball, not at it. This is what puts the ball in
 * the lower-middle of the viewport and gives most of the screen to what is
 * coming — aiming at the ball itself would centre it and waste the top half.
 */
// Solved rather than guessed, against measured captures. With the eye 3.25 m
// above the ball and 6.2 m back, the ball sits 27.7 degrees below horizontal.
// The look point (2.4 m ahead, 0.5 m up) tips the optical axis down 17.7, so
// the ball lands 10 degrees below centre — 43% of the way to the bottom edge
// on a 46-degree fov, i.e. about 72% down the frame. That is the lower-middle
// the brief asks for, and the remaining 72% of the screen is what lies ahead.
// The first attempt (4.6 / 1.05) put it at 88%, nearly clipped by the edge.
const LOOK_AHEAD = 2.4
const LOOK_UP = 0.5

/** Extra pull-back at speed, so a fast ball does not outrun the frame. */
const SPEED_PULLBACK = 0.085
const MAX_PULLBACK = 3.2

// --- Smoothing -------------------------------------------------------------
// Time constants, in seconds, for exponential approach. Larger is heavier.
// Framerate independence comes from 1 - exp(-dt / tau), NOT from a fixed
// per-frame lerp factor, so the feel is identical at 30, 60 and 144 Hz.
const TAU_POS_READY = 0.30
const TAU_POS_MOVING = 0.42
const TAU_LOOK = 0.22
/**
 * Heading smoothing while the ball is moving. This is the number that decides
 * whether the camera reads as a golf camera or as a GoPro taped to the ball:
 * at 0.55 s a wall rebound swings the view round over about a second instead
 * of snapping 180 degrees in one frame.
 */
const TAU_HEADING_MOVING = 0.55
/** Turning back toward the hole once the ball rests. Slower, so it reads. */
const TAU_HEADING_SETTLE = 0.5

// --- Stop detection --------------------------------------------------------
// Open-Golf's own rule: not "velocity is low" but "velocity has been low for a
// while", so a ball creeping over a seam or nudging a kerb does not flicker
// between states. This lives HERE, in the camera, and is not wired into
// scoring or shot detection — it changes nothing about how the ball behaves.
const REST_SPEED = 0.22
const REST_HOLD_SECONDS = 0.45
const MOVING_SPEED = 0.55

// --- Close to the hole -----------------------------------------------------
/** Below this distance the rig starts tightening for the putt. */
const CLOSE_RANGE = 7
const CLOSE_MIN_SCALE = 0.42

// --- Manual orbit ----------------------------------------------------------
// Live testing showed the first values were wildly oversensitive: a 150 px
// drag swung the pitch 0.6 rad straight into its stop, and 260 px of yaw spun
// the view 112 degrees. A full swipe should reorient, not spin.
const YAW_PER_PIXEL = 0.005
const PITCH_PER_PIXEL = 0.0016
const MIN_PITCH = 0.12
const MAX_PITCH = 0.95
const ZOOM_MIN = 0.62
const ZOOM_MAX = 2.1

/**
 * Boundary handling for the eye. Two jobs, and they are different.
 *
 * (1) Never enter the building. The interior is unmodelled, so a shot framed
 *     from inside it is framed through a black wall.
 * (2) When the rig puts the eye OUTSIDE the property — which it must at the
 *     tee, where the ball is 2.25 m from the end hedge and the stand-off is
 *     6.2 m — lift it enough that the boundary hedge drops out of frame.
 *
 * The hedge is not moved, shrunk or deleted; it is real property geometry. The
 * fix is composition only. Solved rather than guessed: with the eye 3.95 m
 * outside at the tee and 3.4 m up, the 0.95 m hedge sits 34.6 degrees below
 * horizontal while the frame bottom is at 40.4, so it filled the bottom 12.6%
 * of the screen. Raising the eye alone needs ~6 m to clear it — that is an
 * overview camera again — so the fov comes down to 40 as well, and then a
 * 0.35 m lift per metre outside is enough: the hedge goes to 47.2 degrees
 * against a frame bottom of 45.4, i.e. just out of shot, with the eye at 4.8 m
 * rather than 6.
 *
 * The lift is proportional, so it is zero for every ball that rests out on the
 * lawn — the normal case keeps the tuned 3.25 m height exactly.
 */
const OUTSIDE_LIFT = 0.35
/** Never closer than this, however hard the constraints push. */
const MIN_BACK = 2.2
/**
 * The building's footprint, as the eye must avoid it. Tighter in Z than the
 * first version's (-7.4, 9.4): the house ends at Z 8.0, and the extra 1.4 m
 * was reaching into the hole flare, which is open lawn the ball legitimately
 * rests on.
 */
const HOUSE_GUARD_X = -2.6
const HOUSE_GUARD_Z0 = -6.6
const HOUSE_GUARD_Z1 = 8.3

function insideBuilding(x: number, z: number) {
  return x < HOUSE_GUARD_X && z > HOUSE_GUARD_Z0 && z < HOUSE_GUARD_Z1
}

/**
 * How far behind the ball the eye can actually sit on this aim line.
 *
 * The first version clamped the eye's X and Z INDEPENDENTLY, and the lifecycle
 * test caught what that does: with the ball at (-5.38, 9.41) in the hole flare
 * and the aim east toward the cup, the desired eye at X -11.4 was clamped to
 * -2.6 by the building guard — which is on the FAR SIDE of the ball. The
 * camera ended up in front of the ball looking away from it, 96 degrees off
 * the hole, with the ball 2.2 m off-frame.
 *
 * Shortening the stand-off ALONG the aim line instead cannot do that: the eye
 * stays on the ray behind the ball by construction, and only gets closer.
 */
function usableBack(ballX: number, ballZ: number, dirX: number, dirZ: number, want: number) {
  if (!insideBuilding(ballX - dirX * want, ballZ - dirZ * want)) return want
  for (let t = want; t >= MIN_BACK; t -= 0.2) {
    if (!insideBuilding(ballX - dirX * t, ballZ - dirZ * t)) return t
  }
  return MIN_BACK
}

/**
 * Height only. The eye's horizontal position is settled by usableBack above.
 *
 * When the rig puts the eye OUTSIDE the property — which it must at the tee,
 * where the ball is 2.25 m from the end hedge and the stand-off is 6.2 m — it
 * is lifted so the boundary hedge drops out of frame. The hedge is not moved,
 * shrunk or deleted; it is real property geometry, and the fix is composition
 * only. Solved rather than guessed: with the eye 3.95 m outside at the tee and
 * 3.4 m up, the 0.95 m hedge sat 34.6 degrees below horizontal against a frame
 * bottom of 40.4, filling the bottom 12.6% of the screen. Lifting alone needs
 * ~6 m to clear it — an overview camera again — so the fov came down to 40 as
 * well, and then 0.35 m per metre outside is enough: the hedge goes to 47.2
 * degrees against a frame bottom of 45.4, i.e. just out of shot, with the eye
 * at 4.8 m rather than 6.
 *
 * Proportional, so it is exactly zero for any ball resting out on the lawn —
 * the normal case keeps the tuned 3.25 m height untouched.
 */
/**
 * Last resort for the one position the stand-off search cannot solve: a ball
 * resting in the narrow hole flare right beside the house's north end, where
 * the aim line to the cup runs straight through the building and even
 * MIN_BACK lands behind it.
 *
 * Rotating the aim away would break "the camera settles behind the intended
 * shot direction", and moving closer than MIN_BACK puts the eye on the ball.
 * So the eye goes OVER the roof instead: walls top out at 2.5 m and the roof
 * adds 1.15, so 4.6 m clears the ridge with margin, and looking down from
 * there still frames the ball and the cup beyond it.
 */
const ROOF_CLEARANCE = 4.6

function applyBoundaryLift(v: Vector3) {
  if (insideBuilding(v.x, v.z)) v.y = Math.max(v.y, ROOF_CLEARANCE)
  const outside = Math.max(0, -12.25 - v.z, v.z - 12.25, -3.32 - v.x, v.x - 11.1)
  v.y += outside * OUTSIDE_LIFT
  v.x = MathUtils.clamp(v.x, -8.5, 16)
  v.z = MathUtils.clamp(v.z, -18, 18)
  v.y = Math.max(v.y, 2.3)
}

/** Shortest signed angular difference, so yaw never takes the long way round. */
function angleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from))
}

export function GameCamera({
  holePosition,
  isAiming,
  holed,
}: {
  holePosition: [number, number, number]
  /** True while the player is dragging the ball to shoot. */
  isAiming: boolean
  holed: boolean
}) {
  const { camera, gl } = useThree()

  const yaw = useRef(0)
  const pitch = useRef(Math.atan2(CAMERA_HEIGHT, BACK_DISTANCE))
  const zoom = useRef(1)
  /** Set by a manual orbit; cleared when the ball next comes to rest. */
  const userAimed = useRef(false)
  const restTimer = useRef(0)
  const isMoving = useRef(false)
  const lastShot = useRef(0)

  const eye = useRef(new Vector3())
  const look = useRef(new Vector3())
  const initialised = useRef(false)

  // --- Manual orbit, on the DOM rather than through OrbitControls ----------
  // The brief calls out that camera controls and shot controls must not
  // compete for the same gesture. <Ball> stops propagation on its own pointer
  // events and raises isAiming, and this listener bails out on that flag, so a
  // drag that starts on the ball is a SHOT and a drag anywhere else is an AIM.
  // Two gestures, one rule, no overlap.
  useEffect(() => {
    const el = gl.domElement
    let dragging = false
    let lastX = 0
    let lastY = 0

    const down = (e: PointerEvent) => {
      if (isAiming || ballState.aiming) return
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
    }
    const move = (e: PointerEvent) => {
      if (!dragging || isAiming || ballState.aiming) return
      yaw.current -= (e.clientX - lastX) * YAW_PER_PIXEL
      pitch.current = MathUtils.clamp(
        pitch.current + (e.clientY - lastY) * PITCH_PER_PIXEL,
        MIN_PITCH,
        MAX_PITCH,
      )
      lastX = e.clientX
      lastY = e.clientY
      userAimed.current = true
    }
    const up = () => {
      dragging = false
    }
    const wheel = (e: WheelEvent) => {
      zoom.current = MathUtils.clamp(zoom.current * (1 + Math.sign(e.deltaY) * 0.08), ZOOM_MIN, ZOOM_MAX)
    }

    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    el.addEventListener('wheel', wheel, { passive: true })
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [gl, isAiming])

  useFrame((_, rawDelta) => {
    // Clamped for the same reason as the banner plane: after a background tab,
    // one frame carries the whole hidden duration and would otherwise snap the
    // camera across the garden in a single step.
    const dt = Math.min(rawDelta, 1 / 20)

    const ball = new Vector3(ballState.x, ballState.y, ballState.z)
    const hole = new Vector3(holePosition[0], 0, holePosition[2])
    const toHole = new Vector3(hole.x - ball.x, 0, hole.z - ball.z)
    const distToHole = toHole.length()

    // --- State ------------------------------------------------------------
    if (ballState.shotSerial !== lastShot.current) {
      lastShot.current = ballState.shotSerial
      // A new shot re-arms the automatic framing: whatever the player aimed at
      // is spent, and once the ball rests the camera goes back to the hole.
      userAimed.current = false
      isMoving.current = true
      restTimer.current = 0
    }
    if (ballState.speed > MOVING_SPEED) {
      isMoving.current = true
      restTimer.current = 0
    } else if (ballState.speed < REST_SPEED) {
      restTimer.current += dt
      if (restTimer.current >= REST_HOLD_SECONDS) isMoving.current = false
    }

    // --- Desired yaw ------------------------------------------------------
    let targetYaw = yaw.current
    let tauHeading = TAU_HEADING_SETTLE
    if (holed) {
      // Hold on the cup from wherever we are; no chasing a dead ball.
      targetYaw = yaw.current
    } else if (isMoving.current && ballState.speed > REST_SPEED) {
      // Follow where the ball is actually going, smoothed hard enough that a
      // rebound is a swing rather than a cut.
      targetYaw = Math.atan2(ballState.vx, ballState.vz)
      tauHeading = TAU_HEADING_MOVING
    } else if (!userAimed.current && distToHole > 0.05) {
      // At rest and not manually aimed: look from the ball toward the hole, so
      // the player is always set up for the next shot without touching
      // anything.
      targetYaw = Math.atan2(toHole.x, toHole.z)
    }
    yaw.current += angleDelta(yaw.current, targetYaw) * (1 - Math.exp(-dt / tauHeading))

    // --- Rig, tightened near the cup --------------------------------------
    // A full-size rig on a 1 m putt would put the eye past the hole and frame
    // the shot from the wrong side of it, so both the stand-off and the
    // look-ahead shrink with the remaining distance.
    const closeScale = MathUtils.clamp(
      MathUtils.lerp(CLOSE_MIN_SCALE, 1, distToHole / CLOSE_RANGE),
      CLOSE_MIN_SCALE,
      1,
    )
    const pullback = Math.min(ballState.speed * SPEED_PULLBACK, MAX_PULLBACK)
    const back = (BACK_DISTANCE * closeScale + pullback) * zoom.current
    const height = CAMERA_HEIGHT * (0.55 + 0.45 * closeScale) * zoom.current

    const dirX = Math.sin(yaw.current)
    const dirZ = Math.cos(yaw.current)

    // Height follows the manual pitch as well as the rig default, so a player
    // who drags upward genuinely raises the eye instead of nothing happening.
    const pitchScale = Math.tan(pitch.current) / Math.tan(Math.atan2(CAMERA_HEIGHT, BACK_DISTANCE))

    const usedBack = usableBack(ball.x, ball.z, dirX, dirZ, back)
    const desiredEye = new Vector3(
      ball.x - dirX * usedBack,
      ball.y + height * pitchScale,
      ball.z - dirZ * usedBack,
    )
    // The terrace pergola is the one prop tall enough to sit between the eye
    // and a resting ball: a ball that rolls onto the deck (a deliberately
    // rollable 0.13 m step) ends up under it, and the shot gets framed through
    // the roof beams. Lifting the eye above the beams looks down over them
    // instead. Cheaper and less intrusive than a general occlusion test, and
    // this is the only structure in the garden that causes it.
    if (ball.x < -2.1 && ball.z > 4.3 && ball.z < 8.4) {
      desiredEye.y = Math.max(desiredEye.y, 4.9)
    }
    applyBoundaryLift(desiredEye)

    // Never aim past the hole on an approach: the look-ahead point is capped
    // to just short of the cup, which is what keeps a short putt readable.
    const lookAhead = holed
      ? Math.max(distToHole, 0.6)
      : Math.min(LOOK_AHEAD * closeScale, Math.max(distToHole * 0.85, 1.1))
    const desiredLook = new Vector3(
      ball.x + dirX * lookAhead,
      ball.y + LOOK_UP,
      ball.z + dirZ * lookAhead,
    )

    if (!initialised.current) {
      // First frame: adopt the rig outright rather than sliding in from the
      // <Canvas> default position, which would read as a swoop on page load.
      initialised.current = true
      yaw.current = Math.atan2(toHole.x, toHole.z)
      eye.current.copy(desiredEye)
      look.current.copy(desiredLook)
    } else {
      const tauPos = isMoving.current ? TAU_POS_MOVING : TAU_POS_READY
      eye.current.lerp(desiredEye, 1 - Math.exp(-dt / tauPos))
      look.current.lerp(desiredLook, 1 - Math.exp(-dt / TAU_LOOK))
    }

    camera.position.copy(eye.current)
    camera.lookAt(look.current)
  })

  return null
}
