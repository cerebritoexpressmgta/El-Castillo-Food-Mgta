// La geometría del plano: dónde cae cada cosa en el lienzo.
//
// El lienzo de cada zona mide lo que diga el backend (`lienzo`, en unidades
// propias, no píxeles): la pantalla lo escala a lo que tenga. Una mesa se
// guarda por su esquina de arriba a la izquierda y gira sobre su centro.

export type Forma = "rectangular" | "redonda"
export type TipoDeDecoracion = "pared" | "area" | "texto"

/**
 * Cómo se pinta una mesa: libre, ocupada, o "cuenta" (ya pidieron la cuenta).
 * En Gelly lo decidía la cuenta abierta de la mesa; aquí lo decide quien use
 * el plano (ver `VistaDelPlano`).
 */
export type EstadoDeMesa = "libre" | "ocupada" | "cuenta"

/** El tamaño de lienzo que usaba Gelly (backend/modulos/mesas/plano.py: LIENZO). */
export const LIENZO_POR_DEFECTO: Lienzo = { ancho: 1200, alto: 800 }

export type Lienzo = { ancho: number; alto: number }
export type Caja = { x: number; y: number; ancho: number; alto: number }

export type Mesa = Caja & {
  /** null mientras no se haya guardado. */
  id: number | null
  /** Identidad dentro del editor: existe antes de que el servidor dé un id. */
  clave: string
  nombre: string
  forma: Forma
  rotacion: number
  puestos: number
}

export type Decoracion = Caja & {
  clave: string
  tipo: TipoDeDecoracion
  rotacion: number
  texto: string
}

export type Zona = {
  id: number | null
  clave: string
  nombre: string
  mesas: Mesa[]
  decoracion: Decoracion[]
}

export const CUADRICULA = 10
export const LADO_MINIMO_MESA = 30
export const LADO_MINIMO_DECORACION = 6
export const MAX_PUESTOS = 30

let contador = 0
export const nuevaClave = () => `n${++contador}`

/** Al múltiplo más cercano de la cuadrícula: las mesas quedan alineadas sin esfuerzo. */
export function ajustar(valor: number, paso = CUADRICULA): number {
  return Math.round(valor / paso) * paso
}

function entre(valor: number, minimo: number, maximo: number): number {
  return Math.min(Math.max(valor, minimo), Math.max(minimo, maximo))
}

/** La misma caja, corrida lo necesario para que quede entera dentro del lienzo. */
export function dentroDelLienzo<T extends Caja>(caja: T, lienzo: Lienzo): T {
  const ancho = entre(caja.ancho, 1, lienzo.ancho)
  const alto = entre(caja.alto, 1, lienzo.alto)
  return {
    ...caja,
    ancho,
    alto,
    x: entre(caja.x, 0, lienzo.ancho - ancho),
    y: entre(caja.y, 0, lienzo.alto - alto),
  }
}

/** Arrastrar: la caja se va con el cursor, pegada a la cuadrícula y sin salirse. */
export function mover<T extends Caja>(
  caja: T,
  x: number,
  y: number,
  lienzo: Lienzo
): T {
  return dentroDelLienzo({ ...caja, x: ajustar(x), y: ajustar(y) }, lienzo)
}

/** Estirar desde la esquina de abajo a la derecha; la de arriba no se mueve. */
export function redimensionar<T extends Caja>(
  caja: T,
  ancho: number,
  alto: number,
  lienzo: Lienzo,
  minimo: number
): T {
  // Una pared fina (menos que un paso de la cuadrícula) se estira de a poquito.
  const paso = minimo < CUADRICULA ? minimo : CUADRICULA
  return {
    ...caja,
    ancho: entre(ajustar(ancho, paso), minimo, lienzo.ancho - caja.x),
    alto: entre(ajustar(alto, paso), minimo, lienzo.alto - caja.y),
  }
}

/**
 * Estirar con el cursor una pieza que puede estar girada. `dx` y `dy` son lo
 * que se movió el cursor en el lienzo; se traducen a los ejes de la pieza.
 * Como gira sobre su centro, al crecer se corre un poco: se compensa para que
 * la esquina de la que NO se tira se quede donde el usuario la ve.
 */
export function estirar<T extends Caja & { rotacion: number }>(
  caja: T,
  dx: number,
  dy: number,
  lienzo: Lienzo,
  minimo: number
): T {
  const giro = (caja.rotacion * Math.PI) / 180
  const coseno = Math.cos(giro)
  const seno = Math.sin(giro)
  const nueva = redimensionar(
    caja,
    caja.ancho + dx * coseno + dy * seno,
    caja.alto - dx * seno + dy * coseno,
    lienzo,
    minimo
  )
  if (caja.rotacion % 360 === 0) return nueva

  // Dónde se ve la esquina de arriba a la izquierda de una caja girada.
  const esquina = (otra: Caja) => ({
    x:
      otra.x +
      otra.ancho / 2 -
      (otra.ancho / 2) * coseno +
      (otra.alto / 2) * seno,
    y:
      otra.y +
      otra.alto / 2 -
      (otra.ancho / 2) * seno -
      (otra.alto / 2) * coseno,
  })
  const antes = esquina(caja)
  const despues = esquina(nueva)
  return {
    ...nueva,
    x: Math.round((nueva.x + antes.x - despues.x) * 10) / 10,
    y: Math.round((nueva.y + antes.y - despues.y) * 10) / 10,
  }
}

// --- Las sillas -----------------------------------------------------------------

export type Silla = { x: number; y: number; angulo: number }

/** Cuánto se separa el centro de una silla del borde de la mesa. */
export const SEPARACION_DE_SILLA = 10

/**
 * Dónde va cada silla, medido desde la esquina de la mesa. Es solo dibujo: lo
 * que cuenta es `puestos`. Una mesa redonda las reparte en círculo; una
 * rectangular las va sentando en el lado donde quede más holgada la siguiente,
 * así una mesa cuadrada de 4 queda con una por lado y una larga de 6 con dos
 * por lado y las cabeceras.
 */
export function sillas(
  forma: Forma,
  ancho: number,
  alto: number,
  puestos: number
): Silla[] {
  const cuantas = Math.max(0, Math.min(Math.floor(puestos), MAX_PUESTOS))
  if (cuantas === 0) return []

  if (forma === "redonda") {
    const radioX = ancho / 2 + SEPARACION_DE_SILLA
    const radioY = alto / 2 + SEPARACION_DE_SILLA
    return Array.from({ length: cuantas }, (_, indice) => {
      // La primera arriba, y las demás en el sentido del reloj.
      const giro = (360 / cuantas) * indice
      const radianes = ((giro - 90) * Math.PI) / 180
      return {
        x: ancho / 2 + radioX * Math.cos(radianes),
        y: alto / 2 + radioY * Math.sin(radianes),
        angulo: giro,
      }
    })
  }

  // arriba, abajo, izquierda, derecha
  const largos = [ancho, ancho, alto, alto]
  // En una mesa alargada las cabeceras se ocupan al final: primero se llenan
  // los lados largos, que es como se sienta la gente.
  const esCabecera = [
    alto > ancho * 1.25,
    alto > ancho * 1.25,
    ancho > alto * 1.25,
    ancho > alto * 1.25,
  ]
  const porLado = [0, 0, 0, 0]
  for (let silla = 0; silla < cuantas; silla++) {
    let mejor = 0
    let mayorHolgura = -1
    for (let lado = 0; lado < 4; lado++) {
      const holgura =
        (largos[lado] / (porLado[lado] + 1)) * (esCabecera[lado] ? 0.8 : 1)
      if (holgura > mayorHolgura + 1e-9) {
        mayorHolgura = holgura
        mejor = lado
      }
    }
    porLado[mejor]++
  }

  const resultado: Silla[] = []
  const d = SEPARACION_DE_SILLA
  porLado.forEach((cuantasEnElLado, lado) => {
    for (let indice = 0; indice < cuantasEnElLado; indice++) {
      const avance = (indice + 0.5) / cuantasEnElLado
      if (lado === 0) resultado.push({ x: ancho * avance, y: -d, angulo: 0 })
      if (lado === 1)
        resultado.push({ x: ancho * avance, y: alto + d, angulo: 180 })
      if (lado === 2) resultado.push({ x: -d, y: alto * avance, angulo: 270 })
      if (lado === 3)
        resultado.push({ x: ancho + d, y: alto * avance, angulo: 90 })
    }
  })
  return resultado
}

// --- Nombres --------------------------------------------------------------------

/**
 * El primer número que no esté usado: tras "1", "2" y "4" viene "3". Con
 * prefijo ("Mesa "), tras "Mesa 1" y "Mesa 2" viene "Mesa 3". Sin distinguir
 * mayúsculas, como se comparan los nombres al guardar.
 */
export function siguienteNombre(usados: string[], prefijo = ""): string {
  const nombres = new Set(usados.map((nombre) => nombre.trim().toLowerCase()))
  let numero = 1
  while (nombres.has(`${prefijo}${numero}`.trim().toLowerCase())) numero++
  return `${prefijo}${numero}`.trim()
}

/** El nombre que está puesto en más de una mesa, o null. */
export function nombreRepetido(zonas: Zona[]): string | null {
  const vistos = new Set<string>()
  for (const zona of zonas) {
    for (const mesa of zona.mesas) {
      const nombre = mesa.nombre.trim().toLowerCase()
      if (!nombre) continue
      if (vistos.has(nombre)) return mesa.nombre.trim()
      vistos.add(nombre)
    }
  }
  return null
}

// --- Del servidor al editor, y de vuelta ------------------------------------------

export type MesaGuardada = Omit<Mesa, "clave" | "id"> & { id: number }
export type DecoracionGuardada = Omit<Decoracion, "clave">
export type ZonaGuardada = {
  id: number
  nombre: string
  mesas: MesaGuardada[]
  decoracion: DecoracionGuardada[]
}

export function delServidor(zonas: ZonaGuardada[]): Zona[] {
  return zonas.map((zona) => ({
    id: zona.id,
    clave: `z${zona.id}`,
    nombre: zona.nombre,
    mesas: zona.mesas.map((mesa) => ({ ...mesa, clave: `m${mesa.id}` })),
    decoracion: zona.decoracion.map((elemento) => ({
      ...elemento,
      clave: nuevaClave(),
    })),
  }))
}

/** Lo que el editor entrega para guardar (lo que recibía POST /api/mesas/plano/guardar). */
export type PlanoParaGuardar = {
  zonas: {
    /** null = zona nueva. */
    id: number | null
    nombre: string
    mesas: (Omit<MesaGuardada, "id"> & { id: number | null })[]
    decoracion: DecoracionGuardada[]
  }[]
}

/** Lo que se le manda al backend: lo mismo, sin las claves que solo usa el editor. */
export function paraGuardar(zonas: Zona[]): PlanoParaGuardar {
  return {
    zonas: zonas.map((zona) => ({
      id: zona.id,
      nombre: zona.nombre.trim(),
      mesas: zona.mesas.map((mesa) => ({
        id: mesa.id,
        nombre: mesa.nombre.trim(),
        forma: mesa.forma,
        x: mesa.x,
        y: mesa.y,
        ancho: mesa.ancho,
        alto: mesa.alto,
        rotacion: mesa.rotacion,
        puestos: mesa.puestos,
      })),
      decoracion: zona.decoracion.map((elemento) => ({
        tipo: elemento.tipo,
        x: elemento.x,
        y: elemento.y,
        ancho: elemento.ancho,
        alto: elemento.alto,
        rotacion: elemento.rotacion,
        texto: elemento.texto.trim(),
      })),
    })),
  }
}

/** ¿Hay algo dibujado que todavía no se guardó? */
export function hayCambios(antes: Zona[], ahora: Zona[]): boolean {
  return (
    JSON.stringify(paraGuardar(antes)) !== JSON.stringify(paraGuardar(ahora))
  )
}

// --- Piezas nuevas ----------------------------------------------------------------

export type Plantilla =
  "cuadrada" | "redonda" | "larga" | "barra" | "pared" | "area" | "texto"

const MEDIDAS: Record<
  Plantilla,
  { ancho: number; alto: number; puestos?: number }
> = {
  cuadrada: { ancho: 90, alto: 90, puestos: 4 },
  redonda: { ancho: 100, alto: 100, puestos: 4 },
  larga: { ancho: 170, alto: 90, puestos: 6 },
  barra: { ancho: 50, alto: 50, puestos: 1 },
  pared: { ancho: 300, alto: 10 },
  area: { ancho: 220, alto: 70 },
  texto: { ancho: 140, alto: 30 },
}

/**
 * Dónde poner una pieza nueva: en el centro, y si ahí ya hay algo, corrida en
 * diagonal hasta que no caiga justo encima de otra.
 */
function sitioLibre(
  ancho: number,
  alto: number,
  ocupados: Caja[],
  lienzo: Lienzo
): { x: number; y: number } {
  let x = ajustar((lienzo.ancho - ancho) / 2)
  let y = ajustar((lienzo.alto - alto) / 2)
  for (let intento = 0; intento < 40; intento++) {
    const encima = ocupados.some(
      (otro) => Math.abs(otro.x - x) < 20 && Math.abs(otro.y - y) < 20
    )
    if (!encima) break
    x += 30
    y += 30
    if (x + ancho > lienzo.ancho || y + alto > lienzo.alto) {
      x = ajustar(40 + intento * 10)
      y = 40
    }
  }
  return { x, y }
}

export function nuevaMesa(
  plantilla: "cuadrada" | "redonda" | "larga" | "barra",
  zona: Zona,
  todas: Zona[],
  lienzo: Lienzo,
  prefijo = ""
): Mesa {
  const { ancho, alto, puestos } = MEDIDAS[plantilla]
  return {
    id: null,
    clave: nuevaClave(),
    nombre: siguienteNombre(
      todas.flatMap((otra) => otra.mesas.map((mesa) => mesa.nombre)),
      prefijo
    ),
    forma:
      plantilla === "redonda" || plantilla === "barra"
        ? "redonda"
        : "rectangular",
    ...sitioLibre(ancho, alto, zona.mesas, lienzo),
    ancho,
    alto,
    rotacion: 0,
    puestos: puestos ?? 4,
  }
}

export function nuevaDecoracion(
  tipo: TipoDeDecoracion,
  zona: Zona,
  lienzo: Lienzo
): Decoracion {
  const { ancho, alto } = MEDIDAS[tipo]
  return {
    clave: nuevaClave(),
    tipo,
    ...sitioLibre(ancho, alto, zona.decoracion, lienzo),
    ancho,
    alto,
    rotacion: 0,
    texto: tipo === "area" ? "Barra" : tipo === "texto" ? "Entrada" : "",
  }
}

export function zonaNueva(nombre: string): Zona {
  return {
    id: null,
    clave: nuevaClave(),
    nombre,
    mesas: [],
    decoracion: [],
  }
}
