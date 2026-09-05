import { Canvas } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { useRef, useState } from 'react'
import { Ball } from './Ball'
import { Course, HOLE_POSITION, TEE_POSITION } from './Course'

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
        camera={{ position: [0, 16, -19], fov: 45 }}
        onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
        shadows="soft"
        // `flat` switches the renderer from R3F's default ACES Filmic tone
        // mapping to NoToneMapping. ACES rolls off highlights and noticeably
        // desaturates — with the flat-coloured glTF garden it rendered as a
        // muted, olive-grey scene rather than the bright saturated look of
        // House/course layout.png. This is the exact three.js analogue of the
        // Blender-side gotcha where the default AgX view transform had to be
        // set to 'Standard' for the same reason.
        flat
      >
        {/* Sky-blue clear colour. Only a sliver shows at the default camera
            angle, but as soon as the player orbits up it is the difference
            between a horizon and the page's cream background bleeding in. */}
        <color attach="background" args={['#8ec6ef']} />

        {/* Hemisphere light approximates soft bounced sky/ground light (a
            cheap stand-in for ambient occlusion / GI) without needing an
            external HDR environment map. Paired with a soft-shadowed
            directional "sun" light for the polished-mobile-game look. */}
        <hemisphereLight color="#cfeaff" groundColor="#5d9a48" intensity={1.15} />
        <directionalLight
          position={[6, 12, 4]}
          intensity={1.9}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-radius={4}
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
          shadow-camera-far={60}
        />
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
          position={[0, 0.002, 0]}
          scale={[14, 26]}
          opacity={0.22}
          blur={3}
          far={2.5}
          resolution={512}
        />
        <OrbitControls
          enabled={!isAiming}
          makeDefault
          enableDamping
          minDistance={4}
          maxDistance={30}
          maxPolarAngle={Math.PI / 2 - 0.05}
        />
      </Canvas>
    </div>
  )
}
