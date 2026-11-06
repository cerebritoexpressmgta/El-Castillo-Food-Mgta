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
                <p style="font-size:12px;opacity:.7">${escapeHtml(m.zona)} · ${m.capacidad} personas · ${m.estado}</p>
            </div>
            <div class="item-actions">
                <button class="action-btn" title="Copiar enlace del QR" onclick="copiarEnlaceMesa(${m.id})">🔗</button>
                <button class="action-btn btn-edit" onclick="editarMesa(${m.id})" title="Editar">✏️</button>
                <button class="action-btn btn-delete" onclick="eliminarMesa(${m.id})" title="Eliminar">🗑️</button>
            </div>
        </div>`).join('');
}

function copiarEnlaceMesa(id) {
    const m = MESAS_ADMIN.find(x => x.id === id); if (!m) return;
    const base = location.href.replace(/[^/]*$/, '') + 'menu.html?mesa=' + encodeURIComponent(m.nombre);
    (navigator.clipboard ? navigator.clipboard.writeText(base) : Promise.reject()).then(() => alert('Enlace copiado:\n' + base)).catch(() => prompt('Copia este enlace para el QR de la mesa:', base));
}

function editarMesa(id) {
    const m = MESAS_ADMIN.find(x => x.id === id); if (!m) return;
    document.getElementById('mesa-id').value = m.id;
    document.getElementById('mesa-nombre').value = m.nombre;
    document.getElementById('mesa-zona').value = m.zona;
    document.getElementById('mesa-capacidad').value = m.capacidad;
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
            capacidad: parseInt(document.getElementById('mesa-capacidad').value, 10) || 4
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
