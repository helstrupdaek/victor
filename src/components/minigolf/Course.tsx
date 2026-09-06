import { BallCollider, CuboidCollider, RigidBody } from '@react-three/rapier'
import { RoundedBox, useGLTF } from '@react-three/drei'
import { Suspense, useMemo } from 'react'
import type { Group, Mesh } from 'three'
import { createCheckerTexture } from './checkerTexture'
import { applyHouseMaterials } from './houseMaterials'

// Course modeled on the real party garden's actual shape: "the whole garden
// is the golf hole", not a fixed-width lane placed inside it. The playable
// surface is ONE continuous residential back lawn — the ball tees off on the
// block-paved drive apron that wraps around the house's carport gable, rolls
// straight off the paving onto the grass, and plays the length of the garden
// to the cup by the apple tree, where the lawn steps wider past the end of the
// building. The house (its own solid RigidBody) is the inner boundary along
// one side for most of the course — no extra wall needed there, the ball
// already bounces off the house.
//
// There is no internal boundary anywhere inside the lawn. What used to look
// like a narrow tee corridor was a wall (R1) and a cap (RIGHT_CONNECTOR)
// sealing 23m2 of unreachable grass; both are gone, and the start now gets its
// identity from its SURFACE — paving vs. grass — the way it does on the real
// plot, rather than from a hedge boxing it in.
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
// The two purely decorative curbs that ran through live lawn with no collider
// behind them (curb_mid, curb_flare) are gone entirely, as are R1 and
// RIGHT_CONNECTOR and the low border hedges that used to draw them — see the
// long note above RIGHT_WALLS. Every remaining collider corresponds to a real
// property feature, and every visible solid the ball can reach has a collider.
const WALL_HEIGHT = 2
const WALL_THICKNESS = 0.4

export const TEE_POSITION: [number, number, number] = [1, 0.2, -10]
// Hole sits OUT IN THE OPEN LAWN at the far end, not against the house.
// It used to be at X = -3.5, i.e. exactly flush with
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
// The building's fairway-facing wall plane, X = -3.5, is HOUSE_POSITION[0] +
// HOUSE_SIZE[0]/2 and is mirrored in build_environment.py as BUILD_FACE_X.
// It is no longer a collider plane in its own right — see HOUSE_WALL_PLANE_X.
// Playtesting a hard, close-range shot against the house's own auto-cuboid
// collider found a real (if rare) tunneling case — a ball resting right up
// against the house, then hit again, punched through to X ≈ -7.8 and fell
// off the far side. The house (1.5 units thick) should already be "thick
// enough" by the project's own rule of thumb, but empirically wasn't
// bulletproof at close range, so it gets the same reinforcing thin
// CuboidCollider treatment as every other boundary wall below (invisible —
// the house mesh already reads as the wall, this is collision-only
// defense in depth) rather than trusting the auto collider alone.
// Centre-line of BOTH house-side colliders (L1 and HOUSE_REINFORCEMENT).
// They used to sit on HOUSE_LEFT_X (-3.5), which put their fairway faces at
// X = -3.1 — 0.4 short of the house wall plane. The top-down diagnostic
// flagged that as ~8.4m2 of visible lawn the ball can never touch.
//
// The diagnostic slightly overstated it. What the ball should actually stop
// against along this frontage is not the wall plane but the STONE KERB that
// runs along it for nearly its whole length (`curb_L1` for Z -12.65..-5.7,
// `house_kerb` for Z -6.2..4.8 and 8.0..8.2 in build_environment.py): a
// 0.36m-wide, 0.42m-tall block kerb centred on -3.5, so its fairway face is
// at X = -3.32, already 0.18 proud of the wall. The genuinely reclaimable
// figure is therefore 0.18m over the frontage, ~3.8m2 — not 0.4m/8.4m2.
//
// -3.72 puts the collider's fairway face exactly on -3.32, flush with that
// kerb, so the ball now visibly bounces off the thing it looks like it is
// bouncing off. Tunneling protection is UNCHANGED: the slab is the same
// 0.8-thick cuboid, only translated 0.22 west, and at -4.12..-3.32 it is
// still buried entirely inside the house apron / building volume.
const HOUSE_WALL_PLANE_X = -3.72
const HOUSE_REINFORCEMENT = { x: HOUSE_WALL_PLANE_X, z: 1, halfX: WALL_THICKNESS, halfZ: 7.3 }

// --- Boundary shape -------------------------------------------------------
// The playable outline is built from independent wall segments at
// different X offsets for different Z ranges, rather than 4 walls forming
// one rectangle, so it can taper near the tee and flare near the hole.
// Every adjacent pair below is deliberately sized to OVERLAP by at least
// 0.2-0.6 units at its seam (see task report for the full reasoning) so
// there is never a gap a fast, CCD-enabled shot could find.
//
//              Z: -13        -6            8         13
//  X:   -6 |                         L2 (hole flare) ======|
//  X:-3.72 | L1 (kerb-flush) ===== [ HOUSE ] ======|
//  X: 11.5 |           R2 (single wall, full length) =================|
//
// Four segments and two end caps, and every one of them is the PROPERTY
// BOUNDARY or the building. There are no internal walls: the lawn inside is
// one continuous surface, exactly as it is on the real plot. L1 and the house
// are the north side; R2 is the far hedge; CAP_TEE and CAP_HOLE are the two
// end hedges; L2 is the step in the boundary where the garden continues past
// the end of the building toward the apple tree.
//
// The clear play region is therefore ONE rectangle, X -3.32..11.1 by
// Z -12.25..8.3 (14.42 x 20.55m), plus the flare beyond the house's end at
// X -5.6..11.1 by Z 8.3..12.25. Nothing inside it is fenced off.
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
  { x: HOUSE_WALL_PLANE_X, z: -9.25, halfX: WALL_THICKNESS, halfZ: 3.55 }, // spans X -4.12..-3.32, Z -12.8..-5.7
  // L2 — hole zone, flares outward for the wider/rounded far corner.
  { x: -6, z: 10.25, halfX: WALL_THICKNESS, halfZ: 2.55 }, // spans Z 7.7..12.8
]

const RIGHT_WALLS: WallSpec[] = [
  // R2 — the permanent outer wall, spans the FULL course length. R1 (below)
  // is a supplementary inner wall that only narrows the tee end; R2 alone
  // already bounds the whole right side, so there's no gap once R1 ends.
  { x: 11.5, z: 0, halfX: WALL_THICKNESS, halfZ: 12.6 }, // spans X 11.1..11.9, Z -12.6..12.6
]

// DELETED: R1 and RIGHT_CONNECTOR — the course's only internal subdivision.
//
// R1 was a wall at X 2.2 running Z -12.8..-8.0; RIGHT_CONNECTOR ran X 2.2..11.5
// at Z -9.0 and capped it. Together with R2 and CAP_TEE they sealed an
// 8.5 x 2.75m (23.4m2) pocket of lawn, walled on all four sides, that the ball
// could not reach by any route. 18.6m2 of it was plain mown fairway — the same
// mesh, the same green, the same checker as the playing surface — fenced off
// behind a 0.45m box hedge.
//
// That hedge was the only internal division anywhere in the scene, and the
// top-down orthographic diagnostic identified it as the single strongest
// "this is a built minigolf course, not a garden" signal in the plan: a real
// lawn is one surface, a course is lawn divided into cells. None of the 23
// photographs of the real property, nor the aerial in House/top-down image.png,
// shows any internal division in the lawn at all — it is one continuous
// surface from the drive apron all the way to the far hedge.
//
// R1 is deleted rather than kept as a free-standing border because nothing at
// that line exists on the real plot. The aerial's east end runs paved drive
// straight into open lawn; what narrows the start there is the house gable on
// one side and the property's own boundary hedge on the other, not a divider
// out in the grass. Keeping R1 purely because it was convenient containment
// would have been reintroducing an artificial internal wall by another name.
//
// Containment does not need it. R2 spans the full course length (Z -12.6..12.6)
// and CAP_TEE now spans X -4.0..11.5, so the tee end is bounded by the property
// boundary alone — see the seam audit in the geometry-correction report.
//
// Playable area 322.6 -> 358.0m2; sealed unreachable lawn 23.4 -> 0m2; internal
// hedges dividing lawn from lawn 1 -> 0. The visual counterparts (`border_R1`,
// `border_connector` in build_environment.py) are deleted with them, so no
// hedge is left standing without a collider behind it.

// End caps (thin in Z, long in X) closing the tee and hole ends. Each is
// sized to span every wall segment active at that end (including the R1/R2
// pocket at the tee end) so nothing peeks past the corners. Both now run out
// to R2's new X = 11.5 centre-line, i.e. 0.4 into R2's own body, exactly the
// overlap convention they had at the old X = 7.
// CAP_TEE's west end moved -3.5 -> -4.0 with L1: L1's body is now X -4.12..-3.32,
// so a cap ending at -3.5 would have overlapped it by only 0.18, under this
// file's 0.2-0.6 minimum. At -4.0 the overlap is 0.68.
const CAP_TEE: WallSpec = { x: 3.75, z: -12.65, halfX: 7.75, halfZ: WALL_THICKNESS } // X -4.0..11.5
const CAP_HOLE: WallSpec = { x: 2.75, z: 12.65, halfX: 8.75, halfZ: WALL_THICKNESS } // X -6..11.5

const ALL_WALLS: WallSpec[] = [...LEFT_WALLS, ...RIGHT_WALLS, CAP_TEE, CAP_HOLE]

// Kerbed planting bed tucked into the boundary corner at the tee end, where
// R2's hedge meets CAP_TEE's. Hugs both collider faces (R2 at X 11.1, CAP_TEE
// at Z -12.25), so it takes its area out of the corner of the lawn rather than
// out of the middle of it, and sits ~10m off the tee-to-hole line.
// build_environment.py draws it with flower_bed() at exactly these bounds.
const BED_CORNER = { x: 10.25, z: -11.32, halfX: 0.85, halfZ: 0.93 } // X 9.4..11.1, Z -12.25..-10.39

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
// The START signpost. Hoisted out of GardenScenery into a named constant so
// its collider (added below) and its model can never drift apart.
const START_SIGN_POSITION: [number, number, number] = [-3.0, 0, -9.6]
// The HOLE signpost, the apple tree and the flagstick DELIBERATELY stay
// collider-free, and this is a knowing exception to "every visible solid the
// ball can reach has a collider". All three stand within ~1.7m of the cup, on
// the approach to it. Colliding them would make the final putt materially
// harder, which is explicitly ruled out for decorative detailing. The lie is
// confined to three thin objects clustered at the destination; everywhere else
// on the course, what looks solid is solid. Flagged for the owner rather than
// resolved unilaterally, since either fix (collide them, or move them off the
// approach) changes composition that is already locked.
const HOLE_SIGN_POSITION: [number, number, number] = [-0.9, 0, 11.7]

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
      <GltfProp url="sign_start.glb" position={START_SIGN_POSITION} />
      <GltfProp url="sign_hole.glb" position={HOLE_SIGN_POSITION} />

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
        {/* Kerbed corner planting bed, in the angle where the far hedge (R2)
            meets the tee-end hedge (CAP_TEE). This is the ONE piece of built
            structure inside the reclaimed area, and it gets a collider on
            purpose: a bed with a 0.22m stone kerb and shrubs on it is a
            structural edge, not vegetation, and a visible kerb the ball rolls
            through is the exact defect this project already removed twice
            (curb_mid, curb_flare). The collider is deliberately taller than
            the kerb so a fast ball cannot pop over and come to rest inside the
            planting; from outside it reads as the bed's mass, which with the
            shrubs on it stands ~0.8 tall anyway.

            Its two predecessors — free-standing beds at X 3.1-4.3 and 6.6-7.8,
            which used to be dressing inside the sealed pocket — are gone
            rather than collidered. Out in reclaimed open lawn they would have
            been two boxy islands in the middle of the grass: obstacles the
            course does not want, and a "designed cell" read the aerial does
            not support. The aerial puts planting in the boundary corners, not
            adrift in the lawn. */}
        <CuboidCollider args={[BED_CORNER.halfX, 0.25, BED_CORNER.halfZ]} position={[BED_CORNER.x, 0.25, BED_CORNER.z]} />

        {/* Three props that stand ON live playing surface and had no
            colliders at all, found by the "what can the ball reach" audit.
            None of them is new — they predate this change — but a glazed pot
            and a signpost are structure, not vegetation, and the ball used to
            roll straight through both. All three sit in the start area, well
            off the tee-to-hole line, so colliding them costs no shot the
            course needs.

            The planters get BOX colliders even though the pots are round.
            A sphere is the better shape fit, and it was tried first — but a
            small sphere is exactly the geometry that deflects a fast ball
            UPWARDS, and the revalidation battery caught it immediately:
            spherical pots reproduced the known bush-launch defect and put two
            extra bearings over the 3m boundary wall. A box presents vertical
            faces, so it bounces horizontally at every speed. Slightly wrong
            silhouette, materially safer containment. */}
        <CuboidCollider args={[0.26, 0.3, 0.26]} position={[PLANTER_BASKET_POSITION[0], 0.3, PLANTER_BASKET_POSITION[2]]} />
        <CuboidCollider args={[0.28, 0.32, 0.28]} position={[PLANTER_BOX_POSITION[0], 0.32, PLANTER_BOX_POSITION[2]]} />
        <CuboidCollider args={[0.09, 0.55, 0.09]} position={[START_SIGN_POSITION[0], 0.55, START_SIGN_POSITION[2]]} />
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
