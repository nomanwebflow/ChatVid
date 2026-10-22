import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // editor (5173) -> render worker (4000)
      "/api": "http://localhost:4000",
    },
  },
})
