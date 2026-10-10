import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// API server the dev proxy forwards to (the browser tests run their own on another port).
const api = `http://localhost:${process.env.API_PORT || 5000}`

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
