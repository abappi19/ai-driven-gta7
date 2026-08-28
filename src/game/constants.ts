// Tuning + world constants (ported from the vanilla build, kept identical where tuned).
export const TWO_PI = Math.PI * 2
export const WORLD = { w: 4000, h: 4000 }
export const BLOCK = 500
export const ROAD = 120
export const GRAVITY = 0.15
export const JUMP_SPEED = 4.5

export const CAR_COLORS = [
  '#e74c3c',
  '#3498db',
  '#f1c40f',
  '#2ecc71',
  '#9b59b6',
  '#e67e22',
  '#ecf0f1',
  '#1abc9c',
  '#ff6b9d',
  '#566270',
  '#2c3e50',
  '#d35400',
]

export const rand = (a: number, b: number) => a + Math.random() * (b - a)
export const randi = (a: number, b: number) => Math.floor(rand(a, b))
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
export const dist2 = (ax: number, az: number, bx: number, bz: number) =>
  Math.hypot(ax - bx, az - bz)
export const isRoad = (x: number, z: number) => {
  const mx = ((x % BLOCK) + BLOCK) % BLOCK
  const mz = ((z % BLOCK) + BLOCK) % BLOCK
  return mx < ROAD || mz < ROAD
}
