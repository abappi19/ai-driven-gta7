import http from 'node:http'
import os from 'node:os'
import { WebSocketServer } from 'ws'

const args = process.argv.slice(2)
const relayOnly = args.includes('--relay-only')
const portFlagIdx = args.indexOf('--port')
const PORT = portFlagIdx !== -1 ? Number(args[portFlagIdx + 1]) : 8080

function lanAddresses() {
  const out = []
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address)
    }
  }
  return out
}

let serveStatic = null
if (!relayOnly) {
  const { default: sirv } = await import('sirv')
  serveStatic = sirv(new URL('../dist', import.meta.url).pathname, { single: true })
}

const httpServer = http.createServer((req, res) => {
  if (req.url === '/api/host-info') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ addresses: lanAddresses(), port: PORT }))
    return
  }
  if (serveStatic) {
    serveStatic(req, res)
    return
  }
  res.writeHead(404)
  res.end('relay-only mode: no static files served')
})

const wss = new WebSocketServer({ server: httpServer })

let hostSocket = null
const clientSockets = new Set()

wss.on('connection', (ws) => {
  const isHost = !hostSocket
  if (isHost) {
    hostSocket = ws
    console.log('[relay] host connected')
  } else {
    clientSockets.add(ws)
    console.log(`[relay] client connected (${clientSockets.size} client(s))`)
  }

  ws.on('message', (data) => {
    // Forward as text: `data` arrives as a Buffer regardless of the sender's
    // frame type, and re-sending a Buffer as-is goes out as a BINARY frame —
    // which makes a receiving WebSocket's `onmessage` deliver a Blob instead
    // of the JSON string our protocol expects. All our traffic is JSON text.
    const text = data.toString()
    if (isHost) {
      for (const c of clientSockets) if (c.readyState === c.OPEN) c.send(text)
    } else if (hostSocket && hostSocket.readyState === hostSocket.OPEN) {
      hostSocket.send(text)
    }
  })

  ws.on('close', () => {
    if (isHost) {
      hostSocket = null
      console.log('[relay] host disconnected — closing all client sockets')
      for (const c of clientSockets) c.close(4001, 'host left')
      clientSockets.clear()
    } else {
      clientSockets.delete(ws)
      console.log(`[relay] client disconnected (${clientSockets.size} client(s))`)
    }
  })
})

httpServer.listen(PORT, () => {
  const mode = relayOnly ? 'relay-only' : 'host'
  console.log(`[relay] listening in ${mode} mode on port ${PORT}`)
  if (!relayOnly) {
    for (const addr of lanAddresses()) console.log(`[relay] share this address: http://${addr}:${PORT}/`)
  }
})
