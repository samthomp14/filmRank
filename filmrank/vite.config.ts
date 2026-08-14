import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { localVercelApi } from './vite-plugin-local-api'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load all env keys (not just VITE_*) so api/omdb.mjs can read OMDB_API_KEY etc.
  const env = loadEnv(mode, process.cwd(), '')
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }

  return {
    plugins: [react(), localVercelApi()],
    server: {
      port: 5173,
      strictPort: true,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    }
  }
})
