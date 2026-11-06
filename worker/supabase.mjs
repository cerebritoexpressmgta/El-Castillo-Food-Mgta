// Acceso a Supabase (REST) con la llave service_role, que solo vive en el Worker.
function base(env) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new Error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_KEY');
    return env.SUPABASE_URL.replace(/\/$/, '');
}
function cab(env, extra) {
    return Object.assign({ apikey: env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' }, extra || {});
}
async function pedir(env, ruta, init) {
    const r = await fetch(base(env) + ruta, init);
    const t = await r.text();
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${t.slice(0, 300)}`);
    return t ? JSON.parse(t) : null;
}

export async function leerEstado(env) {
    const f = await pedir(env, '/rest/v1/app_state?id=eq.1&select=version,data', { headers: cab(env) });
    return f && f[0] ? f[0] : null;
}
export async function crearEstado(env, data) {
    const r = await fetch(base(env) + '/rest/v1/app_state', {
        method: 'POST', headers: cab(env, { Prefer: 'resolution=ignore-duplicates,return=minimal' }),
        body: JSON.stringify({ id: 1, version: 1, data })
    });
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 300)}`);
}
// Guarda solo si nadie más escribió antes (bloqueo optimista). Devuelve true/false.
export async function guardarEstado(env, versionLeida, data, evento) {
    const f = await pedir(env, `/rest/v1/app_state?id=eq.1&version=eq.${versionLeida}&select=version`, {
        method: 'PATCH', headers: cab(env, { Prefer: 'return=representation' }),
        body: JSON.stringify({ data, version: versionLeida + 1, evento, updated_at: new Date().toISOString() })
    });
    return Array.isArray(f) && f.length === 1;
}
export async function leerVersion(env) {
    const f = await pedir(env, '/rest/v1/app_state?id=eq.1&select=version,evento', { headers: cab(env) });
    return f && f[0] ? f[0] : { version: 0, evento: null };
}
// Solicitud diaria: toca la base para que Supabase no pause el proyecto
export async function mantenerActivo(env) {
    const f = await pedir(env, '/rest/v1/app_state?id=eq.1&select=id', {
        method: 'PATCH', headers: cab(env, { Prefer: 'return=representation' }),
        body: JSON.stringify({ last_ping: new Date().toISOString() })
    });
    return f;
}
export async function subirImagen(env, nombre, bytes, tipo) {
    const r = await fetch(`${base(env)}/storage/v1/object/imagenes/${nombre}`, {
        method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': tipo, 'x-upsert': 'true' }, body: bytes
    });
    if (!r.ok) throw new Error(`Storage ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return `${base(env)}/storage/v1/object/public/imagenes/${nombre}`;
}
