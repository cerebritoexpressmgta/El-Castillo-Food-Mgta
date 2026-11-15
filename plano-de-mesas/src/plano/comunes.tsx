// Las dos piezas de `componentes/comunes.tsx` de Gelly que usa el editor.
// Copiadas tal cual para que el plano no dependa de nada de fuera de esta carpeta
// (salvo los componentes de shadcn/ui).
import type { ReactNode } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Spinner } from "@/components/ui/spinner"

export function Encabezado({
  titulo,
  descripcion,
  children,
}: {
  titulo: string
  descripcion?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 space-y-1">
        <h1 className="font-heading text-xl font-semibold tracking-tight">
          {titulo}
        </h1>
        {descripcion && (
          <p className="max-w-2xl text-sm text-pretty text-muted-foreground">
            {descripcion}
          </p>
        )}
      </div>
      {children && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {children}
        </div>
      )}
    </div>
  )
}

export function Confirmar({
  abierto,
  titulo,
  descripcion,
  textoConfirmar = "Eliminar",
  destructivo = true,
  pendiente,
  alConfirmar,
  alCerrar,
}: {
  abierto: boolean
  titulo: string
  descripcion?: ReactNode
  textoConfirmar?: string
  destructivo?: boolean
  pendiente?: boolean
  alConfirmar: () => void
  alCerrar: () => void
}) {
  return (
    <AlertDialog open={abierto} onOpenChange={(abrir) => !abrir && alCerrar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          {descripcion && (
            <AlertDialogDescription className="whitespace-pre-line">
              {descripcion}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendiente}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant={destructivo ? "destructive" : "default"}
            disabled={pendiente}
            onClick={(evento) => {
              // Se cierra cuando termina la operación, no al hacer clic.
              evento.preventDefault()
              alConfirmar()
            }}
          >
            {pendiente && <Spinner data-icon="inline-start" />}
            {textoConfirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
