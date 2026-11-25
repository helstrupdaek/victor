import { ContactShadows } from '@react-three/drei'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode } from 'react'
import {
  DoubleSide,
  Group,
  Mesh,
  MeshDepthMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RGBADepthPacking,
  SRGBColorSpace,
  Shape,
  TextureLoader,
  type Texture,
} from 'three'
import {
  PALETTE,
  paintBackPanel,
  paintBasePanel,
  paintCloud,
  paintCover,
  paintGreenTop,
  paintLeaf,
  paintTree,
  paintTreeline,
} from './paint'

/**
 * The invitation as a real 3D pop-up card. It lands closed on the "table",
 * the cover swings up to a standing back panel, and the paper layers stand up
 * with it as parallel folds (each piece stays parallel to the cover, so it can
 * never poke through it). Then the course comes alive: Victor (the putting
 * figure from the hero video, as a flipbook) stands on the raised green and
 * his ball rolls into the hole, a paper buggy drives the cart path, the flag
 * and trees move in the wind and a few leaves blow across.
 *
 * Units: the base panel is W × D on the table, the back panel W × H, hinged
 * along the base's back edge. `still` renders the open card with no motion.
 */

const W = 1.6
const D = 1.0
const H = 1.0
const T = 0.012 // card thickness
const GREEN_H = 0.06 // raised putting green
const CART = { cx: 0, cz: 0.08, rx: 0.68, rz: 0.34 }
const HOLE = { x: 0.3, z: 0.02 }
const SPRITE = { url: '/images/victor-putt-sprite.webp', cols: 10, rows: 7, frames: 61, fps: 12 }

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const easeOut = (v: number) => 1 - (1 - v) ** 3
const easeInOut = (v: number) => (v < 0.5 ? 4 * v ** 3 : 1 - (-2 * v + 2) ** 3 / 2)

type Timing = { arrive: (t: number) => number; open: (t: number) => number; still: boolean }

function makeTiming(still: boolean): Timing {
  return {
    still,
    arrive: (t) => (still ? 1 : easeOut(clamp01(t / 0.8))),
    open: (t) => (still ? 1 : easeInOut(clamp01((t - 1.0) / 2.0))),
  }
}

/** Shared fold angle: lying forward over the base when closed, leaning back a little when open. */
const fold = (o: number) => (Math.PI / 2) * (1 - o) - 0.14 * o

/** Paper cutout material plus a depth material so the cutout casts a cutout-shaped shadow. */
function useCutout(map: Texture) {
  return useMemo(
    () => ({
      material: new MeshStandardMaterial({ map, alphaTest: 0.45, transparent: true, side: DoubleSide, roughness: 0.85 }),
      depth: new MeshDepthMaterial({ depthPacking: RGBADepthPacking, map, alphaTest: 0.45 }),
    }),
    [map],
  )
}

function Cutout({ map, width, height, children }: { map: Texture; width: number; height: number; children?: ReactNode }) {
  const { material, depth } = useCutout(map)
  return (
    <mesh castShadow receiveShadow material={material} customDepthMaterial={depth} position={[0, height / 2, 0]}>
      <planeGeometry args={[width, height]} />
      {children}
    </mesh>
  )
}

/**
 * A piece hinged on the base at (x, z) that stands up parallel to the cover.
 * `onGreen` pieces ride up with the raised green, so closed they still lie flat.
 */
function Fold({ x, z, onGreen, T: timing, children }: { x: number; z: number; onGreen?: boolean; T: Timing; children: ReactNode }) {
  const ref = useRef<Group>(null)
  useFrame(({ clock }) => {
    const g = ref.current
    if (!g) return
    const o = timing.open(clock.elapsedTime)
    g.rotation.x = fold(o)
    g.position.y = T + (onGreen ? GREEN_H * o : 0)
  })
  return (
    <group ref={ref} position={[x, T, z]}>
      {children}
    </group>
  )
}

function Swaying({ phase, amount = 0.025, children }: { phase: number; amount?: number; children: ReactNode }) {
  const ref = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.z = Math.sin(clock.elapsedTime * 1.4 + phase) * amount
  })
  return <group ref={ref}>{children}</group>
}

const paper = new MeshStandardMaterial({ color: PALETTE.cream, roughness: 0.9 })
const edge = new MeshStandardMaterial({ color: PALETTE.paperEdge, roughness: 0.95 })

function BackPanel({ T: timing }: { T: Timing }) {
  const ref = useRef<Group>(null)
  const inside = useMemo(() => new MeshStandardMaterial({ map: paintBackPanel(), roughness: 0.9 }), [])
  const cover = useMemo(() => {
    // The cover is the panel's back face, seen upside down while it lies closed.
    const map = paintCover()
    map.center.set(0.5, 0.5)
    map.rotation = Math.PI
    return new MeshStandardMaterial({ map, roughness: 0.75 })
  }, [])
  const cloud = useMemo(() => paintCloud(), [])
  const clouds = useRef<Group>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (ref.current) ref.current.rotation.x = fold(timing.open(t))
    if (clouds.current && !timing.still) {
      clouds.current.children.forEach((c, i) => {
        c.position.x = (i ? 0.42 : -0.38) + Math.sin(t * 0.25 + i * 2) * 0.06
        c.position.y = (i ? 0.8 : 0.72) + Math.sin(t * 0.6 + i) * 0.012
      })
    }
  })
  // Box faces: +x, -x, +y, -y, +z (inside print), -z (cover).
  return (
    <group ref={ref} position={[0, T + 0.004, -D / 2]}>
      <mesh castShadow receiveShadow position={[0, H / 2, -T / 2]} material={[edge, edge, edge, edge, inside, cover]}>
        <boxGeometry args={[W, H, T]} />
      </mesh>
      <group ref={clouds}>
        {[0, 1].map((i) => (
          <group key={i} position={[i ? 0.42 : -0.38, i ? 0.8 : 0.72, 0.03]}>
            <Cutout map={cloud} width={i ? 0.32 : 0.26} height={i ? 0.16 : 0.13} />
          </group>
        ))}
      </group>
    </group>
  )
}

function BasePanel() {
  const top = useMemo(() => new MeshStandardMaterial({ map: paintBasePanel(CART, W, D), roughness: 0.9 }), [])
  return (
    <mesh receiveShadow castShadow position={[0, T / 2, 0]} material={[edge, edge, top, paper, edge, edge]}>
      <boxGeometry args={[W, T, D]} />
    </mesh>
  )
}

/** The raised kidney-shaped green, rising out of the base as the card opens. */
function PuttingGreen({ T: timing }: { T: Timing }) {
  const ref = useRef<Group>(null)
  const { shape, top, side } = useMemo(() => {
    const s = new Shape()
    s.moveTo(-0.56, 0.02)
    s.bezierCurveTo(-0.6, -0.16, -0.3, -0.22, -0.05, -0.15)
    s.bezierCurveTo(0.15, -0.1, 0.32, -0.24, 0.47, -0.12)
    s.bezierCurveTo(0.6, -0.02, 0.5, 0.16, 0.3, 0.17)
    s.bezierCurveTo(0.1, 0.18, -0.05, 0.08, -0.25, 0.16)
    s.bezierCurveTo(-0.45, 0.24, -0.55, 0.16, -0.56, 0.02)
    const tex = paintGreenTop()
    tex.repeat.set(1 / 1.2, 1 / 0.5)
    tex.offset.set(0.6 / 1.2, 0.25 / 0.5)
    return {
      shape: s,
      top: new MeshStandardMaterial({ map: tex, roughness: 0.8 }),
      side: new MeshStandardMaterial({ color: '#86b552', roughness: 0.9 }),
    }
  }, [])
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.y = Math.max(0.001, timing.open(clock.elapsedTime))
  })
  return (
    <group ref={ref} position={[0, T, 0.04]}>
      {/* Shape is drawn in x/y; turning it flat makes shape-y run toward the viewer (+z) after the flip. */}
      <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]} position={[0, GREEN_H, 0]} material={[top, side]}>
        <extrudeGeometry args={[shape, { depth: GREEN_H, bevelEnabled: false, curveSegments: 32 }]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[HOLE.x, GREEN_H + 0.0015, HOLE.z - 0.04]}>
        <circleGeometry args={[0.026, 32]} />
        <meshBasicMaterial color={PALETTE.ink} />
      </mesh>
    </group>
  )
}

function Flag({ T: timing }: { T: Timing }) {
  const cloth = useRef<Mesh>(null)
  const geo = useMemo(() => {
    const g = new PlaneGeometry(0.13, 0.08, 12, 4)
    g.translate(0.065, 0, 0)
    return g
  }, [])
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array), [geo])
  useFrame(({ clock }) => {
    if (!cloth.current || timing.still) return
    const t = clock.elapsedTime
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3]
      pos.setZ(i, Math.sin(x * 55 - t * 7) * 0.012 * (x / 0.13))
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
  })
  return (
    <Fold x={HOLE.x} z={HOLE.z} onGreen T={timing}>
      <mesh castShadow position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.004, 0.004, 0.32, 8]} />
        <meshStandardMaterial color="#f4f1ea" roughness={0.4} />
      </mesh>
      <mesh ref={cloth} castShadow position={[0.002, 0.28, 0]} geometry={geo}>
        <meshStandardMaterial color={PALETTE.flag} side={DoubleSide} roughness={0.7} />
      </mesh>
    </Fold>
  )
}

function setSpriteFrame(t: Texture, i: number) {
  t.offset.set((i % SPRITE.cols) / SPRITE.cols, 1 - (Math.floor(i / SPRITE.cols) + 1) / SPRITE.rows)
}

/** Victor from the hero video, played as a ping-pong flipbook on a paper standee. */
function Victor({ T: timing }: { T: Timing }) {
  const sheet = useLoader(TextureLoader, SPRITE.url)
  const map = useMemo(() => {
    const t = sheet.clone()
    t.colorSpace = SRGBColorSpace
    t.repeat.set(1 / SPRITE.cols, 1 / SPRITE.rows)
    t.anisotropy = 8
    // Start on the frame where he smiles at the camera.
    setSpriteFrame(t, 30)
    return t
  }, [sheet])
  useFrame(({ clock }) => {
    if (timing.still) return
    const n = Math.floor(clock.elapsedTime * SPRITE.fps) % (SPRITE.frames * 2 - 2)
    setSpriteFrame(map, n < SPRITE.frames ? n : SPRITE.frames * 2 - 2 - n)
  })
  const height = 0.6
  return (
    <Fold x={-0.36} z={0} onGreen T={timing}>
      <Cutout map={map} width={height * (144 / 400)} height={height} />
    </Fold>
  )
}

/** Victor's putt: rests at the putter, rolls to the cup, drops, reappears. */
function Ball({ T: timing }: { T: Timing }) {
  const ref = useRef<Mesh>(null)
  const start = { x: -0.31, z: 0.03 }
  useFrame(({ clock }) => {
    const b = ref.current
    if (!b) return
    const o = timing.open(clock.elapsedTime)
    const y0 = T + GREEN_H * o + 0.016
    if (timing.still || o < 1) {
      b.position.set(start.x, y0, start.z)
      b.visible = o > 0.9
      return
    }
    const c = (clock.elapsedTime % 6) / 6
    const roll = easeOut(clamp01((c - 0.25) / 0.33))
    b.visible = true
    b.position.x = start.x + (HOLE.x - start.x) * roll
    b.position.z = start.z + (HOLE.z - start.z) * roll
    b.position.y = y0 - (c > 0.58 ? clamp01((c - 0.58) / 0.05) * 0.03 : 0)
    b.rotation.z = -roll * 18
    b.scale.setScalar(c > 0.63 && c < 0.95 ? 0.001 : c >= 0.95 ? (c - 0.95) / 0.05 : 1)
  })
  return (
    <mesh ref={ref} castShadow>
      <sphereGeometry args={[0.016, 20, 14]} />
      <meshStandardMaterial color="#ffffff" roughness={0.35} />
    </mesh>
  )
}

/** A little paper-model golf buggy (body along +x), driving the oval cart path. */
function Buggy({ T: timing }: { T: Timing }) {
  const ref = useRef<Group>(null)
  const wheels = useRef<Group>(null)
  useFrame(({ clock }) => {
    const g = ref.current
    if (!g) return
    const t = clock.elapsedTime
    const o = timing.open(t)
    const s = timing.still ? 1.9 : (t - 3) * 0.32 + 1.9
    g.position.set(CART.cx + CART.rx * Math.cos(s), T, CART.cz + CART.rz * Math.sin(s))
    g.rotation.y = Math.atan2(-CART.rz * Math.cos(s), -CART.rx * Math.sin(s))
    g.scale.setScalar(Math.max(0.001, clamp01((o - 0.85) / 0.15)))
    if (wheels.current) wheels.current.children.forEach((w) => (w.rotation.z = -s * 14))
  })
  const white = '#f6f4ee'
  const dark = '#2a2a28'
  return (
    <group ref={ref}>
      <group scale={0.62}>
        <mesh castShadow position={[0, 0.07, 0]}>
          <boxGeometry args={[0.26, 0.06, 0.13]} />
          <meshStandardMaterial color={white} roughness={0.5} />
        </mesh>
        <mesh castShadow position={[0.1, 0.11, 0]}>
          <boxGeometry args={[0.07, 0.05, 0.12]} />
          <meshStandardMaterial color={white} roughness={0.5} />
        </mesh>
        <mesh castShadow position={[-0.02, 0.12, 0]}>
          <boxGeometry args={[0.09, 0.04, 0.12]} />
          <meshStandardMaterial color="#c99a62" roughness={0.6} />
        </mesh>
        <mesh castShadow position={[-0.06, 0.15, 0]}>
          <boxGeometry args={[0.02, 0.07, 0.12]} />
          <meshStandardMaterial color="#c99a62" roughness={0.6} />
        </mesh>
        {[
          [0.08, 0.055],
          [0.08, -0.055],
          [-0.1, 0.055],
          [-0.1, -0.055],
        ].map(([x, z], i) => (
          <mesh key={i} castShadow position={[x, 0.19, z]}>
            <boxGeometry args={[0.008, 0.16, 0.008]} />
            <meshStandardMaterial color={dark} />
          </mesh>
        ))}
        <mesh castShadow position={[-0.01, 0.275, 0]}>
          <boxGeometry args={[0.28, 0.015, 0.16]} />
          <meshStandardMaterial color="#e9923a" roughness={0.6} />
        </mesh>
        <mesh castShadow position={[-0.14, 0.13, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.1, 12]} />
          <meshStandardMaterial color="#3d3a35" />
        </mesh>
        <group ref={wheels}>
          {[
            [0.085, 0.07],
            [0.085, -0.07],
            [-0.085, 0.07],
            [-0.085, -0.07],
          ].map(([x, z], i) => (
            <group key={i} position={[x, 0.032, z]}>
              <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.032, 0.032, 0.022, 18]} />
                <meshStandardMaterial color={dark} roughness={0.8} />
              </mesh>
              <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, z > 0 ? 0.012 : -0.012]}>
                <cylinderGeometry args={[0.016, 0.016, 0.002, 12]} />
                <meshStandardMaterial color="#c9c9c4" metalness={0.6} roughness={0.3} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  )
}

/** A handful of leaves carried across the card by the wind. */
function Leaves({ T: timing }: { T: Timing }) {
  const ref = useRef<Group>(null)
  const map = useMemo(() => paintLeaf(), [])
  const seeds = useMemo(() => Array.from({ length: 8 }, (_, i) => ({ phase: i / 8, y: 0.25 + ((i * 37) % 10) / 22, z: -0.3 + ((i * 53) % 10) / 14 })), [])
  useFrame(({ clock }) => {
    const g = ref.current
    if (!g) return
    const t = clock.elapsedTime
    g.visible = !timing.still && timing.open(t) >= 1
    g.children.forEach((leaf, i) => {
      const s = seeds[i]
      const k = (t * 0.09 + s.phase) % 1
      leaf.position.set(-1.1 + k * 2.2, s.y + Math.sin(t * 1.3 + i) * 0.06 - k * 0.15, s.z)
      leaf.rotation.set(t * 2 + i, t * 1.4 + i * 2, t * 0.8)
    })
  })
  return (
    <group ref={ref}>
      {seeds.map((_, i) => (
        <mesh key={i} castShadow>
          <planeGeometry args={[0.04, 0.04]} />
          <meshStandardMaterial map={map} alphaTest={0.5} side={DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

/** Frames the card for any screen, with a slow drift and a touch of pointer parallax. */
function CameraRig({ T: timing }: { T: Timing }) {
  const { camera, size } = useThree()
  useFrame(({ clock, pointer }) => {
    const aspect = size.width / size.height
    const halfV = Math.tan(((camera as unknown as { fov: number }).fov * Math.PI) / 360)
    // Wide enough for the card on a phone; tall enough on a laptop to leave room for the words below.
    const dist = Math.max(0.94 / (halfV * aspect), 1.5 / halfV)
    const t = clock.elapsedTime
    const drift = timing.still ? 0 : Math.sin(t * 0.18) * 0.07 + pointer.x * 0.06
    const el = 0.52 + (timing.still ? 0 : pointer.y * -0.03)
    // The words sit under the card, so aim low to lift the card into the upper part of the screen.
    const ty = aspect < 1 ? 0.1 : -0.12
    camera.position.set(Math.sin(drift) * Math.cos(el) * dist, ty + Math.sin(el) * dist, -0.1 + Math.cos(drift) * Math.cos(el) * dist)
    camera.lookAt(0, ty, -0.1)
  })
  return null
}

function Scene({ still, onOpened }: { still: boolean; onOpened: () => void }) {
  const timing = useMemo(() => makeTiming(still), [still])
  const card = useRef<Group>(null)
  const fired = useRef(false)
  const tree = useMemo(() => [paintTree(11), paintTree(23)], [])
  const treeline = useMemo(() => paintTreeline(), [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const a = timing.arrive(t)
    if (card.current) {
      card.current.position.y = (1 - a) * 0.7
      card.current.rotation.y = (1 - a) * -0.35
      card.current.rotation.z = (1 - a) * 0.08
    }
    if (!fired.current && timing.open(t) >= 1) {
      fired.current = true
      onOpened()
    }
  })
  return (
    <>
      <CameraRig T={timing} />
      <hemisphereLight args={['#ffffff', '#a9b98f', 1.1]} />
      <directionalLight
        castShadow
        position={[-1.6, 3.2, 2.2]}
        intensity={2.4}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.01}
        shadow-camera-left={-1.4}
        shadow-camera-right={1.4}
        shadow-camera-top={1.4}
        shadow-camera-bottom={-1.4}
      />
      <group ref={card}>
        <BasePanel />
        <BackPanel T={timing} />
        <Fold x={0} z={-0.42} T={timing}>
          <Cutout map={treeline} width={1.5} height={0.5} />
        </Fold>
        <Fold x={-0.6} z={-0.3} T={timing}>
          <Swaying phase={0}>
            <Cutout map={tree[0]} width={0.46} height={0.575} />
          </Swaying>
        </Fold>
        <Fold x={0.6} z={-0.33} T={timing}>
          <Swaying phase={1.7}>
            <Cutout map={tree[1]} width={0.4} height={0.5} />
          </Swaying>
        </Fold>
        <PuttingGreen T={timing} />
        <Flag T={timing} />
        <Victor T={timing} />
        <Ball T={timing} />
        <Buggy T={timing} />
        <Leaves T={timing} />
      </group>
      <ContactShadows position={[0, -0.001, 0]} scale={4} blur={2.6} opacity={0.45} far={1.2} resolution={512} />
    </>
  )
}

export default function PopupCard3D({ still, onOpened }: { still: boolean; onOpened: () => void }) {
  return (
    <Canvas shadows dpr={[1, 2]} gl={{ alpha: true, antialias: true }} camera={{ fov: 34, near: 0.1, far: 50 }}>
      <Scene still={still} onOpened={onOpened} />
    </Canvas>
  )
}
