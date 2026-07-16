import { Suspense, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { Color, Fog } from 'three'
import { useGame } from './store/useGame'
import { startRun } from './game/systems'
import * as net from './net/client'
import Controls from './components/Controls'
import Preloader from './components/Preloader'
import World from './components/World'
import HUD from './ui/HUD'
import Overlay from './ui/Overlay'
import Lobby from './ui/Lobby'

const SKY = 0xaecae8

export default function App() {
  const phase = useGame((s) => s.phase)
  const modelsReady = useGame((s) => s.modelsReady)

  // ?autostart=1 — jump straight into solo play once models are ready.
  // ?join=1&name=... — auto-join this page's host, used by Multiplayer.tsx's
  // "Join Game" flow when it needs a full page navigation to a different
  // origin (avoids the https->ws mixed-content trap; see net/client.ts).
  useEffect(() => {
    if (!modelsReady || phase !== 'menu') return
    const params = new URLSearchParams(location.search)
    if (params.has('autostart')) startRun()
    else if (params.has('join')) net.joinGame(params.get('name') || 'Player')
  }, [modelsReady, phase])

  return (
    <>
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true }}
        camera={{ fov: 62, near: 0.5, far: 9000, position: [0, 80, 160] }}
        onCreated={({ scene, gl }) => {
          scene.background = new Color(SKY)
          scene.fog = new Fog(SKY, 1200, 3200)
          gl.toneMappingExposure = 1.25
        }}
      >
        <Suspense fallback={null}>
          <Preloader />
          {phase === 'playing' && <World />}
        </Suspense>
        <Controls />
      </Canvas>

      {phase === 'playing' && <HUD />}
      {phase === 'lobby' && <Lobby />}
      {(phase === 'menu' || phase === 'wasted') && <Overlay />}
    </>
  )
}
