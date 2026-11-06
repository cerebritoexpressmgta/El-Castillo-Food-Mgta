# El Castillo Food Mgta · Cloudflare + Supabase

## 1) Supabase (base de datos)
1. supabase.com → New project (guarda la contraseña de la base).
2. SQL Editor → pega y ejecuta `supabase/schema.sql`.
3. Project Settings → API: copia **Project URL** y la llave **service_role** (secreta; nunca va en el código ni en GitHub).

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
