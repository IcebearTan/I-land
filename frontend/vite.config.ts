import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // esbuild 压缩 Phaser 3 会在 Safari/WebKit 运行时崩（texture undefined），
    // 换 terser（更保守）保平安；体积略大可接受
    minify: 'terser',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
