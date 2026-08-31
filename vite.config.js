import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Set `base` to '/your-repo-name/' if deploying to
// https://<user>.github.io/<repo-name>/. Use '/' if this repo IS
// <user>.github.io, or if you're using a custom domain.
export default defineConfig({
  plugins: [react()],
  base: '/inkline/',
})
