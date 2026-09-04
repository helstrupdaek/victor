import { Canvas } from '@react-three/fiber'
import { Suspense, lazy } from 'react'

const SmokeTestCube = lazy(() => import('@/components/minigolf/SmokeTestCube'))

export function MinigolfPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-100">
      <div className="h-[400px] w-full max-w-2xl overflow-hidden rounded-2xl border border-ink-900/10">
        <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 5, 5]} intensity={1} />
          <Suspense fallback={null}>
            <SmokeTestCube />
          </Suspense>
        </Canvas>
      </div>
    </div>
  )
}
