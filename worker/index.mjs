// Worker multi-cliente: API (/api/*) + solicitud diaria a Supabase. Un negocio por dominio, una sola base.
// Los archivos de la web los sirve Cloudflare directamente (binding ASSETS).
import { rutas, HttpError, crearDbInicial, usarFallos, tomarEvento, usarLimiteSucursales, ahoraCaracas } from './rutas.mjs';
import { consultarBcvDetallado, aplicarTasaBcv, anotarFalloBcv, anotarIntentosBcv } from './bcv.mjs';
import { configurarSecreto, verificarToken, hashClave } from './auth.mjs';
import { leerEstado, crearEstado, guardarEstado, leerVersion, mantenerActivo, subirImagen, negocioPorHost, negocioPorId, listarNegocios } from './supabase.mjs';
import { correrEnContexto } from './contexto.mjs';
import { manejarPlataforma } from './plataforma.mjs';
import { estadoCuenta, estaBloqueado, paginaBloqueada } from './cuenta.mjs';
import { leerMarca, olvidarMarcas, iconoSvg, reescribirHtml, reescribirManifiesto, reescribirFondos } from './marca.mjs';

const json = (status, cuerpo) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// ---- Negocio (cliente) de cada solicitud: se deduce del dominio, jamás de datos del navegador ----
const cacheNegocios = new Map(); // host -> { n, hasta }
async function negocioDeHost(env, host) {
    const h = String(host || '').toLowerCase();
    const c = cacheNegocios.get(h);
    if (c && c.hasta > Date.now()) return c.n;
    let n = await negocioPorHost(env, h);
    if (!n && env.NEGOCIO_POR_DEFECTO) n = await negocioPorId(env, parseInt(env.NEGOCIO_POR_DEFECTO, 10)); // dominios de prueba (workers.dev)
    cacheNegocios.set(h, { n, hasta: Date.now() + 60e3 });
    if (cacheNegocios.size > 200) cacheNegocios.clear();
    return n;
}

async function cargarOCrear(env, negocio) {
    let est = await leerEstado(env, negocio.id);
    if (est) return est;
    // Solo el negocio por defecto (el original) se crea solo con ADMIN_PASSWORD. Los demás se crean con /api/plataforma/negocios.
    if (String(negocio.id) !== String(env.NEGOCIO_POR_DEFECTO || '')) throw new Error('Este negocio todavía no tiene datos inicializados');
    if (!env.ADMIN_PASSWORD || String(env.ADMIN_PASSWORD).length < 8) throw new Error('Configura el secreto ADMIN_PASSWORD (mínimo 8 caracteres) para crear el primer administrador');
    const db = crearDbInicial(await hashClave(env.ADMIN_PASSWORD), env.ADMIN_USER || 'admin', env.ADMIN_NAME || 'Administrador');
    await crearEstado(env, negocio.id, db);
    return await leerEstado(env, negocio.id);
}

async function manejarApi(request, env, negocio) {
    configurarSecreto(env.JWT_SECRET);
    const url = new URL(request.url);
    const metodo = request.method.toUpperCase();
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const authorization = request.headers.get('Authorization');

    // Consulta barata para el tablero en vivo
    if (metodo === 'GET' && path === '/api/version') {
        const v = await leerVersion(env, negocio.id);
        return json(200, { version: v.version, evento: v.evento });
    }
    // Ícono por defecto del negocio (inicial + color), para quien no ha subido logo
    if (metodo === 'GET' && path === '/api/marca/icono.svg') {
        const m = await leerMarca(env, negocio);
        return new Response(iconoSvg(m), { status: 200, headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=300' } });
    }
    // Ping explícito (también usado por la tarea diaria y para probar)
    if (metodo === 'GET' && path === '/api/salud') {
        await mantenerActivo(env);
        return json(200, { status: 'ok', base_de_datos: 'supabase' });
    }
    // Subida de imágenes (solo administradores)
    if (metodo === 'POST' && path === '/api/subir-imagen') {
        const ses = await verificarToken(authorization);
        if (!ses || !['admin', 'superadmin'].includes(String(ses.rol).toLowerCase())) return json(403, { success: false, detail: 'Solo administradores' });
        const cuerpo = await request.json().catch(() => ({}));
        const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(cuerpo.imagen || ''));
        if (!m) return json(400, { success: false, detail: 'Imagen inválida' });
        const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
        if (bytes.length > 1.5 * 1024 * 1024) return json(413, { success: false, detail: 'Imagen demasiado grande' });
        const ext = m[1] === 'image/png' ? 'png' : m[1] === 'image/webp' ? 'webp' : 'jpg';
        const nombre = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
        const urlPublica = await subirImagen(env, negocio.id, nombre, bytes, m[1]);
        return json(200, { success: true, data: { url: urlPublica } });
    }

    const r = rutas.find(x => x.metodo === metodo && x.path === path);
    if (!r) return json(404, { detail: 'Not Found' });

    const query = {}; url.searchParams.forEach((v, k) => { query[k] = v; });
    let body = {};
    if (metodo !== 'GET') {
        const texto = await request.text();
        if (texto) { try { body = JSON.parse(texto); } catch (e) { return json(422, { detail: 'JSON inválido' }); } }
    }
    const sesion = await verificarToken(authorization);

    for (let intento = 0; intento < 5; intento++) {
        const est = await cargarOCrear(env, negocio);
        const db = est.data;
        db.fallos = db.fallos || {};
        usarFallos(db.fallos);
        const nMax = parseInt(negocio.max_sucursales, 10); // plan de ESTE negocio (columna negocios.max_sucursales)
        usarLimiteSucursales(Number.isFinite(nMax) ? Math.max(1, nMax) : 1);
        const ctx = { query, body, authorization, sesion, tras: [], env, origen: url.origin, host: url.hostname };
        try {
            const resultado = await r.fn(ctx, db);
            if (metodo === 'GET') return json(200, resultado);
            ctx.tras.forEach(fn => fn());
            const ev = tomarEvento() || { mensaje: 'actualizacion', sucursal_id: null };
            const guardado = await guardarEstado(env, negocio.id, est.version, db, { mensaje: ev.mensaje, sucursal_id: ev.sucursal_id || null, ts: Date.now() });
            if (guardado) return json(200, resultado);
            // Otro dispositivo guardó primero: se repite sobre los datos nuevos
        } catch (e) {
            tomarEvento();
            if (e instanceof HttpError) return json(e.status, { detail: e.detail });
            console.error('[api]', path, e);
            return json(500, { detail: 'Error interno' });
        }
    }
    return json(409, { detail: 'Mucha actividad al mismo tiempo, intenta de nuevo.' });
}

// ---- Páginas y manifiestos: se personalizan con la marca de cada negocio ----
const RUTA_HTML = (p) => p === '/' || /\.html$/.test(p) || !/\.[a-z0-9]+$/i.test(p);
async function servirEstatico(request, env, url) {
    const path = url.pathname;
    const esFavicon = path === '/favicon.ico';
    const esFondos = path === '/fondos.css' || path === '/menu-fondo.css';
    const esManifiesto = path === '/manifest.webmanifest' || path === '/manifest-personal.webmanifest';
    if (request.method !== 'GET' || (!esManifiesto && !esFavicon && !esFondos && !RUTA_HTML(path))) return env.ASSETS.fetch(request);
    let m = null;
    try {
        const negocio = await negocioDeHost(env, url.hostname);
        if (negocio) {
            // Servicio bloqueado (pasaron los días de gracia o suspendido a mano): las páginas muestran un aviso en lugar del sitio
            if (estaBloqueado(estadoCuenta(negocio)) && !esManifiesto && !esFavicon && !esFondos) {
                return new Response(paginaBloqueada(negocio.nombre, env.PLATAFORMA_CONTACTO), { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
            }
            if (negocio.activo !== false) m = await leerMarca(env, negocio);
        }
    } catch (e) { console.error('[marca]', e.message); }
    if (!m || m.original) return env.ASSETS.fetch(request); // negocio original o sin datos: archivos tal cual

    // Los navegadores piden /favicon.ico por su cuenta: cada negocio apunta a su propio ícono
    if (esFavicon) return new Response(null, { status: 302, headers: { Location: m.logoFinal, 'Cache-Control': 'no-cache' } });
    // Sin condicionales: el archivo original cambia al reescribirlo, un 304 reutilizaría la copia equivocada
    const h = new Headers(request.headers); h.delete('If-None-Match'); h.delete('If-Modified-Since');
    const r = await env.ASSETS.fetch(new Request(request.url, { method: 'GET', headers: h }));
    if (!r.ok) return r;
    const tipo = r.headers.get('Content-Type') || '';
    const salida = new Headers(r.headers); salida.delete('Content-Length'); salida.delete('ETag'); salida.set('Cache-Control', 'no-cache');
    if (esManifiesto) {
        const j = await r.json();
        return new Response(JSON.stringify(reescribirManifiesto(j, m, path.includes('personal'))), { status: 200, headers: salida });
    }
    if (esFondos) { salida.set('Cache-Control', 'public, max-age=300'); return new Response(reescribirFondos(await r.text(), m), { status: 200, headers: salida }); }
    if (tipo.includes('text/html')) return new Response(reescribirHtml(await r.text(), m), { status: 200, headers: salida });
    return r;
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname.startsWith('/api/plataforma/')) {
            try { return await manejarPlataforma(request, env, url.pathname.replace(/\/+$/, ''), { olvidar: () => { cacheNegocios.clear(); olvidarMarcas(); } }); }
            catch (e) { console.error('[plataforma]', e); return json(500, { detail: 'Error interno: ' + e.message }); }
        }
        if (url.pathname.startsWith('/api/')) {
            try {
                const negocio = await negocioDeHost(env, url.hostname);
                if (!negocio) return json(404, { detail: 'Este dominio no está registrado en la plataforma' });
                const cuenta = estadoCuenta(negocio);
                if (estaBloqueado(cuenta)) return json(403, { detail: 'Servicio suspendido por falta de renovación. Contacta a soporte.', bloqueado: true });
                // Cada solicitud corre en su propio contexto: fallos, evento y límite NO se comparten entre negocios
                return await correrEnContexto({ negocioId: negocio.id, limite: Math.max(1, parseInt(negocio.max_sucursales, 10) || 1), cuenta: Object.assign({ contacto: String(env.PLATAFORMA_CONTACTO || '') }, cuenta) }, () => manejarApi(request, env, negocio));
            }
            catch (e) { console.error('[api fatal]', e); return json(500, { detail: 'Error interno: ' + e.message }); }
        }
        return await servirEstatico(request, env, url);
    },
    // Cron (ver wrangler.jsonc): mantiene activo Supabase y actualiza la tasa BCV de TODOS los negocios cada mañana
    async scheduled(event, env, ctx) {
        ctx.waitUntil(
            mantenerActivo(env).then(() => console.log('Ping diario a Supabase OK'))
                .catch(e => console.error('Ping diario a Supabase FALLÓ:', e.message))
        );
        ctx.waitUntil(
            sincronizarTasa(env).then(m => console.log('Tasa BCV:', m))
                .catch(e => console.error('Tasa BCV FALLÓ:', e.message))
        );
    }
};

// Actualiza la tasa BCV una vez al día para CADA negocio activo. La tasa del BCV se consulta una sola vez y se reparte.
// Los cron de reintento (10 a. m. y 1 p. m.) no hacen nada en los negocios que ya están al día.
async function sincronizarTasa(env) {
    const negocios = await listarNegocios(env, true);
    let consulta = null; // { resultado, intentos }, se pide solo si algún negocio lo necesita
    const resumenes = [];
    for (const negocio of negocios) {
        try {
            resumenes.push(negocio.slug + ': ' + await correrEnContexto({ negocioId: negocio.id }, async () => {
                for (let intento = 0; intento < 5; intento++) {
                    const est = await leerEstado(env, negocio.id);
                    if (!est) return 'sin datos';
                    const db = est.data;
                    const ahora = ahoraCaracas(), hoy = ahora.slice(0, 10);
                    if (db.tasa_config && db.tasa_config.auto === false) return 'modo manual: no se toca';
                    if (db.tasa && db.tasa.fecha === hoy) return 'ya estaba al día';
                    if (!consulta) consulta = await consultarBcvDetallado();
                    const { resultado, intentos } = consulta;
                    let resumen;
                    anotarIntentosBcv(db, intentos, ahora);
                    if (resultado) {
                        const res = aplicarTasaBcv(db, resultado, { hoy, ahora, forzar: false });
                        resumen = res.aplicada ? `actualizada a ${db.tasa.tasa} (${db.tasa.fuente})` : `no aplicada (${res.motivo}${res.fecha_valor ? ' ' + res.fecha_valor : ''})`;
                    } else {
                        const detalle = intentos.map(x => x.nombre + ' (' + x.error + ')').join(' · ');
                        anotarFalloBcv(db, 'No se pudo leer ninguna fuente: ' + detalle, ahora);
                        resumen = 'no se pudo consultar: ' + detalle;
                    }
                    if (await guardarEstado(env, negocio.id, est.version, db, { mensaje: 'actualizacion', sucursal_id: null, ts: Date.now() })) return resumen;
                }
                return 'mucha actividad al guardar; se reintenta en el próximo cron';
            }));
        } catch (e) { resumenes.push(negocio.slug + ': FALLÓ ' + e.message); } // un negocio con problemas no frena a los demás
    }
    return resumenes.join(' | ') || 'sin negocios activos';
}
