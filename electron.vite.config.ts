import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const sharedAlias = { '@shared': resolve(__dirname, 'src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias },
    build: {
      // Les modules natifs (better-sqlite3, sqlite-vec, onnxruntime) ne doivent jamais être bundlés.
      externalizeDeps: true
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
