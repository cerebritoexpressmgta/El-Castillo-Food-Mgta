// ADMINISTRACIÓN DE LA PLATAFORMA (solo el dueño). Se usa desde el panel de cerebritoexpressmgta.com o por terminal.
// Acceso (cualquiera de los dos):
//   a) Sesión del panel web: el navegador manda el token de Supabase (CX_SUPABASE_URL); el Worker confirma que es el
//      correo del dueño (PLATAFORMA_EMAIL) y que pasó la verificación en dos pasos (aal2).
//   b) Cabecera X-Plataforma-Clave = secreto PLATAFORMA_CLAVE (respaldo para la terminal).
import { leerEstado, guardarEstado, crearEstado, listarNegocios, negocioPorHost, negocioPorId, crearNegocio, actualizarNegocio, borrarNegocioSinDatos, listarPagos, crearPago } from './supabase.mjs';
import { crearDbInicial } from './rutas.mjs';
import { hashClave } from './auth.mjs';
import { PLANTILLAS, plantillaValida, plantillaDe, listarPlantillas } from './plantillas.mjs';
import { estadoCuenta, hoyCaracasISO, sumarMeses, diasEntre } from './cuenta.mjs';

const HOST_OK = /^(?=.{4,253}$)([a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$|^localhost(:\d+)?$/;
const FECHA_OK = /^\d{4}-\d{2}-\d{2}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

function igualSeguro(a, b) {
    a = String(a || ''); b = String(b || '');
    if (a.length !== b.length) return false;
    let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
}

// ---- CORS: solo los orígenes de tu página (PLATAFORMA_ORIGENES, separados por coma). Nunca '*'. ----
function origenPermitido(env, request) {
    const o = request.headers.get('Origin') || '';
    const lista = String(env.PLATAFORMA_ORIGENES || '').split(',').map(x => x.trim().replace(/\/+$/, '')).filter(Boolean);
    return o && lista.includes(o) ? o : '';
}
function cors(env, request) {
    const o = origenPermitido(env, request);
    return o ? { 'Access-Control-Allow-Origin': o, 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Plataforma-Clave', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '600' } : { 'Vary': 'Origin' };
}
function resp(env, request, status, obj) {
    return new Response(JSON.stringify(obj), { status, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, cors(env, request)) });
}

// ---- Sesión del panel web (Supabase Auth de cerebritoexpressmgta.com) ----
const sesiones = new Map(); // token -> { ok, hasta }
function payloadJwt(token) {
    try { const b = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(decodeURIComponent(escape(atob(b + '='.repeat((4 - b.length % 4) % 4))))); } catch (e) { return null; }
}
async function sesionValida(env, token) {
    if (!token || token.length > 4000) return false;
    const c = sesiones.get(token); if (c && c.hasta > Date.now()) return c.ok;
    const url = String(env.CX_SUPABASE_URL || '').replace(/\/+$/, ''), key = env.CX_SUPABASE_KEY, correos = String(env.PLATAFORMA_EMAIL || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
    let ok = false;
    if (url && key && correos.length) {
        try {
            // Supabase comprueba la firma y la caducidad del token; el Worker comprueba quién es y que haya usado el 2.º paso
            const r = await fetch(url + '/auth/v1/user', { headers: { apikey: key, Authorization: 'Bearer ' + token } });
            if (r.ok) {
                const u = await r.json(); const p = payloadJwt(token) || {};
                const exige2fa = String(env.PLATAFORMA_EXIGIR_2FA || 'true').toLowerCase() !== 'false';
                ok = !!u.email_confirmed_at && correos.includes(String(u.email || '').toLowerCase()) && (!exige2fa || p.aal === 'aal2');
            }
        } catch (e) { ok = false; }
    }
    sesiones.set(token, { ok, hasta: Date.now() + (ok ? 30e3 : 10e3) });
    if (sesiones.size > 100) sesiones.clear();
    return ok;
}
async function autorizado(env, request) {
    const clave = String(env.PLATAFORMA_CLAVE || '');
    const h = request.headers.get('X-Plataforma-Clave');
    if (h) return clave.length >= 24 && igualSeguro(h, clave);
    const a = request.headers.get('Authorization') || '';
    return a.startsWith('Bearer ') ? await sesionValida(env, a.slice(7).trim()) : false;
}

const numero = (v, def) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : def; };

function conCuenta(n, ultimoPago) {
    return Object.assign({}, n, { cuenta: estadoCuenta(n), ultimo_pago: ultimoPago || null });
}

export async function manejarPlataforma(request, env, path, hooks) {
    const R = (s, o) => resp(env, request, s, o);
    const metodo = request.method.toUpperCase();
    if (metodo === 'OPTIONS') {
        return origenPermitido(env, request) ? new Response(null, { status: 204, headers: cors(env, request) }) : new Response(null, { status: 403 });
    }
    if (!(await autorizado(env, request))) return R(403, { detail: 'No autorizado' });
    const url = new URL(request.url);

    if (metodo === 'GET' && path === '/api/plataforma/negocios') {
        const [negocios, pagos] = await Promise.all([listarNegocios(env, false), listarPagos(env, 0, 500)]);
        const ult = {}; pagos.forEach(p => { if (!ult[p.negocio_id]) ult[p.negocio_id] = { fecha: p.fecha, monto: p.monto, moneda: p.moneda }; });
        return R(200, { hoy: hoyCaracasISO(), negocios: negocios.map(n => conCuenta(n, ult[n.id])), plantillas: listarPlantillas() });
    }
    if (metodo === 'GET' && path === '/api/plataforma/pagos') {
        const id = parseInt(url.searchParams.get('negocio_id'), 10);
        return R(200, { pagos: await listarPagos(env, id >= 1 ? id : 0, 200) });
    }
    if (metodo !== 'POST') return R(404, { detail: 'Not Found' });
    const cuerpo = await request.json().catch(() => ({}));

    // ---- Crear negocio ----
    if (path === '/api/plataforma/negocios') {
        const slug = String(cuerpo.slug || '').toLowerCase();
        const nombre = String(cuerpo.nombre || '').trim();
        const hosts = (Array.isArray(cuerpo.hosts) ? cuerpo.hosts : []).map(h => String(h).toLowerCase().trim());
        const adminUser = String(cuerpo.admin_user || 'admin').trim();
        const adminClave = String(cuerpo.admin_clave || '');
        const plantilla = plantillaValida(cuerpo.plantilla) ? cuerpo.plantilla : 'general';
        if (!/^[a-z0-9-]{3,40}$/.test(slug)) return R(422, { detail: 'slug inválido (3 a 40: letras minúsculas, números y guiones)' });
        if (nombre.length < 2) return R(422, { detail: 'Falta el nombre del negocio' });
        if (!hosts.length || !hosts.every(h => HOST_OK.test(h))) return R(422, { detail: 'hosts inválidos (ej: ["mi-cliente.com","www.mi-cliente.com"])' });
        if (adminClave.length < 8) return R(422, { detail: 'admin_clave: mínimo 8 caracteres' });
        if (cuerpo.vence_el && !FECHA_OK.test(cuerpo.vence_el)) return R(422, { detail: 'vence_el debe ser AAAA-MM-DD' });
        for (const h of hosts) if (await negocioPorHost(env, h)) return R(409, { detail: 'El dominio ' + h + ' ya pertenece a otro negocio' });
        const color = HEX.test(String(cuerpo.color_principal || '')) ? String(cuerpo.color_principal) : '';
        const n = await crearNegocio(env, {
            slug, nombre, hosts, plantilla, plan: String(cuerpo.plan || 'basico'), notas: String(cuerpo.notas || '').slice(0, 500),
            max_sucursales: Math.max(1, parseInt(cuerpo.max_sucursales, 10) || 1), precio_mensual: numero(cuerpo.precio_mensual, 0),
            moneda: String(cuerpo.moneda || 'USD').slice(0, 6), vence_el: cuerpo.vence_el || null, dias_gracia: Math.max(0, parseInt(cuerpo.dias_gracia, 10) || 5)
        });
        try {
            const db = crearDbInicial(await hashClave(adminClave), adminUser, String(cuerpo.admin_nombre || 'Administrador'), { vacio: true, titulo: nombre });
            aplicarPlantilla(db, plantilla, color);
            try { const base = await leerEstado(env, parseInt(env.NEGOCIO_POR_DEFECTO, 10) || 1); if (base && base.data && base.data.tasa) db.tasa = base.data.tasa; } catch (e) { /* la tasa se actualiza con el cron */ }
            await crearEstado(env, n.id, db);
        } catch (e) {
            await borrarNegocioSinDatos(env, n.id).catch(() => {}); // deshace para no dejar un negocio a medias
            throw e;
        }
        hooks.olvidar();
        return R(201, { negocio: conCuenta(n), admin_user: adminUser });
    }

    // ---- Editar / suspender / reactivar ----
    if (path === '/api/plataforma/negocios/actualizar') {
        const id = parseInt(cuerpo.id, 10);
        if (!(id >= 1)) return R(422, { detail: 'Falta id' });
        const cambios = {};
        if (typeof cuerpo.activo === 'boolean') cambios.activo = cuerpo.activo;
        if (cuerpo.max_sucursales != null) cambios.max_sucursales = Math.max(1, parseInt(cuerpo.max_sucursales, 10) || 1);
        if (cuerpo.nombre) cambios.nombre = String(cuerpo.nombre).trim().slice(0, 80);
        if (cuerpo.plan) cambios.plan = String(cuerpo.plan).slice(0, 40);
        if (cuerpo.notas != null) cambios.notas = String(cuerpo.notas).slice(0, 500);
        if (cuerpo.precio_mensual != null) cambios.precio_mensual = numero(cuerpo.precio_mensual, 0);
        if (cuerpo.moneda) cambios.moneda = String(cuerpo.moneda).slice(0, 6);
        if (cuerpo.dias_gracia != null) cambios.dias_gracia = Math.max(0, Math.min(90, parseInt(cuerpo.dias_gracia, 10) || 0));
        if (cuerpo.vence_el !== undefined) { if (cuerpo.vence_el && !FECHA_OK.test(cuerpo.vence_el)) return R(422, { detail: 'vence_el debe ser AAAA-MM-DD' }); cambios.vence_el = cuerpo.vence_el || null; }
        if (cuerpo.plantilla) { if (!plantillaValida(cuerpo.plantilla)) return R(422, { detail: 'plantilla desconocida' }); cambios.plantilla = cuerpo.plantilla; }
        if (Array.isArray(cuerpo.hosts)) {
            const hosts = cuerpo.hosts.map(h => String(h).toLowerCase().trim());
            if (!hosts.length || !hosts.every(h => HOST_OK.test(h))) return R(422, { detail: 'hosts inválidos' });
            for (const h of hosts) { const o = await negocioPorHost(env, h); if (o && o.id !== id) return R(409, { detail: 'El dominio ' + h + ' ya pertenece a otro negocio' }); }
            cambios.hosts = hosts;
        }
        if (!Object.keys(cambios).length && !cuerpo.aplicar_colores) return R(422, { detail: 'Nada que cambiar' });
        const n = Object.keys(cambios).length ? await actualizarNegocio(env, id, cambios) : await negocioPorId(env, id);
        if (!n) return R(404, { detail: 'Negocio no existe' });
        // Opcional: pintar al negocio con los colores y el nombre de locales de su plantilla (pisa lo que el cliente haya elegido)
        if (cuerpo.aplicar_colores) {
            for (let i = 0; i < 4; i++) {
                const est = await leerEstado(env, id); if (!est) break;
                aplicarPlantilla(est.data, n.plantilla, '');
                if (await guardarEstado(env, id, est.version, est.data, { mensaje: 'actualizacion', sucursal_id: null, ts: Date.now() })) break;
            }
        }
        hooks.olvidar();
        return R(200, { negocio: conCuenta(n) });
    }

    // ---- Registrar un pago: extiende el vencimiento y reactiva ----
    if (path === '/api/plataforma/pagos') {
        const id = parseInt(cuerpo.negocio_id, 10);
        const n = id >= 1 ? await negocioPorId(env, id) : null;
        if (!n) return R(404, { detail: 'Negocio no existe' });
        const monto = numero(cuerpo.monto, -1); if (monto < 0) return R(422, { detail: 'monto inválido' });
        const meses = Math.max(1, Math.min(24, parseInt(cuerpo.meses, 10) || 1));
        const hoy = hoyCaracasISO();
        const fecha = FECHA_OK.test(cuerpo.fecha || '') ? cuerpo.fecha : hoy;
        // Se extiende desde el vencimiento actual (mantiene el ciclo); si venció hace más de un mes, desde hoy
        const venc = n.vence_el ? String(n.vence_el).slice(0, 10) : null;
        const base = venc && diasEntre(venc, hoy) <= 31 ? venc : hoy;
        const nuevo = sumarMeses(base, meses);
        const pago = await crearPago(env, { negocio_id: id, fecha, monto, moneda: String(cuerpo.moneda || n.moneda || 'USD').slice(0, 6), metodo: String(cuerpo.metodo || '').slice(0, 40), referencia: String(cuerpo.referencia || '').slice(0, 80), meses, vence_el_nuevo: nuevo, notas: String(cuerpo.notas || '').slice(0, 300) });
        const actualizado = await actualizarNegocio(env, id, { vence_el: nuevo, activo: true });
        hooks.olvidar();
        return R(201, { pago, negocio: conCuenta(actualizado || n) });
    }
    return R(404, { detail: 'Not Found' });
}

// Colores y nombre de locales de la plantilla (los símbolos del fondo se aplican solos al servir las páginas)
export function aplicarPlantilla(db, plantillaId, colorPropio) {
    const pl = plantillaDe(plantillaId);
    db.sitio = db.sitio || {};
    if (pl.colores) { db.sitio.colorPrincipal = colorPropio || pl.colores[0]; db.sitio.colorSecundario = pl.colores[1]; db.sitio.colorPortada = pl.colores[2]; }
    else if (colorPropio) db.sitio.colorPrincipal = colorPropio;
    db.sitio.etiquetaLocales = pl.locales === 'Sucursales' ? '' : pl.locales;
}
