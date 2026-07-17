import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const proxyTarget = 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/chat': proxyTarget,
      '/messages': proxyTarget,
      '/responses': proxyTarget,
      '/health': proxyTarget,
      '/baselines': proxyTarget,
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
