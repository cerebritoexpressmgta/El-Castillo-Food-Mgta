"""El plano del local: dónde está cada mesa.

El dueño lo dibuja una vez, como lo tiene en la cabeza: arrastra mesas sobre
un lienzo, les pone nombre y puestos, y si quiere marca paredes, la barra o un
rótulo para orientarse. Un local puede tener varios ambientes (salón,
terraza); cada uno es una zona con su propio lienzo.

El plano se guarda ENTERO cada vez: el editor manda todas las zonas con todas
sus mesas y aquí se compara con lo que había. Lo que ya no viene se quita del
plano, pero no se borra: una mesa quitada conserva sus cuentas viejas. Lo
único que no se deja quitar es una mesa con la cuenta abierta.
"""
import json
import math

from fastapi import HTTPException
from sqlalchemy.orm import Session

from sanitizar import texto_de_menu

from .models import Cuenta, Mesa, Zona

# El tamaño del lienzo de cada zona, en unidades propias (no píxeles): la
# pantalla lo escala a lo que mida. El frontend lo recibe de aquí.
LIENZO = {"ancho": 1200, "alto": 800}

FORMAS = ("rectangular", "redonda")
DECORACIONES = ("pared", "area", "texto")

LADO_MINIMO_MESA = 30
LADO_MINIMO_DECORACION = 6
MAX_PUESTOS = 30
MAX_ZONAS = 12
MAX_MESAS_POR_ZONA = 150
MAX_DECORACIONES_POR_ZONA = 80


def _numero(valor, que: str) -> float:
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        numero = math.nan
    if not math.isfinite(numero):
        raise HTTPException(status_code=400, detail=f"{que} del plano no es un número.")
    return numero


def _caja(elemento, lado_minimo: float) -> dict:
    """Posición y tamaño ya dentro del lienzo: nada queda dibujado afuera,
    donde nadie podría volver a agarrarlo."""
    ancho = min(max(_numero(elemento.ancho, "Un ancho"), lado_minimo), LIENZO["ancho"])
    alto = min(max(_numero(elemento.alto, "Un alto"), lado_minimo), LIENZO["alto"])
    x = min(max(_numero(elemento.x, "Una posición"), 0), LIENZO["ancho"] - ancho)
    y = min(max(_numero(elemento.y, "Una posición"), 0), LIENZO["alto"] - alto)
    rotacion = _numero(elemento.rotacion, "Un giro") % 360
    return {"x": round(x, 1), "y": round(y, 1), "ancho": round(ancho, 1), "alto": round(alto, 1), "rotacion": round(rotacion, 1)}


def _decoracion(elementos) -> str:
    if len(elementos) > MAX_DECORACIONES_POR_ZONA:
        raise HTTPException(status_code=400, detail="El plano tiene demasiados elementos decorativos.")
    limpia = []
    for elemento in elementos:
        if elemento.tipo not in DECORACIONES:
            raise HTTPException(status_code=400, detail="El plano trae un elemento que no se reconoce.")
        limpia.append({"tipo": elemento.tipo, **_caja(elemento, LADO_MINIMO_DECORACION), "texto": texto_de_menu(elemento.texto, 30)})
    return json.dumps(limpia, ensure_ascii=False)


def _mesa_dict(mesa: Mesa) -> dict:
    return {
        "id": mesa.id,
        "nombre": mesa.nombre,
        "forma": mesa.forma,
        "x": mesa.x, "y": mesa.y, "ancho": mesa.ancho, "alto": mesa.alto,
        "rotacion": mesa.rotacion,
        "puestos": mesa.puestos,
    }


def leer_plano(db: Session) -> list[dict]:
    zonas = db.query(Zona).filter(Zona.activa.is_(True)).order_by(Zona.orden, Zona.id).all()
    mesas_por_zona: dict[int, list[dict]] = {}
    for mesa in db.query(Mesa).filter(Mesa.activa.is_(True)).order_by(Mesa.id).all():
        mesas_por_zona.setdefault(mesa.zona_id, []).append(_mesa_dict(mesa))

    plano = []
    for zona in zonas:
        try:
            decoracion = json.loads(zona.decoracion_json or "[]")
        except ValueError:
            decoracion = []
        plano.append({
            "id": zona.id,
            "nombre": zona.nombre,
            "decoracion": decoracion if isinstance(decoracion, list) else [],
            "mesas": mesas_por_zona.get(zona.id, []),
        })
    return plano


def guardar_plano(db: Session, zonas) -> None:
    if len(zonas) > MAX_ZONAS:
        raise HTTPException(status_code=400, detail=f"El plano admite hasta {MAX_ZONAS} zonas.")

    zonas_de_antes = {z.id: z for z in db.query(Zona).filter(Zona.activa.is_(True)).all()}
    mesas_de_antes = {m.id: m for m in db.query(Mesa).filter(Mesa.activa.is_(True)).all()}

    # Todo se revisa antes de escribir nada: nombres vacíos o repetidos.
    nombres_de_zona: set[str] = set()
    nombres_de_mesa: set[str] = set()
    for zona in zonas:
        nombre = texto_de_menu(zona.nombre, 30)
        if not nombre:
            raise HTTPException(status_code=400, detail="Cada zona necesita un nombre.")
        if nombre.lower() in nombres_de_zona:
            raise HTTPException(status_code=400, detail=f"Hay dos zonas llamadas «{nombre}».")
        nombres_de_zona.add(nombre.lower())

        if len(zona.mesas) > MAX_MESAS_POR_ZONA:
            raise HTTPException(status_code=400, detail=f"Una zona admite hasta {MAX_MESAS_POR_ZONA} mesas.")
        for mesa in zona.mesas:
            nombre_mesa = texto_de_menu(mesa.nombre, 12)
            if not nombre_mesa:
                raise HTTPException(status_code=400, detail="Cada mesa necesita un nombre o un número.")
            # El nombre es lo que el personal dice en voz alta: no puede haber
            # dos "Mesa 5", ni siquiera en zonas distintas.
            if nombre_mesa.lower() in nombres_de_mesa:
                raise HTTPException(status_code=400, detail=f"Hay dos mesas llamadas «{nombre_mesa}». Cada una necesita un nombre distinto.")
            nombres_de_mesa.add(nombre_mesa.lower())
            if mesa.forma not in FORMAS:
                raise HTTPException(status_code=400, detail="La forma de una mesa no se reconoce.")
            if not 0 <= mesa.puestos <= MAX_PUESTOS:
                raise HTTPException(status_code=400, detail=f"Una mesa admite hasta {MAX_PUESTOS} puestos.")

    # Lo que desaparece del plano no puede estar en uso.
    mesas_que_siguen = {mesa.id for zona in zonas for mesa in zona.mesas if mesa.id}
    quitadas = [mesa for id_mesa, mesa in mesas_de_antes.items() if id_mesa not in mesas_que_siguen]
    if quitadas:
        ocupada = (
            db.query(Mesa.nombre)
            .join(Cuenta, Cuenta.mesa_id == Mesa.id)
            .filter(Cuenta.estado == "abierta", Mesa.id.in_([m.id for m in quitadas]))
            .first()
        )
        if ocupada:
            raise HTTPException(status_code=409, detail=f"La mesa {ocupada[0]} tiene una cuenta abierta. Cóbrala o muévela antes de quitarla del plano.")

    vistas: set[int] = set()
    for orden, datos_zona in enumerate(zonas):
        if datos_zona.id:
            zona = zonas_de_antes.get(datos_zona.id)
            if zona is None:
                raise HTTPException(status_code=409, detail="El plano cambió desde otra pantalla. Recarga antes de guardar.")
        else:
            zona = Zona()
            db.add(zona)
        zona.nombre = texto_de_menu(datos_zona.nombre, 30)
        zona.orden = orden
        zona.decoracion_json = _decoracion(datos_zona.decoracion)
        zona.activa = True
        db.flush()

        for datos in datos_zona.mesas:
            if datos.id:
                mesa = mesas_de_antes.get(datos.id)
                if mesa is None or datos.id in vistas:
                    raise HTTPException(status_code=409, detail="El plano cambió desde otra pantalla. Recarga antes de guardar.")
                vistas.add(datos.id)
            else:
                mesa = Mesa()
                db.add(mesa)
            caja = _caja(datos, LADO_MINIMO_MESA)
            mesa.zona_id = zona.id
            mesa.nombre = texto_de_menu(datos.nombre, 12)
            mesa.forma = datos.forma
            mesa.x, mesa.y, mesa.ancho, mesa.alto = caja["x"], caja["y"], caja["ancho"], caja["alto"]
            mesa.rotacion = caja["rotacion"]
            mesa.puestos = datos.puestos
            mesa.activa = True

    for mesa in quitadas:
        mesa.activa = False
    zonas_que_siguen = {zona.id for zona in zonas if zona.id}
    for id_zona, zona in zonas_de_antes.items():
        if id_zona not in zonas_que_siguen:
            zona.activa = False

    db.commit()


# ==========================================
# Un plano para empezar
# ==========================================

def plano_de_ejemplo(db: Session) -> int:
    """Un salón y una terraza con doce mesas, para que el restaurante de
    demostración no arranque con el lienzo vacío. Solo sobre un local sin plano."""
    if db.query(Zona).count():
        raise ValueError("Este restaurante ya tiene plano.")

    def mesa(zona, nombre, forma, x, y, ancho, alto, puestos, rotacion=0):
        db.add(Mesa(zona_id=zona.id, nombre=nombre, forma=forma, x=x, y=y, ancho=ancho, alto=alto, puestos=puestos, rotacion=rotacion))

    salon = Zona(nombre="Salón", orden=0, decoracion_json=json.dumps([
        {"tipo": "pared", "x": 40, "y": 40, "ancho": 1120, "alto": 10, "rotacion": 0, "texto": ""},
        {"tipo": "pared", "x": 40, "y": 40, "ancho": 10, "alto": 720, "rotacion": 0, "texto": ""},
        {"tipo": "pared", "x": 40, "y": 750, "ancho": 520, "alto": 10, "rotacion": 0, "texto": ""},
        {"tipo": "pared", "x": 700, "y": 750, "ancho": 460, "alto": 10, "rotacion": 0, "texto": ""},
        {"tipo": "pared", "x": 1150, "y": 40, "ancho": 10, "alto": 720, "rotacion": 0, "texto": ""},
        {"tipo": "area", "x": 860, "y": 80, "ancho": 260, "alto": 70, "rotacion": 0, "texto": "Barra"},
        {"tipo": "area", "x": 80, "y": 80, "ancho": 200, "alto": 70, "rotacion": 0, "texto": "Cocina"},
        {"tipo": "texto", "x": 570, "y": 745, "ancho": 120, "alto": 30, "rotacion": 0, "texto": "Entrada"},
    ], ensure_ascii=False))
    terraza = Zona(nombre="Terraza", orden=1, decoracion_json=json.dumps([
        {"tipo": "area", "x": 60, "y": 60, "ancho": 1080, "alto": 60, "rotacion": 0, "texto": "Jardinera"},
    ], ensure_ascii=False))
    db.add_all([salon, terraza])
    db.flush()

    mesa(salon, "1", "rectangular", 120, 230, 90, 90, 4)
    mesa(salon, "2", "rectangular", 320, 230, 90, 90, 4)
    mesa(salon, "3", "rectangular", 520, 230, 90, 90, 4)
    mesa(salon, "4", "redonda", 720, 225, 100, 100, 5)
    mesa(salon, "5", "rectangular", 120, 440, 170, 90, 6)
    mesa(salon, "6", "rectangular", 400, 440, 170, 90, 6)
    mesa(salon, "7", "redonda", 700, 430, 110, 110, 6)
    mesa(salon, "8", "rectangular", 940, 300, 90, 220, 8)
    mesa(salon, "B1", "redonda", 880, 180, 50, 50, 1)
    mesa(salon, "B2", "redonda", 960, 180, 50, 50, 1)
    mesa(salon, "B3", "redonda", 1040, 180, 50, 50, 1)

    mesa(terraza, "T1", "redonda", 160, 260, 100, 100, 4)
    mesa(terraza, "T2", "redonda", 440, 260, 100, 100, 4)
    mesa(terraza, "T3", "redonda", 720, 260, 100, 100, 4)
    mesa(terraza, "T4", "rectangular", 300, 520, 200, 90, 6)
    mesa(terraza, "T5", "rectangular", 680, 520, 200, 90, 6)

    db.commit()
    return db.query(Mesa).count()
