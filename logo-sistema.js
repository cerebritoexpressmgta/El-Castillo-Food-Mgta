// =====================================================================
// Logo del sistema: la imagen que aparece arriba en Administración, Cocina y Mesas.
// El dueño la cambia en el Panel (Apariencia → "Logo del sistema"); si no sube ninguno, se usa el logo del negocio y, sin éste, el ícono por defecto.
// Cualquier <img class="logo-sistema"> de esas pantallas se actualiza sola.
// =====================================================================
(function () {
    'use strict';
    var DEFECTO = (window.__MARCA && window.__MARCA.iconoUrl) || 'icons/logo-escudo.jpg?v=1', LLAVE = 'logoSistemaUrl';

    var st = document.createElement('style');
    st.textContent = 'img.logo-sistema{height:52px;width:52px;object-fit:cover;border-radius:14px;border:2px solid rgba(255,255,255,.55);box-shadow:0 3px 10px rgba(0,0,0,.35);flex-shrink:0;vertical-align:middle;background:#0b1220}' +
                     'img.logo-sistema.grande{height:84px;width:84px;border-radius:20px}';
    document.head.appendChild(st);

    function seguro(u) { return typeof u === 'string' && /^(https:\/\/|\/|icons\/)/.test(u) ? u : ''; }
    function aplicar(u) {
        var src = seguro(u) || DEFECTO;
        document.querySelectorAll('img.logo-sistema').forEach(function (i) { if (i.getAttribute('src') !== src) i.setAttribute('src', src); });
    }

    var guardado = ''; try { guardado = localStorage.getItem(LLAVE) || ''; } catch (e) {}
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { aplicar(guardado); });
    else aplicar(guardado);

    var base = (typeof API_BASE !== 'undefined') ? API_BASE : '';
    fetch(base + '/api/sitio').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        var u = d && d.sitio ? (d.sitio.logoSistema || d.sitio.logo || '') : ''; // el logo del negocio sirve para todo si no hay uno aparte
        try { if (u) localStorage.setItem(LLAVE, u); else localStorage.removeItem(LLAVE); } catch (e) {}
        aplicar(u);
    }).catch(function () { /* sin conexión: queda el último logo conocido */ });
})();
