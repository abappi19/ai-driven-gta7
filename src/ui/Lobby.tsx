import { useEffect, useState } from 'react'
import { useGame } from '../store/useGame'
import * as net from '../net/client'

interface HostInfo {
  addresses: string[]
  port: number
}

// Shown while phase === 'lobby': waiting room after connecting, before the
// shared world exists. Host sees the roster + a Start button; a joiner just
// waits for the host to start.
export default function Lobby() {
  const netRole = useGame((s) => s.netRole)
  const netStatus = useGame((s) => s.netStatus)
  const netError = useGame((s) => s.netError)
  const players = useGame((s) => s.lobbyPlayers)
  const [hostInfo, setHostInfo] = useState<HostInfo | null>(null)

  useEffect(() => {
    if (netRole !== 'host') return
    fetch('/api/host-info')
      .then((r) => r.json())
      .then(setHostInfo)
      .catch(() => setHostInfo(null))
  }, [netRole])

  return (
    <div className="overlay">
      <h1>LOBBY</h1>
      <div className="sub">
        {netRole === 'host' ? 'Waiting for friends to join' : 'Waiting for the host to start'}
      </div>

      {netRole === 'host' && hostInfo && (
        <div className="settings-hint">
          Share an address:{' '}
          {hostInfo.addresses.map((a) => (
            <code key={a} style={{ marginRight: 8 }}>
              http://{a}:{hostInfo.port}/
            </code>
          ))}
        </div>
      )}

      <div className="settings-card">
        <h2>Players ({players.length})</h2>
        {players.map((p) => (
          <div key={p.id} className="setting-row">
            <span className="setting-name">{p.name}</span>
          </div>
        ))}
      </div>

      {netError && <p className={netStatus === 'error' ? 'net-error' : 'net-status'}>{netError}</p>}

      {netRole === 'host' && <button onClick={() => net.hostStartGame()}>START GAME</button>}
      <button className="link-btn" onClick={() => net.disconnect()}>
        Leave
      </button>
    </div>
  )
}
