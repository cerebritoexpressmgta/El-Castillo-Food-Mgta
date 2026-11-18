// =====================================================================
// Administración → Mesas: elegir la vista de mesas (por defecto / plano personalizado)
// y editor del plano del local (arrastrar y soltar). Va después de admin-mesas.js y plano-comun.js.
// =====================================================================
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var SNAP = 10;
    var TAMANOS = [
        { v: '1000x600', ancho: 1000, alto: 600, nombre: 'Horizontal (1000 × 600)' },
        { v: '800x800', ancho: 800, alto: 800, nombre: 'Cuadrado (800 × 800)' },
        { v: '600x900', ancho: 600, alto: 900, nombre: 'Vertical (600 × 900)' },
        { v: '1400x700', ancho: 1400, alto: 700, nombre: 'Amplio (1400 × 700)' }
    ];
    var PE = null;          // estado del editor abierto
    var PLANO_ADMIN = null; // plano guardado de la sucursal elegida en la tarjeta

    // ---------- sucursal ----------
    function variasSucursales() { return typeof SUCURSALES_ADMIN !== 'undefined' && SUCURSALES_ADMIN.length > 1; }
    function sidAdmin() {
        if (!variasSucursales()) return 0;
        var sel = $('plano-sucursal');
        return parseInt(sel && sel.value, 10) || SUCURSALES_ADMIN[0].id;
    }
    function mesasDeLaSucursal(sid) {
        var lista = typeof MESAS_ADMIN !== 'undefined' ? MESAS_ADMIN : [];
        return lista.filter(function (m) { return !sid || !m.sucursal_id || Number(m.sucursal_id) === Number(sid); });
    }
    function prepararSelectorSucursal() {
        var wrap = $('wrap-plano-sucursal'), sel = $('plano-sucursal');
        if (!wrap || !sel) return;
        if (!variasSucursales()) { wrap.style.display = 'none'; return; }
        wrap.style.display = '';
        if (sel.options.length !== SUCURSALES_ADMIN.length) {
            var previo = sel.value;
            sel.innerHTML = SUCURSALES_ADMIN.map(function (s) { return '<option value="' + s.id + '">' + PLANO.esc(s.nombre) + '</option>'; }).join('');
            if (previo) sel.value = previo;
        }
    }

    // ---------- tarjeta: vista por defecto / personalizada ----------
    async function cargarPlanoAdmin() {
        prepararSelectorSucursal();
        var sid = sidAdmin();
        try {
            var res = await fetch(API_BASE + '/api/mesas/plano?t=' + Date.now() + (sid ? '&sucursal=' + sid : ''), { headers: authHeaders() });
            var d = await res.json();
            if (!d.success) return;
            PLANO_ADMIN = d;
            var total = mesasDeLaSucursal(sid).length;
            document.querySelectorAll('input[name="plano-modo"]').forEach(function (r) { r.checked = r.value === d.modo; });
            $('plano-estado').textContent = d.ubicadas
                ? d.ubicadas + ' de ' + total + ' mesas ubicadas en el plano · ' + d.elementos.length + ' elemento' + (d.elementos.length === 1 ? '' : 's')
                : 'Todavía no has diseñado un plano.';
        } catch (e) { console.error('No se pudo leer el plano:', e); }
    }
    window.cargarPlanoAdmin = cargarPlanoAdmin;

    window.cambiarVistaMesas = async function (modo) {
        try {
            var res = await fetch(API_BASE + '/api/mesas/plano/modo', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ sucursal: sidAdmin(), modo: modo }) });
            var d = await res.json();
            if (!d.success) alert(d.error || 'No se pudo cambiar la vista.');
            else alert(modo === 'personalizado' ? '✅ El personal verá tu plano personalizado en la pantalla Mesas.' : '✅ El personal verá las mesas en la cuadrícula por defecto.');
        } catch (e) { alert('Error de red al cambiar la vista.'); }
        await cargarPlanoAdmin();
    };

    // Cada vez que se cargan las mesas del admin, se refresca también la tarjeta del plano
    var _orig = window.cargarMesasAdmin;
    if (typeof _orig === 'function') {
        window.cargarMesasAdmin = async function () { var r = await _orig.apply(this, arguments); cargarPlanoAdmin(); return r; };
    }

    // ---------- editor ----------
    function clon(o) { return JSON.parse(JSON.stringify(o)); }
    function snap(v) { return Math.round(v / SNAP) * SNAP; }
    function limitar(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function nuevoId() { return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
    function minLado(it, k) { return k === 'e' && PLANO.TIPOS[it.tipo] && PLANO.TIPOS[it.tipo].delgado ? 8 : (k === 'e' ? 20 : 40); }

    function objeto(sel) {
        if (!PE || !sel) return null;
        if (sel.k === 'm') return PE.mesas[sel.id] || null;
        return PE.elementos.find(function (e) { return e.id === sel.id; }) || null;
    }
    function ajustar(it, k) {
        var m = minLado(it, k);
        it.w = limitar(Math.round(it.w), m, PE.ancho); it.h = limitar(Math.round(it.h), m, PE.alto);
        it.x = limitar(Math.round(it.x), 0, PE.ancho - it.w); it.y = limitar(Math.round(it.y), 0, PE.alto - it.h);
    }
    function choca(x, y, w, h) {
        var pad = 6;
        function solapa(o) { return x < o.x + o.w + pad && x + w + pad > o.x && y < o.y + o.h + pad && y + h + pad > o.y; }
        if (Object.keys(PE.mesas).some(function (id) { return solapa(PE.mesas[id]); })) return true;
        return PE.elementos.some(function (e) { return e.tipo !== 'pared' && e.tipo !== 'texto' && solapa(e); });
    }
    function huecoLibre(w, h) {
        for (var y = 20; y + h <= PE.alto; y += 20) for (var x = 20; x + w <= PE.ancho; x += 20) if (!choca(x, y, w, h)) return { x: x, y: y };
        return { x: 20, y: 20 };
    }

    window.abrirEditorPlano = async function () {
        var sid = sidAdmin();
        var lista = mesasDeLaSucursal(sid);
        if (!lista.length) { alert('Primero agrega las mesas de tu local (formulario “Agregar Mesa”) y luego diseña el plano.'); return; }
        var d;
        try {
            var res = await fetch(API_BASE + '/api/mesas/plano?t=' + Date.now() + (sid ? '&sucursal=' + sid : ''), { headers: authHeaders() });
            d = await res.json();
            if (!d.success) throw new Error('sin datos');
        } catch (e) { alert('No se pudo abrir el plano. Intenta de nuevo.'); return; }
        PE = { sid: sid, ancho: d.ancho, alto: d.alto, mesas: clon(d.mesas || {}), elementos: clon(d.elementos || []), lista: lista, sel: null, sucio: false, drag: null };
        $('pe-usar').checked = d.modo === 'personalizado' || !Object.keys(PE.mesas).length;
        var nom = variasSucursales() ? (SUCURSALES_ADMIN.find(function (s) { return Number(s.id) === Number(sid); }) || {}).nombre : '';
        $('pe-sucursal-nombre').textContent = nom ? '📍 ' + nom : '';
        // Primera vez: se acomodan todas las mesas para que solo haya que moverlas
        if (!Object.keys(PE.mesas).length) peAcomodar(true);
        $('plano-editor').style.display = 'flex';
        document.body.style.overflow = 'hidden';
        pePintarTodo();
    };

    function cerrarEditor() {
        $('plano-editor').style.display = 'none'; document.body.style.overflow = ''; PE = null;
    }
    window.peCancelar = function () {
        if (PE && PE.sucio && !confirm('Hay cambios sin guardar. ¿Salir sin guardar?')) return;
        cerrarEditor();
    };
    window.peMarcarSucio = function () { if (PE) PE.sucio = true; };

    // ----- dibujo -----
    function pePintarTodo() {
        if (!PE) return;
        var sel = $('pe-tamano');
        var actual = PE.ancho + 'x' + PE.alto;
        var opts = TAMANOS.map(function (t) { return '<option value="' + t.v + '">' + t.nombre + '</option>'; });
        if (!TAMANOS.some(function (t) { return t.v === actual; })) opts.push('<option value="' + actual + '">Actual (' + PE.ancho + ' × ' + PE.alto + ')</option>');
        sel.innerHTML = opts.join(''); sel.value = actual;
        $('pe-elementos').innerHTML = Object.keys(PLANO.TIPOS).map(function (k) {
            var t = PLANO.TIPOS[k]; return '<button type="button" class="pe-b" data-add="' + k + '">' + (t.icono ? t.icono + ' ' : '＋ ') + t.nombre + '</button>';
        }).join('');
        pePintarLienzo(); pePintarLista(); pePintarProps();
    }
    function pePintarLienzo() {
        var plano = { ancho: PE.ancho, alto: PE.alto };
        var cont = $('pe-lienzo'); cont.style.cssText = PLANO.estiloLienzo(plano);
        var h = PE.elementos.map(function (e) {
            var es = PE.sel && PE.sel.k === 'e' && PE.sel.id === e.id;
            var vis = (e.tipo === 'texto' && !e.texto) ? Object.assign({}, e, { texto: 'Texto' }) : e; // en el editor un texto vacío se ve como "Texto"
            return PLANO.htmlElemento(vis, plano, { clase: 'pe-item' + (es ? ' sel' : ''), attrs: 'data-k="e" data-id="' + PLANO.esc(e.id) + '"' }).replace(/<\/div>$/, (es ? '<span class="pe-handle" data-handle="1"></span>' : '') + '</div>');
        }).join('');
        h += Object.keys(PE.mesas).map(function (id) {
            var c = PE.mesas[id], m = PE.lista.find(function (x) { return String(x.id) === String(id); });
            return m ? PLANO.htmlSillas(c, plano, m.capacidad, 'edit', id) : '';
        }).join('');
        h += Object.keys(PE.mesas).map(function (id) {
            var c = PE.mesas[id], m = PE.lista.find(function (x) { return String(x.id) === String(id); });
            if (!m) return '';
            var es = PE.sel && PE.sel.k === 'm' && String(PE.sel.id) === String(id);
            return '<div class="pl-mesa est-edit pe-item ' + (c.forma === 'redonda' ? 'redonda' : 'cuadrada') + (es ? ' sel' : '') + '" data-k="m" data-id="' + id + '" style="' + PLANO.estiloPos(c, plano) + '">' +
                '<span class="pl-nombre">' + PLANO.esc(m.nombre) + '</span><span class="pl-sub">👥 ' + m.capacidad + '</span>' + (es ? '<span class="pe-handle" data-handle="1"></span>' : '') + '</div>';
        }).join('');
        cont.innerHTML = h;
    }
    function pePintarLista() {
        $('pe-lista-mesas').innerHTML = PE.lista.map(function (m) {
            var puesta = !!PE.mesas[m.id];
            var es = PE.sel && PE.sel.k === 'm' && String(PE.sel.id) === String(m.id);
            return '<div class="pe-fila' + (es ? ' sel' : '') + '" data-mesa="' + m.id + '"><span>' + PLANO.esc(m.nombre) + ' <small>· ' + m.capacidad + ' pers. · ' + PLANO.esc(m.zona) + '</small></span>' +
                (puesta ? '<span class="pe-ok">✓ en el plano</span>' : '<span class="pe-no">+ colocar</span>') + '</div>';
        }).join('') || '<p class="pe-ayuda">No hay mesas en esta sucursal.</p>';
    }
    function pePintarProps() {
        var cont = $('pe-props'), o = objeto(PE.sel);
        if (!o) { cont.innerHTML = '<p class="pe-ayuda" style="margin:0">Toca una mesa o un elemento del plano para editarlo.</p>'; return; }
        var tam = '<div class="pe-grid" style="margin-top:8px"><button type="button" class="pe-b" data-acc="girar">↻ Girar 90°</button><button type="button" class="pe-b" data-acc="mas">＋ Más grande</button><button type="button" class="pe-b" data-acc="menos">－ Más pequeño</button>';
        if (PE.sel.k === 'm') {
            var m = PE.lista.find(function (x) { return String(x.id) === String(PE.sel.id); });
            cont.innerHTML = '<div><b>' + PLANO.esc(m ? m.nombre : '') + '</b></div><label>Forma</label><select data-forma="1"><option value="cuadrada"' + (o.forma !== 'redonda' ? ' selected' : '') + '>Cuadrada / rectangular</option><option value="redonda"' + (o.forma === 'redonda' ? ' selected' : '') + '>Redonda / ovalada</option></select>' +
                tam + '<button type="button" class="pe-b rojo" data-acc="quitar">Quitar del plano</button></div>';
        } else {
            var t = PLANO.TIPOS[o.tipo];
            cont.innerHTML = '<div><b>' + (t.icono ? t.icono + ' ' : '') + t.nombre + '</b></div>' + (t.delgado ? '' : '<label>Texto</label><input type="text" maxlength="30" value="' + PLANO.esc(o.texto) + '" data-texto="1" placeholder="' + PLANO.esc(t.nombre) + '">') +
                tam + '<button type="button" class="pe-b" data-acc="duplicar">⧉ Duplicar</button><button type="button" class="pe-b rojo" data-acc="eliminar">🗑️ Eliminar</button></div>';
        }
    }
    function marcarSeleccion() {
        document.querySelectorAll('#pe-lienzo .pe-handle').forEach(function (n) { n.remove(); });
        document.querySelectorAll('#pe-lienzo .pe-item').forEach(function (n) {
            var es = PE.sel && n.dataset.k === PE.sel.k && String(n.dataset.id) === String(PE.sel.id);
            n.classList.toggle('sel', !!es);
            if (es) { var hd = document.createElement('span'); hd.className = 'pe-handle'; hd.dataset.handle = '1'; n.appendChild(hd); }
        });
        pePintarLista(); pePintarProps();
    }

    // ----- acciones -----
    function colocarMesa(id) {
        var m = PE.lista.find(function (x) { return String(x.id) === String(id); }); if (!m) return;
        var t = PLANO.tamanoMesa(m.capacidad), pos = huecoLibre(t.w, t.h);
        PE.mesas[m.id] = { x: pos.x, y: pos.y, w: t.w, h: t.h, forma: t.forma };
        PE.sucio = true;
    }
    function peAcomodar(silencioso) {
        var sin = PE.lista.filter(function (m) { return !PE.mesas[m.id]; });
        if (!sin.length) { if (!silencioso) alert('Todas las mesas ya están en el plano.'); return; }
        sin.forEach(function (m) { colocarMesa(m.id); });
    }
    window.peAcomodarSinUbicar = function () { peAcomodar(false); pePintarTodo(); };
    window.peVaciar = function () {
        if (!confirm('¿Vaciar el plano? Se quitan todas las mesas y elementos (podrás volver a acomodarlas).')) return;
        PE.mesas = {}; PE.elementos = []; PE.sel = null; PE.sucio = true; pePintarTodo();
    };
    // Al cambiar la forma del plano se ESCALA todo el diseño (posiciones por eje, tamaños por la menor proporción),
    // así las mesas conservan su disposición y no se apilan en el borde.
    window.peCambiarTamano = function (v) {
        var p = v.split('x'), nw = parseInt(p[0], 10), nh = parseInt(p[1], 10);
        if (!(nw > 0 && nh > 0)) return;
        var sx = nw / PE.ancho, sy = nh / PE.alto, sz = Math.min(sx, sy);
        function esc(o, k) {
            o.x = snap(o.x * sx); o.y = snap(o.y * sy); o.w = o.w * sz; o.h = o.h * sz;
            o.w = Math.max(minLado(o, k), snap(o.w)); o.h = Math.max(minLado(o, k), snap(o.h));
        }
        PE.ancho = nw; PE.alto = nh;
        Object.keys(PE.mesas).forEach(function (id) { esc(PE.mesas[id], 'm'); ajustar(PE.mesas[id], 'm'); });
        PE.elementos.forEach(function (e) { esc(e, 'e'); ajustar(e, 'e'); });
        PE.sucio = true; pePintarTodo();
    };
    function accion(acc) {
        var o = objeto(PE.sel); if (!o) return;
        var k = PE.sel.k;
        if (acc === 'girar') { var w = o.w; o.w = o.h; o.h = w; }
        else if (acc === 'mas') { o.w *= 1.2; o.h *= 1.2; }
        else if (acc === 'menos') { o.w /= 1.2; o.h /= 1.2; }
        else if (acc === 'quitar') { delete PE.mesas[PE.sel.id]; PE.sel = null; PE.sucio = true; pePintarTodo(); return; }
        else if (acc === 'eliminar') { PE.elementos = PE.elementos.filter(function (e) { return e.id !== PE.sel.id; }); PE.sel = null; PE.sucio = true; pePintarTodo(); return; }
        else if (acc === 'duplicar') {
            var c = clon(o); c.id = nuevoId(); c.x += 20; c.y += 20; ajustar(c, 'e'); PE.elementos.push(c); PE.sel = { k: 'e', id: c.id }; PE.sucio = true; pePintarTodo(); return;
        }
        o.w = snap(o.w) || SNAP; o.h = snap(o.h) || SNAP;
        ajustar(o, k); PE.sucio = true; pePintarLienzo(); marcarSeleccion();
    }
    function agregarElemento(tipo) {
        var t = PLANO.TIPOS[tipo]; if (!t) return;
        var pos = huecoLibre(t.w, t.h);
        var e = { id: nuevoId(), tipo: tipo, texto: '', x: pos.x, y: pos.y, w: t.w, h: t.h };
        ajustar(e, 'e'); PE.elementos.push(e); PE.sel = { k: 'e', id: e.id }; PE.sucio = true; pePintarTodo();
    }

    // ----- arrastrar / redimensionar -----
    function enlazarEventos() {
        var lienzo = $('pe-lienzo');
        lienzo.addEventListener('pointerdown', function (ev) {
            if (!PE) return;
            var item = ev.target.closest('[data-k]');
            if (!item) { PE.sel = null; marcarSeleccion(); return; }
            var sel = { k: item.dataset.k, id: item.dataset.id };
            var o = objeto(sel); if (!o) return;
            PE.sel = sel; marcarSeleccion();
            var cont = document.querySelector('#pe-lienzo [data-k="' + sel.k + '"][data-id="' + sel.id + '"]') || item;
            var rect = lienzo.getBoundingClientRect();
            PE.drag = { modo: ev.target.closest('[data-handle]') ? 'tam' : 'mover', sx: ev.clientX, sy: ev.clientY, x0: o.x, y0: o.y, w0: o.w, h0: o.h, esc: PE.ancho / rect.width, nodo: cont, movido: false };
            try { cont.setPointerCapture(ev.pointerId); } catch (e) {}
            ev.preventDefault();
        });
        lienzo.addEventListener('pointermove', function (ev) {
            var d = PE && PE.drag; if (!d) return;
            var o = objeto(PE.sel); if (!o) return;
            var dx = (ev.clientX - d.sx) * d.esc, dy = (ev.clientY - d.sy) * d.esc;
            if (Math.abs(dx) + Math.abs(dy) > 2) d.movido = true;
            if (d.modo === 'mover') { o.x = snap(d.x0 + dx); o.y = snap(d.y0 + dy); }
            else { o.w = snap(d.w0 + dx); o.h = snap(d.h0 + dy); }
            ajustar(o, PE.sel.k);
            var p = PLANO.estiloPos(o, { ancho: PE.ancho, alto: PE.alto }).split(';');
            p.forEach(function (par) { var kv = par.split(':'); if (kv.length === 2) d.nodo.style[kv[0]] = kv[1]; });
            if (PE.sel.k === 'm') { // las sillas acompañan a la mesa mientras se arrastra
                var mm = PE.lista.find(function (x) { return String(x.id) === String(PE.sel.id); });
                lienzo.querySelectorAll('.pl-silla[data-silla="' + PE.sel.id + '"]').forEach(function (n) { n.remove(); });
                if (mm) { var ref = d.nodo; ref.insertAdjacentHTML('beforebegin', PLANO.htmlSillas(o, { ancho: PE.ancho, alto: PE.alto }, mm.capacidad, 'edit', PE.sel.id)); }
            }
        });
        function soltar() { if (PE && PE.drag) { if (PE.drag.movido) PE.sucio = true; PE.drag = null; } }
        lienzo.addEventListener('pointerup', soltar);
        lienzo.addEventListener('pointercancel', soltar);

        $('pe-lista-mesas').addEventListener('click', function (ev) {
            var f = ev.target.closest('[data-mesa]'); if (!f || !PE) return;
            var id = f.dataset.mesa;
            if (!PE.mesas[id]) colocarMesa(id);
            PE.sel = { k: 'm', id: id }; pePintarLienzo(); marcarSeleccion();
        });
        $('pe-elementos').addEventListener('click', function (ev) { var b = ev.target.closest('[data-add]'); if (b && PE) agregarElemento(b.dataset.add); });
        var props = $('pe-props');
        props.addEventListener('click', function (ev) { var b = ev.target.closest('[data-acc]'); if (b && PE) accion(b.dataset.acc); });
        props.addEventListener('change', function (ev) {
            if (!PE || !ev.target.dataset.forma) return;
            var o = objeto(PE.sel); if (o) { o.forma = ev.target.value === 'redonda' ? 'redonda' : 'cuadrada'; PE.sucio = true; pePintarLienzo(); }
        });
        props.addEventListener('input', function (ev) {
            if (!PE || !ev.target.dataset.texto) return;
            var o = objeto(PE.sel); if (o) { o.texto = ev.target.value.slice(0, 30); PE.sucio = true; pePintarLienzo(); }
        });
        document.addEventListener('keydown', function (ev) {
            if (!PE || $('plano-editor').style.display !== 'flex') return;
            var enCampo = /^(INPUT|SELECT|TEXTAREA)$/.test((ev.target.tagName || ''));
            var o = objeto(PE.sel); if (!o || enCampo) return;
            var mov = { ArrowLeft: [-SNAP, 0], ArrowRight: [SNAP, 0], ArrowUp: [0, -SNAP], ArrowDown: [0, SNAP] }[ev.key];
            if (mov) { o.x += mov[0]; o.y += mov[1]; ajustar(o, PE.sel.k); PE.sucio = true; pePintarLienzo(); ev.preventDefault(); }
            else if (ev.key === 'Delete' || ev.key === 'Backspace') { accion(PE.sel.k === 'm' ? 'quitar' : 'eliminar'); ev.preventDefault(); }
        });
    }

    // ----- guardar -----
    window.peGuardar = async function () {
        if (!PE) return;
        var usar = $('pe-usar').checked;
        if (usar && !Object.keys(PE.mesas).length) { alert('Para usar el plano coloca al menos una mesa en él (toca una mesa de la lista).'); return; }
        var btn = $('pe-guardar'); btn.disabled = true; btn.textContent = 'Guardando...';
        try {
            var body = { sucursal: PE.sid, ancho: PE.ancho, alto: PE.alto, mesas: PE.mesas, elementos: PE.elementos, modo: usar ? 'personalizado' : 'cuadricula' };
            var res = await fetch(API_BASE + '/api/mesas/plano/guardar', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
            var d = await res.json();
            if (!d.success) { alert(d.error || d.detail || 'No se pudo guardar el plano.'); return; }
            alert('✅ Plano guardado.' + (usar ? '\nEl personal ya lo ve en la pantalla Mesas.' : '\nSe usa la vista por defecto; puedes activarlo cuando quieras.'));
            PE.sucio = false; cerrarEditor(); await cargarPlanoAdmin();
        } catch (e) { alert('Error de red al guardar el plano.'); }
        finally { btn.disabled = false; btn.textContent = '💾 Guardar plano'; }
    };

    if ($('pe-lienzo')) enlazarEventos();
    // Si las mesas ya estaban cargadas antes de que este archivo se ejecutara
    if (typeof MESAS_ADMIN !== 'undefined' && MESAS_ADMIN.length) cargarPlanoAdmin();
})();
