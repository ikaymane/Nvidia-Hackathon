import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // During development, send /api calls to the Python server.
    proxy: { "/api": "http://localhost:8000" },
  },
});
