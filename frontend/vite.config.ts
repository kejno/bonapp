import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
<<<<<<< HEAD
  server: {
    proxy: {
      '/public': 'http://localhost:3000',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
=======
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
>>>>>>> origin/main
  },
})
