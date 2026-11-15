// Compila lo que usa El Castillo a la carpeta /plano de la raíz del repo:
//   /plano/index.html  — el editor (página propia, con React)
//   /plano/vista.js    — la vista para mesas.html (sin React; ver vite.vista.config.ts)
// Se corre con `npm run build:castillo`. Lo que sale se sube al repo tal cual:
// el sitio no tiene paso de build.
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const RAIZ = import.meta.dirname

export default defineConfig({
  root: resolve(RAIZ, "castillo"),
  base: "./",
  publicDir: false,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": resolve(RAIZ, "./src") } },
  build: {
    outDir: resolve(RAIZ, "../plano"),
    emptyOutDir: true,
  },
})
