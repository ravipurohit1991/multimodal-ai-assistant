import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  optimizeDeps: {
    exclude: ["@ricky0123/vad-web"]
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {}
  }
});
