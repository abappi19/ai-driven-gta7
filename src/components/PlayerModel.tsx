import type { RefObject } from 'react'
import type { Mesh } from 'three'

// Shared avatar meshes for the local player and every remote player, so both
// look identical without duplicating JSX. `armRef` lets each caller toggle
// the punch arm's visibility imperatively in its own useFrame (no React
// re-renders on the hot path).
export function PlayerModel({ armRef }: { armRef: RefObject<Mesh | null> }) {
  return (
    <>
      <mesh position={[0, 7, 0]} castShadow>
        <boxGeometry args={[10, 14, 8]} />
        <meshLambertMaterial color={0x2b2f3a} />
      </mesh>
      <mesh position={[0, 20, 0]} castShadow>
        <boxGeometry args={[11, 14, 9]} />
        <meshLambertMaterial color={0x2c7be5} />
      </mesh>
      <mesh position={[0, 31, 0]}>
        <boxGeometry args={[8, 8, 8]} />
        <meshLambertMaterial color={0xf1c27d} />
      </mesh>
      {/* pistol */}
      <mesh position={[7, 20, 8]}>
        <boxGeometry args={[4, 4, 14]} />
        <meshLambertMaterial color={0x18181d} />
      </mesh>
      {/* punch arm */}
      <mesh ref={armRef} position={[0, 16, 16]}>
        <boxGeometry args={[6, 6, 16]} />
        <meshLambertMaterial color={0xf1c27d} />
      </mesh>
    </>
  )
}
