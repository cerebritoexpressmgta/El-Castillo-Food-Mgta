// Pruebas de worker/servicio-por-mesa.mjs: quitar y devolver el servicio en
// mesa de una mesa concreta.
import { beforeEach, describe, expect, it } from "vitest"

import {
  devolverServicioAlPedido,
  quitarServicioDelPedido,
  registrarServicioPorMesa,
  servicioQuitado,
} from "../../../worker/servicio-por-mesa.mjs"

class HttpError extends Error {
  constructor(status, detail) {
    super(detail)
    this.status = status
  }
}

let ruta
const eventos = []
registrarServicioPorMesa({
  ruta: (_m, _p, fn) => (ruta = fn),
  HttpError,
  requiereAdmin: (ctx) => {
    if (!ctx.sesion) throw new HttpError(401, "No autenticado")
    if (!["admin", "superadmin"].includes(ctx.sesion.rol))
      throw new HttpError(403, "Requiere privilegios de administrador")
    return ctx.sesion
  },
  sucursalDelPersonal: (ctx) => ctx.sesion?.sucursal_id ?? null,
  mesaEnSucursal: (m, sid) =>
    !sid || !m.sucursal_id || Number(m.sucursal_id) === Number(sid),
  // Igual que rutas.mjs: los pedidos de la ocupación actual, sin cancelados.
  pedidosDeMesa: (db, m) =>
    m.estado === "libre"
      ? []
      : db.pedidos.filter(
          (p) =>
            p.direccion === m.nombre &&
            p.timestamp >= m.ocupada_desde &&
            p.estado !== "Cancelado"
        ),
  configServicioMesa: (db) => db.servicio_mesa,
  ahoraCaracas: () => "2026-11-15T20:00:00",
  emitirTablero: (mensaje) => eventos.push(mensaje),
})

const admin = { sub: "admin", rol: "superadmin" }
const pedidoConServicio = (id, base, extra = {}) => ({
  id,
  direccion: "Mesa 1",
  timestamp: "2026-11-15T19:00:00",
  estado: "En Cocina",
  total_orden: base + Math.round(base * 10) / 100,
  pedido_detallado: `1x Hamburguesa ($${base.toFixed(2)})\n1x Servicio en mesa (10%) ($${(Math.round(base * 10) / 100).toFixed(2)})`,
  servicio_mesa: { pct: 10, monto: Math.round(base * 10) / 100 },
  ...extra,
})

let db
beforeEach(() => {
  db = {
    servicio_mesa: { activo: true, porcentaje: 10 },
    mesas: [
      { id: 1, nombre: "Mesa 1", estado: "ocupada", ocupada_desde: "2026-11-15T18:30:00", sucursal_id: 1 },
      { id: 2, nombre: "Mesa 2", estado: "libre", ocupada_desde: null, sucursal_id: 1 },
    ],
    pedidos: [
      pedidoConServicio(10, 20),
      pedidoConServicio(11, 5.5),
      pedidoConServicio(12, 8, { estado: "Cancelado" }),
      // De una ocupación anterior de la misma mesa: no se toca.
      pedidoConServicio(13, 30, { timestamp: "2026-11-15T12:00:00" }),
    ],
  }
})

const llamar = (sesion, body) => {
  const ctx = { sesion, body, query: {}, tras: [] }
  const r = ruta(ctx, db)
  ctx.tras.forEach((fn) => fn())
  return r
}
const pedido = (id) => db.pedidos.find((p) => p.id === id)

describe("POST /api/mesas/servicio", () => {
  it("quita el servicio de los pedidos de la ocupación actual y marca la mesa", () => {
    const r = llamar(admin, { id: 1, quitar: true })
    expect(r).toEqual({ success: true, servicio_quitado: true, pedidos_cambiados: 2 })
    expect(pedido(10)).toMatchObject({ total_orden: 20, pedido_detallado: "1x Hamburguesa ($20.00)" })
    expect(pedido(10).servicio_mesa).toEqual({ pct: 0, monto: 0, quitado: { pct: 10, por: "admin", en: "2026-11-15T20:00:00" } })
    expect(pedido(11).total_orden).toBe(5.5)
    expect(pedido(12).total_orden).toBe(8.8) // cancelado: no se toca
    expect(pedido(13).total_orden).toBe(33) // otra ocupación: no se toca
    expect(servicioQuitado(db.mesas[0])).toBe(true)
    expect(eventos.at(-1)).toBe("mesas")
  })

  it("devolverlo lo recalcula sobre lo que el pedido vale hoy", () => {
    llamar(admin, { id: 1, quitar: true })
    pedido(10).total_orden = 25 // se editó mientras tanto
    pedido(10).pedido_detallado = "1x Hamburguesa doble ($25.00)"
    const r = llamar(admin, { id: 1, quitar: false })
    expect(r.servicio_quitado).toBe(false)
    expect(pedido(10)).toMatchObject({
      total_orden: 27.5,
      pedido_detallado: "1x Hamburguesa doble ($25.00)\n1x Servicio en mesa (10%) ($2.50)",
      servicio_mesa: { pct: 10, monto: 2.5 },
    })
    expect(pedido(11).total_orden).toBe(6.05)
  })

  it("al devolverlo, también lo suma a los pedidos hechos mientras estaba quitado", () => {
    llamar(admin, { id: 1, quitar: true })
    // Pedido nuevo: rutas.mjs no le sumó el servicio porque la mesa lo tenía quitado.
    db.pedidos.push({ id: 20, direccion: "Mesa 1", timestamp: "2026-11-15T20:30:00", estado: "En Cocina", total_orden: 4.5, pedido_detallado: "1x Agua ($4.50)", servicio_mesa: null })
    llamar(admin, { id: 1, quitar: false })
    expect(pedido(20)).toMatchObject({ total_orden: 4.95, servicio_mesa: { pct: 10, monto: 0.45 } })
    // Uno anterior que nunca tuvo servicio (el panel lo tenía apagado) no se toca.
    db.pedidos.push({ id: 21, direccion: "Mesa 1", timestamp: "2026-11-15T19:30:00", estado: "En Cocina", total_orden: 3, pedido_detallado: "1x Té ($3.00)", servicio_mesa: null })
    llamar(admin, { id: 1, quitar: true })
    llamar(admin, { id: 1, quitar: false })
    expect(pedido(21).total_orden).toBe(3)
  })

  it("la marca deja de valer al liberar la mesa y volver a ocuparla", () => {
    llamar(admin, { id: 1, quitar: true })
    const m = db.mesas[0]
    m.estado = "libre"
    expect(servicioQuitado(m)).toBe(false)
    m.estado = "ocupada"
    m.ocupada_desde = "2026-11-15T21:00:00"
    expect(servicioQuitado(m)).toBe(false)
  })

  it("solo administradores, de su sucursal, y con la mesa en uso", () => {
    expect(() => llamar({ sub: "caja", rol: "cajero" }, { id: 1 })).toThrow(/administrador/)
    expect(() => llamar({ ...admin, sucursal_id: 2 }, { id: 1 })).toThrow(/otra sucursal/)
    expect(() => llamar(admin, { id: 2 })).toThrow(/libre/)
    expect(() => llamar(admin, { id: 99 })).toThrow(/no encontrada/)
    expect(pedido(10).total_orden).toBe(22)
  })
})

describe("quitar y devolver un pedido", () => {
  it("un pedido sin servicio no cambia", () => {
    const p = { total_orden: 10, pedido_detallado: "1x Agua ($10.00)", servicio_mesa: null }
    expect(quitarServicioDelPedido(p, "admin", "x")).toBe(false)
    expect(devolverServicioAlPedido(p)).toBe(false)
    expect(p.total_orden).toBe(10)
  })

  it("quitar dos veces no resta dos veces", () => {
    const p = pedidoConServicio(1, 20)
    quitarServicioDelPedido(p, "admin", "x")
    expect(quitarServicioDelPedido(p, "admin", "x")).toBe(false)
    expect(p.total_orden).toBe(20)
  })
})
