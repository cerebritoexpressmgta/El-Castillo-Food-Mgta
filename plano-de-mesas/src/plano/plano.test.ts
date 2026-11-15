import { describe, expect, it } from "vitest"

import {
  ajustar,
  delServidor,
  dentroDelLienzo,
  estirar,
  hayCambios,
  mover,
  nombreRepetido,
  nuevaMesa,
  paraGuardar,
  redimensionar,
  siguienteNombre,
  sillas,
  zonaNueva,
  type Zona,
} from "./plano"

const LIENZO = { ancho: 1200, alto: 800 }
const caja = (x: number, y: number, ancho = 80, alto = 80) => ({
  x,
  y,
  ancho,
  alto,
})

describe("la cuadrícula y los bordes", () => {
  it("ajusta al múltiplo más cercano", () => {
    expect(ajustar(104)).toBe(100)
    expect(ajustar(105)).toBe(110)
    expect(ajustar(-3)).toBe(-0)
    expect(ajustar(7, 2)).toBe(8)
  })

  it("lo que se arrastra no se sale del lienzo", () => {
    expect(mover(caja(0, 0), -50, 900, LIENZO)).toMatchObject({ x: 0, y: 720 })
    expect(mover(caja(0, 0), 5000, 203, LIENZO)).toMatchObject({
      x: 1120,
      y: 200,
    })
  })

  it("una caja más grande que el lienzo se recorta a su tamaño", () => {
    expect(dentroDelLienzo(caja(100, 100, 5000, 30), LIENZO)).toEqual(
      caja(0, 100, 1200, 30)
    )
  })

  it("al estirar, la esquina de arriba no se mueve y hay un mínimo", () => {
    const mesa = caja(1000, 700)
    expect(redimensionar(mesa, 5, 5, LIENZO, 30)).toEqual(
      caja(1000, 700, 30, 30)
    )
    // No puede crecer más allá del borde.
    expect(redimensionar(mesa, 900, 900, LIENZO, 30)).toEqual(
      caja(1000, 700, 200, 100)
    )
    expect(redimensionar(mesa, 133, 87, LIENZO, 30)).toEqual(
      caja(1000, 700, 130, 90)
    )
  })

  it("una pared fina se estira en pasos pequeños", () => {
    expect(redimensionar(caja(0, 0, 300, 10), 300, 13, LIENZO, 6)).toEqual(
      caja(0, 0, 300, 12)
    )
  })
})

describe("estirar una pieza girada", () => {
  const esquinaVisible = (c: {
    x: number
    y: number
    ancho: number
    alto: number
    rotacion: number
  }) => {
    const giro = (c.rotacion * Math.PI) / 180
    return {
      x:
        c.x +
        c.ancho / 2 -
        (c.ancho / 2) * Math.cos(giro) +
        (c.alto / 2) * Math.sin(giro),
      y:
        c.y +
        c.alto / 2 -
        (c.ancho / 2) * Math.sin(giro) -
        (c.alto / 2) * Math.cos(giro),
    }
  }

  it("sin giro es estirar de la esquina, sin más", () => {
    const mesa = { ...caja(100, 100), rotacion: 0 }
    expect(estirar(mesa, 42, -13, LIENZO, 30)).toEqual({
      ...caja(100, 100, 120, 70),
      rotacion: 0,
    })
  })

  it("girada 90°, mover el cursor hacia abajo la alarga", () => {
    const mesa = { ...caja(400, 300, 100, 60), rotacion: 90 }
    const estirada = estirar(mesa, 0, 40, LIENZO, 30)
    expect(estirada.ancho).toBe(140)
    expect(estirada.alto).toBe(60)
  })

  it("la esquina de la que no se tira se queda donde se ve", () => {
    for (const rotacion of [45, 90, 135, 270]) {
      const mesa = { ...caja(400, 300, 100, 60), rotacion }
      const estirada = estirar(mesa, 30, 50, LIENZO, 30)
      const antes = esquinaVisible(mesa)
      const despues = esquinaVisible(estirada)
      expect(despues.x).toBeCloseTo(antes.x, 0)
      expect(despues.y).toBeCloseTo(antes.y, 0)
    }
  })
})

describe("las sillas", () => {
  const porLado = (ancho: number, alto: number, puestos: number) => {
    const todas = sillas("rectangular", ancho, alto, puestos)
    return {
      arriba: todas.filter((silla) => silla.angulo === 0).length,
      abajo: todas.filter((silla) => silla.angulo === 180).length,
      izquierda: todas.filter((silla) => silla.angulo === 270).length,
      derecha: todas.filter((silla) => silla.angulo === 90).length,
    }
  }

  it("sin puestos no hay sillas", () => {
    expect(sillas("rectangular", 90, 90, 0)).toEqual([])
    expect(sillas("redonda", 90, 90, -2)).toEqual([])
  })

  it("una mesa cuadrada de 4 tiene una por lado", () => {
    expect(porLado(90, 90, 4)).toEqual({
      arriba: 1,
      abajo: 1,
      izquierda: 1,
      derecha: 1,
    })
  })

  it("una mesa larga llena primero los lados largos", () => {
    expect(porLado(170, 90, 4)).toEqual({
      arriba: 2,
      abajo: 2,
      izquierda: 0,
      derecha: 0,
    })
    expect(porLado(170, 90, 6)).toEqual({
      arriba: 2,
      abajo: 2,
      izquierda: 1,
      derecha: 1,
    })
  })

  it("si la mesa está de pie, los lados largos son los de los costados", () => {
    expect(porLado(90, 220, 8)).toEqual({
      arriba: 1,
      abajo: 1,
      izquierda: 3,
      derecha: 3,
    })
  })

  it("se reparten parejas a lo largo del lado, por fuera de la mesa", () => {
    const arriba = sillas("rectangular", 200, 90, 4).filter(
      (silla) => silla.angulo === 0
    )
    expect(arriba.map((silla) => silla.x)).toEqual([50, 150])
    expect(arriba.every((silla) => silla.y < 0)).toBe(true)
  })

  it("en una mesa redonda van en círculo, la primera arriba", () => {
    const todas = sillas("redonda", 100, 100, 4)
    expect(todas).toHaveLength(4)
    expect(todas[0].x).toBeCloseTo(50)
    expect(todas[0].y).toBeCloseTo(-10)
    expect(todas[1].x).toBeCloseTo(110)
    expect(todas[1].y).toBeCloseTo(50)
    expect(todas.map((silla) => silla.angulo)).toEqual([0, 90, 180, 270])
  })

  it("no dibuja más sillas que el máximo de puestos", () => {
    expect(sillas("redonda", 100, 100, 999)).toHaveLength(30)
  })
})

describe("los nombres de las mesas", () => {
  it("el siguiente es el primer número libre", () => {
    expect(siguienteNombre([])).toBe("1")
    expect(siguienteNombre(["1", "2", "3"])).toBe("4")
    expect(siguienteNombre(["1", "2", "4", "T1"])).toBe("3")
    expect(siguienteNombre([" 1 "])).toBe("2")
  })

  it("con prefijo sigue la numeración del local, sin distinguir mayúsculas", () => {
    expect(siguienteNombre([], "Mesa ")).toBe("Mesa 1")
    expect(siguienteNombre(["Mesa 1", "mesa 2", "Mesa 4"], "Mesa ")).toBe(
      "Mesa 3"
    )
    expect(siguienteNombre(["1", "2"], "Mesa ")).toBe("Mesa 1")
  })

  const zona = (...nombres: string[]): Zona => ({
    ...zonaNueva("Salón"),
    mesas: nombres.map((nombre) => ({
      id: null,
      clave: nombre,
      nombre,
      forma: "rectangular",
      ...caja(0, 0),
      rotacion: 0,
      puestos: 4,
    })),
  })

  it("avisa de un nombre repetido, también entre zonas y sin mirar mayúsculas", () => {
    expect(nombreRepetido([zona("1", "2")])).toBeNull()
    expect(nombreRepetido([zona("1", "T1"), zona("t1")])).toBe("t1")
    // Una mesa todavía sin nombre no es "repetida": ese es otro aviso.
    expect(nombreRepetido([zona("", "")])).toBeNull()
  })

  it("una mesa nueva toma el siguiente número de todo el local", () => {
    const salon = zona("1", "2")
    const terraza = zona("3")
    const nueva = nuevaMesa("redonda", terraza, [salon, terraza], LIENZO)
    expect(nueva.nombre).toBe("4")
    expect(nueva.forma).toBe("redonda")
    expect(nueva.id).toBeNull()
  })

  it("dos mesas nuevas seguidas no caen una encima de la otra", () => {
    const salon = zona()
    const primera = nuevaMesa("cuadrada", salon, [salon], LIENZO)
    salon.mesas.push(primera)
    const segunda = nuevaMesa("cuadrada", salon, [salon], LIENZO)
    expect([segunda.x, segunda.y]).not.toEqual([primera.x, primera.y])
  })
})

describe("guardar el plano", () => {
  const guardado = [
    {
      id: 7,
      nombre: "Salón",
      mesas: [
        {
          id: 3,
          nombre: "1",
          forma: "redonda" as const,
          ...caja(100, 100),
          rotacion: 0,
          puestos: 4,
        },
      ],
      decoracion: [
        {
          tipo: "area" as const,
          ...caja(0, 0, 200, 60),
          rotacion: 0,
          texto: "Barra",
        },
      ],
    },
  ]

  it("lo que llega del servidor vuelve igual, sin las claves del editor", () => {
    expect(paraGuardar(delServidor(guardado))).toEqual({ zonas: guardado })
  })

  it("recorta los espacios de los nombres", () => {
    const zonas = delServidor(guardado)
    zonas[0].nombre = "  Salón  "
    zonas[0].mesas[0].nombre = " 1 "
    expect(paraGuardar(zonas)).toEqual({ zonas: guardado })
  })

  it("sabe si hay algo sin guardar", () => {
    const antes = delServidor(guardado)
    const igual = delServidor(guardado)
    expect(hayCambios(antes, igual)).toBe(false)

    igual[0].mesas[0].x = 110
    expect(hayCambios(antes, igual)).toBe(true)
  })
})
