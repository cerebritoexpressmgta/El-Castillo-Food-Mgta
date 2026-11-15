/// <reference types="vitest/config" />
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "./src") },
  },
  server: { port: 3001 },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.mjs"],
  },
})
