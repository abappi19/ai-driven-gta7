import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
import { game } from '../game/state'
import { useGame } from '../store/useGame'
import { PlayerModel } from './PlayerModel'
import type { Player } from '../game/types'

// Mirrors Vehicles.tsx's Cars()/CarView pattern: subscribe to a version
// counter only, recompute list membership via useMemo, then let each
// per-entity view mutate its own Object3D imperatively every frame.
function RemotePlayerView({ player }: { player: Player }) {
  const ref = useRef<Group>(null)
  useFrame(() => {
    if (!ref.current) return
    ref.current.visible = !player.inCar
    ref.current.position.set(player.x, player.y, player.z)
    ref.current.rotation.y = player.a
  })
  return (
    <group ref={ref}>
      <PlayerModel getEntity={() => player} />
    </group>
  )
}

export default function RemotePlayers() {
  const v = useGame((s) => s.versions.remotePlayers)
  const list = useMemo(
    () => Object.values(game.players).filter((p) => p.id !== game.localPlayerId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v],
  )
  return list.map((p) => <RemotePlayerView key={p.id} player={p} />)
}
