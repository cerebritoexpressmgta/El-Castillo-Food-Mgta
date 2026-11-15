// Pruebas de worker/precio-delivery.mjs: el total de un pedido solo lo escribe el
// servidor; del navegador solo se acepta el precio del delivery.
import { describe, expect, it } from "vitest"

import {
  aplicarPrecioDelivery,
  leerPrecioDelivery,
  lineasConPrecio,
} from "../../../worker/precio-delivery.mjs"

const pedido = (extra = {}) => ({
  total_orden: 10,
  pedido_detallado: "2x Hamburguesa ($5.00)",
  precio_delivery: null,
  ...extra,
})

describe("leerPrecioDelivery", () => {
  it("acepta números y textos con coma o punto", () => {
    expect(leerPrecioDelivery(2)).toBe(2)
    expect(leerPrecioDelivery("2,5")).toBe(2.5)
    expect(leerPrecioDelivery(" 3.456 ")).toBe(3.46)
    expect(leerPrecioDelivery(0)).toBe(0)
  })
  it("rechaza negativos, textos raros y montos absurdos", () => {
    for (const malo of [-1, "-2", "abc", "", null, undefined, Infinity, 10001, "1e9"])
      expect(leerPrecioDelivery(malo)).toBeNull()
  })
})

describe("aplicarPrecioDelivery", () => {
  it("suma la línea y el monto, con el mismo formato que el tablero", () => {
    const p = pedido()
    aplicarPrecioDelivery(p, 2.5)
    expect(p).toMatchObject({
      total_orden: 12.5,
      pedido_detallado: "2x Hamburguesa ($5.00)\n1x Servicio de Delivery ($2.5)",
      precio_delivery: 2.5,
    })
  })

  it("volver a cotizar cambia el precio, no lo suma dos veces", () => {
    const p = pedido()
    aplicarPrecioDelivery(p, 2)
    aplicarPrecioDelivery(p, 3)
    expect(p.total_orden).toBe(13)
    expect(p.pedido_detallado.match(/Servicio de Delivery/g)).toHaveLength(1)
    expect(p.pedido_detallado).toContain("($3)")
  })

  it("respeta un delivery automático puesto al crear el pedido", () => {
    // rutas.mjs crea así los pedidos con delivery automático
    const p = pedido({
      total_orden: 12,
      pedido_detallado: "2x Hamburguesa ($5.00)\n1x Servicio de Delivery ($2)",
      precio_delivery: 2,
    })
    aplicarPrecioDelivery(p, 1.5)
    expect(p.total_orden).toBe(11.5)
    expect(p.pedido_detallado).toBe(
      "2x Hamburguesa ($5.00)\n1x Servicio de Delivery ($1.5)"
    )
  })
})

describe("la línea de delivery solo se reconoce entera", () => {
  it("una nota del cliente que la imita no se toca", () => {
    const p = pedido({
      pedido_detallado: "1x Agua ($1.00) (Nota: 1x Servicio de Delivery ($0))",
      total_orden: 1,
    })
    aplicarPrecioDelivery(p, 2)
    expect(p.pedido_detallado).toBe(
      "1x Agua ($1.00) (Nota: 1x Servicio de Delivery ($0))\n1x Servicio de Delivery ($2)"
    )
    expect(p.total_orden).toBe(3)
  })
})

describe("lineasConPrecio", () => {
  it("lee nombre y precio de cada línea, con o sin nota, y combos con paréntesis", () => {
    const l = lineasConPrecio(
      "2x Hamburguesa ($4.50)\nCarne y queso\n1x Combo Dúo (Rolls: 2x California) ($12.00)\n1x Torta especial ($7.25) (Nota: sin azúcar)\n1x Servicio de Delivery ($2.5)"
    )
    expect(l.get("Hamburguesa")).toBe(4.5)
    expect(l.get("Combo Dúo (Rolls: 2x California)")).toBe(12)
    expect(l.get("Torta especial")).toBe(7.25)
    expect(l.get("Servicio de Delivery")).toBe(2.5)
    expect(l.has("Carne y queso")).toBe(false)
  })
})
