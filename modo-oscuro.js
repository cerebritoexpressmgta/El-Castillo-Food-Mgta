// Modo oscuro de las pantallas del personal (el diseño estilo "Gelly").
//
// Por defecto se ve el diseño de siempre. Si alguien activa el modo oscuro,
// queda recordado en ESE equipo (localStorage) y todas las pantallas del
// personal lo usan: el <body> lleva la clase "tema-gelly" y tema-gelly.css
// hace el resto. Es solo apariencia.
//
// Se carga como PRIMER elemento del <body>, sin defer: así la clase se pone
// antes de pintar y la pantalla no parpadea con el otro diseño.
(function () {
    'use strict';
    var CLAVE = 'castillo_modo_oscuro';
    var activo = false;
    try { activo = localStorage.getItem(CLAVE) === '1'; } catch (e) { /* sin almacenamiento: diseño de siempre */ }
    if (activo && document.body) document.body.classList.add('tema-gelly');

    function cambiar() {
        try {
            if (activo) localStorage.removeItem(CLAVE); else localStorage.setItem(CLAVE, '1');
        } catch (e) { /* sin almacenamiento no se puede recordar */ }
        // Se recarga para que todo (también Tailwind en Estadísticas) tome el diseño elegido.
        location.reload();
    }

    function montar() {
        if (document.getElementById('modo-oscuro-btn')) return;
        var b = document.createElement('button');
        b.id = 'modo-oscuro-btn';
        b.type = 'button';
        b.setAttribute('aria-pressed', activo ? 'true' : 'false');
        b.setAttribute('aria-label', activo ? 'Desactivar el modo oscuro' : 'Activar el modo oscuro');
        b.title = activo ? 'Volver al diseño de siempre' : 'Modo oscuro';
        b.textContent = activo ? '☀️' : '🌙';
        b.addEventListener('click', cambiar);
        document.body.appendChild(b);
        var css = document.createElement('style');
        css.textContent =
            '#modo-oscuro-btn{position:fixed;left:12px;bottom:66px;z-index:9990;width:46px;height:46px;border-radius:50%;' +
            'border:0;cursor:pointer;background:#1e1b4b;color:#fff;font-size:20px;line-height:1;box-shadow:0 6px 16px rgba(0,0,0,.4);opacity:.88}' +
            '#modo-oscuro-btn:hover{opacity:1;background:#312e81}' +
            '#modo-oscuro-btn:focus-visible{outline:2px solid #fff;outline-offset:2px}' +
            '@media print{#modo-oscuro-btn{display:none}}';
        document.head.appendChild(css);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();
