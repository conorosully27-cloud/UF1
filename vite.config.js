import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5180 },
  build: {
    rollupOptions: {
      // React in a file of its own: it changes rarely, so browsers keep it
      // cached across releases, and neither file passes Vite's 500 kB warning.
      output: { manualChunks: { react: ['react', 'react-dom'] } },
    },
  },
})
