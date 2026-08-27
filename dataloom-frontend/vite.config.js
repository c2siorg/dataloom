import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3200,
    // Refuse to start on a fallback port when 3200 is taken, rather than
    // silently moving to an origin the backend's CORS allowlist rejects.
    strictPort: true,
  },
});
