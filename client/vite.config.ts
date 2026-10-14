// Build tool settings.
// The "proxy" forwards every /api request to the backend on port 3000.
// This way the browser thinks the app and the API are on the same address,
// so the login cookie works without any cross-site problems.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true, // fail loudly if 5173 is busy (the server only trusts this address)
    proxy: {
      "/api": { target: "http://localhost:3000" },
    },
  },
});
