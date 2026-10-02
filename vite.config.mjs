import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    rolldownOptions: {
      input: { main: "index.html", thumbnail: "thumbnail.html" },
    },
  },
});
