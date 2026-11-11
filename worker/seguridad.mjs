// Seguridad de cuentas del personal: 2FA con app (TOTP: Google Authenticator, Authy, Microsoft...),
// huella / rostro del dispositivo (WebAuthn), códigos de respaldo, claves temporales y recuperación.
// Solo WebCrypto, sin dependencias. Todo es OPCIONAL: sin activar nada, el login sigue igual que antes.
import { hashClave, verificarClave, firmarObjeto, leerObjeto } from './auth.mjs';

const enc = new TextEncoder();
export const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const deB64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const sha256 = async (datos) => new Uint8Array(await crypto.subtle.digest('SHA-256', datos));
const hex = (u8) => Array.from(u8).map(b => b.toString(16).padStart(2, '0')).join('');
const iguales = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; };

// ------------------------------------------------------------------ TOTP (RFC 6238)
const ALF32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes) {
    let bits = 0, val = 0, out = '';
    for (const b of bytes) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += ALF32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
    if (bits > 0) out += ALF32[(val << (5 - bits)) & 31];
    return out;
}
export function deBase32(s) {
    let bits = 0, val = 0; const out = [];
    for (const ch of String(s).toUpperCase().replace(/[^A-Z2-7]/g, '')) { val = (val << 5) | ALF32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
    return new Uint8Array(out);
}
export function nuevoSecretoTotp() { return base32(crypto.getRandomValues(new Uint8Array(20))); }
export async function codigoTotp(secretoB32, paso) {
    const llave = await crypto.subtle.importKey('raw', deBase32(secretoB32), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const buf = new ArrayBuffer(8); const v = new DataView(buf);
    v.setUint32(0, Math.floor(paso / 4294967296)); v.setUint32(4, paso >>> 0);
    const h = new Uint8Array(await crypto.subtle.sign('HMAC', llave, buf));
    const o = h[19] & 15;
    const n = ((h[o] & 0x7f) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1000000;
    return String(n).padStart(6, '0');
}
// Devuelve el paso de 30 s que coincide (tolera ±1 por diferencia de reloj) o null. Rechaza códigos ya usados.
export async function verificarTotp(secretoB32, codigo, ultimoPaso, ahora) {
    const c = String(codigo || '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(c)) return null;
    const actual = Math.floor((ahora || Date.now()) / 30000);
    for (const d of [0, -1, 1]) {
        const p = actual + d;
        if (ultimoPaso && p <= ultimoPaso) continue;
        if (iguales(enc.encode(await codigoTotp(secretoB32, p)), enc.encode(c))) return p;
    }
    return null;
}

// ------------------------------------------------------------------ Códigos de respaldo
const ALF_COD = 'abcdefghjkmnpqrstuvwxyz23456789';
const normCodigo = (c) => String(c || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export async function generarCodigosRespaldo(n = 8) {
    const claros = [], guardados = [];
    for (let i = 0; i < n; i++) {
        const r = crypto.getRandomValues(new Uint8Array(10));
        const c = Array.from(r, x => ALF_COD[x % ALF_COD.length]).join('');
        claros.push(c.slice(0, 5) + '-' + c.slice(5));
        guardados.push(hex(await sha256(enc.encode(c))));
    }
    return { claros, guardados };
}
// Si el código es válido lo consume y devuelve true
export async function consumirCodigoRespaldo(u, codigo) {
    const c = normCodigo(codigo);
    if (c.length !== 10 || !Array.isArray(u.codigos_respaldo)) return false;
    const h = hex(await sha256(enc.encode(c)));
    const i = u.codigos_respaldo.indexOf(h);
    if (i < 0) return false;
    u.codigos_respaldo.splice(i, 1);
    return true;
}

// ------------------------------------------------------------------ WebAuthn (huella / rostro / bloqueo del dispositivo)
function derARaw(der) { // firma ECDSA en DER -> r||s (64 bytes) para WebCrypto
    let i = 2; if (der[1] & 0x80) i += der[1] & 0x7f;
    const leer = () => { i++; const len = der[i++]; let x = der.slice(i, i + len); i += len; while (x.length > 32 && x[0] === 0) x = x.slice(1); const o = new Uint8Array(32); o.set(x, 32 - x.length); return o; };
    const r = leer(), s = leer(); const out = new Uint8Array(64); out.set(r, 0); out.set(s, 32); return out;
}
const concat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a, 0); o.set(b, a.length); return o; };
export function nuevoReto() { return b64u(crypto.getRandomValues(new Uint8Array(32))); }

function leerClientData(clientDataB64, tipo, reto, origen) {
    const cd = JSON.parse(new TextDecoder().decode(deB64u(clientDataB64)));
    if (cd.type !== tipo) throw new Error('tipo');
    if (cd.challenge !== reto) throw new Error('reto');
    if (cd.origin !== origen) throw new Error('origen');
    return cd;
}
// Registro: confirma que el navegador firmó NUESTRO reto en ESTE sitio y guarda la llave pública
export function validarRegistro(d, reto, origen) {
    try {
        leerClientData(d.clientDataJSON, 'webauthn.create', reto, origen);
        const alg = Number(d.alg);
        if (![-7, -257].includes(alg)) return null;
        if (!d.id || !d.publicKey) return null;
        return { id: String(d.id), pk: String(d.publicKey), alg };
    } catch (e) { return null; }
}
// Inicio de sesión: verifica firma, reto, sitio, presencia + verificación del usuario (huella/rostro/PIN del equipo) y contador
export async function verificarAfirmacion(cred, d, reto, origen, rpId) {
    try {
        leerClientData(d.clientDataJSON, 'webauthn.get', reto, origen);
        const authData = deB64u(d.authenticatorData);
        if (authData.length < 37) return false;
        if (!iguales(authData.slice(0, 32), await sha256(enc.encode(rpId)))) return false;
        const flags = authData[32];
        if (!(flags & 1) || !(flags & 4)) return false; // UP y UV obligatorios
        const contador = new DataView(authData.buffer, authData.byteOffset + 33, 4).getUint32(0);
        if ((contador || cred.contador) && contador <= (cred.contador || 0)) return false;
        const firmado = concat(authData, await sha256(deB64u(d.clientDataJSON)));
        const spki = deB64u(cred.pk); const firma = deB64u(d.signature);
        let ok;
        if (cred.alg === -7) {
            const k = await crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
            ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, derARaw(firma), firmado);
        } else {
            const k = await crypto.subtle.importKey('spki', spki, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
            ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', k, firma, firmado);
        }
        if (ok) cred.contador = contador;
        return ok;
    } catch (e) { return false; }
}

// ------------------------------------------------------------------ Utilidades
const ALF_TEMP = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
export function claveTemporal() { return Array.from(crypto.getRandomValues(new Uint8Array(10)), x => ALF_TEMP[x % ALF_TEMP.length]).join(''); }
export const tiene2fa = (u) => !!(u && ((u.totp && u.totp.secreto) || (Array.isArray(u.webauthn) && u.webauthn.length)));
export function iguales_texto(a, b) { return iguales(enc.encode(String(a)), enc.encode(String(b))); }

// ------------------------------------------------------------------ Rutas
// h = utilidades internas de rutas.mjs: { ruta, ok, HttpError, sesionDe, requiereAdmin, cupoAgotado, anotarFallo, olvidarFallos, hashClave, verificarClave }
export function registrarSeguridad(h) {
    const { ruta, ok, HttpError, sesionDe, requiereAdmin, cupoAgotado, anotarFallo, olvidarFallos } = h;
    const esAdminRol = (r) => ['admin', 'superadmin'].includes(String(r || '').toLowerCase());
    const largoMin = (u) => esAdminRol(u.rol) ? 8 : 4;
    const yo = (ctx, db) => {
        const s = sesionDe(ctx);
        const u = db.usuarios.find(x => String(x.username).toLowerCase() === String(s.sub).toLowerCase());
        if (!u) throw new HttpError(401, 'Tu usuario ya no existe');
        return u;
    };
    // Confirma la contraseña actual (con tope de intentos) antes de cambios sensibles. Devuelve un mensaje de error o null.
    // (No lanza error: si la ruta falla con excepción el servidor no guarda el conteo de intentos.)
    async function exigirClave(u, clave) {
        const k = 'clave-fallida:' + String(u.username).toLowerCase();
        if (cupoAgotado(k, 5, 15 * 60)) return 'Demasiados intentos. Espera 15 minutos.';
        if (!clave || !(await verificarClave(String(clave).trim(), u.pin))) { anotarFallo(k); return 'La contraseña actual no es correcta.'; }
        olvidarFallos(k); return null;
    }
    // Acepta un código de la app o uno de respaldo. Devuelve true si es válido (y lo marca como usado)
    async function aceptarCodigo2fa(u, codigo) {
        const k = '2fa-fallido:' + String(u.username).toLowerCase();
        if (cupoAgotado(k, 6, 15 * 60)) throw new HttpError(429, 'Demasiados intentos con el código. Espera 15 minutos.');
        let bien = false;
        if (u.totp && u.totp.secreto) {
            const paso = await verificarTotp(u.totp.secreto, codigo, u.totp.ultimo || 0);
            if (paso) { u.totp.ultimo = paso; bien = true; }
        }
        if (!bien && await consumirCodigoRespaldo(u, codigo)) bien = true;
        if (!bien) { anotarFallo(k); return false; }
        olvidarFallos(k); return true;
    }
    h.aceptarCodigo2fa = aceptarCodigo2fa;

    ruta('GET', '/api/seguridad/estado', (ctx, db) => {
        const u = yo(ctx, db);
        return {
            totp: !!(u.totp && u.totp.secreto), codigos_restantes: (u.codigos_respaldo || []).length,
            biometria: (u.webauthn || []).map(c => ({ id: c.id, nombre: c.nombre, creado: c.creado })),
            clave_minima: largoMin(u), rol: u.rol
        };
    });

    ruta('POST', '/api/seguridad/clave/cambiar', async (ctx, db) => {
        const u = yo(ctx, db); const d = ctx.body || {};
        { const e = await exigirClave(u, d.actual); if (e) return { success: false, error: e }; }
        const nueva = String(d.nueva || '');
        if (nueva.trim().length < largoMin(u)) throw new HttpError(400, `La contraseña debe tener al menos ${largoMin(u)} caracteres.`);
        if (nueva.length > 72) throw new HttpError(400, 'Contraseña demasiado larga.');
        u.pin = await hashClave(nueva); u.debe_cambiar = false;
        return ok({ msg: 'Contraseña actualizada' });
    });

    // ---- 2FA con app ----
    ruta('POST', '/api/seguridad/2fa/iniciar', async (ctx, db) => {
        const u = yo(ctx, db); { const e = await exigirClave(u, (ctx.body || {}).clave); if (e) return { success: false, error: e }; }
        if (u.totp && u.totp.secreto) throw new HttpError(400, 'El 2FA con app ya está activo.');
        u.totp_pend = nuevoSecretoTotp();
        const negocio = String((db.sitio && db.sitio.titulo) || 'El Castillo Food');
        const uri = `otpauth://totp/${encodeURIComponent(negocio + ':' + u.username)}?secret=${u.totp_pend}&issuer=${encodeURIComponent(negocio)}&algorithm=SHA1&digits=6&period=30`;
        return ok({ secreto: u.totp_pend, uri });
    });
    ruta('POST', '/api/seguridad/2fa/activar', async (ctx, db) => {
        const u = yo(ctx, db);
        if (!u.totp_pend) throw new HttpError(400, 'Primero toca "Activar 2FA" para generar el código QR.');
        const k = '2fa-fallido:' + String(u.username).toLowerCase();
        if (cupoAgotado(k, 6, 15 * 60)) throw new HttpError(429, 'Demasiados intentos. Espera 15 minutos.');
        const paso = await verificarTotp(u.totp_pend, (ctx.body || {}).codigo, 0);
        if (!paso) { anotarFallo(k); return { success: false, error: 'Ese código no coincide. Revisa que la hora de tu teléfono sea automática e intenta con el siguiente.' }; }
        olvidarFallos(k);
        const cod = await generarCodigosRespaldo(8);
        u.totp = { secreto: u.totp_pend, ultimo: paso }; delete u.totp_pend; u.codigos_respaldo = cod.guardados;
        return ok({ codigos: cod.claros });
    });
    ruta('POST', '/api/seguridad/2fa/desactivar', async (ctx, db) => {
        const u = yo(ctx, db); const d = ctx.body || {};
        { const e = await exigirClave(u, d.clave); if (e) return { success: false, error: e }; }
        if (!(u.totp && u.totp.secreto)) throw new HttpError(400, 'El 2FA con app no está activo.');
        if (!(await aceptarCodigo2fa(u, d.codigo))) return { success: false, error: 'Código incorrecto.' };
        delete u.totp; delete u.totp_pend; delete u.codigos_respaldo;
        return ok({ msg: '2FA con app desactivado' });
    });
    ruta('POST', '/api/seguridad/codigos/regenerar', async (ctx, db) => {
        const u = yo(ctx, db); const d = ctx.body || {};
        { const e = await exigirClave(u, d.clave); if (e) return { success: false, error: e }; }
        if (!(u.totp && u.totp.secreto)) throw new HttpError(400, 'Activa primero el 2FA con app.');
        if (!(await aceptarCodigo2fa(u, d.codigo))) return { success: false, error: 'Código incorrecto.' };
        const cod = await generarCodigosRespaldo(8); u.codigos_respaldo = cod.guardados;
        return ok({ codigos: cod.claros });
    });

    // ---- Huella / rostro (WebAuthn) ----
    ruta('POST', '/api/seguridad/biometria/opciones', async (ctx, db) => {
        const u = yo(ctx, db); { const e = await exigirClave(u, (ctx.body || {}).clave); if (e) return { success: false, error: e }; }
        if ((u.webauthn || []).length >= 5) throw new HttpError(400, 'Máximo 5 dispositivos. Quita uno para agregar otro.');
        const ch = nuevoReto();
        const token = await firmarObjeto({ sub: u.username, fase: 'wa-reg', ch }, 5 * 60e3);
        return ok({
            token, opciones: {
                challenge: ch, rp: { name: String((db.sitio && db.sitio.titulo) || 'El Castillo Food'), id: ctx.host },
                user: { id: b64u(enc.encode('u' + u.id)), name: u.username, displayName: u.nombre },
                pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
                authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
                excludeCredentials: (u.webauthn || []).map(c => ({ type: 'public-key', id: c.id })),
                timeout: 120000, attestation: 'none'
            }
        });
    });
    ruta('POST', '/api/seguridad/biometria/registrar', async (ctx, db) => {
        const u = yo(ctx, db); const d = ctx.body || {};
        const t = await leerObjeto(d.token);
        if (!t || t.fase !== 'wa-reg' || String(t.sub).toLowerCase() !== String(u.username).toLowerCase()) throw new HttpError(400, 'La solicitud venció. Vuelve a intentarlo.');
        const c = validarRegistro(d, t.ch, ctx.origen);
        if (!c) throw new HttpError(400, 'No se pudo verificar el dispositivo. Intenta de nuevo (necesita https y un lector de huella, rostro o bloqueo de pantalla).');
        u.webauthn = (u.webauthn || []).filter(x => x.id !== c.id);
        u.webauthn.push({ id: c.id, pk: c.pk, alg: c.alg, contador: 0, nombre: String(d.nombre || 'Mi dispositivo').replace(/[<>]/g, '').slice(0, 40) || 'Mi dispositivo', creado: new Date().toISOString().slice(0, 10) });
        return ok({ msg: 'Dispositivo registrado' });
    });
    ruta('POST', '/api/seguridad/biometria/quitar', async (ctx, db) => {
        const u = yo(ctx, db); const d = ctx.body || {};
        { const e = await exigirClave(u, d.clave); if (e) return { success: false, error: e }; }
        u.webauthn = (u.webauthn || []).filter(c => c.id !== d.id);
        if (!u.webauthn.length) delete u.webauthn;
        return ok({ msg: 'Dispositivo quitado' });
    });

    // ---- Administración: ayudar a quien olvidó su clave o perdió su teléfono ----
    function objetivo(ctx, db) {
        const adm = requiereAdmin(ctx);
        const u = db.usuarios.find(x => x.id === (ctx.body || {}).id);
        if (!u) throw new HttpError(404, 'Usuario no encontrado');
        if (String(u.username).toLowerCase() === String(adm.sub).toLowerCase()) throw new HttpError(400, 'Para tu propia cuenta usa "Mi seguridad".');
        if (String(u.rol).toLowerCase() === 'superadmin' && String(adm.rol).toLowerCase() !== 'superadmin') throw new HttpError(403, 'Solo un superadmin puede hacerlo con otro superadmin');
        return u;
    }
    ruta('POST', '/api/usuarios/restablecer-clave', async (ctx, db) => {
        const u = objetivo(ctx, db);
        const temp = claveTemporal();
        u.pin = await hashClave(temp); u.debe_cambiar = true;
        olvidarFallos('login-fallido:' + String(u.username).toLowerCase());
        return ok({ clave_temporal: temp, msg: 'Clave temporal creada. La persona deberá cambiarla al entrar.' });
    });
    ruta('POST', '/api/usuarios/quitar-2fa', (ctx, db) => {
        const u = objetivo(ctx, db);
        delete u.totp; delete u.totp_pend; delete u.codigos_respaldo; delete u.webauthn;
        olvidarFallos('2fa-fallido:' + String(u.username).toLowerCase());
        return ok({ msg: 'Se quitó el 2FA y los dispositivos de esa cuenta.' });
    });

    // ---- Recuperación del dueño con la clave guardada en Cloudflare (CLAVE_RECUPERACION) ----
    ruta('POST', '/api/usuarios/recuperar-con-clave', async (ctx, db) => {
        const d = ctx.body || {}; const secreto = String((ctx.env && ctx.env.CLAVE_RECUPERACION) || '');
        if (secreto.length < 12) throw new HttpError(503, 'La recuperación no está configurada. En Cloudflare agrega el secreto CLAVE_RECUPERACION (mínimo 12 caracteres) y vuelve a desplegar.');
        if (cupoAgotado('recuperar-global', 5, 15 * 60)) throw new HttpError(429, 'Demasiados intentos. Espera 15 minutos.');
        const u = db.usuarios.find(x => String(x.username).toLowerCase() === String(d.username || '').trim().toLowerCase());
        if (!u || !iguales_texto(String(d.clave_recuperacion || ''), secreto)) { anotarFallo('recuperar-global'); return { success: false, error: 'Usuario o clave de recuperación incorrectos.' }; }
        const nueva = String(d.nueva || '');
        if (nueva.trim().length < largoMin(u)) throw new HttpError(400, `La nueva contraseña debe tener al menos ${largoMin(u)} caracteres.`);
        if (nueva.length > 72) throw new HttpError(400, 'Contraseña demasiado larga.');
        u.pin = await hashClave(nueva); u.debe_cambiar = false;
        delete u.totp; delete u.totp_pend; delete u.codigos_respaldo; delete u.webauthn;
        olvidarFallos('login-fallido:' + String(u.username).toLowerCase()); olvidarFallos('2fa-fallido:' + String(u.username).toLowerCase());
        olvidarFallos('recuperar-global');
        return ok({ msg: 'Contraseña restablecida. Ya puedes entrar.' });
    });
}
