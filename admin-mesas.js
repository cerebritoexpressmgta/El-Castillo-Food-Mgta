// =====================================================================
// Administración: pestaña "Mesas" + desbloqueo automático de la demo embebida
// =====================================================================
// Va después de admin.js y reutiliza sus estilos y su token en memoria.
const ADMIN_URL_MESAS = API_BASE + "/api/mesas/";
let MESAS_ADMIN = [];

async function cargarMesasAdmin() {
    try {
        const res = await fetch(ADMIN_URL_MESAS + '?t=' + Date.now(), { headers: authHeaders() });
        const datos = await res.json();
        MESAS_ADMIN = Array.isArray(datos) ? datos : [];
    } catch (e) { MESAS_ADMIN = []; }
    renderListaMesas();
}

function renderListaMesas() {
    const cont = document.getElementById('lista-mesas-container');
    if (!cont) return;
    const zonas = [...new Set(MESAS_ADMIN.map(m => m.zona))];
    const dl = document.getElementById('lista-zonas-mesa');
    if (dl) dl.innerHTML = zonas.map(z => `<option value="${escapeHtml(z)}">`).join('');
    if (MESAS_ADMIN.length === 0) { cont.innerHTML = '<p class="text-sm text-slate-500 italic">No hay mesas registradas.</p>'; return; }
    const colores = { libre: '🟢', ocupada: '🟠', cuenta: '🟣' };
    cont.innerHTML = MESAS_ADMIN.map(m => `
        <div class="list-item">
            <div class="item-info">
                <p class="item-title">${colores[m.estado] || '⚪'} ${escapeHtml(m.nombre)}</p>
                <p style="font-size:12px;opacity:.7">${escapeHtml(m.zona)} · ${m.capacidad} personas · ${m.estado}${m.sucursal_id && typeof nombreSucursalAdmin === 'function' && nombreSucursalAdmin(m.sucursal_id) ? ' · 📍 ' + escapeHtml(nombreSucursalAdmin(m.sucursal_id)) : ''}</p>
            </div>
            <div class="item-actions">
                <button class="action-btn" title="Copiar enlace del QR" onclick="copiarEnlaceMesa(${m.id})">🔗</button>
                <button class="action-btn btn-qr${m.qr_url ? ' tiene-qr' : ''}" title="Código QR de la mesa" onclick="abrirQrMesa(${m.id})">📱 Código QR</button>
                <button class="action-btn btn-edit" onclick="editarMesa(${m.id})" title="Editar">✏️</button>
                <button class="action-btn btn-delete" onclick="eliminarMesa(${m.id})" title="Eliminar">🗑️</button>
            </div>
        </div>`).join('');
}

function copiarEnlaceMesa(id) {
    const m = MESAS_ADMIN.find(x => x.id === id); if (!m) return;
    const base = location.href.replace(/[^/]*$/, '') + 'menu.html?mesa=' + encodeURIComponent(m.nombre) + (m.sucursal_id ? '&sucursal=' + m.sucursal_id : '');
    (navigator.clipboard ? navigator.clipboard.writeText(base) : Promise.reject()).then(() => alert('Enlace copiado:\n' + base)).catch(() => prompt('Copia este enlace para el QR de la mesa:', base));
}

function editarMesa(id) {
    const m = MESAS_ADMIN.find(x => x.id === id); if (!m) return;
    document.getElementById('mesa-id').value = m.id;
    document.getElementById('mesa-nombre').value = m.nombre;
    document.getElementById('mesa-zona').value = m.zona;
    document.getElementById('mesa-capacidad').value = m.capacidad;
    if (document.getElementById('mesa-sucursal')) document.getElementById('mesa-sucursal').value = m.sucursal_id || '';
    document.getElementById('titulo-form-mesa').innerText = 'Editar Mesa';
    document.getElementById('btn-cancel-mesa').style.display = 'block';
}

function resetFormMesa() {
    document.getElementById('form-mesa').reset();
    document.getElementById('mesa-id').value = '';
    document.getElementById('titulo-form-mesa').innerText = 'Agregar Mesa';
    document.getElementById('btn-cancel-mesa').style.display = 'none';
}

async function eliminarMesa(id) {
    if (!confirm('¿Eliminar esta mesa?')) return;
    try {
        const res = await fetch(API_BASE + '/api/mesas/eliminar', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ id }) });
        const data = await res.json();
        if (!data.success) { alert(data.error || 'No se pudo eliminar la mesa.'); return; }
        await cargarMesasAdmin();
    } catch (e) { alert('Error de red al intentar conectar con el servidor.'); }
}

if (document.getElementById('form-mesa')) {
    document.getElementById('form-mesa').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('mesa-id').value;
        const payload = {
            id: id ? parseInt(id, 10) : null,
            nombre: document.getElementById('mesa-nombre').value.trim(),
            zona: document.getElementById('mesa-zona').value.trim(),
            capacidad: parseInt(document.getElementById('mesa-capacidad').value, 10) || 4,
            sucursal_id: parseInt((document.getElementById('mesa-sucursal') || {}).value, 10) || null
        };
        try {
            const res = await fetch(API_BASE + '/api/mesas/guardar', { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
            const data = await res.json();
            if (!data.success) { alert(data.error || 'No se pudo guardar la mesa.'); return; }
            resetFormMesa();
            await cargarMesasAdmin();
        } catch (err) { alert('Error de red al intentar conectar con el servidor.'); }
    });
    resetFormMesa();
}

// Cada vez que admin.js carga sus datos (al desbloquear), se cargan también las mesas
const _cargarDatosAdminOriginal = window.cargarDatosAdmin;
if (typeof _cargarDatosAdminOriginal === 'function') {
    window.cargarDatosAdmin = async function () {
        const r = await _cargarDatosAdminOriginal.apply(this, arguments);
        cargarMesasAdmin();
        return r;
    };
}


// =====================================================================
// Código QR por mesa: subir, ver, editar (reemplazar), quitar, compartir, imprimir y descargar.
// El sistema NO genera el código: el dueño sube la imagen que generó por su cuenta.
// =====================================================================
(function () {
    var st = document.createElement('style');
    st.textContent = '.btn-qr{width:auto!important;padding:0 10px!important;font-size:12px!important;font-weight:700;white-space:nowrap;gap:4px}' +
        '.btn-qr.tiene-qr{background:rgba(16,185,129,.25)!important;border-color:#10b981!important}' +
        '#qr-modal{position:fixed;inset:0;z-index:2147483100;background:rgba(0,0,0,.7);display:none;align-items:center;justify-content:center;padding:16px}' +
        '#qr-modal.abierto{display:flex}' +
        '#qr-caja{background:#1e2a4a;color:#e5eaf3;border:1px solid #475a8a;border-radius:16px;width:100%;max-width:420px;max-height:92vh;overflow:auto;padding:18px;text-align:center;font-family:system-ui,sans-serif}' +
        '#qr-caja h3{margin:0 0 4px;font-size:18px}#qr-caja small{opacity:.75;display:block;margin-bottom:12px;word-break:break-all}' +
        '#qr-img-wrap{background:#fff;border-radius:12px;padding:10px;min-height:120px;display:flex;align-items:center;justify-content:center;margin-bottom:12px}' +
        '#qr-img-wrap img{max-width:100%;max-height:300px;display:block}#qr-vacio{color:#475569;font-size:13px}' +
        '.qr-acciones{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
        '.qr-acciones button{padding:11px 8px;border:0;border-radius:10px;background:#3a5086;color:#fff;font-weight:700;font-size:13px;cursor:pointer}' +
        '.qr-acciones button.pri{background:#e11d48}.qr-acciones button.pel{background:#7f1d1d}.qr-acciones button[disabled]{opacity:.4;cursor:not-allowed}' +
        '.qr-acciones .ancho{grid-column:1/-1}#qr-msg{font-size:12px;min-height:16px;margin-top:10px;color:#fbbf24}';
    document.head.appendChild(st);

    var qrMesaId = null;
    function mesaQr() { return MESAS_ADMIN.find(function (x) { return x.id === qrMesaId; }); }
    function $(id) { return document.getElementById(id); }
    function msg(t) { $('qr-msg').textContent = t || ''; }

    function crearModal() {
        if ($('qr-modal')) return;
        var d = document.createElement('div'); d.id = 'qr-modal';
        d.innerHTML = '<div id="qr-caja" role="dialog" aria-modal="true">' +
            '<h3 id="qr-titulo">Código QR</h3><small id="qr-sub"></small>' +
            '<div id="qr-img-wrap"><img id="qr-img" alt="Código QR de la mesa" style="display:none"><span id="qr-vacio">Esta mesa aún no tiene código QR.</span></div>' +
            '<div class="qr-acciones">' +
            '<button class="pri ancho" id="qr-subir" type="button">⬆️ Subir código QR</button>' +
            '<button id="qr-ver" type="button">🔍 Ver</button>' +
            '<button id="qr-compartir" type="button">📤 Compartir</button>' +
            '<button id="qr-imprimir" type="button">🖨️ Imprimir</button>' +
            '<button id="qr-descargar" type="button">💾 Descargar</button>' +
            '<button class="pel" id="qr-quitar" type="button">🗑️ Quitar</button>' +
            '<button class="ancho" id="qr-cerrar" type="button">Cerrar</button>' +
            '</div><div id="qr-msg"></div>' +
            '<input type="file" id="qr-file" accept="image/png,image/jpeg,image/webp" style="display:none"></div>';
        document.body.appendChild(d);
        d.addEventListener('click', function (e) { if (e.target === d) cerrarQr(); });
        $('qr-cerrar').onclick = cerrarQr;
        $('qr-subir').onclick = function () { $('qr-file').click(); };
        $('qr-file').onchange = function (e) { var f = e.target.files[0]; e.target.value = ''; if (f) subirQr(f); };
        $('qr-ver').onclick = function () { var m = mesaQr(); if (m && m.qr_url) window.open(m.qr_url, '_blank', 'noopener'); };
        $('qr-imprimir').onclick = imprimirQr;
        $('qr-descargar').onclick = descargarQr;
        $('qr-compartir').onclick = compartirQr;
        $('qr-quitar').onclick = quitarQr;
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarQr(); });
    }

    function pintarQr() {
        var m = mesaQr(); if (!m) return;
        $('qr-titulo').textContent = 'Código QR · ' + m.nombre;
        $('qr-sub').textContent = m.zona + ' · menu.html?mesa=' + m.nombre;
        var tiene = !!m.qr_url, img = $('qr-img');
        if (tiene) img.src = m.qr_url; else img.removeAttribute('src');
        img.style.display = tiene ? 'block' : 'none';
        $('qr-vacio').style.display = tiene ? 'none' : 'block';
        $('qr-subir').textContent = tiene ? '✏️ Cambiar código QR' : '⬆️ Subir código QR';
        ['qr-ver', 'qr-compartir', 'qr-imprimir', 'qr-descargar', 'qr-quitar'].forEach(function (id) { $(id).disabled = !tiene; });
    }

    window.abrirQrMesa = function (id) { crearModal(); qrMesaId = id; msg(''); pintarQr(); $('qr-modal').classList.add('abierto'); };
    function cerrarQr() { var m = $('qr-modal'); if (m) m.classList.remove('abierto'); qrMesaId = null; }

    function leerComoDataUrl(archivo) {
        return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(archivo); });
    }
    function reducirSiHaceFalta(dataUrl) {
        if (dataUrl.length < 1.3 * 1024 * 1024) return Promise.resolve(dataUrl);
        return new Promise(function (res, rej) {
            var im = new Image();
            im.onload = function () {
                var k = Math.min(1, 1200 / Math.max(im.width, im.height)), c = document.createElement('canvas');
                c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
                var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
                res(c.toDataURL('image/png'));
            };
            im.onerror = rej; im.src = dataUrl;
        });
    }
    async function guardarUrlQr(id, url) {
        var res = await fetch(API_BASE + '/api/mesas/qr', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ id: id, qr_url: url }) });
        var data = await res.json();
        if (!data.success) throw new Error(data.error || 'No se pudo guardar el QR.');
    }
    async function subirQr(archivo) {
        var m = mesaQr(); if (!m) return;
        if (!/^image\/(png|jpeg|webp)$/.test(archivo.type)) { msg('Usa una imagen PNG, JPG o WebP.'); return; }
        try {
            msg('Subiendo…');
            var imagen = await reducirSiHaceFalta(await leerComoDataUrl(archivo));
            var res = await fetch(API_BASE + '/api/subir-imagen', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ imagen: imagen }) });
            var r = await res.json();
            if (!r.success) throw new Error(r.detail || 'No se pudo subir la imagen.');
            await guardarUrlQr(m.id, r.data.url);
            await cargarMesasAdmin();
            pintarQr(); msg('✅ Código QR guardado.');
        } catch (e) { msg('Error: ' + e.message); }
    }
    async function quitarQr() {
        var m = mesaQr(); if (!m || !confirm('¿Quitar el código QR de ' + m.nombre + '?')) return;
        try { await guardarUrlQr(m.id, ''); await cargarMesasAdmin(); pintarQr(); msg('Código QR eliminado.'); }
        catch (e) { msg('Error: ' + e.message); }
    }
    function imprimirQr() {
        var m = mesaQr(); if (!m || !m.qr_url) return;
        var w = window.open('', '_blank'); if (!w) { msg('Permite las ventanas emergentes para imprimir.'); return; }
        var t = escapeHtml(m.nombre);
        w.document.write('<!doctype html><title>QR ' + t + '</title><style>body{margin:0;font-family:system-ui,sans-serif;text-align:center;padding:30px}img{width:80mm;max-width:100%;display:block;margin:12px auto}h1{margin:0;font-size:28px}p{margin:4px 0;color:#444}</style>' +
            '<h1>' + t + '</h1><p>Escanea para ver el menú y pedir</p><img id="q" src="' + escapeHtml(m.qr_url) + '">');
        w.document.close();
        var im = w.document.getElementById('q');
        var lanzar = function () { w.focus(); w.print(); };
        if (im.complete) lanzar(); else { im.onload = lanzar; im.onerror = function () { w.close(); msg('No se pudo cargar la imagen para imprimir.'); }; }
    }
    async function descargarQr() {
        var m = mesaQr(); if (!m || !m.qr_url) return;
        var nombre = 'qr-' + m.nombre.replace(/[^\w-]+/g, '_') + '.png';
        try {
            var blob = await (await fetch(m.qr_url)).blob(), a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
        } catch (e) { window.open(m.qr_url, '_blank', 'noopener'); msg('Se abrió la imagen: mantén pulsado o clic derecho para guardarla.'); }
    }
    async function compartirQr() {
        var m = mesaQr(); if (!m || !m.qr_url) return;
        try {
            var blob = await (await fetch(m.qr_url)).blob();
            var arch = new File([blob], 'qr-' + m.nombre.replace(/[^\w-]+/g, '_') + '.png', { type: blob.type || 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [arch] })) { await navigator.share({ files: [arch], title: 'QR ' + m.nombre }); return; }
        } catch (e) { if (e && e.name === 'AbortError') return; }
        try {
            if (navigator.share) { await navigator.share({ title: 'QR ' + m.nombre, url: m.qr_url }); return; }
            await navigator.clipboard.writeText(m.qr_url); msg('Enlace de la imagen copiado.');
        } catch (e) { if (!e || e.name !== 'AbortError') prompt('Copia el enlace de la imagen del QR:', m.qr_url); }
    }
})();
