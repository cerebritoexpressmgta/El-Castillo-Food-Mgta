// Reseñas del cliente (menu.html): al hacer un pedido el servidor da un "pase"; cuando el pedido se entrega,
// al volver al menú aparece una ventana para calificarlo. La reseña la aprueba el local antes de publicarse.
(function () {
    'use strict';
    var K_TOK = 'resenas_tokens', K_OMIT = 'resenas_omitidas';
    var base = (typeof API_BASE !== 'undefined') ? API_BASE : '';
    var origFetch = window.fetch.bind(window);
    var abierta = false;

    function leer(k, def) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } }
    function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
    function el(tag, attrs) {
        var e = document.createElement(tag); attrs = attrs || {};
        Object.keys(attrs).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); });
        for (var i = 2; i < arguments.length; i++) if (arguments[i]) e.appendChild(arguments[i]);
        return e;
    }
    function api(ruta, cuerpo) {
        return origFetch(base + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
            .then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d || {} }; }); })
            .catch(function () { return { s: 0, d: { detail: 'Sin conexión. Revisa tu internet.' } }; });
    }

    // 1) Guarda el pase que devuelve el servidor al crear un pedido
    window.fetch = function (input, init) {
        var p = origFetch(input, init);
        try {
            var url = typeof input === 'string' ? input : (input && input.url) || '';
            var metodo = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
            if (metodo === 'POST' && /\/api\/pedidos\/?(\?|$)/.test(url)) {
                p.then(function (res) { return res.clone().json(); }).then(function (d) {
                    if (d && d.resena_token) { var t = leer(K_TOK, []).filter(function (x) { return x !== d.resena_token; }); t.push(d.resena_token); guardar(K_TOK, t.slice(-10)); }
                }).catch(function () { });
            }
        } catch (e) { }
        return p;
    };

    // 2) Ventana de calificación
    var css = '.rs-f{position:fixed;inset:0;z-index:10000;background:rgba(8,10,20,.72);display:flex;align-items:center;justify-content:center;padding:14px;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}' +
        '.rs-c{background:#fff;color:#1f2937;width:100%;max-width:420px;border-radius:20px;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.45);font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center}' +
        '.rs-c h2{margin:0 0 4px;font-size:21px;color:#111827}.rs-c p{margin:6px 0;color:#4b5563}.rs-c small{color:#6b7280;display:block;margin-top:10px;font-size:12px}' +
        '.rs-s{display:flex;justify-content:center;gap:4px;margin:14px 0 6px}.rs-s button{border:0;background:none;font-size:40px;line-height:1;cursor:pointer;color:#d1d5db;padding:0 2px;transition:transform .12s}' +
        '.rs-s button.on{color:#f59e0b}.rs-s button:hover{transform:scale(1.15)}' +
        '.rs-c textarea{width:100%;box-sizing:border-box;min-height:92px;border:1.5px solid #d1d5db;border-radius:12px;padding:10px 12px;font:inherit;font-size:16px;resize:vertical;color:#111827;background:#fff}' +
        '.rs-c textarea:focus{outline:none;border-color:var(--ac,#b4231a);box-shadow:0 0 0 3px rgba(180,35,26,.15)}' +
        '.rs-b{border:0;border-radius:12px;padding:12px 18px;font-weight:800;font-size:15px;cursor:pointer;background:var(--ac,#b4231a);color:#fff;width:100%;margin-top:12px}.rs-b:disabled{opacity:.6;cursor:wait}' +
        '.rs-b.s{background:#e5e7eb;color:#374151;margin-top:8px;font-weight:700}' +
        '.rs-e{color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:8px 10px;margin-top:10px;font-size:13px}';
    var estiloPuesto = false;
    function estilo() { if (estiloPuesto) return; estiloPuesto = true; document.head.appendChild(el('style', { text: css })); }

    function ventana(item) {
        if (abierta) return; abierta = true; estilo();
        var estrellas = 0, fondo = el('div', { class: 'rs-f' }), caja = el('div', { class: 'rs-c', role: 'dialog', 'aria-modal': 'true' });
        fondo.appendChild(caja);
        function cerrar() { fondo.remove(); abierta = false; }
        function omitir() { var o = leer(K_OMIT, {}); o[item.token] = Date.now(); guardar(K_OMIT, o); cerrar(); }
        function gracias(msg) {
            caja.textContent = '';
            caja.appendChild(el('div', { text: '🎉', style: 'font-size:54px' }));
            caja.appendChild(el('h2', { text: '¡Gracias por tu opinión!' }));
            caja.appendChild(el('p', { text: msg || 'La revisaremos y, si todo está bien, se publicará en nuestra página.' }));
            caja.appendChild(el('button', { class: 'rs-b', type: 'button', text: 'Cerrar', onclick: cerrar }));
        }
        var botones = [], hint = el('p', { text: 'Toca las estrellas', style: 'margin:0;font-size:13px;color:#6b7280' });
        var fila = el('div', { class: 'rs-s' });
        [1, 2, 3, 4, 5].forEach(function (n) {
            var b = el('button', { type: 'button', 'aria-label': n + (n === 1 ? ' estrella' : ' estrellas'), text: '★', onclick: function () {
                estrellas = n; botones.forEach(function (x, i) { x.className = i < n ? 'on' : ''; });
                hint.textContent = ['', 'Muy malo', 'Malo', 'Regular', 'Bueno', '¡Excelente!'][n];
            } });
            botones.push(b); fila.appendChild(b);
        });
        var txt = el('textarea', { maxlength: '300', placeholder: '¿Qué tal estuvo la comida y la atención?' });
        var err = el('div', { class: 'rs-e', style: 'display:none' });
        var enviar = el('button', { class: 'rs-b', type: 'button', text: 'Enviar mi reseña' });
        enviar.onclick = function () {
            err.style.display = 'none';
            if (!estrellas) { err.textContent = 'Elige cuántas estrellas das.'; err.style.display = 'block'; return; }
            if (txt.value.trim().length < 5) { err.textContent = 'Cuéntanos un poquito más (mínimo 5 letras).'; err.style.display = 'block'; return; }
            enviar.disabled = true;
            api('/api/resenas/enviar', { token: item.token, estrellas: estrellas, texto: txt.value.trim() }).then(function (r) {
                enviar.disabled = false;
                if (r.d && r.d.success) { guardar(K_TOK, leer(K_TOK, []).filter(function (x) { return x !== item.token; })); gracias(); return; }
                if (r.s === 400 && /Ya enviaste|ya no es válido/.test(r.d.detail || '')) guardar(K_TOK, leer(K_TOK, []).filter(function (x) { return x !== item.token; }));
                err.textContent = r.d.detail || 'No se pudo enviar. Intenta de nuevo.'; err.style.display = 'block';
            });
        };
        caja.appendChild(el('div', { text: '⭐', style: 'font-size:42px' }));
        caja.appendChild(el('h2', { text: '¿Cómo estuvo tu pedido' + (item.id_visual ? ' #' + item.id_visual : '') + '?' }));
        caja.appendChild(el('p', { text: 'Tu opinión nos ayuda a mejorar.' }));
        caja.appendChild(fila); caja.appendChild(hint); caja.appendChild(el('div', { style: 'height:8px' })); caja.appendChild(txt); caja.appendChild(err);
        caja.appendChild(enviar); caja.appendChild(el('button', { class: 'rs-b s', type: 'button', text: 'Ahora no', onclick: omitir }));
        caja.appendChild(el('small', { text: 'La revisamos antes de publicarla. Se mostrará solo con tu primer nombre y la inicial del apellido (ej. María P.).' }));
        document.body.appendChild(fondo);
    }
    function mensaje(titulo, texto) {
        if (abierta) return; abierta = true; estilo();
        var fondo = el('div', { class: 'rs-f' }), caja = el('div', { class: 'rs-c' });
        function cerrar() { fondo.remove(); abierta = false; }
        caja.appendChild(el('div', { text: '🍽️', style: 'font-size:46px' })); caja.appendChild(el('h2', { text: titulo })); caja.appendChild(el('p', { text: texto }));
        caja.appendChild(el('button', { class: 'rs-b', type: 'button', text: 'Entendido', onclick: cerrar }));
        fondo.appendChild(caja); document.body.appendChild(fondo);
    }

    // 3) Revisa si algún pedido ya fue entregado y se puede calificar
    function revisar(forzar) {
        var tokens = leer(K_TOK, []);
        if (!tokens.length) { if (forzar) mensaje('Aún no hay nada que calificar', 'Cuando recibas tu pedido, vuelve a este menú y podrás contarnos qué tal estuvo.'); return; }
        api('/api/resenas/pendientes', { tokens: tokens }).then(function (r) {
            if (!r.d || !r.d.success) { if (forzar) mensaje('No pudimos revisar', 'Intenta de nuevo en un momento.'); return; }
            var lista = r.d.resenas || [];
            var vigentes = lista.filter(function (x) { return x.estado === 'listo' || x.estado === 'esperando'; }).map(function (x) { return x.token; });
            if (vigentes.length !== tokens.length) guardar(K_TOK, vigentes);
            var omit = leer(K_OMIT, {});
            var listo = lista.filter(function (x) { return x.estado === 'listo' && (forzar || !omit[x.token]); }).pop();
            if (listo) ventana(listo);
            else if (forzar) mensaje('Todavía no está entregado', lista.some(function (x) { return x.estado === 'esperando'; }) ? 'Cuando el local marque tu pedido como entregado, vuelve aquí y podrás calificarlo.' : 'No tienes pedidos pendientes por calificar. ¡Gracias!');
        });
    }
    window.RESENAS = { revisar: revisar };
    function iniciar() { setTimeout(function () { revisar(false); }, 2500); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
