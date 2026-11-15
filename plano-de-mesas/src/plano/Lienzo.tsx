// El dibujo del plano: el lienzo, las mesas con sus sillas y la decoración.
// Lo comparten el editor y la vista del plano.
//
// Es un SVG con las medidas del lienzo en su `viewBox`: se escala solo al
// ancho que tenga la pantalla, y un punto del plano es el mismo en un monitor
// que en un teléfono.
import type { ComponentProps, ReactNode, Ref } from "react"

import { cn } from "@/lib/utils"

import {
  sillas,
  type Caja,
  type Decoracion,
  type EstadoDeMesa,
  type Lienzo,
  type Mesa,
} from "./plano"

const ANCHO_DE_SILLA = 24
const FONDO_DE_SILLA = 11

const giro = (pieza: Caja & { rotacion: number }, sentido = 1) =>
  `rotate(${sentido * pieza.rotacion} ${pieza.ancho / 2} ${pieza.alto / 2})`

export function Marco({
  lienzo,
  conCuadricula,
  className,
  children,
  ref,
  ...props
}: ComponentProps<"svg"> & {
  lienzo: Lienzo
  conCuadricula?: boolean
  ref?: Ref<SVGSVGElement>
}) {
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${lienzo.ancho} ${lienzo.alto}`}
      className={cn(
        "block h-auto w-full rounded-xl border bg-muted/40 select-none",
        className
      )}
      {...props}
    >
      {conCuadricula && (
        <>
          <defs>
            <pattern
              id="plano-cuadricula"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r="1" className="fill-foreground/15" />
            </pattern>
          </defs>
          <rect
            width={lienzo.ancho}
            height={lienzo.alto}
            fill="url(#plano-cuadricula)"
          />
        </>
      )}
      {children}
    </svg>
  )
}

// Cómo se ve una mesa según cómo esté. El color no va solo: una mesa ocupada
// además muestra su total y su tiempo, y la que pidió la cuenta lo dice.
const ASPECTO: Record<
  EstadoDeMesa,
  { mesa: string; silla: string; texto: string; menor: string }
> = {
  libre: {
    mesa: "fill-card stroke-foreground/30",
    silla: "fill-muted stroke-foreground/25",
    texto: "fill-foreground",
    menor: "fill-muted-foreground",
  },
  ocupada: {
    mesa: "fill-primary stroke-primary",
    silla: "fill-primary/55 stroke-transparent",
    texto: "fill-primary-foreground",
    menor: "fill-primary-foreground/75",
  },
  cuenta: {
    mesa: "fill-amber-400 stroke-amber-500",
    silla: "fill-amber-400/60 stroke-transparent",
    texto: "fill-amber-950",
    menor: "fill-amber-950/80",
  },
}

export function DibujoDeMesa({
  mesa,
  estado = "libre",
  lineas = [],
  aviso,
  className,
}: {
  mesa: Mesa
  estado?: EstadoDeMesa
  /** Renglones pequeños bajo el nombre: el total, el tiempo. */
  lineas?: string[]
  /** Un número en la esquina: cuántos platos faltan por mandar a cocina. */
  aviso?: number
  /** Clases para el contorno de la mesa (selección, foco). */
  className?: string
}) {
  const aspecto = ASPECTO[estado]
  const { ancho, alto } = mesa
  const menor = Math.min(ancho, alto)
  const caben = menor >= 70 ? lineas : []
  const tamanoDelNombre = Math.max(13, Math.min(24, menor * 0.3))
  // El nombre sube un poco cuando lleva renglones debajo.
  const alturaDelNombre = alto / 2 - caben.length * 7.5

  return (
    <g transform={`translate(${mesa.x} ${mesa.y})`}>
      <g transform={giro(mesa)}>
        {sillas(mesa.forma, ancho, alto, mesa.puestos).map((silla, indice) => (
          <rect
            key={indice}
            x={-ANCHO_DE_SILLA / 2}
            y={-FONDO_DE_SILLA / 2}
            width={ANCHO_DE_SILLA}
            height={FONDO_DE_SILLA}
            rx={4}
            transform={`translate(${silla.x} ${silla.y}) rotate(${silla.angulo})`}
            className={cn("stroke-1", aspecto.silla)}
          />
        ))}
        {mesa.forma === "redonda" ? (
          <ellipse
            cx={ancho / 2}
            cy={alto / 2}
            rx={ancho / 2}
            ry={alto / 2}
            className={cn("stroke-[1.5]", aspecto.mesa, className)}
          />
        ) : (
          <rect
            width={ancho}
            height={alto}
            rx={Math.min(12, menor / 5)}
            className={cn("stroke-[1.5]", aspecto.mesa, className)}
          />
        )}
        {/* Lo escrito no gira con la mesa: se lee siempre derecho. */}
        <g transform={giro(mesa, -1)} className="pointer-events-none">
          <text
            x={ancho / 2}
            y={alturaDelNombre}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={tamanoDelNombre}
            className={cn("font-heading font-semibold", aspecto.texto)}
          >
            {mesa.nombre || "?"}
          </text>
          {caben.map((linea, indice) => (
            <text
              key={indice}
              x={ancho / 2}
              y={alturaDelNombre + tamanoDelNombre * 0.5 + 12 + indice * 15}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={13}
              className={cn("font-medium tabular-nums", aspecto.menor)}
            >
              {linea}
            </text>
          ))}
          {!!aviso && (
            <g transform={`translate(${ancho - 4} 4)`}>
              <circle
                r={11}
                className="fill-background stroke-foreground/40 stroke-1"
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={12}
                className="fill-foreground font-semibold tabular-nums"
              >
                {aviso > 99 ? "99+" : aviso}
              </text>
            </g>
          )}
        </g>
      </g>
    </g>
  )
}

export function DibujoDeDecoracion({
  elemento,
  className,
}: {
  elemento: Decoracion
  className?: string
}) {
  const { ancho, alto } = elemento
  return (
    <g transform={`translate(${elemento.x} ${elemento.y})`}>
      <g transform={giro(elemento)}>
        {elemento.tipo === "pared" && (
          <rect
            width={ancho}
            height={alto}
            rx={Math.min(3, alto / 2, ancho / 2)}
            className={cn("fill-foreground/55", className)}
          />
        )}
        {elemento.tipo === "area" && (
          <rect
            width={ancho}
            height={alto}
            rx={8}
            className={cn(
              "fill-foreground/5 stroke-foreground/30 stroke-1 [stroke-dasharray:6_5]",
              className
            )}
          />
        )}
        {elemento.tipo === "texto" && (
          // Sin relleno visible, pero con cuerpo: es de donde se agarra para moverlo.
          <rect
            width={ancho}
            height={alto}
            rx={6}
            className={cn("fill-transparent", className)}
          />
        )}
        {elemento.tipo !== "pared" && (
          <text
            x={ancho / 2}
            y={alto / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={Math.max(11, Math.min(16, alto * 0.42))}
            className="pointer-events-none fill-muted-foreground font-medium tracking-wide uppercase"
          >
            {elemento.texto}
          </text>
        )}
      </g>
    </g>
  )
}

/** Mesas y decoración de una zona, sin interacción: la decoración siempre debajo. */
export function Fondo({ decoracion }: { decoracion: Decoracion[] }) {
  return (
    <>
      {decoracion.map((elemento) => (
        <DibujoDeDecoracion key={elemento.clave} elemento={elemento} />
      ))}
    </>
  )
}

/** Lo que explica los colores del plano. */
export function Leyenda({ children }: { children?: ReactNode }) {
  const muestras: { nombre: string; clase: string }[] = [
    { nombre: "Libre", clase: "border-foreground/30 bg-card" },
    { nombre: "Ocupada", clase: "border-primary bg-primary" },
    { nombre: "Pidió la cuenta", clase: "border-amber-500 bg-amber-400" },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {muestras.map(({ nombre, clase }) => (
        <span key={nombre} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn("size-3 rounded-[4px] border", clase)}
          />
          {nombre}
        </span>
      ))}
      {children}
    </div>
  )
}
