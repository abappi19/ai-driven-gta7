import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { game } from '../game/state'
import { clamp } from '../game/constants'
import { tryEnterExit, doAction, shoot, respawnPlayer, reload, switchWeapon } from '../game/systems'
import { queueInputEvent } from '../game/input'
import { WEAPONS } from '../game/weapons'
import { useGame } from '../store/useGame'

const BASE_LOOK = 0.0022 // base radians per pixel; scaled by settings.mouseSensitivity

// Pointer-lock mouse-look + keyboard + scroll-zoom. Writes to the mutable
// `game` singleton (no React state on the hot path). Look/steer sensitivity
// come from the persisted settings store.
export default function Controls() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const el = gl.domElement as HTMLCanvasElement
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      game.keys[k] = true
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault()
      if (k === ' ' && !game.player.inCar) game.jumpQueued = true
      // Solo/host act locally (own copy of the world); a client only queues
      // the semantic action, sent to the host over the network next tick.
      const act = (event: string, local: () => void) =>
        game.netRole === 'client' ? queueInputEvent(event) : local()
      if (k === 'e') act('enter', tryEnterExit)
      if (k === 'f') act('action', doAction)
      if (k === 'r') act('respawn', respawnPlayer)
      if (k === 'g') act('reload', reload)
      // '1'..'9' select a weapon slot by index — scales with WEAPONS.length
      // rather than a fixed count of keybinds.
      const slot = Number(k)
      if (Number.isInteger(slot) && slot >= 1 && slot <= WEAPONS.length) {
        act(`weapon${slot - 1}`, () => switchWeapon(slot - 1))
      }
      if (k === 'c') game.camDist = game.camDist > 200 ? 110 : game.camDist > 120 ? 260 : 150
    }
    const onKeyUp = (e: KeyboardEvent) => {
      game.keys[e.key.toLowerCase()] = false
    }
    const onClick = () => {
      if (game.started && !game.locked) el.requestPointerLock?.()
    }
    const onMouseDown = (e: MouseEvent) => {
      if (!game.started || !game.locked || game.player.inCar) return
      const act = (event: string, local: () => void) =>
        game.netRole === 'client' ? queueInputEvent(event) : local()
      if (e.button === 0) act('shoot', shoot)
      else if (e.button === 2) act('reload', reload)
    }
    const onContextMenu = (e: MouseEvent) => e.preventDefault()
    const onLockChange = () => {
      game.locked = document.pointerLockElement === el
      useGame.getState().setLocked(game.locked)
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!game.locked) return
      const s = useGame.getState().settings
      const look = BASE_LOOK * s.mouseSensitivity
      game.yaw -= (e.movementX || 0) * look
      const dy = (e.movementY || 0) * look * (s.invertY ? -1 : 1)
      game.pitch = clamp(game.pitch - dy, -0.25, 1.3)
      game.mouseIdle = 0
    }
    const onWheel = (e: WheelEvent) => {
      if (!game.started) return
      e.preventDefault()
      let d = e.deltaY
      if (e.deltaMode === 1) d *= 16
      else if (e.deltaMode === 2) d *= innerHeight
      d = clamp(d, -120, 120)
      game.camDist = clamp(game.camDist + d * 0.5, 55, 360)
    }
    addEventListener('keydown', onKeyDown)
    addEventListener('keyup', onKeyUp)
    el.addEventListener('click', onClick)
    addEventListener('mousedown', onMouseDown)
    el.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('pointerlockchange', onLockChange)
    addEventListener('mousemove', onMouseMove)
    addEventListener('wheel', onWheel, { passive: false })
    return () => {
      removeEventListener('keydown', onKeyDown)
      removeEventListener('keyup', onKeyUp)
      el.removeEventListener('click', onClick)
      removeEventListener('mousedown', onMouseDown)
      el.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('pointerlockchange', onLockChange)
      removeEventListener('mousemove', onMouseMove)
      removeEventListener('wheel', onWheel)
    }
  }, [gl])
  return null
}
