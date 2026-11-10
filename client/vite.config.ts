// Build tool settings.
// The "proxy" forwards every /api request to the backend.
// Set VITE_API_PORT to use a different backend port.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const apiPort = process.env.VITE_API_PORT || "3001";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": { target: `http://localhost:${apiPort}` },
    },
  },
});
