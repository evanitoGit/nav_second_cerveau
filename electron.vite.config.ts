import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const sharedAlias = { '@shared': resolve(__dirname, 'src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias },
    build: {
      // Les dépendances (sqlite-vec, sharp, onnxruntime…) restent dans node_modules, sauf
      // Readability dont le source est injecté tel quel dans les pages (import `?raw`).
      externalizeDeps: { exclude: ['@mozilla/readability'] }
    }
  },
  preload: {
    resolve: { alias: sharedAlias },
    build: {
      externalizeDeps: true,
      rollupOptions: {
        // Preload exécuté en sandbox => CommonJS obligatoire.
        output: { format: 'cjs' }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        ...sharedAlias,
        '@renderer': resolve(__dirname, 'src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html')
      }
    }
  }
})
