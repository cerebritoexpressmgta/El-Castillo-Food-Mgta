class MesaGuardar(BaseModel):
    id: int | None = None
    nombre: str
    forma: str = "rectangular"
    x: float
    y: float
    ancho: float
    alto: float
    rotacion: float = 0
    puestos: int = 4


class DecoracionGuardar(BaseModel):
    tipo: str
    x: float
    y: float
    ancho: float
    alto: float
    rotacion: float = 0
    texto: str = ""


class ZonaGuardar(BaseModel):
    id: int | None = None
    nombre: str
    mesas: list[MesaGuardar] = []
    decoracion: list[DecoracionGuardar] = []


class PlanoGuardar(BaseModel):
    zonas: list[ZonaGuardar]

