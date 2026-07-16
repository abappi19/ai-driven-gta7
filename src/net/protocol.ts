// Wire protocol between browser tabs, relayed byte-for-byte by server/relay.mjs
// (which never parses these shapes — it only knows "first socket = host").
//
// The relay can only broadcast host->all or forward client->host, with no
// per-client addressing. `join`/`welcome` correlate via a client-generated
// `nonce` so a client can ignore welcomes meant for someone else who joined
// around the same time.
import type {
  Player,
  Car,
  Ped,
  Pickup,
  Mission,
  RaceState,
  CityData,
  Building,
  InputState,
  GameEvent,
} from '../game/types'

export type NetPlayer = Pick<
  Player,
  'id' | 'name' | 'x' | 'y' | 'z' | 'a' | 'hp' | 'inCarId' | 'punchT' | 'money'
>

export type NetMessage =
  | { t: 'join'; nonce: string; name: string }
  | { t: 'welcome'; forNonce: string; id: string }
  | { t: 'roster'; players: { id: string; name: string }[] }
  | { t: 'start'; cityData: CityData; buildings: Building[] }
  | { t: 'input'; id: string; input: InputState }
  | {
      t: 'snapshot'
      tick: number
      players: NetPlayer[]
      cars: Car[]
      peds: Ped[]
      police: Car[]
      pickups: Pickup[]
      wanted: number
      mission: Mission | null
      race: RaceState | null
      deliveries: number
      kills: number
      events: GameEvent[]
    }
  | { t: 'leave'; id: string }
