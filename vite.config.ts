import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Bind to every interface so phones/laptops on the same Wi-Fi can reach the
    // dev server at http://<host-lan-ip>:5173
    host: true,
    port: 5173,
    strictPort: true,
    open: true,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
