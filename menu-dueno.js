// Menú desplegable de navegación SOLO PARA EL DUEÑO.
// Aparece solo cuando el administrador inició sesión (usuario y contraseña). Los clientes nunca lo ven.
(function () {
  // iniciar() se puede volver a llamar (el panel lo hace justo después de iniciar sesión)
  function iniciar() {
    try {
        if (document.getElementById('menu-dueno')) return; // ya está puesto
        if (window.self !== window.top) return; // no mostrar dentro de la demo incrustada

        // Solo aparece si hay una sesión de administrador iniciada en este navegador
        var activo = false;
        try {
            var u = JSON.parse(localStorage.getItem('usuarioActivo') || 'null');
            var rol = u && String(u.rol).toLowerCase();
            activo = !!localStorage.getItem('tokioAuthToken') && (rol === 'admin' || rol === 'superadmin');
        } catch (e) {}
        if (!activo) return;

        var logoSrc = (window.__MARCA && window.__MARCA.iconoUrl) || 'icons/logo-escudo.jpg?v=1';
        try { var lg = localStorage.getItem('logoSistemaUrl') || ''; if (/^(https:\/\/|\/|icons\/)/.test(lg)) logoSrc = lg; } catch (e) {}

        var paginas = [
            ['<img class="logo-sistema" src="' + logoSrc + '" alt="" style="height:22px;width:22px;border-radius:6px;border:0;box-shadow:none">', 'Panel del dueño', 'panel.html'],
            ['🍳', 'Cocina', 'cocina.html'],
            ['🍽️', 'Mesas', 'mesas.html'],
            ['📝', 'Tomar pedido (caja)', 'menu_trabajadores.html'],
            ['🌐', 'Web del negocio', 'index.html'],
            ['📱', 'Menú para pedir', 'menu.html'],
            ['⚙️', 'Administración', 'admin.html'],
            ['📊', 'Estadísticas', 'estadisticas.html'],
        ];
        var actual = location.pathname.split('/').pop() || 'index.html';

        function montar() {
            var caja = document.createElement('div');
            caja.id = 'menu-dueno';
            caja.style.cssText = 'position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:2147483000;font-family:system-ui,-apple-system,Segoe UI,sans-serif;';

            var lista = paginas.map(function (p) {
                var esActual = actual === p[2];
                return '<a href="' + p[2] + '" style="display:flex;gap:10px;align-items:center;padding:10px 14px;color:' +
                    (esActual ? '#fff' : '#cbd5e1') + ';background:' + (esActual ? '#4f46e5' : 'transparent') +
                    ';text-decoration:none;font-size:14px;font-weight:' + (esActual ? '700' : '500') + ';">' +
                    '<span>' + p[0] + '</span><span>' + p[1] + '</span></a>';
            }).join('');

            caja.innerHTML =
                '<div id="menu-dueno-panel" style="display:none;position:absolute;bottom:52px;left:50%;transform:translateX(-50%);min-width:230px;' +
                'background:#0f172a;border:1px solid #334155;border-radius:14px;overflow:hidden;box-shadow:0 12px 32px rgba(0,0,0,.5);">' +
                '<div style="padding:8px 14px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;border-bottom:1px solid #1e293b;">Modo dueño</div>' +
                lista +
                                '</div>' +
                '<button id="menu-dueno-btn" type="button" style="display:flex;align-items:center;gap:8px;padding:10px 18px;border:1px solid #475569;' +
                'border-radius:999px;background:#1e293b;color:#fff;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.4);">☰ Menú</button>';

            document.body.appendChild(caja);
            var panel = document.getElementById('menu-dueno-panel');
            document.getElementById('menu-dueno-btn').addEventListener('click', function (e) {
                e.stopPropagation();
                panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            });
            document.addEventListener('click', function () { panel.style.display = 'none'; });
        }

        // Aviso de suscripción (solo lo ve el dueño/administrador): por vencer o vencida con días de gracia
        function fmt(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; }
        function avisoCuenta() {
            try {
                if (document.getElementById('aviso-cuenta')) return;
                var tk = localStorage.getItem('tokioAuthToken'); if (!tk) return;
                fetch('/api/cuenta/estado', { headers: { Authorization: 'Bearer ' + tk } }).then(function (r) { return r.ok ? r.json() : null; }).then(function (c) {
                    if (!c || (c.estado !== 'por_vencer' && c.estado !== 'vencido')) return;
                    if (c.estado === 'por_vencer' && sessionStorage.getItem('avisoCuentaCerrado') === c.vence_el) return;
                    var d = c.dias, plural = function (n) { return n + (n === 1 ? ' día' : ' días'); };
                    var texto = c.estado === 'por_vencer'
                        ? (d === 0 ? 'Tu suscripción vence HOY (' + fmt(c.vence_el) + ').' : 'Tu suscripción vence el ' + fmt(c.vence_el) + ' (en ' + plural(d) + ').') + ' Renueva para evitar que el servicio se interrumpa.'
                        : 'Tu suscripción venció el ' + fmt(c.vence_el) + '. Podrás usar el servicio hasta el ' + fmt(c.bloqueo_el) + (d > 0 ? ' (' + plural(d) + ' más)' : ' (hoy es el último día)') + '; después se suspenderá TODO, incluida la web para tus clientes.';
                    var el = document.createElement('div'); el.id = 'aviso-cuenta';
                    el.style.cssText = 'position:sticky;top:0;z-index:2147482999;padding:10px 40px 10px 14px;text-align:center;font:600 14px/1.4 system-ui,sans-serif;color:#fff;background:' + (c.estado === 'vencido' ? '#b91c1c' : '#b45309') + ';box-shadow:0 2px 8px rgba(0,0,0,.4)';
                    el.textContent = texto + (c.contacto ? ' Contacto: ' + c.contacto : '');
                    if (c.estado === 'por_vencer') {
                        var x = document.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', 'Cerrar aviso');
                        x.style.cssText = 'position:absolute;right:8px;top:6px;background:transparent;border:0;color:#fff;font-size:18px;cursor:pointer';
                        x.onclick = function () { try { sessionStorage.setItem('avisoCuentaCerrado', c.vence_el); } catch (e) {} el.remove(); };
                        el.appendChild(x);
                    }
                    (document.body || document.documentElement).insertBefore(el, (document.body || document.documentElement).firstChild);
                }).catch(function () {});
            } catch (e) {}
        }
        if (document.body) avisoCuenta(); else document.addEventListener('DOMContentLoaded', avisoCuenta);

        if (document.body) montar(); else document.addEventListener('DOMContentLoaded', montar);
    } catch (e) { /* nunca debe romper la página */ }
  }
  window.menuDuenoActualizar = iniciar;
  iniciar();
})();
