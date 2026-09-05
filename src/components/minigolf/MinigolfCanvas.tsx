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
      >
        {/* Hemisphere light approximates soft bounced sky/ground light (a
            cheap stand-in for ambient occlusion / GI) without needing an
            external HDR environment map. Paired with a soft-shadowed
            directional "sun" light for the polished-mobile-game look. */}
        <hemisphereLight color="#bfe3ff" groundColor="#4a7c3a" intensity={0.65} />
        <directionalLight
          position={[6, 12, 4]}
          intensity={1.2}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-radius={4}
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
            feel under obstacles — purely visual, no physics involved. */}
        <ContactShadows
          position={[0, 0, 0]}
          scale={[12, 24]}
          opacity={0.45}
          blur={2.5}
          far={4}
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
