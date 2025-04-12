import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      // Proxy API requests to the backend server running on port 8000
      '/api/v1': {
        target: 'http://localhost:8000',
        changeOrigin: true, // Needed for virtual hosted sites, good practice
        secure: false,      // Optional: If backend is not HTTPS
      },
      // Note: If WebSocket connection needs proxying (it might not if using ws:// directly),
      // you would add a similar entry for '/ws/v1' with ws: true
      // '/ws/v1': {
      //   target: 'ws://localhost:8000',
      //   ws: true,
      // }
    }
  }
})
