// Rutas del API (portadas de mock-api.js). Se ejecutan en el Worker de Cloudflare.
// Cada ruta recibe (ctx, db): db es el estado completo guardado en Supabase.
import { DEMO_CONFIG as CFG } from './demo-config.mjs';
import { crearToken, hashClave, verificarClave } from './auth.mjs';

const VERSION_DATOS = 3;
function marca() { return { nombre: CFG.nombreNegocio || 'Mi Restaurante', emoji: CFG.emoji || '🍔', eslogan: CFG.eslogan || '' }; }
function siguienteId(db, tabla) { db.seq[tabla] = (db.seq[tabla] || 0) + 1; return db.seq[tabla]; }

// Evento para el tablero en vivo (los clientes lo consultan por "polling")
let eventoPendiente = null;
function emitirTablero(mensaje, sucursalId) { eventoPendiente = { mensaje, sucursal_id: sucursalId || null }; }
export function tomarEvento() { const e = eventoPendiente; eventoPendiente = null; return e; }

    // ------------------------------------------------------------------
    // Reloj: igual que el backend, siempre hora de Caracas (UTC-4 fijo)
    // ------------------------------------------------------------------
    function ahoraCaracasDate(offsetMs) { return new Date(Date.now() - 4 * 3600e3 + (offsetMs || 0)); }
    function isoNaive(d) { return d.toISOString().replace('Z', ''); }
    function ahoraCaracas() { return isoNaive(ahoraCaracasDate()); }
    function hoyCaracas() { return ahoraCaracas().slice(0, 10); }
    function diaSemanaCaracas() { return (ahoraCaracasDate().getUTCDay() + 6) % 7; } // 0 = lunes
    function horaActualCaracas() { return ahoraCaracas().slice(11, 16); }

    // ------------------------------------------------------------------
    // Utilidades de sanitizado (port de sanitizar.py)
    // ------------------------------------------------------------------
    function limpiarTexto(valor, largoMax, unaLinea) {
        let t = String(valor == null ? '' : valor).replace(/[<>]/g, '');
        if (unaLinea !== false) t = t.replace(/[\r\n]/g, ' ');
        t = t.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
        return t.trim().slice(0, largoMax);
    }
    function telefonoPublicoValido(tel) {
        const crudo = String(tel || '').trim();
        const digitos = (crudo.match(/\d/g) || []).length;
        return digitos >= 7 && digitos <= 15 && /^\+?[\d\s\-()]+$/.test(crudo);
    }

    // ------------------------------------------------------------------
    // Errores HTTP
    // ------------------------------------------------------------------
    class HttpError extends Error {
        constructor(status, detail) { super(detail); this.status = status; this.detail = detail; }
    }

// ------------------------------------------------------------------
// Sesión: el Worker verifica el token firmado y lo deja en ctx.sesion
// ------------------------------------------------------------------
function sesionDe(ctx) {
    if (!ctx.sesion) throw new HttpError(401, 'No autenticado');
    return ctx.sesion;
}
function requiereStaff(ctx) { return sesionDe(ctx); }
function requiereAdmin(ctx) {
    const p = sesionDe(ctx);
    if (!['admin', 'superadmin'].includes(String(p.rol || '').toLowerCase())) throw new HttpError(403, 'Requiere privilegios de administrador');
    return p;
}
function staffOpcional(ctx) { return ctx.sesion || null; }

// Fallos de login / clave (se guardan dentro del estado)
let fallos = {};
export function usarFallos(obj) { fallos = obj; }

// Plan contratado: total de locales (principal + sucursales). Lo define quien administra el servidor (MAX_SUCURSALES).
let LIMITE_SUCURSALES = 1;
export function usarLimiteSucursales(n) { LIMITE_SUCURSALES = n; }

    function cupoAgotado(clave, max, ventanaSeg) {
        const ahora = Date.now();
        fallos[clave] = (fallos[clave] || []).filter(t => ahora - t < ventanaSeg * 1000);
        return fallos[clave].length >= max;
    }
    function anotarFallo(clave) { (fallos[clave] = fallos[clave] || []).push(Date.now()); }
    function olvidarFallos(clave) { delete fallos[clave]; }
    // ------------------------------------------------------------------
    // Datos de demo
    // ------------------------------------------------------------------
    function bannerSvg(emoji, titulo, subtitulo, c1, c2) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">` +
            `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>` +
            `<rect width="800" height="450" fill="url(#g)"/>` +
            `<text x="400" y="190" font-size="150" text-anchor="middle">${emoji}</text>` +
            `<text x="400" y="290" font-size="52" font-weight="bold" font-family="Arial,sans-serif" fill="#fff" text-anchor="middle">${titulo}</text>` +
            `<text x="400" y="345" font-size="30" font-family="Arial,sans-serif" fill="#fff" fill-opacity="0.9" text-anchor="middle">${subtitulo}</text></svg>`;
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    }

    const PLANTILLAS = {
        recepcion: '🍔 ¡Hola, [CLIENTE]! Recibimos tu pedido #[PEDIDO]. En breve calculamos el delivery y te escribimos con el total.',
        modificado: '⚠️ ¡Hola [CLIENTE]! Actualizamos tu pedido #[PEDIDO]:\n\n[PEDIDO_DETALLADO]\n\n💰 Nuevo total: $[TOTAL_USD]',
        cobro_zelle: 'Hola [CLIENTE], tu pedido #[PEDIDO] está listo para pagar.\n\n[PEDIDO_DETALLADO]\n\n💰 Total: $[TOTAL_USD]',
        cobro_efectivo: 'Hola [CLIENTE], tu pedido #[PEDIDO]:\n\n[PEDIDO_DETALLADO]\n\n💰 Total a pagar en efectivo: $[TOTAL_USD]',
        cobro_pago_movil: 'Hola [CLIENTE], tu pedido #[PEDIDO]:\n\n[PEDIDO_DETALLADO]\n\n💰 Total: $[TOTAL_USD] (Bs. [TOTAL_BS])\n\nPaga por Pago Móvil a los datos DEMO: Banco 0000 · Tel 0400-0000000 · V-00000000 y envíanos el comprobante.',
        recepcion_mesa: '🍽️ ¡Hola, [CLIENTE]! Recibimos tu pedido #[PEDIDO] para la [MESA]. Ya está en cocina; te lo llevamos a la mesa en cuanto esté listo.',
        final_mesa: '🍽️ ¡[CLIENTE], tu pedido #[PEDIDO] va en camino a la [MESA]! Buen provecho 🍟',
        aprobado: '✅ ¡Hola [CLIENTE]! Tu pago del pedido #[PEDIDO] fue aprobado. Estará listo en [TIEMPO_ESTIMADO] aproximadamente.',
        final_delivery: '🛵 ¡[CLIENTE], tu pedido #[PEDIDO] ya va en camino! Buen provecho 🍟',
        final_pickup: '🛍️ ¡[CLIENTE], tu pedido #[PEDIDO] está listo para retirar! Buen provecho 🍟',
        aviso_grupo_delivery:
            '🛵 *PEDIDO N° [PEDIDO]*\n\n👤 *NOMBRE:* [NOMBRE]\n\n📍 *DIRECCIÓN:* [DIRECCION]\n\n🥤 *REFRESCO:* [REFRESCOS]\n\n🍱 *BANDEJAS:* [BANDEJAS]\n\n📦 *CAJAS DE PIZZA:* [CAJAS_PIZZA]\n\n💵 *PAGO:* [PAGO]\n\n🏍️ *PRECIO DEL DELIVERY:* [PRECIO_DELIVERY]'
    };
    // Copia exacta del texto de fábrica (el backend lo usa si la plantilla guardada no trae [BANDEJAS])
    const PLANTILLA_AVISO_MOTORIZADOS = PLANTILLAS.aviso_grupo_delivery;

export function crearDbInicial(adminPinHash, adminUsername, adminNombre) {
        const hoy = hoyCaracas();
        const db = {
            version: VERSION_DATOS,
            seq: {},
            categorias: [], productos: [], combos: [], anuncios: [], clientes: [], usuarios: [],
            motorizados: [], pedidos: [], horarios: [], mensajes: [], outbox: [], mesas: [],
            tasa: { tasa: CFG.tasaBs || 40.0, fecha: hoy }
        };

        // --- Categorías (el "imagen" es un emoji: así no hay imágenes externas) ---
        (CFG.categorias || []).forEach(c => db.categorias.push({ id: siguienteId(db, 'categorias'), nombre: c.nombre, imagen: c.emoji || '' }));

        // --- Productos ---
        (CFG.productos || []).forEach(p => {
            db.productos.push({
                id: siguienteId(db, 'productos'), nombre: p.nombre, categoria: p.categoria, precio: p.precio, descripcion: p.descripcion || '',
                disponible: true, agotado: !!p.agotado, imagen: p.emoji || '', disponible_desde: null, disponible_hasta: null, dias_disponibles: null,
                bandejas: p.bandejas != null ? p.bandejas : 1, cajas_pizza: p.cajasPizza || 0,
                precio_paquete: p.paquete ? p.paquete.precio : null, cantidad_paquete: p.paquete ? p.paquete.cantidad : 0
            });
        });
        const prodPorNombre = n => db.productos.find(p => p.nombre === n);

        // --- Combos (los productos se enlazan por nombre) ---
        (CFG.combos || []).forEach(c => {
            const items = (c.items || []).map(it => {
                const cantidad = it.cantidad || 1;
                if (it.categoria) return { tipo: 'categoria', valor: it.categoria, cantidad };
                const p = prodPorNombre(it.producto);
                return p ? { tipo: 'producto', valor: p.id, nombre_producto: p.nombre, cantidad } : null;
            }).filter(Boolean);
            const regalo = c.promo ? prodPorNombre(c.promo.producto) : null;
            db.combos.push({
                id: siguienteId(db, 'combos'), nombre: c.nombre, categoria: 'Combos', precio: c.precio, descripcion: c.descripcion || '', imagen: c.emoji || '',
                items_json: JSON.stringify(items), items_json_respaldo: null, disponible: true,
                promo_cantidad_minima: regalo ? c.promo.minimo : null, promo_producto_id: regalo ? regalo.id : null, promo_producto_cantidad: regalo ? (c.promo.cantidad || 1) : null,
                disponible_desde: null, disponible_hasta: null, dias_disponibles: null, bandejas: c.bandejas != null ? c.bandejas : 1, cajas_pizza: c.cajasPizza || 0
            });
        });

        // --- Mesas ---
        (CFG.mesas || []).forEach(m => db.mesas.push({ id: siguienteId(db, 'mesas'), nombre: m.nombre, zona: m.zona || 'Salón', capacidad: m.capacidad || 4, estado: 'libre', ocupada_desde: null }));

        // --- Anuncios (banners generados, sin imágenes externas) ---
        db.anuncios.push(
            { id: siguienteId(db, 'anuncios'), imagen: bannerSvg(marca().emoji, (db.combos[0] ? db.combos[0].nombre : 'Promo'), (db.combos[0] && db.combos[0].promo_producto_id ? 'Lleva 2 y te regalamos un postre' : 'Pídelo ahora'), '#dc2626', '#f97316'), titulo: '¡Promo de la semana!', texto: 'Mira el combo destacado del menú y aprovecha la promoción.', activo: true, orden: 1, producto_ref: 'c_1' },
        );

        // --- Usuario administrador inicial ---
        db.usuarios.push({ id: siguienteId(db, 'usuarios'), username: adminUsername, pin: adminPinHash, nombre: adminNombre, rol: 'superadmin' });

        for (let d = 0; d < 7; d++) db.horarios.push({ id: d + 1, dia_semana: d, activo: true, hora_apertura: '00:00', hora_cierre: '23:59' });

        db.sitio = { titulo: '', eslogan: marca().eslogan || '', historia: '', whatsapp: '', instagram: '', facebook: '', tiktok: '', email: '' };
        db.sucursales = [{ id: siguienteId(db, 'sucursales'), nombre: 'Sucursal Principal', direccion: '', telefono: '', whatsapp: '', horario: 'Todos los días', mapa: '', coords: '', activa: true }];
        db.galeria = []; db.resenas = [];

        Object.keys(PLANTILLAS).forEach(id => db.mensajes.push({ id, texto: PLANTILLAS[id] }));

        return db;
    }

    // Pedidos de ejemplo: 14 días de historial para las estadísticas + algunos de hoy en el tablero

    // ------------------------------------------------------------------
    // Lógica de pedidos (port de routers/pedidos.py)
    // ------------------------------------------------------------------
    const MAX_LINEAS_POR_PEDIDO = 80;
    const MAX_CANTIDAD_POR_LINEA = 500;

    function esEntregaPickup(tipo) { const t = String(tipo || '').toLowerCase(); return t.includes('pickup') || t.includes('retiro'); }
    function esEntregaMesa(tipo) { return String(tipo || '').toLowerCase().includes('mesa'); }
    // Cada tipo lleva su propio cuaderno de números diarios (#1, #2...)
    function claveEntrega(tipo) { return esEntregaMesa(tipo) ? 'mesa' : (esEntregaPickup(tipo) ? 'pickup' : 'delivery'); }
    function aplicarPlaceholders(texto, mapa) {
        Object.keys(mapa).forEach(k => { texto = texto.split(k).join(String(mapa[k])); });
        return texto;
    }
    function parteId(id) {
        const p = String(id || '').split('_');
        return { tipo: p[0] || '', dbId: p.length > 1 && /^\d+$/.test(p[1]) ? parseInt(p[1], 10) : 0, partes: p };
    }
    function esRefresco(categoria) { const t = String(categoria || '').toLowerCase(); return t.includes('bebida') || t.includes('refresco'); }

    function contarNumeroDiario(db, pedido) {
        if (!pedido.fecha && !pedido.timestamp) return pedido.id;
        const dia = pedido.fecha || String(pedido.timestamp).slice(0, 10);
        const buscado = claveEntrega(pedido.tipo_entrega);
        return db.pedidos.filter(p => (p.fecha || String(p.timestamp || '').slice(0, 10)) === dia && p.id <= pedido.id && claveEntrega(p.tipo_entrega) === buscado).length;
    }
    function obtenerIdDiario(db, idStr) {
        const p = db.pedidos.find(x => String(x.id) === String(idStr));
        return p ? String(contarNumeroDiario(db, p)) : String(idStr);
    }

    function calcularEmpaque(db, articulos) {
        const tot = { bandejas: 0, cajas_pizza: 0, refrescos: 0 };
        (articulos || []).forEach(art => {
            const cantidad = parseInt(art && art.qty, 10);
            if (!(cantidad > 0)) return;
            const { tipo, dbId, partes } = parteId(art.id);
            if (partes.length < 2 || !dbId) return;
            let fila = null;
            if (tipo === 'p') { fila = db.productos.find(p => p.id === dbId); if (fila && esRefresco(fila.categoria)) tot.refrescos += cantidad; }
            else if (tipo === 'c') fila = db.combos.find(c => c.id === dbId);
            if (!fila) return;
            tot.bandejas += (fila.bandejas != null ? fila.bandejas : 1) * cantidad;
            tot.cajas_pizza += (fila.cajas_pizza || 0) * cantidad;
        });
        return tot;
    }

    function precioDeLinea(unitario, cantidad, precioPaquete, cantidadPaquete) {
        const porPaquete = parseFloat(precioPaquete || 0) || 0;
        const tam = parseInt(cantidadPaquete || 0, 10) || 0;
        if (porPaquete > 0 && tam > 1 && cantidad > 0) {
            const paquetes = Math.floor(cantidad / tam), sueltas = cantidad % tam;
            return paquetes * porPaquete + sueltas * parseFloat(unitario);
        }
        return parseFloat(unitario) * cantidad;
    }

    function cuposDeRegalo(db, articulos) {
        const porCombo = {};
        (articulos || []).forEach(item => {
            if (item.esRegalo) return;
            const { tipo, dbId } = parteId(item.id);
            if (tipo !== 'c' || !dbId) return;
            const q = parseInt(item.qty || 0, 10) || 0;
            if (q > 0) porCombo[dbId] = (porCombo[dbId] || 0) + q;
        });
        const cupos = {};
        Object.keys(porCombo).forEach(cid => {
            const combo = db.combos.find(c => c.id === +cid);
            if (!combo || !combo.promo_cantidad_minima || !combo.promo_producto_id || !combo.promo_producto_cantidad) return;
            const veces = Math.floor(porCombo[cid] / combo.promo_cantidad_minima);
            if (veces > 0) cupos[combo.promo_producto_id] = (cupos[combo.promo_producto_id] || 0) + veces * combo.promo_producto_cantidad;
        });
        return cupos;
    }

    function construirResumenPedido(db, articulos, esPersonal, sid) {
        articulos = Array.isArray(articulos) ? articulos : [];
        if (articulos.length > MAX_LINEAS_POR_PEDIDO) throw new HttpError(400, 'El pedido tiene demasiadas líneas.');
        const cupos = cuposDeRegalo(db, articulos);
        let total = 0;
        const lineas = [];

        for (const item of articulos) {
            let nombre = limpiarTexto(item.name, 200);
            const nota = limpiarTexto(item.note, 300);
            const esRegalo = !!item.esRegalo;
            const precioCliente = Math.max(0, parseFloat(item.price || 0) || 0);
            const cantidad = parseInt(item.qty || 0, 10);
            if (!(cantidad > 0)) continue;
            if (cantidad > MAX_CANTIDAD_POR_LINEA) throw new HttpError(400, 'Una de las cantidades del pedido no es válida.');

            let precio = 0, descripcion = '', precioPaquete = null, cantPaquete = 0, fila = null;
            const { tipo, dbId } = parteId(item.id);

            if (tipo === 'p' && dbId) {
                fila = db.productos.find(p => p.id === dbId) || null;
                if (fila) { precio = fila.precio || 0; descripcion = fila.descripcion || ''; precioPaquete = fila.precio_paquete; cantPaquete = fila.cantidad_paquete; nombre = fila.nombre; }
            } else if (tipo === 'c' && dbId) {
                fila = db.combos.find(c => c.id === dbId) || null;
                if (fila) {
                    precio = fila.precio || 0; descripcion = fila.descripcion || '';
                    const real = limpiarTexto(fila.nombre, 200);
                    if (nombre !== real && !nombre.startsWith(real + ' (')) nombre = nombre ? `${real} (${nombre})` : real;
                }
            }

            if (fila && sid && !esRegalo && !(tipo === 'p' ? itemDisponibleEn(fila, sid) : comboDisponibleEn(db, fila, sid))) throw new HttpError(400, `${fila.nombre} no está disponible en esta sucursal. Quítalo del carrito para continuar.`);
            if (fila && !esPersonal && !esRegalo && fila.agotado) throw new HttpError(400, `${fila.nombre} se agotó. Quítalo del carrito para continuar.`);

            if (esRegalo && tipo === 'p' && fila && (cupos[dbId] || 0) >= cantidad) {
                cupos[dbId] -= cantidad; precio = 0; precioPaquete = null; cantPaquete = 0;
                nombre = `🎁 ${fila.nombre} (cortesía)`;
            } else if (esRegalo && !fila) {
                continue;
            } else if (!fila) {
                if (!esPersonal) throw new HttpError(400, 'Uno de los platos del carrito ya no está disponible. Recarga el menú e intenta de nuevo.');
                precio = precioCliente;
            }

            const totalLinea = precioDeLinea(precio, cantidad, precioPaquete, cantPaquete);
            total += totalLinea;
            const hayPaquete = Math.abs(totalLinea - precio * cantidad) > 1e-9;
            const mostrado = hayPaquete ? totalLinea : precio;
            lineas.push(`${cantidad}x ${nombre} ($${mostrado.toFixed(2)})${nota ? ` (Nota: ${nota})` : ''}${descripcion ? `\n${descripcion}` : ''}`);
        }
        return { texto: lineas.join('\n'), total };
    }

    // ------------------------------------------------------------------
    // Tasa BCV simulada (sin consultar a internet)
    // ------------------------------------------------------------------
    function tasaVigente(db) {
        const hoy = hoyCaracas();
        if (db.tasa.fecha !== hoy) db.tasa.fecha = hoy; // "oficial" de hoy: la misma de demo
        return db.tasa.tasa;
    }

    // ------------------------------------------------------------------
    // WhatsApp simulado: se guarda en una bandeja que se ve en pantalla
    // ------------------------------------------------------------------
    function enviarWhatsappSimulado(db, destino, mensaje, contexto) {
        db.outbox.push({ ts: ahoraCaracas(), destino, contexto, mensaje });
        if (db.outbox.length > 60) db.outbox.splice(0, db.outbox.length - 60);
    }


    // ------------------------------------------------------------------
    // Rutas
    // ------------------------------------------------------------------
    const rutas = [];
    function ruta(metodo, path, fn) { rutas.push({ metodo, path, fn }); }
    const ok = (extra) => Object.assign({ success: true }, extra || {});

    // ---- Menú ----
    // ------------------------------------------------------------------
    // Sucursales: quién ve qué
    // ------------------------------------------------------------------
    // Solo cuentan las activas que entran en el plan (las primeras N)
    function sucursalesActivas(db) { return (db.sucursales || []).filter(s => s.activa !== false).slice(0, LIMITE_SUCURSALES); }
    function usuarioDe(ctx, db) { return ctx.sesion ? (db.usuarios.find(u => String(u.username).toLowerCase() === String(ctx.sesion.sub).toLowerCase()) || null) : null; }
    // Sucursal fija del personal (null = ve todas, como el dueño)
    function sucursalDelPersonal(ctx, db) { const u = usuarioDe(ctx, db); return u && u.sucursal_id ? Number(u.sucursal_id) : null; }
    function mesaEnSucursal(m, sid) { return !sid || !m.sucursal_id || Number(m.sucursal_id) === Number(sid); }
    function itemDisponibleEn(item, sid) { return !sid || !Array.isArray(item.no_disponible_en) || !item.no_disponible_en.includes(Number(sid)); }
    function comboDisponibleEn(db, combo, sid) {
        if (!itemDisponibleEn(combo, sid)) return false;
        let items = []; try { items = JSON.parse(combo.items_json || '[]'); } catch (e) {}
        return items.every(it => !(it && it.tipo === 'producto') || itemDisponibleEn(db.productos.find(x => x.id === it.valor) || {}, sid));
    }
    function limpiarListaSucursales(db, v) { return Array.isArray(v) ? [...new Set(v.map(Number))].filter(n => (db.sucursales || []).some(s => s.id === n)) : []; }
    function idSucursalValido(db, v) { const n = parseInt(v, 10); return n && (db.sucursales || []).some(s => s.id === n) ? n : null; }
    function exigirSucursal(ctx, db, pedido) {
        const mia = sucursalDelPersonal(ctx, db);
        if (mia && Number(pedido.sucursal_id) !== mia) throw new HttpError(403, 'Ese pedido es de otra sucursal.');
    }

    ruta('GET', '/api/menu', (ctx, db) => { const sid = parseInt(ctx.query.sucursal, 10) || 0; return ({
        menu: {
            categorias: db.categorias.map(c => ({ id: c.id, nombre: c.nombre, imagen: c.imagen })),
            productos: db.productos.filter(p => itemDisponibleEn(p, sid)).map(p => ({ no_disponible_en: p.no_disponible_en || [], id: p.id, nombre: p.nombre, categoria: p.categoria, precio: p.precio, imagen: p.imagen, descripcion: p.descripcion, disponible: p.disponible, agotado: p.agotado, favorito: !!p.favorito, disponible_desde: p.disponible_desde, disponible_hasta: p.disponible_hasta, dias_disponibles: p.dias_disponibles, bandejas: p.bandejas, cajas_pizza: p.cajas_pizza, precio_paquete: p.precio_paquete, cantidad_paquete: p.cantidad_paquete })),
            combos: db.combos.filter(c => comboDisponibleEn(db, c, sid)).map(c => ({ no_disponible_en: c.no_disponible_en || [], id: c.id, nombre: c.nombre, categoria: c.categoria, precio: c.precio, imagen: c.imagen, descripcion: c.descripcion, disponible: c.disponible, favorito: !!c.favorito, items_json: c.items_json, promo_cantidad_minima: c.promo_cantidad_minima, promo_producto_id: c.promo_producto_id, promo_producto_cantidad: c.promo_producto_cantidad, disponible_desde: c.disponible_desde, disponible_hasta: c.disponible_hasta, dias_disponibles: c.dias_disponibles, bandejas: c.bandejas, cajas_pizza: c.cajas_pizza }))
        }
    }); });

    function guardarEn(tabla, db, datos, campos, nuevo) {
        if (datos.id) {
            const fila = tabla.find(x => x.id === datos.id);
            if (fila) campos.forEach(c => { fila[c] = datos[c]; });
        } else {
            nuevo();
        }
    }
    ruta('POST', '/api/menu/guardar-categoria', (ctx, db) => {
        requiereAdmin(ctx); const d = ctx.body;
        if (!d.nombre) throw new HttpError(422, 'Falta el nombre');
        guardarEn(db.categorias, db, d, ['nombre', 'imagen'], () => db.categorias.push({ id: siguienteId(db, 'categorias'), nombre: d.nombre, imagen: d.imagen || '' }));
        return ok();
    });
    const CAMPOS_PROD = ['no_disponible_en', 'nombre', 'categoria', 'precio', 'imagen', 'descripcion', 'disponible', 'agotado', 'favorito', 'disponible_desde', 'disponible_hasta', 'dias_disponibles', 'precio_paquete', 'cantidad_paquete', 'bandejas', 'cajas_pizza'];
    ruta('POST', '/api/menu/guardar-producto', (ctx, db) => {
        requiereAdmin(ctx); const d = ctx.body;
        if (!d.nombre || !d.categoria || typeof d.precio !== 'number') throw new HttpError(422, 'Datos incompletos');
        const previo = d.id ? db.productos.find(x => x.id === d.id) : null;
        d.no_disponible_en = d.no_disponible_en === undefined ? ((previo && previo.no_disponible_en) || []) : limpiarListaSucursales(db, d.no_disponible_en);
        const defaults = { disponible: true, agotado: false, favorito: false, bandejas: 1, cajas_pizza: 0, cantidad_paquete: 0, precio_paquete: null, imagen: '', descripcion: '' };
        const datos = Object.assign({}, defaults, d);
        guardarEn(db.productos, db, datos, CAMPOS_PROD, () => { const f = { id: siguienteId(db, 'productos') }; CAMPOS_PROD.forEach(c => { f[c] = datos[c] === undefined ? null : datos[c]; }); db.productos.push(f); });
        return ok();
    });
    const CAMPOS_COMBO = ['no_disponible_en', 'nombre', 'categoria', 'precio', 'imagen', 'descripcion', 'disponible', 'favorito', 'promo_cantidad_minima', 'promo_producto_id', 'promo_producto_cantidad', 'disponible_desde', 'disponible_hasta', 'dias_disponibles', 'bandejas', 'cajas_pizza'];
    ruta('POST', '/api/menu/guardar-combo', (ctx, db) => {
        requiereAdmin(ctx); const d = ctx.body;
        if (!d.nombre || typeof d.precio !== 'number') throw new HttpError(422, 'Datos incompletos');
        const previoC = d.id ? db.combos.find(x => x.id === d.id) : null;
        d.no_disponible_en = d.no_disponible_en === undefined ? ((previoC && previoC.no_disponible_en) || []) : limpiarListaSucursales(db, d.no_disponible_en);
        const defaults = { disponible: true, favorito: false, bandejas: 1, cajas_pizza: 0, imagen: '', descripcion: '', items: [] };
        const datos = Object.assign({}, defaults, d);
        const itemsJson = JSON.stringify(datos.items || []);
        if (datos.id) {
            const fila = db.combos.find(x => x.id === datos.id);
            if (fila) { CAMPOS_COMBO.forEach(c => { fila[c] = datos[c] === undefined ? null : datos[c]; }); fila.items_json = itemsJson; }
        } else {
            const f = { id: siguienteId(db, 'combos'), items_json: itemsJson, items_json_respaldo: null };
            CAMPOS_COMBO.forEach(c => { f[c] = datos[c] === undefined ? null : datos[c]; });
            db.combos.push(f);
        }
        return ok();
    });
    ruta('POST', '/api/menu/ordenar', (ctx, db) => {
        requiereAdmin(ctx); const { tipo, ids } = ctx.body || {};
        const tabla = { producto: 'productos', combo: 'combos' }[tipo];
        if (!tabla || !Array.isArray(ids)) throw new HttpError(422, 'Datos incompletos');
        const pos = new Map(ids.map((id, i) => [Number(id), i]));
        db[tabla] = db[tabla].map((x, i) => [x, pos.has(x.id) ? pos.get(x.id) : 1e9 + i]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
        return ok();
    });
    ruta('POST', '/api/menu/eliminar-item', (ctx, db) => {
        requiereAdmin(ctx); const { id, tipo } = ctx.body;
        const tablas = { categoria: 'categorias', producto: 'productos', combo: 'combos' };
        if (!tablas[tipo]) return { success: false, error: 'Tipo desconocido' };
        db[tablas[tipo]] = db[tablas[tipo]].filter(x => x.id !== id);
        return ok();
    });

    // ---- Anuncios ----
    ruta('GET', '/api/anuncios', (ctx, db) => db.anuncios.slice().sort((a, b) => (a.orden || 0) - (b.orden || 0)));
    ruta('POST', '/api/anuncios/guardar', (ctx, db) => {
        requiereAdmin(ctx); const d = ctx.body;
        if (!d.imagen) throw new HttpError(422, 'Falta la imagen');
        const campos = ['imagen', 'titulo', 'texto', 'activo', 'orden', 'producto_ref'];
        const datos = Object.assign({ titulo: '', texto: '', activo: true, orden: 0, producto_ref: null }, d);
        guardarEn(db.anuncios, db, datos, campos, () => { const f = { id: siguienteId(db, 'anuncios') }; campos.forEach(c => { f[c] = datos[c]; }); db.anuncios.push(f); });
        return ok();
    });
    ruta('POST', '/api/anuncios/eliminar', (ctx, db) => { requiereAdmin(ctx); db.anuncios = db.anuncios.filter(a => a.id !== ctx.body.id); return ok(); });

    // ---- Horarios ----
    const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    function estaAbiertoAhora(db) {
        const r = db.horarios.find(h => h.dia_semana === diaSemanaCaracas());
        if (!r || !r.activo || !r.hora_apertura || !r.hora_cierre) return false;
        const h = horaActualCaracas();
        return r.hora_apertura <= h && h <= r.hora_cierre;
    }
    ruta('GET', '/api/horarios', (ctx, db) => db.horarios.slice().sort((a, b) => a.dia_semana - b.dia_semana).map(h => ({ dia_semana: h.dia_semana, dia_nombre: DIAS_SEMANA[h.dia_semana], activo: h.activo, hora_apertura: h.hora_apertura, hora_cierre: h.hora_cierre })));
    ruta('POST', '/api/horarios/guardar', (ctx, db) => {
        requiereAdmin(ctx);
        (ctx.body.horarios || []).forEach(dia => {
            const r = db.horarios.find(h => h.dia_semana === dia.dia_semana);
            if (r) { r.activo = dia.activo; r.hora_apertura = dia.hora_apertura; r.hora_cierre = dia.hora_cierre; }
            else db.horarios.push({ id: siguienteId(db, 'horarios'), dia_semana: dia.dia_semana, activo: dia.activo, hora_apertura: dia.hora_apertura, hora_cierre: dia.hora_cierre });
        });
        return ok();
    });

    // ---- BCV ----
    ruta('GET', '/api/bcv', (ctx, db) => ({ success: true, tasa: tasaVigente(db) }));
    ruta('POST', '/api/bcv/actualizar', (ctx, db) => {
        requiereStaff(ctx);
        const tasa = parseFloat(ctx.body.tasa);
        if (!(tasa > 0)) throw new HttpError(422, 'Tasa inválida');
        db.tasa = { tasa, fecha: hoyCaracas() };
        return { success: true, tasa };
    });

    // ---- Mensajes ----
    ruta('GET', '/api/mensajes', (ctx, db) => { requiereStaff(ctx); return db.mensajes.map(m => ({ id: m.id, texto: m.texto })); });
    ruta('POST', '/api/mensajes/guardar', (ctx, db) => {
        requiereAdmin(ctx);
        Object.keys(ctx.body || {}).forEach(clave => {
            const m = db.mensajes.find(x => x.id === clave);
            if (m) m.texto = ctx.body[clave]; else db.mensajes.push({ id: clave, texto: ctx.body[clave] });
        });
        return { success: true, msg: 'Plantillas actualizadas correctamente' };
    });

    // ---- Motorizados ----
    ruta('GET', '/api/motorizados', (ctx, db) => { requiereStaff(ctx); return db.motorizados.map(m => ({ id: m.id, nombre: m.nombre })); });
    ruta('POST', '/api/motorizados/guardar', (ctx, db) => {
        requiereStaff(ctx); const d = ctx.body;
        if (d.id) { const m = db.motorizados.find(x => x.id === d.id); if (m) m.nombre = d.nombre; }
        else db.motorizados.push({ id: siguienteId(db, 'motorizados'), nombre: d.nombre });
        return { success: true, msg: 'Motorizado guardado exitosamente' };
    });
    ruta('POST', '/api/motorizados/eliminar', (ctx, db) => { requiereStaff(ctx); db.motorizados = db.motorizados.filter(m => m.id !== ctx.body.id); return ok(); });

    // ---- Usuarios ----
    const ROLES_VALIDOS = ['cajero', 'admin', 'superadmin'];
    ruta('POST', '/api/usuarios/validar-acceso', async (ctx, db) => {
        const d = ctx.body || {};
        const claveFallos = 'login-fallido:' + String(d.username || '').trim().toLowerCase();
        if (cupoAgotado(claveFallos, 5, 15 * 60)) throw new HttpError(429, 'Demasiados intentos fallidos con este usuario. Espera 15 minutos o entra con otra cuenta.');
        const buscado = String(d.username || '').trim().toLowerCase();
        const u = db.usuarios.find(x => String(x.username).toLowerCase() === buscado);
        if (!u || !(await verificarClave(String(d.pin).trim(), u.pin))) { anotarFallo(claveFallos); return { success: false, msg: 'Credenciales incorrectas' }; }
        olvidarFallos(claveFallos);
        if (d.tipo === 'login_admin' && !['admin', 'superadmin'].includes(String(u.rol).toLowerCase())) return { success: false, msg: 'No tienes privilegios de administrador' };
        return { success: true, token: await crearToken(u.username, u.rol), usuario: { nombre: u.nombre, rol: u.rol, username: u.username, sucursal_id: u.sucursal_id || null } };
    });
    ruta('GET', '/api/usuarios', (ctx, db) => { requiereAdmin(ctx); return db.usuarios.map(u => ({ id: u.id, nombre: u.nombre, username: u.username, rol: u.rol, sucursal_id: u.sucursal_id || null })); });
    ruta('POST', '/api/usuarios/guardar', async (ctx, db) => {
        const admin = requiereAdmin(ctx); const d = ctx.body;
        d.username = String(d.username || '').trim(); d.nombre = String(d.nombre || '').trim();
        if (!d.username || !d.nombre) return { success: false, error: 'Nombre y usuario son obligatorios' };
        const rolNuevo = String(d.rol || '').trim().toLowerCase();
        if (!ROLES_VALIDOS.includes(rolNuevo)) return { success: false, error: 'Rol no valido' };
        if (d.pin && ['admin', 'superadmin'].includes(rolNuevo) && String(d.pin).length < 8) return { success: false, error: 'La contraseña de un administrador debe tener al menos 8 caracteres' };
        if (d.pin && String(d.pin).length > 72) return { success: false, error: 'Contraseña demasiado larga' };
        const esSuper = String(admin.rol || '').toLowerCase() === 'superadmin';
        if (rolNuevo === 'superadmin' && !esSuper) throw new HttpError(403, 'Solo un superadmin puede asignar ese rol');
        const repetido = db.usuarios.some(u => String(u.username).toLowerCase() === d.username.toLowerCase() && u.id !== d.id);
        if (repetido) return { success: false, error: 'No se pudo guardar el usuario (¿nombre de usuario repetido?)' };
        const sucUsuario = ['admin', 'superadmin'].includes(rolNuevo) ? null : idSucursalValido(db, d.sucursal_id);
        if (d.id) {
            const u = db.usuarios.find(x => x.id === d.id);
            if (u && String(u.rol).toLowerCase() === 'superadmin' && !esSuper) throw new HttpError(403, 'Solo un superadmin puede modificar a otro superadmin');
            if (u) {
                u.nombre = d.nombre; u.username = d.username;
                if (String(u.rol).toLowerCase() !== 'superadmin') u.rol = rolNuevo;
                u.sucursal_id = String(u.rol).toLowerCase() === 'superadmin' ? null : sucUsuario;
                if (d.pin) u.pin = await hashClave(String(d.pin));
            }
        } else {
            if (!d.pin) return { success: false, error: 'El PIN es obligatorio al crear un usuario' };
            db.usuarios.push({ id: siguienteId(db, 'usuarios'), nombre: d.nombre, username: d.username, pin: await hashClave(String(d.pin)), rol: rolNuevo, sucursal_id: sucUsuario });
        }
        return { success: true, msg: 'Usuario guardado exitosamente' };
    });
    ruta('POST', '/api/usuarios/eliminar', (ctx, db) => {
        const admin = requiereAdmin(ctx);
        const u = db.usuarios.find(x => x.id === ctx.body.id);
        if (u && String(u.rol).toLowerCase() === 'superadmin' && String(admin.rol).toLowerCase() !== 'superadmin') throw new HttpError(403, 'Solo un superadmin puede eliminar a otro superadmin');
        if (u && String(u.username).toLowerCase() === String(admin.sub).toLowerCase()) throw new HttpError(400, 'No puedes eliminar tu propio usuario');
        if (u) db.usuarios = db.usuarios.filter(x => x.id !== u.id);
        return ok();
    });

    // ---- Clientes ----
    function listaDirecciones(v) { try { const l = JSON.parse(v || '[]'); return Array.isArray(l) ? l.filter(Boolean).map(String) : []; } catch (e) { return []; } }
    function buscarCliente(db, tel) { const c = db.clientes.find(x => x.telefono === tel); if (!c) throw new HttpError(404, 'Cliente no encontrado'); return c; }
    function validarClaveNueva(clave) {
        clave = clave || '';
        if (clave.trim().length < 4) throw new HttpError(400, 'La clave debe tener al menos 4 caracteres.');
        if (clave.length > 64) throw new HttpError(400, 'La clave es demasiado larga.');
        return clave;
    }
    async function exigirClave(cliente, clave) {
        const k = 'clave-cliente:' + cliente.telefono;
        if (cupoAgotado(k, 5, 15 * 60)) throw new HttpError(429, 'Demasiados intentos con una clave incorrecta. Espera 15 minutos.');
        if (!cliente.clave_hash) throw new HttpError(403, 'Todavía no tienes una clave. Cierra sesión y vuelve a entrar para crearla.');
        if (!clave) throw new HttpError(401, 'Para este cambio necesitamos tu clave.');
        if (!(await verificarClave(clave, cliente.clave_hash))) { anotarFallo(k); throw new HttpError(401, 'La clave no es correcta.'); }
        olvidarFallos(k);
    }
    ruta('GET', '/api/clientes/verificar', (ctx, db) => {
        const c = db.clientes.find(x => x.telefono === ctx.query.telefono);
        return c ? [{ nombre: c.nombre, telefono: c.telefono, direccion_principal: c.direccion_principal, direcciones_extra: c.direcciones_extra, tiene_clave: !!c.clave_hash }] : [];
    });
    ruta('POST', '/api/clientes/registrar', async (ctx, db) => {
        const d = ctx.body; const tel = limpiarTexto(d.telefono, 30);
        if (!telefonoPublicoValido(tel)) throw new HttpError(400, 'El número de teléfono no es válido.');
        const clave = validarClaveNueva(d.clave);
        if (db.clientes.some(c => c.telefono === tel)) throw new HttpError(400, 'El cliente ya está registrado.');
        const extras = listaDirecciones(d.direcciones_extra).map(x => limpiarTexto(x, 300)).slice(0, 15);
        db.clientes.push({ telefono: tel, nombre: limpiarTexto(d.nombre, 80) || 'Cliente', cedula: limpiarTexto(d.cedula, 20) || null, direccion_principal: limpiarTexto(d.direccion_principal, 300), direcciones_extra: JSON.stringify(extras), clave_hash: await hashClave(clave) });
        return { status: 'success', mensaje: 'Cliente registrado exitosamente' };
    });
    ruta('POST', '/api/clientes/crear-clave', async (ctx, db) => {
        const c = buscarCliente(db, ctx.body.telefono);
        if (c.clave_hash) throw new HttpError(400, 'Este número ya tiene una clave. Si la olvidaste, pide al personal que la restablezca.');
        c.clave_hash = await hashClave(validarClaveNueva(ctx.body.clave));
        return { status: 'success' };
    });
    ruta('POST', '/api/clientes/restablecer-clave', (ctx, db) => {
        requiereStaff(ctx);
        const c = buscarCliente(db, ctx.body.telefono); c.clave_hash = null; olvidarFallos('clave-cliente:' + c.telefono);
        return ok();
    });
    ruta('POST', '/api/clientes/actualizar-telefono', async (ctx, db) => {
        const d = ctx.body; const nuevo = limpiarTexto(d.telefono_nuevo, 30);
        if (!nuevo) throw new HttpError(400, 'El nuevo número no puede estar vacío.');
        if (!telefonoPublicoValido(nuevo)) throw new HttpError(400, 'El número de teléfono no es válido.');
        const c = buscarCliente(db, d.telefono_actual);
        await exigirClave(c, d.clave);
        if (nuevo !== d.telefono_actual && db.clientes.some(x => x.telefono === nuevo)) throw new HttpError(400, 'Ese número ya está registrado con otra cuenta.');
        c.telefono = nuevo;
        return { status: 'success', mensaje: 'Número de teléfono actualizado correctamente' };
    });
    ruta('GET', '/api/clientes/buscar', (ctx, db) => {
        requiereStaff(ctx);
        const t = String(ctx.query.q || '').trim().toLowerCase();
        if (!t) return [];
        return db.clientes.filter(c => [c.telefono, c.nombre, c.cedula].some(v => String(v || '').toLowerCase().includes(t))).slice(0, 15).map(c => {
            const peds = db.pedidos.filter(p => p.telefono === c.telefono);
            const fin = peds.filter(p => String(p.estado || '').trim().toLowerCase().replace(/ /g, '') === 'finalizado');
            const stamps = peds.map(p => p.timestamp).filter(Boolean);
            return { telefono: c.telefono, nombre: c.nombre, cedula: c.cedula, direccion_principal: c.direccion_principal, direcciones_extra: c.direcciones_extra, tiene_clave: !!c.clave_hash, total_pedidos: peds.length, pedidos_finalizados: fin.length, total_gastado_usd: Math.round(fin.reduce((s, p) => s + (p.total_orden || 0), 0) * 100) / 100, ultimo_pedido: stamps.length ? stamps.sort().slice(-1)[0] : null };
        });
    });
    ruta('POST', '/api/clientes/actualizar-direcciones-cliente', async (ctx, db) => {
        const d = ctx.body; const c = buscarCliente(db, d.telefono);
        const viejas = listaDirecciones(c.direcciones_extra).map(x => limpiarTexto(x, 300));
        const nuevas = d.direcciones_extra == null ? viejas : listaDirecciones(d.direcciones_extra).map(x => limpiarTexto(x, 300));
        if (nuevas.length > 15) throw new HttpError(400, 'Puedes guardar hasta 15 direcciones adicionales.');
        const pVieja = limpiarTexto(c.direccion_principal, 300);
        const pNueva = d.direccion_principal == null ? null : limpiarTexto(d.direccion_principal, 300);
        const quita = viejas.some(x => !nuevas.includes(x));
        const cambiaPrincipal = pNueva !== null && pVieja && pNueva !== pVieja;
        if (quita || cambiaPrincipal) await exigirClave(c, d.clave);
        if (pNueva !== null) c.direccion_principal = pNueva;
        if (d.direcciones_extra != null) c.direcciones_extra = JSON.stringify(nuevas);
        return { status: 'success', mensaje: 'Direcciones actualizadas correctamente' };
    });

    // ---- Pedidos ----
    ruta('POST', '/api/pedidos', (ctx, db) => {
        const staff = staffOpcional(ctx); const esPersonal = !!staff; const p = ctx.body || {};
        if (!Array.isArray(p.articulos) || !p.cliente || !p.telefono || !p.tipo_entrega || !p.metodo_pago) throw new HttpError(422, 'Pedido incompleto');
        const cliente = limpiarTexto(p.cliente, 80) || 'Cliente';
        const direccion = limpiarTexto(p.direccion, 300);
        const tipo = limpiarTexto(p.tipo_entrega, 40);
        const metodoPago = limpiarTexto(p.metodo_pago, 40);
        const telefono = limpiarTexto(p.telefono, 30);

        if (!esPersonal && !telefonoPublicoValido(telefono)) throw new HttpError(400, 'El número de teléfono no es válido.');
        if (!esPersonal && !estaAbiertoAhora(db)) throw new HttpError(403, 'El restaurante está cerrado en este momento. Intenta durante el horario de atención.');

        // Sucursal del pedido: la fija del personal, o la que eligió el cliente
        const activas = sucursalesActivas(db);
        let sid = (esPersonal && sucursalDelPersonal(ctx, db)) || parseInt(p.sucursal_id, 10) || null;
        if (sid && !activas.some(s => s.id === sid)) sid = null;
        if (!sid) {
            if (activas.length === 1) sid = activas[0].id;
            else if (activas.length > 1) throw new HttpError(400, 'Selecciona la sucursal donde quieres pedir.');
        }
        const suc = sid ? db.sucursales.find(s => s.id === sid) : null;

        const esMesa = esEntregaMesa(tipo);
        const mesa = esMesa ? db.mesas.find(m => m.nombre === direccion && mesaEnSucursal(m, sid)) : null;
        if (esMesa && !mesa) throw new HttpError(400, 'Selecciona una mesa válida.');

        const tasa = tasaVigente(db);
        const cli = db.clientes.find(c => c.telefono === telefono);
        const { texto, total } = construirResumenPedido(db, p.articulos, esPersonal, sid);
        const emp = calcularEmpaque(db, p.articulos);
        const esPickup = esEntregaPickup(tipo);

        const nuevo = {
            id: siguienteId(db, 'pedidos'), cliente, telefono, timestamp: ahoraCaracas(), fecha: hoyCaracas(),
            tipo_entrega: tipo, direccion, metodo_pago: metodoPago, pedido_detallado: texto, total_orden: total,
            estado: esMesa ? 'En Cocina' : (esPickup ? 'Pago Pendiente' : 'Calculando Delivery'), procesado_por: esMesa ? 'Pedido en mesa' : 'Sistema Automatizado',
            referencia_pago: ['Efectivo', 'Punto de Venta'].includes(metodoPago) ? null : 'Pendiente',
            imagen_pago: null, repartidor: null, tasa_bcv: tasa, cedula: cli ? cli.cedula : null,
            precio_delivery: null, paga_con: null,
            total_bandejas: emp.bandejas, total_cajas_pizza: emp.cajas_pizza, total_refrescos: emp.refrescos,
            sucursal_id: sid, sucursal_nombre: suc ? suc.nombre : null
        };
        db.pedidos.push(nuevo);
        const idVisual = contarNumeroDiario(db, nuevo);

        if (mesa && mesa.estado === 'libre') { mesa.estado = 'ocupada'; mesa.ocupada_desde = nuevo.timestamp; }

        let mensaje;
        if (esMesa) {
            const pl = db.mensajes.find(x => x.id === 'recepcion_mesa');
            mensaje = aplicarPlaceholders(pl ? pl.texto : PLANTILLAS.recepcion_mesa, { '[CLIENTE]': cliente, '[PEDIDO]': idVisual, '[MESA]': mesa.nombre });
        } else if (esPickup) {
            const m = metodoPago.toLowerCase();
            const plantillaId = m.includes('zelle') ? 'cobro_zelle' : (m.includes('efectivo') ? 'cobro_efectivo' : 'cobro_pago_movil');
            const pl = db.mensajes.find(x => x.id === plantillaId);
            const bs = (total * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            mensaje = pl ? aplicarPlaceholders(pl.texto, { '[CLIENTE]': cliente, '[PEDIDO_DETALLADO]': texto, '[PEDIDO]': idVisual, '[TOTAL_USD]': total.toFixed(2), '[TOTAL_BS]': bs })
                : `¡Hola ${cliente}! Tu pedido #${idVisual} está listo para ser pagado. Total: $${total.toFixed(2)}`;
        } else {
            const pl = db.mensajes.find(x => x.id === 'recepcion');
            mensaje = pl ? aplicarPlaceholders(pl.texto, { '[CLIENTE]': cliente, '[PEDIDO]': idVisual })
                : `🍔 ¡Hola, ${cliente}! Hemos recibido tu pedido #${idVisual}. En breve calcularemos el delivery.`;
        }
        enviarWhatsappSimulado(db, telefono, mensaje, 'nuevo pedido');
        ctx.tras.push(() => emitirTablero(esPickup ? 'actualizacion' : 'nuevo_pedido', sid));
        if (esMesa) ctx.tras.push(() => emitirTablero('mesas', sid));
        return { success: true, pedido: { id: nuevo.id, id_visual: idVisual, total }, sucursal: suc ? { id: suc.id, nombre: suc.nombre, whatsapp: suc.whatsapp || '', telefono: suc.telefono || '' } : null };
    });

    function filtrarFecha(db, q, filtro) {
        const re = /^\d{4}-\d{2}-\d{2}$/;
        ['fecha', 'fecha_desde', 'fecha_hasta'].forEach(k => { if (q[k] && !re.test(q[k])) throw new HttpError(400, 'Formato de fecha inválido (YYYY-MM-DD)'); });
        let lista = db.pedidos.filter(filtro || (() => true));
        if (q.fecha) return lista.filter(p => p.fecha === q.fecha).sort((a, b) => a.id - b.id);
        if (q.fecha_desde || q.fecha_hasta) {
            if (q.fecha_desde) lista = lista.filter(p => p.fecha >= q.fecha_desde);
            if (q.fecha_hasta) lista = lista.filter(p => p.fecha <= q.fecha_hasta);
            return lista.sort((a, b) => a.id - b.id);
        }
        return lista.sort((a, b) => b.id - a.id).slice(0, 150);
    }
    ruta('GET', '/api/pedidos', (ctx, db) => { requiereStaff(ctx); const sid = sucursalDelPersonal(ctx, db) || parseInt(ctx.query.sucursal, 10) || 0; return filtrarFecha(db, ctx.query, sid ? (x => Number(x.sucursal_id) === sid) : null).map(p => Object.assign({}, p, { id_pedido: p.id })); });

    ruta('POST', '/api/pedidos/actualizar-estado', (ctx, db) => {
        requiereStaff(ctx); const d = ctx.body || {};
        const id = d.id || d.id_pedido;
        const p = db.pedidos.find(x => x.id === Number(id));
        if (!p) return { success: false, msg: 'Pedido no encontrado' };
        exigirSucursal(ctx, db, p);
        ['estado', 'procesado_por', 'referencia_pago', 'imagen_pago', 'repartidor', 'total_orden', 'pedido_detallado', 'tasa_bcv', 'precio_delivery', 'paga_con'].forEach(k => { if (k in d) p[k] = d[k]; });
        if (d.articulos && d.articulos.length) {
            const emp = calcularEmpaque(db, d.articulos);
            p.total_bandejas = emp.bandejas; p.total_cajas_pizza = emp.cajas_pizza; p.total_refrescos = emp.refrescos;
        }
        ctx.tras.push(() => emitirTablero('actualizacion'));
        return { success: true };
    });

    ruta('POST', '/api/pedidos/editar', (ctx, db) => {
        requiereStaff(ctx); const d = ctx.body || {};
        const p = db.pedidos.find(x => x.id === Number(d.id));
        if (!p) throw new HttpError(404, 'Pedido no encontrado');
        exigirSucursal(ctx, db, p);
        if (!d.articulos || !d.articulos.length) throw new HttpError(400, 'El pedido editado llego sin articulos');
        const { texto, total } = construirResumenPedido(db, d.articulos, true, p.sucursal_id);
        const emp = calcularEmpaque(db, d.articulos);
        p.pedido_detallado = texto; p.total_orden = total;
        p.total_bandejas = emp.bandejas; p.total_cajas_pizza = emp.cajas_pizza; p.total_refrescos = emp.refrescos;
        const largos = { cliente: 80, direccion: 300, metodo_pago: 40, procesado_por: 80 };
        Object.keys(largos).forEach(c => { if (d[c]) p[c] = limpiarTexto(d[c], largos[c]); });
        ctx.tras.push(() => emitirTablero('edicion'));
        return { success: true, pedido_detallado: texto, total_orden: total, tasa_bcv: p.tasa_bcv || 0 };
    });

    ruta('POST', '/api/pedidos/notificar-edicion', (ctx, db) => {
        requiereStaff(ctx); const d = ctx.body;
        const id = obtenerIdDiario(db, d.id_visual);
        const pl = db.mensajes.find(x => x.id === 'modificado');
        let msg;
        if (pl) { msg = aplicarPlaceholders(pl.texto, { '[CLIENTE]': d.cliente, '[PEDIDO_DETALLADO]': d.pedido_detallado, '[TOTAL_USD]': String(+Number(d.total_orden).toPrecision(12)), '[PEDIDO]': id }); if (d.texto_bolivares) msg += '\n' + d.texto_bolivares; }
        else msg = `⚠️ ¡Hola ${d.cliente}! Hemos actualizado tu orden.\n\n${d.pedido_detallado}\n\n💰 Nuevo Total: $${d.total_orden}${d.texto_bolivares || ''}`;
        enviarWhatsappSimulado(db, d.telefono, msg, 'edición de pedido');
        return { success: true, mensaje: 'Notificación dinámica enviada' };
    });
    ruta('POST', '/api/pedidos/notificar-cobro', (ctx, db) => {
        requiereStaff(ctx); const d = ctx.body;
        const id = obtenerIdDiario(db, d.id_visual);
        const m = String(d.metodo_pago || '').toLowerCase();
        const plId = (m.includes('movil') || m.includes('móvil')) ? 'cobro_pago_movil' : (m.includes('zelle') ? 'cobro_zelle' : 'cobro_efectivo');
        const pl = db.mensajes.find(x => x.id === plId);
        const msg = pl ? aplicarPlaceholders(pl.texto, { '[CLIENTE]': d.cliente, '[PEDIDO_DETALLADO]': d.pedido_detallado, '[TOTAL_USD]': String(+Number(d.total_orden).toPrecision(12)), '[TOTAL_BS]': d.total_bs || '', '[PEDIDO]': id })
            : `Hola ${d.cliente}, tu pedido está listo. Total: $${d.total_orden}.`;
        enviarWhatsappSimulado(db, d.telefono, msg, 'cobro');
        return { success: true, mensaje: 'Cobro enviado usando plantilla: ' + plId };
    });
    ruta('POST', '/api/pedidos/notificar-aprobado', (ctx, db) => {
        requiereStaff(ctx); const d = ctx.body;
        const id = obtenerIdDiario(db, d.id_visual);
        const pl = db.mensajes.find(x => x.id === 'aprobado');
        let tiempo = String(d.tiempo_estimado || '').trim();
        if (tiempo && !/minuto|hora/i.test(tiempo)) tiempo += ' minutos';
        let msg;
        if (pl) {
            const texto = pl.texto.replace(/\[TIEMPO_ESTIMADO\]\s*(?:minutos|minuto|mins|min)\.?/gi, '[TIEMPO_ESTIMADO]');
            msg = aplicarPlaceholders(texto, { '[CLIENTE]': d.cliente, '[PEDIDO]': id, '[TIEMPO_ESTIMADO]': tiempo });
        } else msg = `¡Hola ${d.cliente}! ✅ Tu pago ha sido aprobado. Tu pedido ya está preparándose y estará listo en ${tiempo} aproximadamente.`;
        enviarWhatsappSimulado(db, d.telefono, msg, 'aprobación');
        return { success: true, mensaje: 'Notificación de aprobación enviada' };
    });

    function formatearNombreMotorizado(telefono, cliente) {
        const crudo = String(telefono || '').trim();
        const digitos = crudo.replace(/\D/g, '');
        if (!digitos) return cliente || 'Sin telefono';
        let legible = crudo;
        if (!crudo.startsWith('+') && digitos.length === 11 && digitos.startsWith('0')) legible = `+58 ${digitos.slice(1, 4)}-${digitos.slice(4)}`;
        return `${digitos.slice(-4)}     ${legible}`;
    }
    function textoPago(p) {
        const metodo = String((p && p.metodo_pago) || '').trim();
        if (!metodo.toLowerCase().includes('efectivo')) return metodo ? `YA PAGO (${metodo})` : 'YA PAGO';
        let t = 'COBRAR EN EFECTIVO';
        if (p.total_orden != null) t += ` $${Number(p.total_orden).toFixed(2)}`;
        const pc = String(p.paga_con || '').trim();
        if (pc) t += ` - paga con ${pc}`;
        return t;
    }
    ruta('POST', '/api/pedidos/notificar-despacho', (ctx, db) => {
        requiereStaff(ctx); const d = ctx.body;
        const id = obtenerIdDiario(db, d.id_visual);
        if (esEntregaMesa(d.tipo_entrega)) {
            const pm = db.pedidos.find(x => String(x.id) === String(d.id_visual));
            const pl = db.mensajes.find(x => x.id === 'final_mesa');
            enviarWhatsappSimulado(db, d.telefono, aplicarPlaceholders(pl ? pl.texto : PLANTILLAS.final_mesa, { '[CLIENTE]': d.cliente, '[PEDIDO]': id, '[MESA]': (pm && pm.direccion) || d.direccion || 'mesa' }), 'pedido listo en mesa');
            return { success: true, mensaje: 'Notificaciones procesadas' };
        }
        const esDelivery = String(d.tipo_entrega || '').toLowerCase().includes('delivery');
        const plCli = db.mensajes.find(x => x.id === (esDelivery ? 'final_delivery' : 'final_pickup'));
        const msgCli = plCli ? aplicarPlaceholders(plCli.texto, { '[CLIENTE]': d.cliente, '[PEDIDO]': id }) : `¡Hola ${d.cliente}! Tu pedido (${d.tipo_entrega}) está listo y despachado.`;
        enviarWhatsappSimulado(db, d.telefono, msgCli, 'despacho al cliente');

        if (esDelivery) {
            const p = db.pedidos.find(x => String(x.id) === String(d.id_visual));
            const telefono = (p && p.telefono) || d.telefono;
            const direccion = String((p && p.direccion) || d.direccion || '').trim();
            const pd = p ? p.precio_delivery : null;
            const reemplazos = {
                '[PEDIDO]': id, '[NOMBRE]': formatearNombreMotorizado(telefono, d.cliente), '[CLIENTE]': d.cliente, '[TELEFONO]': telefono || '',
                '[DIRECCION]': direccion || 'Sin direccion', '[REFRESCOS]': (p && p.total_refrescos) || 0, '[BANDEJAS]': (p && p.total_bandejas) || 0,
                '[CAJAS_PIZZA]': (p && p.total_cajas_pizza) || 0, '[PAGO]': textoPago(p), '[PRECIO_DELIVERY]': pd != null ? `${+Number(pd).toPrecision(12)}$` : '-'
            };
            const plG = db.mensajes.find(x => x.id === 'aviso_grupo_delivery');
            let texto = (plG && plG.texto) || '';
            if (!texto.includes('[BANDEJAS]')) texto = PLANTILLA_AVISO_MOTORIZADOS;
            enviarWhatsappSimulado(db, 'Grupo de repartidores (simulado)', aplicarPlaceholders(texto, reemplazos), 'aviso al grupo de motorizados');
        }
        return { success: true, mensaje: 'Notificaciones procesadas' };
    });

    // ---- Mesas ----
    function pedidosDeMesa(db, mesa) {
        if (mesa.estado === 'libre' || !mesa.ocupada_desde) return [];
        return db.pedidos.filter(p => esEntregaMesa(p.tipo_entrega) && p.direccion === mesa.nombre && (!mesa.sucursal_id || Number(p.sucursal_id) === Number(mesa.sucursal_id)) && p.timestamp >= mesa.ocupada_desde && p.estado !== 'Cancelado')
            .sort((a, b) => a.id - b.id);
    }
    ruta('GET', '/api/mesas', (ctx, db) => {
        const staff = staffOpcional(ctx);
        const sidM = (staff && sucursalDelPersonal(ctx, db)) || parseInt(ctx.query.sucursal, 10) || 0;
        return db.mesas.filter(m => mesaEnSucursal(m, sidM)).sort((a, b) => a.id - b.id).map(m => {
            const base = { id: m.id, nombre: m.nombre, zona: m.zona, capacidad: m.capacidad, estado: m.estado, sucursal_id: m.sucursal_id || null };
            if (!staff) return base;
            const ped = pedidosDeMesa(db, m);
            return Object.assign(base, { ocupada_desde: m.ocupada_desde, pedidos: ped.length, consumo: Math.round(ped.reduce((s, p) => s + (p.total_orden || 0), 0) * 100) / 100 });
        });
    });
    ruta('GET', '/api/mesas/cuenta', (ctx, db) => {
        requiereStaff(ctx);
        const m = db.mesas.find(x => x.id === parseInt(ctx.query.id, 10));
        if (!m) throw new HttpError(404, 'Mesa no encontrada');
        if (!mesaEnSucursal(m, sucursalDelPersonal(ctx, db))) throw new HttpError(403, 'Esa mesa es de otra sucursal.');
        const ped = pedidosDeMesa(db, m);
        return { mesa: { id: m.id, nombre: m.nombre, zona: m.zona, capacidad: m.capacidad, estado: m.estado, ocupada_desde: m.ocupada_desde }, pedidos: ped.map(p => Object.assign({}, p, { id_pedido: p.id })), total: Math.round(ped.reduce((s, p) => s + (p.total_orden || 0), 0) * 100) / 100, tasa_bcv: tasaVigente(db) };
    });
    ruta('POST', '/api/mesas/guardar', (ctx, db) => {
        requiereAdmin(ctx); const d = ctx.body || {};
        const nombre = limpiarTexto(d.nombre, 30); const zona = limpiarTexto(d.zona, 30) || 'Salón';
        const capacidad = Math.max(1, Math.min(30, parseInt(d.capacidad, 10) || 4));
        if (!nombre) return { success: false, error: 'La mesa necesita un nombre.' };
        const sucMesa = idSucursalValido(db, d.sucursal_id);
        if (db.mesas.some(m => m.nombre.toLowerCase() === nombre.toLowerCase() && m.id !== d.id && Number(m.sucursal_id || 0) === Number(sucMesa || 0))) return { success: false, error: 'Ya existe una mesa con ese nombre.' };
        if (d.id) {
            const m = db.mesas.find(x => x.id === d.id);
            if (!m) return { success: false, error: 'Mesa no encontrada.' };
            if (m.nombre !== nombre) db.pedidos.filter(p => esEntregaMesa(p.tipo_entrega) && p.direccion === m.nombre && (!m.sucursal_id || Number(p.sucursal_id) === Number(m.sucursal_id))).forEach(p => { p.direccion = nombre; });
            m.nombre = nombre; m.zona = zona; m.capacidad = capacidad; m.sucursal_id = sucMesa;
        } else {
            db.mesas.push({ id: siguienteId(db, 'mesas'), nombre, zona, capacidad, estado: 'libre', ocupada_desde: null, sucursal_id: sucMesa });
        }
        ctx.tras.push(() => emitirTablero('mesas'));
        return ok();
    });
    ruta('POST', '/api/mesas/eliminar', (ctx, db) => {
        requiereAdmin(ctx);
        const m = db.mesas.find(x => x.id === ctx.body.id);
        if (!m) return ok();
        if (m.estado !== 'libre') return { success: false, error: 'La mesa está en uso. Libérala antes de eliminarla.' };
        db.mesas = db.mesas.filter(x => x.id !== m.id);
        ctx.tras.push(() => emitirTablero('mesas'));
        return ok();
    });
    ruta('POST', '/api/mesas/estado', (ctx, db) => {
        const staff = requiereStaff(ctx); const d = ctx.body || {};
        const m = db.mesas.find(x => x.id === d.id);
        if (!m) throw new HttpError(404, 'Mesa no encontrada');
        if (!mesaEnSucursal(m, sucursalDelPersonal(ctx, db))) throw new HttpError(403, 'Esa mesa es de otra sucursal.');
        let total = 0;
        if (d.estado === 'libre') {
            const ped = pedidosDeMesa(db, m);
            total = ped.reduce((s, p) => s + (p.total_orden || 0), 0);
            // Al cobrar la cuenta, lo que siga abierto se da por entregado y pagado
            ped.forEach(p => { if (p.estado !== 'Finalizado') { p.estado = 'Finalizado'; p.procesado_por = 'Cuenta cobrada en mesa'; } });
            m.estado = 'libre'; m.ocupada_desde = null;
        } else if (d.estado === 'ocupada') {
            if (m.estado === 'libre') m.ocupada_desde = ahoraCaracas();
            m.estado = 'ocupada';
        } else if (d.estado === 'cuenta') {
            if (m.estado === 'libre') throw new HttpError(400, 'La mesa está libre: no tiene cuenta.');
            m.estado = 'cuenta';
        } else throw new HttpError(422, 'Estado inválido');
        ctx.tras.push(() => emitirTablero('mesas'));
        return { success: true, total: Math.round(total * 100) / 100 };
    });


// ---- Web pública: datos del sitio y sucursales ----
const SITIO_VACIO = { titulo: '', eslogan: '', historia: '', whatsapp: '', instagram: '', facebook: '', tiktok: '', email: '', colorPrincipal: '', colorSecundario: '', colorPortada: '', imagenPortada: '', logo: '', tituloSobrePortada: false };
const colorOk = v => (/^#[0-9a-fA-F]{6}$/.test(String(v || '').trim()) ? String(v).trim().toLowerCase() : '');
function esAdminSesion(ctx) { return !!ctx.sesion && ['admin', 'superadmin'].includes(String(ctx.sesion.rol || '').toLowerCase()); }
function urlSegura(v) { v = limpiarTexto(v, 400, true); return /^https:\/\//i.test(v) ? v : ''; }
ruta('GET', '/api/sitio', (ctx, db) => {
    const todas = ctx.query.todas === '1' && esAdminSesion(ctx);
    const habilitadas = new Set(sucursalesActivas(db).map(s => s.id));
    const sucursales = todas
        ? (db.sucursales || []).map(s => Object.assign({}, s, { fuera_de_plan: s.activa !== false && !habilitadas.has(s.id) }))
        : (db.sucursales || []).filter(s => habilitadas.has(s.id));
    const resenas = (db.resenas || []).filter(r => todas || r.activa !== false);
    return { sitio: Object.assign({}, SITIO_VACIO, db.sitio || {}), sucursales, limite_sucursales: LIMITE_SUCURSALES, galeria: db.galeria || [], resenas };
});
ruta('POST', '/api/sitio/guardar', (ctx, db) => {
    requiereAdmin(ctx); const d = ctx.body || {}; const s = d.sitio || {};
    db.sitio = {
        titulo: limpiarTexto(s.titulo, 80, true), eslogan: limpiarTexto(s.eslogan, 160, true), historia: limpiarTexto(s.historia, 800),
        whatsapp: String(s.whatsapp || '').replace(/\D/g, '').slice(0, 18), instagram: limpiarTexto(s.instagram, 60, true).replace(/^@/, ''),
        facebook: limpiarTexto(s.facebook, 200, true), tiktok: limpiarTexto(s.tiktok, 200, true).replace(/^@/, ''),
        email: limpiarTexto(s.email, 120, true),
        colorPrincipal: colorOk(s.colorPrincipal), colorSecundario: colorOk(s.colorSecundario), colorPortada: colorOk(s.colorPortada),
        imagenPortada: urlSegura(s.imagenPortada), logo: urlSegura(s.logo), tituloSobrePortada: s.tituloSobrePortada === true
    };
    const lista = Array.isArray(d.sucursales) ? d.sucursales.slice(0, 12) : [];
    // El plan limita cuántas sucursales activas puede tener el negocio (solo se bloquea si se intenta AUMENTAR)
    const activasNuevas = lista.filter(x => x.activa !== false).length;
    const activasPrevias = (db.sucursales || []).filter(s => s.activa !== false).length;
    if (activasNuevas > LIMITE_SUCURSALES && activasNuevas > activasPrevias) {
        return { success: false, error: LIMITE_SUCURSALES === 1 ? 'Tu plan es para un solo local, sin sucursales adicionales.' : `Tu plan permite hasta ${LIMITE_SUCURSALES} locales (principal + sucursales).` };
    }
    db.sucursales = lista.map(x => ({
        id: Number(x.id) > 0 ? Number(x.id) : siguienteId(db, 'sucursales'),
        nombre: limpiarTexto(x.nombre, 80, true) || 'Sucursal', direccion: limpiarTexto(x.direccion, 240, true), telefono: limpiarTexto(x.telefono, 30, true),
        horario: limpiarTexto(x.horario, 120, true), mapa: urlSegura(x.mapa), activa: x.activa !== false,
        whatsapp: String(x.whatsapp || '').replace(/\D/g, '').slice(0, 18),
        coords: /^-?\d{1,3}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?$/.test(String(x.coords || '').trim()) ? String(x.coords).replace(/\s+/g, '') : ''
    }));
    if (Array.isArray(d.galeria)) {
        db.galeria = d.galeria.slice(0, 12).map(g => ({ url: urlSegura(g.url), titulo: limpiarTexto(g.titulo, 80, true) })).filter(g => g.url);
    }
    if (Array.isArray(d.resenas)) {
        db.resenas = d.resenas.slice(0, 12).map(r => ({
            id: Number(r.id) > 0 ? Number(r.id) : siguienteId(db, 'resenas'),
            nombre: limpiarTexto(r.nombre, 60, true), texto: limpiarTexto(r.texto, 300),
            estrellas: Math.min(5, Math.max(1, parseInt(r.estrellas, 10) || 5)), activa: r.activa !== false
        })).filter(r => r.nombre && r.texto);
    }
    return ok();
});
ruta('GET', '/api/salud', () => ({ status: 'ok', base_de_datos: 'supabase' }));

export { rutas, HttpError, ahoraCaracas };
