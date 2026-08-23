import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'serve-worker',
      configureServer(server) {
        const workerStaticFiles: Record<string, { file: string; contentType: string }> = {
          '/worker/worker.js': { file: 'main.js', contentType: 'application/javascript' },
          '/worker/oneline.js': { file: 'oneline.js', contentType: 'application/javascript' },
          '/worker/oneline.wasm': { file: 'oneline.wasm', contentType: 'application/wasm' },
        }
        for (const [route, { file, contentType }] of Object.entries(workerStaticFiles)) {
          server.middlewares.use(route, (_req, res, next) => {
            const filePath = path.resolve(__dirname, '../worker/dist_packed', file)
            if (fs.existsSync(filePath)) {
              res.setHeader('Content-Type', contentType)
              res.end(fs.readFileSync(filePath))
            } else {
              next()
            }
          })
        }
      },
    },
  ],
  build: {
    outDir: '../data/www',
    emptyOutDir: false,
  },
  base: './',
})
