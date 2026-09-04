import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'

const COURSE_WIDTH = 10
const COURSE_LENGTH = 16
const WALL_HEIGHT = 1

export const TEE_POSITION: [number, number, number] = [0, 0.2, -6]
const HOLE_POSITION: [number, number, number] = [3, 0.05, 6]
const HOUSE_POSITION: [number, number, number] = [-1, 0.5, 0]
const TREE_POSITION: [number, number, number] = [2, 0.5, 2]

export function Course({ onHoleEnter }: { onHoleEnter: () => void }) {
  return (
    <group>
      {/* Ground */}
      <RigidBody type="fixed" colliders="cuboid" friction={0.8}>
        <mesh position={[0, -0.05, 0]} receiveShadow>
          <boxGeometry args={[COURSE_WIDTH, 0.1, COURSE_LENGTH]} />
          <meshStandardMaterial color="#4a7c3f" />
        </mesh>
      </RigidBody>

      {/* Boundary walls (invisible-ish, low-opacity so players can still see the edge) */}
      <RigidBody type="fixed" colliders={false} restitution={0.4}>
        <CuboidCollider args={[0.1, WALL_HEIGHT, COURSE_LENGTH / 2]} position={[-COURSE_WIDTH / 2, WALL_HEIGHT / 2, 0]} />
        <CuboidCollider args={[0.1, WALL_HEIGHT, COURSE_LENGTH / 2]} position={[COURSE_WIDTH / 2, WALL_HEIGHT / 2, 0]} />
        <CuboidCollider args={[COURSE_WIDTH / 2, WALL_HEIGHT, 0.1]} position={[0, WALL_HEIGHT / 2, -COURSE_LENGTH / 2]} />
        <CuboidCollider args={[COURSE_WIDTH / 2, WALL_HEIGHT, 0.1]} position={[0, WALL_HEIGHT / 2, COURSE_LENGTH / 2]} />
      </RigidBody>

      {/* House stand-in — a plain block to bank shots around */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={HOUSE_POSITION} castShadow>
          <boxGeometry args={[2.5, 1, 3]} />
          <meshStandardMaterial color="#8a7f6a" />
        </mesh>
      </RigidBody>

      {/* Tree obstacle */}
      <RigidBody type="fixed" colliders={false} restitution={0.5}>
        <CylinderCollider args={[0.5, 0.3]} position={TREE_POSITION} />
        <mesh position={TREE_POSITION} castShadow>
          <cylinderGeometry args={[0.3, 0.3, 1, 12]} />
          <meshStandardMaterial color="#5b3a29" />
        </mesh>
      </RigidBody>

      {/* Hole (visual cup) + sensor that detects the ball */}
      <mesh position={[HOLE_POSITION[0], 0.01, HOLE_POSITION[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.25, 24]} />
        <meshStandardMaterial color="#111111" />
      </mesh>
      <RigidBody type="fixed" colliders={false} sensor onIntersectionEnter={onHoleEnter}>
        <CuboidCollider args={[0.25, 0.3, 0.25]} position={HOLE_POSITION} />
      </RigidBody>
    </group>
  )
}
