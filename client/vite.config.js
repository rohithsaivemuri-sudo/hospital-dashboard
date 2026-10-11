import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// API server the dev proxy forwards to (the browser tests run their own on another port).
const api = `http://localhost:${process.env.API_PORT || 5000}`

// This build's id: compiled into the app (__BUILD_ID__) and written to dist/version.json, which
// open tabs poll to notice a newer deployment (src/utils/buildVersion.js).
const BUILD_ID = process.env.BUILD_ID || `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`
const versionFile = {
  name: 'version-file',
  apply: 'build',
  generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) }) },
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), versionFile],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: api,
        changeOrigin: true,
      },
      '/socket.io': {
        target: api,
        ws: true,
      }
    }
  }
})
