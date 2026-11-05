# Publicar El Castillo Food Mgta en Cloudflare Pages

Es un sitio estático: no necesita build, base de datos ni servidor.

## Opción A: subir la carpeta (la más rápida)
1. Cloudflare → Workers & Pages → Create → Pages → **Upload assets**.
2. Ponle nombre al proyecto (ej. `el-castillo`) y sube el contenido de esta carpeta.
3. Tu demo queda en `https://el-castillo.pages.dev/inicio.html`.

## Opción B: con GitHub
Sube la carpeta a un repositorio, conéctalo en Pages, deja el build command vacío y el output directory en `/`.

## Páginas para mostrar
- `/inicio.html`  → web de presentación con la demo en vivo
- `/menu.html`    → lo que ve el cliente (QR por mesa: `/menu.html?mesa=Mesa 3`)
- `/index.html`   → cocina · `/mesas.html` → mesas · `/admin.html` → administración
- Usuarios de prueba: admin / 1234, cajero / 1234

## Importante
Los datos viven en el navegador de cada visitante (localStorage). Para que el celular y la cocina se vean entre sí, ábrelos en el mismo navegador/dispositivo, o usa `inicio.html`, que ya los muestra juntos.
