// Mutable, NON-reactive game world singleton. Per-frame simulation mutates these
// fields directly so React never re-renders 60x/second. Reactive UI values live
// in the Zustand store (src/store/useGame.ts).
import type { GameState, Player } from './types'
import { WEAPONS } from './weapons'

const freshWeapon = () => ({ current: 0, ammo: WEAPONS.map((w) => w.mag), reloadT: 0, cooldown: 0 })

// Id used for the local player's own entry before/absent any networking —
// solo play never changes it. Once hosting or joining, the local entry is
// re-keyed to a network-assigned id via `setLocalIdentity`.
export const LOCAL_ID = 'local'

export function makePlayer(id: string, name: string): Player {
  return {
    id,
    name,
    x: 0,
    z: 0,
    y: 0,
    a: 0,
    vx: 0,
    vz: 0,
    vy: 0,
    speed: 0,
    r: 14,
    hp: 100,
    inCar: null,
    inCarId: null,
    punchT: 0,
    money: 0,
    grounded: true,
    weapon: freshWeapon(),
  }
}

export const game: GameState = {
  started: false,
  cars: [],
  peds: [],
  police: [],
  pickups: [],
  fx: [],
  buildings: [],
  cityData: null,
  players: { [LOCAL_ID]: makePlayer(LOCAL_ID, 'Player') },
  localPlayerId: LOCAL_ID,
  remoteInputs: {},
  netRole: 'solo',
  get player() {
    return this.players[this.localPlayerId]
  },
  mission: null,
  race: null,
  deliveries: 0,
  kills: 0,
  wanted: 0,
  wantedDecay: 0,
  busting: 0,
  keys: {},
  jumpQueued: false,
  yaw: Math.PI,
  pitch: 0.55,
  camDist: 150,
  mouseIdle: 0,
  locked: false,
  focus: 100,
  focusActive: false,
  timeScale: 1,
  simAccum: 0,
  events: [],
}

// Re-keys the local player's entry to a network-assigned id (host bootstraps
// itself as 'host'; a joining client adopts the id the host hands it in `welcome`).
export function setLocalIdentity(id: string, name: string) {
  const me = game.players[game.localPlayerId]
  delete game.players[game.localPlayerId]
  me.id = id
  me.name = name
  game.players[id] = me
  game.localPlayerId = id
}

export function resetGame() {
  game.cars.length = 0
  game.peds.length = 0
  game.police.length = 0
  game.pickups.length = 0
  game.fx.length = 0
  game.buildings.length = 0
  Object.assign(game.player, makePlayer(game.player.id, game.player.name))
  game.mission = null
  game.race = null
  game.deliveries = 0
  game.kills = 0
  game.wanted = 0
  game.wantedDecay = 0
  game.busting = 0
  game.yaw = Math.PI
  game.pitch = 0.55
  game.camDist = 150
  game.focus = 100
  game.focusActive = false
  game.timeScale = 1
  game.simAccum = 0
  game.events = []
}
