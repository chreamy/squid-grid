import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
export default defineConfig(({ command }) => ({
  publicDir: command === "serve" ? "public" : false,
  plugins: [
    react(),
    {
      name: "ship-shared-art-assets",
      apply: "build",
      closeBundle() {
        // NFT metadata uses the public, pinned repository URI. The app reuses one
        // shared sprite; ship only the standalone artwork linked in the gallery.
        for (const name of [
          "art",
          "contracts",
          "deployment.json",
          "favicon.svg",
        ]) {
          fs.cpSync(path.resolve("public", name), path.resolve("dist", name), {
            recursive: true,
          });
        }
        fs.mkdirSync("dist/nft", { recursive: true });
        fs.copyFileSync("public/nft/456.svg", "dist/nft/456.svg");
      },
    },
  ],
  server: { port: 5173, strictPort: true },
  build: { target: "es2022" },
}));
