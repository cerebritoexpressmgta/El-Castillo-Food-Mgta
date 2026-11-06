// Tokens firmados (HMAC-SHA256) y contraseñas con PBKDF2. Solo WebCrypto, sin dependencias.
const enc = new TextEncoder();
let SECRETO = '';
export function configurarSecreto(s) { SECRETO = String(s || ''); }

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

async function claveHmac() {
    if (SECRETO.length < 16) throw new Error('JWT_SECRET no configurado (mínimo 16 caracteres)');
    return crypto.subtle.importKey('raw', enc.encode(SECRETO), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function crearToken(username, rol) {
    const payload = b64u(enc.encode(JSON.stringify({ sub: username, rol, exp: Date.now() + 12 * 3600e3 })));
    const firma = await crypto.subtle.sign('HMAC', await claveHmac(), enc.encode(payload));
    return payload + '.' + b64u(firma);
}

// Devuelve { sub, rol, exp } o null si falta, está alterado o venció
export async function verificarToken(authorization) {
    try {
        if (!authorization || !String(authorization).startsWith('Bearer ')) return null;
        const [payload, firma] = String(authorization).slice(7).trim().split('.');
        if (!payload || !firma) return null;
        const valido = await crypto.subtle.verify('HMAC', await claveHmac(), deB64u(firma), enc.encode(payload));
        if (!valido) return null;
        const p = JSON.parse(new TextDecoder().decode(deB64u(payload)));
        if (!p || !p.exp || Date.now() > p.exp) return null;
        return p;
    } catch (e) { return null; }
}

const ITER = 100000; // máximo permitido por Cloudflare Workers
async function derivar(clave, sal, iter) {
    const base = await crypto.subtle.importKey('raw', enc.encode(clave), 'PBKDF2', false, ['deriveBits']);
    return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iter }, base, 256);
}
export async function hashClave(clave) {
    const sal = crypto.getRandomValues(new Uint8Array(16));
    return `pbkdf2$${ITER}$${b64u(sal)}$${b64u(await derivar(String(clave), sal, ITER))}`;
}
export async function verificarClave(clave, guardado) {
    try {
        const [tipo, iter, sal, hash] = String(guardado || '').split('$');
        if (tipo !== 'pbkdf2') return false;
        const calc = new Uint8Array(await derivar(String(clave), deB64u(sal), Number(iter)));
        const esperado = deB64u(hash);
        if (calc.length !== esperado.length) return false;
        let dif = 0; for (let i = 0; i < calc.length; i++) dif |= calc[i] ^ esperado[i];
        return dif === 0;
    } catch (e) { return false; }
}
