// Puente entre las pantallas y el API real (Worker + Supabase).
// Reemplaza al antiguo mock-api.js: ya no simula nada, solo
//  1) pone el nombre/emoji del negocio en cada pantalla,
//  2) avisa al tablero cuando hay cambios (consulta cada pocos segundos),
//  3) sube las imágenes del menú a Supabase Storage.
(function () {
    'use strict';
    const CFG = window.DEMO_CONFIG || {};
    const FETCH_REAL = window.fetch.bind(window);

    // ---- Marca ----
    function marca() {
        return {
            nombre: String(CFG.nombreNegocio || 'Mi Restaurante').slice(0, 40),
            emoji: String(CFG.emoji || '🍔').slice(0, 8),
            eslogan: String(CFG.eslogan || '')
        };
    }
    window.MARCA = marca();
    function aplicarMarca() {
        const m = window.MARCA;
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

    // ---- Tablero en vivo (sustituye a Pusher): consulta /api/version ----
    const oyentes = [];
    let ultima = null, temporizador = null;
    async function revisar() {
        if (document.hidden || !oyentes.length) return;
        try {
            const r = await FETCH_REAL('/api/version', { cache: 'no-store' });
            if (!r.ok) return;
            const v = await r.json();
            if (ultima !== null && v.version !== ultima) {
                const data = { mensaje: (v.evento && v.evento.mensaje) || 'actualizacion', sucursal_id: (v.evento && v.evento.sucursal_id) || null };
                let miSucursal = null;
                try { miSucursal = (JSON.parse(localStorage.getItem('usuarioActivo') || 'null') || {}).sucursal_id || null; } catch (e) {}
                // quien trabaja en una sucursal no recibe avisos (ni sonido) de pedidos de otra
                if (miSucursal && data.sucursal_id && Number(miSucursal) !== Number(data.sucursal_id)) { ultima = v.version; return; }
                oyentes.forEach(fn => { try { fn(data); } catch (e) { console.error(e); } });
            }
            ultima = v.version;
        } catch (e) { /* sin red: reintenta en el siguiente ciclo */ }
    }
    function iniciarConsulta() {
        if (temporizador) return;
        revisar();
        temporizador = setInterval(revisar, 5000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });
    }
    window.Pusher = function () {
        return { subscribe() { return { bind(evento, fn) { if (evento === 'actualizar-tablero') { oyentes.push(fn); iniciarConsulta(); } } }; } };
    };
    window.Pusher.logToConsole = false;

    // ---- Imágenes: el código original llamaba a imgbb; ahora van a Supabase Storage ----
    function reducir(archivo) {
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onerror = () => reject(fr.error);
            fr.onload = () => {
                const img = new Image();
                img.onerror = () => resolve(fr.result);
                img.onload = () => {
                    const max = 900, esc = Math.min(1, max / Math.max(img.width, img.height));
                    const c = document.createElement('canvas');
                    c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
                    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                    resolve(c.toDataURL('image/jpeg', 0.8));
                };
                img.src = fr.result;
            };
            fr.readAsDataURL(archivo);
        });
    }
    window.fetch = async function (input, init) {
        const u = typeof input === 'string' ? input : (input && input.url) || '';
        if (u.indexOf('api.imgbb.com') !== -1) {
            const archivo = init && init.body && init.body.get ? init.body.get('image') : null;
            if (!archivo) return new Response(JSON.stringify({ success: false }), { status: 400 });
            const imagen = await reducir(archivo);
            const token = localStorage.getItem('tokioAuthToken') || '';
            return FETCH_REAL('/api/subir-imagen', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ imagen })
            });
        }
        return FETCH_REAL(input, init);
    };
})();
