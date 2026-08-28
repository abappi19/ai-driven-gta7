import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from https://nullspawn.github.io/gta7-web/ on Pages. Use the same
// base everywhere so `dev`, `preview`, and the deployed build all agree on
// asset paths (a conditional base broke `vite preview` locally).
export default defineConfig({
  base: '/gta7-web/',
  plugins: [react()],
  server: {
    // Proxies dev-mode WS traffic to the relay-only dev server (`npm run relay:dev`)
    // so the browser sees the socket as same-origin during Phases 0-2.
    proxy: {
      '/ws': { target: 'ws://localhost:8081', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // Split the heavy, rarely-changing 3D libs into their own chunks so
        // app-code edits don't bust their browser cache. (Rolldown wants a fn.)
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          if (id.includes('/three/') || id.includes('/three-stdlib/')) return 'three'
          if (id.includes('@react-three')) return 'r3f'
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/'))
            return 'react'
          return 'vendor'
        },
      },
    },
  },
})
