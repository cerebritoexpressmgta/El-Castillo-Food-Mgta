// Levanta El Castillo en esta PC para probarlo, SIN tocar la base real:
//   cd plano-de-mesas && npm run probar
//
// - Una base de prueba que imita las llamadas de worker/supabase.mjs a Supabase
//   y guarda el estado en la carpeta temporal del sistema (castillo-prueba-local/).
//   Va FUERA del repo a propósito: wrangler vigila la carpeta del sitio, y un
//   archivo que cambia ahí dentro le hace recargar en cada guardado (cada cambio
//   tardaba 2–6 s en la prueba, cosa que en producción no pasa).
// - El Worker real (npx wrangler dev) apuntando a esa base: SUPABASE_URL se
//   reemplaza siempre por la local, así que el Supabase de producción que
//   aparece en wrangler.jsonc nunca recibe nada.
//
// Entrar: http://127.0.0.1:8787/panel.html con el usuario y la contraseña de
// prueba de abajo. Para empezar de cero: npm run probar -- --de-cero
// Ctrl+C lo apaga todo.
import { spawn, spawnSync } from "node:child_process"
import fs from "node:fs"
import http from "node:http"
import { tmpdir } from "node:os"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, "..")
const CARPETA = resolve(tmpdir(), "castillo-prueba-local")
const ARCHIVO = resolve(CARPETA, "estado.json")
const PUERTO_BASE = 54329
const PUERTO_WEB = 8787

// Valores de prueba, solo para esta PC.
const USUARIO = "admin"
const CLAVE = "prueba-local-1234"
const JWT = "frase-larga-solo-para-pruebas-locales-123"

// ---- La base de prueba --------------------------------------------------------
if (process.argv.includes("--de-cero"))
  fs.rmSync(CARPETA, { recursive: true, force: true })
fs.mkdirSync(CARPETA, { recursive: true })
let fila = null
try {
  if (fs.existsSync(ARCHIVO)) fila = JSON.parse(fs.readFileSync(ARCHIVO, "utf8"))
} catch {
  // Un apagón a mitad de un guardado deja el archivo roto: se empieza de cero.
  console.log("  La base de prueba estaba dañada: se empieza de cero.")
  fila = null
}
// Se escribe a un archivo aparte y luego se renombra: si se corta la luz a
// mitad de camino, queda el estado anterior entero en vez de uno roto.
const guardar = () => {
  fs.writeFileSync(ARCHIVO + ".tmp", JSON.stringify(fila, null, 1))
  fs.renameSync(ARCHIVO + ".tmp", ARCHIVO)
}

const base = http.createServer((req, res) => {
  let cuerpo = ""
  req.on("data", (c) => (cuerpo += c))
  req.on("end", () => {
    const u = new URL(req.url, "http://x")
    const responder = (estado, datos) => {
      res.writeHead(estado, { "Content-Type": "application/json" })
      res.end(datos === undefined ? "" : JSON.stringify(datos))
    }
    // Las imágenes subidas no se guardan: se responde una dirección vacía.
    if (u.pathname.startsWith("/storage/")) return responder(200, {})
    if (!u.pathname.startsWith("/rest/v1/app_state"))
      return responder(404, { msg: "no" })
    const campos = (u.searchParams.get("select") || "").split(",")
    const vista = () =>
      fila ? [Object.fromEntries(campos.map((k) => [k, fila[k] ?? null]))] : []
    if (req.method === "GET") return responder(200, vista())
    if (req.method === "POST") {
      if (!fila) {
        fila = { id: 1, version: 1, evento: null, ...JSON.parse(cuerpo) }
        guardar()
      }
      return responder(201)
    }
    if (req.method === "PATCH") {
      if (!fila) return responder(200, [])
      const version = u.searchParams.get("version")
      if (version && Number(version.replace("eq.", "")) !== fila.version)
        return responder(200, [])
      Object.assign(fila, JSON.parse(cuerpo))
      guardar()
      return responder(200, vista())
    }
    responder(405, {})
  })
})

// Node cierra a los 5 s las conexiones quietas, y el Worker local reutiliza las
// suyas por más tiempo: cuando le toca una ya cerrada, la petición se queda
// colgada unos 4–5 s. Con un plazo largo, la conexión sigue viva. (Supabase no
// tiene ese problema: es solo de esta prueba.)
base.keepAliveTimeout = 10 * 60 * 1000
base.headersTimeout = 10 * 60 * 1000 + 1000

// ---- El Worker ----------------------------------------------------------------
let worker = null
function apagar() {
  if (worker && !worker.killed) {
    // En Windows wrangler deja procesos hijos: se cierra el árbol entero.
    if (process.platform === "win32")
      spawnSync("taskkill", ["/pid", String(worker.pid), "/T", "/F"], {
        stdio: "ignore",
      })
    else worker.kill("SIGINT")
  }
  base.close()
  process.exit(0)
}
process.on("SIGINT", apagar)
process.on("SIGTERM", apagar)

base.listen(PUERTO_BASE, "127.0.0.1", () => {
  // Un solo texto de comando (ningún valor lleva espacios): con `shell: true`
  // Node avisa si se le pasa una lista de argumentos.
  const comando = [
    "npx",
    ...[
      "-y",
      "wrangler@4",
      "dev",
      "--port",
      String(PUERTO_WEB),
      "--ip",
      "127.0.0.1",
      "--var",
      `SUPABASE_URL:http://127.0.0.1:${PUERTO_BASE}`,
      "--var",
      "SUPABASE_SERVICE_KEY:clave-local",
      "--var",
      `JWT_SECRET:${JWT}`,
      "--var",
      `ADMIN_USER:${USUARIO}`,
      "--var",
      `ADMIN_PASSWORD:${CLAVE}`,
      "--var",
      "MAX_SUCURSALES:3",
      "--persist-to",
      JSON.stringify(resolve(CARPETA, "wrangler")),
      "--show-interactive-dev-session=false",
    ],
  ].join(" ")
  worker = spawn(comando, {
    cwd: RAIZ,
    shell: true,
    stdio: ["ignore", "pipe", "inherit"],
  })
  worker.stdout.on("data", (trozo) => {
    const texto = String(trozo)
    if (texto.includes("Ready on")) {
      console.log(`
  El Castillo está corriendo en tu PC (con una base de prueba, no la real).

    Panel:   http://127.0.0.1:${PUERTO_WEB}/panel.html
    Mesas:   http://127.0.0.1:${PUERTO_WEB}/mesas.html
    Editor:  http://127.0.0.1:${PUERTO_WEB}/plano/

    Usuario: ${USUARIO}
    Clave:   ${CLAVE}

  Ctrl+C para apagarlo. Para empezar de cero: npm run probar -- --de-cero
`)
    }
  })
  worker.on("exit", () => apagar())
})
