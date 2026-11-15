// La página /plano/ de El Castillo: el editor del plano con la sesión, la
// sucursal y el guardado del local. Solo para administradores (el Worker lo
// vuelve a revisar al guardar).
import { useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"
import { Editor } from "@/plano"

import {
  esAdministrador,
  guardarPlano,
  leerPlano,
  usuarioActivo,
  type PlanoDelLocal,
} from "./api"

// A dónde se vuelve al salir: solo a pantallas conocidas del sitio.
const VOLVER: Record<string, string> = {
  admin: "../admin.html",
  mesas: "../mesas.html",
}
function volver() {
  const desde = new URLSearchParams(location.search).get("volver") || "mesas"
  location.href = VOLVER[desde] ?? VOLVER.mesas
}

function Aviso({
  titulo,
  texto,
  accion,
}: {
  titulo: string
  texto: string
  accion: { texto: string; href: string }
}) {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-3 p-6">
      <h1 className="font-heading text-xl font-semibold">{titulo}</h1>
      <p className="text-sm text-muted-foreground">{texto}</p>
      <Button asChild className="self-start">
        <a href={accion.href}>{accion.texto}</a>
      </Button>
    </main>
  )
}

export function PaginaDelEditor() {
  const [usuario] = useState(usuarioActivo)
  const [plano, setPlano] = useState<PlanoDelLocal | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async (sucursal?: number) => {
    setCargando(true)
    setError(null)
    try {
      setPlano(await leerPlano(sucursal))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargando(false)
    }
  }, [])

  const puedeEditar = esAdministrador(usuario)
  // La primera carga, al abrir la página (las demás las pide un botón).
  useEffect(() => {
    if (!puedeEditar) return
    let vigente = true
    leerPlano()
      .then((datos) => vigente && setPlano(datos))
      .catch(
        (e) => vigente && setError(e instanceof Error ? e.message : String(e))
      )
      .finally(() => vigente && setCargando(false))
    return () => {
      vigente = false
    }
  }, [puedeEditar])

  if (!usuario)
    return (
      <Aviso
        titulo="Entra para editar el plano"
        texto="El plano de las mesas lo edita un administrador. Inicia sesión en el panel y vuelve a abrir esta página."
        accion={{ texto: "Ir al panel", href: "../panel.html" }}
      />
    )
  if (!puedeEditar)
    return (
      <Aviso
        titulo="Solo un administrador puede editar el plano"
        texto="Tu usuario puede ver el plano en la pantalla de Mesas, pero no cambiarlo."
        accion={{ texto: "Volver a Mesas", href: "../mesas.html" }}
      />
    )
  if (!plano)
    return cargando ? (
      <main className="flex min-h-svh items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner /> Cargando el plano…
      </main>
    ) : (
      <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-3 p-6">
        <h1 className="font-heading text-xl font-semibold">
          No se pudo abrir el plano
        </h1>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button className="self-start" onClick={() => void cargar()}>
          Intentar de nuevo
        </Button>
      </main>
    )

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-4 p-4 sm:p-6">
      {plano.sucursales.length > 1 && (
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Sucursal</span>
          <NativeSelect
            value={String(plano.sucursal_id)}
            disabled={cargando}
            onChange={(evento) => {
              if (
                window.confirm(
                  "Si cambias de sucursal, pierdes lo que no hayas guardado. ¿Quieres cambiar de todos modos?"
                )
              )
                void cargar(Number(evento.target.value))
            }}
          >
            {plano.sucursales.map((sucursal) => (
              <NativeSelectOption key={sucursal.id} value={sucursal.id}>
                {sucursal.nombre}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {cargando && <Spinner />}
        </label>
      )}
      <Editor
        // Otra sucursal es otro plano: el editor arranca de cero.
        key={plano.sucursal_id}
        lienzo={plano.lienzo}
        zonas={plano.zonas}
        mesasBloqueadas={plano.bloqueadas}
        prefijoDeNombre="Mesa "
        largoDeNombre={30}
        minimoDePuestos={1}
        alGuardar={(nuevo) => guardarPlano(plano.sucursal_id, nuevo)}
        alSalir={volver}
      />
    </main>
  )
}
