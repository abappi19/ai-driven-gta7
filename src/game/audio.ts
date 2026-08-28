// Tiny WebAudio synth. Created lazily after a user gesture (start click).
let actx: AudioContext | null = null
export function initAudio() {
  if (!actx) {
    try {
      const w = window as typeof window & { webkitAudioContext?: typeof AudioContext }
      const Ctx = w.AudioContext || w.webkitAudioContext
      if (Ctx) actx = new Ctx()
    } catch {
      /* no audio */
    }
  }
  return actx
}
export function beep(freq: number, dur = 0.08, type: OscillatorType = 'square', vol = 0.04) {
  const a = actx
  if (!a) return
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.value = vol
  o.connect(g)
  g.connect(a.destination)
  o.start()
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur)
  o.stop(a.currentTime + dur)
}
// "Dishcao" gunshot: a sharp noise-burst attack ("dish") immediately
// followed by a fast descending pitched punch ("cao") — punchier and more
// distinctive than a plain tone.
export const gunshot = () => {
  const a = actx
  if (!a) return
  const t = a.currentTime

  // "dish" — brief high-passed noise transient.
  const bufferSize = Math.floor(a.sampleRate * 0.03)
  const buffer = a.createBuffer(1, bufferSize, a.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
  const noise = a.createBufferSource()
  noise.buffer = buffer
  const noiseFilter = a.createBiquadFilter()
  noiseFilter.type = 'highpass'
  noiseFilter.frequency.value = 3000
  const noiseGain = a.createGain()
  noiseGain.gain.value = 0.14
  noise.connect(noiseFilter)
  noiseFilter.connect(noiseGain)
  noiseGain.connect(a.destination)
  noise.start(t)

  // "cao" — a fast descending pitched punch right on its heels.
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(900, t)
  o.frequency.exponentialRampToValueAtTime(80, t + 0.11)
  g.gain.setValueAtTime(0.09, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13)
  o.connect(g)
  g.connect(a.destination)
  o.start(t)
  o.stop(t + 0.14)
}
export const sfxEnter = () => {
  beep(220, 0.08, 'sine')
  beep(440, 0.06, 'sine')
}
export const sfxPickup = () => {
  beep(660, 0.05, 'sine')
  beep(990, 0.05, 'sine')
}
export const sfxDelivery = () => {
  beep(523, 0.08)
  beep(659, 0.08)
  beep(784, 0.12)
}
export const sfxSiren = () => {
  beep(880, 0.1, 'sine')
  beep(660, 0.1, 'sine')
}
