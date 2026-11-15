// Las reglas con las que el backend de Gelly aceptaba un plano
// (backend/modulos/mesas/plano.py: guardar_plano), pasadas a TypeScript para
// que el plano funcione sin ese backend: la demo guarda con esto, y el
// proyecto donde se integre puede usarlo antes de mandar a su base de datos.
//
// OJO: en el navegador esto es solo una ayuda. Si el plano se guarda en un
// servidor, el servidor tiene que volver a revisar lo mismo.
import type {
  Caja,
  DecoracionGuardada,
  Lienzo,
  MesaGuardada,
  PlanoParaGuardar,
  ZonaGuardada,
} from "./plano"
import { LADO_MINIMO_DECORACION, LADO_MINIMO_MESA, MAX_PUESTOS } from "./plano"

export const MAX_ZONAS = 12
export const MAX_MESAS_POR_ZONA = 150
export const MAX_DECORACIONES_POR_ZONA = 80

const FORMAS = ["rectangular", "redonda"]
const DECORACIONES = ["pared", "area", "texto"]

export class PlanoInvalido extends Error {
  /** 400 = el plano está mal; 409 = choca con lo que ya había. */
  readonly codigo: 400 | 409
  constructor(mensaje: string, codigo: 400 | 409 = 400) {
    super(mensaje)
    this.name = "PlanoInvalido"
    this.codigo = codigo
  }
}

/** Una sola línea, sin nada que cierre una etiqueta o una cadena (sanitizar.texto_de_menu). */
export function limpiarTexto(valor: unknown, largoMaximo: number): string {
  return (
    String(valor ?? "")
      .replace(/[<>"`\\]/g, "")
      .replace(/'/g, "’")
      .replace(/[\r\n]/g, " ")
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
      .trim()
      .slice(0, largoMaximo)
  )
}

function numero(valor: unknown, que: string): number {
  const n = Number(valor)
  if (typeof valor !== "number" || !Number.isFinite(n))
    throw new PlanoInvalido(`${que} del plano no es un número.`)
  return n
}

const redondear = (valor: number) => Math.round(valor * 10) / 10

/** Posición y tamaño ya dentro del lienzo: nada queda dibujado afuera. */
function caja(
  elemento: Caja & { rotacion: number },
  ladoMinimo: number,
  lienzo: Lienzo
): Caja & { rotacion: number } {
  const ancho = Math.min(
    Math.max(numero(elemento.ancho, "Un ancho"), ladoMinimo),
    lienzo.ancho
  )
  const alto = Math.min(
    Math.max(numero(elemento.alto, "Un alto"), ladoMinimo),
    lienzo.alto
  )
  const x = Math.min(
    Math.max(numero(elemento.x, "Una posición"), 0),
    lienzo.ancho - ancho
  )
  const y = Math.min(
    Math.max(numero(elemento.y, "Una posición"), 0),
    lienzo.alto - alto
  )
  const rotacion = ((numero(elemento.rotacion, "Un giro") % 360) + 360) % 360
  return {
    x: redondear(x),
    y: redondear(y),
    ancho: redondear(ancho),
    alto: redondear(alto),
    rotacion: redondear(rotacion),
  }
}

/**
 * Aplica un plano nuevo sobre el que había y devuelve cómo queda guardado,
 * con ids para lo nuevo. Lanza `PlanoInvalido` si algo no se puede aceptar,
 * antes de cambiar nada.
 */
export function aplicarGuardado(
  antes: ZonaGuardada[],
  plano: PlanoParaGuardar,
  {
    lienzo,
    mesasBloqueadas = [],
    nuevoId,
  }: {
    lienzo: Lienzo
    /** Mesas que no se pueden quitar (en uso). */
    mesasBloqueadas?: Iterable<number>
    /** De dónde sale el id de lo nuevo. Por defecto, el mayor que haya + 1. */
    nuevoId?: () => number
  }
): ZonaGuardada[] {
  const { zonas } = plano
  if (zonas.length > MAX_ZONAS)
    throw new PlanoInvalido(`El plano admite hasta ${MAX_ZONAS} zonas.`)

  const zonasDeAntes = new Map(antes.map((zona) => [zona.id, zona]))
  const mesasDeAntes = new Map(
    antes.flatMap((zona) => zona.mesas.map((mesa) => [mesa.id, mesa] as const))
  )

  // Todo se revisa antes de escribir nada: nombres vacíos o repetidos.
  const nombresDeZona = new Set<string>()
  const nombresDeMesa = new Set<string>()
  for (const zona of zonas) {
    const nombre = limpiarTexto(zona.nombre, 30)
    if (!nombre) throw new PlanoInvalido("Cada zona necesita un nombre.")
    if (nombresDeZona.has(nombre.toLowerCase()))
      throw new PlanoInvalido(`Hay dos zonas llamadas «${nombre}».`)
    nombresDeZona.add(nombre.toLowerCase())

    if (zona.mesas.length > MAX_MESAS_POR_ZONA)
      throw new PlanoInvalido(
        `Una zona admite hasta ${MAX_MESAS_POR_ZONA} mesas.`
      )
    if (zona.decoracion.length > MAX_DECORACIONES_POR_ZONA)
      throw new PlanoInvalido(
        "El plano tiene demasiados elementos decorativos."
      )
    for (const mesa of zona.mesas) {
      const nombreMesa = limpiarTexto(mesa.nombre, 12)
      if (!nombreMesa)
        throw new PlanoInvalido("Cada mesa necesita un nombre o un número.")
      // El nombre es lo que el personal dice en voz alta: no puede haber dos
      // "Mesa 5", ni siquiera en zonas distintas.
      if (nombresDeMesa.has(nombreMesa.toLowerCase()))
        throw new PlanoInvalido(
          `Hay dos mesas llamadas «${nombreMesa}». Cada una necesita un nombre distinto.`
        )
      nombresDeMesa.add(nombreMesa.toLowerCase())
      if (!FORMAS.includes(mesa.forma))
        throw new PlanoInvalido("La forma de una mesa no se reconoce.")
      if (
        !Number.isInteger(mesa.puestos) ||
        mesa.puestos < 0 ||
        mesa.puestos > MAX_PUESTOS
      )
        throw new PlanoInvalido(`Una mesa admite hasta ${MAX_PUESTOS} puestos.`)
    }
    for (const elemento of zona.decoracion)
      if (!DECORACIONES.includes(elemento.tipo))
        throw new PlanoInvalido("El plano trae un elemento que no se reconoce.")
  }

  // Lo que desaparece del plano no puede estar en uso.
  const queSiguen = new Set(
    zonas.flatMap((zona) => zona.mesas.map((mesa) => mesa.id)).filter(Boolean)
  )
  for (const id of mesasBloqueadas) {
    const mesa = mesasDeAntes.get(id)
    if (mesa && !queSiguen.has(id))
      throw new PlanoInvalido(
        `La mesa ${mesa.nombre} está en uso. Libérala antes de quitarla del plano.`,
        409
      )
  }

  let mayor = Math.max(
    0,
    ...antes.map((zona) => zona.id),
    ...antes.flatMap((zona) => zona.mesas.map((mesa) => mesa.id))
  )
  const darId = nuevoId ?? (() => ++mayor)

  const vistas = new Set<number>()
  return zonas.map((datosZona): ZonaGuardada => {
    if (datosZona.id !== null && !zonasDeAntes.has(datosZona.id))
      throw new PlanoInvalido(
        "El plano cambió desde otra pantalla. Recarga antes de guardar.",
        409
      )
    const mesas = datosZona.mesas.map((datos): MesaGuardada => {
      if (datos.id !== null) {
        if (!mesasDeAntes.has(datos.id) || vistas.has(datos.id))
          throw new PlanoInvalido(
            "El plano cambió desde otra pantalla. Recarga antes de guardar.",
            409
          )
        vistas.add(datos.id)
      }
      return {
        id: datos.id ?? darId(),
        nombre: limpiarTexto(datos.nombre, 12),
        forma: datos.forma,
        ...caja(datos, LADO_MINIMO_MESA, lienzo),
        puestos: datos.puestos,
      }
    })
    const decoracion = datosZona.decoracion.map(
      (elemento): DecoracionGuardada => ({
        tipo: elemento.tipo,
        ...caja(elemento, LADO_MINIMO_DECORACION, lienzo),
        texto: limpiarTexto(elemento.texto, 30),
      })
    )
    return {
      id: datosZona.id ?? darId(),
      nombre: limpiarTexto(datosZona.nombre, 30),
      mesas,
      decoracion,
    }
  })
}
