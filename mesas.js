// =====================================================================
// Plano de mesas del local (personal): estado, cuenta abierta y cobro
// =====================================================================
const URL_MESAS = API_BASE + "/api/mesas/";
let mesas = [];
let zonaActiva = 'Todas';
let mesaAbierta = null; // id de la mesa con el modal abierto
let planoMesas = null;  // plano personalizado del local (lo diseña el dueño en Administración → Mesas)

// Esta pantalla es solo para el personal: sin sesión se vuelve al tablero (donde se inicia sesión)
if (!localStorage.getItem('usuarioActivo') || !localStorage.getItem('tokioAuthToken')) {
    window.location.replace('cocina.html');
}

const ESTILOS = {
    libre:   { borde: 'border-emerald-500/40 hover:border-emerald-400', fondo: 'bg-emerald-500/5',  punto: 'bg-emerald-500', texto: 'Libre',           color: 'text-emerald-300' },
    ocupada: { borde: 'border-amber-500/50 hover:border-amber-400',     fondo: 'bg-amber-500/10',   punto: 'bg-amber-500',   texto: 'Ocupada',         color: 'text-amber-300' },
    cuenta:  { borde: 'border-fuchsia-500/60 hover:border-fuchsia-400', fondo: 'bg-fuchsia-500/10', punto: 'bg-fuchsia-500', texto: 'Pidió la cuenta', color: 'text-fuchsia-300' }
};

function fmt(n) { return new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0); }

function ahoraCaracasMs() { return Date.now() - 4 * 3600e3; }
function minutosDesde(iso) {
    if (!iso) return 0;
    const t = Date.parse(String(iso).replace(/Z$/, '') + 'Z');
    return isNaN(t) ? 0 : Math.max(0, Math.round((ahoraCaracasMs() - t) / 60000));
}
function textoTiempo(min) { return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`; }

async function pedir(url, opciones) {
    const res = await fetch(url, Object.assign({ headers: authHeaders() }, opciones || {}));
    if (res.status === 401) { localStorage.removeItem('usuarioActivo'); localStorage.removeItem('tokioAuthToken'); window.location.replace('cocina.html'); throw new Error('sesión'); }
    return res;
}


// ---- Sucursales: el dueño elige cuál ver; el empleado ve solo la suya ----
let sucursalesLista = [];
async function prepararFiltroSucursalMesas() {
    let u = null; try { u = JSON.parse(localStorage.getItem('usuarioActivo') || 'null'); } catch (e) {}
    try { const r = await fetch(API_BASE + '/api/sitio'); sucursalesLista = ((await r.json()).sucursales || []).filter(s => s.activa !== false); } catch (e) {}
    if (sucursalesLista.length < 2 || !u) return;
    const zonas = document.getElementById('filtro-zonas'); if (!zonas) return;
    if (u.sucursal_id) {
        const s = sucursalesLista.find(x => Number(x.id) === Number(u.sucursal_id));
        const e = document.createElement('div'); e.className = 'max-w-[98%] mx-auto mt-3 text-sm font-bold text-amber-300';
        e.textContent = '📍 ' + (s ? s.nombre : 'Mi sucursal'); zonas.parentElement.insertBefore(e, zonas); return;
    }
    const sel = document.createElement('select'); sel.id = 'filtroSucursalMesas';
    sel.className = 'max-w-[98%] mx-auto mt-3 block bg-slate-700 text-slate-100 text-sm font-semibold border border-slate-600 rounded-lg px-3 h-10 cursor-pointer';
    sel.innerHTML = '<option value="">📍 Todas las sucursales</option>' + sucursalesLista.map(s => '<option value="' + s.id + '">' + escapeHtml(s.nombre) + '</option>').join('');
    sel.value = localStorage.getItem('filtro_sucursal') || '';
    sel.onchange = () => { localStorage.setItem('filtro_sucursal', sel.value); cargarMesas(); };
    zonas.parentElement.insertBefore(sel, zonas);
    cargarMesas();
}
function nombreSucursal(id) { const s = sucursalesLista.find(x => Number(x.id) === Number(id)); return s ? s.nombre : ''; }

async function cargarMesas() {
    try {
        const filtroSuc = document.getElementById('filtroSucursalMesas') ? document.getElementById('filtroSucursalMesas').value : '';
        const res = await pedir(URL_MESAS + '?t=' + Date.now() + (filtroSuc ? '&sucursal=' + filtroSuc : ''));
        const datos = await res.json();
        mesas = Array.isArray(datos) ? datos : [];
    } catch (e) { if (e.message !== 'sesión') console.error(e); return; }
    try {
        const filtroSuc2 = document.getElementById('filtroSucursalMesas') ? document.getElementById('filtroSucursalMesas').value : '';
        const rp = await pedir(URL_MESAS + 'plano?t=' + Date.now() + (filtroSuc2 ? '&sucursal=' + filtroSuc2 : ''));
        const dp = rp.ok ? await rp.json() : null;
        planoMesas = dp && dp.success ? dp : null;
    } catch (e) { planoMesas = null; }
    pintarFiltro();
    pintarMesas();
    if (mesaAbierta !== null) refrescarModal();
}

function pintarFiltro() {
    const zonas = ['Todas', ...new Set(mesas.map(m => m.zona))];
    if (!zonas.includes(zonaActiva)) zonaActiva = 'Todas';
    document.getElementById('filtro-zonas').innerHTML = zonas.map(z =>
        `<button onclick="elegirZona('${escapeHtml(z).replace(/'/g, "\\'")}')" class="text-xs font-bold px-3 py-1.5 rounded-full border transition ${z === zonaActiva ? 'bg-sky-600 border-sky-500 text-white' : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'}">${escapeHtml(z)}</button>`).join('');
}
function elegirZona(z) { zonaActiva = z; pintarFiltro(); pintarMesas(); }

function pintarMesas() {
    const libres = mesas.filter(m => m.estado === 'libre').length;
    const ocupadas = mesas.filter(m => m.estado === 'ocupada').length;
    const cuenta = mesas.filter(m => m.estado === 'cuenta').length;
    document.getElementById('chip-libres').textContent = `${libres} libre${libres === 1 ? '' : 's'}`;
    document.getElementById('chip-ocupadas').textContent = `${ocupadas} ocupada${ocupadas === 1 ? '' : 's'}`;
    document.getElementById('chip-cuenta').textContent = `${cuenta} ${cuenta === 1 ? 'pide' : 'piden'} la cuenta`;

    const vista = vistaMesasActual();
    pintarSelectorVista();
    document.getElementById('plano-wrap').classList.toggle('hidden', vista !== 'plano');
    document.getElementById('grid-mesas').classList.toggle('hidden', vista === 'plano');
    if (vista === 'plano') { pintarPlano(); document.getElementById('vacio').classList.toggle('hidden', mesas.length > 0); return; }

    const visibles = mesas.filter(m => zonaActiva === 'Todas' || m.zona === zonaActiva);
    document.getElementById('vacio').classList.toggle('hidden', mesas.length > 0);
    document.getElementById('grid-mesas').innerHTML = visibles.map(m => {
        const e = ESTILOS[m.estado] || ESTILOS.libre;
        const enUso = m.estado !== 'libre';
        return `
        <button onclick="abrirModalMesa(${m.id})" class="text-left rounded-2xl border-2 ${e.borde} ${e.fondo} p-4 transition flex flex-col gap-2 min-h-[132px]">
            <div class="flex items-start justify-between gap-2">
                <h3 class="font-black text-lg text-white leading-tight">${escapeHtml(m.nombre)}</h3>
                <span class="w-3 h-3 rounded-full ${e.punto} mt-1.5 flex-shrink-0"></span>
            </div>
            <p class="text-[11px] text-slate-400"><i class="fa-solid fa-users"></i> ${m.capacidad} · ${escapeHtml(m.zona)}${(sucursalesLista.length > 1 && m.sucursal_id) ? ' · 📍 ' + escapeHtml(nombreSucursal(m.sucursal_id)) : ''}</p>
            <div class="mt-auto">
                <p class="text-xs font-bold ${e.color}">${e.texto}</p>
                ${enUso ? `<p class="text-sm font-black text-white">$${fmt(m.consumo)} <span class="text-[11px] font-medium text-slate-400">· ${m.pedidos || 0} pedido${m.pedidos === 1 ? '' : 's'} · ${textoTiempo(minutosDesde(m.ocupada_desde))}</span></p>` : '<p class="text-[11px] text-slate-500">Toca para abrirla</p>'}
            </div>
        </button>`;
    }).join('');
}

// ---- Vista: por defecto (cuadrícula) o plano personalizado ----
// Lo que el dueño eligió en Administración es lo que se ve; en este equipo se puede cambiar de vista con el selector.
function planoAplicable() { return !!(planoMesas && planoMesas.aplicable && planoMesas.ubicadas > 0); }
function claveVista() { return 'vistaMesas:' + (planoMesas ? planoMesas.clave + ':' + planoMesas.modo : ''); }
function vistaMesasActual() {
    if (!planoAplicable()) return 'cuadricula';
    let pref = null; try { pref = localStorage.getItem(claveVista()); } catch (e) {}
    return pref === 'plano' || pref === 'cuadricula' ? pref : (planoMesas.modo === 'personalizado' ? 'plano' : 'cuadricula');
}
function elegirVista(v) { try { localStorage.setItem(claveVista(), v); } catch (e) {} pintarMesas(); }
function pintarSelectorVista() {
    const t = document.getElementById('toggle-vista'); if (!t) return;
    t.classList.toggle('hidden', !planoAplicable());
    const v = vistaMesasActual();
    [['vista-cuadricula', 'cuadricula'], ['vista-plano', 'plano']].forEach(([id, val]) => {
        const b = document.getElementById(id); if (!b) return;
        b.className = 'px-3 h-10 flex items-center gap-1.5 transition ' + (v === val ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700');
    });
}
function pintarPlano() {
    const pl = planoMesas, cont = document.getElementById('plano-mesas');
    cont.style.cssText = PLANO.estiloLienzo(pl);
    const piezas = pl.elementos.map(el => PLANO.htmlElemento(el, pl)).join('');
    const ubicadas = mesas.filter(m => pl.mesas[m.id]);
    const sinUbicar = mesas.filter(m => !pl.mesas[m.id]);
    const sillas = ubicadas.map(m => {
        const atenuada = zonaActiva !== 'Todas' && m.zona !== zonaActiva;
        return PLANO.htmlSillas(pl.mesas[m.id], pl, m.capacidad, m.estado || 'libre', m.id, atenuada ? 'atenuada' : '');
    }).join('');
    const botones = ubicadas.map(m => {
        const c = pl.mesas[m.id], enUso = m.estado !== 'libre';
        const atenuada = zonaActiva !== 'Todas' && m.zona !== zonaActiva;
        return `<button onclick="abrirModalMesa(${m.id})" class="pl-mesa ${c.forma === 'redonda' ? 'redonda' : 'cuadrada'} est-${m.estado || 'libre'}${atenuada ? ' atenuada' : ''}" style="${PLANO.estiloPos(c, pl)}" title="${PLANO.esc(m.nombre)} · ${m.capacidad} personas · ${(ESTILOS[m.estado] || ESTILOS.libre).texto}">
            <span class="pl-nombre">${PLANO.esc(m.nombre)}</span>
            <span class="pl-sub">👥 ${m.capacidad}</span>
            ${enUso ? `<span class="pl-cons">$${fmt(m.consumo)}</span>` : ''}
        </button>`;
    }).join('');
    cont.innerHTML = piezas + sillas + botones;
    document.getElementById('plano-sin-ubicar').innerHTML = sinUbicar.length
        ? '<span class="font-bold text-slate-300">Mesas sin ubicar en el plano:</span>' + sinUbicar.map(m => `<button onclick="abrirModalMesa(${m.id})" class="px-3 py-1.5 rounded-full border border-slate-600 bg-slate-800 text-slate-200 font-bold hover:bg-slate-700">${PLANO.esc(m.nombre)}</button>`).join('')
        : '';
}

// ---- Cuenta de una mesa ----
function abrirModalMesa(id) {
    mesaAbierta = id;
    const modal = document.getElementById('modal-mesa');
    modal.classList.remove('hidden'); modal.classList.add('flex');
    refrescarModal();
}
function cerrarModalMesa() {
    mesaAbierta = null;
    const modal = document.getElementById('modal-mesa');
    modal.classList.add('hidden'); modal.classList.remove('flex');
}

const COLOR_ESTADO = { 'Pago Pendiente': 'bg-amber-500/20 text-amber-300', 'En Cocina': 'bg-orange-500/20 text-orange-300', 'Finalizado': 'bg-emerald-500/20 text-emerald-300', 'Cancelado': 'bg-red-500/20 text-red-300' };

async function refrescarModal() {
    const id = mesaAbierta; if (id === null) return;
    let datos;
    try { const res = await pedir(`${URL_MESAS}cuenta?id=${id}&t=${Date.now()}`); if (!res.ok) { cerrarModalMesa(); return; } datos = await res.json(); }
    catch (e) { return; }
    if (mesaAbierta !== id) return;

    const m = datos.mesa, e = ESTILOS[m.estado] || ESTILOS.libre;
    document.getElementById('mm-titulo').textContent = m.nombre;
    document.getElementById('mm-sub').innerHTML = `<span class="${e.color} font-bold">${e.texto}</span> · ${escapeHtml(m.zona)} · ${m.capacidad} personas` + (m.estado !== 'libre' ? ` · abierta hace ${textoTiempo(minutosDesde(m.ocupada_desde))}` : '');

    const cont = document.getElementById('mm-pedidos');
    cont.innerHTML = datos.pedidos.length === 0
        ? '<p class="text-sm text-slate-400 text-center py-6">Todavía no hay pedidos en esta mesa.</p>'
        : datos.pedidos.map((p, i) => {
            const hora = String(p.timestamp || '').slice(11, 16);
            return `<div class="bg-slate-900/60 border border-slate-700 rounded-xl p-3">
                <div class="flex items-center justify-between mb-1.5">
                    <span class="text-xs font-bold text-slate-300">Pedido ${i + 1} · ${hora}</span>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${COLOR_ESTADO[p.estado] || 'bg-slate-600 text-slate-200'}">${escapeHtml(p.estado)}</span>
                </div>
                <p class="text-xs text-slate-300 whitespace-pre-line">${escapeHtml(p.pedido_detallado || '')}</p>
                <p class="text-right text-sm font-bold text-white mt-1.5">$${fmt(p.total_orden)}</p>
            </div>`;
        }).join('');

    document.getElementById('mm-total').textContent = '$' + fmt(datos.total);
    document.getElementById('mm-total-bs').textContent = datos.total > 0 ? `Bs. ${fmt(datos.total * (datos.tasa_bcv || 1))}` : '';

    const nombreUrl = encodeURIComponent(m.nombre);
    const btn = (clase, texto, accion) => `<button onclick="${accion}" class="${clase} text-white text-sm font-bold py-3 rounded-xl transition">${texto}</button>`;
    let botones = '';
    if (m.estado === 'libre') {
        botones += btn('bg-emerald-600 hover:bg-emerald-500 col-span-2', '➕ Abrir mesa y tomar pedido', `location.href='menu_trabajadores.html?mesa=${nombreUrl}'`);
        botones += btn('bg-slate-600 hover:bg-slate-500 col-span-2', 'Marcar como ocupada (sin pedido todavía)', `cambiarEstado(${m.id}, 'ocupada')`);
    } else {
        botones += btn('bg-emerald-600 hover:bg-emerald-500', '➕ Agregar pedido', `location.href='menu_trabajadores.html?mesa=${nombreUrl}'`);
        botones += m.estado === 'ocupada'
            ? btn('bg-fuchsia-600 hover:bg-fuchsia-500', '🧾 Pidió la cuenta', `cambiarEstado(${m.id}, 'cuenta')`)
            : btn('bg-slate-600 hover:bg-slate-500', '↩ Sigue consumiendo', `cambiarEstado(${m.id}, 'ocupada')`);
        botones += btn('bg-sky-600 hover:bg-sky-500 col-span-2', `💵 Cobrar $${fmt(datos.total)} y liberar mesa`, `cobrarYLiberar(${m.id}, ${datos.total})`);
    }
    document.getElementById('mm-botones').innerHTML = botones;
}

async function cambiarEstado(id, estado) {
    try {
        const res = await pedir(URL_MESAS + 'estado', { method: 'POST', body: JSON.stringify({ id, estado }) });
        if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.detail || 'No se pudo cambiar la mesa.'); return; }
        await cargarMesas();
    } catch (e) { if (e.message !== 'sesión') alert('Error de red al intentar conectar con el servidor.'); }
}

async function cobrarYLiberar(id, total) {
    if (!confirm(`¿Cobrar $${fmt(total)} y dejar la mesa libre?`)) return;
    await cambiarEstado(id, 'libre');
    cerrarModalMesa();
}

// ---- Arranque y tiempo real ----
window.addEventListener('load', () => {
    cargarMesas();
    prepararFiltroSucursalMesas();
    if (typeof Pusher !== 'undefined') {
        const canal = new Pusher('demo', { cluster: 'demo' }).subscribe('canal-cocina');
        canal.bind('actualizar-tablero', () => cargarMesas());
    }
    setInterval(cargarMesas, 8000);
});
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') cerrarModalMesa(); });
