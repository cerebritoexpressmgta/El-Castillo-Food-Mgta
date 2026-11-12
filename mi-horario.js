// Botón "Mi horario": cada trabajador ve SOLO su propia semana (días, entrada/salida y descanso).
// Aparece en las pantallas del personal (cocina, mesas, caja) cuando hay una sesión iniciada.
(function () {
    try {
        if (window.self !== window.top) return;
        var base = (typeof API_BASE !== 'undefined') ? API_BASE : '';
        var DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

        function hora12(h) {
            var m = /^(\d{2}):(\d{2})$/.exec(h || ''); if (!m) return '';
            var n = parseInt(m[1], 10), suf = n >= 12 ? 'p. m.' : 'a. m.'; n = n % 12 || 12;
            return n + ':' + m[2] + ' ' + suf;
        }
        function hoyCaracas() { // 0 = lunes
            var f = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' }).split('-').map(Number);
            return (new Date(f[0], f[1] - 1, f[2]).getDay() + 6) % 7;
        }
        function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

        function montar() {
            var btn = document.createElement('button');
            btn.type = 'button'; btn.id = 'mi-horario-btn'; btn.textContent = '🕒 Mi horario';
            btn.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:2147482000;padding:10px 16px;border:1px solid #475569;border-radius:999px;background:#1e293b;color:#fff;font:700 14px system-ui,-apple-system,Segoe UI,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.4);';
            var fondo = document.createElement('div');
            fondo.id = 'mi-horario-modal';
            fondo.style.cssText = 'display:none;position:fixed;inset:0;z-index:2147483100;background:rgba(0,0,0,.65);align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;';
            fondo.innerHTML = '<div style="background:#1f2a52;color:#fff;border:1px solid #4a5b94;border-radius:16px;width:100%;max-width:400px;max-height:90vh;overflow:auto;padding:18px;box-shadow:0 20px 50px rgba(0,0,0,.5);">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;"><b style="font-size:17px;">🕒 Mi horario de trabajo</b><button type="button" id="mi-horario-x" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;">✕</button></div>' +
                '<div id="mi-horario-nombre" style="font-size:13px;color:#cbd5e1;margin-bottom:12px;"></div><div id="mi-horario-cuerpo" style="color:#e2e8f0;font-size:14px;">Cargando…</div></div>';
            document.body.appendChild(btn); document.body.appendChild(fondo);

            function cerrar() { fondo.style.display = 'none'; }
            document.getElementById('mi-horario-x').addEventListener('click', cerrar);
            fondo.addEventListener('click', function (e) { if (e.target === fondo) cerrar(); });
            btn.addEventListener('click', function () {
                fondo.style.display = 'flex';
                var cuerpo = document.getElementById('mi-horario-cuerpo');
                cuerpo.textContent = 'Cargando…';
                fetch(base + '/api/mi-horario', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('tokioAuthToken') } })
                    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
                    .then(function (d) {
                        document.getElementById('mi-horario-nombre').textContent = d.nombre || '';
                        var hoy = hoyCaracas();
                        var hay = (d.horario || []).some(function (h) { return h.activo; });
                        if (!hay) { cuerpo.innerHTML = '<p style="margin:8px 0;">Todavía no tienes un horario asignado. Pídeselo al administrador.</p>'; return; }
                        cuerpo.innerHTML = (d.horario || []).map(function (h) {
                            var esHoy = h.dia_semana === hoy;
                            var detalle = h.activo
                                ? '<b>' + hora12(h.hora_entrada) + ' – ' + hora12(h.hora_salida) + '</b>' + (h.descanso_desde && h.descanso_hasta ? '<div style="font-size:12px;color:#cbd5e1;">Descanso: ' + hora12(h.descanso_desde) + ' – ' + hora12(h.descanso_hasta) + '</div>' : '')
                                : '<span style="color:#94a3b8;">Libre</span>';
                            return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 12px;margin-bottom:6px;border-radius:10px;border:1px solid ' + (esHoy ? '#f59e0b' : '#4a5b94') + ';background:' + (esHoy ? 'rgba(245,158,11,.18)' : '#2e3a68') + ';">' +
                                '<span style="font-weight:700;">' + DIAS[h.dia_semana] + (esHoy ? ' <small style="color:#fbbf24;">· hoy</small>' : '') + '</span><span style="text-align:right;">' + detalle + '</span></div>';
                        }).join('');
                    })
                    .catch(function () { cuerpo.innerHTML = '<p style="margin:8px 0;">No se pudo cargar tu horario. Revisa tu conexión e inténtalo de nuevo.</p>'; });
            });
        }
        // En cocina el inicio de sesión ocurre en la misma página: se espera a que haya sesión para mostrar el botón
        var montado = false;
        function intentar() {
            if (montado || !localStorage.getItem('tokioAuthToken')) return;
            montado = true;
            if (document.body) montar(); else document.addEventListener('DOMContentLoaded', montar);
        }
        intentar();
        if (!montado) { var iv = setInterval(function () { intentar(); if (montado) clearInterval(iv); }, 1500); }
    } catch (e) { /* nunca debe romper la página */ }
})();
