import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Mesh } from 'three'
import { game } from '../game/state'

// Race courses are generated with a fixed checkpoint count (see
// RACE_CHECKPOINTS in game/systems.ts) — this just needs to cover the max.
const MAX_CHECKPOINTS = 12

// Pulsing beacon over the LOCAL player's own next checkpoint (not everyone's,
// so the track doesn't clutter up with markers other racers have already
// passed or haven't reached yet).
function CheckpointMarker({ index }: { index: number }) {
  const ref = useRef<Mesh>(null)
  useFrame(() => {
    if (!ref.current) return
    const race = game.race
    const cp = race?.checkpoints[index]
    const myIdx = race ? (race.progress[game.localPlayerId] ?? 0) : -1
    if (!cp || race?.phase !== 'racing' || index !== myIdx) {
      ref.current.visible = false
      return
    }
    ref.current.visible = true
    ref.current.position.set(cp.x, 250, cp.z)
    const s = 1 + Math.sin(index + Date.now() * 0.003) * 0.06
    ref.current.scale.set(s, 1, s)
  })
  return (
    <mesh ref={ref}>
      <cylinderGeometry args={[50, 50, 500, 24, 1, true]} />
      <meshBasicMaterial color={0x3ddc84} transparent opacity={0.22} side={2} depthWrite={false} />
    </mesh>
  )
}

export default function RaceCheckpoints() {
  return Array.from({ length: MAX_CHECKPOINTS }, (_, i) => <CheckpointMarker key={i} index={i} />)
}
