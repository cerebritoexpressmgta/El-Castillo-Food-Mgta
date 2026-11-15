// Cómo habla el editor con el Worker de El Castillo (worker/plano.mjs). Usa la
// misma sesión que el resto de las pantallas del personal: el token y el
// usuario que guardan panel.html, cocina.html y admin.html en localStorage.
import type { Lienzo, PlanoParaGuardar, ZonaGuardada } from "@/plano"

export type PlanoDelLocal = {
  lienzo: Lienzo
  sucursal_id: number
  /** Vacío si el usuario trabaja en una sola sucursal. */
  sucursales: { id: number; nombre: string }[]
  zonas: ZonaGuardada[]
  /** Mesas en uso: no se pueden quitar del plano. */
  bloqueadas: number[]
}

export type Usuario = { username: string; nombre?: string; rol?: string }

const CLAVE_TOKEN = "tokioAuthToken"
const CLAVE_USUARIO = "usuarioActivo"

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave)
  } catch {
    return null
  }
}

export function usuarioActivo(): Usuario | null {
  if (!leer(CLAVE_TOKEN)) return null
  try {
    return JSON.parse(leer(CLAVE_USUARIO) || "null") as Usuario | null
  } catch {
    return null
  }
}

export const esAdministrador = (usuario: Usuario | null) =>
  ["admin", "superadmin"].includes(String(usuario?.rol || "").toLowerCase())

/** La sesión venció: se borra y se vuelve a la entrada del personal. */
export function sesionVencida() {
  try {
    localStorage.removeItem(CLAVE_USUARIO)
    localStorage.removeItem(CLAVE_TOKEN)
  } catch {
    // nada que borrar
  }
  location.replace("../panel.html")
}

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  let respuesta: Response
  try {
    respuesta = await fetch(ruta, {
      ...init,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${leer(CLAVE_TOKEN) || ""}`,
      },
    })
  } catch {
    throw new Error("Sin conexión. Revisa tu internet e inténtalo de nuevo.")
  }
  if (respuesta.status === 401) {
    sesionVencida()
    throw new Error("Tu sesión venció. Entra de nuevo.")
  }
  const datos = await respuesta.json().catch(() => ({}))
  if (!respuesta.ok || datos?.success === false)
    throw new Error(
      datos?.detail ||
        datos?.error ||
        "No se pudo completar. Inténtalo de nuevo."
    )
  return datos as T
}

export const leerPlano = (sucursal?: number) =>
  pedir<PlanoDelLocal>(
    "/api/mesas/plano" + (sucursal ? `?sucursal=${sucursal}` : "")
  )

export const guardarPlano = (sucursal: number, plano: PlanoParaGuardar) =>
  pedir<{ success: true }>("/api/mesas/plano/guardar", {
    method: "POST",
    body: JSON.stringify({ sucursal_id: sucursal, zonas: plano.zonas }),
  })
