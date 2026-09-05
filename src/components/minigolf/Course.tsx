import { BallCollider, CuboidCollider, RigidBody } from '@react-three/rapier'
import { Text } from '@react-three/drei'
import { useMemo } from 'react'
import { createCheckerTexture } from './checkerTexture'

// Course modeled loosely on the real party garden: tee on the grass strip
// by the carport, a long open lawn bordered by the house along one edge,
// a round clipped bush to bank shots around partway along, and the cup in
// the far corner near a (purely decorative) apple tree.
const COURSE_WIDTH = 10
const COURSE_LENGTH = 22
const WALL_HEIGHT = 2
const WALL_THICKNESS = 0.4

export const TEE_POSITION: [number, number, number] = [-3, 0.2, -10]
export const HOLE_POSITION: [number, number, number] = [3, 0.05, 10]
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

// Smaller trimmed bushes scattered near the edges, out of the direct
// fairway path — extra real-yard flavor, not difficulty escalation.
const SMALL_BUSHES: { position: [number, number, number]; radius: number }[] = [
  { position: [3.3, 0.4, -1], radius: 0.38 },
  { position: [-2.5, 0.4, 6], radius: 0.35 },
]

// Robot lawnmower — small dark box, off to the side of the main path.
const MOWER_POSITION: [number, number, number] = [-1.8, 0.1, -7.5]
const MOWER_SIZE: [number, number, number] = [0.3, 0.2, 0.4]

// Planter/flower baskets — warm/earthy tones, decorative only.
const PLANTER_BOX_POSITION: [number, number, number] = [-4.1, 0.25, 9.4]
const PLANTER_BASKET_POSITION: [number, number, number] = [-1, 0.2, -9]

// Terrace/pavilion stand-in along the edge opposite the house — a wooden
// deck with a simple pergola frame, dark wood tones, purely decorative.
const TERRACE_CENTER: [number, number, number] = [4.1, 0, -6]
const TERRACE_DECK_SIZE: [number, number, number] = [1.0, 0.15, 6]
const TERRACE_POST_HEIGHT = 1.4
const TERRACE_POST_OFFSETS: [number, number][] = [
  [-0.4, -2.7],
  [0.4, -2.7],
  [-0.4, 2.7],
  [0.4, 2.7],
]

// Low stone curb, inside the tall outer hedge boundary, tracing the edge
// of the fairway itself.
const CURB_INSET = 0.5
const CURB_HEIGHT = 0.3

// Sand-trap decorative patches — flat tan circles, no special physics.
const SAND_TRAPS: { position: [number, number, number]; radius: number }[] = [
  { position: [2, 0.02, -3], radius: 0.9 },
  { position: [-1.3, 0.02, 5], radius: 0.7 },
]

export function Course({ onHoleEnter }: { onHoleEnter: () => void }) {
  const fairwayTexture = useMemo(() => createCheckerTexture(COURSE_WIDTH * 2, COURSE_LENGTH * 2), [])

  return (
    <group>
      {/* Ground — checkered mown-lawn texture instead of a flat color */}
      <RigidBody type="fixed" colliders="cuboid" friction={0.8}>
        <mesh position={[0, -0.05, 0]} receiveShadow>
          <boxGeometry args={[COURSE_WIDTH, 0.1, COURSE_LENGTH]} />
          <meshStandardMaterial map={fairwayTexture} />
        </mesh>
      </RigidBody>

      {/* Boundary walls — physics colliders, now with matching visible
          hedge-styled meshes so the play area edge actually reads as a wall. */}
      <RigidBody type="fixed" colliders={false} restitution={0.4}>
        <CuboidCollider args={[WALL_THICKNESS, WALL_HEIGHT, COURSE_LENGTH / 2]} position={[-COURSE_WIDTH / 2, WALL_HEIGHT / 2, 0]} />
        <CuboidCollider args={[WALL_THICKNESS, WALL_HEIGHT, COURSE_LENGTH / 2]} position={[COURSE_WIDTH / 2, WALL_HEIGHT / 2, 0]} />
        <CuboidCollider args={[COURSE_WIDTH / 2, WALL_HEIGHT, WALL_THICKNESS]} position={[0, WALL_HEIGHT / 2, -COURSE_LENGTH / 2]} />
        <CuboidCollider args={[COURSE_WIDTH / 2, WALL_HEIGHT, WALL_THICKNESS]} position={[0, WALL_HEIGHT / 2, COURSE_LENGTH / 2]} />

        <mesh position={[-COURSE_WIDTH / 2, WALL_HEIGHT / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[WALL_THICKNESS * 2, WALL_HEIGHT * 2, COURSE_LENGTH]} />
          <meshStandardMaterial color="#2e5c26" />
        </mesh>
        <mesh position={[COURSE_WIDTH / 2, WALL_HEIGHT / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[WALL_THICKNESS * 2, WALL_HEIGHT * 2, COURSE_LENGTH]} />
          <meshStandardMaterial color="#2e5c26" />
        </mesh>
        <mesh position={[0, WALL_HEIGHT / 2, -COURSE_LENGTH / 2]} castShadow receiveShadow>
          <boxGeometry args={[COURSE_WIDTH, WALL_HEIGHT * 2, WALL_THICKNESS * 2]} />
          <meshStandardMaterial color="#2e5c26" />
        </mesh>
        <mesh position={[0, WALL_HEIGHT / 2, COURSE_LENGTH / 2]} castShadow receiveShadow>
          <boxGeometry args={[COURSE_WIDTH, WALL_HEIGHT * 2, WALL_THICKNESS * 2]} />
          <meshStandardMaterial color="#2e5c26" />
        </mesh>
      </RigidBody>

      {/* Low stone curb — decorative only, sits inside the tall hedge
          boundary and traces the immediate edge of the fairway path. */}
      <group>
        <mesh position={[-(COURSE_WIDTH / 2 - CURB_INSET), CURB_HEIGHT / 2, 0]}>
          <boxGeometry args={[0.2, CURB_HEIGHT, COURSE_LENGTH - CURB_INSET * 2]} />
          <meshStandardMaterial color="#b8b0a0" />
        </mesh>
        <mesh position={[COURSE_WIDTH / 2 - CURB_INSET, CURB_HEIGHT / 2, 0]}>
          <boxGeometry args={[0.2, CURB_HEIGHT, COURSE_LENGTH - CURB_INSET * 2]} />
          <meshStandardMaterial color="#b8b0a0" />
        </mesh>
        <mesh position={[0, CURB_HEIGHT / 2, -(COURSE_LENGTH / 2 - CURB_INSET)]}>
          <boxGeometry args={[COURSE_WIDTH - CURB_INSET * 2, CURB_HEIGHT, 0.2]} />
          <meshStandardMaterial color="#b8b0a0" />
        </mesh>
        <mesh position={[0, CURB_HEIGHT / 2, COURSE_LENGTH / 2 - CURB_INSET]}>
          <boxGeometry args={[COURSE_WIDTH - CURB_INSET * 2, CURB_HEIGHT, 0.2]} />
          <meshStandardMaterial color="#b8b0a0" />
        </mesh>
      </group>

      {/* Sand-trap decorative patches — flat tan circles, no special physics */}
      {SAND_TRAPS.map((trap, i) => (
        <mesh key={i} position={trap.position} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[trap.radius, 24]} />
          <meshStandardMaterial color="#d4b483" />
        </mesh>
      ))}

      {/* House — runs along one long edge of the lawn */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={HOUSE_POSITION} castShadow>
          <boxGeometry args={HOUSE_SIZE} />
          <meshStandardMaterial color="#8a7f6a" />
        </mesh>
      </RigidBody>

      {/* Terrace/pavilion — wooden deck + pergola frame, opposite the house */}
      <group>
        <mesh position={[TERRACE_CENTER[0], 0.08, TERRACE_CENTER[2]]} castShadow receiveShadow>
          <boxGeometry args={TERRACE_DECK_SIZE} />
          <meshStandardMaterial color="#8a6a4a" />
        </mesh>
        {TERRACE_POST_OFFSETS.map(([dx, dz], i) => (
          <mesh
            key={i}
            position={[TERRACE_CENTER[0] + dx, TERRACE_POST_HEIGHT / 2, TERRACE_CENTER[2] + dz]}
            castShadow
          >
            <boxGeometry args={[0.08, TERRACE_POST_HEIGHT, 0.08]} />
            <meshStandardMaterial color="#4a3527" />
          </mesh>
        ))}
        <mesh position={[TERRACE_CENTER[0], TERRACE_POST_HEIGHT, TERRACE_CENTER[2]]} castShadow>
          <boxGeometry args={[1.1, 0.08, 6.2]} />
          <meshStandardMaterial color="#4a3527" />
        </mesh>
        {/* Outdoor-kitchen stand-in block at one end of the deck */}
        <mesh position={[TERRACE_CENTER[0], 0.4, TERRACE_CENTER[2] - 2.4]} castShadow>
          <boxGeometry args={[0.7, 0.65, 0.6]} />
          <meshStandardMaterial color="#555555" />
        </mesh>
      </group>

      {/* Robot lawnmower — small dark box, off to the side of the path */}
      <RigidBody type="fixed" colliders={false} restitution={0.3}>
        <CuboidCollider args={[MOWER_SIZE[0] / 2, MOWER_SIZE[1] / 2, MOWER_SIZE[2] / 2]} position={MOWER_POSITION} />
        <mesh position={MOWER_POSITION} castShadow>
          <boxGeometry args={MOWER_SIZE} />
          <meshStandardMaterial color="#2b2b2b" />
        </mesh>
      </RigidBody>

      {/* Planter/flower baskets — decorative only, warm/earthy tones */}
      <mesh position={PLANTER_BOX_POSITION} castShadow>
        <boxGeometry args={[0.4, 0.5, 0.4]} />
        <meshStandardMaterial color="#a15c32" />
      </mesh>
      <mesh position={PLANTER_BASKET_POSITION} castShadow>
        <cylinderGeometry args={[0.28, 0.22, 0.4, 12]} />
        <meshStandardMaterial color="#c19a6b" />
      </mesh>

      {/* Round clipped bush — a dome-shaped shrub to bank shots around */}
      <RigidBody type="fixed" colliders={false} restitution={0.5}>
        <BallCollider args={[BUSH_RADIUS]} position={BUSH_POSITION} />
        <mesh position={BUSH_POSITION} castShadow>
          <sphereGeometry args={[BUSH_RADIUS, 20, 16]} />
          <meshStandardMaterial color="#3f6b34" />
        </mesh>
      </RigidBody>

      {/* Additional trimmed bushes, scattered near the edges */}
      {SMALL_BUSHES.map((bush, i) => (
        <RigidBody key={i} type="fixed" colliders={false} restitution={0.5}>
          <BallCollider args={[bush.radius]} position={bush.position} />
          <mesh position={bush.position} castShadow>
            <sphereGeometry args={[bush.radius, 16, 12]} />
            <meshStandardMaterial color="#3f6b34" />
          </mesh>
        </RigidBody>
      ))}

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

      {/* START / HOLE signage — flat text lying on the fairway */}
      <Text
        position={[TEE_POSITION[0], 0.03, TEE_POSITION[2] - 1.1]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.5}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#1a3a12"
      >
        START
      </Text>
      <Text
        position={[HOLE_POSITION[0], 0.03, HOLE_POSITION[2] - 1.1]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.5}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#1a3a12"
      >
        HOLE
      </Text>

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
