import type { Settings, Profile, NetPrefs } from './types'

const SETTINGS_KEY = 'gta7.settings'
const PROFILE_KEY = 'gta7.profile'
const NET_PREFS_KEY = 'gta7.netPrefs'

export const DEFAULT_SETTINGS: Settings = {
  mouseSensitivity: 0.7, // low + smooth by default
  steerSensitivity: 0.8,
  invertY: false,
}
export const DEFAULT_PROFILE: Profile = { bestMoney: 0, totalDeliveries: 0, totalKills: 0, runs: 0 }
export const DEFAULT_NET_PREFS: NetPrefs = { playerName: '', lastJoinedAddr: '' }

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { ...fallback }
    return { ...fallback, ...JSON.parse(raw) }
  } catch {
    return { ...fallback }
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

export const loadSettings = () => load(SETTINGS_KEY, DEFAULT_SETTINGS)
export const saveSettings = (s: Settings) => save(SETTINGS_KEY, s)
export const loadProfile = () => load(PROFILE_KEY, DEFAULT_PROFILE)
export const saveProfile = (p: Profile) => save(PROFILE_KEY, p)
export const loadNetPrefs = () => load(NET_PREFS_KEY, DEFAULT_NET_PREFS)
export const saveNetPrefs = (p: NetPrefs) => save(NET_PREFS_KEY, p)
