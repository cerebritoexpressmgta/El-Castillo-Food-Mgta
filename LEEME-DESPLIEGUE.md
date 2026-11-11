# El Castillo Food Mgta · Cloudflare + Supabase

## 1) Supabase (base de datos)
1. supabase.com → New project (guarda la contraseña de la base).
2. SQL Editor → pega y ejecuta `supabase/schema.sql`.
3. Project Settings → API: copia **Project URL** y la llave **secret** (sb_secret_...) o la service_role (secreta; nunca va en el código ni en GitHub).

## 2) GitHub
Reemplaza el contenido del repositorio por esta carpeta (los archivos deben quedar en la raíz, junto a `wrangler.jsonc`).

## 3) Cloudflare (tu Worker `el-castillo-food-mgta`)
Workers & Pages → el-castillo-food-mgta → **Settings → Variables and Secrets** → agrega, todas como **Secret**:

| Nombre | Valor |
|---|---|
| `SUPABASE_URL` | la Project URL (https://xxxx.supabase.co) |
| `SUPABASE_SERVICE_KEY` | la llave service_role |
| `JWT_SECRET` | una frase larga al azar (30+ caracteres) |
| `ADMIN_PASSWORD` | la contraseña que tendrás como administrador (8+ caracteres) |

Opcional: `ADMIN_USER` (por defecto `admin`) y `ADMIN_NAME`.
Luego **Deployments → Retry deployment** (o haz un commit) para que tome los secretos.

## 4) Primer uso
1. Abre `https://TU-DIRECCION/api/salud` → debe responder `{"status":"ok","base_de_datos":"supabase"}`.
2. Abre `https://TU-DIRECCION/panel.html` → entra con `admin` y tu `ADMIN_PASSWORD`.
   La primera vez se crea la base con el menú de ejemplo; lo cambias en **Configurar menú y negocio**.
3. Después del primer ingreso puedes cambiar la contraseña desde el mismo panel (sección Mi cuenta).
4. En el panel, sección **Datos de la web** y **Sucursales**: escribe el nombre, la frase, WhatsApp, Instagram y tus sucursales (dirección, teléfono, horario, enlace de Google Maps). Se ven al instante en la web.
   También en el panel: **Galería de fotos** (sube hasta 12), **Reseñas de clientes** y **coordenadas** de cada sucursal para el mapa. La galería y las reseñas no aparecen en la web hasta que agregues contenido.
5. A tus clientes dales solo la dirección principal: `https://TU-DIRECCION/` (web con menú, platos y sucursales; el botón "Pedir ahora" lleva a `/menu.html`). QR por mesa: `/menu.html?mesa=Mesa 3`.

## Cómo está organizado
- `/` → web pública del negocio (menú, platos, sucursales, contacto)
- `/menu.html` → donde el cliente hace su pedido
- `/panel.html` → entrada del administrador (con contraseña); desde ahí se abren Cocina (`/cocina.html`), Mesas, Tomar pedido, Estadísticas y Configurar menú y negocio (`/admin.html`)

## Solicitud diaria a Supabase
El Worker tiene un Cron (`wrangler.jsonc`) que cada día a las 12:00 UTC toca la base para que Supabase no pause el proyecto.
Revisa en el Worker → **Settings → Trigger Events** que aparezca el cron, y en **Logs** el mensaje `Ping diario a Supabase OK`.

## Apariencia
En `/panel.html` → **Apariencia**: elige una combinación lista o tus propios colores (principal, acento, portada), sube un logo y/o una imagen de portada. Se aplica a la web pública y al menú donde piden los clientes. Las pantallas internas (cocina, mesas, administración) mantienen su estilo.

## App instalable (PWA) e íconos
- Íconos y favicon salen del escudo de El Castillo (`favicon.ico` e `icons/`).
- **Clientes:** en la web `/` aparece el botón "Instalar app" (Android/PC); en iPhone se muestra la guía "Compartir → Añadir a pantalla de inicio".
- **Personal:** abre `/panel.html` e instala desde ahí: queda como otra app, "Castillo Staff", con accesos directos a Cocina, Mesas, Tomar pedido y Estadísticas.
- Sin internet solo abren las páginas ya visitadas; los pedidos y el menú siempre se leen en vivo (nunca se guardan en el teléfono).
- Si cambias archivos de la web y quieres forzar que todos los teléfonos renueven su copia, cambia `VERSION` al inicio de `sw.js` (por ejemplo a `v2`).
- Para usar el escudo como logo en la web: panel → Apariencia → Logo → sube `icons/icon-512.png`.

## Varias sucursales
1. Panel → **Sucursales**: agrega cada una con su dirección, teléfono, horario y **su propio WhatsApp** (con código de país).
2. Panel → **Configurar menú y negocio**:
   - **Mesas**: elige a qué sucursal pertenece cada mesa (el mismo nombre, "Mesa 1", puede repetirse en sucursales distintas). El enlace 🔗 del QR ya incluye la sucursal.
   - **Usuarios**: en cada cajero elige su sucursal. Ese empleado solo ve los pedidos y mesas de la suya. Los administradores ven todas y filtran desde un selector.
   - **Productos y combos**: marca **No disponible en** las sucursales donde no se vende. Ahí no aparece en el menú y el servidor no acepta pedirlo.
3. El cliente elige la sucursal al pedir (o entra por el enlace/QR `menu.html?sucursal=ID`). Al terminar, un botón verde le abre WhatsApp con su pedido ya escrito hacia el número de esa sucursal.
4. Cocina, Mesas y Estadísticas: el dueño ve todo y filtra por sucursal; cada empleado ve la suya.
- Los horarios de atención y el WhatsApp general de la web siguen siendo únicos para todo el negocio.

## Plan: cuántas sucursales tiene el negocio (lo controlas tú)
Cada negocio **empieza sin sucursales**. Cuando contrate más, tú subes el número con la variable **`MAX_SUCURSALES`** del Worker, que solo ve quien administra la cuenta de Cloudflare (el cliente no la ve ni la cambia desde el panel). Es el total de locales, contando el principal:

| Valor | Qué pasa |
|---|---|
| sin configurar o `1` | **Sin sucursales** (valor por defecto): desaparece todo lo de sucursales (selector al pedir, filtros, campos por sucursal). La web muestra una sección "Dónde estamos" con el local (y se oculta sola si no tiene dirección ni teléfono). |
| `2` | **Principal + 1 sucursal.** |
| `3`, `4`, `5`... | Hasta ese número de locales. El panel muestra "En uso: X" y bloquea "Agregar sucursal" al llegar al límite. |

Cómo cambiarlo: Cloudflare → Worker → Settings → Variables and Secrets → Agregar variable `MAX_SUCURSALES` con el número (ej. `3`) → desplegar. Con `keep_vars` activo no se borra en los despliegues.
- El límite se valida en el servidor, no solo en pantalla.
- Si bajas el plan (ej. de 5 a 2), las sucursales de más no se borran: quedan "fuera de plan" (visibles solo para el dueño, sin pedidos ni web) y se reactivan si subes el límite otra vez.
- Esto protege tu plan mientras el cliente no tenga acceso a tu Cloudflare ni a tu GitHub. Quien controle esos dos puede cambiar el valor.

## Seguridad de cuentas y recuperación (opcional)
**Recuperar la contraseña del dueño/administrador:** en Cloudflare → Worker → Settings → Variables and Secrets agrega el secreto **`CLAVE_RECUPERACION`** (una frase larga, mínimo 12 caracteres; guárdala en un lugar seguro, p. ej. impresa) y vuelve a desplegar. Si algún día olvidas tu contraseña: en la pantalla de entrada toca **¿Olvidaste tu contraseña?**, escribe tu usuario, esa clave y la contraseña nueva. Esto también quita el 2FA y los dispositivos de esa cuenta (útil si perdiste el teléfono). Sin ese secreto, la opción responde que no está configurada.

**Cajeros y trabajadores que olvidaron su clave:** un administrador entra a **Administración → Usuarios** y toca 🔑 junto al nombre. El sistema genera una clave temporal (se muestra una sola vez); al entrar con ella, la persona debe crear su contraseña nueva.

**Perdió el teléfono (2FA/huella):** en **Administración → Usuarios** aparece 🔓 junto a quien tenga 2FA activo; quita el 2FA y los dispositivos para que pueda entrar con su contraseña y volver a activarlo.

**2FA con app (Google Authenticator, Authy, Microsoft Authenticator…):** cada persona lo activa si quiere desde el botón 🔐 (abajo a la izquierda de cada pantalla, o en Panel → Mi cuenta → Mi seguridad). Escanea el QR, escribe el código de 6 dígitos y guarda los 8 códigos de respaldo (sirven una vez cada uno).

**Huella / rostro:** también desde 🔐 → "Huella o rostro" → Agregar este dispositivo. Se registra por dispositivo y funciona solo con https y en el mismo dominio con el que se registró (si cambias de dominio, hay que registrarla de nuevo). Es una verificación extra después de la contraseña: la huella o el rostro nunca salen del teléfono/computador.

Si una persona activa 2FA con app y huella, al entrar puede usar cualquiera de las dos.

## Páginas legales
`privacidad.html` (Política de privacidad) y `terminos.html` (Términos de uso) se enlazan en el pie de la web y del menú, y quien se registra para pedir debe marcar que las acepta. El nombre del negocio, el correo y el WhatsApp se toman solos de **Panel → Datos de la web**. Son textos base: revísalos (idealmente con un abogado) y ajusta políticas como cancelaciones, tiempos de entrega o devoluciones a cómo trabaja tu negocio.
