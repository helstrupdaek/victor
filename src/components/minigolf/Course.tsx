import { BallCollider, CuboidCollider, RigidBody } from '@react-three/rapier'
import { RoundedBox, Text } from '@react-three/drei'
import { useMemo } from 'react'
import { createCheckerTexture } from './checkerTexture'

// Course modeled on the real party garden's actual shape: "the whole garden
// is the golf hole", not a fixed-width lane placed inside it. The tee sits
// in a narrow strip by the carport/driveway; past the house the lawn opens
// dramatically into one broad open area, flaring wider again in a rounded
// corner near the hole and apple tree. The house (its own solid RigidBody)
// is the inner boundary along one side for most of the course — no extra
// wall needed there, the ball already bounces off the house.
const WALL_HEIGHT = 2
const WALL_THICKNESS = 0.4

export const TEE_POSITION: [number, number, number] = [1, 0.2, -10]
export const HOLE_POSITION: [number, number, number] = [-3.5, 0.05, 11]

// House stand-in runs along the -X edge of the lawn for the middle stretch
// of the course (Z -6..8). Tee zone (Z < -6) and hole zone (Z > 8) are
// beyond the house's footprint and get their own boundary walls.
const HOUSE_POSITION: [number, number, number] = [-4.25, 0.75, 1]
const HOUSE_SIZE: [number, number, number] = [1.5, 1.5, 14]
const HOUSE_LEFT_X = -3.5 // house's fairway-facing face
// Playtesting a hard, close-range shot against the house's own auto-cuboid
// collider found a real (if rare) tunneling case — a ball resting right up
// against the house, then hit again, punched through to X ≈ -7.8 and fell
// off the far side. The house (1.5 units thick) should already be "thick
// enough" by the project's own rule of thumb, but empirically wasn't
// bulletproof at close range, so it gets the same reinforcing thin
// CuboidCollider treatment as every other boundary wall below (invisible —
// the house mesh already reads as the wall, this is collision-only
// defense in depth) rather than trusting the auto collider alone.
const HOUSE_REINFORCEMENT = { x: HOUSE_LEFT_X, z: 1, halfX: WALL_THICKNESS, halfZ: 7.3 }

// --- Boundary shape -------------------------------------------------------
// The playable outline is built from independent wall segments at
// different X offsets for different Z ranges, rather than 4 walls forming
// one rectangle, so it can taper near the tee and flare near the hole.
// Every adjacent pair below is deliberately sized to OVERLAP by at least
// 0.2-0.6 units at its seam (see task report for the full reasoning) so
// there is never a gap a fast, CCD-enabled shot could find.
//
//              Z: -13        -6            8         13
//  X:  -6 |                          L2 (hole flare) ======|
//  X:-3.5 | L1 (tee, flush) ===== [ HOUSE ] ======|
//  X: 2.2 | R1 (tee narrow) ==|
//  X:   7 |            R2 (single wall, full length) =================|
//
// R1 (the tee-zone narrowing wall) and R2 (the permanent outer wall) leave
// a triangular pocket behind R1 (X 2.2..7, Z < ~-6). RWALL_CONNECTOR seals
// the top of that pocket; R1 seals its left edge; R2 seals its right edge;
// CAP_TEE seals its bottom. The pocket is therefore fully enclosed and
// unreachable by the ball — not "probably fine", but physically walled off
// on all four sides.

type WallSpec = { x: number; z: number; halfX: number; halfZ: number }

// Z-running segments (thin in X, long in Z) — the two flaring side walls.
const LEFT_WALLS: WallSpec[] = [
  // L1 — tee zone, flush with the house's own face so there's no seam at
  // all where it meets the house (same X, overlapping Z ranges).
  { x: HOUSE_LEFT_X, z: -9.25, halfX: WALL_THICKNESS, halfZ: 3.55 }, // spans Z -12.8..-5.7
  // L2 — hole zone, flares outward for the wider/rounded far corner.
  { x: -6, z: 10.25, halfX: WALL_THICKNESS, halfZ: 2.55 }, // spans Z 7.7..12.8
]

const RIGHT_WALLS: WallSpec[] = [
  // R2 — the permanent outer wall, spans the FULL course length. R1 (below)
  // is a supplementary inner wall that only narrows the tee end; R2 alone
  // already bounds the whole right side, so there's no gap once R1 ends.
  { x: 7, z: 0, halfX: WALL_THICKNESS, halfZ: 12.6 }, // spans Z -12.6..12.6
  // R1 — tee-zone narrowing wall, sits inside R2 near the tee.
  { x: 2.2, z: -9.4, halfX: WALL_THICKNESS, halfZ: 3.4 }, // spans Z -12.8..-6.0
]

// X-running connector that seals the top of the pocket between R1 and R2
// (see diagram above) — without it a ball could drift sideways behind R1
// once past its end instead of bouncing off it.
const RIGHT_CONNECTOR: WallSpec = { x: 4.6, z: -6.1, halfX: 2.4, halfZ: 0.5 } // X 2.2..7, Z -6.6..-5.6

// End caps (thin in Z, long in X) closing the tee and hole ends. Each is
// sized to span every wall segment active at that end (including the R1/R2
// pocket at the tee end) so nothing peeks past the corners.
const CAP_TEE: WallSpec = { x: 1.75, z: -12.65, halfX: 5.25, halfZ: WALL_THICKNESS } // X -3.5..7
const CAP_HOLE: WallSpec = { x: 0.5, z: 12.65, halfX: 6.5, halfZ: WALL_THICKNESS } // X -6..7

const ALL_WALLS: WallSpec[] = [...LEFT_WALLS, ...RIGHT_WALLS, RIGHT_CONNECTOR, CAP_TEE, CAP_HOLE]

// Floor sized to comfortably cover the full flared footprint above.
const FLOOR_SIZE: [number, number, number] = [14, 0.1, 27]
const FLOOR_POSITION: [number, number, number] = [0.5, -0.05, 0]

// Round clipped bush — sits just off the direct tee-to-hole line in the
// main lawn, so the player can cut tight past it on the house side for a
// shorter look at the hole, or play safe around its outer (wall) side.
const BUSH_POSITION: [number, number, number] = [1.5, 0.6, 1]
const BUSH_RADIUS = 0.6
// Decorative apple tree near the hole — purely visual, no collider, so it
// doesn't make the final putt unfairly harder.
const APPLE_TREE_POSITION: [number, number, number] = [-4.5, 0.6, 10.5]

// Smaller trimmed bushes scattered through the open lawn — one guarding the
// tight line along the outer wall just past the narrow tee exit, one
// guarding the tight line along the house corner near the hole-zone
// entrance, each creating a real "safe wide line vs. short tight line"
// choice rather than just decoration.
const SMALL_BUSHES: { position: [number, number, number]; radius: number }[] = [
  { position: [3.5, 0.4, -5], radius: 0.38 },
  { position: [-2, 0.4, 7], radius: 0.35 },
]

// Robot lawnmower — small dark box, tucked to the side of the tee, out of
// the direct line off the start.
const MOWER_POSITION: [number, number, number] = [-1.5, 0.1, -8]
const MOWER_SIZE: [number, number, number] = [0.3, 0.2, 0.4]

// Planter/flower baskets — warm/earthy tones, decorative only.
const PLANTER_BOX_POSITION: [number, number, number] = [-2.9, 0.25, 5]
const PLANTER_BASKET_POSITION: [number, number, number] = [-2.5, 0.2, -9]

// Terrace/pavilion stand-in attached to the house's garden-facing wall — a
// wooden deck with a simple pergola frame, dark wood tones, purely
// decorative.
const TERRACE_CENTER: [number, number, number] = [-2.9, 0, 1]
const TERRACE_DECK_SIZE: [number, number, number] = [1.0, 0.15, 6]
const TERRACE_POST_HEIGHT = 1.4
const TERRACE_POST_OFFSETS: [number, number][] = [
  [-0.4, -2.7],
  [0.4, -2.7],
  [-0.4, 2.7],
  [0.4, 2.7],
]

// Low stone curb, purely decorative (no collider), loosely tracing the
// inner playable edge — inset from whichever wall segment is the actual
// boundary at that stretch.
const CURB_INSET = 0.5
const CURB_HEIGHT = 0.3
const CURB_SEGMENTS: WallSpec[] = [
  // Right side, tee zone — inset from R1.
  { x: 2.2 - CURB_INSET, z: -9.4, halfX: 0.1, halfZ: 3.0 },
  // Right side, main + hole zone — inset from R2.
  { x: 7 - CURB_INSET, z: 0.5, halfX: 0.1, halfZ: 11.5 },
  // Left side, hole zone flare — inset from L2.
  { x: -6 + CURB_INSET, z: 10.25, halfX: 0.1, halfZ: 2.0 },
]

// Sand-trap decorative patches — flat tan circles, no special physics.
const SAND_TRAPS: { position: [number, number, number]; radius: number }[] = [
  { position: [3, 0.02, -2], radius: 0.9 },
  { position: [-1, 0.02, 4], radius: 0.7 },
]

export function Course({ onHoleEnter }: { onHoleEnter: () => void }) {
  const fairwayTexture = useMemo(() => createCheckerTexture(FLOOR_SIZE[0] * 2, FLOOR_SIZE[2] * 2), [])

  return (
    <group>
      {/* Ground — checkered mown-lawn texture, sized to the full flared
          footprint (house + boundary walls carve out the actual play
          shape; anything outside them just reads as "more garden/hedge
          beyond the fairway", which is fine for a real yard). */}
      <RigidBody type="fixed" colliders="cuboid" friction={0.8}>
        <mesh position={FLOOR_POSITION} receiveShadow>
          <boxGeometry args={FLOOR_SIZE} />
          <meshStandardMaterial map={fairwayTexture} roughness={0.8} metalness={0} />
        </mesh>
      </RigidBody>

      {/* Boundary walls — physics colliders, with matching visible
          hedge-styled meshes so the play area edge actually reads as a
          wall. Built from independent segments (not 4 walls forming one
          rectangle) so the shape can taper near the tee and flare near the
          hole — see the WallSpec arrays above for the full layout and the
          overlap/seam reasoning. */}
      <RigidBody type="fixed" colliders={false} restitution={0.4}>
        {ALL_WALLS.map((w, i) => (
          <CuboidCollider key={i} args={[w.halfX, WALL_HEIGHT, w.halfZ]} position={[w.x, WALL_HEIGHT / 2, w.z]} />
        ))}
        {ALL_WALLS.map((w, i) => (
          <RoundedBox
            key={i}
            args={[w.halfX * 2, WALL_HEIGHT * 2, w.halfZ * 2]}
            radius={0.08}
            smoothness={2}
            position={[w.x, WALL_HEIGHT / 2, w.z]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color="#3a7a2e" roughness={0.8} metalness={0} />
          </RoundedBox>
        ))}
      </RigidBody>

      {/* Low stone curb — decorative only, loosely traces the inner edge
          of the actual playable boundary at each stretch of the course. */}
      <group>
        {CURB_SEGMENTS.map((c, i) => (
          <RoundedBox
            key={i}
            args={[c.halfX * 2, CURB_HEIGHT, c.halfZ * 2]}
            radius={0.04}
            smoothness={2}
            position={[c.x, CURB_HEIGHT / 2, c.z]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color="#c3bbaa" roughness={0.85} metalness={0} />
          </RoundedBox>
        ))}
      </group>

      {/* Sand-trap decorative patches — flat tan circles, no special physics */}
      {SAND_TRAPS.map((trap, i) => (
        <mesh key={i} position={trap.position} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[trap.radius, 24]} />
          <meshStandardMaterial color="#e0bb7d" roughness={0.9} metalness={0} />
        </mesh>
      ))}

      {/* House — runs along the -X edge of the lawn for the middle
          stretch of the course; its own collider is the inner boundary
          there, no separate wall needed. */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={HOUSE_POSITION} castShadow>
          <boxGeometry args={HOUSE_SIZE} />
          <meshStandardMaterial color="#9c8f76" roughness={0.75} metalness={0} />
        </mesh>
      </RigidBody>

      {/* Invisible reinforcing collider along the house's fairway face —
          see HOUSE_REINFORCEMENT comment above for why this exists
          alongside the house's own auto-cuboid collider. */}
      <RigidBody type="fixed" colliders={false} restitution={0.4}>
        <CuboidCollider
          args={[HOUSE_REINFORCEMENT.halfX, WALL_HEIGHT, HOUSE_REINFORCEMENT.halfZ]}
          position={[HOUSE_REINFORCEMENT.x, WALL_HEIGHT / 2, HOUSE_REINFORCEMENT.z]}
        />
      </RigidBody>

      {/* Terrace/pavilion — wooden deck + pergola frame, against the house */}
      <group>
        <RoundedBox
          args={TERRACE_DECK_SIZE}
          radius={0.05}
          smoothness={2}
          position={[TERRACE_CENTER[0], 0.08, TERRACE_CENTER[2]]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#9c7850" roughness={0.55} metalness={0} />
        </RoundedBox>
        {TERRACE_POST_OFFSETS.map(([dx, dz], i) => (
          <RoundedBox
            key={i}
            args={[0.08, TERRACE_POST_HEIGHT, 0.08]}
            radius={0.02}
            smoothness={2}
            position={[TERRACE_CENTER[0] + dx, TERRACE_POST_HEIGHT / 2, TERRACE_CENTER[2] + dz]}
            castShadow
          >
            <meshStandardMaterial color="#523c2a" roughness={0.55} metalness={0} />
          </RoundedBox>
        ))}
        <RoundedBox
          args={[1.1, 0.08, 6.2]}
          radius={0.03}
          smoothness={2}
          position={[TERRACE_CENTER[0], TERRACE_POST_HEIGHT, TERRACE_CENTER[2]]}
          castShadow
        >
          <meshStandardMaterial color="#523c2a" roughness={0.55} metalness={0} />
        </RoundedBox>
        {/* Outdoor-kitchen stand-in block at one end of the deck */}
        <RoundedBox
          args={[0.7, 0.65, 0.6]}
          radius={0.04}
          smoothness={2}
          position={[TERRACE_CENTER[0], 0.4, TERRACE_CENTER[2] - 2.4]}
          castShadow
        >
          <meshStandardMaterial color="#5c5c5c" roughness={0.5} metalness={0.15} />
        </RoundedBox>
      </group>

      {/* Robot lawnmower — small dark box, tucked beside the tee */}
      <RigidBody type="fixed" colliders={false} restitution={0.3}>
        <CuboidCollider args={[MOWER_SIZE[0] / 2, MOWER_SIZE[1] / 2, MOWER_SIZE[2] / 2]} position={MOWER_POSITION} />
        <RoundedBox args={MOWER_SIZE} radius={0.03} smoothness={2} position={MOWER_POSITION} castShadow>
          <meshStandardMaterial color="#33363a" roughness={0.4} metalness={0.2} />
        </RoundedBox>
      </RigidBody>

      {/* Planter/flower baskets — decorative only, warm/earthy tones */}
      <RoundedBox args={[0.4, 0.5, 0.4]} radius={0.04} smoothness={2} position={PLANTER_BOX_POSITION} castShadow>
        <meshStandardMaterial color="#b8632f" roughness={0.7} metalness={0.1} />
      </RoundedBox>
      <mesh position={PLANTER_BASKET_POSITION} castShadow>
        <cylinderGeometry args={[0.28, 0.22, 0.4, 16]} />
        <meshStandardMaterial color="#c9a06e" roughness={0.75} metalness={0} />
      </mesh>

      {/* Round clipped bush — a dome-shaped shrub to bank shots around */}
      <RigidBody type="fixed" colliders={false} restitution={0.5}>
        <BallCollider args={[BUSH_RADIUS]} position={BUSH_POSITION} />
        <mesh position={BUSH_POSITION} castShadow>
          <sphereGeometry args={[BUSH_RADIUS, 24, 18]} />
          <meshStandardMaterial color="#4a8438" roughness={0.85} metalness={0} />
        </mesh>
      </RigidBody>

      {/* Additional trimmed bushes, guarding the tight lines through the
          open lawn */}
      {SMALL_BUSHES.map((bush, i) => (
        <RigidBody key={i} type="fixed" colliders={false} restitution={0.5}>
          <BallCollider args={[bush.radius]} position={bush.position} />
          <mesh position={bush.position} castShadow>
            <sphereGeometry args={[bush.radius, 18, 14]} />
            <meshStandardMaterial color="#4a8438" roughness={0.85} metalness={0} />
          </mesh>
        </RigidBody>
      ))}

      {/* Apple tree near the hole — decorative only, no collider */}
      <group position={APPLE_TREE_POSITION}>
        <mesh castShadow position={[0, 0, 0]}>
          <cylinderGeometry args={[0.08, 0.1, 1.2, 10]} />
          <meshStandardMaterial color="#654028" roughness={0.8} metalness={0} />
        </mesh>
        <mesh castShadow position={[0, 0.85, 0]}>
          <sphereGeometry args={[0.55, 18, 14]} />
          <meshStandardMaterial color="#5a8f3f" roughness={0.85} metalness={0} />
        </mesh>
      </group>

      {/* START / HOLE signage — flat text lying on the fairway */}
      <Text
        position={[TEE_POSITION[0], 0.03, TEE_POSITION[2] + 1.1]}
        rotation={[-Math.PI / 2, 0, Math.PI]}
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
        rotation={[-Math.PI / 2, 0, Math.PI]}
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
