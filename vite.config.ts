import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    allowedHosts: [".ts.net"],
    watch: {
      // Packaging compiles temporary files inside release/. A sync provider can
      // lock those files briefly, which previously made Vite's watcher throw
      // EBUSY and take the entire development service down.
      ignored: ["**/release/**", "**/runtime/**", "**/.runtime-cache/**", "**/logs/**", "**/data/**"],
    },
    proxy: {
      "/api": "http://127.0.0.1:5174",
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
});
