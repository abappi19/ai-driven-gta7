// Owns the one WebSocket connection to server/relay.mjs for both roles:
// hosting (simulate locally, broadcast snapshots) and joining (send input,
// apply + smooth incoming snapshots). Solo play never touches this module.
import { game, setLocalIdentity, makePlayer } from '../game/state'
import { useGame } from '../store/useGame'
import { readLocalInput } from '../game/input'
import { applyEvents, startRun } from '../game/systems'
import { reconcileArray, setTarget, smoothTowards } from './interp'
import type { NetMessage, NetPlayer } from './protocol'
import type { Car, Ped, Pickup, Player } from '../game/types'

let socket: WebSocket | null = null
let nextPlayerNum = 1

// Host-side: last time each remote id's input was heard from, so a dropped
// connection degrades gracefully instead of a player walking forever on
// their last-known input.
const lastInputAt: Record<string, number> = {}
const FREEZE_MS = 500 // stop moving a player whose input has gone quiet
const PRUNE_MS = 5000 // fully remove a player who's been silent this long

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws`
}

function send(msg: NetMessage) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg))
}

const bump = (k: 'cars' | 'peds' | 'police' | 'pickups' | 'remotePlayers') =>
  useGame.getState().bump(k)

function broadcastRoster() {
  const players = Object.values(game.players).map((p) => ({ id: p.id, name: p.name }))
  useGame.getState().setLobbyPlayers(players)
  send({ t: 'roster', players })
}

/* ---------- host ---------- */
// Connects and enters the lobby — does NOT start the run yet (see
// hostStartGame). The relay tags whichever socket connects first as host, so
// this must be opened before any joiners connect.
export function hostGame(name: string): Promise<void> {
  setLocalIdentity('host', name)
  game.netRole = 'host'
  useGame.getState().setNetRole('host')
  useGame.getState().setNetStatus('connecting')
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl())
    socket = ws
    ws.onopen = () => {
      useGame.getState().setNetStatus('connected')
      useGame.getState().setPhase('lobby')
      broadcastRoster()
      resolve()
    }
    ws.onerror = () => {
      useGame
        .getState()
        .setNetStatus(
          'error',
          'Could not start hosting — make sure this page was opened via `npm run host`.',
        )
      reject(new Error('relay connection failed'))
    }
    ws.onmessage = (ev) => {
      const msg: NetMessage = JSON.parse(ev.data)
      if (msg.t === 'join') {
        const id = `p${nextPlayerNum++}`
        game.players[id] = makePlayer(id, msg.name)
        bump('remotePlayers')
        send({ t: 'welcome', forNonce: msg.nonce, id })
        broadcastRoster()
        // Joining after the run already started (drop-in co-op) — `start`
        // otherwise only ever goes out once, at hostStartGame(). Harmless
        // no-op re-broadcast to already-playing clients (the relay can only
        // broadcast to everyone, not address this one joiner specifically).
        if (game.started) {
          send({ t: 'start', cityData: game.cityData!, buildings: game.buildings })
        }
      } else if (msg.t === 'input') {
        game.remoteInputs[msg.id] = msg.input
        lastInputAt[msg.id] = Date.now()
      }
    }
  })
}

// Host-only: called from the Lobby's "Start Game" button. Begins the actual
// simulation and hands every already-connected client the city to render.
export function hostStartGame() {
  startRun()
  send({ t: 'start', cityData: game.cityData!, buildings: game.buildings })
}

// Neutral input used to stop (not extrapolate) a player whose connection has
// gone quiet, while still respecting their last-known facing direction.
function freezeInput(id: string) {
  const prev = game.remoteInputs[id]
  game.remoteInputs[id] = {
    up: false,
    down: false,
    left: false,
    right: false,
    boost: false,
    brake: false,
    jump: false,
    yaw: prev?.yaw ?? 0,
    pitch: prev?.pitch ?? 0,
    events: [],
  }
}

function vacateCar(p: Player) {
  if (!p.inCar) return
  p.inCar.driver = null
  p.inCar.type = 'parked'
  p.inCar = null
}

// Host-only: called each broadcast tick — freezes players whose input has
// briefly gone quiet, and fully drops ones who've been silent long enough to
// be considered disconnected (the relay has no way to tell us this directly;
// see server/relay.mjs's comment on why it stays a dumb byte forwarder).
function pruneStaleClients() {
  const now = Date.now()
  for (const id of Object.keys(game.remoteInputs)) {
    if (id === game.localPlayerId) continue
    const age = now - (lastInputAt[id] ?? 0)
    if (age > PRUNE_MS) {
      const p = game.players[id]
      if (p) vacateCar(p)
      delete game.players[id]
      delete game.remoteInputs[id]
      delete lastInputAt[id]
      bump('remotePlayers')
    } else if (age > FREEZE_MS) {
      freezeInput(id)
    }
  }
}

function serializeCars(cars: Car[]): Car[] {
  // Strip `driver` — for the player's own car it's a live back-reference to
  // that Player object, which would make JSON.stringify throw on the cycle.
  return cars.map((c) => ({ ...c, driver: null }))
}

// Call from Systems.tsx's existing ~80ms HUD-throttle tick when netRole === 'host'.
export function hostBroadcast() {
  pruneStaleClients()
  const players: NetPlayer[] = Object.values(game.players).map((p) => ({
    id: p.id,
    name: p.name,
    x: p.x,
    y: p.y,
    z: p.z,
    a: p.a,
    hp: p.hp,
    inCarId: p.inCar ? p.inCar.id : null,
    punchT: p.punchT,
    money: p.money,
  }))
  send({
    t: 'snapshot',
    tick: 0,
    players,
    cars: serializeCars(game.cars),
    peds: game.peds,
    police: serializeCars(game.police),
    pickups: game.pickups,
    wanted: game.wanted,
    mission: game.mission,
    race: game.race,
    deliveries: game.deliveries,
    kills: game.kills,
    events: game.events,
  })
  // The host's own fixedStep already reacted to these locally; once sent,
  // clear so they don't get re-broadcast on the next tick.
  game.events.length = 0
}

/* ---------- client ---------- */
const MAX_RECONNECT_ATTEMPTS = 3
let reconnectAttempts = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

// Connects and enters the lobby to wait for the host to start; `start`
// (below) is what actually transitions to 'playing'.
export function joinGame(name: string): Promise<void> {
  reconnectAttempts = 0
  return connectAsClient(name, true)
}

function connectAsClient(name: string, isInitialAttempt: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    game.netRole = 'client'
    useGame.getState().setNetRole('client')
    useGame.getState().setNetStatus('connecting')
    const nonce = Math.random().toString(36).slice(2)
    const ws = new WebSocket(wsUrl())
    socket = ws
    ws.onopen = () => {
      reconnectAttempts = 0
      send({ t: 'join', nonce, name })
    }
    ws.onerror = () => {
      if (isInitialAttempt) {
        useGame.getState().setNetStatus('error', 'Could not connect to that address.')
        reject(new Error('relay connection failed'))
      }
    }
    ws.onclose = (ev) => {
      if (game.netRole !== 'client') return // already left deliberately (disconnect())
      if (ev.code === 4001) {
        useGame.getState().setNetStatus('error', 'The host ended the game.')
        useGame.getState().setPhase('menu')
        game.started = false
        game.netRole = 'solo'
        return
      }
      // Transient drop (wifi blip, brief network hiccup) — retry with
      // backoff instead of immediately giving up on the session.
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++
        const attempt = reconnectAttempts
        useGame
          .getState()
          .setNetStatus(
            'connecting',
            `Connection lost — reconnecting (${attempt}/${MAX_RECONNECT_ATTEMPTS})…`,
          )
        reconnectTimer = setTimeout(() => connectAsClient(name, false), 500 * attempt)
      } else {
        useGame.getState().setNetStatus('error', 'Lost connection to the host.')
        useGame.getState().setPhase('menu')
        game.started = false
        game.netRole = 'solo'
      }
    }
    // The relay only broadcasts, never addresses a single client — so a
    // routine snapshot the host was already mid-sending (generated just
    // before it finished processing our `join`) can reach us before our own
    // `welcome` does, listing everyone EXCEPT us yet. Applying that early
    // would make reconcilePlayers() delete our own placeholder entry (its id
    // isn't in the host's list), then `welcome` crashes trying to re-key an
    // entry that's already gone — leaving `game.player` undefined for the
    // rest of the session. So: ignore anything but `welcome` until it's in.
    let identityConfirmed = false
    ws.onmessage = (ev) => {
      const msg: NetMessage = JSON.parse(ev.data)
      if (msg.t === 'welcome') {
        if (msg.forNonce !== nonce) return // meant for a different joiner
        setLocalIdentity(msg.id, name)
        identityConfirmed = true
        useGame.getState().setNetStatus('connected')
        // On a reconnect, phase already reflects lobby-vs-playing from
        // before the drop (never touched while "connecting…") — only the
        // very first join needs to move it into the lobby.
        if (isInitialAttempt) useGame.getState().setPhase('lobby')
        resolve()
      } else if (!identityConfirmed) {
        return
      } else if (msg.t === 'roster') {
        useGame.getState().setLobbyPlayers(msg.players)
      } else if (msg.t === 'start') {
        game.cityData = msg.cityData
        game.buildings.length = 0
        game.buildings.push(...msg.buildings)
        game.started = true
        useGame.getState().setPhase('playing')
      } else if (msg.t === 'snapshot') {
        applySnapshot(msg)
      }
    }
  })
}

// Leaves a lobby or an in-progress session and returns to solo/menu.
export function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  socket?.close()
  socket = null
  for (const id of Object.keys(game.players)) {
    if (id !== game.localPlayerId) delete game.players[id]
  }
  bump('remotePlayers')
  game.netRole = 'solo'
  game.started = false
  useGame.getState().setNetRole('solo')
  useGame.getState().setNetStatus('idle')
  useGame.getState().setLobbyPlayers([])
  useGame.getState().setPhase('menu')
}

function copyCarFields(dst: Car, src: Car) {
  dst.kind = src.kind
  dst.color = src.color
  dst.hp = src.hp
  dst.type = src.type
  dst.variant = src.variant
  dst.cls = src.cls
  dst.honk = src.honk
  dst.siren = src.siren
  dst.speed = src.speed
  dst.vx = src.vx
  dst.vz = src.vz
  setTarget(dst, { x: src.x, z: src.z, a: src.a })
}
function copyPedFields(dst: Ped, src: Ped) {
  dst.speed = src.speed
  dst.r = src.r
  dst.hp = src.hp
  dst.panic = src.panic
  dst.dead = src.dead
  dst.color = src.color
  setTarget(dst, { x: src.x, z: src.z, a: src.a })
}
function copyPickupFields(dst: Pickup, src: Pickup) {
  dst.val = src.val
  dst.bob = src.bob
  dst.spin = src.spin
  dst.taken = src.taken
  // Pickups never move once placed — snap directly, no smoothing needed.
  dst.x = src.x
  dst.z = src.z
}
function copyPlayerFields(dst: Player, src: NetPlayer) {
  dst.name = src.name
  dst.hp = src.hp
  dst.inCarId = src.inCarId
  dst.inCar = src.inCarId != null ? (game.cars.find((c) => c.id === src.inCarId) ?? null) : null
  dst.punchT = src.punchT
  dst.money = src.money
  setTarget(dst, { x: src.x, y: src.y, z: src.z, a: src.a })
}

function reconcilePlayers(incoming: NetPlayer[]): boolean {
  const incomingIds = new Set(incoming.map((p) => p.id))
  let changed = false
  for (const id of Object.keys(game.players)) {
    // Never drop our own entry — losing it would leave game.player (the
    // localPlayerId-keyed accessor everything from the camera to the HUD
    // reads) undefined for the rest of the session.
    if (id === game.localPlayerId) continue
    if (!incomingIds.has(id)) {
      delete game.players[id]
      changed = true
    }
  }
  for (const item of incoming) {
    let p = game.players[item.id]
    if (!p) {
      p = makePlayer(item.id, item.name)
      game.players[item.id] = p
      changed = true
    }
    copyPlayerFields(p, item)
  }
  return changed
}

function applySnapshot(msg: Extract<NetMessage, { t: 'snapshot' }>) {
  if (reconcilePlayers(msg.players)) bump('remotePlayers')
  if (reconcileArray(game.cars, msg.cars, (i) => ({ ...i }), copyCarFields)) bump('cars')
  if (reconcileArray(game.police, msg.police, (i) => ({ ...i }), copyCarFields)) bump('police')
  if (reconcileArray(game.peds, msg.peds, (i) => ({ ...i }), copyPedFields)) bump('peds')
  if (reconcileArray(game.pickups, msg.pickups, (i) => ({ ...i }), copyPickupFields))
    bump('pickups')
  game.wanted = msg.wanted
  game.mission = msg.mission
  game.race = msg.race
  game.deliveries = msg.deliveries
  game.kills = msg.kills
  applyEvents(msg.events)
}

// Called every render frame (from Systems.tsx) when netRole === 'client' —
// smooths every live networked entity toward its latest received target.
export function tick() {
  for (const c of game.cars) smoothTowards(c)
  for (const c of game.police) smoothTowards(c)
  for (const t of game.peds) smoothTowards(t)
  for (const id in game.players) smoothTowards(game.players[id])
}

// Called at ~20Hz (from Systems.tsx) when netRole === 'client'.
export function sendInput() {
  send({ t: 'input', id: game.localPlayerId, input: readLocalInput() })
}
