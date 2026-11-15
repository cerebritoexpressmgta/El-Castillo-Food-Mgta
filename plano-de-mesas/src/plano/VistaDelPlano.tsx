// El plano para trabajar, sin editar: se ven las mesas de una zona y se toca
// una. Es el `Plano` de Mesas.tsx en Gelly, sin las cuentas: quien lo use dice
// en qué estado está cada mesa y qué renglones lleva debajo.
import type { ReactNode } from "react"

import { DibujoDeMesa, Fondo, Marco } from "./Lienzo"
import {
  delServidor,
  type EstadoDeMesa,
  type Lienzo,
  type Mesa,
  type ZonaGuardada,
} from "./plano"

/** Una mesa ya guardada: tiene id. */
export type MesaDelPlano = Mesa & { id: number }

export function VistaDelPlano({
  lienzo,
  zona,
  alTocar,
  estadoDe = () => "libre",
  lineasDe = () => [],
  avisoDe = () => undefined,
  descripcionDe,
  children,
}: {
  lienzo: Lienzo
  zona: ZonaGuardada
  alTocar?: (mesa: MesaDelPlano) => void
  /** Libre, ocupada o "cuenta". Por defecto todas libres. */
  estadoDe?: (mesa: MesaDelPlano) => EstadoDeMesa
  /** Renglones bajo el nombre (un total, un tiempo). Solo caben en mesas grandes. */
  lineasDe?: (mesa: MesaDelPlano) => string[]
  /** Un número en la esquina de la mesa. */
  avisoDe?: (mesa: MesaDelPlano) => number | undefined
  /** Lo que lee un lector de pantalla al llegar a la mesa. */
  descripcionDe?: (mesa: MesaDelPlano) => string
  /** Más dibujo encima de las mesas, si hace falta. */
  children?: ReactNode
}) {
  const [dibujo] = delServidor([zona])
  return (
    <Marco lienzo={lienzo} role="group" aria-label={`Plano de ${zona.nombre}`}>
      <Fondo decoracion={dibujo.decoracion} />
      {dibujo.mesas.map((sinId) => {
        const mesa = sinId as MesaDelPlano
        const estado = estadoDe(mesa)
        const tocable = !!alTocar
        return (
          <g
            key={mesa.clave}
            role={tocable ? "button" : undefined}
            tabIndex={tocable ? 0 : undefined}
            aria-label={
              descripcionDe?.(mesa) ??
              `Mesa ${mesa.nombre}, ${NOMBRE_DEL_ESTADO[estado].toLowerCase()}`
            }
            className={tocable ? "group cursor-pointer outline-none" : "group"}
            onClick={() => alTocar?.(mesa)}
            onKeyDown={(evento) => {
              if (tocable && (evento.key === "Enter" || evento.key === " ")) {
                evento.preventDefault()
                alTocar(mesa)
              }
            }}
          >
            <DibujoDeMesa
              mesa={mesa}
              estado={estado}
              lineas={lineasDe(mesa)}
              aviso={avisoDe(mesa)}
              className="transition-[stroke-width] group-hover:stroke-[3.5] group-focus-visible:stroke-sky-500 group-focus-visible:stroke-[4]"
            />
          </g>
        )
      })}
      {children}
    </Marco>
  )
}

export const NOMBRE_DEL_ESTADO: Record<EstadoDeMesa, string> = {
  libre: "Libre",
  ocupada: "Ocupada",
  cuenta: "Pidió la cuenta",
}
