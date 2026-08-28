import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { game } from '../game/state'
import { TWO_PI } from '../game/constants'

const tmp = new Vector3()
let loggedError = false

// Third-person orbit camera driven by yaw/pitch/dist from the input layer.
// In a car, gently recenters behind the vehicle when driving forward.
export default function CameraRig() {
  const camera = useThree((s) => s.camera)
  useFrame((_, delta) => {
    try {
      const p = game.player
      if (!p) return
      const tx = p.x
      const tz = p.z
      const ty = p.inCar ? 20 : 26
      if (
        p.inCar &&
        typeof p.inCar.a === 'number' &&
        (game.keys['w'] || game.keys['arrowup']) &&
        game.mouseIdle > 0.4
      ) {
        const target = p.inCar.a + Math.PI
        const d = ((target - game.yaw + Math.PI) % TWO_PI) - Math.PI
        game.yaw += d * 0.04
      }
      const cp = Math.cos(game.pitch)
      const sp = Math.sin(game.pitch)
      const cx = tx + Math.sin(game.yaw) * cp * game.camDist
      const cy = ty + sp * game.camDist + 18
      const cz = tz + Math.cos(game.yaw) * cp * game.camDist
      // Guard against any transient NaN (e.g. a mid-reconciliation read) —
      // applying a NaN position/lookAt would leave the camera permanently
      // stuck, since a NaN lerp target never converges back to a real value.
      if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(cz)) {
        // A client's own game.player.x/z is ALREADY smoothed once (network
        // interpolation — there's no local prediction). Trailing it with
        // this camera's own gentle lerp on top would double up the lag,
        // making the camera feel unbound from the character. Host/solo
        // drive straight off raw physics, so they keep the cinematic trail.
        const follow = game.netRole === 'client' ? 0.6 : 0.18
        camera.position.lerp(tmp.set(cx, cy, cz), follow)
        camera.lookAt(tx, ty + 10, tz)
      } else if (!loggedError) {
        loggedError = true
        console.error('[CameraRig] non-finite camera target', { tx, ty, tz, cx, cy, cz, p })
      }
      game.mouseIdle += delta
    } catch (err) {
      if (!loggedError) {
        loggedError = true
        console.error('[CameraRig] frame error', err)
      }
    }
  })
  return null
}
