// =====================================================================
// Plano de mesas del local (personal): estado, cuenta abierta y cobro
// =====================================================================
const URL_MESAS = API_BASE + "/api/mesas/";
let mesas = [];
let zonaActiva = 'Todas';
let mesaAbierta = null; // id de la mesa con el modal abierto

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
    pintarFiltro();
    pintarMesas();
    if (vistaActual === 'plano') {
        // Si cambiaron las mesas (se agregó, quitó o renombró alguna), el plano se pide ya.
        const firma = mesas.map(m => [m.id, m.nombre, m.zona, m.capacidad].join(':')).join('|');
        cargarPlano(firma !== firmaDeMesas);
        firmaDeMesas = firma;
    }
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
    pintarVista();
}

// ---- Plano del local ----
// El dibujo lo hace plano/vista.js (compilado desde plano-de-mesas/). El plano
// se edita en plano/ (solo administradores) y se lee de /api/mesas/plano; el
// estado de cada mesa sale de la misma lista que la cuadrícula.
let vistaActual = (localStorage.getItem('mesas_vista') === 'plano' && window.PlanoVista) ? 'plano' : 'cuadricula';
let planoDatos = null, planoSucursal = null, planoCargadoEn = 0, planoError = '', firmaDeMesas = '', firmaDelPlanoPintado = '';

function esAdminMesas() {
    try { const u = JSON.parse(localStorage.getItem('usuarioActivo') || 'null'); return !!u && ['admin', 'superadmin'].includes(String(u.rol || '').toLowerCase()); }
    catch (e) { return false; }
}

function elegirVista(v) {
    if (v === 'plano' && !window.PlanoVista) return;
    vistaActual = v;
    localStorage.setItem('mesas_vista', v);
    pintarVista();
    if (v === 'plano') cargarPlano(true);
}

// null = no hay selector de sucursal; '' = "Todas las sucursales"
function sucursalDelFiltro() { const s = document.getElementById('filtroSucursalMesas'); return s ? s.value : null; }

async function cargarPlano(forzar) {
    const suc = sucursalDelFiltro();
    if (suc === '') { planoDatos = null; planoError = ''; planoSucursal = ''; pintarVista(); return; }
    // El dibujo cambia poco: se vuelve a pedir al cambiar las mesas o la sucursal, y si
    // no, cada 30 s (por si alguien movió mesas en el editor desde otro equipo).
    if (!forzar && planoDatos && planoSucursal === suc && Date.now() - planoCargadoEn < 30000) return;
    try {
        // vista=1: incluye las mesas sin sucursal, como la cuadrícula.
        const res = await pedir(URL_MESAS + 'plano?vista=1&t=' + Date.now() + (suc ? '&sucursal=' + suc : ''));
        const d = await res.json().catch(() => ({}));
        if (res.ok) { planoDatos = d; planoError = ''; }
        else { planoDatos = null; planoError = d.detail || 'No se pudo cargar el plano. Actualiza la pantalla e inténtalo de nuevo.'; }
        planoSucursal = suc; planoCargadoEn = Date.now();
    } catch (e) { if (e.message !== 'sesión') planoError = 'No se pudo cargar el plano. Revisa tu internet e inténtalo de nuevo.'; }
    pintarVista();
}

function avisoPlano(texto) {
    firmaDelPlanoPintado = '';
    const p = document.createElement('p');
    p.className = 'text-center text-slate-400 py-16';
    p.setAttribute('role', 'status');
    p.textContent = texto;
    return p;
}

function pintarVista() {
    const enPlano = vistaActual === 'plano';
    [['btn-vista-cuadricula', !enPlano], ['btn-vista-plano', enPlano]].forEach(([id, activo]) => {
        const b = document.getElementById(id); if (!b) return;
        b.setAttribute('aria-pressed', activo ? 'true' : 'false');
        b.classList.toggle('bg-sky-600', activo); b.classList.toggle('text-white', activo);
        b.classList.toggle('bg-slate-800', !activo); b.classList.toggle('text-slate-300', !activo); b.classList.toggle('hover:bg-slate-700', !activo);
    });
    const editar = document.getElementById('btn-editar-plano');
    if (editar) { const ver = esAdminMesas(); editar.classList.toggle('hidden', !ver); editar.classList.toggle('flex', ver); }
    if (!window.PlanoVista) { const b = document.getElementById('btn-vista-plano'); if (b) b.disabled = true; }

    document.getElementById('grid-mesas').classList.toggle('hidden', enPlano);
    const cont = document.getElementById('plano-mesas');
    cont.classList.toggle('hidden', !enPlano);
    if (!enPlano) return;

    if (planoSucursal === '') { cont.replaceChildren(avisoPlano('Elige una sucursal arriba para ver su plano.')); return; }
    if (planoError) { cont.replaceChildren(avisoPlano(planoError)); return; }
    if (!planoDatos) { cont.replaceChildren(avisoPlano('Cargando el plano…')); return; }

    const porId = new Map(mesas.map(m => [m.id, m]));
    const zonas = planoDatos.zonas.filter(z => zonaActiva === 'Todas' || z.nombre.toLowerCase() === String(zonaActiva).toLowerCase());
    if (!zonas.length) { cont.replaceChildren(avisoPlano(esAdminMesas() ? 'Esta zona todavía no está en el plano. Dibújala con «Editar plano».' : 'Esta zona todavía no está en el plano. Pídele a un administrador que la dibuje.')); return; }

    // Cada 8 s llega la lista de mesas: si nada de lo dibujado cambió, no se repinta
    // (repintar haría que el lector de pantalla vuelva a leer la mesa enfocada).
    const firma = JSON.stringify([zonas, zonas.flatMap(z => z.mesas.map(({ id }) => {
        const m = porId.get(id) || {};
        return [id, m.estado, m.consumo, m.capacidad, m.estado && m.estado !== 'libre' ? minutosDesde(m.ocupada_desde) : 0];
    }))]);
    if (firma === firmaDelPlanoPintado && cont.querySelector('svg')) return;
    firmaDelPlanoPintado = firma;

    // Repintar no debe quitarle el foco a quien usa el teclado.
    const enfocada = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-mesa');
    cont.replaceChildren();
    zonas.forEach(z => {
        const seccion = document.createElement('section');
        const titulo = document.createElement('h2');
        titulo.className = 'text-sm font-bold text-slate-300 mb-2';
        titulo.textContent = z.nombre;
        const marco = document.createElement('div');
        // En un teléfono el plano no se encoge hasta volverse ilegible: se desliza de lado.
        marco.className = 'rounded-2xl border border-slate-700 bg-slate-800/60 p-2 overflow-x-auto';
        seccion.append(titulo, marco);
        cont.appendChild(seccion);
        PlanoVista.dibujar(marco, {
            lienzo: planoDatos.lienzo,
            zona: z,
            estadoDe: id => (porId.get(id) || {}).estado || 'libre',
            lineasDe: id => {
                const m = porId.get(id); if (!m) return [];
                return m.estado !== 'libre' ? ['$' + fmt(m.consumo), textoTiempo(minutosDesde(m.ocupada_desde))] : [m.capacidad + ' pers.'];
            },
            alTocar: id => { if (porId.has(id)) abrirModalMesa(id); }
        });
    });
    if (enfocada) { const g = cont.querySelector(`[data-mesa="${CSS.escape(enfocada)}"]`); if (g) g.focus(); }
}

// ---- Cuenta de una mesa ----
let focoAntesDelModal = null;
function abrirModalMesa(id) {
    mesaAbierta = id;
    focoAntesDelModal = document.activeElement;
    const modal = document.getElementById('modal-mesa');
    modal.classList.remove('hidden'); modal.classList.add('flex');
    const cerrar = modal.querySelector('[aria-label="Cerrar"]'); if (cerrar) cerrar.focus();
    refrescarModal();
}
function cerrarModalMesa() {
    const id = mesaAbierta;
    mesaAbierta = null;
    confirmandoCobro = null; errorMesa = ''; cuentaAbierta = null;
    const modal = document.getElementById('modal-mesa');
    if (modal.classList.contains('hidden')) return;
    modal.classList.add('hidden'); modal.classList.remove('flex');
    // El foco vuelve a la mesa desde la que se abrió (en el plano puede haberse repintado).
    let destino = focoAntesDelModal && document.contains(focoAntesDelModal) ? focoAntesDelModal : null;
    if (!destino && id !== null) destino = document.querySelector(`#plano-mesas [data-mesa="${id}"]`);
    if (destino && destino.focus) destino.focus();
    focoAntesDelModal = null;
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
                <p class="text-xs text-slate-300 whitespace-pre-line">${escapeHtml(sinLineaDeServicio(p.pedido_detallado))}</p>
                <p class="text-right text-sm font-bold text-white mt-1.5">$${fmt((p.total_orden || 0) - montoServicio(p))}</p>
            </div>`;
        }).join('');

    pintarDesglose(datos);
    document.getElementById('mm-total').textContent = '$' + fmt(datos.total);
    document.getElementById('mm-total-bs').textContent = datos.total > 0 ? `Bs. ${fmt(datos.total * (datos.tasa_bcv || 1))}` : '';

    cuentaAbierta = datos;
    pintarBotonesMesa();
}

// Los botones de la ventana de la mesa. Se pintan con la última cuenta recibida,
// así la confirmación de cobro y el "Guardando…" aparecen al instante.
let cuentaAbierta = null;
function pintarBotonesMesa() {
    const datos = cuentaAbierta; if (!datos || mesaAbierta !== datos.mesa.id) return;
    const m = datos.mesa;
    const nombreUrl = encodeURIComponent(m.nombre);
    const btn = (clase, texto, accion) => `<button onclick="${accion}" class="${clase} text-white text-sm font-bold py-3 rounded-xl transition">${texto}</button>`;
    let botones = '';
    if (m.estado === 'libre') {
        botones += btn('bg-emerald-600 hover:bg-emerald-500 col-span-2', '➕ Abrir mesa y tomar pedido', `location.href='menu_trabajadores.html?mesa=${nombreUrl}'`);
        botones += btn('bg-slate-600 hover:bg-slate-500 col-span-2', 'Marcar como ocupada (sin pedido todavía)', `cambiarEstado(${m.id}, 'ocupada')`);
    } else {
        botones += btn('bg-emerald-600 hover:bg-emerald-500', '➕ Agregar pedido', `location.href='menu_trabajadores.html?mesa=${nombreUrl}'`);
        // Solo un administrador puede perdonarle el servicio a una mesa (quitarlo es regalar dinero).
        const des = desgloseDeCuenta(datos);
        const botonServicio = esAdminMesas() && (des.servicio > 0 || des.quitado || (servicioMesaCfg && servicioMesaCfg.habilitado))
            ? btn('bg-slate-700 hover:bg-slate-600 col-span-2 border border-slate-500', des.quitado ? '↩ Volver a cobrar el servicio en mesa' : '✂️ Quitarle el servicio a esta mesa', `cambiarServicio(${m.id}, ${des.quitado ? 'false' : 'true'})`)
            : '';
        botones += m.estado === 'ocupada'
            ? btn('bg-fuchsia-600 hover:bg-fuchsia-500', '🧾 Pidió la cuenta', `cambiarEstado(${m.id}, 'cuenta')`)
            : btn('bg-slate-600 hover:bg-slate-500', '↩ Sigue consumiendo', `cambiarEstado(${m.id}, 'ocupada')`);
        botones += botonServicio;
        // Cobrar se confirma aquí mismo, con un segundo toque: la ventana nativa
        // del navegador (confirm) no aparece en algunos navegadores ni dentro de
        // la app instalada, y entonces el botón parecía no hacer nada.
        botones += confirmandoCobro === m.id
            ? `<p class="col-span-2 text-sm text-slate-200 text-center">¿Cobrar <b>$${fmt(datos.total)}</b> y dejar la mesa libre? Los pedidos abiertos se dan por entregados.</p>`
              + btn('bg-slate-600 hover:bg-slate-500', 'Cancelar', 'cancelarCobro()')
              + btn('bg-sky-600 hover:bg-sky-500', `✅ Sí, cobrar $${fmt(datos.total)}`, `confirmarCobro(${m.id})`)
            : btn('bg-sky-600 hover:bg-sky-500 col-span-2', `💵 Cobrar $${fmt(datos.total)} y liberar mesa`, `cobrarYLiberar(${m.id})`);
    }
    if (guardandoMesa) botones = `<p class="col-span-2 text-sm text-slate-300 text-center py-3" role="status"><i class="fa-solid fa-spinner fa-spin"></i> Guardando…</p>`;
    // Solo se reemplazan si cambiaron: la pantalla se pone al día cada pocos segundos, y
    // cambiar un botón justo mientras alguien lo toca hacía que ese toque se perdiera.
    const cont = document.getElementById('mm-botones');
    if (cont.dataset.pintado !== botones) { cont.innerHTML = botones; cont.dataset.pintado = botones; }
    pintarErrorMesa();
}

// Mientras se guarda un cambio, los botones de la mesa se cambian por "Guardando…"
// al instante: el servidor tarda un momento y antes parecía que el toque no había hecho nada.
let guardandoMesa = false, errorMesa = '', confirmandoCobro = null;

function pintarErrorMesa() {
    const cont = document.getElementById('mm-botones'); if (!cont) return;
    let p = document.getElementById('mm-error');
    if (!errorMesa) { if (p) p.remove(); return; }
    if (!p) { p = document.createElement('p'); p.id = 'mm-error'; p.setAttribute('role', 'alert'); p.className = 'text-sm text-red-300 text-center'; cont.after(p); }
    p.textContent = errorMesa;
}

async function cambiarEstado(id, estado) {
    if (guardandoMesa) return false;
    guardandoMesa = true; errorMesa = '';
    if (mesaAbierta === id) pintarBotonesMesa();
    let hecho = false;
    try {
        const res = await pedir(URL_MESAS + 'estado', { method: 'POST', body: JSON.stringify({ id, estado }) });
        if (!res.ok) { const d = await res.json().catch(() => ({})); errorMesa = d.detail || 'No se pudo cambiar la mesa. Inténtalo de nuevo.'; }
        else {
            hecho = true;
            // La mesa cambia de color ya, sin esperar a la siguiente consulta.
            const m = mesas.find(x => x.id === id);
            if (m) { m.estado = estado; if (estado === 'libre') { m.consumo = 0; m.pedidos = 0; } pintarMesas(); }
            if (cuentaAbierta && cuentaAbierta.mesa.id === id) cuentaAbierta.mesa.estado = estado;
        }
    } catch (e) { if (e.message !== 'sesión') errorMesa = 'No se pudo conectar. Revisa tu internet e inténtalo de nuevo.'; }
    guardandoMesa = false;
    if (mesaAbierta === id) pintarBotonesMesa();
    // Lo demás (consumo, tiempo, chips) se pone al día en segundo plano.
    if (hecho) cargarMesas();
    if (!hecho && mesaAbierta !== id && errorMesa) alert(errorMesa);
    return hecho;
}

// ---- Servicio en mesa: desglose en la cuenta y quitarlo a una mesa ----
// El servicio lo suma cada pedido de mesa al crearse (configurable en Administración →
// Mesas). Aquí solo se muestra aparte, y un administrador puede quitárselo a una
// mesa concreta (worker/servicio-por-mesa.mjs).
let servicioMesaCfg = null;
fetch(API_BASE + '/api/servicio-mesa').then(r => r.ok ? r.json() : null).then(d => { servicioMesaCfg = d; }).catch(() => {});

function montoServicio(p) { return (p && p.servicio_mesa && Number(p.servicio_mesa.monto)) || 0; }
function sinLineaDeServicio(texto) {
    return String(texto || '').split('\n').filter(l => !/^1x Servicio en mesa \(/.test(l.trim())).join('\n');
}
function desgloseDeCuenta(datos) {
    let servicio = 0, pct = 0, quitadoPct = 0;
    (datos.pedidos || []).forEach(p => {
        servicio += montoServicio(p);
        if (!pct && p.servicio_mesa && p.servicio_mesa.pct > 0) pct = p.servicio_mesa.pct;
        if (!quitadoPct && p.servicio_mesa && p.servicio_mesa.quitado) quitadoPct = p.servicio_mesa.quitado.pct;
    });
    servicio = Math.round(servicio * 100) / 100;
    const quitado = !!(datos.mesa && datos.mesa.servicio_quitado) || (!!quitadoPct && !servicio);
    return { consumo: Math.round(((datos.total || 0) - servicio) * 100) / 100, servicio, pct, quitado, quitadoPct };
}
function pintarDesglose(datos) {
    const el = document.getElementById('mm-desglose'); if (!el) return;
    const d = desgloseDeCuenta(datos);
    if (!(d.servicio > 0 || d.quitado)) { el.classList.add('hidden'); el.replaceChildren(); return; }
    const fila = (izq, der, clase) => {
        const f = document.createElement('div'); f.className = 'flex justify-between ' + (clase || 'text-slate-300');
        const a = document.createElement('span'); a.textContent = izq;
        const b = document.createElement('span'); b.className = 'tabular-nums'; b.textContent = der;
        f.append(a, b); return f;
    };
    el.replaceChildren(
        fila('Consumo', '$' + fmt(d.consumo)),
        d.quitado
            ? fila('Servicio en mesa: quitado por un administrador', '$' + fmt(0), 'text-slate-400 italic')
            : fila(`Servicio en mesa${d.pct ? ` (${d.pct}%)` : ''}`, '$' + fmt(d.servicio))
    );
    el.classList.remove('hidden');
}

async function cambiarServicio(id, quitar) {
    if (guardandoMesa) return;
    guardandoMesa = true; errorMesa = ''; confirmandoCobro = null;
    pintarBotonesMesa();
    let hecho = false;
    try {
        const res = await pedir(URL_MESAS + 'servicio', { method: 'POST', body: JSON.stringify({ id, quitar }) });
        if (res.ok) hecho = true;
        else { const d = await res.json().catch(() => ({})); errorMesa = d.detail || 'No se pudo cambiar el servicio. Inténtalo de nuevo.'; }
    } catch (e) { if (e.message !== 'sesión') errorMesa = 'No se pudo conectar. Revisa tu internet e inténtalo de nuevo.'; }
    guardandoMesa = false;
    // Cambian los montos: se vuelve a pedir la cuenta antes de pintar.
    if (hecho) { await refrescarModal(); cargarMesas(); } else pintarBotonesMesa();
}

function cobrarYLiberar(id) { confirmandoCobro = id; errorMesa = ''; pintarBotonesMesa(); }
function cancelarCobro() { confirmandoCobro = null; pintarBotonesMesa(); }
async function confirmarCobro(id) {
    confirmandoCobro = null;
    if (await cambiarEstado(id, 'libre')) cerrarModalMesa();
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
