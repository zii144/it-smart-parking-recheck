import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Admin build: only admin.html is a Rollup entry. This build stays
// internal-only (the existing frontend container) — it's fine for it to
// also contain InspectorApp's shared utility code if module boundaries pull
// it in; the security requirement is one-directional (public must exclude
// admin/design), not symmetric.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/admin',
    rollupOptions: {
      input: 'admin.html',
    },
  },
})
