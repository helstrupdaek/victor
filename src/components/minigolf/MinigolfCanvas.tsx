import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Ball } from './Ball'
import { Course, HOLE_POSITION, TEE_POSITION } from './Course'

/**
 * Where the default camera looks — and, critically, also <OrbitControls>'s
 * orbit target.
 *
 * These MUST be the same point. <OrbitControls makeDefault> re-aims the
 * camera at its own `target` on its first update, and that target defaults to
 * the world origin, so for as long as this file only called
 * `camera.lookAt(...)` in `onCreated`, the aim written here was silently
 * thrown away one frame later and the player actually saw the camera pointed
 * at (0, 0, 0). Measured in the live page: the real view was ~27 degrees of
 * depression, not the ~24 the lookAt asked for, and every round of camera
 * tuning done against the Blender preview was tuning a target the game did
 * not use. Keep the two in sync via this constant, and keep
 * build_environment.py's `cam_game` on the same numbers.
 */
const CAMERA_TARGET: [number, number, number] = [0.5, 0.4, 2.5]

/**
 * Sky — VISUAL PASS D.
 *
 * Was a single flat `<color attach="background" args={['#8ec6ef']} />`. Flat
 * is the one thing House/course layout.png's sky is not: it runs from a deep
 * blue overhead down to a near-white haze at the horizon, with soft cloud
 * across the upper band, and that vertical ramp is a large part of why the
 * reference reads as outdoor depth rather than as a green plane on a coloured
 * card.
 *
 * Drawn into a 2D canvas and hung on `scene.background` as an EQUIRECTANGULAR
 * texture rather than modelled as a dome in garden.glb, for three reasons:
 *   * it costs zero download — the whole thing is ~40 lines of paint calls,
 *     against a dome that would have added mesh + vertex colours to a GLB
 *     this pass is otherwise trying to shrink,
 *   * equirect means it tracks the camera correctly when the player orbits,
 *     so the horizon stays at the horizon instead of sliding, and
 *   * a background texture is unlit, which a dome inside the scene would not
 *     be — a glTF dome would take the directional light across it and shade
 *     one side.
 *
 * Colour management: the canvas is authored in sRGB (these are the hex values
 * you can hold against the reference), so the texture is tagged SRGBColorSpace
 * and three.js linearises it on upload. This is the same linear/sRGB trap
 * documented in build_environment.py's `srgb()` helper, from the other side.
 */
function makeSkyTexture(): THREE.CanvasTexture {
  // 2048x1024: see the gradient comment below — the visible sky is a
  // ~25-row strip of this texture, so height is what buys cloud detail.
  const W = 2048
  const H = 1024
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d')!

  // ORIENTATION, and it is easy to get backwards: CanvasTexture defaults to
  // flipY = true, so canvas y = 0 is UV v = 1, which equirectangular mapping
  // puts at the ZENITH. Top of this canvas is straight up, the middle row is
  // the horizon, the bottom is straight down. Authored the other way round
  // first and the live sky came out flat white.
  //
  // THE STOPS ARE BUNCHED FOR A REASON. Equirect maps one texture row to a
  // fixed number of DEGREES: row f corresponds to elevation (0.5 - f) * 180.
  // The game camera is pitched 22.6 deg down with a 54 deg vertical fov, so
  // the top of the default frame sits only 4.4 deg above the horizon — the
  // entire visible sky is f = 0.476 .. 0.500, about 25 rows out of 1024. An
  // evenly-spread gradient therefore puts nothing but horizon haze on screen
  // and the sky reads white. Everything between 0.472 and 0.500 below is
  // shaping those 25 rows; the stops above 0.472 only matter once the player
  // orbits up.
  //
  // Below the horizon it keeps going, muted rather than cut to a hard line:
  // the ground geometry covers all of it at the default camera, and a soft
  // under-horizon wash is what the player gets if they orbit low.
  const sky = g.createLinearGradient(0, 0, 0, H)
  //
  // VISUAL PASS E deepened everything from 0.444 down. Pass D authored a
  // photographic haze ramp that ran to near-white at the horizon, and since
  // the default camera only ever sees the last 4.4 degrees of it, the sky the
  // player actually got measured a flat #d9ecf8 across the whole band — the
  // brightest thing in the frame by a wide margin (it alone put our luminance
  // p95 at 233 against the reference's 199). House/course layout.png does not
  // do this: its sky is a solid #99befb right down to the treeline, because it
  // is illustration, not photography. These stops now carry real blue into the
  // visible band and keep the pale haze only for the last half degree, where
  // it still does its job of seating the treeline.
  sky.addColorStop(0.0, '#2f6fd0')     // zenith
  sky.addColorStop(0.333, '#4a92db')   // 30 deg
  sky.addColorStop(0.444, '#5ea2e2')   // 10 deg
  sky.addColorStop(0.472, '#6fade7')   // 5 deg  — top of the default frame
  sky.addColorStop(0.4855, '#84bcec')  // 2.6 deg
  sky.addColorStop(0.4935, '#a3cdf1')  // 1.2 deg
  sky.addColorStop(0.5, '#c8def4')     // horizon haze
  sky.addColorStop(0.62, '#c2d8e3')
  sky.addColorStop(1.0, '#a6c0cc')     // nadir
  g.fillStyle = sky
  g.fillRect(0, 0, W, H)

  // Clouds. Deterministic LCG rather than Math.random so the sky is the same
  // every load and a screenshot comparison means something.
  const rnd = (() => {
    let s = 20260906
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  })()

  // Composited SOURCE-OVER, not 'lighter'. The first version stacked ~100
  // additive puffs and saturated every channel across the whole upper band —
  // measured in the live page, rows 0.15..0.55 came back at a flat 255,255,255,
  // which is what a blown-out white sky looks like from the inside.
  function cloudBand(
    n: number, f0: number, f1: number,
    rxLo: number, rxHi: number, flat: number, aLo: number, aHi: number,
  ) {
    for (let i = 0; i < n; i++) {
      const cx = rnd() * W
      const cy = H * (f0 + (f1 - f0) * rnd())
      const rx = rxLo + rnd() * (rxHi - rxLo)
      const ry = rx * flat
      const a = aLo + rnd() * (aHi - aLo)
      for (let p = 0; p < 5; p++) {
        const ox = cx + (rnd() - 0.5) * rx * 1.6
        const oy = cy + (rnd() - 0.5) * ry * 1.1
        const r = ry * (0.7 + rnd() * 0.9)
        // A circle drawn under a horizontal 2.4x scale about its own centre:
        // cheaper and softer-edged than an elliptical gradient.
        g.save()
        g.translate(ox, oy)
        g.scale(2.4, 1)
        const puff = g.createRadialGradient(0, 0, 0, 0, 0, r * 2.0)
        puff.addColorStop(0, `rgba(255,255,255,${a})`)
        puff.addColorStop(0.5, `rgba(255,255,255,${a * 0.4})`)
        puff.addColorStop(1, 'rgba(255,255,255,0)')
        g.fillStyle = puff
        g.fillRect(-r * 2.2, -r * 2.2, r * 4.4, r * 4.4)
        g.restore()
      }
    }
  }
  // Near-horizon band (0.5 .. 7.5 deg): the only clouds the default camera
  // sees, so they are heavily flattened — which is also how cloud actually
  // looks at the horizon, and how course layout.png draws it.
  cloudBand(22, 0.455, 0.497, 70, 230, 0.035, 0.30, 0.55)
  // Higher, rounder cloud for when the player orbits up.
  cloudBand(14, 0.33, 0.452, 90, 260, 0.10, 0.42 * 0.52, 0.42)

  const tex = new THREE.CanvasTexture(cv)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.SRGBColorSpace
  // No mip chain: a background is always sampled at roughly 1:1 and the
  // pyramid would add a third again to 8 MB of GPU memory on a phone.
  tex.generateMipmaps = false
  tex.minFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

function SkyBackground() {
  const scene = useThree((s) => s.scene)
  const tex = useMemo(makeSkyTexture, [])
  useEffect(() => {
    scene.background = tex
    return () => {
      scene.background = null
      tex.dispose()
    }
  }, [scene, tex])
  return null
}

export default function MinigolfCanvas({
  onComplete,
}: {
  onComplete: (result: { shots: number; seconds: number }) => void
}) {
  const shotsRef = useRef(0)
  const [shots, setShots] = useState(0)
  const startTimeRef = useRef<number | null>(null)
  const isDoneRef = useRef(false)
  // While the player is dragging the ball to aim, the orbit controls must
  // not also respond to the same pointer drag — see Ball's onDragStart/
  // onDragEnd callbacks below.
  const [isAiming, setIsAiming] = useState(false)
  // Updated directly (not via React state) on every physics frame, so the
  // live distance readout doesn't trigger a re-render per frame.
  const distanceRef = useRef<HTMLSpanElement>(null)

  function handleBallPositionChange(x: number, z: number) {
    const dx = x - HOLE_POSITION[0]
    const dz = z - HOLE_POSITION[2]
    const distance = Math.sqrt(dx * dx + dz * dz)
    if (distanceRef.current) distanceRef.current.textContent = `${distance.toFixed(1)}m to hole`
  }

  function handleShotTaken() {
    if (startTimeRef.current === null) startTimeRef.current = performance.now()
    shotsRef.current += 1
    setShots(shotsRef.current)
  }

  function handleHoleEnter() {
    if (isDoneRef.current || startTimeRef.current === null) return
    isDoneRef.current = true
    const seconds = (performance.now() - startTimeRef.current) / 1000
    onComplete({ shots: shotsRef.current, seconds })
  }

  return (
    <div className="relative h-[70vh] w-full overflow-hidden rounded-2xl border border-ink-900/10">
      <div className="absolute top-3 left-3 z-10 rounded-full bg-cream-50/90 px-4 py-2 text-sm font-medium text-ink-900">
        Slag: {shots}
      </div>
      <div className="absolute top-3 right-3 z-10 rounded-full bg-cream-50/90 px-4 py-2 text-sm font-medium text-ink-900">
        <span ref={distanceRef}>-- m to hole</span>
      </div>
      <Canvas
        // Default framing, tuned against House/course layout.png. Three
        // things matter and they fight each other:
        //  * X = 9 stands INSIDE the outer boundary (R2's inner face is now
        //    11.1), i.e. in the garden rather than over the neighbour's
        //    hedge. Tried 16.5 and 12 first after R2 moved 7 -> 11.5: both put
        //    the whole screen-left half of the frame OUTSIDE the property, so
        //    the widened lawn was competing with a big plate of neighbour
        //    grass instead of filling the view.
        //  * Y/depression angle ~23° keeps the house facade, roof form,
        //    terrace and carport readable; steeper turns it into a site plan.
        //  * Z behind the tee cap, so the start/driveway corner anchors the
        //    near edge exactly as it does in the reference art.
        //  * fov 54 (was 50) and a 26.6m standoff: the live canvas is much
        //    narrower than the Blender previews implied — MinigolfPage pins it
        //    to 720px wide inside `max-w-3xl px-6` while its height is 70vh,
        //    so the real aspect is ~0.95-1.3:1, not the 1.4:1 the preview was
        //    rendering. At fov 50 from closer in, either the START corner or
        //    the screen-left planting/tree layer fell outside that narrower
        //    frame. build_environment.py now renders 1050x1000 to match.
        camera={{ position: [9, 10.6, -20.5], fov: 54 }}
        onCreated={({ camera, gl, scene }) => {
          camera.lookAt(...CAMERA_TARGET)
          // DEV-ONLY measurement handle. This project has twice shipped a
          // value that looked right in a Blender preview and was wrong in the
          // browser, and pass D's flat-white sky was only diagnosed by reading
          // real pixels. With this you can do, in the devtools console:
          //   const {gl,scene,camera} = window.__minigolf
          //   gl.render(scene, camera)                       // sync draw
          //   const c = gl.getContext(), b = new Uint8Array(4)
          //   c.readPixels(x, y, 1, 1, c.RGBA, c.UNSIGNED_BYTE, b)
          // (the readback must be in the same task as the render, because the
          // drawing buffer is not preserved). Stripped from production builds.
          if (import.meta.env.DEV) {
            ;(window as unknown as Record<string, unknown>).__minigolf = { gl, scene, camera }
            // DEV-ONLY camera override, e.g. /minigolf?cam=9,26,-11. It exists
            // so the phase's acceptance captures are reproducible from a
            // headless browser instead of hand-driven orbit gestures that pass
            // C recorded as "genuine live frames but not reproducible".
            // CAMERA_TARGET is untouched — OrbitControls still aims at it, and
            // it re-derives its orbit from whatever position the camera is at,
            // so this only moves the eye. Absent in production (the whole
            // block is stripped by `import.meta.env.DEV`) and absent from a
            // plain /minigolf URL, so the shipped default framing — which
            // passed its own acceptance gate — cannot be affected.
            const cam = new URLSearchParams(window.location.search).get('cam')
            if (cam) {
              const [x, y, z] = cam.split(',').map(Number)
              if ([x, y, z].every(Number.isFinite)) camera.position.set(x, y, z)
            }
          }
        }}
        // PCF, stated explicitly. R3F's `shadows`/`shadows="soft"` both ask for
        // PCFSoftShadowMap, which three r185 has deprecated and silently
        // downgrades to PCFShadowMap with a console warning — so "soft" was
        // never actually what shipped. Naming the map we really get removes the
        // warning and stops the next person tuning `shadow-radius`, which only
        // VSM reads. VSM was considered and rejected: it costs a blur pass per
        // frame and light-bleeds through the hedge, and this is a party game
        // guests open on phones.
        shadows="percentage"
        // TONE MAPPING — VISUAL PASS E, and this is a reversal of an earlier
        // decision, so the reasoning matters.
        //
        // This used to be `flat` (NoToneMapping). That was chosen when every
        // surface in the scene was a single flat glTF baseColorFactor: the only
        // thing a tone curve could do was desaturate them, and ACES Filmic did
        // exactly that, rendering the garden muted and olive.
        //
        // Pass A changed the premise and said so: six house surfaces now carry
        // real value range *inside a texture* (the roof's lit tile lip, the
        // glazing head, brick mortar), and pass D added a sky whose horizon
        // haze sits at ~0.95 linear. Under NoToneMapping every one of those
        // clips flat at 1.0 — which is precisely why passes B and C both
        // measured that "anything above roughly 70% value clips flat" and both
        // stopped pushing the palette because of it.
        //
        // NeutralToneMapping (the Khronos PBR Neutral curve, three r162+) is
        // the answer to exactly this trade-off and not the same animal as ACES:
        // it is the IDENTITY below 0.76 linear and only compresses above it,
        // with a small (0.15) desaturation applied only inside the compressed
        // range. So midtones — the lawn, the hedge, the brick, every value this
        // scene actually lives in — pass through untouched at full saturation,
        // and the highlights that used to clip now roll off. It buys back the
        // top 25% of the range that passes B/C were being squeezed out of,
        // without the global desaturation that got ACES thrown out.
        //
        // Exposure stays at 1.0: the rig below is balanced so a lit up-facing
        // surface lands at ~0.9x its albedo, i.e. the house textures pass A
        // authored against linear targets still reproduce those targets.
        // Exposure is the one global trim left after the rig is balanced.
        // 1.05 because dropping the sun to 44 degrees costs an up-facing
        // surface 19% of its direct light (sin 59 -> sin 44) and the frame's
        // median luminance came back 8% under the reference's; measured after,
        // ours reads p25/p50/p75 = 76/143/171 against course layout.png's
        // 84/131/171. Safe to trim here only because Neutral compresses the top
        // instead of clipping it.
        gl={{ toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1.05 }}
      >
        {/* Gradient + cloud sky (see makeSkyTexture above). Replaces a flat
            '#8ec6ef' clear colour. Only a sliver shows at the default camera
            angle, but as soon as the player orbits up it is the difference
            between a horizon and the page's cream background bleeding in. */}
        <SkyBackground />

        {/* LIGHTING RIG — VISUAL PASS E.
            History: hemisphere 1.15 / directional 1.9, then 1.4 / 2.25 during
            the macro pass to lift a scene that was reading dark. The lift was
            applied to the *sum*, which is the wrong knob: it left the
            hemisphere carrying 42% of the light on a lit up-facing surface, so
            a cast shadow only took the surface down to 58% of its lit value and
            nothing in the frame separated. That is the "flat ambient
            illumination" the brief calls out, and it is why the lawn, the hedge
            and the checker all collapsed into one pale mint field.

            The rebalance below keeps the TOTAL almost exactly where it was —
            an up-facing lit surface still renders at ~0.9x its albedo, so pass
            A's house textures, authored against explicit linear targets, are
            untouched — and moves the split from 42/58 ambient/sun to 27/73.
            Shadows now land at ~27% of the lit value, which is roughly where
            House/course layout.png sits (its lawn measures #8dca25 lit against
            #5a8e1c shadowed).

            Colour, and this closes pass D's open item 1: the sun is now warm
            (#fff4e0) and the sky ambient is both weaker and slightly less
            saturated (#cfeaff -> #c2dbf0). Previously the ONLY coloured light
            in the scene was a strong blue hemisphere, so every surface was
            pulled cool and pass D had to author the neighbouring houses' walls
            warm to compensate and still reported them reading blue. Warm key +
            cool fill is also what actually makes a summer afternoon read as
            one: lit faces go warm, shadowed faces go cool, and that split does
            more for separation than any amount of extra intensity.

            Ground bounce warmed a touch (#5d9a48 -> #6f9a4e) so the underside
            of canopies and the shaded flanks of the hedge pick up a little
            grass green rather than a flat blue. */}
        <hemisphereLight color="#c2dbf0" groundColor="#7b9a60" intensity={1.05} />
        <directionalLight
          // ELEVATION, and this was the actual reason the scene had no
          // readable shadows. (6, 12, 4) puts the sun 59 degrees up. At that
          // angle a 3 m tree lays a 1.8 m shadow, and the game camera looks
          // down at 23 degrees, so the object sits on top of its own shadow and
          // hides most of what is left. Measured live: turning the hemisphere
          // off entirely still produced no visible shadow on the fairway, which
          // ruled out the intensity ratio as the whole story. Dropping to 44
          // degrees roughly doubles shadow length and pulls it clear of the
          // caster. The AZIMUTH is deliberately unchanged (33.6 degrees off +X,
          // same as before) because build_environment.py bakes SUN_DIR into the
          // hedge's vertex colours, and the sun object there has been moved to
          // match this elevation.
          //
          // It also moves light off the ground and onto the walls: the house
          // facade's N.L goes 0.43 -> 0.58, which is most of what makes the
          // brick read warm instead of grey.
          position={[8, 9.2, 5.3]}
          // Warm key against the cool hemisphere fill. Started at #fff4e0 and
          // pulled back: at that warmth the lawn's blue channel collapsed and
          // the frame's median saturation measured 0.88 against the
          // reference's 0.60, i.e. the greens went past the reference into
          // poster chartreuse.
          color="#fff8ec"
          intensity={3.15}
          castShadow
          shadow-mapSize={[2048, 2048]}
          // Now that shadows carry real contrast they also show real acne.
          // normalBias is the one that matters on this scene: almost every
          // caster is a low-poly bevelled box or an icosphere lump, where a
          // constant depth bias either leaves acne on the near-grazing faces or
          // peter-pans the contact edge. 2 cm is under the ball's radius.
          shadow-bias={-0.0004}
          shadow-normalBias={0.02}
          // Tightened from +/-26 to the property plus a margin. The old frustum
          // spent half its 2048 map on the surround plate and the 50 m skyline
          // rings, whose shadows are never visible; this raises texel density
          // ~1.6x for free rather than paying for a bigger map on a phone.
          shadow-camera-left={-24}
          shadow-camera-right={24}
          shadow-camera-top={24}
          shadow-camera-bottom={-24}
          shadow-camera-far={70}
        />
        {/* FILL — VISUAL PASS E, and the last thing this rig needed.
            With only a key and a hemisphere, any plane facing the camera and
            away from the sun is lit by the hemisphere alone. For a vertical
            face that is 0.5 * (sky + ground), i.e. ~0.12 of what a sunlit face
            gets, and because the ground half is grass green it arrives tinted
            olive. Measured on the neighbouring houses' camera-facing walls:
            #3e4f3d, a dark olive, where course layout.png's are near-cream.
            That is pass D's open item 1 in its new form — no longer blue, but
            still not right — and no base colour can fix it, because even a
            pure white albedo only reaches #4f6863 under that little light.

            So: one more directional, from behind and left of the camera, low
            (14 degrees) and neutral. Low elevation is what makes it a fill
            rather than a second key — a horizontal surface only sees N.L 0.26
            of it, so the lawn and its shadows barely move (+4%), while a wall
            facing the camera sees 0.90 and roughly doubles.

            Cost: this light casts NO shadow, so it adds no shadow map, no
            extra depth pass and no texture unit. It is one more iteration of
            the directional loop in every fragment shader — a few percent of
            fragment cost on a phone, against a second 2048 shadow map which
            would have been ~16 MB and a whole extra scene draw. */}
        <directionalLight position={[-7, 4, -13]} color="#e8eaee" intensity={0.5} />
        <Physics gravity={[0, -9.81, 0]}>
          <Course onHoleEnter={handleHoleEnter} />
          <Ball
            teePosition={TEE_POSITION}
            holePosition={HOLE_POSITION}
            onShotTaken={handleShotTaken}
            onDragStart={() => setIsAiming(true)}
            onDragEnd={() => setIsAiming(false)}
            onPositionChange={handleBallPositionChange}
          />
        </Physics>
        {/* Soft ground-contact shadow blob for a cheap ambient-occlusion
            feel under obstacles — purely visual, no physics involved.
            Opacity dropped from 0.45: with the glTF garden's much taller
            hedges/house now inside its `far` range it was laying a broad
            grey wash over the middle of the fairway. */}
        <ContactShadows
          position={[2.75, 0.002, 0]}
          scale={[19, 27]}
          opacity={0.22}
          blur={3}
          far={2.5}
          resolution={512}
        />
        <OrbitControls
          enabled={!isAiming}
          makeDefault
          target={CAMERA_TARGET}
          enableDamping
          minDistance={4}
          maxDistance={40}
          maxPolarAngle={Math.PI / 2 - 0.05}
        />
      </Canvas>
    </div>
  )
}
