import { useState } from 'react'
import { useGame } from '../store/useGame'
import * as net from '../net/client'

// Host/Join forms shown from the main menu (phase 'menu'). Picking "Host"
// connects to this same origin's relay (must be opened via `npm run host`);
// "Join" either connects directly (already on the host's page) or does a
// full page navigation to the given address (avoids the https->ws
// mixed-content trap and any cross-origin socket complications).
export default function Multiplayer() {
  const netPrefs = useGame((s) => s.netPrefs)
  const setNetPrefs = useGame((s) => s.setNetPrefs)
  const netStatus = useGame((s) => s.netStatus)
  const netError = useGame((s) => s.netError)
  const [busy, setBusy] = useState<'host' | 'join' | null>(null)

  const name = netPrefs.playerName || 'Player'

  const onHost = async () => {
    setBusy('host')
    try {
      await net.hostGame(name)
    } catch {
      /* netStatus/netError already set by net/client.ts */
    }
    setBusy(null)
  }

  const onJoin = async () => {
    const addr = netPrefs.lastJoinedAddr.trim()
    setBusy('join')
    if (addr && addr !== location.host) {
      const url = addr.includes('://') ? addr : `http://${addr}`
      location.href = `${url.replace(/\/$/, '')}/?join=1&name=${encodeURIComponent(name)}`
      return
    }
    try {
      await net.joinGame(name)
    } catch {
      /* netStatus/netError already set by net/client.ts */
    }
    setBusy(null)
  }

  return (
    <div className="settings-card">
      <h2>LAN Multiplayer</h2>
      <label className="setting-row">
        <span className="setting-name">Your name</span>
        <input
          className="text-input"
          value={netPrefs.playerName}
          maxLength={16}
          placeholder="Player"
          onChange={(e) => setNetPrefs({ playerName: e.target.value })}
        />
      </label>

      <div className="net-actions">
        <button disabled={busy !== null} onClick={onHost}>
          {busy === 'host' ? 'Starting…' : 'Host Game'}
        </button>
        <p className="settings-hint">
          Run <code>npm run host</code> in a terminal first, then open the address it prints in this
          browser before clicking Host.
        </p>
      </div>

      <div className="net-actions">
        <label className="setting-row">
          <span className="setting-name">Host address</span>
          <input
            className="text-input"
            value={netPrefs.lastJoinedAddr}
            placeholder="192.168.1.23:8080"
            onChange={(e) => setNetPrefs({ lastJoinedAddr: e.target.value })}
          />
        </label>
        <button disabled={busy !== null} onClick={onJoin}>
          {busy === 'join' ? 'Joining…' : 'Join Game'}
        </button>
        <p className="settings-hint">
          Leave blank if you already opened the host's address in this tab.
        </p>
      </div>

      {netStatus === 'error' && netError && <p className="net-error">{netError}</p>}
    </div>
  )
}
