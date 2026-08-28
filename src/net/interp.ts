// Client-side smoothing for networked arrays (players/cars/peds/police/pickups).
//
// Simplified from a full render-delay ring buffer: each entity's live
// transform exponentially converges toward the latest received snapshot value
// every render frame, rather than lerping between two buffered historical
// snapshots. Cheaper to get right, still eliminates the steppy ~80ms jumps
// snapshots would otherwise produce; the trade-off is a small amount of
// smoothing lag rather than time-accurate interpolation.
import { TWO_PI } from '../game/constants'

interface Transform {
  x: number
  z: number
  a: number
  y?: number
}

const targets = new WeakMap<object, Transform>()

export function setTarget(entity: object, t: Transform) {
  targets.set(entity, t)
}

const SMOOTH = 0.3 // per-frame convergence factor toward the latest target

export function smoothTowards(entity: Transform) {
  const t = targets.get(entity)
  if (!t) return
  entity.x += (t.x - entity.x) * SMOOTH
  entity.z += (t.z - entity.z) * SMOOTH
  if (entity.y !== undefined && t.y !== undefined) entity.y += (t.y - entity.y) * SMOOTH
  const diff = ((((t.a - entity.a + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI
  entity.a += diff * SMOOTH
}

// Reconciles a live mutable array against an incoming full snapshot array:
// removes ids no longer present, adds new ones via `makeNew`, and applies
// `copyFields` to every entity (new and existing alike) — `copyFields` is
// responsible for both non-geometry fields AND registering a smoothing
// target (via setTarget) for anything that should move smoothly; static
// entities like pickups can just snap x/z directly instead. Returns true if
// membership changed (caller should bump the matching version counter so
// list-rendering components remount).
export function reconcileArray<T extends { id: Id }, Id extends string | number>(
  live: T[],
  incoming: T[],
  makeNew: (item: T) => T,
  copyFields: (dst: T, src: T) => void,
): boolean {
  const incomingIds = new Set(incoming.map((i) => i.id))
  let changed = false
  for (let i = live.length - 1; i >= 0; i--) {
    if (!incomingIds.has(live[i].id)) {
      live.splice(i, 1)
      changed = true
    }
  }
  const liveById = new Map(live.map((i) => [i.id, i]))
  for (const item of incoming) {
    const existing = liveById.get(item.id)
    if (existing) {
      copyFields(existing, item)
    } else {
      const created = makeNew(item)
      live.push(created)
      copyFields(created, item)
      changed = true
    }
  }
  return changed
}
