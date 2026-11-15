import { describe, expect, it } from "vitest"

import { planoDeEjemplo } from "./ejemplo"
import { aplicarGuardado, limpiarTexto, PlanoInvalido } from "./guardado"
import { delServidor, LIENZO_POR_DEFECTO, paraGuardar } from "./plano"

const lienzo = LIENZO_POR_DEFECTO

function guardarTal(antes = planoDeEjemplo()) {
  return paraGuardar(delServidor(antes))
}

describe("aplicarGuardado", () => {
  it("guardar sin cambios deja el plano igual", () => {
    const antes = planoDeEjemplo()
    expect(aplicarGuardado(antes, guardarTal(antes), { lienzo })).toEqual(antes)
  })

  it("da ids nuevos a lo nuevo, sin chocar con los que había", () => {
    const antes = planoDeEjemplo()
    const plano = guardarTal(antes)
    plano.zonas.push({ id: null, nombre: "Patio", mesas: [], decoracion: [] })
    plano.zonas[0].mesas.push({
      id: null,
      nombre: "9",
      forma: "redonda",
      x: 0,
      y: 0,
      ancho: 80,
      alto: 80,
      rotacion: 0,
      puestos: 4,
    })
    const despues = aplicarGuardado(antes, plano, { lienzo })
    const ids = [
      ...despues.map((zona) => zona.id),
      ...despues.flatMap((zona) => zona.mesas.map((mesa) => mesa.id)),
    ]
    expect(new Set(ids).size).toBe(ids.length)
    expect(despues[2].nombre).toBe("Patio")
  })

  it("mete en el lienzo lo que quedó afuera y respeta el lado mínimo", () => {
    const antes = planoDeEjemplo()
    const plano = guardarTal(antes)
    Object.assign(plano.zonas[0].mesas[0], {
      x: 5000,
      y: -40,
      ancho: 3,
      rotacion: -45,
    })
    const mesa = aplicarGuardado(antes, plano, { lienzo })[0].mesas[0]
    expect(mesa.ancho).toBe(30)
    expect(mesa.x).toBe(lienzo.ancho - 30)
    expect(mesa.y).toBe(0)
    expect(mesa.rotacion).toBe(315)
  })

  it("no acepta dos mesas con el mismo nombre, aunque estén en zonas distintas", () => {
    const antes = planoDeEjemplo()
    const plano = guardarTal(antes)
    plano.zonas[1].mesas[0].nombre = " 1 "
    expect(() => aplicarGuardado(antes, plano, { lienzo })).toThrow(
      /dos mesas llamadas «1»/
    )
  })

  it("no deja quitar una mesa en uso", () => {
    const antes = planoDeEjemplo()
    const plano = guardarTal(antes)
    const quitada = plano.zonas[0].mesas.shift()!
    try {
      aplicarGuardado(antes, plano, {
        lienzo,
        mesasBloqueadas: [quitada.id!],
      })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(PlanoInvalido)
      expect((error as PlanoInvalido).codigo).toBe(409)
    }
  })

  it("rechaza un id que no existía (el plano cambió en otra pantalla)", () => {
    const antes = planoDeEjemplo()
    const plano = guardarTal(antes)
    plano.zonas[0].mesas[0].id = 999
    expect(() => aplicarGuardado(antes, plano, { lienzo })).toThrow(
      /cambió desde otra pantalla/
    )
  })

  it("rechaza zonas sin nombre y puestos fuera de rango", () => {
    const antes = planoDeEjemplo()
    const sinNombre = guardarTal(antes)
    sinNombre.zonas[0].nombre = "   "
    expect(() => aplicarGuardado(antes, sinNombre, { lienzo })).toThrow(
      /zona necesita un nombre/
    )
    const demasiados = guardarTal(antes)
    demasiados.zonas[0].mesas[0].puestos = 31
    expect(() => aplicarGuardado(antes, demasiados, { lienzo })).toThrow(
      /hasta 30 puestos/
    )
  })
})

describe("limpiarTexto", () => {
  it("quita lo que podría volverse código y deja el apóstrofo legible", () => {
    expect(limpiarTexto(`<b>Pa' "picar"</b>\n`, 30)).toBe("bPa’ picar/b")
  })
  it("corta al largo pedido", () => {
    expect(limpiarTexto("Mesa del fondo a la derecha", 12)).toBe("Mesa del fon")
  })
})
