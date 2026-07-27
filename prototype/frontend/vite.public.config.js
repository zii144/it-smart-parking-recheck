import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Public build: only public.html (-> main-public.jsx -> InspectorApp) is a
// Rollup entry, so AdminApp/DesignSystemApp and everything under
// src/admin/**, src/design/** are unreachable from this build's module graph
// and never get emitted into dist/public.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/public',
    rollupOptions: {
      input: 'public.html',
    },
  },
})
