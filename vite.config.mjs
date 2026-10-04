import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
const { version } = createRequire(import.meta.url)("./package.json");
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: `dist/${version}`,
    emptyOutDir: false,
    manifest: true,
    rolldownOptions: {
      input: { main: "index.html", thumbnail: "thumbnail.html" },
    },
  },
});
