import { BallCollider, CuboidCollider, RigidBody } from '@react-three/rapier'

// Course modeled loosely on the real party garden: tee on the grass strip
// by the carport, a long open lawn bordered by the house along one edge,
// a round clipped bush to bank shots around partway along, and the cup in
// the far corner near a (purely decorative) apple tree.
const COURSE_WIDTH = 10
const COURSE_LENGTH = 22
const WALL_HEIGHT = 2

export const TEE_POSITION: [number, number, number] = [-3, 0.2, -10]
const HOLE_POSITION: [number, number, number] = [3, 0.05, 10]
// House stand-in runs along one long edge of the lawn, rather than sitting
// centrally in the middle of the play area.
const HOUSE_POSITION: [number, number, number] = [-4.25, 0.75, 1]
const HOUSE_SIZE: [number, number, number] = [1.5, 1.5, 14]
// Round clipped bush — a real dome-shaped shrub, modeled as a sphere
// rather than the previous thin cylinder "tree" trunk.
const BUSH_POSITION: [number, number, number] = [1, 0.6, 0]
const BUSH_RADIUS = 0.6
// Decorative apple tree near the hole — purely visual, no collider, so it
// doesn't make the final putt unfairly harder.
const APPLE_TREE_POSITION: [number, number, number] = [4.2, 0.6, 8.7]

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
        <CuboidCollider args={[0.4, WALL_HEIGHT, COURSE_LENGTH / 2]} position={[-COURSE_WIDTH / 2, WALL_HEIGHT / 2, 0]} />
        <CuboidCollider args={[0.4, WALL_HEIGHT, COURSE_LENGTH / 2]} position={[COURSE_WIDTH / 2, WALL_HEIGHT / 2, 0]} />
        <CuboidCollider args={[COURSE_WIDTH / 2, WALL_HEIGHT, 0.4]} position={[0, WALL_HEIGHT / 2, -COURSE_LENGTH / 2]} />
        <CuboidCollider args={[COURSE_WIDTH / 2, WALL_HEIGHT, 0.4]} position={[0, WALL_HEIGHT / 2, COURSE_LENGTH / 2]} />
      </RigidBody>

      {/* House — runs along one long edge of the lawn */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={HOUSE_POSITION} castShadow>
          <boxGeometry args={HOUSE_SIZE} />
          <meshStandardMaterial color="#8a7f6a" />
        </mesh>
      </RigidBody>

      {/* Round clipped bush — a dome-shaped shrub to bank shots around */}
      <RigidBody type="fixed" colliders={false} restitution={0.5}>
        <BallCollider args={[BUSH_RADIUS]} position={BUSH_POSITION} />
        <mesh position={BUSH_POSITION} castShadow>
          <sphereGeometry args={[BUSH_RADIUS, 20, 16]} />
          <meshStandardMaterial color="#3f6b34" />
        </mesh>
      </RigidBody>

      {/* Apple tree near the hole — decorative only, no collider */}
      <group position={APPLE_TREE_POSITION}>
        <mesh castShadow position={[0, 0, 0]}>
          <cylinderGeometry args={[0.08, 0.1, 1.2, 8]} />
          <meshStandardMaterial color="#5b3a29" />
        </mesh>
        <mesh castShadow position={[0, 0.85, 0]}>
          <sphereGeometry args={[0.55, 16, 12]} />
          <meshStandardMaterial color="#4f7a3a" />
        </mesh>
      </group>

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
