import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Mesh } from 'three'
import { game } from '../game/state'

// Pulsing beacon over the LOCAL player's own next checkpoint. Checkpoints
// cycle through the same physical track positions each lap, so there's only
// ever one meaningful target to show, not a fixed pool of markers.
export default function RaceCheckpoints() {
  const ref = useRef<Mesh>(null)
  useFrame(() => {
    if (!ref.current) return
    const race = game.race
    const idx = race?.progress[game.localPlayerId] ?? 0
    const cp = race?.phase === 'racing' ? race.checkpoints[idx] : undefined
    if (!cp) {
      ref.current.visible = false
      return
    }
    ref.current.visible = true
    ref.current.position.set(cp.x, 250, cp.z)
    const s = 1 + Math.sin(Date.now() * 0.003) * 0.06
    ref.current.scale.set(s, 1, s)
  })
  return (
    <mesh ref={ref}>
      <cylinderGeometry args={[50, 50, 500, 24, 1, true]} />
      <meshBasicMaterial color={0xffcc00} transparent opacity={0.24} side={2} depthWrite={false} />
    </mesh>
  )
}
