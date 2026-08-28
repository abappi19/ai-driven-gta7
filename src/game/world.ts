import { WORLD, BLOCK, ROAD, rand, randi } from './constants'
import { game } from './state'
import type { BuildingMesh, TreeData, ParkData, CityData, RaceTrack } from './types'

const FACADES = 6

// Reserved no-buildings zone (in blocks) for the dedicated racetrack — kept
// well clear of the rest of the procedural city. A full rounded-rectangle
// circuit (4 straights + 4 turns) needs a lot more room than the old 2-turn
// oval, hence the much bigger footprint.
const TRACK_ZONE_COLS = 6
const TRACK_ZONE_ROWS = 5
const TRACK_ZONE_W = TRACK_ZONE_COLS * BLOCK
const TRACK_ZONE_H = TRACK_ZONE_ROWS * BLOCK

function generateRaceTrack(): RaceTrack {
  const cx = TRACK_ZONE_W / 2
  const cz = TRACK_ZONE_H / 2
  const margin = 150
  const cornerRadius = Math.max(150, Math.min(TRACK_ZONE_W, TRACK_ZONE_H) / 2 - margin - 400)
  const halfHeight = Math.max(200, TRACK_ZONE_H / 2 - margin - cornerRadius)
  const halfWidth = Math.max(200, TRACK_ZONE_W / 2 - margin - cornerRadius)
  const width = 74
  return {
    cx,
    cz,
    halfWidth,
    halfHeight,
    cornerRadius,
    width,
    perimeter: trackPerimeter(halfWidth, halfHeight, cornerRadius),
  }
}

export function trackPerimeter(halfWidth: number, halfHeight: number, cornerRadius: number) {
  return 4 * halfWidth + 4 * halfHeight + 2 * Math.PI * cornerRadius
}

// Position only, at a distance along the rounded-rectangle centerline — a
// proper 4-straight, 4-turn circuit (longer and more track-like than a
// simple 2-turn oval), walked clockwise from the top-left corner.
function trackPos(track: RaceTrack, dist: number) {
  const { cx, cz, halfWidth: A, halfHeight: B, cornerRadius: R } = track
  const top = 2 * A
  const right = 2 * B
  const bottom = 2 * A
  const left = 2 * B
  const turn = (Math.PI / 2) * R
  const total = top + right + bottom + left + 4 * turn
  let d = ((dist % total) + total) % total

  if (d < top) return { x: cx - A + d, z: cz - B - R }
  d -= top
  if (d < turn) {
    const ang = -Math.PI / 2 + d / R
    return { x: cx + A + R * Math.cos(ang), z: cz - B + R * Math.sin(ang) }
  }
  d -= turn
  if (d < right) return { x: cx + A + R, z: cz - B + d }
  d -= right
  if (d < turn) {
    const ang = d / R
    return { x: cx + A + R * Math.cos(ang), z: cz + B + R * Math.sin(ang) }
  }
  d -= turn
  if (d < bottom) return { x: cx + A - d, z: cz + B + R }
  d -= bottom
  if (d < turn) {
    const ang = Math.PI / 2 + d / R
    return { x: cx - A + R * Math.cos(ang), z: cz + B + R * Math.sin(ang) }
  }
  d -= turn
  if (d < left) return { x: cx - A - R, z: cz + B - d }
  d -= left
  const ang = Math.PI + d / R
  return { x: cx - A + R * Math.cos(ang), z: cz - B + R * Math.sin(ang) }
}

// Position + heading (matching the game's `a` convention: forward =
// (sin(a), cos(a))) at a distance along the track. Used identically by the
// race-checkpoint placement (systems.ts) and the track's own rendering
// (RaceTrack.tsx), so the visuals and the actual course always agree exactly.
export function stadiumPointAt(track: RaceTrack, dist: number) {
  const p0 = trackPos(track, dist)
  const p1 = trackPos(track, dist + 0.5)
  const angle = Math.atan2(p1.x - p0.x, p1.z - p0.z)
  return { x: p0.x, z: p0.z, angle }
}

// Procedurally lay out the city once. Returns render data; also fills
// game.buildings with AABB collision boxes (trees are non-colliding).
export function generateCity(): CityData {
  const buildings: BuildingMesh[] = []
  const trees: TreeData[] = []
  const parks: ParkData[] = []
  game.buildings.length = 0

  const cols = Math.floor(WORLD.w / BLOCK)
  const rows = Math.floor(WORLD.h / BLOCK)

  const place = (x: number, z: number, w: number, d: number) => {
    const h = rand(70, 300)
    buildings.push({
      x: x + w / 2,
      z: z + d / 2,
      w,
      d,
      h,
      facade: randi(0, FACADES),
      repeatX: Math.max(1, Math.round(w / 42)),
      repeatY: Math.max(1, Math.round(h / 46)),
    })
    game.buildings.push({ x: x + w / 2, z: z + d / 2, w, d })
  }

  for (let cx = 0; cx < cols; cx++) {
    for (let cy = 0; cy < rows; cy++) {
      const bx = cx * BLOCK + ROAD
      const bz = cy * BLOCK + ROAD
      const iw = BLOCK - ROAD
      const ih = BLOCK - ROAD
      // Leave the racetrack's reserved zone empty — no buildings/parks there.
      if (bx < TRACK_ZONE_W && bz < TRACK_ZONE_H) continue
      if (Math.random() < 0.12) {
        parks.push({ x: bx, z: bz, w: iw, h: ih })
        for (let t = 0; t < 5; t++)
          trees.push({
            x: bx + rand(30, iw - 30),
            z: bz + rand(30, ih - 30),
            scale: rand(0.85, 1.3),
          })
        continue
      }
      const sub = randi(1, 3)
      const pad = 18
      if (sub === 1) {
        place(bx + pad, bz + pad, iw - pad * 2, ih - pad * 2)
      } else {
        const hw = iw / 2,
          hh = ih / 2
        for (let i = 0; i < 2; i++)
          for (let j = 0; j < 2; j++) {
            if (Math.random() < 0.18) continue
            place(bx + i * hw + pad, bz + j * hh + pad, hw - pad * 2, hh - pad * 2)
          }
      }
    }
  }
  return { buildings, trees, parks, cols, rows, raceTrack: generateRaceTrack() }
}

// pick a point on a road centerline
export function findRoadPoint() {
  for (let i = 0; i < 200; i++) {
    const cx = randi(0, Math.floor(WORLD.w / BLOCK))
    const cy = randi(0, Math.floor(WORLD.h / BLOCK))
    const horiz = Math.random() < 0.5
    let x, z
    if (horiz) {
      x = cx * BLOCK + rand(ROAD, BLOCK)
      z = cy * BLOCK + ROAD * 0.5
    } else {
      x = cx * BLOCK + ROAD * 0.5
      z = cy * BLOCK + rand(ROAD, BLOCK)
    }
    return { x: clampW(x), z: clampW(z), horiz }
  }
  return { x: BLOCK * 4, z: BLOCK * 4, horiz: true }
}
const clampW = (v: number) => Math.max(60, Math.min(WORLD.w - 60, v))
