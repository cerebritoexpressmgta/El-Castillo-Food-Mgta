import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Toaster } from "sonner"

import "@/index.css"

import { App } from "./App"

const oscuro = matchMedia("(prefers-color-scheme: dark)").matches

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Toaster
      position="top-center"
      richColors
      closeButton
      theme={oscuro ? "dark" : "light"}
    />
  </StrictMode>
)
