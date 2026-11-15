// El editor del plano: el dueño dibuja su local como lo tiene en la cabeza.
//
// Se arrastran las mesas sobre el lienzo, se estiran desde la esquina y se les
// pone nombre y puestos en el panel de al lado. Nada se guarda hasta pulsar
// "Guardar plano": mientras tanto todo vive en esta pantalla, y el plano se
// entrega entero a `alGuardar` (quien lo guarde lo compara con lo que había;
// ver referencia-backend/plano.py).
//
// No sabe nada de bases de datos ni de cuentas: recibe el plano guardado, las
// mesas que no se pueden quitar, y devuelve el plano nuevo.
import {
  Circle,
  CircleDot,
  Copy,
  Minus,
  MousePointer2,
  Plus,
  RectangleHorizontal,
  RotateCcw,
  RotateCw,
  Square,
  SquareDashed,
  Trash2,
  Type,
  type LucideIcon,
} from "lucide-react"
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

import { Confirmar, Encabezado } from "./comunes"
import { DibujoDeDecoracion, DibujoDeMesa, Marco } from "./Lienzo"
import {
  CUADRICULA,
  LADO_MINIMO_DECORACION,
  LADO_MINIMO_MESA,
  MAX_PUESTOS,
  delServidor,
  dentroDelLienzo,
  estirar,
  hayCambios,
  mover,
  nombreRepetido,
  nuevaClave,
  nuevaDecoracion,
  nuevaMesa,
  paraGuardar,
  siguienteNombre,
  zonaNueva,
  type Caja,
  type Decoracion,
  type Forma,
  type Lienzo,
  type Mesa,
  type PlanoParaGuardar,
  type TipoDeDecoracion,
  type Zona,
  type ZonaGuardada,
} from "./plano"

type Seleccion = { tipo: "mesa" | "decoracion"; clave: string }

type Arrastre = Seleccion & {
  modo: "mover" | "estirar"
  /** Dónde estaba el cursor al agarrar, en unidades del lienzo. */
  inicio: { x: number; y: number }
  original: Caja & { rotacion: number }
}

const PIEZAS: {
  grupo: string
  botones: {
    nombre: string
    icono: LucideIcon
    mesa?: "cuadrada" | "redonda" | "larga" | "barra"
    decoracion?: TipoDeDecoracion
  }[]
}[] = [
  {
    grupo: "Mesas",
    botones: [
      { nombre: "Cuadrada", icono: Square, mesa: "cuadrada" },
      { nombre: "Redonda", icono: Circle, mesa: "redonda" },
      { nombre: "Larga", icono: RectangleHorizontal, mesa: "larga" },
      { nombre: "Puesto de barra", icono: CircleDot, mesa: "barra" },
    ],
  },
  {
    grupo: "Para orientarse",
    botones: [
      { nombre: "Pared", icono: Minus, decoracion: "pared" },
      { nombre: "Área", icono: SquareDashed, decoracion: "area" },
      { nombre: "Rótulo", icono: Type, decoracion: "texto" },
    ],
  },
]

const NOMBRE_DE_DECORACION: Record<TipoDeDecoracion, string> = {
  pared: "Pared",
  area: "Área",
  texto: "Rótulo",
}

/** Un campo numérico que deja escribir libremente y solo avisa cuando hay un número. */
/** Cómo se lee una mesa en voz alta: "5" es "Mesa 5", y "Mesa 5" no se repite. */
function nombreParaLeer(nombre: string): string {
  const limpio = nombre.trim()
  if (!limpio) return "Mesa sin nombre"
  return /^d/.test(limpio) ? `Mesa ${limpio}` : limpio
}

function CampoNumero({
  id,
  etiqueta,
  valor,
  minimo,
  maximo,
  alCambiar,
}: {
  id: string
  etiqueta: string
  valor: number
  minimo: number
  maximo: number
  alCambiar: (valor: number) => void
}) {
  const [texto, setTexto] = useState(String(valor))
  const [ultimo, setUltimo] = useState(valor)
  // Si el valor cambia desde afuera (se estiró con el cursor), el campo lo sigue.
  if (valor !== ultimo) {
    setUltimo(valor)
    setTexto(String(valor))
  }
  return (
    <Field>
      <FieldLabel htmlFor={id}>{etiqueta}</FieldLabel>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={minimo}
        max={maximo}
        value={texto}
        onChange={(evento) => {
          setTexto(evento.target.value)
          const numero = Math.round(Number(evento.target.value))
          if (
            evento.target.value.trim() !== "" &&
            Number.isFinite(numero) &&
            numero >= minimo &&
            numero <= maximo
          ) {
            setUltimo(numero)
            alCambiar(numero)
          }
        }}
        onBlur={() => setTexto(String(valor))}
      />
    </Field>
  )
}

export type PropsDelEditor = {
  /** El tamaño del lienzo de cada zona, en unidades propias (no píxeles). */
  lienzo: Lienzo
  /** El plano tal como está guardado. Vacío = se arranca con un salón vacío. */
  zonas: ZonaGuardada[]
  /**
   * Ids de las mesas que no se pueden quitar del plano (en Gelly: las que
   * tenían la cuenta abierta). Se pueden mover, pero no borrar.
   */
  mesasBloqueadas?: Iterable<number>
  /**
   * Guarda el plano. Recibe el plano entero, listo para mandar al servidor.
   * Si lanza un error, el editor muestra su mensaje y no se cierra.
   */
  alGuardar: (plano: PlanoParaGuardar) => Promise<unknown> | unknown
  /** Salir sin guardar, o después de guardar. */
  alSalir: () => void
  titulo?: string
  /** Delante del número de las mesas nuevas: "Mesa " da "Mesa 1", "Mesa 2"… */
  prefijoDeNombre?: string
  /** Largo máximo del nombre de una mesa (Gelly: 12; El Castillo: 30). */
  largoDeNombre?: number
  /** Puestos mínimos de una mesa (Gelly: 0; El Castillo: 1). */
  minimoDePuestos?: number
}

export function Editor({
  lienzo,
  zonas: guardadas,
  mesasBloqueadas = [],
  alGuardar,
  alSalir,
  titulo = "Editar el plano",
  prefijoDeNombre = "",
  largoDeNombre = 12,
  minimoDePuestos = 0,
}: PropsDelEditor) {
  // Un local sin plano arranca con un salón vacío, listo para dibujar.
  const [inicial] = useState<Zona[]>(() =>
    guardadas.length ? delServidor(guardadas) : [zonaNueva("Salón")]
  )
  const [zonas, setZonas] = useState<Zona[]>(inicial)
  const [claveDeZona, setClaveDeZona] = useState(inicial[0].clave)
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null)
  const [confirmando, setConfirmando] = useState<"salir" | "zona" | null>(null)
  const [guardando, setGuardando] = useState(false)
  const refLienzo = useRef<SVGSVGElement>(null)
  const arrastre = useRef<Arrastre | null>(null)

  const zona = zonas.find((otra) => otra.clave === claveDeZona) ?? zonas[0]
  const conCambios = hayCambios(inicial, zonas) || guardadas.length === 0
  // Una mesa bloqueada (en uso) no se puede quitar del plano.
  const ocupadas = new Set(mesasBloqueadas)
  const mesaElegida =
    seleccion?.tipo === "mesa"
      ? zona.mesas.find((mesa) => mesa.clave === seleccion.clave)
      : undefined
  const decoracionElegida =
    seleccion?.tipo === "decoracion"
      ? zona.decoracion.find((elemento) => elemento.clave === seleccion.clave)
      : undefined

  // Cerrar la pestaña con el plano a medio dibujar pide confirmación.
  useEffect(() => {
    if (!conCambios) return
    const avisar = (evento: BeforeUnloadEvent) => evento.preventDefault()
    window.addEventListener("beforeunload", avisar)
    return () => window.removeEventListener("beforeunload", avisar)
  }, [conCambios])

  // --- Cambios sobre el borrador ----------------------------------------------------

  function cambiarZona(cambio: (zona: Zona) => Zona) {
    setZonas((todas) =>
      todas.map((otra) => (otra.clave === zona.clave ? cambio(otra) : otra))
    )
  }

  function cambiarMesa(clave: string, cambio: (mesa: Mesa) => Mesa) {
    cambiarZona((actual) => ({
      ...actual,
      mesas: actual.mesas.map((mesa) =>
        mesa.clave === clave ? cambio(mesa) : mesa
      ),
    }))
  }

  function cambiarDecoracion(
    clave: string,
    cambio: (elemento: Decoracion) => Decoracion
  ) {
    cambiarZona((actual) => ({
      ...actual,
      decoracion: actual.decoracion.map((elemento) =>
        elemento.clave === clave ? cambio(elemento) : elemento
      ),
    }))
  }

  function cambiarPieza(
    pieza: Seleccion,
    cambio: <T extends Caja & { rotacion: number }>(pieza: T) => T
  ) {
    if (pieza.tipo === "mesa") cambiarMesa(pieza.clave, cambio)
    else cambiarDecoracion(pieza.clave, cambio)
  }

  function agregar(boton: (typeof PIEZAS)[number]["botones"][number]) {
    if (boton.mesa) {
      const mesa = nuevaMesa(boton.mesa, zona, zonas, lienzo, prefijoDeNombre)
      cambiarZona((actual) => ({ ...actual, mesas: [...actual.mesas, mesa] }))
      setSeleccion({ tipo: "mesa", clave: mesa.clave })
    } else if (boton.decoracion) {
      const elemento = nuevaDecoracion(boton.decoracion, zona, lienzo)
      cambiarZona((actual) => ({
        ...actual,
        decoracion: [...actual.decoracion, elemento],
      }))
      setSeleccion({ tipo: "decoracion", clave: elemento.clave })
    }
  }

  function eliminarSeleccion() {
    if (!seleccion) return
    if (seleccion.tipo === "mesa") {
      const mesa = zona.mesas.find((otra) => otra.clave === seleccion.clave)
      if (mesa?.id && ocupadas.has(mesa.id)) {
        toast.error(
          `La mesa ${mesa.nombre} está en uso. Puedes moverla, pero para quitarla primero cóbrala y libérala.`
        )
        return
      }
      cambiarZona((actual) => ({
        ...actual,
        mesas: actual.mesas.filter((otra) => otra.clave !== seleccion.clave),
      }))
    } else {
      cambiarZona((actual) => ({
        ...actual,
        decoracion: actual.decoracion.filter(
          (otro) => otro.clave !== seleccion.clave
        ),
      }))
    }
    setSeleccion(null)
    // La pieza que tenía el foco desaparece: el foco vuelve al plano.
    refLienzo.current?.focus({ preventScroll: true })
  }

  function duplicar(mesa: Mesa) {
    const copia: Mesa = dentroDelLienzo(
      {
        ...mesa,
        id: null,
        clave: nuevaClave(),
        nombre: siguienteNombre(
          zonas.flatMap((otra) => otra.mesas.map((una) => una.nombre)),
          prefijoDeNombre
        ),
        x: mesa.x + 30,
        y: mesa.y + 30,
      },
      lienzo
    )
    cambiarZona((actual) => ({ ...actual, mesas: [...actual.mesas, copia] }))
    setSeleccion({ tipo: "mesa", clave: copia.clave })
  }

  function agregarZona() {
    const nombres = zonas.map((otra) => otra.nombre.trim().toLowerCase())
    const propuesta =
      ["Salón", "Terraza", "Barra", "Planta alta"].find(
        (nombre) => !nombres.includes(nombre.toLowerCase())
      ) ?? `Zona ${zonas.length + 1}`
    const nueva = zonaNueva(propuesta)
    setZonas((todas) => [...todas, nueva])
    setClaveDeZona(nueva.clave)
    setSeleccion(null)
  }

  function eliminarZona() {
    const quedan = zonas.filter((otra) => otra.clave !== zona.clave)
    setZonas(quedan)
    setClaveDeZona(quedan[0].clave)
    setSeleccion(null)
    setConfirmando(null)
  }

  const zonaConMesaOcupada = zona.mesas.some(
    (mesa) => mesa.id !== null && ocupadas.has(mesa.id)
  )

  // --- Arrastrar y estirar ------------------------------------------------------------

  function puntoDelLienzo(evento: PointerEvent): { x: number; y: number } {
    const matriz = refLienzo.current?.getScreenCTM()
    if (!matriz) return { x: 0, y: 0 }
    const punto = new DOMPoint(evento.clientX, evento.clientY).matrixTransform(
      matriz.inverse()
    )
    return { x: punto.x, y: punto.y }
  }

  function agarrar(
    evento: PointerEvent,
    pieza: Seleccion,
    original: Caja & { rotacion: number },
    modo: Arrastre["modo"]
  ) {
    if (evento.button !== 0) return
    evento.stopPropagation()
    setSeleccion({ tipo: pieza.tipo, clave: pieza.clave })
    refLienzo.current?.focus({ preventScroll: true })
    refLienzo.current?.setPointerCapture(evento.pointerId)
    arrastre.current = {
      ...pieza,
      modo,
      inicio: puntoDelLienzo(evento),
      original,
    }
  }

  function alMoverElCursor(evento: PointerEvent) {
    const agarrado = arrastre.current
    if (!agarrado) return
    const punto = puntoDelLienzo(evento)
    const dx = punto.x - agarrado.inicio.x
    const dy = punto.y - agarrado.inicio.y
    const { original, modo } = agarrado
    const minimo =
      agarrado.tipo === "mesa" ? LADO_MINIMO_MESA : LADO_MINIMO_DECORACION

    cambiarPieza(agarrado, (pieza) => {
      const destino =
        modo === "mover"
          ? mover(original, original.x + dx, original.y + dy, lienzo)
          : estirar(original, dx, dy, lienzo, minimo)
      return {
        ...pieza,
        x: destino.x,
        y: destino.y,
        ancho: destino.ancho,
        alto: destino.alto,
      }
    })
  }

  function soltar(evento: PointerEvent) {
    if (!arrastre.current) return
    arrastre.current = null
    refLienzo.current?.releasePointerCapture(evento.pointerId)
  }

  function alTeclear(evento: KeyboardEvent) {
    if (!seleccion) return
    const pasos: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    const paso = pasos[evento.key]
    if (paso) {
      evento.preventDefault()
      // Con Mayús se mueve de a una unidad, para el ajuste fino.
      const cuanto = evento.shiftKey ? 1 : CUADRICULA
      cambiarPieza(seleccion, (pieza) =>
        dentroDelLienzo(
          {
            ...pieza,
            x: pieza.x + paso[0] * cuanto,
            y: pieza.y + paso[1] * cuanto,
          },
          lienzo
        )
      )
    } else if (evento.key === "Delete" || evento.key === "Backspace") {
      evento.preventDefault()
      eliminarSeleccion()
    } else if (evento.key === "Escape") {
      setSeleccion(null)
    }
  }

  // --- Guardar --------------------------------------------------------------------------

  async function guardar() {
    setGuardando(true)
    try {
      await alGuardar(paraGuardar(zonas))
      toast.success("Plano guardado.")
      alSalir()
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "No se pudo guardar el plano. Inténtalo de nuevo."
      )
    } finally {
      setGuardando(false)
    }
  }

  function intentarGuardar() {
    const sinNombre = zonas.find((otra) => !otra.nombre.trim())
    if (sinNombre) {
      setClaveDeZona(sinNombre.clave)
      toast.error("Ponle nombre a la zona antes de guardar.")
      return
    }
    for (const otra of zonas) {
      const mesaSinNombre = otra.mesas.find((mesa) => !mesa.nombre.trim())
      if (mesaSinNombre) {
        setClaveDeZona(otra.clave)
        setSeleccion({ tipo: "mesa", clave: mesaSinNombre.clave })
        toast.error("Hay una mesa sin nombre. Ponle un número o un nombre.")
        return
      }
    }
    const repetido = nombreRepetido(zonas)
    if (repetido) {
      toast.error(
        `Hay dos mesas llamadas «${repetido}». Cada una necesita un nombre distinto.`
      )
      return
    }
    void guardar()
  }

  const cursorDePieza = "cursor-grab active:cursor-grabbing"
  const elegida = mesaElegida ?? decoracionElegida

  return (
    <div className="flex flex-col gap-4">
      <Encabezado
        titulo={titulo}
        descripcion="Arrastra cada mesa a su sitio y estírala desde la esquina. Los cambios no se aplican hasta que guardes."
      >
        <Button
          variant="outline"
          disabled={guardando}
          onClick={() =>
            hayCambios(inicial, zonas) ? setConfirmando("salir") : alSalir()
          }
        >
          {hayCambios(inicial, zonas) ? "Descartar" : "Salir"}
        </Button>
        <Button onClick={intentarGuardar} disabled={guardando || !conCambios}>
          {guardando && <Spinner data-icon="inline-start" />}
          Guardar plano
        </Button>
      </Encabezado>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={zona.clave}
          onValueChange={(clave) => {
            setClaveDeZona(clave)
            setSeleccion(null)
          }}
        >
          <TabsList>
            {zonas.map((otra) => (
              <TabsTrigger key={otra.clave} value={otra.clave}>
                {otra.nombre.trim() || "Sin nombre"}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button variant="ghost" size="sm" onClick={agregarZona}>
          <Plus data-icon="inline-start" />
          Zona
        </Button>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {PIEZAS.map(({ grupo, botones }) => (
              <div key={grupo} className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs text-muted-foreground">
                  {grupo}
                </span>
                {botones.map((boton) => (
                  <Button
                    key={boton.nombre}
                    variant="outline"
                    size="sm"
                    onClick={() => agregar(boton)}
                  >
                    <boton.icono data-icon="inline-start" />
                    {boton.nombre}
                  </Button>
                ))}
              </div>
            ))}
          </div>

          <Marco
            ref={refLienzo}
            lienzo={lienzo}
            conCuadricula
            tabIndex={0}
            role="application"
            aria-label={`Plano de ${zona.nombre}. Tab para recorrer las piezas, flechas para mover la elegida (con Mayús, más fino), Suprimir para quitarla.`}
            className="touch-none outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            onPointerDown={() => setSeleccion(null)}
            onPointerMove={alMoverElCursor}
            onPointerUp={soltar}
            onPointerCancel={soltar}
            onKeyDown={alTeclear}
          >
            {zona.decoracion.map((elemento) => {
              const esLaElegida =
                seleccion?.tipo === "decoracion" &&
                seleccion.clave === elemento.clave
              return (
                <g
                  key={elemento.clave}
                  className={`${cursorDePieza} outline-none`}
                  // Con el teclado: Tab llega a la pieza y la elige.
                  tabIndex={0}
                  role="button"
                  aria-pressed={esLaElegida}
                  aria-label={
                    NOMBRE_DE_DECORACION[elemento.tipo] +
                    (elemento.texto.trim() ? ` «${elemento.texto.trim()}»` : "")
                  }
                  onFocus={() =>
                    setSeleccion({ tipo: "decoracion", clave: elemento.clave })
                  }
                  onPointerDown={(evento) =>
                    agarrar(
                      evento,
                      { tipo: "decoracion", clave: elemento.clave },
                      elemento,
                      "mover"
                    )
                  }
                >
                  <DibujoDeDecoracion
                    elemento={elemento}
                    className={
                      esLaElegida
                        ? "stroke-sky-500 stroke-2 [stroke-dasharray:none]"
                        : "hover:stroke-sky-500/60 hover:stroke-2"
                    }
                  />
                </g>
              )
            })}
            {zona.mesas.map((mesa) => {
              const esLaElegida =
                seleccion?.tipo === "mesa" && seleccion.clave === mesa.clave
              return (
                <g
                  key={mesa.clave}
                  className={`${cursorDePieza} outline-none`}
                  tabIndex={0}
                  role="button"
                  aria-pressed={esLaElegida}
                  aria-label={`${nombreParaLeer(mesa.nombre)}, ${mesa.puestos} ${mesa.puestos === 1 ? "puesto" : "puestos"}`}
                  onFocus={() =>
                    setSeleccion({ tipo: "mesa", clave: mesa.clave })
                  }
                  onPointerDown={(evento) =>
                    agarrar(
                      evento,
                      { tipo: "mesa", clave: mesa.clave },
                      mesa,
                      "mover"
                    )
                  }
                >
                  <DibujoDeMesa
                    mesa={mesa}
                    estado={
                      mesa.id !== null && ocupadas.has(mesa.id)
                        ? "ocupada"
                        : "libre"
                    }
                    lineas={mesa.puestos ? [`${mesa.puestos} pers.`] : []}
                    className={
                      esLaElegida
                        ? "stroke-sky-500 stroke-[3]"
                        : "hover:stroke-sky-500/70 hover:stroke-2"
                    }
                  />
                </g>
              )
            })}
            {elegida && seleccion && (
              // El tirador para estirar, en la esquina de abajo a la derecha de la pieza.
              <g
                transform={`translate(${elegida.x} ${elegida.y}) rotate(${elegida.rotacion} ${elegida.ancho / 2} ${elegida.alto / 2})`}
              >
                <rect
                  x={elegida.ancho - 9}
                  y={elegida.alto - 9}
                  width={18}
                  height={18}
                  rx={5}
                  className="cursor-nwse-resize fill-background stroke-sky-500 stroke-2"
                  onPointerDown={(evento) =>
                    agarrar(evento, seleccion, elegida, "estirar")
                  }
                />
              </g>
            )}
          </Marco>
          {/* Para lectores de pantalla: qué pieza quedó elegida. */}
          <p role="status" className="sr-only">
            {mesaElegida
              ? `Elegida: ${nombreParaLeer(mesaElegida.nombre)}`
              : decoracionElegida
                ? `Elegido: ${NOMBRE_DE_DECORACION[decoracionElegida.tipo].toLowerCase()}`
                : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            Toca una pieza para elegirla (o llega a ella con Tab). Con las
            flechas se mueve de a poco (con Mayús, más fino) y con Suprimir se
            quita.
          </p>
        </div>

        <aside className="flex flex-col gap-4 rounded-xl border bg-card p-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="plano-zona">Nombre de la zona</FieldLabel>
              <Input
                id="plano-zona"
                value={zona.nombre}
                maxLength={30}
                onChange={(evento) =>
                  cambiarZona((actual) => ({
                    ...actual,
                    nombre: evento.target.value,
                  }))
                }
              />
            </Field>
            {zonas.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="self-start text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                disabled={zonaConMesaOcupada}
                title={
                  zonaConMesaOcupada
                    ? "Tiene mesas en uso: libéralas para poder quitar la zona."
                    : undefined
                }
                onClick={() =>
                  zona.mesas.length || zona.decoracion.length
                    ? setConfirmando("zona")
                    : eliminarZona()
                }
              >
                <Trash2 data-icon="inline-start" />
                Quitar esta zona
              </Button>
            )}
          </FieldGroup>

          <div className="h-px bg-border" />

          {mesaElegida && (
            <FieldGroup key={mesaElegida.clave}>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="plano-mesa-nombre">Mesa</FieldLabel>
                  <Input
                    id="plano-mesa-nombre"
                    value={mesaElegida.nombre}
                    maxLength={largoDeNombre}
                    placeholder={`${prefijoDeNombre}5`.trim()}
                    onChange={(evento) =>
                      cambiarMesa(mesaElegida.clave, (mesa) => ({
                        ...mesa,
                        nombre: evento.target.value,
                      }))
                    }
                  />
                </Field>
                <CampoNumero
                  id="plano-mesa-puestos"
                  etiqueta="Puestos"
                  valor={mesaElegida.puestos}
                  minimo={minimoDePuestos}
                  maximo={MAX_PUESTOS}
                  alCambiar={(puestos) =>
                    cambiarMesa(mesaElegida.clave, (mesa) => ({
                      ...mesa,
                      puestos,
                    }))
                  }
                />
              </div>
              <Field>
                <FieldLabel>Forma</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={mesaElegida.forma}
                  onValueChange={(forma) =>
                    forma &&
                    cambiarMesa(mesaElegida.clave, (mesa) => ({
                      ...mesa,
                      forma: forma as Forma,
                    }))
                  }
                >
                  <ToggleGroupItem value="rectangular">
                    <Square />
                    Recta
                  </ToggleGroupItem>
                  <ToggleGroupItem value="redonda">
                    <Circle />
                    Redonda
                  </ToggleGroupItem>
                </ToggleGroup>
              </Field>
              <Medidas
                pieza={mesaElegida}
                minimo={LADO_MINIMO_MESA}
                lienzo={lienzo}
                alCambiar={(cambio) =>
                  cambiarMesa(mesaElegida.clave, (mesa) =>
                    dentroDelLienzo({ ...mesa, ...cambio }, lienzo)
                  )
                }
              />
              {mesaElegida.id !== null && ocupadas.has(mesaElegida.id) && (
                <FieldDescription>
                  Esta mesa está en uso. Puedes moverla, pero para quitarla
                  primero cóbrala y libérala.
                </FieldDescription>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => duplicar(mesaElegida)}
                >
                  <Copy data-icon="inline-start" />
                  Duplicar
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={
                    mesaElegida.id !== null && ocupadas.has(mesaElegida.id)
                  }
                  onClick={eliminarSeleccion}
                >
                  <Trash2 data-icon="inline-start" />
                  Quitar
                </Button>
              </div>
            </FieldGroup>
          )}

          {decoracionElegida && (
            <FieldGroup key={decoracionElegida.clave}>
              <p className="text-sm font-medium">
                {NOMBRE_DE_DECORACION[decoracionElegida.tipo]}
              </p>
              {decoracionElegida.tipo !== "pared" && (
                <Field>
                  <FieldLabel htmlFor="plano-texto">Texto</FieldLabel>
                  <Input
                    id="plano-texto"
                    value={decoracionElegida.texto}
                    maxLength={30}
                    onChange={(evento) =>
                      cambiarDecoracion(
                        decoracionElegida.clave,
                        (elemento) => ({
                          ...elemento,
                          texto: evento.target.value,
                        })
                      )
                    }
                  />
                </Field>
              )}
              <Medidas
                pieza={decoracionElegida}
                minimo={LADO_MINIMO_DECORACION}
                lienzo={lienzo}
                alCambiar={(cambio) =>
                  cambiarDecoracion(decoracionElegida.clave, (elemento) =>
                    dentroDelLienzo({ ...elemento, ...cambio }, lienzo)
                  )
                }
              />
              <Button
                variant="destructive"
                size="sm"
                className="self-start"
                onClick={eliminarSeleccion}
              >
                <Trash2 data-icon="inline-start" />
                Quitar
              </Button>
            </FieldGroup>
          )}

          {!elegida && (
            <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
              <MousePointer2 className="size-4" />
              <p>
                Agrega una mesa con los botones de arriba, o toca una del plano
                para cambiarle el nombre, los puestos y el tamaño.
              </p>
              <p>
                {zona.mesas.length === 1
                  ? "1 mesa"
                  : `${zona.mesas.length} mesas`}{" "}
                en esta zona ·{" "}
                {zona.mesas.reduce((suma, mesa) => suma + mesa.puestos, 0)}{" "}
                puestos
              </p>
            </div>
          )}
        </aside>
      </div>

      <Confirmar
        abierto={confirmando === "salir"}
        titulo="¿Descartar los cambios del plano?"
        descripcion="Lo que dibujaste desde la última vez que guardaste se pierde."
        textoConfirmar="Descartar"
        alConfirmar={alSalir}
        alCerrar={() => setConfirmando(null)}
      />
      <Confirmar
        abierto={confirmando === "zona"}
        titulo={`¿Quitar la zona «${zona.nombre.trim() || "sin nombre"}»?`}
        descripcion="Se quitan también sus mesas y lo dibujado en ella. Se aplica cuando guardes el plano."
        textoConfirmar="Quitar zona"
        alConfirmar={eliminarZona}
        alCerrar={() => setConfirmando(null)}
      />
    </div>
  )
}

/** Ancho, alto y giro de una pieza. */
function Medidas({
  pieza,
  minimo,
  lienzo,
  alCambiar,
}: {
  pieza: Caja & { rotacion: number }
  minimo: number
  lienzo: { ancho: number; alto: number }
  alCambiar: (cambio: Partial<Caja & { rotacion: number }>) => void
}) {
  const girar = (grados: number) =>
    alCambiar({ rotacion: (((pieza.rotacion + grados) % 360) + 360) % 360 })
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <CampoNumero
          id="plano-ancho"
          etiqueta="Ancho"
          valor={Math.round(pieza.ancho)}
          minimo={minimo}
          maximo={lienzo.ancho}
          alCambiar={(ancho) => alCambiar({ ancho })}
        />
        <CampoNumero
          id="plano-alto"
          etiqueta="Alto"
          valor={Math.round(pieza.alto)}
          minimo={minimo}
          maximo={lienzo.alto}
          alCambiar={(alto) => alCambiar({ alto })}
        />
      </div>
      <Field>
        <FieldLabel>Giro</FieldLabel>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Girar a la izquierda"
            onClick={() => girar(-45)}
          >
            <RotateCcw />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Girar a la derecha"
            onClick={() => girar(45)}
          >
            <RotateCw />
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            {Math.round(pieza.rotacion)}°
          </span>
        </div>
      </Field>
    </>
  )
}
