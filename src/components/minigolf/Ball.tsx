import { BallCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import { ballState } from './ballState'
import { AimIndicator, type AimIndicatorHandle } from './AimIndicator'
import {
  BufferGeometry,
  Float32BufferAttribute,
  type Group,
  type Camera,
  Vector2,
  Vector3,
} from 'three'

const BALL_RADIUS = 0.15
const MAX_DRAG_DISTANCE = 3
// HALVED, 0.8 -> 0.4, at the owner's request: maximum shot speed goes from
// ~167 m/s to ~84 m/s. Scaling the impulse rather than shortening
// MAX_DRAG_DISTANCE keeps the full drag range available for fine control —
// capping the drag instead would have made the whole power range reachable in
// half a swipe, which is harder to aim, not easier.
//
// It also all but closes the recorded bush-launch defect: the headless
// revalidation measured its onset at 80 m/s, so the reachable window shrinks
// from 87 m/s wide to about 4. See gameplay-tuning-doc.md.
const IMPULSE_SCALE = 0.4
const OUT_OF_BOUNDS_Y = -5
// ROLL LENGTH. Both were 0.4. The owner reported the ball still running on far
// too long after the power halving, and with velocity decaying as e^(-d*t) the
// distance to a stop is roughly proportional to 1/d — so 1.15 cuts the roll to
// under a third of what it was, on top of the halved launch speed.
// Raised together on purpose: damping only the linear term leaves the ball
// visibly spinning after it has stopped translating.
const LINEAR_DAMPING = 1.15
const ANGULAR_DAMPING = 1.15
const MIN_DRAG_TO_SHOOT = 0.05



/**
 * The single source of truth for turning a 2D screen drag into a 3D shot.
 * Used both for the live aim-arrow preview (while dragging) and the final
 * applyImpulse call (on release), so what the player sees always matches
 * what actually happens.
 */
function computeShot(dragVector: Vector2, camera: Camera) {
  const dragDistance = Math.min(dragVector.length() * 5, MAX_DRAG_DISTANCE)

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

  return { direction, dragDistance }
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
    const [isDragging, setIsDragging] = useState(false)
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
      const { direction, dragDistance } = computeShot(dragVector, camera)
      const body = bodyRef.current
      if (!body) return
      const t = body.translation()
      aimRef.current?.update(
        new Vector3(t.x, t.y, t.z),
        direction,
        Math.min(dragDistance / MAX_DRAG_DISTANCE, 1),
      )
    }

    function handlePointerDown(event: React.PointerEvent) {
      event.stopPropagation()
      setIsDragging(true)
      ballState.aiming = true
      dragStart.current.copy(toNormalizedDevice(event.clientX, event.clientY))
      dragCurrent.current.copy(dragStart.current)
      ;(event.target as Element).setPointerCapture(event.pointerId)
      onDragStart?.()
    }

    function handlePointerMove(event: React.PointerEvent) {
      if (!isDragging) return
      dragCurrent.current.copy(toNormalizedDevice(event.clientX, event.clientY))
      updateAimIndicator()
    }

    function handlePointerUp(_event: React.PointerEvent) {
      if (!isDragging) return
      setIsDragging(false)
      ballState.aiming = false
      aimRef.current?.hide()
      onDragEnd?.()
      const body = bodyRef.current
      if (!body) return

      const dragVector = new Vector2().subVectors(dragCurrent.current, dragStart.current)
      const { direction: shotDirection, dragDistance } = computeShot(dragVector, camera)
      if (dragDistance < MIN_DRAG_TO_SHOOT) return // treat as a click, not a shot

      const impulseMagnitude = dragDistance * IMPULSE_SCALE
      body.applyImpulse(
        { x: shotDirection.x * impulseMagnitude, y: 0, z: shotDirection.z * impulseMagnitude },
        true,
      )
      ballState.shotSerial += 1
      onShotTaken()
    }

    // Safety net: if the ball ever tunnels through a wall or otherwise ends
    // up off the course with no floor beneath it, bring it back to the tee
    // rather than letting it fall forever and permanently break the game.
    // This is purely a recovery mechanism — the shot that caused it was
    // already counted by onShotTaken, so no extra scoring happens here.
    useFrame(() => {
      const body = bodyRef.current
      if (!body) return
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
        castShadow
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <sphereGeometry args={[BALL_RADIUS, 16, 16]} />
        <meshStandardMaterial color="white" />
      </mesh>

    </RigidBody>
    <AimIndicator handleRef={aimRef} />
    </>
  )
}
