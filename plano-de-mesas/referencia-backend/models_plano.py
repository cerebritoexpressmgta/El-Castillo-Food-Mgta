class Zona(Base):
    """Un ambiente del local con su propio plano: el salón, la terraza, la barra."""
    __tablename__ = "mesas_zonas"

    id = Column(Integer, primary_key=True)
    nombre = Column(String, nullable=False)
    orden = Column(Integer, nullable=False, default=0)
    # Lo que se dibuja para orientarse y no es una mesa: paredes, la barra, un
    # rótulo. JSON: [{"tipo": "pared", "x", "y", "ancho", "alto", "rotacion", "texto"}].
    decoracion_json = Column(String, nullable=False, default="[]")
    # False = quitada del plano. No se borra: sus mesas tienen cuentas viejas.
    activa = Column(Boolean, nullable=False, default=True)


class Mesa(Base):
    """Una mesa dibujada en el plano. La posición es la esquina de arriba a la
    izquierda, en las unidades del lienzo (router.LIENZO), y gira sobre su centro."""
    __tablename__ = "mesas"

    id = Column(Integer, primary_key=True)
    zona_id = Column(Integer, ForeignKey("mesas_zonas.id"), nullable=False, index=True)
    # Lo que el personal dice en voz alta: "5", "T2", "Barra 1". Único entre las activas.
    nombre = Column(String, nullable=False)
    forma = Column(String, nullable=False, default="rectangular")   # rectangular | redonda
    x = Column(Float, nullable=False, default=0)
    y = Column(Float, nullable=False, default=0)
    ancho = Column(Float, nullable=False, default=80)
    alto = Column(Float, nullable=False, default=80)
    rotacion = Column(Float, nullable=False, default=0)             # grados
    puestos = Column(Integer, nullable=False, default=4)
    # False = quitada del plano. No se borra: sus cuentas viejas la nombran.
    activa = Column(Boolean, nullable=False, default=True)


