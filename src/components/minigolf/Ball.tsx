import { BallCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  type Group,
  type Mesh,
  type MeshStandardMaterial,
  type Camera,
  Vector2,
  Vector3,
} from 'three'

const BALL_RADIUS = 0.15
const MAX_DRAG_DISTANCE = 3
const IMPULSE_SCALE = 0.8
const OUT_OF_BOUNDS_Y = -5
const MIN_DRAG_TO_SHOOT = 0.05

const AIM_ARROW_LENGTH = 0.9
const AIM_ARROW_CONE_HEIGHT = 0.28

const COLOR_GENTLE = new Color('#22c55e') // green
const COLOR_MEDIUM = new Color('#eab308') // yellow
const COLOR_MAX = new Color('#ef4444') // red

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

/** Interpolate green -> yellow -> red as t goes from 0 to 1. */
function powerColor(t: number, target: Color) {
  const clamped = Math.min(Math.max(t, 0), 1)
  if (clamped < 0.5) {
    target.copy(COLOR_GENTLE).lerp(COLOR_MEDIUM, clamped * 2)
  } else {
    target.copy(COLOR_MEDIUM).lerp(COLOR_MAX, (clamped - 0.5) * 2)
  }
}

const UP = new Vector3(0, 1, 0)

// Radius of the dashed aim-range ring shown around the ball at all times —
// a rough visual indicator of shot range, not tied to the exact impulse
// math (which depends on drag distance, not a fixed world-space radius).
const AIM_RING_RADIUS = 1.3

export function Ball({
  teePosition,
  onShotTaken,
  onDragStart,
  onDragEnd,
  onPositionChange,
}: {
  teePosition: [number, number, number]
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

    const arrowGroupRef = useRef<Group>(null)
    const shaftMeshRef = useRef<Mesh>(null)
    const coneMeshRef = useRef<Mesh>(null)
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

    function updateAimArrow() {
      const arrowGroup = arrowGroupRef.current
      if (!arrowGroup) return

      const dragVector = new Vector2().subVectors(dragCurrent.current, dragStart.current)
      if (dragVector.lengthSq() < 1e-8) {
        arrowGroup.visible = false
        return
      }
      arrowGroup.visible = true

      const { direction, dragDistance } = computeShot(dragVector, camera)
      arrowGroup.quaternion.setFromUnitVectors(UP, direction)

      const powerT = dragDistance / MAX_DRAG_DISTANCE
      const stretch = 0.6 + powerT // longer arrow = more power
      arrowGroup.scale.set(1, stretch, 1)

      const shaftMat = shaftMeshRef.current?.material as MeshStandardMaterial | undefined
      const coneMat = coneMeshRef.current?.material as MeshStandardMaterial | undefined
      if (shaftMat) powerColor(powerT, shaftMat.color)
      if (coneMat) powerColor(powerT, coneMat.color)
    }

    function handlePointerDown(event: React.PointerEvent) {
      event.stopPropagation()
      setIsDragging(true)
      dragStart.current.copy(toNormalizedDevice(event.clientX, event.clientY))
      dragCurrent.current.copy(dragStart.current)
      ;(event.target as Element).setPointerCapture(event.pointerId)
      onDragStart?.()
    }

    function handlePointerMove(event: React.PointerEvent) {
      if (!isDragging) return
      dragCurrent.current.copy(toNormalizedDevice(event.clientX, event.clientY))
      updateAimArrow()
    }

    function handlePointerUp(_event: React.PointerEvent) {
      if (!isDragging) return
      setIsDragging(false)
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
      linearDamping={0.4}
      angularDamping={0.4}
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

      {isDragging && (
        <group ref={arrowGroupRef} visible={false}>
          <mesh ref={shaftMeshRef} position={[0, BALL_RADIUS + AIM_ARROW_LENGTH / 2, 0]}>
            <cylinderGeometry args={[0.025, 0.025, AIM_ARROW_LENGTH, 8]} />
            <meshStandardMaterial color={COLOR_GENTLE} />
          </mesh>
          <mesh
            ref={coneMeshRef}
            position={[0, BALL_RADIUS + AIM_ARROW_LENGTH + AIM_ARROW_CONE_HEIGHT / 2, 0]}
          >
            <coneGeometry args={[0.08, AIM_ARROW_CONE_HEIGHT, 8]} />
            <meshStandardMaterial color={COLOR_GENTLE} />
          </mesh>
        </group>
      )}
    </RigidBody>
    </>
  )
}
