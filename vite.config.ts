import path from "path";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react(),
    svgr()
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: {
    proxy: {
      // Proxy API requests to the backend server running on port 8000
      '/api/v1': {
        target: 'http://localhost:8000',
        changeOrigin: true, // Needed for virtual hosted sites, good practice
        secure: false      // Optional: If backend is not HTTPS
      },
      // Proxy Socket.IO requests
      '/socket.io': {
        target: 'http://localhost:8000',
        ws: true,
        changeOrigin: true,
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/setup.ts',
        '**/*.d.ts',
      ]
    },
    // Test dependencies
    deps: {
      optimizer: {
        web: {
          include: ['socket.io-client']
        }
      }
    }
  }
});
