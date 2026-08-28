import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
import { game } from '../game/state'
import { PlayerModel } from './PlayerModel'

// On-foot local player avatar (hidden while driving).
export default function Player() {
  const ref = useRef<Group>(null)
  useFrame(() => {
    const p = game.player
    if (!ref.current) return
    ref.current.visible = !p.inCar
    ref.current.position.set(p.x, p.y, p.z)
    ref.current.rotation.y = p.a
  })
  return (
    <group ref={ref}>
      <PlayerModel getEntity={() => game.player} />
    </group>
  )
}
