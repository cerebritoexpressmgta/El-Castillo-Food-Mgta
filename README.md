# Demo de sistema de pedidos para restaurantes

App de pedidos (cliente, caja, cocina, **mesas**, administración y estadísticas) con **datos inventados y sin servidor**, más una **web de presentación** que la muestra funcionando dentro de la página.

## Qué abrir
| Archivo | Para qué |
|---|---|
| `inicio.html` | Tu web comercial con la demo en vivo adentro (celular del cliente + paneles) |
| `embed.html` | Solo el visor de la demo, para incrustarlo en tu propia web con un `<iframe>` |
| `menu.html` | Lo que ve el cliente (acepta `?mesa=Mesa 3`, el enlace del QR de cada mesa) |
| `index.html` | Tablero de cocina (personal) |
| `menu_trabajadores.html` | Caja: tomar pedidos, también para una mesa |
| `mesas.html` | Plano de mesas: estado, cuenta y cobro |
| `admin.html` | Administración (menú, combos, **mesas**, horarios, usuarios, mensajes, anuncios) |
| `estadisticas.html` | Ventas y búsqueda de clientes |

## Personalizar (un solo archivo: `demo-config.js`)
- **Nombre y emoji del negocio** de ejemplo → aparecen en el menú del cliente, tablero, tickets, login y títulos.
- **Categorías, productos y combos** (con precio, emoji, descripción, agotado, precio por paquete, regalos por promoción).
- **Mesas** del local con zona y capacidad.
- **`WEB_CONFIG`**: el nombre de tu servicio, tu WhatsApp y tu correo para los botones de `inicio.html`.

Los visitantes también pueden cambiar el nombre y el emoji desde el botón «✏️ Personalizar» del visor. Si cambias `demo-config.js`, abre la demo y pulsa «Reiniciar» (o borra los datos del sitio) para regenerar los datos de ejemplo.

## Cómo se publica
Es un sitio estático: sube la carpeta tal cual a Vercel, Netlify o cualquier hosting (sin build). Para probar en tu PC: `python3 -m http.server 8000` en la carpeta y abre `http://localhost:8000/inicio.html`.

**Dentro de tu web:** si tu sitio está en otro dominio, publica esta carpeta y pon en tu página:
```html
<iframe src="https://TU-DOMINIO-DE-LA-DEMO/embed.html" style="width:100%;height:1000px;border:0" loading="lazy"></iframe>
```
`vercel.json` permite que cualquier sitio https la incruste; para restringirlo a tu dominio, cambia `https:` por `https://tusitio.com` en la cabecera `frame-ancestors`.

## Cómo funciona
- `mock-api.js` hace de backend dentro del navegador: responde a `/api/...` con la misma forma que el FastAPI original y guarda todo en `localStorage`. Cada visitante tiene su propia copia.
- Los paneles de la web de presentación son las páginas reales dentro de marcos, con entrada automática (`?embed=1&auto=staff`). Comparten datos y se avisan entre sí, así que un pedido hecho en el celular aparece al instante en Cocina, Mesas y Estadísticas.
- WhatsApp y Pusher están simulados: los mensajes se ven en el botón verde «📱 WhatsApp simulado».
- Se conserva la lógica del original: precios recalculados «en el servidor», paquetes, regalos, permisos por rol, claves de cliente, numeración diaria por tipo, empaques, horario y plantillas.

## Mesas
- El cliente elige «Comer aquí (en mi mesa)» o entra por el QR de su mesa (`menu.html?mesa=Mesa 3`).
- El pedido va directo a **Cocina** (se paga al final) y la mesa pasa a *ocupada*.
- En **Mesas** se ve el consumo acumulado, se marca «Pidió la cuenta» y «Cobrar y liberar» deja la mesa libre y da por cerrados sus pedidos.
- Se crean, editan y eliminan en **Administración → Mesas** (con botón para copiar el enlace del QR).
- Desde la caja también se puede tomar un pedido para una mesa.

## Datos de prueba
| Quién | Usuario / teléfono | PIN / clave |
|---|---|---|
| Admin | `admin` | `1234` |
| Cajero | `cajero` o `cajero_carlos` | `1234` |
| Cliente Ana | `04120000001` | `1234` |
| Cliente Luis | `04140000002` | `1234` |
| Cliente nuevo | cualquier número válido | clave de 4+ caracteres |

En la web de presentación los paneles entran solos como administrador. Para probar los roles, abre cada página directamente.

## Límites conocidos
- Los datos son por navegador: no hay pedidos compartidos entre dispositivos distintos.
- Algunos navegadores bloquean el almacenamiento dentro de marcos de otro sitio (modo incógnito, Safari con protección estricta). Si la demo incrustada no comparte datos entre el celular y la cocina, usa `inicio.html` publicada en tu propio dominio.
- Las imágenes subidas en Administración se guardan reducidas en el navegador (tope ~5 MB en total).
- La tasa BCV es fija (se edita desde el tablero); los PIN de demo están en claro (son públicos).
- Las fechas siguen la hora de Caracas, como el original.
