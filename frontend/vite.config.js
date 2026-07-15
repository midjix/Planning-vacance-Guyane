import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // En dev, proxifie les appels /api vers le backend Express (en prod c'est nginx qui s'en charge).
  server: {
    proxy: {
      '/api': 'http://localhost:8081',
    },
  },
})
