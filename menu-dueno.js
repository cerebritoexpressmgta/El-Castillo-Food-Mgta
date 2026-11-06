// Menú desplegable de navegación SOLO PARA EL DUEÑO.
// Aparece solo cuando el administrador inició sesión (usuario y contraseña). Los clientes nunca lo ven.
(function () {
    try {
        if (window.self !== window.top) return; // no mostrar dentro de la demo incrustada

        // Solo aparece si hay una sesión de administrador iniciada en este navegador
        var activo = false;
        try {
            var u = JSON.parse(localStorage.getItem('usuarioActivo') || 'null');
            var rol = u && String(u.rol).toLowerCase();
            activo = !!localStorage.getItem('tokioAuthToken') && (rol === 'admin' || rol === 'superadmin');
        } catch (e) {}
        if (!activo) return;

        var paginas = [
            ['🏰', 'Panel del dueño', 'panel.html'],
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

        if (document.body) montar(); else document.addEventListener('DOMContentLoaded', montar);
    } catch (e) { /* nunca debe romper la página */ }
})();
