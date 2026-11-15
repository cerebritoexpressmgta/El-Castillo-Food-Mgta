# Referencia: cómo guardaba el plano el backend de Gelly

Copias sin tocar del backend FastAPI de `plataforma-restaurantes` (commit `ce09f79`).
No se ejecutan aquí: dependen de la base de datos, la sesión y `sanitizar.py` de Gelly.
Sirven de guía al montar el guardado en el proyecto nuevo.

- `plano.py` — `leer_plano`, `guardar_plano` (las reglas) y `plano_de_ejemplo`. Es `backend/modulos/mesas/plano.py`.
- `models_plano.py` — las tablas `mesas_zonas` y `mesas` (de `backend/modulos/mesas/models.py`).
- `esquemas.py` — lo que recibía `POST /api/mesas/plano/guardar` (de `backend/modulos/mesas/router.py`).

El endpoint era solo para administradores y respondía `{ "success": true, "zonas": leer_plano(db) }`.
La versión en TypeScript de las mismas reglas está en `src/plano/guardado.ts`.
