// Seguridad de cuentas del personal (opcional): 2FA con app, huella/rostro, recuperación y clave temporal.
// Se incluye en todas las pantallas del personal. Sin activar nada, el login funciona igual que antes.
(function () {
    'use strict';
    if (window.SEG) return;
    const TOKEN = 'tokioAuthToken';
    const origFetch = window.fetch.bind(window);

    // ------------------------------------------------------------ utilidades
    const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const deB64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    function el(tag, attrs, ...hijos) {
        const e = document.createElement(tag);
        Object.entries(attrs || {}).forEach(([k, v]) => {
            if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
            else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
        });
        hijos.flat().forEach(h => { if (h != null) e.appendChild(typeof h === 'string' ? document.createTextNode(h) : h); });
        return e;
    }
    const msgDe = (d) => (d && (d.error || d.detail || d.msg)) || 'No se pudo completar. Intenta de nuevo.';
    async function api(m, p, b, conSesion) {
        const h = { 'Content-Type': 'application/json' };
        if (conSesion !== false) h.Authorization = 'Bearer ' + (localStorage.getItem(TOKEN) || '');
        try {
            const r = await origFetch(p, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined });
            let d = null; try { d = await r.json(); } catch (e) { }
            if (r.status === 401 && conSesion !== false) d = { error: 'Tu sesión venció. Entra de nuevo.' };
            return { s: r.status, d: d || {} };
        } catch (e) { return { s: 0, d: { error: 'Sin conexión. Revisa tu internet.' } }; }
    }

    // ------------------------------------------------------------ estilos (tarjeta clara, legible en cualquier pantalla)
    const css = `
.sg-fondo{position:fixed;inset:0;z-index:10000;background:rgba(8,10,20,.72);display:flex;align-items:center;justify-content:center;padding:14px;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
.sg-caja{background:#fff;color:#1f2937;width:100%;max-width:440px;max-height:92vh;overflow:auto;border-radius:18px;padding:20px;box-shadow:0 24px 60px rgba(0,0,0,.45);font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:left}
.sg-caja h2{margin:0 0 4px;font-size:18px;color:#111827}.sg-caja h3{margin:18px 0 6px;font-size:14px;color:#111827}
.sg-caja p{margin:6px 0;color:#4b5563}.sg-caja small{color:#6b7280}
.sg-caja label{display:block;margin:10px 0 4px;font-weight:600;font-size:12px;color:#374151}
.sg-caja input{width:100%;box-sizing:border-box;padding:11px 12px;border:1.5px solid #d1d5db;border-radius:10px;font-size:16px;background:#fff;color:#111827}
.sg-caja input:focus{outline:none;border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.18)}
.sg-fila{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.sg-b{border:0;border-radius:10px;padding:11px 14px;font-weight:700;font-size:14px;cursor:pointer;background:#4f46e5;color:#fff}.sg-b:hover{background:#4338ca}
.sg-b.sec{background:#e5e7eb;color:#1f2937}.sg-b.sec:hover{background:#d1d5db}.sg-b.rojo{background:#dc2626}.sg-b.rojo:hover{background:#b91c1c}.sg-b.verde{background:#059669}
.sg-b:disabled{opacity:.55;cursor:wait}
.sg-err{color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:8px 10px;margin-top:10px;font-size:13px}
.sg-ok{color:#065f46;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:8px 10px;margin-top:10px;font-size:13px}
.sg-sec{border:1px solid #e5e7eb;border-radius:12px;padding:12px;margin-top:12px;background:#f9fafb}
.sg-pill{display:inline-block;font-size:11px;font-weight:700;border-radius:99px;padding:2px 8px;margin-left:6px}
.sg-on{background:#d1fae5;color:#065f46}.sg-off{background:#e5e7eb;color:#4b5563}
.sg-codigos{display:grid;grid-template-columns:1fr 1fr;gap:6px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:15px;background:#111827;color:#f9fafb;border-radius:10px;padding:12px;margin:10px 0;text-align:center;letter-spacing:.5px}
.sg-qr{display:flex;justify-content:center;margin:10px 0}.sg-qr img{width:190px;height:190px;image-rendering:pixelated;border:6px solid #fff;border-radius:6px;outline:1px solid #e5e7eb}
.sg-clave{font-family:ui-monospace,Menlo,Consolas,monospace;word-break:break-all;background:#f3f4f6;border-radius:8px;padding:8px 10px;font-size:14px;color:#111827;user-select:all}
.sg-dev{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-top:1px solid #e5e7eb}.sg-dev:first-of-type{border-top:0}
.sg-link{display:block;margin-top:10px;font-size:12px;color:#818cf8;text-align:center;cursor:pointer;text-decoration:underline;background:none;border:0;width:100%}
.sg-flot{position:fixed;left:12px;bottom:12px;z-index:9990;width:46px;height:46px;border-radius:50%;border:0;cursor:pointer;background:#1e1b4b;color:#fff;font-size:20px;box-shadow:0 6px 16px rgba(0,0,0,.4);opacity:.88}
.sg-flot:hover{opacity:1;background:#312e81}
@media print{.sg-flot,.sg-fondo{display:none}}`;
    document.head.appendChild(el('style', { text: css }));

    // ------------------------------------------------------------ diálogo genérico con campos y validación en línea
    // enviar(valores) -> texto de error (se muestra y se reintenta) o falsy (éxito). Devuelve los valores o null si cancela.
    function dialogo(o) {
        return new Promise((resolver) => {
            const err = el('div', { class: 'sg-err', style: 'display:none' });
            const campos = {}; const filas = [];
            (o.campos || []).forEach(c => {
                const inp = el('input', { type: c.type || 'text', placeholder: c.ph || '', autocomplete: c.auto || 'off', inputmode: c.modo || null, maxlength: c.max || null, autocapitalize: 'none' });
                campos[c.id] = inp; filas.push(el('label', { text: c.label }), inp);
            });
            const bOk = el('button', { class: 'sg-b ' + (o.clase || ''), type: 'submit', text: o.boton || 'Aceptar', style: o.sinBoton ? 'display:none' : null });
            const bNo = el('button', { class: 'sg-b sec', type: 'button', text: o.cancelarTxt || 'Cancelar' });
            const form = el('form', {}, ...filas, err, el('div', { class: 'sg-fila' }, bOk, o.sinCancelar ? null : bNo));
            const fondo = el('div', { class: 'sg-fondo' }, el('div', { class: 'sg-caja', role: 'dialog', 'aria-modal': 'true' },
                el('h2', { text: o.titulo }), o.texto ? el('p', { text: o.texto }) : null, o.antes || null, form, o.despues || null));
            const cerrar = (v) => { fondo.remove(); resolver(v); };
            bNo.onclick = () => cerrar(null);
            form.onsubmit = async (ev) => {
                ev.preventDefault(); err.style.display = 'none'; bOk.disabled = true;
                const vals = {}; Object.keys(campos).forEach(k => vals[k] = campos[k].value);
                const e = o.enviar ? await o.enviar(vals) : null;
                bOk.disabled = false;
                if (e) { err.textContent = e; err.style.display = 'block'; return; }
                cerrar(vals);
            };
            document.body.appendChild(fondo);
            const primero = Object.values(campos)[0]; if (primero) setTimeout(() => primero.focus(), 50);
            if (o.alAbrir) o.alAbrir(fondo, cerrar);
        });
    }
    function aviso(titulo, texto, extra) {
        return dialogo({ titulo, texto, boton: 'Entendido', sinCancelar: true, antes: extra || null });
    }

    // ------------------------------------------------------------ huella / rostro (WebAuthn) en el navegador
    const biometriaSoportada = () => !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
    async function pedirAfirmacion(w) {
        const cred = await navigator.credentials.get({ publicKey: {
            challenge: deB64u(w.reto), rpId: w.rpId, timeout: 60000, userVerification: 'required',
            allowCredentials: (w.ids || []).map(id => ({ type: 'public-key', id: deB64u(id) }))
        } });
        const r = cred.response;
        return { id: cred.id, authenticatorData: b64u(r.authenticatorData), clientDataJSON: b64u(r.clientDataJSON), signature: b64u(r.signature) };
    }
    async function registrarBiometria(opts, nombre) {
        const p = opts.opciones;
        const cred = await navigator.credentials.create({ publicKey: {
            challenge: deB64u(p.challenge), rp: p.rp, user: { id: deB64u(p.user.id), name: p.user.name, displayName: p.user.displayName },
            pubKeyCredParams: p.pubKeyCredParams, authenticatorSelection: p.authenticatorSelection, timeout: p.timeout, attestation: 'none',
            excludeCredentials: (p.excludeCredentials || []).map(c => ({ type: 'public-key', id: deB64u(c.id) }))
        } });
        const r = cred.response;
        if (!r.getPublicKey || !r.getPublicKeyAlgorithm) throw new Error('Tu navegador es muy antiguo para esto. Actualízalo.');
        return api('POST', '/api/seguridad/biometria/registrar', {
            token: opts.token, id: cred.id, clientDataJSON: b64u(r.clientDataJSON), publicKey: b64u(r.getPublicKey()), alg: r.getPublicKeyAlgorithm(), nombre
        });
    }
    const errorBiometria = (e) => (e && e.name === 'NotAllowedError') ? 'Se canceló o venció. Intenta de nuevo.' : (e && e.name === 'InvalidStateError') ? 'Este dispositivo ya está registrado.' : ((e && e.message) || 'No se pudo usar la huella o el rostro en este dispositivo.');

    // ------------------------------------------------------------ pasos extra del inicio de sesión
    async function flujoLogin(data) {
        for (let vuelta = 0; vuelta < 6; vuelta++) {
            if (data.requiere_2fa) {
                const temp = data.temp; let resultado = null; const m = data.metodos || {}; const w = data.webauthn;
                const hacerVerificacion = async (cuerpo) => {
                    const r = await api('POST', '/api/usuarios/verificar-2fa', Object.assign({ temp }, cuerpo), false);
                    if (r.d && (r.d.success || r.d.debe_cambiar)) { resultado = r.d; return null; }
                    return (r.d && (r.d.msg || r.d.detail || r.d.error)) || 'Verificación incorrecta';
                };
                const botonBio = (m.biometria && biometriaSoportada()) ? el('button', { class: 'sg-b verde', type: 'button', style: 'width:100%;margin-top:12px', text: '👆 Usar huella o rostro' }) : null;
                const nota = (m.biometria && !biometriaSoportada()) ? el('p', { class: 'sg-err', text: 'La huella/rostro solo funciona en el dispositivo donde la registraste y con https.' }) : null;
                const hecho = await dialogo({
                    titulo: '🔐 Verificación en dos pasos',
                    texto: m.app ? 'Escribe el código de 6 dígitos de tu app (Google Authenticator, Authy…) o un código de respaldo.' : 'Confirma con la huella o el rostro de este dispositivo.',
                    campos: m.app ? [{ id: 'codigo', label: 'Código', ph: '123456', auto: 'one-time-code', modo: 'text', max: 14 }] : [],
                    boton: 'Verificar', sinBoton: !m.app, sinCancelar: false, cancelarTxt: 'Cancelar',
                    antes: el('div', {}, nota, botonBio),
                    enviar: m.app ? (v) => hacerVerificacion({ codigo: v.codigo }) : async () => null,
                    alAbrir: (fondo, cerrar) => {
                        if (!botonBio) return;
                        botonBio.onclick = async () => {
                            botonBio.disabled = true;
                            try {
                                const a = await pedirAfirmacion(w);
                                const e = await hacerVerificacion({ webauthn: a });
                                if (!e) { cerrar({}); return; }
                                aviso('No se pudo verificar', e);
                            } catch (e) { aviso('No se pudo verificar', errorBiometria(e)); }
                            botonBio.disabled = false;
                        };
                    }
                });
                if (!hecho || !resultado) return { success: false, msg: 'Inicio de sesión cancelado' };
                data = resultado; continue;
            }
            if (data.debe_cambiar) {
                const temp = data.temp; const min = data.minimo || 4; let resultado = null;
                const hecho = await dialogo({
                    titulo: '🔑 Crea tu contraseña nueva', texto: 'Entraste con una clave temporal. Elige una contraseña que solo tú conozcas (mínimo ' + min + ' caracteres).',
                    campos: [{ id: 'a', label: 'Contraseña nueva', type: 'password', auto: 'new-password', max: 72 }, { id: 'b', label: 'Repite la contraseña', type: 'password', auto: 'new-password', max: 72 }],
                    boton: 'Guardar y entrar',
                    enviar: async (v) => {
                        if (v.a.length < min) return 'Debe tener al menos ' + min + ' caracteres.';
                        if (v.a !== v.b) return 'Las contraseñas no coinciden.';
                        const r = await api('POST', '/api/usuarios/cambiar-clave-temporal', { temp, nueva: v.a }, false);
                        if (r.d && r.d.success) { resultado = r.d; return null; }
                        return msgDe(r.d);
                    }
                });
                if (!hecho || !resultado) return { success: false, msg: 'Inicio de sesión cancelado' };
                data = resultado; continue;
            }
            return data;
        }
        return { success: false, msg: 'No se pudo completar el inicio de sesión' };
    }
    // Intercepta SOLO la respuesta de inicio de sesión: si pide un paso extra, lo resuelve y devuelve la sesión final.
    window.fetch = async function (input, init) {
        const res = await origFetch(input, init);
        try {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            if (!/\/api\/usuarios\/validar-acceso/.test(url)) return res;
            const data = await res.clone().json();
            if (!data || data.success || !(data.requiere_2fa || data.debe_cambiar)) return res;
            const fin = await flujoLogin(data);
            return new Response(JSON.stringify(fin), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (e) { return res; }
    };

    // ------------------------------------------------------------ ¿Olvidaste tu contraseña?
    function olvide() {
        const rec = el('form', { class: 'sg-sec' });
        const err = el('div', { class: 'sg-err', style: 'display:none' }), ok = el('div', { class: 'sg-ok', style: 'display:none' });
        const u = el('input', { placeholder: 'Tu usuario', autocapitalize: 'none', autocomplete: 'username' });
        const k = el('input', { type: 'password', placeholder: 'Clave de recuperación del servidor', autocomplete: 'off' });
        const n = el('input', { type: 'password', placeholder: 'Contraseña nueva (mín. 8)', autocomplete: 'new-password' });
        const b = el('button', { class: 'sg-b', type: 'submit', text: 'Restablecer mi contraseña' });
        rec.append(el('label', { text: 'Usuario' }), u, el('label', { text: 'Clave de recuperación' }), k, el('label', { text: 'Contraseña nueva' }), n, err, ok, el('div', { class: 'sg-fila' }, b));
        rec.onsubmit = async (ev) => {
            ev.preventDefault(); err.style.display = ok.style.display = 'none'; b.disabled = true;
            const r = await api('POST', '/api/usuarios/recuperar-con-clave', { username: u.value, clave_recuperacion: k.value, nueva: n.value }, false);
            b.disabled = false;
            if (r.d && r.d.success) { ok.textContent = '¡Listo! Ya puedes entrar con tu contraseña nueva.'; ok.style.display = 'block'; k.value = n.value = ''; }
            else { err.textContent = msgDe(r.d); err.style.display = 'block'; }
        };
        const fondo = el('div', { class: 'sg-fondo' }, el('div', { class: 'sg-caja' },
            el('h2', { text: '¿Olvidaste tu contraseña?' }),
            el('h3', { text: '👷 Soy cajero o trabajador' }),
            el('p', { text: 'Pídele a un administrador que entre a Administración → Usuarios y toque el botón 🔑 junto a tu nombre. Te dará una clave temporal; al entrar con ella, el sistema te pedirá crear una nueva.' }),
            el('h3', { text: '👑 Soy el dueño o administrador' }),
            el('p', { text: 'Usa la clave de recuperación que se guardó en Cloudflare (secreto CLAVE_RECUPERACION). Si perdiste tu teléfono del 2FA, esta clave también lo quita.' }),
            rec,
            el('div', { class: 'sg-fila' }, el('button', { class: 'sg-b sec', type: 'button', text: 'Cerrar', onclick: () => fondo.remove() }))));
        document.body.appendChild(fondo);
    }

    // ------------------------------------------------------------ Mi seguridad
    let qrListo = null;
    function cargarQr() {
        if (window.qrcode) return Promise.resolve(true);
        if (qrListo) return qrListo;
        qrListo = new Promise((res) => {
            const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
            s.onload = () => res(!!window.qrcode); s.onerror = () => res(false); document.head.appendChild(s);
        });
        return qrListo;
    }
    function copiar(txt, btn) {
        const listo = () => { if (btn) { const t = btn.textContent; btn.textContent = '¡Copiado!'; setTimeout(() => btn.textContent = t, 1400); } };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(listo, () => { }); else listo();
    }
    function mostrarCodigos(lista, titulo) {
        const caja = el('div', { class: 'sg-codigos' }, lista.map(c => el('span', { text: c })));
        const bc = el('button', { class: 'sg-b sec', type: 'button', text: 'Copiar todos', onclick: () => copiar(lista.join('\n'), bc) });
        return dialogo({
            titulo: titulo || '🗝️ Tus códigos de respaldo', texto: 'Guárdalos en un lugar seguro (foto, papel, gestor de contraseñas). Cada uno sirve UNA vez si pierdes tu teléfono. No se volverán a mostrar.',
            antes: el('div', {}, caja, el('div', { class: 'sg-fila' }, bc)), boton: 'Ya los guardé', sinCancelar: true
        });
    }
    async function activar2fa(refrescar) {
        const c = await dialogo({
            titulo: 'Activar verificación con app', texto: 'Por seguridad, confirma tu contraseña actual.',
            campos: [{ id: 'clave', label: 'Tu contraseña', type: 'password', auto: 'current-password' }], boton: 'Continuar',
            enviar: async (v) => { const r = await api('POST', '/api/seguridad/2fa/iniciar', { clave: v.clave }); if (r.d && r.d.success) { activar2fa.datos = r.d; return null; } return msgDe(r.d); }
        });
        if (!c) return;
        const d = activar2fa.datos; const hayQr = await cargarQr();
        const antes = el('div', {});
        if (hayQr) {
            try { const q = window.qrcode(0, 'M'); q.addData(d.uri); q.make(); antes.append(el('div', { class: 'sg-qr' }, el('img', { alt: 'Código QR', src: q.createDataURL(5, 2) }))); } catch (e) { }
        }
        const bcp = el('button', { class: 'sg-b sec', type: 'button', text: 'Copiar clave', onclick: () => copiar(d.secreto, bcp) });
        antes.append(
            el('p', { text: '1) Abre Google Authenticator, Authy o similar → "Agregar cuenta" → escanea el QR.' + (hayQr ? '' : ' (No cargó el QR: usa "Ingresar clave manualmente".)') }),
            el('p', { text: 'Si estás en el mismo teléfono, copia la clave y pégala en la app:' }),
            el('div', { class: 'sg-clave', text: d.secreto }),
            el('div', { class: 'sg-fila' }, bcp, el('a', { class: 'sg-b sec', href: d.uri, style: 'text-decoration:none', text: 'Abrir en mi app' })),
            el('p', { text: '2) Escribe el código de 6 dígitos que muestra la app:' }));
        let codigos = null;
        const ok = await dialogo({
            titulo: 'Conecta tu app', antes, campos: [{ id: 'codigo', label: 'Código de 6 dígitos', ph: '123456', auto: 'one-time-code', modo: 'numeric', max: 7 }], boton: 'Activar',
            enviar: async (v) => { const r = await api('POST', '/api/seguridad/2fa/activar', { codigo: v.codigo }); if (r.d && r.d.success) { codigos = r.d.codigos; return null; } return msgDe(r.d); }
        });
        if (ok && codigos) await mostrarCodigos(codigos);
        refrescar();
    }
    async function desactivar2fa(refrescar) {
        const ok = await dialogo({
            titulo: 'Desactivar verificación con app', texto: 'Confirma tu contraseña y un código de tu app (o uno de respaldo).', clase: 'rojo', boton: 'Desactivar',
            campos: [{ id: 'clave', label: 'Contraseña', type: 'password', auto: 'current-password' }, { id: 'codigo', label: 'Código', ph: '123456', auto: 'one-time-code', max: 14 }],
            enviar: async (v) => { const r = await api('POST', '/api/seguridad/2fa/desactivar', v); return (r.d && r.d.success) ? null : msgDe(r.d); }
        });
        if (ok) refrescar();
    }
    async function regenerarCodigos() {
        let codigos = null;
        const ok = await dialogo({
            titulo: 'Códigos de respaldo nuevos', texto: 'Los anteriores dejarán de servir.', boton: 'Generar',
            campos: [{ id: 'clave', label: 'Contraseña', type: 'password', auto: 'current-password' }, { id: 'codigo', label: 'Código de tu app', ph: '123456', auto: 'one-time-code', max: 14 }],
            enviar: async (v) => { const r = await api('POST', '/api/seguridad/codigos/regenerar', v); if (r.d && r.d.success) { codigos = r.d.codigos; return null; } return msgDe(r.d); }
        });
        if (ok && codigos) await mostrarCodigos(codigos);
    }
    async function agregarBiometria(refrescar) {
        if (!biometriaSoportada()) { aviso('No disponible aquí', 'La huella o el rostro necesitan abrir el sistema con https (el enlace seguro) y un dispositivo con lector de huella, reconocimiento facial o bloqueo de pantalla.'); return; }
        const sugerido = /android|iphone|ipad/i.test(navigator.userAgent) ? 'Mi celular' : 'Mi computador';
        const ok = await dialogo({
            titulo: '👆 Agregar huella o rostro', texto: 'Se registra SOLO en este dispositivo. Confirma tu contraseña y luego usa tu huella, rostro o bloqueo de pantalla cuando el equipo lo pida.',
            campos: [{ id: 'clave', label: 'Tu contraseña', type: 'password', auto: 'current-password' }, { id: 'nombre', label: 'Nombre del dispositivo', ph: sugerido, max: 40 }], boton: 'Registrar',
            enviar: async (v) => {
                const o = await api('POST', '/api/seguridad/biometria/opciones', { clave: v.clave });
                if (!(o.d && o.d.success)) return msgDe(o.d);
                try { const r = await registrarBiometria(o.d, v.nombre.trim() || sugerido); return (r.d && r.d.success) ? null : msgDe(r.d); }
                catch (e) { return errorBiometria(e); }
            }
        });
        if (ok) refrescar();
    }
    async function quitarBiometria(id, refrescar) {
        const ok = await dialogo({
            titulo: 'Quitar dispositivo', texto: 'Confirma tu contraseña.', clase: 'rojo', boton: 'Quitar',
            campos: [{ id: 'clave', label: 'Contraseña', type: 'password', auto: 'current-password' }],
            enviar: async (v) => { const r = await api('POST', '/api/seguridad/biometria/quitar', { id, clave: v.clave }); return (r.d && r.d.success) ? null : msgDe(r.d); }
        });
        if (ok) refrescar();
    }
    async function cambiarClave() {
        let min = 4; const e = await api('GET', '/api/seguridad/estado'); if (e.d && e.d.clave_minima) min = e.d.clave_minima;
        const ok = await dialogo({
            titulo: 'Cambiar contraseña',
            campos: [{ id: 'actual', label: 'Contraseña actual', type: 'password', auto: 'current-password' }, { id: 'nueva', label: 'Contraseña nueva (mín. ' + min + ')', type: 'password', auto: 'new-password', max: 72 }, { id: 'rep', label: 'Repite la nueva', type: 'password', auto: 'new-password', max: 72 }], boton: 'Cambiar',
            enviar: async (v) => {
                if (v.nueva !== v.rep) return 'Las contraseñas nuevas no coinciden.';
                const r = await api('POST', '/api/seguridad/clave/cambiar', { actual: v.actual, nueva: v.nueva }); return (r.d && r.d.success) ? null : msgDe(r.d);
            }
        });
        if (ok) aviso('Listo', 'Tu contraseña se actualizó.');
    }
    function abrirSeguridad() {
        const cuerpo = el('div', {}); const fondo = el('div', { class: 'sg-fondo' }, el('div', { class: 'sg-caja' }, cuerpo));
        const cerrar = () => fondo.remove();
        async function pintar() {
            const r = await api('GET', '/api/seguridad/estado');
            cuerpo.textContent = '';
            if (!(r.d && typeof r.d.totp === 'boolean')) {
                cuerpo.append(el('h2', { text: '🔐 Mi seguridad' }), el('div', { class: 'sg-err', text: r.s === 404 ? 'Esta función está disponible en el sistema real (no en la demo).' : msgDe(r.d) }), el('div', { class: 'sg-fila' }, el('button', { class: 'sg-b sec', text: 'Cerrar', onclick: cerrar })));
                return;
            }
            const e = r.d;
            const secClave = el('div', { class: 'sg-sec' }, el('strong', { text: '🔑 Contraseña' }), el('p', { text: 'Cámbiala cuando quieras.' }), el('div', { class: 'sg-fila' }, el('button', { class: 'sg-b sec', text: 'Cambiar contraseña', onclick: cambiarClave })));
            const secApp = el('div', { class: 'sg-sec' }, el('strong', { text: '📱 Verificación con app' }), el('span', { class: 'sg-pill ' + (e.totp ? 'sg-on' : 'sg-off'), text: e.totp ? 'Activa' : 'Desactivada' }),
                el('p', { text: e.totp ? 'Al entrar se pide el código de tu app (Google Authenticator, Authy…). Códigos de respaldo restantes: ' + e.codigos_restantes + '.' : 'Opcional. Agrega un código de 6 dígitos de tu teléfono además de la contraseña.' }),
                el('div', { class: 'sg-fila' }, e.totp
                    ? [el('button', { class: 'sg-b sec', text: 'Códigos de respaldo nuevos', onclick: () => regenerarCodigos().then(pintar) }), el('button', { class: 'sg-b rojo', text: 'Desactivar', onclick: () => desactivar2fa(pintar) })]
                    : [el('button', { class: 'sg-b', text: 'Activar', onclick: () => activar2fa(pintar) })]));
            const lista = (e.biometria || []).map(c => el('div', { class: 'sg-dev' }, el('span', { text: '👆 ' + c.nombre + (c.creado ? ' · ' + c.creado : '') }), el('button', { class: 'sg-b sec', style: 'padding:6px 10px', text: 'Quitar', onclick: () => quitarBiometria(c.id, pintar) })));
            const secBio = el('div', { class: 'sg-sec' }, el('strong', { text: '👆 Huella o rostro' }), el('span', { class: 'sg-pill ' + (lista.length ? 'sg-on' : 'sg-off'), text: lista.length ? lista.length + ' dispositivo(s)' : 'Desactivada' }),
                el('p', { text: 'Opcional. Después de la contraseña, confirmas con la huella o el rostro de tu celular o computador. Debes registrar cada dispositivo donde la vayas a usar.' }),
                el('div', {}, lista), el('div', { class: 'sg-fila' }, el('button', { class: 'sg-b', text: 'Agregar este dispositivo', onclick: () => agregarBiometria(pintar) })));
            const nota = el('p', { class: 'sg-sec', style: 'font-size:12px' }, '💡 Si activas ambos, puedes entrar con cualquiera de los dos. Si pierdes el teléfono, un administrador puede quitar el 2FA desde Administración → Usuarios.');
            cuerpo.append(el('h2', { text: '🔐 Mi seguridad' }), el('small', { text: 'Todo esto es opcional.' }), secClave, secApp, secBio, nota, el('div', { class: 'sg-fila' }, el('button', { class: 'sg-b sec', text: 'Cerrar', onclick: cerrar })));
        }
        document.body.appendChild(fondo); pintar();
    }

    // ------------------------------------------------------------ botón flotante + enlaces "¿Olvidaste…?"
    const esDemo = () => !!document.querySelector('script[src*="mock-api"]') || /[?&]embed=1/.test(location.search);
    let flot = null;
    function revisarSesion() {
        const hay = !!localStorage.getItem(TOKEN);
        if (hay && !flot && !esDemo() && !document.getElementById('sg-no-flot')) {
            flot = el('button', { class: 'sg-flot', type: 'button', title: 'Mi seguridad', 'aria-label': 'Mi seguridad', text: '🔐', onclick: abrirSeguridad });
            document.body.appendChild(flot);
        } else if (!hay && flot) { flot.remove(); flot = null; }
    }
    const IDS_LOGIN = ['loginPIN', 'loginPINEstadisticas', 'input-pin-admin', 'p'];
    function enlacesOlvide() {
        if (esDemo()) return;
        IDS_LOGIN.forEach(id => {
            const i = document.getElementById(id);
            if (!i || i.type !== 'password' || document.getElementById('sg-olv-' + id)) return;
            const a = el('button', { class: 'sg-link', type: 'button', id: 'sg-olv-' + id, text: '¿Olvidaste tu contraseña?', onclick: olvide });
            (i.parentElement || i).appendChild(a);
        });
    }
    function iniciar() { enlacesOlvide(); revisarSesion(); setInterval(() => { enlacesOlvide(); revisarSesion(); }, 1500); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();

    window.SEG = {
        abrir: abrirSeguridad, olvide,
        // Para Administración: muestra la clave temporal una sola vez
        mostrarClaveTemporal(nombre, clave) {
            const caja = el('div', { class: 'sg-clave', text: clave, style: 'font-size:20px;text-align:center;margin:10px 0' });
            const bc = el('button', { class: 'sg-b sec', type: 'button', text: 'Copiar', onclick: () => copiar(clave, bc) });
            return dialogo({ titulo: '🔑 Clave temporal para ' + nombre, texto: 'Pásasela en persona o por un canal privado. Solo se muestra ahora. Al entrar con ella deberá crear una contraseña nueva.', antes: el('div', {}, caja, el('div', { class: 'sg-fila' }, bc)), boton: 'Listo', sinCancelar: true });
        },
        aviso
    };
})();
