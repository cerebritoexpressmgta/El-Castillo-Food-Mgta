// Acceso a Supabase (REST) con la llave service_role, que solo vive en el Worker.
function base(env) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new Error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_KEY');
    return env.SUPABASE_URL.replace(/\/$/, '');
}
// Llaves nuevas de Supabase (sb_secret_...) van solo en "apikey"; las antiguas (service_role, JWT) también en Authorization.
function auth(env) {
    const k = env.SUPABASE_SERVICE_KEY;
    return String(k).startsWith('sb_') ? { apikey: k } : { apikey: k, Authorization: 'Bearer ' + k };
}
function cab(env, extra) {
    return Object.assign({ 'Content-Type': 'application/json' }, auth(env), extra || {});
}
async function pedir(env, ruta, init) {
    const r = await fetch(base(env) + ruta, init);
    const t = await r.text();
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${t.slice(0, 300)}`);
    return t ? JSON.parse(t) : null;
}

// ---------------------------------------------------------------------
// MULTI-CLIENTE: una sola base de Supabase para varios negocios.
//  - public.negocios  : un registro por cliente (dominios, plan, activo).
//  - public.app_state : UNA fila por negocio; su id es el id del negocio.
// Toda lectura/escritura de datos del negocio lleva su id (nid). El Worker lo obtiene
// del dominio de la solicitud (ver index.mjs) y NUNCA de lo que mande el navegador.
// ---------------------------------------------------------------------
const entero = (n) => { const v = Number(n); if (!Number.isInteger(v) || v < 1) throw new Error('Negocio inválido'); return v; };

export async function leerEstado(env, nid) {
    const f = await pedir(env, `/rest/v1/app_state?id=eq.${entero(nid)}&select=version,data`, { headers: cab(env) });
    return f && f[0] ? f[0] : null;
}
export async function crearEstado(env, nid, data) {
    const r = await fetch(base(env) + '/rest/v1/app_state', {
        method: 'POST', headers: cab(env, { Prefer: 'resolution=ignore-duplicates,return=minimal' }),
        body: JSON.stringify({ id: entero(nid), version: 1, data })
    });
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 300)}`);
}
// Guarda solo si nadie más escribió antes (bloqueo optimista, por negocio). Devuelve true/false.
export async function guardarEstado(env, nid, versionLeida, data, evento) {
    const f = await pedir(env, `/rest/v1/app_state?id=eq.${entero(nid)}&version=eq.${Number(versionLeida)}&select=version`, {
        method: 'PATCH', headers: cab(env, { Prefer: 'return=representation' }),
        body: JSON.stringify({ data, version: versionLeida + 1, evento, updated_at: new Date().toISOString() })
    });
    return Array.isArray(f) && f.length === 1;
}
export async function leerVersion(env, nid) {
    const f = await pedir(env, `/rest/v1/app_state?id=eq.${entero(nid)}&select=version,evento`, { headers: cab(env) });
    return f && f[0] ? f[0] : { version: 0, evento: null };
}
// Solicitud diaria: toca la base (una sola petición) para que Supabase no pause el proyecto
export async function mantenerActivo(env) {
    return await pedir(env, '/rest/v1/negocios?activo=eq.true&select=id', {
        method: 'PATCH', headers: cab(env, { Prefer: 'return=representation' }),
        body: JSON.stringify({ ultimo_ping: new Date().toISOString() })
    });
}
// Las imágenes de cada negocio van en su propia carpeta del bucket: imagenes/<id negocio>/<archivo>
export async function subirImagen(env, nid, nombre, bytes, tipo) {
    const ruta = `${entero(nid)}/${nombre}`;
    const r = await fetch(`${base(env)}/storage/v1/object/imagenes/${ruta}`, {
        method: 'POST', headers: Object.assign({ 'Content-Type': tipo, 'x-upsert': 'true' }, auth(env)), body: bytes
    });
    if (!r.ok) throw new Error(`Storage ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return `${base(env)}/storage/v1/object/public/imagenes/${ruta}`;
}

// ---- Negocios (clientes de la plataforma) ----
const COLS_NEGOCIO = 'id,slug,nombre,hosts,activo,max_sucursales,plan,plantilla,precio_mensual,moneda,vence_el,dias_gracia,notas,marca_original,creado_en';
export async function negocioPorHost(env, host) {
    const h = String(host || '').toLowerCase().replace(/[^a-z0-9.\-:]/g, '');
    if (!h) return null;
    const f = await pedir(env, `/rest/v1/negocios?hosts=cs.${encodeURIComponent('{' + h + '}')}&select=${COLS_NEGOCIO}&limit=1`, { headers: cab(env) });
    return f && f[0] ? f[0] : null;
}
export async function negocioPorId(env, id) {
    const f = await pedir(env, `/rest/v1/negocios?id=eq.${entero(id)}&select=${COLS_NEGOCIO}`, { headers: cab(env) });
    return f && f[0] ? f[0] : null;
}
export async function listarNegocios(env, soloActivos) {
    return await pedir(env, `/rest/v1/negocios?${soloActivos ? 'activo=eq.true&' : ''}select=${COLS_NEGOCIO}&order=id.asc`, { headers: cab(env) }) || [];
}
export async function crearNegocio(env, n) {
    const f = await pedir(env, '/rest/v1/negocios', {
        method: 'POST', headers: cab(env, { Prefer: 'return=representation' }),
        body: JSON.stringify({ slug: n.slug, nombre: n.nombre, hosts: n.hosts, max_sucursales: n.max_sucursales || 1, plan: n.plan || 'basico', plantilla: n.plantilla || 'general', precio_mensual: n.precio_mensual || 0, moneda: n.moneda || 'USD', vence_el: n.vence_el || null, dias_gracia: n.dias_gracia == null ? 5 : n.dias_gracia, notas: n.notas || '' })
    });
    return f && f[0];
}
export async function actualizarNegocio(env, id, cambios) {
    const f = await pedir(env, `/rest/v1/negocios?id=eq.${entero(id)}&select=${COLS_NEGOCIO}`, {
        method: 'PATCH', headers: cab(env, { Prefer: 'return=representation' }), body: JSON.stringify(cambios)
    });
    return f && f[0];
}
export async function borrarNegocioSinDatos(env, id) {
    await pedir(env, `/rest/v1/negocios?id=eq.${entero(id)}`, { method: 'DELETE', headers: cab(env) });
}

// Solo el bloque "sitio" (título, logo, colores...) del negocio: liviano, sin traer pedidos ni usuarios
export async function leerSitio(env, nid) {
    const f = await pedir(env, `/rest/v1/app_state?id=eq.${entero(nid)}&select=sitio:data->sitio`, { headers: cab(env) });
    return f && f[0] && f[0].sitio ? f[0].sitio : {};
}

// ---- Pagos de suscripción ----
const COLS_PAGO = 'id,negocio_id,fecha,monto,moneda,metodo,referencia,meses,vence_el_nuevo,notas,creado_en';
export async function listarPagos(env, nid, limite) {
    const f = nid ? `negocio_id=eq.${entero(nid)}&` : '';
    return await pedir(env, `/rest/v1/negocio_pagos?${f}select=${COLS_PAGO}&order=fecha.desc,id.desc&limit=${Math.min(500, limite || 100)}`, { headers: cab(env) }) || [];
}
export async function crearPago(env, p) {
    const f = await pedir(env, '/rest/v1/negocio_pagos', { method: 'POST', headers: cab(env, { Prefer: 'return=representation' }), body: JSON.stringify(p) });
    return f && f[0];
}
