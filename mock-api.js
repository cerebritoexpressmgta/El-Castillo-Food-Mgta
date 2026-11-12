// =====================================================================
// PROTOTIPO COMIDA RÁPIDA - servidor simulado dentro del navegador
// =====================================================================
// No hay backend ni base de datos real. Este archivo intercepta las llamadas
// `fetch` a "/api/..." y las responde con la misma forma que el backend
// FastAPI original, guardando todo en el localStorage del visitante.
//
// - Cada visitante tiene SU PROPIA copia de los datos (no se ven entre sí).
// - Nada sale a internet: WhatsApp y Pusher están simulados.
// - Se cargan al primer uso con datos inventados. "Reiniciar demo" (botón
//   flotante) los vuelve a generar.
//
// Debe cargarse DESPUÉS de config.js y ANTES del JS de cada página.
(function () {
    'use strict';

    const STORAGE_KEY = 'prototipoCF.db.v1';
    const VERSION_DATOS = 3;
    const FETCH_REAL = window.fetch.bind(window);
    const CFG = window.DEMO_CONFIG || {};
    const MARCA_KEY = 'prototipoCF.marca';
    const PARAMS = new URLSearchParams(location.search);
    // Dentro de los marcos de la web de presentación se mantiene "embebido" aunque la
    // página navegue a otra (ej. del tablero a la caja): la bandera vive en la pestaña.
    let EMBED = PARAMS.get('embed') === '1';
    try {
        if (EMBED) sessionStorage.setItem('cfEmbed', '1'); else EMBED = sessionStorage.getItem('cfEmbed') === '1';
    } catch (e) { /* sin sessionStorage */ }

    // Marca vigente: lo que dice demo-config.js, salvo que el visitante la haya
    // cambiado desde la web de presentación (se guarda aparte, sin tocar los datos).
    function marca() {
        let o = {};
        try { o = JSON.parse(localStorage.getItem(MARCA_KEY) || '{}') || {}; } catch (e) { /* ignora */ }
        return {
            nombre: String(o.nombre || CFG.nombreNegocio || 'Mi Restaurante').slice(0, 40),
            emoji: String(o.emoji || CFG.emoji || '🍔').slice(0, 8),
            eslogan: String(CFG.eslogan || '')
        };
    }
    window.MARCA = marca();

    // ------------------------------------------------------------------
    // Almacenamiento (localStorage, con respaldo en memoria)
    // ------------------------------------------------------------------
    let memoria = null;
    function leerCrudo() {
        try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return memoria; }
    }
    function escribirCrudo(texto) {
        try { localStorage.setItem(STORAGE_KEY, texto); } catch (e) {
            if (e && /quota/i.test(String(e.name) + String(e.message))) throw new Error('ALMACENAMIENTO_LLENO');
            memoria = texto;
        }
    }
    function cargarDb() {
        const crudo = leerCrudo();
        if (crudo) {
            try {
                const db = JSON.parse(crudo);
                if (db && db.version === VERSION_DATOS) return db;
            } catch (e) { /* datos dañados: se regeneran */ }
        }
        const nueva = generarDatosDemo();
        guardarDb(nueva);
        return nueva;
    }
    function guardarDb(db) { escribirCrudo(JSON.stringify(db)); }
    function siguienteId(db, tabla) { db.seq[tabla] = (db.seq[tabla] || 0) + 1; return db.seq[tabla]; }

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
    // Sesión del personal (token simulado, 12 h)
    // ------------------------------------------------------------------
    function crearToken(username, rol) {
        const payload = { sub: username, rol, exp: Date.now() + 12 * 3600e3 };
        return 'demo.' + btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    }
    function decodificar(authorization) {
        if (!authorization || !String(authorization).startsWith('Bearer ')) throw new HttpError(401, 'No autenticado');
        const token = String(authorization).slice(7).trim();
        if (!token.startsWith('demo.')) throw new HttpError(401, 'Token inválido');
        let p;
        try { p = JSON.parse(decodeURIComponent(escape(atob(token.slice(5))))); } catch (e) { throw new HttpError(401, 'Token inválido'); }
        if (!p || !p.exp) throw new HttpError(401, 'Token inválido');
        if (Date.now() > p.exp) throw new HttpError(401, 'Sesión expirada');
        return p;
    }
    function requiereStaff(ctx) { return decodificar(ctx.authorization); }
    function requiereAdmin(ctx) {
        const p = decodificar(ctx.authorization);
        if (!['admin', 'superadmin'].includes(String(p.rol || '').toLowerCase())) throw new HttpError(403, 'Requiere privilegios de administrador');
        return p;
    }
    function staffOpcional(ctx) { try { return decodificar(ctx.authorization); } catch (e) { return null; } }

    // Fallos de login / clave (en memoria, como el limitador original)
    const fallos = {};
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

    function generarDatosDemo() {
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
            { id: siguienteId(db, 'anuncios'), imagen: bannerSvg('🧪', 'Prototipo de prueba', 'Todo es inventado', '#2563eb', '#7c3aed'), titulo: 'Esto es una demo', texto: 'Los datos son inventados y solo viven en tu navegador. Prueba lo que quieras.', activo: true, orden: 2, producto_ref: null }
        );

        // --- Usuarios del personal ---
        db.usuarios.push(
            { id: siguienteId(db, 'usuarios'), username: 'admin', pin: '1234', nombre: 'Admin Demo', rol: 'superadmin' },
            { id: siguienteId(db, 'usuarios'), username: 'cajero', pin: '1234', nombre: 'Cajero Demo', rol: 'cajero' },
            { id: siguienteId(db, 'usuarios'), username: 'cajero_carlos', pin: '1234', nombre: 'Carlos (cajero demo)', rol: 'cajero' }
        );

        // --- Clientes ---
        db.clientes.push(
            { telefono: '04120000001', nombre: 'Ana Pérez', cedula: 'V-11111111', direccion_principal: 'Av. Principal, Edif. Sol, Apto 3B', direcciones_extra: JSON.stringify(['Calle 5, Casa 12']), clave_hash: '1234' },
            { telefono: '04140000002', nombre: 'Luis Gómez', cedula: 'V-22222222', direccion_principal: 'Urb. Los Pinos, Casa 8', direcciones_extra: '[]', clave_hash: '1234' },
            { telefono: '04160000003', nombre: 'Marta Rojas', cedula: 'V-33333333', direccion_principal: 'Calle Real, Local 4', direcciones_extra: '[]', clave_hash: null }
        );

        db.motorizados.push({ id: siguienteId(db, 'motorizados'), nombre: 'Repartidor Demo 1' }, { id: siguienteId(db, 'motorizados'), nombre: 'Repartidor Demo 2' });

        for (let d = 0; d < 7; d++) db.horarios.push({ id: d + 1, dia_semana: d, activo: true, hora_apertura: '00:00', hora_cierre: '23:59' });

        Object.keys(PLANTILLAS).forEach(id => db.mensajes.push({ id, texto: PLANTILLAS[id] }));

        generarPedidosDemo(db);
        return db;
    }

    // Pedidos de ejemplo: 14 días de historial para las estadísticas + algunos de hoy en el tablero
    function generarPedidosDemo(db) {
        let semilla = 20260101;
        const azar = () => { semilla = (semilla * 1664525 + 1013904223) % 4294967296; return semilla / 4294967296; };
        const elegir = arr => arr[Math.floor(azar() * arr.length)];
        const nombres = [['Ana Pérez', '04120000001'], ['Luis Gómez', '04140000002'], ['Marta Rojas', '04160000003'],
            ['Carlos Díaz', '04120000004'], ['Sofía Ruiz', '04140000005'], ['Pedro Silva', '04160000006'], ['Lucía Mora', '04120000007']];
        const direcciones = ['Av. Principal, Edif. Sol, Apto 3B', 'Urb. Los Pinos, Casa 8', 'Calle Real, Local 4', 'Calle 5, Casa 12', 'Res. El Parque, Torre B, Piso 2'];
        const pagos = ['Pago Movil', 'Efectivo', 'Efectivo', 'Pago Movil', 'Punto de Venta'];
        const cuerpoBase = db.productos.filter(p => !p.agotado);

        const totalDias = 14;
        for (let atras = totalDias - 1; atras >= 0; atras--) {
            const fecha = isoNaive(ahoraCaracasDate(-atras * 86400e3)).slice(0, 10);
            const cantidad = atras === 0 ? 5 : 3 + Math.floor(azar() * 6);
            const horas = Array.from({ length: cantidad }, () => 11 + Math.floor(azar() * 11)).sort((a, b) => a - b);
            horas.forEach((hora, i) => {
                const [cliente, telefono] = elegir(nombres);
                const sorteo = azar();
                const esMesa = atras === 0 ? (i === 2) : sorteo < 0.30;
                const esPickup = !esMesa && (atras === 0 ? false : sorteo < 0.45);
                const mesaElegida = esMesa ? elegir(db.mesas) : null;
                const lineas = [];
                const nLineas = 1 + Math.floor(azar() * 3);
                for (let k = 0; k < nLineas; k++) {
                    if (azar() < 0.35) lineas.push({ id: 'c_' + (1 + Math.floor(azar() * db.combos.length)), name: '', price: 0, qty: 1 + Math.floor(azar() * 2), note: '' });
                    else lineas.push({ id: 'p_' + elegir(cuerpoBase).id, name: '', price: 0, qty: 1 + Math.floor(azar() * 2), note: '' });
                }
                // Los combos llevan su nombre real: así se leen igual que los de verdad
                lineas.forEach(l => { if (l.id[0] === 'c') l.name = db.combos.find(c => c.id === +l.id.slice(2)).nombre; });
                const { texto, total } = construirResumenPedido(db, lineas, true);
                const emp = calcularEmpaque(db, lineas);
                const metodo = elegir(pagos);
                const minuto = Math.floor(azar() * 60);
                const hh = String(hora).padStart(2, '0'), mm = String(minuto).padStart(2, '0');
                let estado = 'Finalizado';
                if (atras > 0 && azar() < 0.07) estado = 'Cancelado';
                if (atras === 0) estado = ['Calculando Delivery', 'Pago Pendiente', 'En Cocina', 'Finalizado', 'Finalizado'][i % 5];
                if (esMesa && atras === 0) estado = 'En Cocina';
                const pagado = estado === 'En Cocina' || estado === 'Finalizado';
                const efectivo = metodo === 'Efectivo' || metodo === 'Punto de Venta';
                db.pedidos.push({
                    id: siguienteId(db, 'pedidos'),
                    cliente, telefono,
                    timestamp: `${fecha}T${hh}:${mm}:${String(Math.floor(azar() * 60)).padStart(2, '0')}.000000`,
                    fecha,
                    tipo_entrega: esMesa ? 'Mesa' : (esPickup ? 'Pickup' : 'Delivery'),
                    direccion: esMesa ? mesaElegida.nombre : (esPickup ? 'Retiro en el local' : elegir(direcciones)),
                    metodo_pago: metodo,
                    pedido_detallado: texto,
                    total_orden: total,
                    estado,
                    procesado_por: pagado ? 'Cajero Demo' : 'Sistema Automatizado',
                    referencia_pago: efectivo ? null : (pagado ? String(100000 + Math.floor(azar() * 899999)) : 'Pendiente'),
                    imagen_pago: null, repartidor: null,
                    tasa_bcv: db.tasa.tasa, cedula: null,
                    precio_delivery: esMesa || esPickup || estado === 'Calculando Delivery' ? null : 2,
                    paga_con: null,
                    total_bandejas: emp.bandejas, total_cajas_pizza: emp.cajas_pizza, total_refrescos: emp.refrescos
                });
            });
        }

        // Hoy: dos mesas con consumo abierto, para que el panel de mesas no se vea vacío
        const agregarMesaHoy = (nombreMesa, minutosAtras, estado, lineas, nombreCliente) => {
            const m = db.mesas.find(x => x.nombre === nombreMesa); if (!m) return;
            const ts = isoNaive(ahoraCaracasDate(-minutosAtras * 60e3));
            const { texto, total } = construirResumenPedido(db, lineas, true);
            const emp = calcularEmpaque(db, lineas);
            db.pedidos.push({
                id: siguienteId(db, 'pedidos'), cliente: nombreCliente, telefono: 'No registrado', timestamp: ts, fecha: ts.slice(0, 10),
                tipo_entrega: 'Mesa', direccion: m.nombre, metodo_pago: 'Efectivo', pedido_detallado: texto, total_orden: total, estado,
                procesado_por: 'Pedido en mesa', referencia_pago: null, imagen_pago: null, repartidor: null, tasa_bcv: db.tasa.tasa, cedula: null,
                precio_delivery: null, paga_con: null, total_bandejas: emp.bandejas, total_cajas_pizza: emp.cajas_pizza, total_refrescos: emp.refrescos
            });
            if (m.estado === 'libre') { m.estado = 'ocupada'; m.ocupada_desde = ts; }
        };
        const pid = n => 'p_' + (db.productos.find(p => p.nombre === n) || { id: 0 }).id;
        agregarMesaHoy('Mesa 3', 55, 'Finalizado', [{ id: pid('Doble Queso'), name: '', price: 0, qty: 2, note: '' }, { id: pid('Papas Fritas Grandes'), name: '', price: 0, qty: 1, note: '' }, { id: pid('Refresco Cola'), name: '', price: 0, qty: 2, note: '' }], 'Mesa 3');
        agregarMesaHoy('Mesa 6', 12, 'En Cocina', [{ id: pid('Pollo Frito 4 Piezas'), name: '', price: 0, qty: 1, note: 'sin picante' }, { id: pid('Limonada Natural'), name: '', price: 0, qty: 2, note: '' }], 'Mesa 6');
        // Las mesas de los pedidos de hoy generados al azar también quedan ocupadas
        db.pedidos.filter(p => p.fecha === hoyCaracas() && p.tipo_entrega === 'Mesa').forEach(p => {
            const m = db.mesas.find(x => x.nombre === p.direccion);
            if (m && m.estado === 'libre') { m.estado = 'ocupada'; m.ocupada_desde = p.timestamp; }
        });
        const m3 = db.mesas.find(x => x.nombre === 'Mesa 3'); if (m3) m3.estado = 'cuenta';
    }

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
    // ---- Inventario (opcional por producto: inventario = null significa "sin control") ----
    function inventarioNecesario(db, articulos) {
        const need = new Map(); const add = (id, n) => need.set(id, (need.get(id) || 0) + n);
        (articulos || []).forEach(a => {
            const q = parseInt(a && a.qty, 10); if (!(q > 0)) return;
            const { tipo, dbId } = parteId(a.id); if (!dbId) return;
            if (tipo === 'p') add(dbId, q);
            else if (tipo === 'c') {
                const c = db.combos.find(x => x.id === dbId); if (!c) return;
                let items = []; try { items = JSON.parse(c.items_json || '[]'); } catch (e) {}
                items.forEach(it => { if (it && it.tipo === 'producto') add(Number(it.valor), (parseInt(it.cantidad, 10) || 1) * q); });
            }
        });
        return need;
    }
    function revisarInventario(db, articulos, esPersonal) {
        if (esPersonal) return;
        inventarioNecesario(db, articulos).forEach((n, id) => {
            const p = db.productos.find(x => x.id === id);
            if (p && p.inventario != null && n > p.inventario) throw new HttpError(400, p.inventario > 0 ? `Solo quedan ${p.inventario} de ${p.nombre}. Ajusta la cantidad para continuar.` : `${p.nombre} se agotó. Quítalo del carrito para continuar.`);
        });
    }
    function descontarInventario(db, articulos) {
        inventarioNecesario(db, articulos).forEach((n, id) => {
            const p = db.productos.find(x => x.id === id);
            if (p && p.inventario != null) { p.inventario = Math.max(0, p.inventario - n); if (p.inventario <= 0) p.agotado = true; }
        });
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

    function construirResumenPedido(db, articulos, esPersonal) {
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
    // Tiempo real simulado (reemplaza a Pusher): BroadcastChannel entre pestañas
    // ------------------------------------------------------------------
    const canalTiempoReal = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('prototipoCF-canal-cocina') : null;
    const oyentes = [];
    function emitirTablero(mensaje) {
        const data = { mensaje };
        if (canalTiempoReal) canalTiempoReal.postMessage(data);
        // y la pestaña actual (BroadcastChannel no se avisa a sí mismo)
        setTimeout(() => oyentes.forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }), 50);
    }
    if (canalTiempoReal) canalTiempoReal.onmessage = ev => oyentes.forEach(fn => { try { fn(ev.data); } catch (e) { console.error(e); } });

    window.Pusher = function () {
        return {
            subscribe() {
                return { bind(evento, fn) { if (evento === 'actualizar-tablero') oyentes.push(fn); } };
            }
        };
    };
    window.Pusher.logToConsole = false;

    // ------------------------------------------------------------------
    // Rutas
    // ------------------------------------------------------------------
    const rutas = [];
    function ruta(metodo, path, fn) { rutas.push({ metodo, path, fn }); }
    const ok = (extra) => Object.assign({ success: true }, extra || {});

    // ---- Menú ----
    ruta('GET', '/api/menu', (ctx, db) => ({
        menu: {
            categorias: db.categorias.map(c => ({ id: c.id, nombre: c.nombre, imagen: c.imagen })),
            productos: db.productos.map(p => ({ id: p.id, nombre: p.nombre, categoria: p.categoria, precio: p.precio, imagen: p.imagen, descripcion: p.descripcion, disponible: p.disponible, agotado: p.agotado, inventario: p.inventario == null ? null : p.inventario, favorito: !!p.favorito, disponible_desde: p.disponible_desde, disponible_hasta: p.disponible_hasta, dias_disponibles: p.dias_disponibles, bandejas: p.bandejas, cajas_pizza: p.cajas_pizza, precio_paquete: p.precio_paquete, cantidad_paquete: p.cantidad_paquete })),
            combos: db.combos.map(c => ({ id: c.id, nombre: c.nombre, categoria: c.categoria, precio: c.precio, imagen: c.imagen, descripcion: c.descripcion, disponible: c.disponible, favorito: !!c.favorito, items_json: c.items_json, promo_cantidad_minima: c.promo_cantidad_minima, promo_producto_id: c.promo_producto_id, promo_producto_cantidad: c.promo_producto_cantidad, disponible_desde: c.disponible_desde, disponible_hasta: c.disponible_hasta, dias_disponibles: c.dias_disponibles, bandejas: c.bandejas, cajas_pizza: c.cajas_pizza }))
        }
    }));

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
    const CAMPOS_PROD = ['nombre', 'categoria', 'precio', 'imagen', 'descripcion', 'disponible', 'agotado', 'favorito', 'disponible_desde', 'disponible_hasta', 'dias_disponibles', 'precio_paquete', 'cantidad_paquete', 'bandejas', 'cajas_pizza'];
    ruta('POST', '/api/menu/guardar-producto', (ctx, db) => {
        requiereAdmin(ctx); const d = ctx.body;
        if (!d.nombre || !d.categoria || typeof d.precio !== 'number') throw new HttpError(422, 'Datos incompletos');
        const defaults = { disponible: true, agotado: false, favorito: false, bandejas: 1, cajas_pizza: 0, cantidad_paquete: 0, precio_paquete: null, imagen: '', descripcion: '' };
        const datos = Object.assign({}, defaults, d);
        guardarEn(db.productos, db, datos, CAMPOS_PROD, () => { const f = { id: siguienteId(db, 'productos') }; CAMPOS_PROD.forEach(c => { f[c] = datos[c] === undefined ? null : datos[c]; }); db.productos.push(f); });
        return ok();
    });
    const CAMPOS_COMBO = ['nombre', 'categoria', 'precio', 'imagen', 'descripcion', 'disponible', 'favorito', 'promo_cantidad_minima', 'promo_producto_id', 'promo_producto_cantidad', 'disponible_desde', 'disponible_hasta', 'dias_disponibles', 'bandejas', 'cajas_pizza'];
    ruta('POST', '/api/menu/guardar-combo', (ctx, db) => {
        requiereAdmin(ctx); const d = ctx.body;
        if (!d.nombre || typeof d.precio !== 'number') throw new HttpError(422, 'Datos incompletos');
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
    ruta('POST', '/api/menu/inventario', (ctx, db) => {
        requiereAdmin(ctx); const { id, cantidad } = ctx.body || {};
        const p = db.productos.find(x => x.id === Number(id));
        if (!p) throw new HttpError(404, 'Producto no encontrado');
        if (cantidad === null) { p.inventario = null; return ok(); } // quitar el control de inventario
        const n = Math.floor(Number(cantidad));
        if (!Number.isFinite(n) || n < 0 || n > 100000) throw new HttpError(422, 'Cantidad no válida');
        p.inventario = n; p.agotado = n <= 0; // con 0 queda sin stock; si se repone, vuelve a estar disponible
        return ok();
    });
    ruta('POST', '/api/menu/ordenar', (ctx, db) => {
        requiereAdmin(ctx); const { tipo, ids } = ctx.body || {};
        const tabla = { producto: 'productos', combo: 'combos', categoria: 'categorias' }[tipo];
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

    // ---- Horarios de trabajo del personal (cada usuario tiene su semana: entrada/salida o descanso) ----
    const HORA_VALIDA = /^([01]\d|2[0-3]):[0-5]\d$/;
    function horarioTrabajoDe(u) {
        const g = Array.isArray(u.horario_trabajo) ? u.horario_trabajo : [];
        return DIAS_SEMANA.map((_, d) => {
            const r = g.find(x => x && x.dia_semana === d) || {};
            return { dia_semana: d, activo: !!r.activo, hora_entrada: r.hora_entrada || '09:00', hora_salida: r.hora_salida || '17:00' };
        });
    }
    ruta('GET', '/api/horarios-trabajo', (ctx, db) => {
        requiereAdmin(ctx);
        return db.usuarios.map(u => ({ id: u.id, nombre: u.nombre, username: u.username, rol: u.rol, sucursal_id: u.sucursal_id || null, horario: horarioTrabajoDe(u) }));
    });
    ruta('POST', '/api/horarios-trabajo/guardar', (ctx, db) => {
        requiereAdmin(ctx);
        const u = db.usuarios.find(x => x.id === ctx.body.usuario_id);
        if (!u) return { success: false, error: 'Usuario no encontrado' };
        const dias = Array.isArray(ctx.body.horarios) ? ctx.body.horarios : [];
        const limpio = [];
        for (let d = 0; d < 7; d++) {
            const r = dias.find(x => x && x.dia_semana === d) || {};
            const activo = r.activo === true;
            const entrada = String(r.hora_entrada || ''), salida = String(r.hora_salida || '');
            if (activo && (!HORA_VALIDA.test(entrada) || !HORA_VALIDA.test(salida))) return { success: false, error: 'Falta la hora de entrada o salida en un día de trabajo (' + DIAS_SEMANA[d] + ')' };
            limpio.push({ dia_semana: d, activo, hora_entrada: HORA_VALIDA.test(entrada) ? entrada : '09:00', hora_salida: HORA_VALIDA.test(salida) ? salida : '17:00' });
        }
        u.horario_trabajo = limpio;
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
    ruta('POST', '/api/usuarios/validar-acceso', (ctx, db) => {
        const d = ctx.body || {};
        const claveFallos = 'login-fallido:' + String(d.username || '').trim().toLowerCase();
        if (cupoAgotado(claveFallos, 5, 15 * 60)) throw new HttpError(429, 'Demasiados intentos fallidos con este usuario. Espera 15 minutos o entra con otra cuenta.');
        const buscado = String(d.username || '').trim().toLowerCase();
        const u = db.usuarios.find(x => String(x.username).toLowerCase() === buscado);
        if (!u || String(d.pin).trim() !== String(u.pin)) { anotarFallo(claveFallos); return { success: false, msg: 'Credenciales incorrectas' }; }
        olvidarFallos(claveFallos);
        if (d.tipo === 'login_admin' && !['admin', 'superadmin'].includes(String(u.rol).toLowerCase())) return { success: false, msg: 'No tienes privilegios de administrador' };
        return { success: true, token: crearToken(u.username, u.rol), usuario: { nombre: u.nombre, rol: u.rol, username: u.username } };
    });
    ruta('GET', '/api/usuarios', (ctx, db) => { requiereAdmin(ctx); return db.usuarios.map(u => ({ id: u.id, nombre: u.nombre, username: u.username, rol: u.rol })); });
    ruta('POST', '/api/usuarios/guardar', (ctx, db) => {
        const admin = requiereAdmin(ctx); const d = ctx.body;
        const rolNuevo = String(d.rol || '').trim().toLowerCase();
        if (!ROLES_VALIDOS.includes(rolNuevo)) return { success: false, error: 'Rol no valido' };
        const esSuper = String(admin.rol || '').toLowerCase() === 'superadmin';
        if (rolNuevo === 'superadmin' && !esSuper) throw new HttpError(403, 'Solo un superadmin puede asignar ese rol');
        const repetido = db.usuarios.some(u => u.username === d.username && u.id !== d.id);
        if (repetido) return { success: false, error: 'No se pudo guardar el usuario (¿nombre de usuario repetido?)' };
        if (d.id) {
            const u = db.usuarios.find(x => x.id === d.id);
            if (u && String(u.rol).toLowerCase() === 'superadmin' && !esSuper) throw new HttpError(403, 'Solo un superadmin puede modificar a otro superadmin');
            if (u) {
                u.nombre = d.nombre; u.username = d.username;
                if (String(u.rol).toLowerCase() !== 'superadmin') u.rol = rolNuevo;
                if (d.pin) u.pin = String(d.pin);
            }
        } else {
            if (!d.pin) return { success: false, error: 'El PIN es obligatorio al crear un usuario' };
            db.usuarios.push({ id: siguienteId(db, 'usuarios'), nombre: d.nombre, username: d.username, pin: String(d.pin), rol: rolNuevo });
        }
        return { success: true, msg: 'Usuario guardado exitosamente' };
    });
    ruta('POST', '/api/usuarios/eliminar', (ctx, db) => {
        const admin = requiereAdmin(ctx);
        const u = db.usuarios.find(x => x.id === ctx.body.id);
        if (u && String(u.rol).toLowerCase() === 'superadmin' && String(admin.rol).toLowerCase() !== 'superadmin') throw new HttpError(403, 'Solo un superadmin puede eliminar a otro superadmin');
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
    function exigirClave(cliente, clave) {
        const k = 'clave-cliente:' + cliente.telefono;
        if (cupoAgotado(k, 5, 15 * 60)) throw new HttpError(429, 'Demasiados intentos con una clave incorrecta. Espera 15 minutos.');
        if (!cliente.clave_hash) throw new HttpError(403, 'Todavía no tienes una clave. Cierra sesión y vuelve a entrar para crearla.');
        if (!clave) throw new HttpError(401, 'Para este cambio necesitamos tu clave.');
        if (clave !== cliente.clave_hash) { anotarFallo(k); throw new HttpError(401, 'La clave no es correcta.'); }
        olvidarFallos(k);
    }
    ruta('GET', '/api/clientes/verificar', (ctx, db) => {
        const c = db.clientes.find(x => x.telefono === ctx.query.telefono);
        return c ? [{ nombre: c.nombre, telefono: c.telefono, direccion_principal: c.direccion_principal, direcciones_extra: c.direcciones_extra, tiene_clave: !!c.clave_hash }] : [];
    });
    ruta('POST', '/api/clientes/registrar', (ctx, db) => {
        const d = ctx.body; const tel = limpiarTexto(d.telefono, 30);
        if (!telefonoPublicoValido(tel)) throw new HttpError(400, 'El número de teléfono no es válido.');
        const clave = validarClaveNueva(d.clave);
        if (db.clientes.some(c => c.telefono === tel)) throw new HttpError(400, 'El cliente ya está registrado.');
        const extras = listaDirecciones(d.direcciones_extra).map(x => limpiarTexto(x, 300)).slice(0, 15);
        db.clientes.push({ telefono: tel, nombre: limpiarTexto(d.nombre, 80) || 'Cliente', cedula: limpiarTexto(d.cedula, 20) || null, direccion_principal: limpiarTexto(d.direccion_principal, 300), direcciones_extra: JSON.stringify(extras), clave_hash: clave });
        return { status: 'success', mensaje: 'Cliente registrado exitosamente' };
    });
    ruta('POST', '/api/clientes/crear-clave', (ctx, db) => {
        const c = buscarCliente(db, ctx.body.telefono);
        if (c.clave_hash) throw new HttpError(400, 'Este número ya tiene una clave. Si la olvidaste, pide al personal que la restablezca.');
        c.clave_hash = validarClaveNueva(ctx.body.clave);
        return { status: 'success' };
    });
    ruta('POST', '/api/clientes/restablecer-clave', (ctx, db) => {
        requiereStaff(ctx);
        const c = buscarCliente(db, ctx.body.telefono); c.clave_hash = null; olvidarFallos('clave-cliente:' + c.telefono);
        return ok();
    });
    ruta('POST', '/api/clientes/actualizar-telefono', (ctx, db) => {
        const d = ctx.body; const nuevo = limpiarTexto(d.telefono_nuevo, 30);
        if (!nuevo) throw new HttpError(400, 'El nuevo número no puede estar vacío.');
        if (!telefonoPublicoValido(nuevo)) throw new HttpError(400, 'El número de teléfono no es válido.');
        const c = buscarCliente(db, d.telefono_actual);
        exigirClave(c, d.clave);
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
    ruta('POST', '/api/clientes/actualizar-direcciones-cliente', (ctx, db) => {
        const d = ctx.body; const c = buscarCliente(db, d.telefono);
        const viejas = listaDirecciones(c.direcciones_extra).map(x => limpiarTexto(x, 300));
        const nuevas = d.direcciones_extra == null ? viejas : listaDirecciones(d.direcciones_extra).map(x => limpiarTexto(x, 300));
        if (nuevas.length > 15) throw new HttpError(400, 'Puedes guardar hasta 15 direcciones adicionales.');
        const pVieja = limpiarTexto(c.direccion_principal, 300);
        const pNueva = d.direccion_principal == null ? null : limpiarTexto(d.direccion_principal, 300);
        const quita = viejas.some(x => !nuevas.includes(x));
        const cambiaPrincipal = pNueva !== null && pVieja && pNueva !== pVieja;
        if (quita || cambiaPrincipal) exigirClave(c, d.clave);
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

        const esMesa = esEntregaMesa(tipo);
        const mesa = esMesa ? db.mesas.find(m => m.nombre === direccion) : null;
        if (esMesa && !mesa) throw new HttpError(400, 'Selecciona una mesa válida.');

        const tasa = tasaVigente(db);
        const cli = db.clientes.find(c => c.telefono === telefono);
        const { texto, total } = construirResumenPedido(db, p.articulos, esPersonal);
        revisarInventario(db, p.articulos, esPersonal);
        const emp = calcularEmpaque(db, p.articulos);
        const esPickup = esEntregaPickup(tipo);

        const nuevo = {
            id: siguienteId(db, 'pedidos'), cliente, telefono, timestamp: ahoraCaracas(), fecha: hoyCaracas(),
            tipo_entrega: tipo, direccion, metodo_pago: metodoPago, pedido_detallado: texto, total_orden: total,
            estado: esMesa ? 'En Cocina' : (esPickup ? 'Pago Pendiente' : 'Calculando Delivery'), procesado_por: esMesa ? 'Pedido en mesa' : 'Sistema Automatizado',
            referencia_pago: ['Efectivo', 'Punto de Venta'].includes(metodoPago) ? null : 'Pendiente',
            imagen_pago: null, repartidor: null, tasa_bcv: tasa, cedula: cli ? cli.cedula : null,
            precio_delivery: null, paga_con: null,
            total_bandejas: emp.bandejas, total_cajas_pizza: emp.cajas_pizza, total_refrescos: emp.refrescos
        };
        db.pedidos.push(nuevo);
        descontarInventario(db, p.articulos);
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
        ctx.tras.push(() => emitirTablero(esPickup ? 'actualizacion' : 'nuevo_pedido'));
        if (esMesa) ctx.tras.push(() => emitirTablero('mesas'));
        return { success: true };
    });

    function filtrarFecha(db, q) {
        const re = /^\d{4}-\d{2}-\d{2}$/;
        ['fecha', 'fecha_desde', 'fecha_hasta'].forEach(k => { if (q[k] && !re.test(q[k])) throw new HttpError(400, 'Formato de fecha inválido (YYYY-MM-DD)'); });
        let lista = db.pedidos.slice();
        if (q.fecha) return lista.filter(p => p.fecha === q.fecha).sort((a, b) => a.id - b.id);
        if (q.fecha_desde || q.fecha_hasta) {
            if (q.fecha_desde) lista = lista.filter(p => p.fecha >= q.fecha_desde);
            if (q.fecha_hasta) lista = lista.filter(p => p.fecha <= q.fecha_hasta);
            return lista.sort((a, b) => a.id - b.id);
        }
        return lista.sort((a, b) => b.id - a.id).slice(0, 150);
    }
    ruta('GET', '/api/pedidos', (ctx, db) => { requiereStaff(ctx); return filtrarFecha(db, ctx.query).map(p => Object.assign({}, p, { id_pedido: p.id })); });

    ruta('POST', '/api/pedidos/actualizar-estado', (ctx, db) => {
        requiereStaff(ctx); const d = ctx.body || {};
        const id = d.id || d.id_pedido;
        const p = db.pedidos.find(x => x.id === Number(id));
        if (!p) return { success: false, msg: 'Pedido no encontrado' };
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
        if (!d.articulos || !d.articulos.length) throw new HttpError(400, 'El pedido editado llego sin articulos');
        const { texto, total } = construirResumenPedido(db, d.articulos, true);
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
        return db.pedidos.filter(p => esEntregaMesa(p.tipo_entrega) && p.direccion === mesa.nombre && p.timestamp >= mesa.ocupada_desde && p.estado !== 'Cancelado')
            .sort((a, b) => a.id - b.id);
    }
    ruta('GET', '/api/mesas', (ctx, db) => {
        const staff = staffOpcional(ctx);
        return db.mesas.slice().sort((a, b) => a.id - b.id).map(m => {
            const base = { id: m.id, nombre: m.nombre, zona: m.zona, capacidad: m.capacidad, estado: m.estado };
            if (!staff) return base;
            const ped = pedidosDeMesa(db, m);
            return Object.assign(base, { ocupada_desde: m.ocupada_desde, pedidos: ped.length, consumo: Math.round(ped.reduce((s, p) => s + (p.total_orden || 0), 0) * 100) / 100 });
        });
    });
    ruta('GET', '/api/mesas/cuenta', (ctx, db) => {
        requiereStaff(ctx);
        const m = db.mesas.find(x => x.id === parseInt(ctx.query.id, 10));
        if (!m) throw new HttpError(404, 'Mesa no encontrada');
        const ped = pedidosDeMesa(db, m);
        return { mesa: { id: m.id, nombre: m.nombre, zona: m.zona, capacidad: m.capacidad, estado: m.estado, ocupada_desde: m.ocupada_desde }, pedidos: ped.map(p => Object.assign({}, p, { id_pedido: p.id })), total: Math.round(ped.reduce((s, p) => s + (p.total_orden || 0), 0) * 100) / 100, tasa_bcv: tasaVigente(db) };
    });
    ruta('POST', '/api/mesas/guardar', (ctx, db) => {
        requiereAdmin(ctx); const d = ctx.body || {};
        const nombre = limpiarTexto(d.nombre, 30); const zona = limpiarTexto(d.zona, 30) || 'Salón';
        const capacidad = Math.max(1, Math.min(30, parseInt(d.capacidad, 10) || 4));
        if (!nombre) return { success: false, error: 'La mesa necesita un nombre.' };
        if (db.mesas.some(m => m.nombre.toLowerCase() === nombre.toLowerCase() && m.id !== d.id)) return { success: false, error: 'Ya existe una mesa con ese nombre.' };
        if (d.id) {
            const m = db.mesas.find(x => x.id === d.id);
            if (!m) return { success: false, error: 'Mesa no encontrada.' };
            if (m.nombre !== nombre) db.pedidos.filter(p => esEntregaMesa(p.tipo_entrega) && p.direccion === m.nombre).forEach(p => { p.direccion = nombre; });
            m.nombre = nombre; m.zona = zona; m.capacidad = capacidad;
        } else {
            db.mesas.push({ id: siguienteId(db, 'mesas'), nombre, zona, capacidad, estado: 'libre', ocupada_desde: null });
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

    // ---- Salud ----
    ruta('GET', '/api/salud', () => ({ status: 'ok', modo: 'prototipo (sin backend)', base_de_datos: 'simulada en el navegador' }));

    // ------------------------------------------------------------------
    // Subida de imágenes (reemplaza a imgbb): queda como data URL en el navegador
    // ------------------------------------------------------------------
    function archivoADataUrl(archivo) {
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = () => reject(fr.error);
            fr.readAsDataURL(archivo);
        });
    }
    async function subirImagenSimulada(init) {
        const archivo = init && init.body && init.body.get ? init.body.get('image') : null;
        if (!archivo) return respuestaJson(400, { success: false });
        // Se reduce para no llenar el almacenamiento del navegador
        let url = await archivoADataUrl(archivo);
        try {
            url = await new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const max = 640, escala = Math.min(1, max / Math.max(img.width, img.height));
                    const c = document.createElement('canvas');
                    c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
                    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                    resolve(c.toDataURL('image/jpeg', 0.7));
                };
                img.onerror = () => resolve(url);
                img.src = url;
            });
        } catch (e) { /* se queda con la original */ }
        return respuestaJson(200, { success: true, data: { url } });
    }

    // ------------------------------------------------------------------
    // Interceptor de fetch
    // ------------------------------------------------------------------
    function respuestaJson(status, cuerpo) {
        return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
    }
    function cabecera(init, nombre) {
        const h = init && init.headers; if (!h) return null;
        if (typeof h.get === 'function') return h.get(nombre);
        const clave = Object.keys(h).find(k => k.toLowerCase() === nombre.toLowerCase());
        return clave ? h[clave] : null;
    }

    window.fetch = async function (input, init) {
        const urlTexto = typeof input === 'string' ? input : (input && input.url) || String(input);
        let url;
        try { url = new URL(urlTexto, location.href); } catch (e) { return FETCH_REAL(input, init); }

        if (url.hostname === 'api.imgbb.com') return subirImagenSimulada(init);
        // Abierto con doble clic (file://) Chrome y Firefox reportan el origen distinto
        // entre location y URL, así que ahí se compara por protocolo.
        const mismoSitio = url.protocol === 'file:' ? location.protocol === 'file:' : url.origin === location.origin;
        // En file:// la ruta puede traer la unidad o carpetas delante (ej. /C:/api/...)
        const posApi = url.pathname.indexOf('/api/');
        const esApi = url.protocol === 'file:' ? posApi >= 0 : posApi === 0;
        if (!mismoSitio || !esApi) return FETCH_REAL(input, init);
        const rutaApi = url.pathname.slice(posApi);

        const metodo = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        const path = rutaApi.replace(/\/+$/, '') || '/';
        const r = rutas.find(x => x.metodo === metodo && x.path === path);
        if (!r) return respuestaJson(404, { detail: 'Not Found' });

        const query = {}; url.searchParams.forEach((v, k) => { query[k] = v; });
        let body = {};
        if (init && typeof init.body === 'string' && init.body) { try { body = JSON.parse(init.body); } catch (e) { return respuestaJson(422, { detail: 'JSON inválido' }); } }

        const ctx = { query, body, authorization: cabecera(init, 'Authorization'), tras: [] };
        await new Promise(res => setTimeout(res, 40)); // latencia mínima, para que se sienta como una red
        try {
            const db = cargarDb();
            const resultado = r.fn(ctx, db);
            if (metodo !== 'GET') guardarDb(db);
            ctx.tras.forEach(fn => fn());
            return respuestaJson(200, resultado);
        } catch (e) {
            if (e instanceof HttpError) return respuestaJson(e.status, { detail: e.detail });
            if (e && e.message === 'ALMACENAMIENTO_LLENO') return respuestaJson(507, { detail: 'Se llenó el almacenamiento del navegador. Usa "Reiniciar demo".' });
            console.error('[mock-api]', e);
            return respuestaJson(500, { detail: 'Error interno del prototipo' });
        }
    };

    // ------------------------------------------------------------------
    // Interfaz del prototipo: aviso de demo, bandeja de WhatsApp y reinicio
    // ------------------------------------------------------------------
    function montarPanelDemo() {
        if (document.getElementById('cf-demo-fab')) return;
        const estilo = document.createElement('style');
        estilo.textContent = `
        #cf-demo-fab{position:fixed;right:12px;bottom:12px;z-index:99999;display:flex;gap:8px;font:600 12px system-ui,sans-serif}
        #cf-demo-fab button{border:0;border-radius:999px;padding:9px 13px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.25);color:#fff}
        #cf-btn-wa{background:#16a34a}#cf-btn-reset{background:#475569}
        #cf-wa-panel{position:fixed;right:12px;bottom:60px;z-index:99999;width:min(360px,calc(100vw - 24px));max-height:60vh;display:none;flex-direction:column;background:#fff;color:#111;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.35);font:13px system-ui,sans-serif;overflow:hidden}
        #cf-wa-panel header{background:#16a34a;color:#fff;padding:10px 12px;font-weight:700;display:flex;justify-content:space-between;align-items:center}
        #cf-wa-panel header small{font-weight:400;opacity:.9;display:block}
        #cf-wa-lista{overflow:auto;padding:8px;background:#e5ddd5}
        .cf-msg{background:#fff;border-radius:8px;padding:8px 10px;margin-bottom:8px;white-space:pre-wrap;word-break:break-word;box-shadow:0 1px 1px rgba(0,0,0,.12)}
        .cf-msg b{display:block;color:#475569;font-size:11px;margin-bottom:3px}
        #cf-demo-banner{position:fixed;left:8px;bottom:8px;z-index:99998;background:#fef3c7;color:#92400e;font:600 10px system-ui,sans-serif;padding:4px 9px;border:1px solid #fcd34d;border-radius:999px;pointer-events:none;max-width:42vw;opacity:.92}
        @media(max-width:640px){#cf-demo-banner{display:none}}`;
        document.head.appendChild(estilo);

        const banner = document.createElement('div');
        banner.id = 'cf-demo-banner';
        banner.textContent = '🧪 PROTOTIPO · datos inventados · se guardan solo en tu navegador';
        if (!EMBED) document.body.appendChild(banner);

        const fab = document.createElement('div');
        fab.id = 'cf-demo-fab';
        fab.innerHTML = '<button id="cf-btn-wa" type="button">📱 WhatsApp simulado <span id="cf-wa-n"></span></button>' + (EMBED ? '' : '<button id="cf-btn-reset" type="button">↺ Reiniciar demo</button>');
        document.body.appendChild(fab);

        const panel = document.createElement('div');
        panel.id = 'cf-wa-panel';
        panel.innerHTML = '<header><div>Mensajes que se enviarían<small>No sale nada real: es solo para ver el flujo</small></div><span id="cf-wa-x" style="cursor:pointer;font-size:18px">✕</span></header><div id="cf-wa-lista"></div>';
        document.body.appendChild(panel);

        const pintar = () => {
            const db = cargarDb();
            document.getElementById('cf-wa-n').textContent = db.outbox.length ? '(' + db.outbox.length + ')' : '';
            const lista = document.getElementById('cf-wa-lista');
            const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
            lista.innerHTML = db.outbox.length
                ? db.outbox.slice().reverse().map(m => `<div class="cf-msg"><b>Para: ${esc(m.destino)} · ${esc(m.contexto)} · ${esc(String(m.ts).slice(11, 16))}</b>${esc(m.mensaje)}</div>`).join('')
                : '<div class="cf-msg">Aún no se envió ningún mensaje. Haz un pedido o mueve uno en el tablero.</div>';
        };
        document.getElementById('cf-btn-wa').onclick = () => {
            const abierto = panel.style.display === 'flex';
            panel.style.display = abierto ? 'none' : 'flex';
            if (!abierto) pintar();
        };
        document.getElementById('cf-wa-x').onclick = () => { panel.style.display = 'none'; };
        const btnReset = document.getElementById('cf-btn-reset');
        if (btnReset) btnReset.onclick = () => {
            if (!confirm('Se borran tus cambios y vuelven los datos de ejemplo. ¿Continuar?')) return;
            try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem('tokioAuthToken'); localStorage.removeItem('usuarioActivo'); localStorage.removeItem('sesionCliente'); localStorage.removeItem('tokioPedidoEnEdicion'); } catch (e) { memoria = null; }
            if (canalControl) canalControl.postMessage({ tipo: 'recargar' });
            location.reload();
        };
        pintar();
        setInterval(() => { if (panel.style.display === 'flex') pintar(); else { const db = cargarDb(); document.getElementById('cf-wa-n').textContent = db.outbox.length ? '(' + db.outbox.length + ')' : ''; } }, 2500);
    }
    if (!window.PROTOTIPO_SIN_PANEL) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarPanelDemo); else montarPanelDemo(); }

    // ------------------------------------------------------------------
    // Paneles embebidos: entrar solos (?auto=staff|cliente) y recargarse juntos
    // ------------------------------------------------------------------
    const canalControl = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('prototipoCF-control') : null;
    if (canalControl) canalControl.onmessage = ev => { if (ev.data && ev.data.tipo === 'recargar') location.reload(); };

    (function autoEntrar() {
        const auto = PARAMS.get('auto');
        if (!auto) return;
        try {
            if (auto === 'staff') {
                localStorage.setItem('tokioAuthToken', crearToken('admin', 'superadmin'));
                localStorage.setItem('usuarioActivo', JSON.stringify({ username: 'admin', nombre: 'Admin Demo', rol: 'superadmin' }));
            } else if (auto === 'cliente') {
                const c = cargarDb().clientes.find(x => x.telefono === '04120000001');
                if (c && !localStorage.getItem('sesionCliente')) localStorage.setItem('sesionCliente', JSON.stringify({ nombre: c.nombre, telefono: c.telefono, cedula: c.cedula, direccion_principal: c.direccion_principal, direcciones_extra: c.direcciones_extra, tiene_clave: true }));
            } else if (auto === 'cliente-nuevo') {
                localStorage.removeItem('sesionCliente');
            }
        } catch (e) { /* sin almacenamiento: queda el login normal */ }
    })();

    // Nombre y emoji del negocio en cada pantalla: <span data-marca="nombre">
    function aplicarMarca() {
        const m = marca(); window.MARCA = m;
        document.title = document.title.replace(/Prototipo Comida Rápida/g, m.nombre);
        document.querySelectorAll('[data-marca]').forEach(el => {
            const k = el.getAttribute('data-marca');
            if (k === 'nombre') el.textContent = m.nombre;
            else if (k === 'nombre-mayus') el.textContent = m.nombre.toUpperCase();
            else if (k === 'emoji') el.textContent = m.emoji;
            else if (k === 'eslogan') el.textContent = m.eslogan;
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aplicarMarca); else aplicarMarca();

    // Para pruebas desde la consola y los tests
    window.__prototipoCF = { cargarDb, guardarDb, reiniciar: () => { try { localStorage.removeItem(STORAGE_KEY); } catch (e) { memoria = null; } } };
})();
