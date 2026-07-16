import { useState } from 'react'
import { useGame } from '../store/useGame'
import { startRun } from '../game/systems'
import Settings from './Settings'
import Multiplayer from './Multiplayer'

type Panel = 'none' | 'settings' | 'multiplayer'

// Menu (phase 'menu') and game-over (phase 'wasted') screen.
export default function Overlay() {
  const phase = useGame((s) => s.phase)
  const modelsReady = useGame((s) => s.modelsReady)
  const hud = useGame((s) => s.hud)
  const profile = useGame((s) => s.profile)
  const [panel, setPanel] = useState<Panel>('none')
  const wasted = phase === 'wasted'

  return (
    <>
      <div className="overlay">
        <h1>{wasted ? 'WASTED' : 'GTA 7'}</h1>
        <div className="sub">
          {wasted
            ? `Banked $${hud.money.toLocaleString()} · ${hud.deliveries} deliveries · ${hud.kills} KOs`
            : 'Liberty Streets · React + R3F'}
        </div>

        {panel === 'settings' && <Settings />}
        {panel === 'multiplayer' && <Multiplayer />}
        {panel === 'none' && (
          <>
            <button disabled={!modelsReady} onClick={() => startRun()}>
              {modelsReady ? (wasted ? 'RESPAWN' : 'ENTER THE CITY') : 'LOADING MODELS…'}
            </button>
            <div className="profile">
              Best&nbsp;${profile.bestMoney.toLocaleString()} · {profile.totalDeliveries} deliveries
              · {profile.totalKills} KOs · {profile.runs} runs
            </div>
            {!wasted && (
              <div className="keys">
                <b>Move mouse</b> to look · <b>Click</b> shoot · <b>RMB/G</b> reload · <b>1-7</b>{' '}
                weapons · <b>WASD</b> move &amp; drive · <b>E</b> enter / exit
                <br />
                <b>Q</b> Focus slow-mo · <b>Shift</b> boost · <b>Space</b> handbrake · <b>C</b>{' '}
                camera · <b>F</b> punch / honk · <b>R</b> respawn
                <br />
                Cars &amp; motorcycles to steal · collect cash · complete missions · evade the cops.
              </div>
            )}
          </>
        )}

        <div className="link-row">
          {panel === 'none' ? (
            <>
              {!wasted && (
                <button className="link-btn" onClick={() => setPanel('multiplayer')}>
                  🌐 Multiplayer
                </button>
              )}
              <button className="link-btn" onClick={() => setPanel('settings')}>
                ⚙ Settings
              </button>
            </>
          ) : (
            <button className="link-btn" onClick={() => setPanel('none')}>
              ← Back
            </button>
          )}
        </div>
      </div>
      <div className="byline">
        an AI-driven Bappi build · React + react-three-fiber · made with Kitten Bot
      </div>
    </>
  )
}
