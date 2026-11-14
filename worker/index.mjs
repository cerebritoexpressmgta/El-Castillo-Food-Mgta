// Worker de El Castillo Food Mgta: API (/api/*) + solicitud diaria a Supabase.
// Los archivos de la web los sirve Cloudflare directamente (binding ASSETS).
import { rutas, HttpError, crearDbInicial, usarFallos, tomarEvento, usarLimiteSucursales, ahoraCaracas } from './rutas.mjs';
import { consultarBcv, aplicarTasaBcv, anotarFalloBcv } from './bcv.mjs';
import { configurarSecreto, verificarToken, hashClave } from './auth.mjs';
import { leerEstado, crearEstado, guardarEstado, leerVersion, mantenerActivo, subirImagen } from './supabase.mjs';

const json = (status, cuerpo) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function cargarOCrear(env) {
    let est = await leerEstado(env);
    if (est) return est;
    if (!env.ADMIN_PASSWORD || String(env.ADMIN_PASSWORD).length < 8) throw new Error('Configura el secreto ADMIN_PASSWORD (mínimo 8 caracteres) para crear el primer administrador');
    const db = crearDbInicial(await hashClave(env.ADMIN_PASSWORD), env.ADMIN_USER || 'admin', env.ADMIN_NAME || 'Administrador');
    await crearEstado(env, db);
    return await leerEstado(env);
}

async function manejarApi(request, env) {
    configurarSecreto(env.JWT_SECRET);
    const url = new URL(request.url);
    const metodo = request.method.toUpperCase();
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const authorization = request.headers.get('Authorization');

    // Consulta barata para el tablero en vivo
    if (metodo === 'GET' && path === '/api/version') {
        const v = await leerVersion(env);
        return json(200, { version: v.version, evento: v.evento });
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
        const urlPublica = await subirImagen(env, nombre, bytes, m[1]);
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
        const est = await cargarOCrear(env);
        const db = est.data;
        db.fallos = db.fallos || {};
        usarFallos(db.fallos);
        const nMax = parseInt(env.MAX_SUCURSALES, 10);
        usarLimiteSucursales(Number.isFinite(nMax) ? Math.max(1, nMax) : 1); // sin configurar: negocio sin sucursales
        const ctx = { query, body, authorization, sesion, tras: [], env, origen: url.origin, host: url.hostname };
        try {
            const resultado = await r.fn(ctx, db);
            if (metodo === 'GET') return json(200, resultado);
            ctx.tras.forEach(fn => fn());
            const ev = tomarEvento() || { mensaje: 'actualizacion', sucursal_id: null };
            const guardado = await guardarEstado(env, est.version, db, { mensaje: ev.mensaje, sucursal_id: ev.sucursal_id || null, ts: Date.now() });
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

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname.startsWith('/api/')) {
            try { return await manejarApi(request, env); }
            catch (e) { console.error('[api fatal]', e); return json(500, { detail: 'Error interno: ' + e.message }); }
        }
        return env.ASSETS.fetch(request);
    },
    // Cron (ver wrangler.jsonc): mantiene activo Supabase y actualiza la tasa BCV cada mañana
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

// Actualiza la tasa BCV una vez al día. Los cron de reintento (10 a. m. y 1 p. m.) no hacen nada si ya está al día.
async function sincronizarTasa(env) {
    for (let intento = 0; intento < 5; intento++) {
        const est = await cargarOCrear(env);
        const db = est.data;
        const ahora = ahoraCaracas(), hoy = ahora.slice(0, 10);
        if (db.tasa_config && db.tasa_config.auto === false) return 'modo manual: no se toca';
        if (db.tasa && db.tasa.fecha === hoy) return 'ya estaba al día';
        let resumen;
        try {
            const r = await consultarBcv();
            const res = aplicarTasaBcv(db, r, { hoy, ahora, forzar: false });
            resumen = res.aplicada ? `actualizada a ${db.tasa.tasa} (${db.tasa.fuente})` : `no aplicada (${res.motivo})`;
        } catch (e) {
            anotarFalloBcv(db, e.message, ahora);
            resumen = 'no se pudo consultar: ' + e.message;
        }
        const guardado = await guardarEstado(env, est.version, db, { mensaje: 'actualizacion', sucursal_id: null, ts: Date.now() });
        if (guardado) return resumen;
    }
    return 'mucha actividad al guardar; se reintenta en el próximo cron';
}
