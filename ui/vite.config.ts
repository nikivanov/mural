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
        server.middlewares.use('/worker/worker.js', (_req, res, next) => {
          const workerPath = path.resolve(__dirname, '../worker/dist_packed/main.js')
          if (fs.existsSync(workerPath)) {
            res.setHeader('Content-Type', 'application/javascript')
            res.end(fs.readFileSync(workerPath))
          } else {
            next()
          }
        })
      },
    },
  ],
  build: {
    outDir: '../data/www',
    emptyOutDir: false,
  },
  base: './',
})
