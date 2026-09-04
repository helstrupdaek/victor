import { BallCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { useThree } from '@react-three/fiber'
import { useRef, useState } from 'react'
import { Vector2, Vector3 } from 'three'

const BALL_RADIUS = 0.15
const MAX_DRAG_DISTANCE = 3
const IMPULSE_SCALE = 0.8

export function Ball({
  teePosition,
  onShotTaken,
}: {
  teePosition: [number, number, number]
  onShotTaken: () => void
}) {
    const bodyRef = useRef<RapierRigidBody>(null)
    const { camera, gl } = useThree()
    const [isDragging, setIsDragging] = useState(false)
    const dragStart = useRef(new Vector2())
    const dragCurrent = useRef(new Vector2())

    function toNormalizedDevice(clientX: number, clientY: number): Vector2 {
      const rect = gl.domElement.getBoundingClientRect()
      return new Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      )
    }

    function handlePointerDown(event: React.PointerEvent) {
      event.stopPropagation()
      setIsDragging(true)
      dragStart.current.copy(toNormalizedDevice(event.clientX, event.clientY))
      dragCurrent.current.copy(dragStart.current)
      ;(event.target as Element).setPointerCapture(event.pointerId)
    }

    function handlePointerMove(event: React.PointerEvent) {
      if (!isDragging) return
      dragCurrent.current.copy(toNormalizedDevice(event.clientX, event.clientY))
    }

    function handlePointerUp(_event: React.PointerEvent) {
      if (!isDragging) return
      setIsDragging(false)
      const body = bodyRef.current
      if (!body) return

      const dragVector = new Vector2().subVectors(dragCurrent.current, dragStart.current)
      const dragDistance = Math.min(dragVector.length() * 5, MAX_DRAG_DISTANCE)
      if (dragDistance < 0.05) return // treat as a click, not a shot

      // Convert the 2D screen drag into a 3D ground-plane direction using
      // the camera's forward/right vectors, so "drag left" always means
      // "shoot right" relative to what the player sees, regardless of
      // camera angle.
      const cameraDirection = new Vector3()
      camera.getWorldDirection(cameraDirection)
      cameraDirection.y = 0
      cameraDirection.normalize()
      const rightVector = new Vector3().crossVectors(cameraDirection, new Vector3(0, 1, 0)).normalize()

      const shotDirection = new Vector3()
        .addScaledVector(cameraDirection, dragVector.y)
        .addScaledVector(rightVector, dragVector.x)
        .normalize()
        // Shooting is opposite the drag (like pulling back a slingshot).
        .multiplyScalar(-1)

      const impulseMagnitude = dragDistance * IMPULSE_SCALE
      body.applyImpulse(
        { x: shotDirection.x * impulseMagnitude, y: 0, z: shotDirection.z * impulseMagnitude },
        true,
      )
      onShotTaken()
    }

  return (
    <RigidBody
      ref={bodyRef}
      position={teePosition}
      colliders={false}
      restitution={0.5}
      friction={0.6}
      linearDamping={0.4}
      angularDamping={0.4}
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
  )
}
