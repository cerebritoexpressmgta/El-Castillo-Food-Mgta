// =====================================================================
// Botón flotante "💳 Pagos" para el personal (cajeros, cocina, mesas).
// Despliega los métodos de pago que el dueño configuró y permite compartirlos todos o uno por uno,
// sin entrar al panel de Administración. Solo se muestra con sesión iniciada.
// =====================================================================
(function () {
    'use strict';
    if (typeof API_BASE === 'undefined' || typeof authHeaders !== 'function' || !window.PagosCompartir) return;

    var lista = [];
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

    function montar() {
        var st = document.createElement('style');
        st.textContent =
            '#pp-btn{position:fixed;bottom:14px;left:14px;z-index:2147482000;padding:10px 16px;border:1px solid #475569;border-radius:999px;background:#1e293b;color:#fff;font:700 14px system-ui,-apple-system,Segoe UI,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.4)}' +
            '#pp-panel{display:none;position:fixed;bottom:62px;left:14px;z-index:2147483100;width:min(360px,calc(100vw - 28px));max-height:70vh;overflow:auto;background:#1e293b;color:#e2e8f0;border:1px solid #475569;border-radius:14px;padding:12px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.55)}' +
            '#pp-panel.abierto{display:block}' +
            '#pp-panel h4{margin:0 0 8px;font-size:15px;display:flex;justify-content:space-between;align-items:center}' +
            '#pp-panel h4 button{background:none;border:0;color:#fff;font-size:18px;cursor:pointer}' +
            '.pp-todos{width:100%;padding:11px;border:0;border-radius:10px;background:#16a34a;color:#fff;font-weight:700;font-size:14px;cursor:pointer;margin-bottom:10px}' +
            '.pp-item{border:1px solid #334155;border-radius:10px;padding:9px 10px;margin-bottom:8px;background:#0f172a}' +
            '.pp-item b{display:block;font-size:14px}.pp-item pre{margin:4px 0 8px;white-space:pre-wrap;word-break:break-word;font:12px system-ui,sans-serif;color:#cbd5e1}' +
            '.pp-fila{display:flex;gap:6px;flex-wrap:wrap}' +
            '.pp-fila button{flex:1;min-width:80px;padding:8px 6px;border:0;border-radius:8px;background:#334155;color:#fff;font-weight:700;font-size:12px;cursor:pointer}' +
            '.pp-fila button.v{background:#16a34a}' +
            '.pp-vacio{font-size:13px;color:#94a3b8;text-align:center;padding:8px}';
        document.head.appendChild(st);

        var p = document.createElement('div'); p.id = 'pp-panel';
        document.body.appendChild(p);

        var b = document.createElement('button');
        b.id = 'pp-btn'; b.type = 'button'; b.textContent = '💳 Pagos';
        document.body.appendChild(b);
        // Solo visible con sesión iniciada (en cocina.html el login y el tablero comparten página)
        function vigilar() {
            var hay = !!localStorage.getItem('tokioAuthToken');
            b.style.display = hay ? '' : 'none';
            if (!hay) document.getElementById('pp-panel').classList.remove('abierto');
        }
        vigilar(); setInterval(vigilar, 1500);

        b.addEventListener('click', function () {
            if (p.classList.contains('abierto')) { p.classList.remove('abierto'); return; }
            p.classList.add('abierto'); cargar();
        });
        document.addEventListener('click', function (e) {
            if (!p.classList.contains('abierto')) return;
            if (p.contains(e.target) || b.contains(e.target)) return;
            p.classList.remove('abierto');
        });
        p.addEventListener('click', function (e) {
            var t = e.target.closest('button'); if (!t) return;
            var acc = t.getAttribute('data-a'), i = Number(t.getAttribute('data-i'));
            if (t.id === 'pp-x') { p.classList.remove('abierto'); return; }
            if (acc === 'todos') PagosCompartir.compartir(lista);
            else if (acc === 'uno') PagosCompartir.compartir([lista[i]]);
            else if (acc === 'copiar') PagosCompartir.copiar([lista[i]]);
            else if (acc === 'qr') PagosCompartir.verQr(lista[i].qr);
        });
    }

    function pintar(cuerpo) {
        var p = document.getElementById('pp-panel');
        p.innerHTML = '<h4>💳 Métodos de pago <button type="button" id="pp-x" aria-label="Cerrar">✕</button></h4>' + cuerpo;
    }

    async function cargar() {
        pintar('<div class="pp-vacio">Cargando…</div>');
        try {
            var res = await fetch(API_BASE + '/api/metodos-pago/detalle', { headers: authHeaders() });
            if (res.status === 401) { pintar('<div class="pp-vacio">Tu sesión venció. Vuelve a iniciar sesión.</div>'); return; }
            var data = await res.json();
            lista = Array.isArray(data) ? data : [];
        } catch (e) { pintar('<div class="pp-vacio">No se pudo cargar. Revisa tu conexión.</div>'); return; }
        if (!lista.length) { pintar('<div class="pp-vacio">No hay métodos de pago configurados.</div>'); return; }
        var h = '<button type="button" class="pp-todos" data-a="todos">📤 Compartir todos</button>';
        lista.forEach(function (m, i) {
            h += '<div class="pp-item"><b>' + esc(m.nombre) + '</b>' +
                (m.datos ? '<pre>' + esc(m.datos) + '</pre>' : '<pre style="color:#64748b">Sin datos registrados</pre>') +
                '<div class="pp-fila"><button type="button" class="v" data-a="uno" data-i="' + i + '">📤 Compartir</button>' +
                '<button type="button" data-a="copiar" data-i="' + i + '">📋 Copiar</button>' +
                (m.qr ? '<button type="button" data-a="qr" data-i="' + i + '">🔍 Ver QR</button>' : '') + '</div></div>';
        });
        pintar(h);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();
