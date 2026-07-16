import {
  TWO_PI,
  WORLD,
  CAR_COLORS,
  GRAVITY,
  JUMP_SPEED,
  rand,
  randi,
  clamp,
  dist2,
  isRoad,
} from './constants'
import { game, resetGame } from './state'
import { generateCity, findRoadPoint } from './world'
import { useGame } from '../store/useGame'
import { initAudio, beep, gunshot, sfxEnter, sfxPickup, sfxDelivery, sfxSiren } from './audio'
import { WEAPONS, VEHICLE_CLASSES } from './weapons'
import { K, readLocalInput } from './input'
import type { Car, Ped, Pickup, Mission, MissionType, Player, InputState, GameEvent } from './types'

let idc = 1
const nextId = () => idc++
const bump = (k: 'cars' | 'peds' | 'police' | 'pickups') => useGame.getState().bump(k)
let toastId = 0
export function toast(text: string, ms = 1400) {
  useGame.getState().setToast(text ? { text, ms, id: ++toastId } : null)
}
const settings = () => useGame.getState().settings

// Player-tagged toasts: routed through game.events so the RIGHT screen shows
// them — the host reacts to its own locally (same tick), and each client
// picks its own out of the broadcast snapshot's events array.
function pushToast(id: string, text: string, ms = 1400) {
  game.events.push({ type: 'toast', id, text, ms })
}
export function applyEvents(events: GameEvent[]) {
  for (const e of events) {
    if (e.type === 'toast' && e.id === game.localPlayerId) {
      toast(e.text as string, (e.ms as number) ?? 1400)
    }
  }
}

/* ---------- factories ---------- */
function mkCar(x: number, z: number, opts: Partial<Car> = {}): Car {
  const kind = opts.type === 'police' ? 'car' : opts.kind || (Math.random() < 0.22 ? 'bike' : 'car')
  const variant = kind === 'bike' ? 0 : randi(0, 2)
  const cls =
    kind === 'bike' ? 'bike' : variant === 1 ? 'truck' : Math.random() < 0.25 ? 'sports' : 'sedan'
  return {
    id: nextId(),
    x,
    z,
    a: rand(0, TWO_PI),
    vx: 0,
    vz: 0,
    speed: 0,
    kind,
    variant,
    cls,
    color: CAR_COLORS[randi(0, CAR_COLORS.length)],
    hp: 100,
    type: 'parked',
    driver: null,
    _ai_steer: 0,
    _ai_accel: 0,
    _flip: 0,
    honk: 0,
    siren: 0,
    ...opts,
  } as Car
}
function mkPed(x: number, z: number): Ped {
  const hue = Math.floor(rand(0, 360))
  return {
    id: nextId(),
    x,
    z,
    a: rand(0, TWO_PI),
    speed: rand(0.5, 1.1),
    r: 9,
    hp: 30,
    panic: 0,
    dead: false,
    color: `hsl(${hue},50%,55%)`,
  }
}
function mkPickup(x: number, z: number): Pickup {
  return { id: nextId(), x, z, val: randi(20, 120), bob: rand(0, TWO_PI), spin: 0, taken: false }
}

/* ---------- lifecycle ---------- */
export function startRun() {
  resetGame()
  game.cityData = generateCity()
  spawnWorld()
  startMission(0)
  game.started = true
  initAudio()
  useGame.getState().setPhase('playing')
}
function spawnWorld() {
  game.cars.length = 0
  game.peds.length = 0
  game.police.length = 0
  game.pickups.length = 0
  game.fx.length = 0
  for (let i = 0; i < 70; i++) {
    const p = findRoadPoint()
    const c = mkCar(p.x, p.z)
    c.a = p.horiz ? Math.PI / 2 : 0
    if (Math.random() < 0.55) {
      c.type = 'traffic'
      c.driver = {}
    }
    game.cars.push(c)
  }
  for (let i = 0; i < 55; i++) {
    const onRoad = Math.random() < 0.5
    let x = 0,
      z = 0
    for (let t = 0; t < 30; t++) {
      x = rand(40, WORLD.w - 40)
      z = rand(40, WORLD.h - 40)
      if (isRoad(x, z) === onRoad) break
    }
    game.peds.push(mkPed(x, z))
  }
  for (let i = 0; i < 40; i++) {
    const p = findRoadPoint()
    game.pickups.push(mkPickup(p.x, p.z))
  }
  const p = findRoadPoint()
  game.player.x = p.x
  game.player.z = p.z
  bump('cars')
  bump('peds')
  bump('police')
  bump('pickups')
}

/* ---------- mission framework (delivery / chase / survive) ---------- */
const MISSION_CYCLE: MissionType[] = ['delivery', 'chase', 'survive']
export function startMission(index: number) {
  const type = MISSION_CYCLE[index % MISSION_CYCLE.length]
  const reward = randi(300, 600) + game.deliveries * 120
  const p = findRoadPoint()
  const base: Mission = {
    type,
    x: p.x,
    z: p.z,
    r: 48,
    reward,
    pulse: 0,
    title: '',
    desc: '',
    done: false,
  }
  if (type === 'delivery') {
    base.title = `Delivery #${game.deliveries + 1}`
    base.desc = `Drive to the marked drop-off and earn $${reward}.`
  } else if (type === 'chase') {
    const target = pickTarget()
    base.targetId = target?.id
    base.timeLeft = 45
    base.title = 'Hit & Run'
    base.desc = `Destroy the marked target vehicle before time runs out. +$${reward}.`
  } else {
    base.timeLeft = 30
    base.title = 'Survive the Heat'
    base.desc = `Stay alive with a wanted level for 30s. +$${reward}.`
    bumpWanted(3)
  }
  game.mission = base
  useGame.getState().setMissionInfo({ title: base.title, desc: base.desc })
}
function pickTarget(): Car | undefined {
  const controlled = new Set(
    Object.values(game.players)
      .map((pl) => pl.inCar)
      .filter((c): c is Car => c !== null),
  )
  const cands = game.cars.filter((c) => c.type === 'traffic' && !controlled.has(c))
  if (!cands.length) return undefined
  const t = cands[randi(0, cands.length)]
  t.color = 0xff2bd6 // make it pop
  return t
}
function completeMission(p: Player) {
  const m = game.mission!
  p.money += m.reward
  game.deliveries++
  pushToast(p.id, `${m.title.toUpperCase()} +$${m.reward}`, 1600)
  sfxDelivery()
  startMission(game.deliveries)
}
function failMission() {
  pushToast(game.localPlayerId, 'MISSION FAILED', 1400)
  startMission(game.deliveries)
}
function updateMission() {
  const m = game.mission
  if (!m) return
  m.pulse += 0.08
  if (m.type === 'delivery') {
    for (const id in game.players) {
      const p = game.players[id]
      if (p.inCar && dist2(p.x, p.z, m.x, m.z) < m.r) {
        completeMission(p)
        return
      }
    }
  } else if (m.type === 'chase') {
    const target = game.cars.find((c) => c.id === m.targetId)
    if (!target) {
      completeMission(game.player)
      return
    }
    m.x = target.x
    m.z = target.z
    if (target.hp <= 0) {
      completeMission(game.player)
      return
    }
    m.timeLeft = (m.timeLeft ?? 0) - 1 / 60
    if (m.timeLeft <= 0) failMission()
  } else if (m.type === 'survive') {
    // Wanted/police stay host-centric (shared, not per-player), so "survive"
    // tracks the host's own position — matches the plan's scope decision.
    m.x = game.player.x
    m.z = game.player.z
    m.timeLeft = (m.timeLeft ?? 0) - 1 / 60
    if (m.timeLeft <= 0) completeMission(game.player)
  }
}

/* ---------- race (multiplayer-only, host-triggered) ---------- */
const RACE_CHECKPOINTS = 8
const RACE_MIN_GAP = 700 // min distance between consecutive checkpoints
const RACE_RESULTS_SECONDS = 8

function generateRaceCourse() {
  const checkpoints: { x: number; z: number; r: number }[] = []
  let prev: { x: number; z: number } | null = null
  for (let i = 0; i < RACE_CHECKPOINTS; i++) {
    let point = findRoadPoint()
    for (
      let tries = 0;
      prev && tries < 20 && dist2(prev.x, prev.z, point.x, point.z) < RACE_MIN_GAP;
      tries++
    ) {
      point = findRoadPoint()
    }
    checkpoints.push({ x: point.x, z: point.z, r: 50 })
    prev = point
  }
  return checkpoints
}

function spawnRaceCar(p: Player, x: number, z: number, a: number) {
  if (p.inCar) {
    p.inCar.driver = null
    p.inCar.type = 'parked'
    p.inCar = null
  }
  const c = mkCar(x, z, { a, type: 'player', kind: 'car', cls: 'sports', driver: p })
  game.cars.push(c)
  bump('cars')
  p.inCar = c
  p.x = x
  p.z = z
  p.a = a
  p.vx = p.vz = 0
}

function ordinal(n: number) {
  const suffixes = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0])
}

// Host-only: starts a race for everyone currently connected — a separate
// mode layered over the shared world, not part of the mission rotation.
export function startRace() {
  if (game.netRole !== 'host' || game.race) return
  if (Object.keys(game.players).length < 2) {
    pushToast(game.localPlayerId, 'Need at least 2 players to race', 1500)
    return
  }
  const checkpoints = generateRaceCourse()
  const start = checkpoints[0]
  const progress: Record<string, number> = {}
  let i = 0
  for (const id in game.players) {
    const ox = start.x + (i % 3) * 24 - 24
    const oz = start.z + Math.floor(i / 3) * 24
    spawnRaceCar(game.players[id], ox, oz, 0)
    progress[id] = 0
    i++
  }
  game.race = { phase: 'countdown', countdown: 3, checkpoints, progress, results: [], resultsT: 0 }
}

function updateRace() {
  const race = game.race
  if (!race) return
  if (race.phase === 'countdown') {
    race.countdown -= 1 / 60
    if (race.countdown <= 0) race.phase = 'racing'
    return
  }
  if (race.phase === 'racing') {
    for (const id in game.players) {
      const p = game.players[id]
      const idx = race.progress[id] ?? 0
      if (idx >= race.checkpoints.length) continue
      const cp = race.checkpoints[idx]
      if (dist2(p.x, p.z, cp.x, cp.z) < cp.r) {
        race.progress[id] = idx + 1
        if (idx + 1 >= race.checkpoints.length) {
          const place = race.results.length + 1
          race.results.push({ id, name: p.name, place })
          pushToast(
            id,
            place === 1 ? '🏁 You won the race!' : `🏁 Finished ${ordinal(place)}!`,
            2000,
          )
          if (place === 1) {
            race.phase = 'finished'
            race.resultsT = RACE_RESULTS_SECONDS
          }
        }
      }
    }
    return
  }
  // 'finished'
  race.resultsT -= 1 / 60
  if (race.resultsT <= 0) game.race = null
}

/* ---------- collisions ---------- */
function hitBuilding(x: number, z: number, r: number) {
  for (const b of game.buildings) {
    const hw = b.w / 2 + r,
      hd = b.d / 2 + r
    if (x > b.x - hw && x < b.x + hw && z > b.z - hd && z < b.z + hd) return b
  }
  return null
}
function resolveBuilding(o: { x: number; z: number; r: number; speed?: number }) {
  const b = hitBuilding(o.x, o.z, o.r)
  if (!b) return false
  const hw = b.w / 2 + o.r,
    hd = b.d / 2 + o.r
  const left = o.x - (b.x - hw),
    right = b.x + hw - o.x,
    top = o.z - (b.z - hd),
    bot = b.z + hd - o.z
  const m = Math.min(left, right, top, bot)
  if (m === left) o.x = b.x - hw
  else if (m === right) o.x = b.x + hw
  else if (m === top) o.z = b.z - hd
  else o.z = b.z + hd
  if (o.speed !== undefined) o.speed *= 0.35
  return true
}

/* ---------- enter / exit / melee ---------- */
function nearestCarTo(p: Player, maxD: number) {
  let best: Car | null = null,
    bd = maxD
  for (const c of game.cars) {
    if (c === p.inCar) continue
    const d = dist2(p.x, p.z, c.x, c.z)
    if (d < bd) {
      bd = d
      best = c
    }
  }
  return best
}
export function nearestCar(maxD: number) {
  return nearestCarTo(game.player, maxD)
}
export function tryEnterExit(p: Player = game.player) {
  if (!game.started) return
  if (p.inCar) {
    const c = p.inCar
    p.inCar = null
    c.type = 'parked'
    c.driver = null
    p.x = c.x + Math.cos(c.a) * 32
    p.z = c.z - Math.sin(c.a) * 32
    p.vx = p.vz = 0
    p.y = 0
    p.vy = 0
    p.grounded = true
    p.speed = 0
    p.a = c.a
    if (p === game.player) {
      toast('On foot', 600)
      beep(330, 0.06, 'sine')
    }
  } else {
    const c = nearestCarTo(p, 60)
    if (c) {
      c.type = 'player'
      c.driver = p
      c.hp = Math.max(c.hp, 60)
      p.inCar = c
      if (p === game.player) {
        game.yaw = c.a + Math.PI
        if (c.kind === 'bike') toast('Motorcycle', 600)
        sfxEnter()
      }
    }
  }
}
export function doAction(p: Player = game.player) {
  if (!game.started) return
  if (p.inCar) {
    p.inCar.honk = 12
    if (p === game.player) beep(180, 0.12, 'sawtooth', 0.05)
    return
  }
  p.punchT = 12
  if (p === game.player) beep(120, 0.05, 'square', 0.05)
  const fx2 = p.x + Math.sin(p.a) * 22,
    fz2 = p.z + Math.cos(p.a) * 22
  for (const t of game.peds) {
    if (t.dead) continue
    if (dist2(fx2, fz2, t.x, t.z) < 24) {
      t.hp -= 20
      t.panic = 200
      t.a = Math.atan2(t.x - p.x, t.z - p.z)
      t.speed = 2.2
      bumpWanted(1)
      spawnFX(t.x, 18, t.z, 0xc0392b, 8)
    }
  }
}

/* ---------- weapons ---------- */
export function switchWeapon(i: number, p: Player = game.player) {
  if (i < 0 || i >= WEAPONS.length) return
  if (p.weapon.reloadT > 0) return
  p.weapon.current = i
  if (p === game.player) beep(440, 0.04, 'sine')
}
export function reload(p: Player = game.player) {
  const w = p.weapon,
    def = WEAPONS[w.current]
  if (w.reloadT > 0 || w.ammo[w.current] >= def.mag) return
  w.reloadT = def.reload
  if (p === game.player) beep(140, 0.05, 'square', 0.04)
}
export function shoot(p: Player = game.player, aimYaw: number = game.yaw) {
  if (!game.started || p.inCar) return
  const w = p.weapon,
    def = WEAPONS[w.current]
  if (w.reloadT > 0 || w.cooldown > 0) return
  if (w.ammo[w.current] <= 0) {
    reload(p)
    return
  }
  w.ammo[w.current]--
  w.cooldown = def.cooldown
  const aim = aimYaw
  if (p === game.player) {
    // recoil kick (visual) — only meaningful for whoever owns this camera.
    game.pitch = clamp(game.pitch + def.recoil, -0.25, 1.3)
    game.yaw += (Math.random() - 0.5) * def.recoil
    gunshot()
    game.focus = Math.min(100, game.focus + 2)
  }
  for (let pellet = 0; pellet < def.pellets; pellet++) {
    const ang = aim + (Math.random() - 0.5) * 2 * def.spread
    const dx = -Math.sin(ang),
      dz = -Math.cos(ang)
    p.a = Math.atan2(-Math.sin(aim), -Math.cos(aim))
    const ox = p.x + dx * 18,
      oz = p.z + dz * 18
    let hitT = def.range,
      hitKind: string | null = null,
      hitObj: Car | Ped | null = null
    const scan = (arr: (Car | Ped)[], kind: string, perpMax: number) => {
      for (const c of arr) {
        if (c === p.inCar || (c as Ped).dead) continue
        const tx = c.x - ox,
          tz = c.z - oz,
          proj = tx * dx + tz * dz
        if (proj < 0 || proj > def.range) continue
        const perp = Math.hypot(tx - dx * proj, tz - dz * proj)
        if (perp < perpMax && proj < hitT) {
          hitT = proj
          hitKind = kind
          hitObj = c
        }
      }
    }
    scan(game.peds, 'ped', 22)
    scan(game.cars, 'car', 24)
    scan(game.police, 'car', 24)
    const ex = ox + dx * hitT,
      ez = oz + dz * hitT
    for (let i = 1; i <= 3; i++)
      spawnFX(ox + dx * ((hitT * i) / 4), 22, oz + dz * ((hitT * i) / 4), 0xfff2a0, 1, true)
    if (hitKind === 'ped' && hitObj) {
      const t = hitObj as Ped
      t.hp -= def.damagePed
      t.panic = 200
      spawnFX(t.x, 20, t.z, 0xc0392b, 8)
      if (t.hp <= 0) {
        bumpWanted(def.wanted)
        game.kills++
      }
    } else if (hitKind === 'car' && hitObj) {
      const c = hitObj as Car
      c.hp -= def.damageCar
      spawnFX(ex, 16, ez, 0xffd33d, 5)
      bumpWanted(0.3)
    }
  }
  spawnFX(p.x + -Math.sin(aim) * 16, 22, p.z + -Math.cos(aim) * 16, 0xffe08a, 3, true)
}

/* ---------- wanted ---------- */
function bumpWanted(n: number) {
  game.wanted = clamp(game.wanted + n * 0.34, 0, 5)
  game.wantedDecay = 0
  if (Math.floor(game.wanted) >= 1) ensurePolice()
}
function ensurePolice() {
  while (game.police.length < Math.floor(game.wanted)) {
    const ang = rand(0, TWO_PI),
      d = rand(600, 950)
    const c = mkCar(
      clamp(game.player.x + Math.cos(ang) * d, 60, WORLD.w - 60),
      clamp(game.player.z + Math.sin(ang) * d, 60, WORLD.h - 60),
      { type: 'police' },
    )
    c.color = 0x1d3557
    c.driver = {}
    game.police.push(c)
    sfxSiren()
  }
  bump('police')
}
function clearPolice() {
  game.police.length = 0
  bump('police')
}

/* ---------- fx ---------- */
function spawnFX(x: number, y: number, z: number, color: number, n: number, flash = false) {
  for (let i = 0; i < n; i++) {
    game.fx.push({
      id: nextId(),
      x,
      y,
      z,
      color,
      vx: flash ? rand(-1, 1) : rand(-2, 2),
      vy: flash ? rand(-0.5, 0.5) : rand(1, 4),
      vz: flash ? rand(-1, 1) : rand(-2, 2),
      s: flash ? rand(5, 10) : rand(3, 7),
      life: flash ? 6 : 30,
      maxLife: flash ? 6 : 30,
    })
  }
}
function spawnSmoke(x: number, z: number) {
  game.fx.push({
    id: nextId(),
    x,
    y: 12,
    z,
    color: 0x555560,
    vx: rand(-0.4, 0.4),
    vy: rand(0.6, 1.4),
    vz: rand(-0.4, 0.4),
    s: rand(6, 12),
    life: 34,
    maxLife: 34,
  })
}

/* ---------- movement / AI ---------- */
// Parameterized over a Player + their own InputState so it applies equally to
// the local player (host or solo) and, on the host, every connected remote
// player's entry — driven by whichever InputState/yaw belongs to them.
function updateFoot(p: Player, input: InputState) {
  const fH = { x: -Math.sin(input.yaw), z: -Math.cos(input.yaw) }
  const rH = { x: Math.cos(input.yaw), z: -Math.sin(input.yaw) }
  let mx = 0,
    mz = 0
  if (input.up) {
    mx += fH.x
    mz += fH.z
  }
  if (input.down) {
    mx -= fH.x
    mz -= fH.z
  }
  if (input.right) {
    mx += rH.x
    mz += rH.z
  }
  if (input.left) {
    mx -= rH.x
    mz -= rH.z
  }
  const sp = input.boost ? 3.0 : 1.9
  if (mx || mz) {
    const l = Math.hypot(mx, mz)
    mx /= l
    mz /= l
    p.a = Math.atan2(mx, mz)
    p.vx += mx * sp * 0.5
    p.vz += mz * sp * 0.5
  }
  p.vx *= 0.78
  p.vz *= 0.78
  p.x += p.vx
  p.z += p.vz
  p.x = clamp(p.x, 14, WORLD.w - 14)
  p.z = clamp(p.z, 14, WORLD.h - 14)
  resolveBuilding(p as never)
  if (input.jump && p.grounded) {
    p.vy = JUMP_SPEED
    p.grounded = false
  }
  p.vy -= GRAVITY
  p.y += p.vy
  if (p.y <= 0) {
    p.y = 0
    p.vy = 0
    p.grounded = true
  }
  if (p.punchT > 0) p.punchT--
  p.speed = Math.hypot(p.vx, p.vz)
}
// `input` is only passed for a host-simulated remote player's car; the local
// player's own car keeps reading raw keys directly (zero added latency).
function updateCar(c: Car, control: boolean, input?: InputState) {
  const t = VEHICLE_CLASSES[c.cls] || VEHICLE_CLASSES.sedan
  const up = input ? input.up : K.up()
  const down = input ? input.down : K.down()
  const left = input ? input.left : K.left()
  const right = input ? input.right : K.right()
  const boost = input ? input.boost : K.boost()
  const brake = input ? input.brake : K.brake()
  const maxS = control && boost ? t.boost : t.base
  let steer = 0
  if (control) {
    if (right) steer = -1
    if (left) steer = 1
    if (up) c.speed += t.accel * (boost ? 1.4 : 1)
    else if (down) c.speed -= 0.06
    else c.speed *= 0.975
    if (brake) c.speed *= 0.9
  } else {
    c.speed += c._ai_accel
    c.speed *= 0.985
    steer = c._ai_steer
  }
  c.speed = clamp(c.speed, -1.6, maxS)
  const steerMul = control ? settings().steerSensitivity : 1
  const turn = t.turn * steerMul * clamp(Math.abs(c.speed) / 2.0, 0, 1.2)
  c.a += steer * turn * (c.speed < 0 ? -1 : 1)
  const fx2 = Math.sin(c.a),
    fz2 = Math.cos(c.a)
  c.vx = fx2 * c.speed
  c.vz = fz2 * c.speed
  if (control && brake && Math.abs(c.speed) > 1.6) {
    c.vx += Math.cos(c.a) * c.speed * 0.22 * steer
    c.vz += -Math.sin(c.a) * c.speed * 0.22 * steer
    if (Math.random() < 0.5) spawnFX(c.x - fx2 * 22, 4, c.z - fz2 * 22, 0x9aa0aa, 1)
  }
  c.x += c.vx
  c.z += c.vz
  c.x = clamp(c.x, 20, WORLD.w - 20)
  c.z = clamp(c.z, 20, WORLD.h - 20)
  const probe = { x: c.x, z: c.z, r: 16, speed: c.speed }
  if (resolveBuilding(probe)) {
    c.x = probe.x
    c.z = probe.z
    c.speed = probe.speed
    if (Math.abs(c.speed) > 1.6) spawnFX(c.x, 14, c.z, 0xffd33d, 5)
  }
  if (c.honk > 0) c.honk--
  // damage smoke
  if (c.hp < 40 && Math.random() < 0.12) spawnSmoke(c.x, c.z)
}
function aiTraffic(c: Car) {
  c._ai_accel = 0.05
  const nx = c.x + Math.sin(c.a) * 48,
    nz = c.z + Math.cos(c.a) * 48
  if (!isRoad(nx, nz) || hitBuilding(nx, nz, 16)) {
    if (!c._flip) c._flip = Math.random() < 0.5 ? -1 : 1
    c._ai_steer = c._flip
  } else {
    c._flip = 0
    c._ai_steer = 0
  }
  if (c.speed < 0.9) c.speed = 1.0
  c.speed = clamp(c.speed, 0, 2.2)
}
// Wanted level/police stay host-centric (shared, not per-player) per the
// multiplayer plan's scope decision — police always chase the host's avatar.
function aiPolice(c: Car) {
  const des = Math.atan2(game.player.x - c.x, game.player.z - c.z)
  const diff = ((des - c.a + Math.PI) % TWO_PI) - Math.PI
  c._ai_steer = clamp(diff * 2.2, -1, 1)
  c._ai_accel = 0.1
  c.speed = clamp(c.speed, 0, 4.2)
  c.siren = (c.siren + 0.25) % TWO_PI
  const d = dist2(c.x, c.z, game.player.x, game.player.z)
  if (d < 42) {
    if (game.player.inCar) game.player.inCar.hp -= 0.6
    else game.player.hp -= 0.5
    game.busting += 1
    if (Math.random() < 0.05) spawnFX(game.player.x, 16, game.player.z, 0xffd33d, 4)
  }
}
function carHits(c: Car) {
  const sp = Math.abs(c.speed)
  const isPlayerCar = Object.values(game.players).some((pl) => pl.inCar === c)
  for (const t of game.peds) {
    if (t.dead) continue
    if (dist2(c.x, c.z, t.x, t.z) < 22) {
      t.x += c.vx * 1.5
      t.z += c.vz * 1.5
      t.panic = 200
      t.a = Math.atan2(t.x - c.x, t.z - c.z)
      t.speed = 2.5
      if (sp > 1.4) {
        t.hp -= 40
        spawnFX(t.x, 18, t.z, 0xc0392b, 8)
        if (isPlayerCar) bumpWanted(1.2)
      }
    }
  }
  for (const o of game.cars) {
    if (o === c) continue
    const d = dist2(c.x, c.z, o.x, o.z)
    if (d < 40) {
      const nx = (c.x - o.x) / (d || 1),
        nz = (c.z - o.z) / (d || 1)
      c.x += nx * 2
      c.z += nz * 2
      o.x -= nx * 2
      o.z -= nz * 2
      if (sp > 1.6) {
        spawnFX((c.x + o.x) / 2, 14, (c.z + o.z) / 2, 0xffd33d, 5)
        c.speed *= 0.6
        o.speed *= 0.5
        if (isPlayerCar) {
          c.hp -= 2
          o.hp -= 6
          bumpWanted(0.2)
        }
      }
    }
  }
}
function updatePed(t: Ped) {
  if (t.hp <= 0) {
    t.dead = true
    return
  }
  if (t.panic > 0) {
    t.panic--
    t.speed = 2.0
    t.a = Math.atan2(t.x - game.player.x, t.z - game.player.z)
  } else {
    if (Math.random() < 0.01) t.a += rand(-1, 1)
    t.speed = 0.7
  }
  const nx = t.x + Math.sin(t.a) * t.speed,
    nz = t.z + Math.cos(t.a) * t.speed
  if (!hitBuilding(nx, nz, t.r)) {
    t.x = nx
    t.z = nz
  } else t.a += Math.PI / 2
  t.x = clamp(t.x, 8, WORLD.w - 8)
  t.z = clamp(t.z, 8, WORLD.h - 8)
}
function updatePickups() {
  for (const k of game.pickups) {
    if (k.taken) continue
    k.bob += 0.1
    k.spin += 0.08
    for (const id in game.players) {
      const p = game.players[id]
      if (dist2(p.x, p.z, k.x, k.z) < (p.inCar ? 26 : 18)) {
        k.taken = true
        p.money += k.val
        pushToast(id, '+$' + k.val, 700)
        sfxPickup()
        break
      }
    }
  }
  if (game.pickups.filter((k) => !k.taken).length < 20 && Math.random() < 0.02) {
    const rp = findRoadPoint()
    game.pickups.push(mkPickup(rp.x, rp.z))
    bump('pickups')
  }
  updateMission()
}
export function respawnPlayer(p: Player = game.player) {
  if (!game.started) return
  if (p.inCar) {
    p.inCar.driver = null
    p.inCar.type = 'parked'
    p.inCar = null
  }
  p.hp = 100
  p.vx = p.vz = 0
  p.y = 0
  p.vy = 0
  p.grounded = true
  p.speed = 0
  const rp = findRoadPoint()
  p.x = rp.x
  p.z = rp.z
  if (p === game.player) {
    game.wanted = 0
    clearPolice()
    game.busting = 0
    toast('Respawned', 900)
  } else {
    pushToast(p.id, 'Respawned', 900)
  }
}
function recordProfile() {
  const st = useGame.getState()
  const pr = st.profile
  st.setProfile({
    bestMoney: Math.max(pr.bestMoney, game.player.money),
    totalDeliveries: pr.totalDeliveries + game.deliveries,
    totalKills: pr.totalKills + game.kills,
    runs: pr.runs + 1,
  })
}
function checkDeath() {
  for (const id in game.players) {
    const p = game.players[id]
    if (p.inCar && p.inCar.hp <= 0) {
      spawnFX(p.x, 18, p.z, 0xffae42, 16)
      p.hp -= 30
      const c = p.inCar
      p.inCar = null
      c.type = 'parked'
      c.driver = null
    }
    if (p.hp <= 0) {
      if (game.netRole === 'solo') {
        game.started = false
        recordProfile()
        useGame.getState().setPhase('wasted')
      } else {
        // Multiplayer: death never ends the shared session — just that
        // player's own avatar respawns, local or remote alike.
        respawnPlayer(p)
      }
    }
  }
  if (game.busting > 180) {
    toast('BUSTED', 1500)
    game.player.money = Math.floor(game.player.money * 0.85)
    respawnPlayer(game.player)
  }
  game.busting = Math.max(0, game.busting - 1)
}

/* ---------- one fixed simulation step ---------- */
function fixedStep() {
  const p = game.player
  // weapon timers — every connected player has their own ammo/cooldown/reload.
  for (const id in game.players) {
    const w = game.players[id].weapon
    if (w.cooldown > 0) w.cooldown--
    if (w.reloadT > 0) {
      w.reloadT--
      if (w.reloadT === 0) w.ammo[w.current] = WEAPONS[w.current].mag
    }
  }

  if (p.inCar) {
    updateCar(p.inCar, true)
    p.x = p.inCar.x
    p.z = p.inCar.z
    p.a = p.inCar.a
    carHits(p.inCar)
  } else updateFoot(p, readLocalInput())

  if (game.netRole === 'host') {
    for (const id in game.players) {
      if (id === game.localPlayerId) continue
      const rp = game.players[id]
      const input = game.remoteInputs[id]
      if (!input) continue
      for (const ev of input.events) {
        if (ev === 'enter') tryEnterExit(rp)
        else if (ev === 'action') doAction(rp)
        else if (ev === 'shoot') shoot(rp, input.yaw)
        else if (ev === 'reload') reload(rp)
        else if (ev === 'respawn') respawnPlayer(rp)
        else if (ev.startsWith('weapon')) switchWeapon(Number(ev.slice(6)), rp)
      }
      if (rp.inCar) {
        updateCar(rp.inCar, true, input)
        carHits(rp.inCar)
      } else {
        updateFoot(rp, input)
      }
    }
  }

  // Any car currently occupied by ANY player (local or remote) is
  // player-driven this tick, not AI traffic.
  const occupied = new Set<Car>()
  for (const id in game.players) {
    const c = game.players[id].inCar
    if (c) occupied.add(c)
  }
  for (const c of game.cars) {
    if (occupied.has(c)) continue
    if (c.type === 'traffic') {
      aiTraffic(c)
      updateCar(c, false)
      carHits(c)
    }
  }
  for (const c of game.police) {
    aiPolice(c)
    updateCar(c, false)
    carHits(c)
  }
  for (const t of game.peds) updatePed(t)
  let removed = false
  for (let i = game.peds.length - 1; i >= 0; i--) {
    if (game.peds[i].dead && Math.random() < 0.005) {
      game.peds.splice(i, 1)
      removed = true
    }
  }
  while (game.peds.length < 55 && Math.random() < 0.05) {
    const rp = findRoadPoint()
    game.peds.push(mkPed(rp.x, rp.z))
    removed = true
  }
  if (removed) bump('peds')
  updatePickups()
  game.wantedDecay += 1 / 60
  if (game.wantedDecay > 9 && game.wanted > 0) {
    game.wanted = Math.max(0, game.wanted - 0.12 / 60)
    if (Math.floor(game.wanted) < game.police.length) {
      game.police.pop()
      bump('police')
    }
  }
  ensurePolice()
  for (let i = game.fx.length - 1; i >= 0; i--) {
    const f = game.fx[i]
    f.x += f.vx
    f.y += f.vy
    f.z += f.vz
    f.vy -= 0.18
    f.vx *= 0.95
    f.vz *= 0.95
    if (f.y < 0) {
      f.y = 0
      f.vy *= -0.3
    }
    f.life--
    if (f.life <= 0) game.fx.splice(i, 1)
  }
  checkDeath()
  updateRace()
  // Local reaction to this tick's toast-worthy events (host sees its own
  // instantly); the broadcast drains+clears these at its own cadence, so
  // only solo needs to clear here (nothing else ever will).
  applyEvents(game.events)
  if (game.netRole === 'solo') game.events.length = 0
}

// advance simulation with Focus slow-mo via an accumulator (frame-paced).
export function stepWorld(dt: number) {
  if (!game.started) return
  // Focus slow-mo scales the WHOLE shared simulation's timeScale — a
  // single-player-only mechanic. In multiplayer it stays cosmetic (meter
  // regenerates, but never slows the world for every connected player).
  if (game.netRole === 'solo' && K.focus() && game.focus > 1) {
    game.focusActive = true
    game.focus = Math.max(0, game.focus - 28 * dt)
    game.timeScale = 0.32
  } else {
    game.focusActive = false
    game.focus = Math.min(100, game.focus + 10 * dt)
    game.timeScale = 1
  }
  game.simAccum += game.timeScale
  let steps = 0
  while (game.simAccum >= 1 && steps < 3) {
    fixedStep()
    game.simAccum -= 1
    steps++
  }
}
