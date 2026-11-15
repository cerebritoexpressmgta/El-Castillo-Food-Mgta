# Plano de mesas

El editor de planos de mesas de **Gelly** (`Jarlert/plataforma-restaurantes`,
commit `ce09f79`), separado del resto de la plataforma para llevarlo a otro
proyecto. Dibuja el local por zonas (salón, terraza…): mesas cuadradas,
redondas, largas y puestos de barra, con sus sillas, más paredes, áreas y
rótulos para orientarse. Se arrastra, se estira desde la esquina, se gira de
45° en 45°, se mueve con las flechas y se guarda entero.

Funciona solo, sin backend: `npm install` y `npm run dev` abren una demo en
`http://localhost:3001` que guarda en el navegador.

## En El Castillo

Esta carpeta vive dentro del repo de El Castillo, que no tiene paso de build:
lo que usa el sitio es la carpeta **`../plano/`**, ya compilada y subida al repo.

```
src/castillo/
  PaginaDelEditor.tsx   la página /plano/: sesión del personal, sucursal, guardar
  api.ts                GET /api/mesas/plano y POST /api/mesas/plano/guardar (worker/plano.mjs)
  main.tsx              arranque (tema oscuro, como las pantallas del personal)
  vista.ts              /plano/vista.js: el plano de solo lectura para mesas.html, sin React
  plano-worker.test.mjs pruebas de las reglas del Worker (worker/plano.mjs)
castillo/index.html     la página del editor
vite.castillo.config.ts compila la página a ../plano/
vite.vista.config.ts    compila vista.ts a ../plano/vista.js (window.PlanoVista)
```

Después de cambiar algo aquí:

```
npm install
npm test
npm run build:castillo   # reescribe ../plano/ entero
```

y subir los cambios de `../plano/` junto con los de esta carpeta. Si cambias
`vista.js`, sube también el `?v=` con que lo carga `mesas.html`.

Ajustes del editor para El Castillo: nombres «Mesa N» de hasta 30 letras
(`prefijoDeNombre`, `largoDeNombre`) y al menos 1 puesto (`minimoDePuestos`),
las mismas reglas que Administración → Mesas. La carpeta no se publica en la
web (`.assetsignore`).

## Qué hay aquí

```
src/plano/              ← LO QUE SE LLEVA AL OTRO PROYECTO
  plano.ts              geometría pura: mover, estirar (girado), sillas, nombres, ida y vuelta al servidor
  plano.test.ts         sus pruebas (las mismas de Gelly)
  Lienzo.tsx            el dibujo SVG: Marco, DibujoDeMesa, DibujoDeDecoracion, Fondo, Leyenda
  Editor.tsx            el editor completo (panel lateral, zonas, teclado, confirmaciones)
  VistaDelPlano.tsx     el plano para trabajar: ver y tocar mesas (sin editar)
  guardado.ts           las reglas con que el backend aceptaba un plano, en TypeScript
  guardado.test.ts      sus pruebas
  ejemplo.ts            un plano de ejemplo (salón + terraza, 16 mesas)
  comunes.tsx           Encabezado y Confirmar (copiados de Gelly)
  index.ts              lo que se importa desde fuera
src/components/ui/      los componentes de shadcn/ui que usa el editor
src/lib/utils.ts        `cn`
src/index.css           el tema (Tailwind 4 + shadcn, claro/oscuro)
src/demo/               la pantalla de prueba (no se copia)
referencia-backend/     el código Python original que guardaba el plano (solo de consulta)
```

## Qué cambió respecto a Gelly

Lo que dibuja y cómo se edita es idéntico. Se le quitó todo lo que lo ataba a
la plataforma:

- **El editor ya no llama a la API ni usa React Query.** Antes hacía
  `POST /api/mesas/plano/guardar` y tocaba la caché `["mesas"]`. Ahora recibe
  el plano por props y entrega el plano nuevo a `alGuardar`. Si `alGuardar`
  lanza un error, el editor muestra su mensaje y no se cierra.
- **Ya no sabe de cuentas.** Antes leía las cuentas abiertas para no dejar
  quitar una mesa ocupada; ahora eso llega como `mesasBloqueadas` (ids). Los
  textos dicen "está en uso" en vez de "tiene la cuenta abierta".
- **`EstadoDeMesa`** (`libre | ocupada | cuenta`) pasó de `cuenta.ts` a
  `plano.ts`. La vista del plano recibe funciones (`estadoDe`, `lineasDe`,
  `avisoDe`) en vez de las cuentas.
- **El tamaño del lienzo** venía del backend (`GET /api/mesas/` → `lienzo`).
  Ahora es una prop; `LIENZO_POR_DEFECTO` es el mismo 1200 × 800.
- **Nuevo: `guardado.ts`**, la validación de `plano.py: guardar_plano` pasada
  a TypeScript (nombres vacíos o repetidos, formas, puestos 0–30, límites de
  zonas/mesas, todo metido dentro del lienzo, no quitar mesas en uso, ids que
  ya no existen → 409). Sirve para la demo y como guía del backend nuevo.

## Cómo se usa

```tsx
import { Editor, VistaDelPlano, LIENZO_POR_DEFECTO } from "@/plano"

// Editar
<Editor
  lienzo={LIENZO_POR_DEFECTO}
  zonas={zonasGuardadas}            // ZonaGuardada[]; [] = arranca con un salón vacío
  mesasBloqueadas={idsOcupadas}     // opcional
  alGuardar={async (plano) => {     // PlanoParaGuardar
    const res = await miBackend.guardarPlano(plano)
    if (!res.ok) throw new Error(res.mensaje)   // el editor lo muestra
    setZonasGuardadas(res.zonas)
  }}
  alSalir={() => setEditando(false)}
/>

// Trabajar con el plano
<VistaDelPlano
  lienzo={LIENZO_POR_DEFECTO}
  zona={zona}
  estadoDe={(mesa) => (ocupadas.has(mesa.id) ? "ocupada" : "libre")}
  lineasDe={(mesa) => [`${mesa.puestos} pers.`]}
  alTocar={(mesa) => abrirMesa(mesa.id)}
/>
```

El editor avisa con `toast` de `sonner`: el proyecto que lo use necesita un
`<Toaster />` montado (ver `src/demo/main.tsx`).

## El formato de los datos

Las coordenadas son unidades del lienzo, no píxeles; el SVG las escala. Una
pieza se guarda por su esquina de arriba a la izquierda y gira sobre su centro.

```jsonc
// ZonaGuardada[] — lo que el editor recibe
[{
  "id": 1, "nombre": "Salón",
  "mesas": [{ "id": 3, "nombre": "1", "forma": "rectangular",   // o "redonda"
              "x": 120, "y": 230, "ancho": 90, "alto": 90, "rotacion": 0, "puestos": 4 }],
  "decoracion": [{ "tipo": "pared", "x": 40, "y": 40, "ancho": 1120, "alto": 10,  // pared | area | texto
                   "rotacion": 0, "texto": "" }]
}]
// PlanoParaGuardar — lo que entrega: { "zonas": [ ...igual, con id: null en lo nuevo ] }
```

Reglas que el backend que lo guarde debe cumplir (las mismas de Gelly; están
en `guardado.ts` y en `referencia-backend/plano.py`):

- El plano se guarda **entero** cada vez y se compara con lo que había.
- Lo que deja de venir **se desactiva, no se borra** (cuentas o reservas viejas pueden apuntar a esa mesa).
- Una mesa en uso no se puede quitar (409).
- Los nombres de mesa son únicos en todo el local, entre zonas también.
- Todo se recorta dentro del lienzo; lado mínimo 30 (mesa) y 6 (decoración); hasta 30 puestos, 12 zonas, 150 mesas y 80 decoraciones por zona.
- Los textos se limpian (sin `< > " `` \`, una línea; nombre de mesa 12 caracteres, de zona y rótulos 30).

## Tablas (en Gelly)

`mesas_zonas` (id, nombre, orden, `decoracion_json`, activa) y `mesas` (id,
zona_id, nombre, forma, x, y, ancho, alto, rotacion, puestos, activa). La
decoración vive como JSON dentro de la zona. Ver
`referencia-backend/models_plano.py`.

## Comandos

```
npm install
npm run dev         # demo en http://localhost:3001
npm test            # 31 pruebas (geometría + reglas de guardado)
npm run typecheck
npm run lint
npm run build
```

Dependencias: React 19, Tailwind 4, shadcn/ui (estilo radix-nova, tema
neutral), `radix-ui`, `lucide-react`, `sonner`, `cn`. Las mismas versiones que
Gelly.
