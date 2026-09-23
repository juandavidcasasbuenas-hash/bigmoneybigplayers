import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const api = `http://localhost:${process.env.PORT || 3001}`;
export default defineConfig({
  plugins: [react()],
  server: { fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/[Oo][Pp][Ee][Nn][Aa][Ii].[Tt][Xx][Tt]', '**/voice-cache/**'] }, port: 5173, proxy: { '/socket.io': { target: api, ws: true }, '/api': api } },
  build: { chunkSizeWarningLimit: 1600 }
});
