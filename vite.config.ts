import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { localPlannerPlugin } from './vite-plugin-local-planner.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localPlannerPlugin()],
})
