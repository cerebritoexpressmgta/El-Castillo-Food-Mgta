// Un salón y una terraza con dieciséis mesas, para no arrancar con el lienzo
// vacío. Es el mismo plano que creaba Gelly para el restaurante de demostración
// (backend/modulos/mesas/plano.py: plano_de_ejemplo).
import type { DecoracionGuardada, MesaGuardada, ZonaGuardada } from "./plano"

let siguiente = 0

function mesa(
  nombre: string,
  forma: MesaGuardada["forma"],
  x: number,
  y: number,
  ancho: number,
  alto: number,
  puestos: number,
  rotacion = 0
): MesaGuardada {
  return {
    id: ++siguiente,
    nombre,
    forma,
    x,
    y,
    ancho,
    alto,
    puestos,
    rotacion,
  }
}

function deco(
  tipo: DecoracionGuardada["tipo"],
  x: number,
  y: number,
  ancho: number,
  alto: number,
  texto = ""
): DecoracionGuardada {
  return { tipo, x, y, ancho, alto, rotacion: 0, texto }
}

export function planoDeEjemplo(): ZonaGuardada[] {
  siguiente = 2 // 1 y 2 son las zonas
  return [
    {
      id: 1,
      nombre: "Salón",
      decoracion: [
        deco("pared", 40, 40, 1120, 10),
        deco("pared", 40, 40, 10, 720),
        deco("pared", 40, 750, 520, 10),
        deco("pared", 700, 750, 460, 10),
        deco("pared", 1150, 40, 10, 720),
        deco("area", 860, 80, 260, 70, "Barra"),
        deco("area", 80, 80, 200, 70, "Cocina"),
        deco("texto", 570, 745, 120, 30, "Entrada"),
      ],
      mesas: [
        mesa("1", "rectangular", 120, 230, 90, 90, 4),
        mesa("2", "rectangular", 320, 230, 90, 90, 4),
        mesa("3", "rectangular", 520, 230, 90, 90, 4),
        mesa("4", "redonda", 720, 225, 100, 100, 5),
        mesa("5", "rectangular", 120, 440, 170, 90, 6),
        mesa("6", "rectangular", 400, 440, 170, 90, 6),
        mesa("7", "redonda", 700, 430, 110, 110, 6),
        mesa("8", "rectangular", 940, 300, 90, 220, 8),
        mesa("B1", "redonda", 880, 180, 50, 50, 1),
        mesa("B2", "redonda", 960, 180, 50, 50, 1),
        mesa("B3", "redonda", 1040, 180, 50, 50, 1),
      ],
    },
    {
      id: 2,
      nombre: "Terraza",
      decoracion: [deco("area", 60, 60, 1080, 60, "Jardinera")],
      mesas: [
        mesa("T1", "redonda", 160, 260, 100, 100, 4),
        mesa("T2", "redonda", 440, 260, 100, 100, 4),
        mesa("T3", "redonda", 720, 260, 100, 100, 4),
        mesa("T4", "rectangular", 300, 520, 200, 90, 6),
        mesa("T5", "rectangular", 680, 520, 200, 90, 6),
      ],
    },
  ]
}
