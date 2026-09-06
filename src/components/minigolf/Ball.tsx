import { BallCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { ballState } from './ballState'
import { victorState } from './victorState'
import { AimIndicator, type AimIndicatorHandle } from './AimIndicator'
import {
  BufferGeometry,
  Float32BufferAttribute,
  type Group,
  type Mesh,
  type Camera,
  Vector2,
  Vector3,
} from 'three'

const BALL_RADIUS = 0.15
const OUT_OF_BOUNDS_Y = -5
// ROLL LENGTH. Both were 0.4. With velocity decaying as e^(-d*t) the distance
// to a stop is roughly proportional to 1/d, so 1.15 cuts the roll to under a
// third. Raised together on purpose: damping only the linear term leaves the
// ball visibly spinning after it has stopped translating.
const LINEAR_DAMPING = 1.15
const ANGULAR_DAMPING = 1.15

/**
 * Screen drag, in normalised-device units, that reaches full power. 0.6 NDC is
 * 270 px of vertical travel on a 900 px-tall viewport: a comfortable full
 * swipe, and unchanged from the linear version so the gesture still feels the
 * same size.
 */
const DRAG_FOR_FULL_POWER = 0.6
/** Below this the drag is a click, not a shot. ~4.5 px. */
const MIN_DRAG_TO_SHOOT = 0.01

/**
 * THE POWER CURVE — piecewise-linear, mapping input fraction to LAUNCH SPEED
 * in m/s. Derived from measurement, not from picking an exponent.
 *
 * The old mapping was linear: impulse = drag x 0.4, giving 0 to 84 m/s. Two
 * things were wrong with it. A minimum tap overshot a 40 cm putt to 2.2 m, and
 * at the other end 84 m/s carries the ball 65.7 m on flat ground — in a garden
 * 24 m across, with the longest straight shot 20.8 m. So most of the input
 * range was spent on power that could never be used, and almost none of it on
 * the putting range where all the precision is needed.
 *
 * Method: calibrate_power.mjs rebuilds this ball in this world on open lawn,
 * measures speed -> flat travel, then bisects the inverse to get the launch
 * speed for a target distance. The anchors below are those measured speeds for
 * a chosen distance ladder:
 *
 *   p 0.09 -> 0.4 m     p 0.40 ->  4.5 m     p 0.80 -> 17.0 m
 *   p 0.15 -> 0.9 m     p 0.50 ->  6.5 m     p 0.90 -> 22.5 m
 *   p 0.22 -> 1.6 m     p 0.65 -> 11.0 m     p 1.00 -> 30.0 m
 *   p 0.30 -> 2.8 m
 *
 * The shape follows Open-Golf's structure — flat at the bottom, steepening
 * through the middle, steepest at the top — but the numbers are ours, because
 * its speeds are in the units of its own custom integrator, not Rapier's.
 *
 * The first 30% of drag now buys 4.32 of 40.43 m/s, i.e. 10.7% of the launch
 * speed, against the brief's "significantly less than 25-35%".
 *
 * Cutting the top from 84 to 40.4 m/s is NOT the global-force reduction the
 * brief rules out: 40.4 m/s still carries the ball 30 m, which is 1.4x the
 * longest straight shot the garden allows, leaving headroom for bank shots.
 * What it removes is 35 m of overshoot that was never reachable terrain.
 */
const POWER_ANCHORS: [number, number][] = [
  [0.0, 0.0],
  [0.09, 0.67],
  [0.15, 1.45],
  [0.22, 2.52],
  [0.3, 4.32],
  [0.4, 6.81],
  [0.5, 9.66],
  [0.65, 15.87],
  [0.8, 23.84],
  [0.9, 30.94],
  [1.0, 40.43],
]

/** Input fraction 0..1 -> launch speed in m/s. */
export function powerToSpeed(power: number): number {
  const p = Math.min(Math.max(power, 0), 1)
  for (let i = 1; i < POWER_ANCHORS.length; i++) {
    const [p1, v1] = POWER_ANCHORS[i]
    if (p <= p1) {
      const [p0, v0] = POWER_ANCHORS[i - 1]
      return v0 + ((p - p0) / (p1 - p0)) * (v1 - v0)
    }
  }
  return POWER_ANCHORS[POWER_ANCHORS.length - 1][1]
}



/**
 * The single source of truth for turning a 2D screen drag into a 3D shot.
 * Used both for the live aim-arrow preview (while dragging) and the final
 * applyImpulse call (on release), so what the player sees always matches
 * what actually happens.
 */
function computeShot(dragVector: Vector2, camera: Camera) {
  // `power` is the input fraction, 0..1. Everything downstream — the impulse,
  // the ribbon length and the ribbon colour — is derived from this one number,
  // so the indicator can never disagree with the shot.
  const power = Math.min(dragVector.length() / DRAG_FOR_FULL_POWER, 1)

  // Convert the 2D screen drag into a 3D ground-plane direction using the
  // camera's forward/right vectors, so "drag left" always means "shoot
  // right" relative to what the player sees, regardless of camera angle.
  const cameraDirection = new Vector3()
  camera.getWorldDirection(cameraDirection)
  cameraDirection.y = 0
  cameraDirection.normalize()
  const rightVector = new Vector3().crossVectors(cameraDirection, new Vector3(0, 1, 0)).normalize()

  const direction = new Vector3()
    .addScaledVector(cameraDirection, dragVector.y)
    .addScaledVector(rightVector, dragVector.x)
    .normalize()
    // Shooting is opposite the drag (like pulling back a slingshot).
    .multiplyScalar(-1)

  return { direction, power }
}

// The green/yellow/red power ramp moved to AimIndicator.tsx, which now uses
// Open-Golf's own four-stop values from its game.cfg rather than three.

// Radius of the dashed aim-range ring shown around the ball at all times —
// a rough visual indicator of shot range, not tied to the exact impulse
// math (which depends on drag distance, not a fixed world-space radius).
const AIM_RING_RADIUS = 1.3

// Open-Golf reference: within this radius of the cup, while resting/rolling
// (not mid-bounce), a small constant nudge pulls the ball toward the hole —
// a deliberate forgiveness mechanic for close putts, not a physics accident.
const HOLE_ASSIST_RADIUS = 0.5
const HOLE_ASSIST_STRENGTH = 0.05

export function Ball({
  teePosition,
  holePosition,
  onShotTaken,
  onDragStart,
  onDragEnd,
  onPositionChange,
}: {
  teePosition: [number, number, number]
  holePosition: [number, number, number]
  onShotTaken: () => void
  onDragStart?: () => void
  onDragEnd?: () => void
  onPositionChange?: (x: number, z: number) => void
}) {
    const bodyRef = useRef<RapierRigidBody>(null)
    const { camera, gl } = useThree()
    const dragStart = useRef(new Vector2())
    const dragCurrent = useRef(new Vector2())

    // The old cylinder+cone arrow is gone, replaced by <AimIndicator>: a broad
    // tapered power ribbon behind the ball plus forward direction chevrons, on
    // Open-Golf's aiming language. It is driven from THIS component's own
    // computeShot() result, so what is drawn can never disagree with the
    // impulse that is applied.
    const aimRef = useRef<AimIndicatorHandle | null>(null)
    // The aim-range ring lives outside the RigidBody's own group so it
    // doesn't spin along with the ball's rolling rotation — only its
    // position is synced to the ball each frame, below.
    const ringGroupRef = useRef<Group>(null)

    // --- Victor's Easter egg -----------------------------------------------
    // The three things the steal sequence needs from the ball, and nothing
    // else. Everything below is bookkeeping so that the ball can be lifted out
    // of the simulation and put back WITHOUT an impulse, a stroke, or any
    // change to how a shot behaves. See victorState.ts.
    const meshRef = useRef<Mesh>(null)
    /** True while this component has the body switched to kinematic. */
    const heldNow = useRef(false)
    const lastRespawn = useRef(victorState.respawnSerial)

    const ringGeometry = useMemo(() => {
      const segments = 64
      const points: Vector3[] = []
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2
        points.push(new Vector3(Math.cos(angle) * AIM_RING_RADIUS, 0, Math.sin(angle) * AIM_RING_RADIUS))
      }
      const geometry = new BufferGeometry().setFromPoints(points)
      // LineDashedMaterial needs a cumulative "lineDistance" attribute along
      // the path (normally set by THREE.Line's computeLineDistances(), which
      // lives on the Object3D, not the geometry) — computed by hand here so
      // it's ready as soon as the geometry is created.
      const distances: number[] = [0]
      for (let i = 1; i < points.length; i++) {
        distances.push(distances[i - 1] + points[i].distanceTo(points[i - 1]))
      }
      geometry.setAttribute('lineDistance', new Float32BufferAttribute(distances, 1))
      return geometry
    }, [])

    function toNormalizedDevice(clientX: number, clientY: number): Vector2 {
      const rect = gl.domElement.getBoundingClientRect()
      return new Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      )
    }

    function updateAimIndicator() {
      const dragVector = new Vector2().subVectors(dragCurrent.current, dragStart.current)
      if (dragVector.lengthSq() < 1e-8) {
        aimRef.current?.hide()
        return
      }
      const { direction, power } = computeShot(dragVector, camera)
      const body = bodyRef.current
      if (!body) return
      const t = body.translation()
      aimRef.current?.update(new Vector3(t.x, t.y, t.z), direction, power)
    }

    /**
     * The live values the window listeners below need.
     *
     * They are registered once, for the life of the component, so they cannot
     * close over props: `onShotTaken` and friends are inline arrows and get a
     * new identity every render. Re-registering the listeners on every render
     * instead would drop a listener mid-drag.
     */
    const latest = useRef({ camera, onShotTaken, onDragEnd })
    latest.current = { camera, onShotTaken, onDragEnd }
    /** Set synchronously, unlike the isDragging React state. */
    const dragging = useRef(false)

    function handlePointerDown(event: React.PointerEvent) {
      event.stopPropagation()
      // Once Victor has committed to the steal the ball is his prop, not a
      // playable object. Refusing the gesture at the very start is what makes
      // "the player can never hit a held ball" true by construction rather
      // than by timing.
      if (victorState.inputLocked) return
      dragging.current = true
      ballState.aiming = true
      dragStart.current.copy(toNormalizedDevice(event.clientX, event.clientY))
      dragCurrent.current.copy(dragStart.current)
      // Capture on the CANVAS, not on the event target. The pointer has to keep
      // reporting once it leaves the canvas, and the canvas is the element the
      // window listeners below are anchored to.
      try {
        gl.domElement.setPointerCapture(event.pointerId)
      } catch {
        // Some browsers refuse capture for a pointer that has already been
        // released; the window listeners still see the events, so this is not
        // worth failing the shot over.
      }
      onDragStart?.()
    }

    function releaseShot() {
      if (!dragging.current) return
      dragging.current = false
      ballState.aiming = false
      aimRef.current?.hide()
      latest.current.onDragEnd?.()
      const body = bodyRef.current
      if (!body) return

      const dragVector = new Vector2().subVectors(dragCurrent.current, dragStart.current)
      const { direction: shotDirection, power } = computeShot(dragVector, latest.current.camera)
      if (dragVector.length() < MIN_DRAG_TO_SHOOT) return // a click, not a shot
      // Second guard: the lock can engage mid-drag, between pointerdown and
      // pointerup. Dropping the release rather than the press means the drag
      // that was already in flight is discarded, not applied to a held ball.
      if (victorState.inputLocked) return

      // The curve is expressed in LAUNCH SPEED, so convert with the body's own
      // mass rather than a hard-coded impulse scale. If the collider ever
      // changes size the curve still means exactly what it says.
      const impulseMagnitude = powerToSpeed(power) * body.mass()
      body.applyImpulse(
        { x: shotDirection.x * impulseMagnitude, y: 0, z: shotDirection.z * impulseMagnitude },
        true,
      )
      ballState.shotSerial += 1
      latest.current.onShotTaken()
    }

    /**
     * Aiming and release live on the WINDOW, not on the ball mesh.
     *
     * They were mesh handlers, which meant r3f only delivered them while the
     * pointer ray still hit the ball. Drag far enough — off the ball, or right
     * out of the canvas — and the release was never seen: the shot never fired,
     * `aiming` stayed true and the power ribbon hung on screen until the next
     * click. Reported as "you just have an arrow showing the speed".
     *
     * pointerdown stays on the mesh, because starting ON the ball is what
     * distinguishes a shot from a camera orbit. Everything after that belongs
     * to the drag, wherever the pointer goes.
     */
    useEffect(() => {
      const move = (event: PointerEvent) => {
        if (!dragging.current) return
        dragCurrent.current.copy(toNormalizedDevice(event.clientX, event.clientY))
        updateAimIndicator()
      }
      const end = () => releaseShot()
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', end)
      window.addEventListener('pointercancel', end)
      // A drag that ends with the window losing focus (alt-tab, a system
      // dialog) never produces pointerup at all.
      window.addEventListener('blur', end)
      return () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', end)
        window.removeEventListener('pointercancel', end)
        window.removeEventListener('blur', end)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Safety net: if the ball ever tunnels through a wall or otherwise ends
    // up off the course with no floor beneath it, bring it back to the tee
    // rather than letting it fall forever and permanently break the game.
    // This is purely a recovery mechanism — the shot that caused it was
    // already counted by onShotTaken, so no extra scoring happens here.
    useFrame(() => {
      const body = bodyRef.current
      if (!body) return

      // --- Victor's Easter egg, handled before anything else ---------------
      // The golf ball mesh is hidden for the stretch where it is visually a
      // football. The collider is not removed; the body is kinematic by then,
      // so it cannot be hit and cannot hit anything.
      if (meshRef.current) meshRef.current.visible = !victorState.hidden
      // The aim ring and the power ribbon are shot affordances. Showing them
      // on a ball that cannot be played reads as a bug, so they go with it.
      if (ringGroupRef.current) ringGroupRef.current.visible = !victorState.inputLocked
      if (victorState.inputLocked) aimRef.current?.hide()

      if (victorState.held !== heldNow.current) {
        heldNow.current = victorState.held
        if (victorState.held) {
          // Kinematic, so Rapier stops integrating it: gravity, damping,
          // contacts and the hole assist all go quiet while Victor has it. No
          // impulse is applied in either direction — this is a body-type
          // change, not a force.
          body.setBodyType(2, true)
        } else {
          body.setBodyType(0, true)
          // Explicitly zeroed on the way back: a kinematic body that was moved
          // each frame carries a derived velocity, and inheriting Victor's arm
          // speed as a free shot is exactly the "no impulse" rule being broken.
          body.setLinvel({ x: 0, y: 0, z: 0 }, true)
          body.setAngvel({ x: 0, y: 0, z: 0 }, true)
        }
      }

      if (victorState.respawnSerial !== lastRespawn.current) {
        lastRespawn.current = victorState.respawnSerial
        const [tx, ty, tz] = teePosition
        body.setTranslation({ x: tx, y: ty, z: tz }, true)
        body.setLinvel({ x: 0, y: 0, z: 0 }, true)
        body.setAngvel({ x: 0, y: 0, z: 0 }, true)
        // Deliberately NOT onShotTaken(): the Easter egg is not a penalty
        // stroke, so the count is untouched. Same reasoning as the
        // out-of-bounds recovery below.
        onPositionChange?.(tx, tz)
      }

      if (victorState.held) {
        // Follow Victor's hand. setNextKinematicTranslation is the right call
        // for a kinematicPositionBased body: Rapier interpolates to it and
        // resolves contacts against it, rather than teleporting it.
        body.setNextKinematicTranslation({
          x: victorState.heldX,
          y: victorState.heldY,
          z: victorState.heldZ,
        })
        ballState.x = victorState.heldX
        ballState.y = victorState.heldY
        ballState.z = victorState.heldZ
        ballState.vx = 0
        ballState.vy = 0
        ballState.vz = 0
        ballState.speed = 0
        return
      }

      const translation = body.translation()
      if (translation.y < OUT_OF_BOUNDS_Y) {
        const [x, y, z] = teePosition
        body.setTranslation({ x, y, z }, true)
        body.setLinvel({ x: 0, y: 0, z: 0 }, true)
        body.setAngvel({ x: 0, y: 0, z: 0 }, true)
        onPositionChange?.(x, z)
        return
      }

      // Hole-force assist (Open-Golf reference): nudge the ball toward the
      // cup when it's close and rolling, not mid-bounce (checked via a small
      // vertical-velocity threshold) — a deliberate near-miss forgiveness,
      // not a substitute for the actual hole-sink sensor in Course.tsx.
      const linvel = body.linvel()
      const dxHole = holePosition[0] - translation.x
      const dzHole = holePosition[2] - translation.z
      const distToHole = Math.sqrt(dxHole * dxHole + dzHole * dzHole)
      if (distToHole > 1e-4 && distToHole < HOLE_ASSIST_RADIUS && Math.abs(linvel.y) < 0.5) {
        const nx = dxHole / distToHole
        const nz = dzHole / distToHole
        body.setLinvel(
          { x: linvel.x + nx * HOLE_ASSIST_STRENGTH, y: linvel.y, z: linvel.z + nz * HOLE_ASSIST_STRENGTH },
          true,
        )
      }

      // Publish position and velocity for the camera (ballState.ts). This is
      // the ONLY thing added to this file for the ball-centric camera: it is a
      // one-way report, and nothing below or above reads it back, so no shot
      // power, damping, friction, restitution or hole behaviour is affected.
      ballState.x = translation.x
      ballState.y = translation.y
      ballState.z = translation.z
      ballState.vx = linvel.x
      ballState.vy = linvel.y
      ballState.vz = linvel.z
      ballState.speed = Math.hypot(linvel.x, linvel.z)

      // Keep the aim-range ring centered on the ball's current position
      // (position only — deliberately not the ball's rolling rotation).
      if (ringGroupRef.current) {
        ringGroupRef.current.position.set(translation.x, 0.02, translation.z)
      }
      onPositionChange?.(translation.x, translation.z)
    })

  return (
    <>
    {/* Dashed aim-range ring — always visible, position-synced to the ball
        but deliberately outside the RigidBody so it doesn't spin with the
        ball's rolling rotation. */}
    <group ref={ringGroupRef} position={teePosition}>
      <lineLoop geometry={ringGeometry}>
        <lineDashedMaterial color="#ffffff" dashSize={0.15} gapSize={0.12} transparent opacity={0.85} />
      </lineLoop>
    </group>
    <RigidBody
      ref={bodyRef}
      position={teePosition}
      colliders={false}
      restitution={0.5}
      friction={0.6}
      linearDamping={LINEAR_DAMPING}
      angularDamping={ANGULAR_DAMPING}
      ccd={true}
    >
      <BallCollider args={[BALL_RADIUS]} />
      <mesh
        ref={meshRef}
        castShadow
        onPointerDown={handlePointerDown}
      >
        <sphereGeometry args={[BALL_RADIUS, 16, 16]} />
        <meshStandardMaterial color="white" />
      </mesh>

    </RigidBody>
    <AimIndicator handleRef={aimRef} />
    </>
  )
}
