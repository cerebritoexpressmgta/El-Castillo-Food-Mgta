// El plano en la pantalla de Mesas de El Castillo (mesas.html), sin React:
// se compila a /plano/vista.js y deja `window.PlanoVista` para mesas.js.
//
// Dibuja lo mismo que Lienzo.tsx (mesas con sus sillas, paredes, áreas y
// rótulos) con los colores de esa pantalla: verde libre, ámbar ocupada,
// fucsia "pidió la cuenta". Todo el texto entra con textContent: un nombre de
// mesa nunca se interpreta como HTML.
import {
  sillas,
  type DecoracionGuardada,
  type EstadoDeMesa,
  type Lienzo,
  type MesaGuardada,
  type ZonaGuardada,
} from "../plano/plano"

const SVG = "http://www.w3.org/2000/svg"

export const COLORES: Record<
  EstadoDeMesa,
  { mesa: string; borde: string; silla: string; texto: string; menor: string }
> = {
  libre: {
    mesa: "rgba(16,185,129,0.10)",
    borde: "#10b981",
    silla: "rgba(16,185,129,0.35)",
    texto: "#f1f5f9",
    menor: "#94a3b8",
  },
  ocupada: {
    mesa: "#f59e0b",
    borde: "#f59e0b",
    silla: "rgba(245,158,11,0.6)",
    texto: "#1c1917",
    menor: "#292524",
  },
  cuenta: {
    mesa: "#a21caf",
    borde: "#e879f9",
    silla: "rgba(217,70,239,0.6)",
    texto: "#ffffff",
    menor: "#fae8ff",
  },
}

const NOMBRE_DEL_ESTADO: Record<EstadoDeMesa, string> = {
  libre: "libre",
  ocupada: "ocupada",
  cuenta: "pidió la cuenta",
}

type Atributos = Record<string, string | number>

function el<K extends keyof SVGElementTagNameMap>(
  etiqueta: K,
  atributos: Atributos = {},
  ...hijos: (SVGElement | string)[]
): SVGElementTagNameMap[K] {
  const nodo = document.createElementNS(SVG, etiqueta)
  for (const [clave, valor] of Object.entries(atributos))
    nodo.setAttribute(clave, String(valor))
  for (const hijo of hijos)
    nodo.appendChild(
      typeof hijo === "string" ? document.createTextNode(hijo) : hijo
    )
  return nodo
}

const giro = (
  pieza: { ancho: number; alto: number; rotacion: number },
  sentido = 1
) => `rotate(${sentido * pieza.rotacion} ${pieza.ancho / 2} ${pieza.alto / 2})`

function decoracion(e: DecoracionGuardada): SVGGElement {
  const dentro = el("g", { transform: giro(e) })
  if (e.tipo === "pared")
    dentro.appendChild(
      el("rect", {
        width: e.ancho,
        height: e.alto,
        rx: Math.min(3, e.alto / 2, e.ancho / 2),
        fill: "rgba(148,163,184,0.75)",
      })
    )
  if (e.tipo === "area")
    dentro.appendChild(
      el("rect", {
        width: e.ancho,
        height: e.alto,
        rx: 8,
        fill: "rgba(148,163,184,0.06)",
        stroke: "rgba(148,163,184,0.45)",
        "stroke-dasharray": "6 5",
      })
    )
  if (e.tipo !== "pared" && e.texto)
    dentro.appendChild(
      el(
        "text",
        {
          x: e.ancho / 2,
          y: e.alto / 2,
          "text-anchor": "middle",
          "dominant-baseline": "central",
          "font-size": Math.max(11, Math.min(16, e.alto * 0.42)),
          "font-weight": 600,
          "letter-spacing": 1,
          fill: "#94a3b8",
          "pointer-events": "none",
        },
        e.texto.toUpperCase()
      )
    )
  return el("g", { transform: `translate(${e.x} ${e.y})` }, dentro)
}

function mesa(
  m: MesaGuardada,
  estado: EstadoDeMesa,
  lineas: string[]
): SVGGElement {
  const color = COLORES[estado]
  const menor = Math.min(m.ancho, m.alto)
  const caben = menor >= 70 ? lineas : []
  const tamano = Math.max(13, Math.min(22, menor * 0.26))
  const alturaDelNombre = m.alto / 2 - caben.length * 7.5

  const dentro = el("g", { transform: giro(m) })
  for (const silla of sillas(m.forma, m.ancho, m.alto, m.puestos))
    dentro.appendChild(
      el("rect", {
        x: -12,
        y: -5.5,
        width: 24,
        height: 11,
        rx: 4,
        fill: color.silla,
        transform: `translate(${silla.x} ${silla.y}) rotate(${silla.angulo})`,
      })
    )
  const cuerpo =
    m.forma === "redonda"
      ? el("ellipse", {
          cx: m.ancho / 2,
          cy: m.alto / 2,
          rx: m.ancho / 2,
          ry: m.alto / 2,
        })
      : el("rect", {
          width: m.ancho,
          height: m.alto,
          rx: Math.min(12, menor / 5),
        })
  cuerpo.setAttribute("class", "plano-cuerpo")
  cuerpo.setAttribute("fill", color.mesa)
  cuerpo.setAttribute("stroke", color.borde)
  cuerpo.setAttribute("stroke-width", "2")
  dentro.appendChild(cuerpo)

  // Lo escrito no gira con la mesa: se lee siempre derecho.
  const textos = el("g", { transform: giro(m, -1), "pointer-events": "none" })
  textos.appendChild(
    el(
      "text",
      {
        x: m.ancho / 2,
        y: alturaDelNombre,
        "text-anchor": "middle",
        "dominant-baseline": "central",
        "font-size": tamano,
        "font-weight": 800,
        fill: color.texto,
      },
      m.nombre
    )
  )
  caben.forEach((linea, i) =>
    textos.appendChild(
      el(
        "text",
        {
          x: m.ancho / 2,
          y: alturaDelNombre + tamano * 0.5 + 12 + i * 15,
          "text-anchor": "middle",
          "dominant-baseline": "central",
          "font-size": 12,
          "font-weight": 600,
          fill: color.menor,
        },
        linea
      )
    )
  )
  if (estado === "cuenta")
    textos.appendChild(
      el(
        "g",
        { transform: `translate(${m.ancho - 4} 4)` },
        el("circle", {
          r: 12,
          fill: "#4a044e",
          stroke: "#fae8ff",
          "stroke-width": 1.5,
        }),
        el(
          "text",
          {
            "text-anchor": "middle",
            "dominant-baseline": "central",
            "font-size": 14,
            "font-weight": 800,
            fill: "#ffffff",
          },
          "$"
        )
      )
    )
  dentro.appendChild(textos)
  return el("g", { transform: `translate(${m.x} ${m.y})` }, dentro)
}

export type OpcionesDeVista = {
  lienzo: Lienzo
  zona: ZonaGuardada
  estadoDe?: (id: number) => EstadoDeMesa
  lineasDe?: (id: number) => string[]
  alTocar?: (id: number) => void
}

/** Dibuja una zona dentro de `contenedor` (reemplaza lo que hubiera). */
export function dibujar(contenedor: Element, opciones: OpcionesDeVista) {
  const {
    lienzo,
    zona,
    estadoDe = () => "libre",
    lineasDe = () => [],
    alTocar,
  } = opciones
  const svg = el("svg", {
    viewBox: `0 0 ${lienzo.ancho} ${lienzo.alto}`,
    role: "group",
    "aria-label": `Plano de ${zona.nombre}`,
    style:
      "display:block;width:100%;min-width:720px;height:auto;user-select:none;-webkit-user-select:none",
  })
  svg.appendChild(
    el(
      "style",
      {},
      ".plano-mesa{cursor:pointer;outline:none}" +
        ".plano-mesa:hover .plano-cuerpo{stroke-width:4}" +
        ".plano-mesa:focus-visible .plano-cuerpo{stroke:#38bdf8;stroke-width:5}"
    )
  )
  zona.decoracion.forEach((e) => svg.appendChild(decoracion(e)))
  for (const m of zona.mesas) {
    const estado = estadoDe(m.id)
    const grupo = mesa(m, estado, lineasDe(m.id))
    // Para devolverle el foco a la misma mesa cuando la pantalla se repinta.
    grupo.setAttribute("data-mesa", String(m.id))
    if (alTocar) {
      grupo.setAttribute("class", "plano-mesa")
      grupo.setAttribute("role", "button")
      grupo.setAttribute("tabindex", "0")
      grupo.setAttribute(
        "aria-label",
        `${m.nombre}, ${NOMBRE_DEL_ESTADO[estado]}`
      )
      grupo.addEventListener("click", () => alTocar(m.id))
      grupo.addEventListener("keydown", (evento) => {
        if (evento.key === "Enter" || evento.key === " ") {
          evento.preventDefault()
          alTocar(m.id)
        }
      })
    }
    svg.appendChild(grupo)
  }
  contenedor.replaceChildren(svg)
  return svg
}
