import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Toaster } from "sonner"

import "@/index.css"

import { PaginaDelEditor } from "./PaginaDelEditor"

// Las pantallas del personal de El Castillo son oscuras: el editor también.
document.documentElement.classList.add("dark")

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PaginaDelEditor />
    <Toaster position="top-center" richColors closeButton theme="dark" />
  </StrictMode>
)
