import City from './City'
import Lights from './Lights'
import { Cars, Police } from './Vehicles'
import Pedestrians from './Pedestrians'
import Pickups from './Pickups'
import Player from './Player'
import RemotePlayers from './RemotePlayers'
import MissionMarker from './MissionMarker'
import RaceCheckpoints from './RaceCheckpoints'
import Effects from './Effects'
import CameraRig from './CameraRig'
import Systems from './Systems'

// Everything that exists only while a run is active. Mounted when phase ===
// 'playing' and unmounted otherwise, so each run starts from a fresh city.
export default function World() {
  return (
    <>
      <Lights />
      <City />
      <Cars />
      <Police />
      <Pedestrians />
      <Pickups />
      <Player />
      <RemotePlayers />
      <MissionMarker />
      <RaceCheckpoints />
      <Effects />
      <CameraRig />
      <Systems />
    </>
  )
}
