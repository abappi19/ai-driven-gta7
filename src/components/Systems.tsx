import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { game } from '../game/state'
import { stepWorld, nearestCar } from '../game/systems'
import { WEAPONS } from '../game/weapons'
import { useGame } from '../store/useGame'
import * as net from '../net/client'

// The single authoritative game-loop component. Solo/host: advances the
// simulation each frame. Client: smooths networked entities toward the
// latest snapshot instead, and sends local input at ~20Hz. Everyone pushes a
// THROTTLED snapshot to the reactive store (~12x/sec, and — when hosting —
// broadcasts a world snapshot on the same cadence) so the HUD/network don't
// run 60x/sec.
export default function Systems() {
  const acc = useRef(0)
  const inputAcc = useRef(0)
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    if (game.netRole === 'client') {
      net.tick()
      inputAcc.current += dt
      if (inputAcc.current >= 0.05) {
        inputAcc.current = 0
        net.sendInput()
      }
    } else {
      stepWorld(dt)
    }
    acc.current += dt
    if (acc.current >= 0.08) {
      acc.current = 0
      if (game.netRole === 'host') net.hostBroadcast()
      const p = game.player
      const st = useGame.getState()
      const speed = p.inCar ? Math.abs(p.inCar.speed) / 4.3 : p.speed / 3.0
      const w = game.player.weapon
      const def = WEAPONS[w.current]
      st.setHud({
        money: p.money,
        wanted: Math.round(game.wanted),
        hp: Math.max(0, Math.round(p.hp)),
        speed: Math.min(1, Math.max(0, speed)),
        focus: Math.round(game.focus),
        deliveries: game.deliveries,
        kills: game.kills,
        inCar: !!p.inCar,
        weaponName: def.name,
        ammo: w.ammo[w.current],
        mag: def.mag,
        reloading: w.reloadT > 0,
        missionTimer: game.mission?.timeLeft ? Math.ceil(game.mission.timeLeft) : 0,
      })
      st.setFocusActive(game.focusActive)
      if (!p.inCar) {
        const c = nearestCar(60)
        st.setPrompt(c ? `Press [E] to take the ${c.kind === 'bike' ? 'motorcycle' : 'car'}` : '')
      } else st.setPrompt('')
      if (game.netRole !== 'solo') {
        st.setRoster(
          Object.values(game.players).map((rp) => ({
            id: rp.id,
            name: rp.name,
            hp: Math.max(0, Math.round(rp.hp)),
            isLocal: rp.id === game.localPlayerId,
          })),
        )
      }
      if (game.race) {
        const perLap = game.race.checkpointsPerLap
        const myIdx = game.race.progress[game.localPlayerId] ?? 0
        st.setRaceInfo({
          phase: game.race.phase,
          countdown: Math.max(0, Math.ceil(game.race.countdown)),
          lap: Math.min(game.race.laps, Math.floor(myIdx / perLap) + 1),
          totalLaps: game.race.laps,
          checkpointInLap: (myIdx % perLap) + 1,
          checkpointsPerLap: perLap,
          results: game.race.results.map((r) => ({ name: r.name, place: r.place })),
        })
      } else if (st.raceInfo) {
        st.setRaceInfo(null)
      }
    }
  })
  return null
}
