// Aplica los colores, el logo y la imagen de portada que el dueño elige en el panel.
// Se carga en index.html (web pública) y menu.html (donde piden los clientes).
(function () {
    'use strict';
    var KEY = 'tema_castillo_v1';
    var CAMPOS = ['colorPrincipal', 'colorSecundario', 'colorPortada', 'imagenPortada', 'logo', 'tituloSobrePortada'];
    var HEX = /^#[0-9a-fA-F]{6}$/;
    // Logo por defecto (ya optimizado y guardado en el proyecto). Si el dueño sube otro desde el panel, ese tiene prioridad.
    var LOGO_DEFECTO = '/icons/logo-castillo.jpg?v=1';

    function rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
    function hex(a) { return '#' + a.map(function (v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); }).join(''); }
    // p = 0 devuelve "a"; p = 1 devuelve "b"
    function mezclar(a, b, p) { var x = rgb(a), y = rgb(b); return hex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * p; })); }
    function paleta(base) {
        return {
            50: mezclar(base, '#ffffff', 0.92), 100: mezclar(base, '#ffffff', 0.84), 200: mezclar(base, '#ffffff', 0.68),
            300: mezclar(base, '#ffffff', 0.5), 400: mezclar(base, '#ffffff', 0.28), 500: mezclar(base, '#ffffff', 0.1),
            600: base, 700: mezclar(base, '#000000', 0.14), 800: mezclar(base, '#000000', 0.28),
            900: mezclar(base, '#000000', 0.42), 950: mezclar(base, '#000000', 0.58)
        };
    }
    function urlOk(u) { return /^https:\/\//i.test(u || ''); }

    function aplicar(s) {
        if (!s) return;
        var st = document.documentElement.style;
        if (HEX.test(s.colorPrincipal || '')) {
            var p = paleta(s.colorPrincipal);
            // menu.html usa los tonos "red" de Tailwind: se reemplazan por la paleta elegida
            Object.keys(p).forEach(function (k) { st.setProperty('--color-red-' + k, p[k]); });
            st.setProperty('--ac', s.colorPrincipal);
        }
        if (HEX.test(s.colorSecundario || '')) st.setProperty('--ac2', s.colorSecundario);
        if (HEX.test(s.colorPortada || '')) {
            st.setProperty('--hero-a', mezclar(s.colorPortada, '#000000', 0.6));
            st.setProperty('--hero-b', mezclar(s.colorPortada, '#000000', 0.3));
            st.setProperty('--hero-c', s.colorPortada);
            st.setProperty('--dk', mezclar(s.colorPortada, '#000000', 0.7));
        }
        if (urlOk(s.imagenPortada)) {
            st.setProperty('--hero-img', 'linear-gradient(to bottom, rgba(0,0,0,.06) 38%, rgba(0,0,0,.82) 100%), url("' + s.imagenPortada.replace(/"/g, '%22') + '") center/cover no-repeat');
        }
        document.documentElement.classList.toggle('tiene-portada', urlOk(s.imagenPortada));
        document.documentElement.classList.toggle('portada-titulo', urlOk(s.imagenPortada) && s.tituloSobrePortada === true);
        if (HEX.test(s.colorPrincipal || '') && !/\/(panel|cocina|mesas|admin|estadisticas|menu_trabajadores)\.html$/.test(location.pathname)) {
            var mt = document.querySelector('meta[name="theme-color"]'); if (mt) mt.setAttribute('content', s.colorPrincipal);
        }
        window.TEMA = s;
        pintarLogo();
    }
    function pintarLogo() {
        var t = window.TEMA;
        var u = (t && urlOk(t.logo)) ? t.logo : LOGO_DEFECTO;
        document.querySelectorAll('[data-marca="emoji"], #logo-em, #h-em').forEach(function (el) {
            var grande = el.id === 'h-em', cabecera = el.id === 'logo-em';
            var prev = el.querySelector('img'); if (prev && prev.getAttribute('src') === u) return;
            el.innerHTML = '';
            var img = document.createElement('img'); img.src = u; img.alt = 'Logo';
            var alto = grande ? '84px' : (cabecera ? '42px' : '1.5em'), ancho = grande ? '160px' : (cabecera ? '60px' : '48px');
            img.style.cssText = 'height:' + alto + ';width:auto;max-width:' + ancho + ';object-fit:contain;display:inline-block;vertical-align:middle;border-radius:8px';
            el.appendChild(img);
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pintarLogo); else pintarLogo();

    try { var c = localStorage.getItem(KEY); if (c) aplicar(JSON.parse(c)); } catch (e) {}
    fetch('/api/sitio', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
        var s = d.sitio || {}, t = {};
        CAMPOS.forEach(function (k) { t[k] = s[k] || ''; });
        try { localStorage.setItem(KEY, JSON.stringify(t)); } catch (e) {}
        // Si el dueño quitó un color, se vuelve al original
        var st = document.documentElement.style;
        if (!HEX.test(t.colorPrincipal)) { ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'].forEach(function (k) { st.removeProperty('--color-red-' + k); }); st.removeProperty('--ac'); }
        if (!HEX.test(t.colorSecundario)) st.removeProperty('--ac2');
        if (!HEX.test(t.colorPortada)) ['--hero-a', '--hero-b', '--hero-c', '--dk'].forEach(function (k) { st.removeProperty(k); });
        if (!urlOk(t.imagenPortada)) st.removeProperty('--hero-img');
        aplicar(t);
        // por si el logo se pintó antes de que existieran los elementos
        document.addEventListener('DOMContentLoaded', pintarLogo);
        setTimeout(pintarLogo, 600); setTimeout(pintarLogo, 1800);
    }).catch(function () {});
})();
