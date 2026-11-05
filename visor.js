// =====================================================================
// Visor de la demo: celular del cliente + paneles del negocio, todo en vivo
// =====================================================================
// Se monta en <div id="visor-demo">. Las pantallas son las páginas reales de la app
// dentro de marcos; comparten los mismos datos, así que un pedido hecho en el celular
// aparece al instante en Cocina, Mesas, Estadísticas, etc.
(function () {
    'use strict';
    const DB_KEY = 'prototipoCF.db.v1';
    const MARCA_KEY = 'prototipoCF.marca';
    const CFG = window.DEMO_CONFIG || {};
    const control = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('prototipoCF-control') : null;

    const PANELES = {
        cocina: { etq: '👨‍🍳 Cocina', url: 'index.html', slug: 'cocina',
                  pista: '<b>Tablero de cocina.</b> Cada pedido que entra aparece aquí al instante. Avanza su estado: calcular delivery, validar el pago, cocina y despacho.' },
        caja:   { etq: '🧾 Caja', url: 'menu_trabajadores.html', slug: 'caja',
                  pista: '<b>Caja.</b> Toma pedidos por teléfono o en mostrador, incluso para una mesa. Usa el mismo menú que ve el cliente.' },
        mesas:  { etq: '🍽️ Mesas', url: 'mesas.html', slug: 'mesas',
                  pista: '<b>Plano de mesas.</b> Estado en vivo, consumo acumulado y cobro de la cuenta. Toca una mesa para ver sus pedidos.' },
        admin:  { etq: '⚙️ Administración', url: 'admin.html', slug: 'admin',
                  pista: '<b>Administración.</b> Cambia precios, agrega productos y combos, mesas, horarios, usuarios y mensajes. Los cambios se ven al momento en el celular.' },
        stats:  { etq: '📊 Estadísticas', url: 'estadisticas.html', slug: 'ventas',
                  pista: '<b>Estadísticas.</b> Ventas por día, productos más pedidos y búsqueda de clientes, con 14 días de historial de ejemplo.' }
    };
    const PISTA_CLIENTE = '<b>Lo que ve el cliente.</b> Elige un combo, arma su pedido y envíalo: escoge «Comer aquí» para una mesa, o prueba el QR de una mesa desde el selector.';

    const GUIA = [
        { t: 'cliente', txt: '1 · Pide en el celular' },
        { t: 'cocina',  txt: '2 · Míralo en Cocina' },
        { t: 'mesas',   txt: '3 · Cobra la mesa' },
        { t: 'admin',   txt: '4 · Cambia un precio' },
        { t: 'stats',   txt: '5 · Mira las ventas' }
    ];

    const montaje = document.getElementById('visor-demo');
    if (!montaje) return;

    let marcaGuardada = {};
    try { marcaGuardada = JSON.parse(localStorage.getItem(MARCA_KEY) || '{}') || {}; } catch (e) { /* ignora */ }
    const nombreNegocio = () => (marcaGuardada.nombre || CFG.nombreNegocio || 'Mi Restaurante');
    const emojiNegocio = () => (marcaGuardada.emoji || CFG.emoji || '🍔');

    function nombresDeMesas() {
        try {
            const db = JSON.parse(localStorage.getItem(DB_KEY) || 'null');
            if (db && Array.isArray(db.mesas) && db.mesas.length) return db.mesas.map(m => m.nombre);
        } catch (e) { /* usa la config */ }
        return (CFG.mesas || []).map(m => m.nombre);
    }
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    montaje.innerHTML = `
      <div class="visor" id="cf-visor" data-tab="cocina">
        <div class="v-top">
          <div class="v-tabs" role="tablist" id="cf-tabs"></div>
          <div class="v-acc">
            <button class="btn btn-sec btn-sm" id="cf-btn-pers" type="button">✏️ Personalizar</button>
            <button class="btn btn-sec btn-sm" id="cf-btn-reset" type="button">↺ Reiniciar</button>
            <button class="btn btn-sec btn-sm" id="cf-btn-full" type="button">↗ Pantalla completa</button>
          </div>
        </div>

        <form class="v-pers" id="cf-pers">
          <h4>Pon el nombre de tu negocio y míralo en toda la app</h4>
          <div class="fila">
            <div><label>Nombre</label><input name="nombre" maxlength="28" placeholder="Ej: Pizzería Roma" value="${esc(nombreNegocio())}"></div>
            <div><label>Emoji</label><input name="emoji" maxlength="4" value="${esc(emojiNegocio())}"></div>
            <div class="v-emojis" id="cf-emojis">${['🍔','🍕','🌮','🍣','🥐','☕','🍗','🥗','🍦'].map(e => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div>
            <button class="btn btn-pri btn-sm" type="submit">Aplicar</button>
          </div>
        </form>

        <div class="v-pista" id="cf-pista"></div>

        <div class="v-escena">
          <div class="v-col-tel">
            <div class="v-ctx">
              <select id="cf-ctx" aria-label="Cómo llega el cliente"></select>
              <button class="btn btn-sec btn-sm" id="cf-btn-nuevo" type="button" title="Ver el registro de un cliente nuevo">👤 Nuevo</button>
            </div>
            <div class="tel"><div class="pant" data-dw="390" data-dh="780"><iframe id="cf-f-cliente" title="App del cliente" loading="lazy"></iframe></div></div>
          </div>
          <div class="v-col-mon">
            <div class="mon">
              <div class="barra"><b></b><b></b><b></b><span id="cf-url"></span></div>
              <div class="pant" data-dw="1180" data-dh="760"><iframe id="cf-f-panel" title="Panel del negocio" loading="lazy"></iframe></div>
            </div>
          </div>
        </div>

        <div class="v-guia" id="cf-guia"></div>
        <p class="v-nota">Todo es una simulación: los datos viven solo en tu navegador y nada se envía de verdad.</p>
      </div>`;

    const $ = id => document.getElementById(id);
    const visor = $('cf-visor'), fCliente = $('cf-f-cliente'), fPanel = $('cf-f-panel');
    let tab = 'cocina', ctx = '', nuevo = false;

    // ---- pestañas ----
    $('cf-tabs').innerHTML = `<button class="v-tab solo-movil" role="tab" data-t="cliente">📱 Cliente</button>` +
        Object.keys(PANELES).map(k => `<button class="v-tab" role="tab" data-t="${k}">${PANELES[k].etq}</button>`).join('');
    $('cf-guia').innerHTML = GUIA.map(g => `<button type="button" data-t="${g.t}">${g.txt}</button>`).join('');

    function urlCliente() {
        const p = new URLSearchParams({ embed: '1', auto: nuevo ? 'cliente-nuevo' : 'cliente' });
        if (ctx) p.set('mesa', ctx);
        return 'menu.html?' + p.toString();
    }
    function urlPanel(k) { return PANELES[k].url + '?embed=1&auto=staff'; }

    function cargar(frame, url) { if (frame.getAttribute('data-url') !== url) { frame.setAttribute('data-url', url); frame.src = url; } }

    function elegirTab(t) {
        if (t !== 'cliente' && !PANELES[t]) return;
        tab = t; visor.setAttribute('data-tab', t);
        document.querySelectorAll('#cf-tabs .v-tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === t)));
        $('cf-pista').innerHTML = t === 'cliente' ? PISTA_CLIENTE : PANELES[t].pista;
        if (t !== 'cliente') {
            cargar(fPanel, urlPanel(t));
            $('cf-url').textContent = 'https://' + (nombreNegocio().toLowerCase().replace(/[^a-z0-9]+/g, '') || 'tunegocio') + '.com/' + PANELES[t].slug;
        }
        cargar(fCliente, urlCliente());
        requestAnimationFrame(ajustar);
    }

    // ---- escalado de los marcos para que el diseño real quepa en cada pantalla ----
    function ajustar() {
        document.querySelectorAll('#cf-visor .pant[data-dw]').forEach(p => {
            const dw = +p.dataset.dw, dh = +p.dataset.dh, w = p.clientWidth;
            if (!w) return;
            const f = p.querySelector('iframe'), s = w / dw;
            f.style.width = dw + 'px'; f.style.height = dh + 'px'; f.style.transform = 'scale(' + s + ')';
        });
    }
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(ajustar).observe(visor);
    window.addEventListener('resize', ajustar);

    // ---- selector de contexto del cliente (casa o QR de mesa) ----
    function pintarContextos() {
        $('cf-ctx').innerHTML = '<option value="">🏠 Cliente desde su casa</option>' +
            nombresDeMesas().map(n => `<option value="${esc(n)}">📍 Escaneó el QR de la ${esc(n)}</option>`).join('');
        $('cf-ctx').value = ctx;
    }
    $('cf-ctx').addEventListener('change', e => { ctx = e.target.value; fCliente.removeAttribute('data-url'); cargar(fCliente, urlCliente()); });
    $('cf-btn-nuevo').addEventListener('click', () => { nuevo = true; fCliente.removeAttribute('data-url'); cargar(fCliente, urlCliente()); nuevo = false; });

    // ---- eventos ----
    visor.addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) elegirTab(b.dataset.t); });

    $('cf-btn-full').addEventListener('click', () => {
        const url = tab === 'cliente' ? 'menu.html' + (ctx ? '?mesa=' + encodeURIComponent(ctx) : '') : PANELES[tab].url + '?auto=staff';
        window.open(url, '_blank', 'noopener');
    });
    $('cf-btn-reset').addEventListener('click', () => {
        try { localStorage.removeItem(DB_KEY); localStorage.removeItem('sesionCliente'); } catch (e) { /* ignora */ }
        if (control) control.postMessage({ tipo: 'recargar' });
        [fCliente, fPanel].forEach(f => { if (f.getAttribute('data-url')) f.src = f.getAttribute('data-url'); });
        setTimeout(pintarContextos, 600);
    });
    $('cf-btn-pers').addEventListener('click', () => $('cf-pers').classList.toggle('abierto'));
    $('cf-emojis').addEventListener('click', e => { const b = e.target.closest('[data-e]'); if (b) $('cf-pers').elements.emoji.value = b.dataset.e; });
    $('cf-pers').addEventListener('submit', e => {
        e.preventDefault();
        const f = e.target.elements;
        marcaGuardada = { nombre: f.nombre.value.trim().slice(0, 28), emoji: (f.emoji.value.trim() || '🍔').slice(0, 4) };
        try { localStorage.setItem(MARCA_KEY, JSON.stringify(marcaGuardada)); } catch (err) { /* ignora */ }
        if (control) control.postMessage({ tipo: 'recargar' });
        [fCliente, fPanel].forEach(fr => { if (fr.getAttribute('data-url')) fr.src = fr.getAttribute('data-url'); });
        elegirTab(tab);
        document.dispatchEvent(new CustomEvent('visor:marca', { detail: marcaGuardada }));
    });

    pintarContextos();
    elegirTab(window.matchMedia('(max-width:1020px)').matches ? 'cliente' : 'cocina');
})();
