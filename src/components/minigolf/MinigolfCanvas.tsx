import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { useRef, useState } from 'react'
import { Ball } from './Ball'
import { Course, TEE_POSITION } from './Course'

export default function MinigolfCanvas({
  onComplete,
}: {
  onComplete: (result: { shots: number; seconds: number }) => void
}) {
  const shotsRef = useRef(0)
  const [shots, setShots] = useState(0)
  const startTimeRef = useRef<number | null>(null)
  const isDoneRef = useRef(false)

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
      <Canvas
        camera={{ position: [0, 13, -14], fov: 55 }}
        onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
        shadows
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 10, 5]} intensity={1} castShadow />
        <Physics gravity={[0, -9.81, 0]}>
          <Course onHoleEnter={handleHoleEnter} />
          <Ball teePosition={TEE_POSITION} onShotTaken={handleShotTaken} />
        </Physics>
      </Canvas>
    </div>
  )
}
