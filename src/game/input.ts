// Raw-key -> semantic action mapping, shared by the local simulation loop and
// (over the network) by NetClient.sendInput — this is what keeps the wire
// protocol stable across keybind changes.
import { game } from './state'
import type { InputState } from './types'

export const K = {
  up: () => !!(game.keys['w'] || game.keys['arrowup']),
  down: () => !!(game.keys['s'] || game.keys['arrowdown']),
  left: () => !!(game.keys['a'] || game.keys['arrowleft']),
  right: () => !!(game.keys['d'] || game.keys['arrowright']),
  boost: () => !!game.keys['shift'],
  brake: () => !!game.keys[' '],
  focus: () => !!game.keys['q'],
}

let pendingEvents: string[] = []
export function queueInputEvent(action: string) {
  pendingEvents.push(action)
}

// Reads and CONSUMES one-shot state (jump, queued events) — call at most once
// per tick per role (the local sim loop for host/solo, or NetClient's send
// timer for a client; never both, since only one is active per netRole).
export function readLocalInput(): InputState {
  const jump = game.jumpQueued
  game.jumpQueued = false
  const events = pendingEvents
  pendingEvents = []
  return {
    up: K.up(),
    down: K.down(),
    left: K.left(),
    right: K.right(),
    boost: K.boost(),
    brake: K.brake(),
    jump,
    yaw: game.yaw,
    pitch: game.pitch,
    events,
  }
}
