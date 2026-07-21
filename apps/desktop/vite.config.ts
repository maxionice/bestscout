import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: "127.0.0.1" },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "react-vendor", test: /node_modules\/(react|react-dom|scheduler)\// },
            { name: "heroui-vendor", test: /node_modules\/(@heroui|@react-aria|@react-stately|react-aria|react-stately|react-aria-components)\// },
            { name: "icons-vendor", test: /node_modules\/lucide-react\// },
          ],
        },
      },
    },
  },
});
