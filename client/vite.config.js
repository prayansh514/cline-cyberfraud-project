import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'

// The Manifest V3 file is plain JSON; crxjs reads it and bundles every file it references.
const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), crx({ manifest })],
  server: {
    // Extension pages are served from chrome-extension://, so Vite cannot infer the dev server port
    // for the HMR WebSocket (it falls back to ws://localhost/ with no port). Pin it explicitly.
    port: 5173,
    strictPort: true,
    hmr: { host: 'localhost', port: 5173, clientPort: 5173 },
  },
})
