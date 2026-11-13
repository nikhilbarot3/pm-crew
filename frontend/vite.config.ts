import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api/ml': {
        target: 'http://localhost:8001',
        rewrite: (path) => path.replace(/^\/api\/ml/, ''),
      },
      '/api/agents': {
        target: 'http://localhost:8002',
        rewrite: (path) => path.replace(/^\/api\/agents/, ''),
      },
      '/api/rag': {
        target: 'http://localhost:8003',
        rewrite: (path) => path.replace(/^\/api\/rag/, ''),
      },
    },
  },
})
