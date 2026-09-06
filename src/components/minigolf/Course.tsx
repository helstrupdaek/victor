import { BallCollider, CuboidCollider, RigidBody } from '@react-three/rapier'
import { RoundedBox, useGLTF } from '@react-three/drei'
import { Suspense, useMemo } from 'react'
import type { Group, Mesh } from 'three'
import { createCheckerTexture } from './checkerTexture'
import { applyHouseMaterials } from './houseMaterials'

// Course modeled on the real party garden's actual shape: "the whole garden
// is the golf hole", not a fixed-width lane placed inside it. The tee sits
// in a narrow strip by the carport/driveway; past the house the lawn opens
// dramatically into one broad open area, flaring wider again in a rounded
// corner near the hole and apple tree. The house (its own solid RigidBody)
// is the inner boundary along one side for most of the course — no extra
// wall needed there, the ball already bounces off the house.
//
// VISUALS vs. COLLIDERS: every collider below is authoritative and unchanged.
// What the player *sees* for the boundary, house, carport, terrace, hedges,
// curbs, bushes, tree, planters and signage comes from the glTF models under
// public/models/minigolf/, built by
// .superpowers/sdd/2026-09-03-minigolf/blender/build_environment.py from
// these exact constants. A model's silhouette does not have to match its
// collider exactly (e.g. the house model is ~4.7m deep while its collider is
// 2.9m thick, and the boundary hedge is 0.95m tall while its collider is 4m) —
// only the fairway-facing faces are kept flush, so bounces still look right.
// Two colliders deliberately have a SOFTER visual than they used to: R1 and
// RIGHT_CONNECTOR were drawn as bright grey stone curbs, which together with
// curb_L1 boxed the tee into an obvious three-sided white track. They are now
// drawn as a low clipped box hedge (a drive-side border), and the two purely
// decorative curbs that ran through live lawn with no collider behind them
// (curb_mid, curb_flare) are gone entirely.
const WALL_HEIGHT = 2
const WALL_THICKNESS = 0.4

export const TEE_POSITION: [number, number, number] = [1, 0.2, -10]
// Hole sits OUT IN THE OPEN LAWN at the far end, not against the house.
// It used to be at X = -3.5, which is exactly HOUSE_LEFT_X — i.e. flush with
// the house's own fairway-facing wall plane — so the cup read as if it had
// been cut into the terrace right at the building's foot. The property
// reference (House/top-down image.png, "Hole (apple tree)") puts the hole
// clearly clear of the house, out on the lawn near the far hedge corner by
// the apple tree, and the art reference (House/course layout.png) shows it
// on open green with the boundary hedge behind it. X = 0.5 is 4.0m off the
// house wall plane and 6.5m off the outer wall, i.e. genuinely in the middle
// of the broad far lawn; Z = 10.8 leaves 1.45m of green between the cup and
// CAP_HOLE's inner face at Z = 12.25.
export const HOLE_POSITION: [number, number, number] = [0.5, 0.05, 10.8]

// House stand-in runs along the -X edge of the lawn for the middle stretch
// of the course (Z -6..8). Tee zone (Z < -6) and hole zone (Z > 8) are
// beyond the house's footprint and get their own boundary walls.
// ESCAPE GAP FOUND AND CLOSED during the widening pass's enclosure audit
// (pre-existing, not introduced by the widening): the house box used to be
// X -5.0..-3.5, while L2 — the hole-zone flare wall — sits at X -6.4..-5.6
// and only starts at Z 7.7. That left a 0.6m-wide slot at X -5.6..-5.0 open
// at Z = 8.0 (the house box's north face). A ball out in the flare could
// steer south into that slot, end up *inside* the visible house with no
// collider anywhere, roll west off the floor edge at X = -6.5 and fall —
// recoverable only by Ball.tsx's out-of-bounds watchdog. Widening the box to
// X -6.4..-3.5 butts it straight into L2's own X span (overlapping in Z
// 7.7..8.0), so the slot no longer exists. The box is invisible and the
// visible house is 3.1-4.7m deep, so 2.9m of collider is still entirely
// inside the building; nothing about the fairway-facing plane at -3.5 moved.
const HOUSE_POSITION: [number, number, number] = [-4.95, 0.75, 1]
const HOUSE_SIZE: [number, number, number] = [2.9, 1.5, 14]
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
//  X: 2.2 | R1 (tee narrow) =|         (ends Z -8.0)
//  X:11.5 |            R2 (single wall, full length) =================|
//
// R1 (the tee-zone narrowing wall) and R2 (the permanent outer wall) leave
// a rectangular pocket behind R1 (X 2.2..11.5, Z < -9.5). RIGHT_CONNECTOR
// seals the top of that pocket; R1 seals its left edge; R2 seals its right
// edge; CAP_TEE seals its bottom. The pocket is therefore fully enclosed and
// unreachable by the ball — not "probably fine", but physically walled off
// on all four sides.
//
// WIDTH (changed deliberately, do not "restore" it): R2 sat at X = 7 for
// every earlier pass, which made the playable yard a 10.5 x 26m corridor —
// flagged by the previous task's own report as the single biggest remaining
// gap against House/course layout.png, whose garden is broad rather than
// lane-shaped. R2 is now at X = 11.5, so the main lawn is 14.6m of clear
// play between the house face (-3.5) and R2's inner face (11.1) — a 39%
// widening — while the tee corridor (R1) stays narrow, so the "start on the
// drive, then the garden opens out" flare is stronger, not weaker.
// Everything downstream of this number moved with it: CAP_TEE, CAP_HOLE and
// RIGHT_CONNECTOR were all re-spanned (see each), the floor was re-centred,
// and build_environment.py mirrors R2_X / CAP_*_X1 / CONNECTOR_X1 / FLOOR_X1.

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
  { x: 11.5, z: 0, halfX: WALL_THICKNESS, halfZ: 12.6 }, // spans X 11.1..11.9, Z -12.6..12.6
  // R1 — tee-zone narrowing wall, sits inside R2 near the tee. Shortened
  // Z -12.8..-6.0 -> -12.8..-8.0 in the widening pass: with R2 out at 11.5
  // the sealed pocket behind R1 had grown to 9.3 x 6.5m of unreachable lawn
  // sitting right in the game camera's foreground, and it read as a second,
  // separate hedged garden room. Ending R1 (and its connector) 4m earlier
  // hands 34m2 of that back to the playable lawn and leaves the pocket as a
  // 9.3 x 2.75m strip along the tee — i.e. a planting border beside the
  // drive, which is what it looks like.
  { x: 2.2, z: -10.4, halfX: WALL_THICKNESS, halfZ: 2.4 }, // spans Z -12.8..-8.0
]

// X-running connector that seals the top of the pocket between R1 and R2
// (see diagram above) — without it a ball could drift sideways behind R1
// once past its end instead of bouncing off it.
// Moved with R1 (Z -6.1 -> -9.0): it must stay inside R1's Z span so the two
// still overlap at their corner. R1 now runs to Z -8.0, this spans -9.5..-8.5,
// so R1 covers it and then continues 0.5 further north — same overlap
// convention as every other seam here.
const RIGHT_CONNECTOR: WallSpec = { x: 6.85, z: -9.0, halfX: 4.65, halfZ: 0.5 } // X 2.2..11.5, Z -9.5..-8.5

// End caps (thin in Z, long in X) closing the tee and hole ends. Each is
// sized to span every wall segment active at that end (including the R1/R2
// pocket at the tee end) so nothing peeks past the corners. Both now run out
// to R2's new X = 11.5 centre-line, i.e. 0.4 into R2's own body, exactly the
// overlap convention they had at the old X = 7.
const CAP_TEE: WallSpec = { x: 4.0, z: -12.65, halfX: 7.5, halfZ: WALL_THICKNESS } // X -3.5..11.5
const CAP_HOLE: WallSpec = { x: 2.75, z: 12.65, halfX: 8.75, halfZ: WALL_THICKNESS } // X -6..11.5

const ALL_WALLS: WallSpec[] = [...LEFT_WALLS, ...RIGHT_WALLS, RIGHT_CONNECTOR, CAP_TEE, CAP_HOLE]

// Floor sized to comfortably cover the full flared footprint above.
// X -6.5..12.0 (L2's outer face is -6.4, R2's outer face 11.9), Z -13.5..13.5.
const FLOOR_SIZE: [number, number, number] = [18.5, 0.1, 27]
const FLOOR_POSITION: [number, number, number] = [2.75, -0.05, 0]

// Round clipped bush — sits just off the direct tee-to-hole line in the
// main lawn, so the player can cut tight past it on the house side for a
// shorter look at the hole, or play safe around its outer (wall) side.
const BUSH_POSITION: [number, number, number] = [1.5, 0.6, 1]
const BUSH_RADIUS = 0.6
// Decorative apple tree beside the hole — purely visual, no collider, so it
// doesn't make the final putt unfairly harder. It sits BEYOND and to one side
// of the cup (toward the far hedge corner) rather than between the player and
// the cup, so from the default camera it frames the destination instead of
// hiding it — the top-down reference labels this exact spot "Hole (apple
// tree)", so the tree is the thing that says "you've arrived".
const APPLE_TREE_POSITION: [number, number, number] = [2.2, 0.6, 12.2]

// Smaller trimmed bushes scattered through the open lawn — one guarding the
// tight line along the outer wall just past the narrow tee exit, one
// guarding the tight line along the house corner near the hole-zone
// entrance, each creating a real "safe wide line vs. short tight line"
// choice rather than just decoration.
const SMALL_BUSHES: { position: [number, number, number]; radius: number }[] = [
  // Moved 3.5 -> 7.5 with the widening: its stated job is to guard the tight
  // line along the OUTER wall just past the narrow tee exit, and the outer
  // wall moved from X 7 to X 11.5, which left this one sitting in open
  // mid-lawn guarding nothing.
  { position: [7.5, 0.4, -3], radius: 0.38 },
  { position: [-1.6, 0.4, 8.2], radius: 0.35 },
]

// Robot lawnmower — small dark box, tucked to the side of the tee, out of
// the direct line off the start.
const MOWER_POSITION: [number, number, number] = [-1.5, 0.1, -8]
const MOWER_SIZE: [number, number, number] = [0.3, 0.2, 0.4]

// Planter/flower baskets — warm/earthy tones, decorative only.
const PLANTER_BOX_POSITION: [number, number, number] = [-2.9, 0.25, 7.0]
const PLANTER_BASKET_POSITION: [number, number, number] = [-2.5, 0.2, -9]

// Sand-trap decorative patches — flat tan circles, no special physics.
const SAND_TRAPS: { position: [number, number, number]; radius: number }[] = [
  // Also moved out with the widening (3 -> 6), so the pair of bunkers reads
  // ACROSS the broad lawn instead of both hugging the house side.
  { position: [6, 0.02, -1.5], radius: 1.4 },
  // Moved with the hole: this one now sits on the approach to the far green
  // rather than mid-lawn, matching the reference art's sand patch beside the
  // hole. Kept off the tee-to-hole line and clear of the cup itself.
  { position: [2.4, 0.02, 8.6], radius: 1.05 },
]

// The terrace/pavilion (deck + pergola + lounge furniture, centred on
// [-2.9, 0, 1]) and the low decorative stone curbs are now part of
// garden.glb — they never had colliders, so nothing physical moved when
// they stopped being hand-built meshes here.

// --- glTF scenery ---------------------------------------------------------
const MODEL_BASE = '/models/minigolf/'

/**
 * One instance of a glTF prop. `scene.clone(true)` shares the underlying
 * geometries and materials between instances (Object3D.clone copies the node
 * graph but keeps geometry/material references), so the two planters or the
 * repeated bushes cost extra draw calls but no extra GPU memory. With a
 * handful of props that is cheaper in complexity than wiring up
 * <Instances>/<Instance>, which would need one instanced mesh per material
 * inside each model.
 */
function GltfProp({
  url,
  position,
  rotation,
  scale = 1,
}: {
  url: string
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: number | [number, number, number]
}) {
  const { scene } = useGLTF(MODEL_BASE + url) as unknown as { scene: Group }
  const model = useMemo(() => {
    const clone = scene.clone(true)
    clone.traverse((child) => {
      if ((child as Mesh).isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    // Architectural detailing (brick coursing, roof tiles, timber slats,
    // block paving, deck boards, glazing) — runtime CanvasTextures + runtime
    // box-projected UVs, keyed by material name. See houseMaterials.ts for
    // why the detailing lives here rather than in the GLB. Matches only
    // garden.glb's house materials; every other model passes through
    // untouched. Visual only: no geometry, transform or collider is affected.
    applyHouseMaterials(clone)
    return clone
  }, [scene])
  return <primitive object={model} position={position} rotation={rotation} scale={scale} />
}

/**
 * Everything visual that comes out of Blender. Kept behind its own Suspense
 * boundary inside <Course> so the physics colliders (and therefore a
 * playable, if bare, course) mount immediately and the scenery streams in.
 *
 * Nothing in here has a collider — the ball's boundaries are the
 * CuboidColliders in <Course> below, which are unchanged.
 */
function GardenScenery() {
  return (
    <>
      {/* House, carport, sunroom, terrace + furniture, hedges, curbs,
          driveway, planting beds, boundary trees and background. Authored
          in world course coordinates, so it drops in with no transform. */}
      <GltfProp url="garden.glb" />

      {/* Kenney Nature Kit bushes, normalised to radius 1 in the export so
          the scale here is just the collider radius (plus a little, so the
          model reads slightly fuller than its collision sphere). */}
      <GltfProp url="bush_large.glb" position={[BUSH_POSITION[0], 0, BUSH_POSITION[2]]} scale={BUSH_RADIUS * 1.1} />
      {SMALL_BUSHES.map((bush, i) => (
        <GltfProp
          key={i}
          url="bush_small.glb"
          position={[bush.position[0], 0, bush.position[2]]}
          rotation={[0, i * 1.1, 0]}
          scale={bush.radius * 1.2}
        />
      ))}

      {/* Kenney tree_default with red "apple" spheres added in Blender. */}
      <GltfProp url="tree_apple.glb" position={[APPLE_TREE_POSITION[0], 0, APPLE_TREE_POSITION[2]]} />

      {/* Kenney pot_large + a flowering tuft, standing in for the two
          planter/basket positions. */}
      <GltfProp url="planter.glb" position={[PLANTER_BOX_POSITION[0], 0, PLANTER_BOX_POSITION[2]]} />
      <GltfProp
        url="planter.glb"
        position={[PLANTER_BASKET_POSITION[0], 0, PLANTER_BASKET_POSITION[2]]}
        rotation={[0, 0.7, 0]}
        scale={0.85}
      />

      {/* START / HOLE signage. Modelled signs (Kenney sign + extruded 3D
          text baked in Blender) rather than drei's <Text>, whose flat
          ground-plane placement here was previously reported as rendering
          mirrored. A modelled sign has no "mirrored glyph" failure mode:
          the text is real geometry, oriented in the export by an explicit
          right/up/normal basis with determinant +1. */}
      <GltfProp url="sign_start.glb" position={[-3.0, 0, -9.6]} />
      <GltfProp url="sign_hole.glb" position={[-0.9, 0, 11.7]} />

      {/* Open-Golf flagstick in the cup (decorative — the hole sensor
          below is what actually detects the ball). */}
      <GltfProp url="flag.glb" position={[HOLE_POSITION[0], 0, HOLE_POSITION[2]]} />
    </>
  )
}

useGLTF.preload(MODEL_BASE + 'garden.glb')

export function Course({ onHoleEnter }: { onHoleEnter: () => void }) {
  // Mown-stripe checker scale. This used to be `FLOOR_SIZE * 2` repeats of an
  // 8x8 checker, i.e. 28 x 54 tiles = 224 x 432 squares over a 14 x 27m lawn —
  // squares 6cm across. At the game camera that is not a checker at all, it is
  // a fine dither that reads as flat green and gives the eye no scale cue for
  // how big the lawn is. House/course layout.png's mown squares are metres
  // across and are a big part of why its garden reads as broad. 1.0 x 1.5
  // repeats over 18.5 x 27m gives ~2.3 x 2.25m squares. The Y repeat is
  // deliberately a HALF tile: an 8x8 checkerboard wrapped at 4 squares still
  // alternates correctly across the seam (4 is even), so 1.5 tiles is seamless
  // where e.g. 1.25 would not be.
  const fairwayTexture = useMemo(() => createCheckerTexture(1.0, 1.5), [])

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

      {/* Boundary walls — physics colliders only. What the player sees at
          these positions is the hedge run / stone curb built into
          garden.glb (tall clipped hedge on the outer edges, low grey curb
          on the tee-zone edges, exactly as in the reference art). The
          colliders are unchanged: same segments, same overlaps, same
          4-unit height. */}
      <RigidBody type="fixed" colliders={false} restitution={0.4}>
        {ALL_WALLS.map((w, i) => (
          <CuboidCollider key={i} args={[w.halfX, WALL_HEIGHT, w.halfZ]} position={[w.x, WALL_HEIGHT / 2, w.z]} />
        ))}
      </RigidBody>

      {/* Sand-trap decorative patches — flat tan circles, no special physics */}
      {SAND_TRAPS.map((trap, i) => (
        <mesh key={i} position={trap.position} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[trap.radius, 24]} />
          <meshStandardMaterial color="#e0bb7d" roughness={0.9} metalness={0} />
        </mesh>
      ))}

      {/* House — runs along the -X edge of the lawn for the middle
          stretch of the course; its own collider is the inner boundary
          there, no separate wall needed. The visible house is the one in
          garden.glb, whose fairway-facing wall is flush with this box's
          -3.5 face, so this mesh must not draw.
          IMPORTANT — it is hidden via the MATERIAL's `visible`, not the
          mesh's. `colliders="cuboid"` derives this body's collider by
          walking the object graph, and @react-three/rapier uses
          `object.traverseVisible()` unless the undocumented
          `includeInvisible` flag is set. Putting `visible={false}` on the
          <mesh> therefore silently deletes the house collider — verified
          the hard way: with the mesh hidden that way, a full-power tee shot
          left the course entirely and hit Ball.tsx's out-of-bounds reset.
          `material.visible = false` skips the draw call (three.js filters on
          it when building the render list) while leaving Object3D.visible
          true, so the collider is created exactly as before. */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={HOUSE_POSITION}>
          <boxGeometry args={HOUSE_SIZE} />
          <meshStandardMaterial color="#9c8f76" roughness={0.75} metalness={0} visible={false} />
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

      {/* Robot lawnmower — small dark box, tucked beside the tee */}
      <RigidBody type="fixed" colliders={false} restitution={0.3}>
        <CuboidCollider args={[MOWER_SIZE[0] / 2, MOWER_SIZE[1] / 2, MOWER_SIZE[2] / 2]} position={MOWER_POSITION} />
        <RoundedBox args={MOWER_SIZE} radius={0.03} smoothness={2} position={MOWER_POSITION} castShadow>
          <meshStandardMaterial color="#33363a" roughness={0.4} metalness={0.2} />
        </RoundedBox>
      </RigidBody>

      {/* Bush colliders — unchanged. The visible bushes come from the
          Kenney models in <GardenScenery />. */}
      <RigidBody type="fixed" colliders={false} restitution={0.5}>
        <BallCollider args={[BUSH_RADIUS]} position={BUSH_POSITION} />
      </RigidBody>
      {SMALL_BUSHES.map((bush, i) => (
        <RigidBody key={i} type="fixed" colliders={false} restitution={0.5}>
          <BallCollider args={[bush.radius]} position={bush.position} />
        </RigidBody>
      ))}

      {/* Hole (visual cup) + sensor that detects the ball */}
      <mesh position={[HOLE_POSITION[0], 0.01, HOLE_POSITION[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.25, 24]} />
        <meshStandardMaterial color="#111111" />
      </mesh>
      <RigidBody type="fixed" colliders={false} sensor onIntersectionEnter={onHoleEnter}>
        <CuboidCollider args={[0.25, 0.3, 0.25]} position={HOLE_POSITION} />
      </RigidBody>

      <Suspense fallback={null}>
        <GardenScenery />
      </Suspense>
    </group>
  )
}
