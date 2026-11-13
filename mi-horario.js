// Botón "Mi horario": cada trabajador ve SOLO su propia semana, con fechas reales
// (días, entrada/salida, descanso y vacaciones). Aparece en las pantallas del personal
// (cocina, mesas, caja) cuando hay una sesión iniciada.
(function () {
    try {
        if (window.self !== window.top) return;
        var base = (typeof API_BASE !== 'undefined') ? API_BASE : '';
        var DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
        var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        var MC = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        var datos = null, lunes = '';

        function hora12(h) {
            var m = /^(\d{2}):(\d{2})$/.exec(h || ''); if (!m) return '';
            var n = parseInt(m[1], 10), suf = n >= 12 ? 'p. m.' : 'a. m.'; n = n % 12 || 12;
            return n + ':' + m[2] + ' ' + suf;
        }
        function hoyIso() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' }); }
        function sumar(iso, n) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
        function lunesDe(iso) { var d = new Date(iso + 'T00:00:00Z'); return sumar(iso, -((d.getUTCDay() + 6) % 7)); }
        function p(iso) { var a = iso.split('-').map(Number); return { y: a[0], m: a[1], d: a[2] }; }
        function corta(iso) { var a = p(iso); return a.d + ' ' + MC[a.m - 1]; }
        function larga(iso) { var a = p(iso); return a.d + ' de ' + MESES[a.m - 1] + ' de ' + a.y; }
        function titulo(l) {
            var a = p(l), b = p(sumar(l, 6));
            if (a.y !== b.y) return 'Semana del ' + a.d + ' de ' + MESES[a.m - 1] + ' de ' + a.y + ' al ' + b.d + ' de ' + MESES[b.m - 1] + ' de ' + b.y;
            if (a.m !== b.m) return 'Semana del ' + a.d + ' de ' + MESES[a.m - 1] + ' al ' + b.d + ' de ' + MESES[b.m - 1] + ' de ' + b.y;
            return 'Semana del ' + a.d + ' al ' + b.d + ' de ' + MESES[b.m - 1] + ' de ' + b.y;
        }
        function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

        function estado(iso, h) {
            if (datos.fecha_ingreso && iso < datos.fecha_ingreso) return { k: 'fuera', t: 'Aún no ingresa' };
            if (datos.fecha_egreso && iso > datos.fecha_egreso) return { k: 'fuera', t: 'Ya egresó' };
            if (datos.vacaciones && datos.vacaciones_desde && datos.vacaciones_hasta && iso >= datos.vacaciones_desde && iso <= datos.vacaciones_hasta) return { k: 'vac', t: '🏖️ Vacaciones' };
            if (h.activo) return { k: 'trabaja', t: hora12(h.hora_entrada) + ' – ' + hora12(h.hora_salida), d: (h.descanso_desde && h.descanso_hasta) ? 'Descanso: ' + hora12(h.descanso_desde) + ' – ' + hora12(h.descanso_hasta) : '' };
            return { k: 'libre', t: 'Libre' };
        }

        function pintar() {
            var cuerpo = document.getElementById('mi-horario-cuerpo');
            var hay = (datos.horario || []).some(function (h) { return h.activo; });
            if (!hay && !datos.vacaciones) { cuerpo.innerHTML = '<p style="margin:8px 0;">Todavía no tienes un horario asignado. Pídeselo al administrador.</p>'; return; }
            var hoy = hoyIso();
            var aviso = (datos.vacaciones && datos.vacaciones_desde && datos.vacaciones_hasta)
                ? '<div style="background:rgba(245,158,11,.18);border:1px solid #f59e0b;border-radius:10px;padding:9px 12px;margin-bottom:10px;font-size:13px;">🏖️ <b>Vacaciones</b><br>Del ' + larga(datos.vacaciones_desde) + ' al ' + larga(datos.vacaciones_hasta) + '</div>' : '';
            var nav = '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:10px;">' +
                '<button type="button" data-sem="-1" style="' + BTN + '">◀</button>' +
                '<div style="text-align:center;font-size:13px;font-weight:700;flex:1;">' + titulo(lunes) + '</div>' +
                '<button type="button" data-sem="1" style="' + BTN + '">▶</button></div>' +
                '<div style="text-align:center;margin-bottom:10px;"><button type="button" data-sem="0" style="' + BTN + '">Ir a esta semana</button></div>';
            var filas = (datos.horario || []).map(function (h) {
                var iso = sumar(lunes, h.dia_semana), e = estado(iso, h), esHoy = iso === hoy;
                var color = e.k === 'vac' ? '#f59e0b' : (esHoy ? '#f59e0b' : '#4a5b94');
                var fondo = e.k === 'vac' ? 'rgba(245,158,11,.18)' : (esHoy ? 'rgba(245,158,11,.12)' : '#2e3a68');
                var detalle = e.k === 'libre' || e.k === 'fuera' ? '<span style="color:#94a3b8;">' + e.t + '</span>'
                    : '<b>' + e.t + '</b>' + (e.d ? '<div style="font-size:12px;color:#cbd5e1;">' + e.d + '</div>' : '');
                return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 12px;margin-bottom:6px;border-radius:10px;border:1px solid ' + color + ';background:' + fondo + ';' + (e.k === 'fuera' ? 'opacity:.6;' : '') + '">' +
                    '<span><b>' + DIAS[h.dia_semana] + '</b><div style="font-size:12px;color:#cbd5e1;">' + corta(iso) + (esHoy ? ' · <span style="color:#fbbf24;">hoy</span>' : '') + '</div></span><span style="text-align:right;">' + detalle + '</span></div>';
            }).join('');
            cuerpo.innerHTML = aviso + nav + filas;
            Array.prototype.forEach.call(cuerpo.querySelectorAll('[data-sem]'), function (b) {
                b.addEventListener('click', function () {
                    var n = parseInt(b.getAttribute('data-sem'), 10);
                    lunes = n === 0 ? lunesDe(hoyIso()) : sumar(lunes, 7 * n);
                    pintar();
                });
            });
        }
        var BTN = 'background:#2e3a68;color:#fff;border:1px solid #4a5b94;border-radius:8px;padding:6px 12px;font:700 13px system-ui,sans-serif;cursor:pointer;';

        function montar() {
            var btn = document.createElement('button');
            btn.type = 'button'; btn.id = 'mi-horario-btn'; btn.textContent = '🕒 Mi horario';
            btn.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:2147482000;padding:10px 16px;border:1px solid #475569;border-radius:999px;background:#1e293b;color:#fff;font:700 14px system-ui,-apple-system,Segoe UI,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.4);';
            var fondo = document.createElement('div');
            fondo.id = 'mi-horario-modal';
            fondo.style.cssText = 'display:none;position:fixed;inset:0;z-index:2147483100;background:rgba(0,0,0,.65);align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;';
            fondo.innerHTML = '<div style="background:#1f2a52;color:#fff;border:1px solid #4a5b94;border-radius:16px;width:100%;max-width:420px;max-height:90vh;overflow:auto;padding:18px;box-shadow:0 20px 50px rgba(0,0,0,.5);">' +
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
                        datos = d; lunes = lunesDe(hoyIso());
                        document.getElementById('mi-horario-nombre').textContent = d.nombre || '';
                        pintar();
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
