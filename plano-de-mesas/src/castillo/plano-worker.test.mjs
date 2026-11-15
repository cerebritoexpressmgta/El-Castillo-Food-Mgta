// Pruebas de worker/plano.mjs (el guardado del plano en el Worker de El
// Castillo). Se le dan las mismas piezas que le pasa worker/rutas.mjs, en
// versión mínima, y una base en memoria.
import { beforeEach, describe, expect, it } from "vitest"

import { registrarPlano } from "../../../worker/plano.mjs"

class HttpError extends Error {
  constructor(status, detail) {
    super(detail)
    this.status = status
    this.detail = detail
  }
}

const rutas = {}
const eventos = []
registrarPlano({
  ruta: (metodo, path, fn) => (rutas[`${metodo} ${path}`] = fn),
  ok: (extra) => ({ success: true, ...extra }),
  HttpError,
  requiereStaff: (ctx) => {
    if (!ctx.sesion) throw new HttpError(401, "No autenticado")
    return ctx.sesion
  },
  requiereAdmin: (ctx) => {
    if (!ctx.sesion) throw new HttpError(401, "No autenticado")
    if (!["admin", "superadmin"].includes(ctx.sesion.rol))
      throw new HttpError(403, "Requiere privilegios de administrador")
    return ctx.sesion
  },
  limpiarTexto: (v, largo) =>
    String(v ?? "")
      .replace(/[<>]/g, "")
      .replace(/[\r\n]/g, " ")
      .trim()
      .slice(0, largo),
  siguienteId: (db, tabla) => (db.seq[tabla] = (db.seq[tabla] || 0) + 1),
  sucursalDelPersonal: (ctx, db) => {
    const u = db.usuarios.find((x) => x.username === ctx.sesion?.sub)
    return u?.sucursal_id ? Number(u.sucursal_id) : null
  },
  idSucursalValido: (db, v) => {
    const n = parseInt(v, 10)
    return n && db.sucursales.some((s) => s.id === n) ? n : null
  },
  sucursalesActivas: (db) => db.sucursales.filter((s) => s.activa !== false),
  esEntregaMesa: (tipo) => String(tipo || "").toLowerCase().includes("mesa"),
  emitirTablero: (mensaje, sucursal) => eventos.push({ mensaje, sucursal }),
})

const admin = { sub: "admin", rol: "superadmin" }
const cajero = { sub: "cajero", rol: "cajero" }

let db
beforeEach(() => {
  db = {
    seq: { mesas: 4 },
    sucursales: [
      { id: 1, nombre: "Centro", activa: true },
      { id: 2, nombre: "Playa", activa: true },
    ],
    usuarios: [
      { username: "admin" },
      { username: "cajero" },
      { username: "playa", sucursal_id: 2 },
    ],
    mesas: [
      { id: 1, nombre: "Mesa 1", zona: "Salón", capacidad: 4, estado: "libre", sucursal_id: 1 },
      { id: 2, nombre: "Mesa 2", zona: "Salón", capacidad: 6, estado: "ocupada", ocupada_desde: "2026-11-14T12:00:00", sucursal_id: 1 },
      { id: 3, nombre: "Mesa 3", zona: "Terraza", capacidad: 2, estado: "libre", sucursal_id: 1 },
      { id: 4, nombre: "Mesa 1", zona: "Salón", capacidad: 4, estado: "libre", sucursal_id: 2 },
    ],
    pedidos: [
      { id: 10, tipo_entrega: "Comer en mesa", direccion: "Mesa 2", sucursal_id: 1 },
    ],
  }
})

const leer = (sesion, query = {}) =>
  rutas["GET /api/mesas/plano"]({ sesion, query, body: {}, tras: [] }, db)

function guardar(sesion, body) {
  const ctx = { sesion, query: {}, body, tras: [] }
  const r = rutas["POST /api/mesas/plano/guardar"](ctx, db)
  ctx.tras.forEach((fn) => fn())
  return r
}

/** Lo que mandaría el editor sin tocar nada. */
const sinCambios = (plano) => ({
  sucursal_id: plano.sucursal_id,
  zonas: plano.zonas.map((z) => ({
    id: z.id,
    nombre: z.nombre,
    decoracion: z.decoracion,
    mesas: z.mesas.map((m) => ({ ...m })),
  })),
})

describe("GET /api/mesas/plano", () => {
  it("agrupa por zona y propone sitio a las mesas sin dibujar, sin pisarse", () => {
    const plano = leer(admin, { sucursal: "1" })
    expect(plano.zonas.map((z) => z.nombre)).toEqual(["Salón", "Terraza"])
    const [m1, m2] = plano.zonas[0].mesas
    expect(m2.ancho).toBe(170) // más de 4 puestos: mesa larga
    expect(m1.x + m1.ancho).toBeLessThan(m2.x)
    expect(plano.bloqueadas).toEqual([2])
    expect(plano.sucursales.map((s) => s.id)).toEqual([1, 2])
  })

  it("un empleado de una sucursal solo ve la suya, sin selector", () => {
    const plano = leer({ sub: "playa", rol: "admin" }, { sucursal: "1" })
    expect(plano.sucursal_id).toBe(2)
    expect(plano.sucursales).toEqual([])
    expect(plano.zonas[0].mesas.map((m) => m.id)).toEqual([4])
  })

  it("las mesas sin sucursal salen en la pantalla de Mesas de cada sucursal, no en su editor", () => {
    db.mesas.push({ id: 5, nombre: "Barra", zona: "Barra", capacidad: 2, estado: "ocupada", sucursal_id: null })
    const ids = (plano) => plano.zonas.flatMap((z) => z.mesas.map((m) => m.id))
    expect(ids(leer({ sub: "playa", rol: "cajero" }, { vista: "1" }))).toEqual([4, 5])
    expect(ids(leer(admin, { sucursal: "2" }))).toEqual([4])
    expect(ids(leer(admin, { sucursal: "0" }))).toEqual([5])
    expect(leer(admin, { sucursal: "1" }).sucursales.map((s) => s.id)).toEqual([0, 1, 2])
  })

  it("pide sesión", () => {
    expect(() => leer(null)).toThrow("No autenticado")
  })
})

describe("POST /api/mesas/plano/guardar", () => {
  it("guarda posiciones, renombra (con sus pedidos), crea y quita mesas", () => {
    const cuerpo = sinCambios(leer(admin, { sucursal: "1" }))
    const [salon, terraza] = cuerpo.zonas
    Object.assign(salon.mesas[1], { nombre: "Mesa 20", x: 5000, rotacion: -90 })
    salon.mesas.push({ id: null, nombre: "Mesa 5", forma: "redonda", x: 10, y: 10, ancho: 100, alto: 100, rotacion: 0, puestos: 3 })
    salon.decoracion = [{ tipo: "pared", x: 0, y: 0, ancho: 300, alto: 10, rotacion: 0, texto: "" }]
    terraza.nombre = "Patio"
    terraza.mesas = []

    expect(guardar(admin, cuerpo)).toEqual({ success: true })

    const m2 = db.mesas.find((m) => m.id === 2)
    expect(m2).toMatchObject({ nombre: "Mesa 20", estado: "ocupada" })
    expect(m2.plano).toMatchObject({ x: 1200 - 170, rotacion: 270 })
    expect(db.pedidos[0].direccion).toBe("Mesa 20")
    expect(db.mesas.find((m) => m.nombre === "Mesa 5")).toMatchObject({ id: 5, sucursal_id: 1, capacidad: 3, estado: "libre", zona: "Salón" })
    expect(db.mesas.some((m) => m.id === 3)).toBe(false)
    expect(db.mesas.find((m) => m.id === 4).nombre).toBe("Mesa 1") // la otra sucursal no se toca
    expect(db.plano_zonas).toEqual([
      { sucursal_id: 1, nombre: "Salón", orden: 0, decoracion: salon.decoracion },
      { sucursal_id: 1, nombre: "Patio", orden: 1, decoracion: [] },
    ])
    expect(eventos.at(-1)).toEqual({ mensaje: "mesas", sucursal: 1 })

    // Lo guardado se lee igual, con la decoración en su zona.
    const otraVez = leer(admin, { sucursal: "1" })
    expect(otraVez.zonas.map((z) => z.nombre)).toEqual(["Salón", "Patio"])
    expect(otraVez.zonas[0].decoracion).toHaveLength(1)
  })

  it("intercambiar dos nombres no mezcla sus pedidos", () => {
    db.pedidos.push({ id: 11, tipo_entrega: "Comer en mesa", direccion: "Mesa 1", sucursal_id: 1 })
    const cuerpo = sinCambios(leer(admin, { sucursal: "1" }))
    const [m1, m2] = cuerpo.zonas[0].mesas
    m1.nombre = "Mesa 2"
    m2.nombre = "Mesa 1"
    guardar(admin, cuerpo)
    expect(db.pedidos.find((p) => p.id === 10).direccion).toBe("Mesa 1") // era de la Mesa 2 (id 2)
    expect(db.pedidos.find((p) => p.id === 11).direccion).toBe("Mesa 2") // era de la Mesa 1 (id 1)
    expect(db.mesas.find((m) => m.id === 2).nombre).toBe("Mesa 1")
  })

  it("no deja quitar una mesa en uso", () => {
    const cuerpo = sinCambios(leer(admin, { sucursal: "1" }))
    cuerpo.zonas[0].mesas = cuerpo.zonas[0].mesas.filter((m) => m.id !== 2)
    expect(() => guardar(admin, cuerpo)).toThrow(/Mesa 2 está en uso/)
    expect(db.mesas).toHaveLength(4)
  })

  it("rechaza nombres repetidos, puestos fuera de rango y mesas de otra sucursal", () => {
    const base = () => sinCambios(leer(admin, { sucursal: "1" }))
    const repetido = base()
    repetido.zonas[1].mesas[0].nombre = "mesa 1"
    expect(() => guardar(admin, repetido)).toThrow(/dos mesas llamadas/)

    const sinPuestos = base()
    sinPuestos.zonas[0].mesas[0].puestos = 0
    expect(() => guardar(admin, sinPuestos)).toThrow(/de 1 a 30 puestos/)

    const ajena = base()
    ajena.zonas[0].mesas[0].id = 4 // es de la sucursal 2
    try {
      guardar(admin, ajena)
      expect.unreachable()
    } catch (e) {
      expect(e.status).toBe(409)
    }
  })

  it("solo un administrador guarda", () => {
    const cuerpo = sinCambios(leer(cajero, { sucursal: "1" }))
    expect(() => guardar(cajero, cuerpo)).toThrow(/administrador/)
  })
})
