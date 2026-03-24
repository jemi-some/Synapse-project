import { defineConfig } from 'vite'

export default defineConfig({
  // index.html이 루트에 있으므로 별도 root 설정 불필요
  build: {
    outDir: 'dist',
  },
})
