// =====================================================================
// Plano del local: lo que comparten el editor (Administración) y la vista del personal (Mesas)
// Las medidas del plano van en "unidades" (por defecto 1000 x 600); aquí se pasan a % para que
// el dibujo se adapte a cualquier pantalla.
// =====================================================================
(function () {
    'use strict';

    // Elementos decorativos que el dueño puede poner para que el plano se parezca a su local
    var TIPOS = {
        pared:      { nombre: 'Pared',       icono: '',   color: '#475569', borde: '#94a3b8', w: 300, h: 14,  delgado: true },
        barra:      { nombre: 'Barra',       icono: '🍸', color: '#78350f', borde: '#f59e0b', w: 240, h: 60 },
        entrada:    { nombre: 'Entrada',     icono: '🚪', color: '#14532d', borde: '#4ade80', w: 120, h: 50 },
        cocina:     { nombre: 'Cocina',      icono: '🍳', color: '#7c2d12', borde: '#fb923c', w: 200, h: 100 },
        bano:       { nombre: 'Baños',       icono: '🚻', color: '#1e3a8a', borde: '#60a5fa', w: 110, h: 80 },
        caja:       { nombre: 'Caja',        icono: '💵', color: '#713f12', borde: '#facc15', w: 110, h: 60 },
        decoracion: { nombre: 'Planta',      icono: '🌿', color: '#166534', borde: '#86efac', w: 60,  h: 60, redondo: true },
        texto:      { nombre: 'Texto libre', icono: '',   color: 'transparent', borde: 'transparent', w: 160, h: 40, soloTexto: true }
    };

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
    }

    // Posición y tamaño de un objeto del plano, en porcentaje del lienzo
    function estiloPos(o, plano) {
        return 'left:' + (o.x / plano.ancho * 100).toFixed(3) + '%;top:' + (o.y / plano.alto * 100).toFixed(3) + '%;' +
               'width:' + (o.w / plano.ancho * 100).toFixed(3) + '%;height:' + (o.h / plano.alto * 100).toFixed(3) + '%;';
    }

    // Un elemento decorativo (pared, barra, entrada...). extra = atributos/clases adicionales (el editor los usa)
    function htmlElemento(el, plano, extra) {
        var t = TIPOS[el.tipo]; if (!t) return '';
        var clases = 'pl-el' + (t.redondo ? ' redondo' : '') + (t.soloTexto ? ' solo-texto' : '') + ((extra && extra.clase) ? ' ' + extra.clase : '');
        var etiqueta = el.texto || (t.soloTexto || t.delgado ? '' : t.nombre);
        var contenido = (t.icono && !t.soloTexto ? '<span class="ic">' + t.icono + '</span>' : '') + (etiqueta ? '<span class="tx">' + esc(etiqueta) + '</span>' : '');
        return '<div class="' + clases + '" ' + ((extra && extra.attrs) || '') + ' style="' + estiloPos(el, plano) + 'background:' + t.color + ';border-color:' + t.borde + ';">' + contenido + '</div>';
    }

    // Tamaño sugerido para una mesa según su capacidad
    function tamanoMesa(capacidad) {
        var c = parseInt(capacidad, 10) || 4;
        if (c <= 2) return { w: 70, h: 70, forma: 'redonda' };
        if (c <= 4) return { w: 90, h: 90, forma: 'cuadrada' };
        if (c <= 6) return { w: 130, h: 90, forma: 'cuadrada' };
        return { w: 180, h: 90, forma: 'cuadrada' };
    }


    // ---------------------------------------------------------------------
    // Sillas con espaldar alrededor de cada mesa, según su capacidad.
    // Cada silla se dibuja con el espaldar hacia afuera (de espaldas a la mesa).
    // Devuelve una lista [{x, y, rot}] en unidades del plano (x,y = centro de la silla).
    // ---------------------------------------------------------------------
    function medidaSilla(c) { return Math.max(18, Math.min(30, Math.min(c.w, c.h) * 0.3)); }

    function posicionesSillas(c, capacidad) {
        var n = Math.max(1, Math.min(parseInt(capacidad, 10) || 4, 16));
        var s = medidaSilla(c), sep = 3;            // sep = espacio entre la mesa y la silla
        var cx = c.x + c.w / 2, cy = c.y + c.h / 2;
        var out = [], i;

        if (c.forma === 'redonda') {
            var rx = c.w / 2 + sep + s / 2, ry = c.h / 2 + sep + s / 2;
            // Que no se amontonen: máximo según el perímetro aproximado
            var perim = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
            n = Math.min(n, Math.max(1, Math.floor(perim / (s * 1.15))));
            // 2 sillas: izquierda/derecha queda mejor; con más, se parte desde arriba
            var inicio = n === 2 ? 0 : -Math.PI / 2;
            for (i = 0; i < n; i++) {
                var t = inicio + i * 2 * Math.PI / n;
                var nx = Math.cos(t) / rx, ny = Math.sin(t) / ry;       // normal de la elipse
                var ang = Math.atan2(ny, nx);                            // hacia afuera
                out.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t), rot: ang * 180 / Math.PI + 90 });
            }
            return out;
        }

        // Mesa rectangular: se reparten por los lados
        var lados = { top: 0, bottom: 0, left: 0, right: 0 };
        var alargada = Math.abs(c.w - c.h) > 0.25 * Math.max(c.w, c.h);
        var horizontal = c.w >= c.h;                 // los lados largos son arriba/abajo
        var A = horizontal ? 'top' : 'left', B = horizontal ? 'bottom' : 'right';   // lados largos
        var E1 = horizontal ? 'left' : 'top', E2 = horizontal ? 'right' : 'bottom'; // extremos
        var largo = horizontal ? c.w : c.h;
        var maxLado = Math.max(1, Math.floor(largo / (s * 1.2)));

        if (n === 4 && !alargada) { lados.top = lados.bottom = lados.left = lados.right = 1; }
        else if (n <= 2) { lados[A] = 1; if (n === 2) lados[B] = 1; }
        else if (n <= 4) { lados[A] = Math.ceil(n / 2); lados[B] = Math.floor(n / 2); }
        else { lados[E1] = 1; lados[E2] = 1; lados[A] = Math.ceil((n - 2) / 2); lados[B] = Math.floor((n - 2) / 2); }
        lados[A] = Math.min(lados[A], maxLado); lados[B] = Math.min(lados[B], maxLado);

        function repartir(k, longitud, inicio) { var r = []; for (var j = 0; j < k; j++) r.push(inicio + (j + 0.5) * longitud / k); return r; }
        var d = sep + s / 2;
        repartir(lados.top, c.w, c.x).forEach(function (x) { out.push({ x: x, y: c.y - d, rot: 0 }); });
        repartir(lados.bottom, c.w, c.x).forEach(function (x) { out.push({ x: x, y: c.y + c.h + d, rot: 180 }); });
        repartir(lados.left, c.h, c.y).forEach(function (y) { out.push({ x: c.x - d, y: y, rot: -90 }); });
        repartir(lados.right, c.h, c.y).forEach(function (y) { out.push({ x: c.x + c.w + d, y: y, rot: 90 }); });
        return out;
    }

    // HTML de las sillas de una mesa. estado: libre | ocupada | cuenta | edit
    // Van ANTES de la mesa en el DOM para quedar por debajo; no capturan clics.
    function htmlSillas(c, plano, capacidad, estado, idMesa, extraClase) {
        var s = medidaSilla(c);
        var w = (s / plano.ancho * 100).toFixed(3), h = (s / plano.alto * 100).toFixed(3);
        return posicionesSillas(c, capacidad).map(function (p) {
            return '<i class="pl-silla est-' + (estado || 'libre') + (extraClase ? ' ' + extraClase : '') + '" data-silla="' + esc(idMesa) + '" style="left:' +
                (p.x / plano.ancho * 100).toFixed(3) + '%;top:' + (p.y / plano.alto * 100).toFixed(3) + '%;width:' + w + '%;height:' + h +
                '%;transform:translate(-50%,-50%) rotate(' + p.rot.toFixed(1) + 'deg)"></i>';
        }).join('');
    }

    function estiloLienzo(plano) {
        return 'aspect-ratio:' + plano.ancho + ' / ' + plano.alto + ';background-size:' + (50 / plano.ancho * 100).toFixed(3) + '% ' + (50 / plano.alto * 100).toFixed(3) + '%;';
    }

    var css = [
        '.pl-scroll{overflow-x:auto;padding-bottom:6px}',
        '.pl-lienzo{position:relative;width:100%;min-width:680px;container-type:inline-size;border-radius:16px;border:1px solid rgba(148,163,184,.35);',
        'background-color:rgba(10,18,32,.6);background-image:linear-gradient(rgba(148,163,184,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.10) 1px,transparent 1px);',
        'overflow:hidden;user-select:none;-webkit-user-select:none}',
        '.pl-el,.pl-mesa{position:absolute;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;line-height:1.15;overflow:hidden;padding:2px}',
        '.pl-el{color:#fff;font-weight:700;font-size:clamp(9px,1.45cqw,18px);border:2px solid;border-radius:10px;opacity:.93;gap:1px}',
        '.pl-el .ic{font-size:1.5em;line-height:1}',
        '.pl-el.redondo{border-radius:50%}',
        '.pl-el.solo-texto{border:0;background:transparent!important;font-size:clamp(10px,1.8cqw,22px);text-shadow:0 1px 3px rgba(0,0,0,.85)}',
        '.pl-mesa{border:2px solid;color:#fff;cursor:pointer;font-family:inherit;transition:filter .15s,transform .15s}',
        '.pl-mesa:hover{filter:brightness(1.25);transform:scale(1.03);z-index:5}',
        '.pl-mesa.redonda{border-radius:50%}.pl-mesa.cuadrada{border-radius:14px}',
        '.pl-mesa .pl-nombre{font-weight:900;font-size:clamp(9px,1.7cqw,20px)}',
        '.pl-mesa .pl-sub{font-size:clamp(8px,1.2cqw,14px);opacity:.8}',
        '.pl-mesa .pl-cons{font-weight:800;font-size:clamp(9px,1.4cqw,17px)}',
        '.pl-mesa.est-libre{background:rgba(16,185,129,.18);border-color:#10b981}',
        '.pl-mesa.est-ocupada{background:rgba(245,158,11,.28);border-color:#f59e0b}',
        '.pl-mesa.est-cuenta{background:rgba(217,70,239,.28);border-color:#d946ef}',
        '.pl-mesa.est-edit{background:rgba(56,189,248,.22);border-color:#38bdf8;cursor:grab;touch-action:none}',
        '.pl-mesa.atenuada{opacity:.25}',
        '.pl-silla{position:absolute;display:block;pointer-events:none;box-sizing:border-box;--sc:#10b981;--sb:rgba(16,185,129,.35);filter:drop-shadow(0 2px 2px rgba(0,0,0,.55));isolation:isolate}',
        '.pl-silla::before,.pl-silla::after{content:"";position:absolute;box-sizing:border-box}',
        /* espaldar: barra curva en el lado de afuera */
        '.pl-silla::before{left:6%;right:6%;top:0;height:36%;background:linear-gradient(var(--sc),var(--sc)) top/100% 24% no-repeat,linear-gradient(90deg,var(--sc) 0 13%,transparent 13% 29%,var(--sc) 29% 42%,transparent 42% 58%,var(--sc) 58% 71%,transparent 71% 87%,var(--sc) 87% 100%) bottom/100% 80% no-repeat;border-radius:2px}',
        /* asiento acolchado */
        '.pl-silla::after{left:6%;right:6%;top:34%;bottom:0;background:var(--sb);border:1.5px solid var(--sc);border-radius:14%}',
        '.pl-silla.est-libre{--sc:#10b981;--sb:rgba(16,185,129,.30)}',
        '.pl-silla.est-ocupada{--sc:#f59e0b;--sb:rgba(245,158,11,.38)}',
        '.pl-silla.est-cuenta{--sc:#d946ef;--sb:rgba(217,70,239,.38)}',
        '.pl-silla.est-edit{--sc:#38bdf8;--sb:rgba(56,189,248,.30)}',
        '.pl-silla.atenuada{opacity:.25}'
    ].join('');
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

    window.PLANO = { TIPOS: TIPOS, esc: esc, estiloPos: estiloPos, htmlElemento: htmlElemento, tamanoMesa: tamanoMesa, estiloLienzo: estiloLienzo, htmlSillas: htmlSillas, posicionesSillas: posicionesSillas };
})();
