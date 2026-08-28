import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
import type { Player } from '../game/types'

const SKIN = 0xf1c27d
const JACKET = 0x2c7be5
const PANTS = 0x2b2f3a
const GUN_COLOR = 0x18181d

const FULL_SWING_SPEED = 3 // entity.speed at which the walk cycle hits full amplitude
const SWING_ANGLE = 0.7 // radians
const PUNCH_ANGLE = -2.2 // forward-swung punch pose (overrides the walk cycle)

// A low-poly capsule-based humanoid shared by the local player and every
// remote player. `getEntity` returns the live, mutable Player object
// (game.player or a RemotePlayers entry) fresh each frame rather than a
// captured reference — game.player can get re-keyed to a new object on a
// mid-session reconnect (see net/client.ts's setLocalIdentity), so a plain
// snapshotted prop would silently start animating the abandoned old one.
export function PlayerModel({ getEntity }: { getEntity: () => Player }) {
  const lLeg = useRef<Group>(null)
  const rLeg = useRef<Group>(null)
  const lArm = useRef<Group>(null)
  const rArm = useRef<Group>(null)
  const phase = useRef(0)

  useFrame((_, delta) => {
    const entity = getEntity()
    const amount = Math.min(1, entity.speed / FULL_SWING_SPEED)
    phase.current += delta * 8 * amount
    const swing = Math.sin(phase.current) * SWING_ANGLE * amount
    if (lLeg.current) lLeg.current.rotation.x = swing
    if (rLeg.current) rLeg.current.rotation.x = -swing
    if (lArm.current) lArm.current.rotation.x = -swing
    if (rArm.current) rArm.current.rotation.x = entity.punchT > 0 ? PUNCH_ANGLE : swing
  })

  return (
    <group>
      {/* head */}
      <mesh position={[0, 30, 0]} castShadow>
        <sphereGeometry args={[4.5, 12, 10]} />
        <meshLambertMaterial color={SKIN} />
      </mesh>
      {/* torso */}
      <mesh position={[0, 19, 0]} castShadow>
        <capsuleGeometry args={[5, 9, 4, 8]} />
        <meshLambertMaterial color={JACKET} />
      </mesh>

      {/* legs — pivot at the hip so rotation.x swings them like a stride */}
      <group ref={lLeg} position={[-3, 14, 0]}>
        <mesh position={[0, -6, 0]} castShadow>
          <capsuleGeometry args={[2.6, 9, 4, 8]} />
          <meshLambertMaterial color={PANTS} />
        </mesh>
      </group>
      <group ref={rLeg} position={[3, 14, 0]}>
        <mesh position={[0, -6, 0]} castShadow>
          <capsuleGeometry args={[2.6, 9, 4, 8]} />
          <meshLambertMaterial color={PANTS} />
        </mesh>
      </group>

      {/* arms — pivot at the shoulder */}
      <group ref={lArm} position={[-7.5, 23, 0]}>
        <mesh position={[0, -5, 0]} castShadow>
          <capsuleGeometry args={[2, 7, 4, 8]} />
          <meshLambertMaterial color={JACKET} />
        </mesh>
      </group>
      <group ref={rArm} position={[7.5, 23, 0]}>
        <mesh position={[0, -5, 0]} castShadow>
          <capsuleGeometry args={[2, 7, 4, 8]} />
          <meshLambertMaterial color={JACKET} />
        </mesh>
        {/* pistol, held in the right hand */}
        <mesh position={[0, -9, 5]}>
          <boxGeometry args={[3, 3, 12]} />
          <meshLambertMaterial color={GUN_COLOR} />
        </mesh>
      </group>
    </group>
  )
}
