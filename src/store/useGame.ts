import { create } from 'zustand'
import type { Settings, Profile, NetPrefs } from '../game/types'
import {
  loadSettings,
  saveSettings,
  loadProfile,
  saveProfile,
  loadNetPrefs,
  saveNetPrefs,
} from '../game/persist'

export type Phase = 'menu' | 'lobby' | 'playing' | 'wasted'
export type NetRole = 'solo' | 'host' | 'client'
export type NetStatus = 'idle' | 'connecting' | 'connected' | 'error'
export interface LobbyPlayer {
  id: string
  name: string
}
export interface RosterPlayer {
  id: string
  name: string
  hp: number
  isLocal: boolean
}
export interface RaceInfo {
  phase: 'countdown' | 'racing' | 'finished'
  countdown: number
  myCheckpoint: number
  totalCheckpoints: number
  results: { name: string; place: number }[]
}

export interface Hud {
  money: number
  wanted: number
  hp: number
  speed: number
  focus: number
  deliveries: number
  kills: number
  inCar: boolean
  weaponName: string
  ammo: number
  mag: number
  reloading: boolean
  missionTimer: number // seconds remaining, 0 = none
}
export interface Toast {
  text: string
  ms: number
  id: number
}
export interface MissionInfo {
  title: string
  desc: string
}

interface Versions {
  cars: number
  peds: number
  police: number
  pickups: number
  remotePlayers: number
}

interface UIStore {
  phase: Phase
  modelsReady: boolean
  hud: Hud
  prompt: string
  toast: Toast | null
  missionInfo: MissionInfo
  focusActive: boolean
  locked: boolean
  versions: Versions
  settings: Settings
  profile: Profile
  netRole: NetRole
  netStatus: NetStatus
  netError: string
  lobbyPlayers: LobbyPlayer[]
  netPrefs: NetPrefs
  roster: RosterPlayer[]
  raceInfo: RaceInfo | null

  setPhase: (phase: Phase) => void
  setModelsReady: (modelsReady: boolean) => void
  setHud: (hud: Hud) => void
  setPrompt: (prompt: string) => void
  setToast: (toast: Toast | null) => void
  setMissionInfo: (missionInfo: MissionInfo) => void
  setFocusActive: (focusActive: boolean) => void
  setLocked: (locked: boolean) => void
  bump: (key: keyof Versions) => void
  setSettings: (patch: Partial<Settings>) => void
  setProfile: (profile: Profile) => void
  setNetRole: (netRole: NetRole) => void
  setNetStatus: (netStatus: NetStatus, netError?: string) => void
  setLobbyPlayers: (players: LobbyPlayer[]) => void
  setNetPrefs: (patch: Partial<NetPrefs>) => void
  setRoster: (roster: RosterPlayer[]) => void
  setRaceInfo: (raceInfo: RaceInfo | null) => void
}

const EMPTY_HUD: Hud = {
  money: 0,
  wanted: 0,
  hp: 100,
  speed: 0,
  focus: 100,
  deliveries: 0,
  kills: 0,
  inCar: false,
  weaponName: 'Pistol',
  ammo: 12,
  mag: 12,
  reloading: false,
  missionTimer: 0,
}

export const useGame = create<UIStore>((set) => ({
  phase: 'menu',
  modelsReady: false,
  hud: EMPTY_HUD,
  prompt: '',
  toast: null,
  missionInfo: { title: 'Objective', desc: 'Loading the city…' },
  focusActive: false,
  locked: false,
  versions: { cars: 0, peds: 0, police: 0, pickups: 0, remotePlayers: 0 },
  settings: loadSettings(),
  profile: loadProfile(),
  netRole: 'solo',
  netStatus: 'idle',
  netError: '',
  lobbyPlayers: [],
  netPrefs: loadNetPrefs(),
  roster: [],
  raceInfo: null,

  setPhase: (phase) => set({ phase }),
  setModelsReady: (modelsReady) => set({ modelsReady }),
  setHud: (hud) => set({ hud }),
  setPrompt: (prompt) => set((s) => (s.prompt === prompt ? s : { prompt })),
  setToast: (toast) => set({ toast }),
  setMissionInfo: (missionInfo) => set({ missionInfo }),
  setFocusActive: (focusActive) =>
    set((s) => (s.focusActive === focusActive ? s : { focusActive })),
  setLocked: (locked) => set((s) => (s.locked === locked ? s : { locked })),
  bump: (key) => set((s) => ({ versions: { ...s.versions, [key]: s.versions[key] + 1 } })),
  setSettings: (patch) =>
    set((s) => {
      const settings = { ...s.settings, ...patch }
      saveSettings(settings)
      return { settings }
    }),
  setProfile: (profile) => {
    saveProfile(profile)
    set({ profile })
  },
  setNetRole: (netRole) => set({ netRole }),
  setNetStatus: (netStatus, netError = '') => set({ netStatus, netError }),
  setLobbyPlayers: (lobbyPlayers) => set({ lobbyPlayers }),
  setNetPrefs: (patch) =>
    set((s) => {
      const netPrefs = { ...s.netPrefs, ...patch }
      saveNetPrefs(netPrefs)
      return { netPrefs }
    }),
  setRoster: (roster) => set({ roster }),
  setRaceInfo: (raceInfo) => set({ raceInfo }),
}))
