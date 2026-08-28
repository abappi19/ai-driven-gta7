import { useMemo } from 'react'
import { game } from '../game/state'
import { stadiumPointAt } from '../game/world'
import type { RaceTrack as RaceTrackData } from '../game/types'

// Scaled up for the longer rounded-rectangle circuit (~2.7x the old oval's
// perimeter) to keep the same segment/arrow density as before.
const SURFACE_SEGMENTS = 240
const ARROW_COUNT = 32

// Chevron pointing along the track's direction of travel at `dist`.
function ArrowMarker({ track, dist }: { track: RaceTrackData; dist: number }) {
  const p = stadiumPointAt(track, dist)
  return (
    <group position={[p.x, 1.2, p.z]} rotation={[0, p.angle, 0]}>
      <mesh position={[-6, 0, 6]} rotation={[0, Math.PI / 5, 0]}>
        <boxGeometry args={[3, 1, 16]} />
        <meshBasicMaterial color={0xffcc00} />
      </mesh>
      <mesh position={[6, 0, 6]} rotation={[0, -Math.PI / 5, 0]}>
        <boxGeometry args={[3, 1, 16]} />
        <meshBasicMaterial color={0xffcc00} />
      </mesh>
    </group>
  )
}

// Checkered start/finish stripe across the track width at distance 0.
function StartFinishLine({ track }: { track: RaceTrackData }) {
  const p = stadiumPointAt(track, 0)
  const cols = 8
  const colW = track.width / cols
  return (
    <group position={[p.x, 1.3, p.z]} rotation={[0, p.angle, 0]}>
      {Array.from({ length: cols }, (_, i) => (
        <mesh key={i} position={[(i - cols / 2 + 0.5) * colW, 0, 0]}>
          <boxGeometry args={[colW, 1, 14]} />
          <meshBasicMaterial color={i % 2 === 0 ? 0xffffff : 0x111111} />
        </mesh>
      ))}
    </group>
  )
}

// Dedicated stadium-oval racetrack: a permanent fixture of the city (like
// its roads/buildings), reserved as an empty zone in generateCity(). Its
// pavement is built from many small tangent-aligned segments sampled via
// stadiumPointAt() — the exact same function that places race checkpoints,
// so the drivable surface and the actual course always line up.
export default function RaceTrack() {
  const track = game.cityData!.raceTrack

  const segs = useMemo(() => {
    const step = track.perimeter / SURFACE_SEGMENTS
    return Array.from({ length: SURFACE_SEGMENTS }, (_, i) => stadiumPointAt(track, i * step))
  }, [track])

  const segLength = (track.perimeter / SURFACE_SEGMENTS) * 1.3

  return (
    <group>
      {segs.map((p, i) => (
        <mesh key={i} position={[p.x, 0.7, p.z]} rotation={[0, p.angle, 0]} receiveShadow>
          <boxGeometry args={[track.width, 1, segLength]} />
          <meshLambertMaterial color={0x1c1c22} />
        </mesh>
      ))}
      <StartFinishLine track={track} />
      {Array.from({ length: ARROW_COUNT }, (_, i) => (
        <ArrowMarker key={i} track={track} dist={(i / ARROW_COUNT) * track.perimeter} />
      ))}
    </group>
  )
}
