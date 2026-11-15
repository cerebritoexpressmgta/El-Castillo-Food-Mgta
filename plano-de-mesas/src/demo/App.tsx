// Una pantalla de prueba para ver el plano funcionando solo, sin backend:
// guarda en el navegador. Al integrarlo en otro proyecto esta carpeta no se
// copia; lo que se copia es src/plano/.
import { RotateCcw, SquarePen } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Editor,
  LIENZO_POR_DEFECTO,
  Leyenda,
  NOMBRE_DEL_ESTADO,
  VistaDelPlano,
  aplicarGuardado,
  planoDeEjemplo,
  type EstadoDeMesa,
  type ZonaGuardada,
} from "@/plano"
import { Encabezado } from "@/plano/comunes"

const CLAVE = "plano-de-mesas:demo"
const SIGUIENTE: Record<EstadoDeMesa, EstadoDeMesa> = {
  libre: "ocupada",
  ocupada: "cuenta",
  cuenta: "libre",
}

type Guardado = { zonas: ZonaGuardada[]; estados: Record<number, EstadoDeMesa> }

function leer(): Guardado {
  try {
    const crudo = localStorage.getItem(CLAVE)
    if (crudo) return JSON.parse(crudo) as Guardado
  } catch {
    // Sin almacenamiento (ventana privada): se arranca con el ejemplo.
  }
  return { zonas: planoDeEjemplo(), estados: {} }
}

function escribir(datos: Guardado) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos))
  } catch {
    // Sin almacenamiento: queda solo en memoria.
  }
}

export function App() {
  const lienzo = LIENZO_POR_DEFECTO
  const [datos, setDatos] = useState<Guardado>(leer)
  const [editando, setEditando] = useState(false)
  const [idDeZona, setIdDeZona] = useState<number | null>(null)

  function cambiar(nuevos: Guardado) {
    setDatos(nuevos)
    escribir(nuevos)
  }

  const bloqueadas = Object.entries(datos.estados)
    .filter(([, estado]) => estado !== "libre")
    .map(([id]) => Number(id))

  if (editando)
    return (
      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        <Editor
          lienzo={lienzo}
          zonas={datos.zonas}
          mesasBloqueadas={bloqueadas}
          alGuardar={async (plano) => {
            // Aquí iría la llamada al backend del otro proyecto.
            const zonas = aplicarGuardado(datos.zonas, plano, {
              lienzo,
              mesasBloqueadas: bloqueadas,
            })
            cambiar({ ...datos, zonas })
          }}
          alSalir={() => setEditando(false)}
        />
      </main>
    )

  const zona =
    datos.zonas.find((otra) => otra.id === idDeZona) ?? datos.zonas[0]

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-4 p-4 sm:p-6">
      <Encabezado
        titulo="Plano de mesas"
        descripcion="Toca una mesa para cambiar su estado (libre → ocupada → pidió la cuenta). Las mesas que no están libres no se pueden quitar en el editor."
      >
        <Button
          variant="ghost"
          onClick={() => {
            cambiar({ zonas: planoDeEjemplo(), estados: {} })
            setIdDeZona(null)
            toast.success("Se restableció el plano de ejemplo.")
          }}
        >
          <RotateCcw data-icon="inline-start" />
          Restablecer ejemplo
        </Button>
        <Button onClick={() => setEditando(true)}>
          <SquarePen data-icon="inline-start" />
          Editar el plano
        </Button>
      </Encabezado>

      {zona ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              value={String(zona.id)}
              onValueChange={(valor) => setIdDeZona(Number(valor))}
            >
              <TabsList>
                {datos.zonas.map((otra) => (
                  <TabsTrigger key={otra.id} value={String(otra.id)}>
                    {otra.nombre}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Leyenda />
          </div>
          <VistaDelPlano
            lienzo={lienzo}
            zona={zona}
            estadoDe={(mesa) => datos.estados[mesa.id] ?? "libre"}
            lineasDe={(mesa) => (mesa.puestos ? [`${mesa.puestos} pers.`] : [])}
            alTocar={(mesa) => {
              const estado = SIGUIENTE[datos.estados[mesa.id] ?? "libre"]
              cambiar({
                ...datos,
                estados: { ...datos.estados, [mesa.id]: estado },
              })
              toast(`Mesa ${mesa.nombre}: ${NOMBRE_DEL_ESTADO[estado]}`)
            }}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No hay plano todavía. Pulsa «Editar el plano» para dibujarlo.
        </p>
      )}
    </main>
  )
}
