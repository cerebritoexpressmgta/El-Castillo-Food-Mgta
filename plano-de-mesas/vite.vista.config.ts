// /plano/vista.js: el plano de solo lectura para mesas.html, como un script
// clásico que deja `window.PlanoVista` (sin React, sin módulos).
import { resolve } from "node:path"
import { defineConfig } from "vite"

const RAIZ = import.meta.dirname

export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve(RAIZ, "../plano"),
    emptyOutDir: false,
    lib: {
      entry: resolve(RAIZ, "src/castillo/vista.ts"),
      name: "PlanoVista",
      formats: ["iife"],
      fileName: () => "vista.js",
    },
  },
})
