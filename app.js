// =====================================================================
// Prototipo Comida Rápida - Núcleo de Operaciones y Control del Sistema (app.js)
// =====================================================================

const URL_OBTENER_MOTORIZADOS = API_BASE + "/api/motorizados/";
const API_OBTENER_PEDIDOS = API_BASE + "/api/pedidos/";
const API_ACTUALIZAR_ESTADO = API_BASE + "/api/pedidos/actualizar-estado";
const URL_OBTENER_USUARIOS = API_BASE + "/api/usuarios/";

let MOTORIZADOS_SISTEMA = []; 
let USUARIOS_SISTEMA = [];
let inventarioProductosBase = []; 
let usuarioActivo = null;
let pedidosEnMemoria = [];

let resolveTiempoEstimado = null; 

// El boton "Nuevo Pedido" del tablero ya no abre un formulario aqui: lleva al
// menu de trabajadores (menu_trabajadores.html), que es el mismo menu del cliente
// adaptado a la caja y con la personalizacion de combos incluida.
function irAMenuTrabajadores() {
    window.location.href = 'menu_trabajadores.html';
}

async function cargarMotorizadosDesdeDB() {
    // Funcion apagada desde config.js: no se pide nada al backend.
    if (typeof FUNCION_MOTORIZADOS !== "undefined" && !FUNCION_MOTORIZADOS) return;
    try {
        const response = await fetch(URL_OBTENER_MOTORIZADOS + "?t=" + new Date().getTime(), { headers: authHeaders() });
        if (!response.ok) throw new Error('Error al conectar con servidor de motorizados');
        const data = await response.json();
        MOTORIZADOS_SISTEMA = Array.isArray(data) ? data : (data.data || []);
        
        // Escudo de seguridad para el Admin
        if (document.getElementById('lista-motorizados-container') && typeof renderListaMotorizados === 'function') {
            renderListaMotorizados();
        }
    } catch (error) { console.error("Error obteniendo motorizados:", error); }
}

// ---- Tasa BCV automática: etiqueta, aviso al abrir y respaldo ----
function hoyCaracasTexto() { return new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10); }
function formatoBsTasa(n) { return new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); }

function pintarOrigenTasa(info) {
    const el = document.getElementById('tasaOrigen');
    if (!el || !info) return;
    const auto = info.fuente === 'bcv' || info.fuente === 'dolarapi';
    el.textContent = auto ? '🏦 BCV' : '✍️ Manual';
    el.className = 'ml-2 text-[10px] font-bold whitespace-nowrap ' + (auto ? 'text-emerald-400' : 'text-amber-400');
    el.title = (auto ? 'Tomada automáticamente del Banco Central de Venezuela' : 'Escrita a mano') + (info.actualizado ? ' · ' + String(info.actualizado).replace('T', ' ').slice(0, 16) : '') + (info.auto ? '' : ' · Actualización automática apagada');
}

function mostrarAvisoTasa(html, clase, ms) {
    let el = document.getElementById('avisoTasaBcv');
    if (!el) {
        el = document.createElement('div');
        el.id = 'avisoTasaBcv';
        const cab = document.querySelector('header');
        if (cab) cab.insertAdjacentElement('afterend', el); else document.body.prepend(el);
    }
    el.className = 'mx-6 mt-3 px-4 py-2.5 rounded-lg border text-sm font-semibold flex items-center justify-between gap-3 ' + clase;
    el.innerHTML = '<span>' + html + '</span><button type="button" class="opacity-70 hover:opacity-100 text-lg leading-none" onclick="this.parentElement.remove()" title="Cerrar">&times;</button>';
    if (ms) setTimeout(() => { if (el.isConnected) el.remove(); }, ms);
}

// Al abrir la página: si la tasa se actualizó sola, se avisa una vez (por equipo); si falló, se advierte.
function avisarTasaBcv(info) {
    const hoy = hoyCaracasTexto();
    const auto = info.fuente === 'bcv' || info.fuente === 'dolarapi';
    if (info.error && info.fecha !== hoy) {
        mostrarAvisoTasa('⚠️ No se pudo actualizar la tasa del BCV automáticamente. Se mantiene <b>Bs ' + formatoBsTasa(info.tasa) + '</b> (del ' + escapeHtml(String(info.fecha || '?')) + '). Escríbela a mano en la casilla "Tasa BCV".', 'bg-amber-500/10 border-amber-500/40 text-amber-200', 0);
        return;
    }
    if (auto && info.fecha === hoy && info.actualizado) {
        let visto = '';
        try { visto = localStorage.getItem('tasaBcvAvisada') || ''; } catch (e) {}
        if (visto === info.actualizado) return;
        try { localStorage.setItem('tasaBcvAvisada', info.actualizado); } catch (e) {}
        const antes = (info.anterior && info.anterior !== info.tasa) ? ' (antes Bs ' + formatoBsTasa(info.anterior) + ')' : '';
        mostrarAvisoTasa('✅ La tasa BCV de hoy se actualizó: <b>Bs ' + formatoBsTasa(info.tasa) + '</b>' + antes + '.', 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200', 20000);
    }
}

// Respaldo por si el cron de la mañana no corrió: al abrir el tablero con la tasa de otro día, se pide actualizarla una vez.
async function sincronizarTasaSiHaceFalta(info) {
    if (window.__sincTasaIntentada || !info || !info.auto || info.fecha === hoyCaracasTexto()) return;
    window.__sincTasaIntentada = true;
    try {
        const r = await fetch(API_BASE + '/api/bcv/sincronizar', { method: 'POST', headers: authHeaders(), body: '{}' });
        if (!r.ok) return;
        const d = await r.json();
        if (d && d.info && d.info.fecha === hoyCaracasTexto()) actualizarTasaBCV(); else if (d && d.info) { pintarOrigenTasa(d.info); avisarTasaBcv(d.info); }
    } catch (e) { console.error('No se pudo sincronizar la tasa BCV:', e); }
}

async function actualizarTasaBCV() {
    const inputTasa = document.getElementById('tasaBCV');
    if (!inputTasa) return;

    try {
        const response = await fetch(API_BASE + '/api/bcv/');
        if (!response.ok) throw new Error('Error BD');
        
        const data = await response.json();
        
        if (data && data.success) {
            inputTasa.value = parseFloat(data.tasa).toFixed(2);
            // Destello verde al cargar
            inputTasa.classList.add('text-emerald-400');
            setTimeout(() => inputTasa.classList.remove('text-emerald-400'), 2000);
            if (data.info) {
                pintarOrigenTasa(data.info);
                avisarTasaBcv(data.info);
                sincronizarTasaSiHaceFalta(data.info);
            }
        }
    } catch (error) {
        console.error("Falló la conexión con la base de datos para la tasa:", error);
    }
}

if (document.getElementById('tasaBCV')) {
    const inputTasa = document.getElementById('tasaBCV');

    // Si el guardado falla, la casilla no puede quedarse mostrando un número que
    // el servidor nunca aceptó: el cajero creería que cambió la tasa y los
    // pedidos seguirían saliendo con la anterior. Se avisa y se vuelve a pintar
    // la que de verdad está guardada.
    const avisarTasaNoGuardada = (mensaje) => {
        inputTasa.classList.remove('text-white');
        inputTasa.classList.add('text-red-400');
        setTimeout(() => {
            inputTasa.classList.remove('text-red-400');
            inputTasa.classList.add('text-white');
        }, 2000);
        alert(mensaje);
        actualizarTasaBCV();
    };

    // Evita mandar dos veces el mismo cambio: al pulsar Enter se guarda y se
    // suelta el foco, y soltar el foco dispara además el evento 'change'.
    let guardandoTasa = false;

    // Separamos la lógica de guardar en una función para poder usarla con Enter o con Clic
    const guardarTasaBD = async () => {
        const nuevaTasa = parseFloat(inputTasa.value);
        if (isNaN(nuevaTasa) || nuevaTasa <= 0) return;
        if (guardandoTasa) return;
        guardandoTasa = true;

        try {
            // authHeaders() lleva el token del personal. Este guardado lo mandaba
            // sin token desde antes de que el backend empezara a exigirlo, así que
            // el servidor lo rechazaba con un 401 y aquí no se avisaba de nada: la
            // casilla aceptaba el número y al recargar volvía el anterior.
            const response = await fetch(API_BASE + '/api/bcv/actualizar', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ tasa: nuevaTasa })
            });

            if (sesionCaducada(response)) {
                forzarNuevoLogin('Tu sesión venció y la tasa no se guardó. Inicia sesión de nuevo y vuelve a escribirla.');
                return;
            }

            if(response.ok) {
                // Quitamos el blanco, ponemos amarillo
                inputTasa.classList.remove('text-white');
                inputTasa.classList.add('text-amber-400');

                // A los 2 segundos, lo devolvemos a la normalidad
                setTimeout(() => {
                    inputTasa.classList.remove('text-amber-400');
                    inputTasa.classList.add('text-white');
                }, 2000);

                inputTasa.blur();
                pintarOrigenTasa({ fuente: 'manual', auto: true, actualizado: null });

                // Los montos en bolívares de las tarjetas se calculan con este
                // número cuando el pedido no trae su propia tasa guardada.
                if (typeof renderizarTablero === 'function') renderizarTablero();
            } else {
                avisarTasaNoGuardada('El servidor no aceptó la tasa nueva. Se dejó la que estaba guardada.');
            }
        } catch (error) {
            console.error("Error al guardar la tasa en BD:", error);
            avisarTasaNoGuardada('No se pudo guardar la tasa: revisa el internet e inténtalo de nuevo.');
        } finally {
            guardandoTasa = false;
        }
    };

    // 1. Guarda si el admin hace clic en cualquier otra parte de la pantalla
    inputTasa.addEventListener('change', guardarTasaBD);

    // 2. Guarda si el admin presiona la tecla Enter
    inputTasa.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            guardarTasaBD();
        }
    });
}

// --- ESCUCHADOR DEL CALENDARIO ---
if (document.getElementById('calendarioFiltro')) {
    document.getElementById('calendarioFiltro').addEventListener('change', () => {
        console.log("Cambiando fecha a:", document.getElementById('calendarioFiltro').value);
        pedidosEnMemoria = [];
        cargarPedidos();
    });
}

// --- SESIONES (RBAC) ---
function verificarSesion() {
    const sesionGuardada = localStorage.getItem('usuarioActivo');
    const vistaLogin = document.getElementById('vistaLogin');
    const vistaDashboard = document.getElementById('vistaDashboard');
    
    if (!vistaLogin || !vistaDashboard) return;

    if (sesionGuardada) {
        usuarioActivo = JSON.parse(sesionGuardada);
        aplicarRestriccionesRol();
        prepararFiltroSucursal();
        vistaLogin.classList.add('hidden');
        vistaDashboard.classList.remove('hidden');
        vistaDashboard.classList.add('flex');
        cargarPedidos();
    } else {
        usuarioActivo = null;
        vistaLogin.classList.remove('hidden');
        vistaDashboard.classList.add('hidden');
        vistaDashboard.classList.remove('flex');
    }
}

const API_VALIDAR_ACCESO = API_BASE + "/api/usuarios/validar-acceso";

async function iniciarSesion(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();

    const usernameInput = document.getElementById('loginUsername').value.trim();
    const pinInput = document.getElementById('loginPIN').value.trim();
    const errorMsg = document.getElementById('loginError');
    const btnSubmit = document.querySelector('#formLogin button[type="submit"]');
    
    if (errorMsg) errorMsg.classList.add('hidden');
    if (!usernameInput || !pinInput) return;

    if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando...'; }

    try {
        const response = await fetch(API_VALIDAR_ACCESO, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo: 'login_normal', username: usernameInput, pin: pinInput })
        });

        const data = await response.json();

        if (data.success && data.usuario && data.token) {
            // Guardamos al usuario PERO el PIN jamás llegó al navegador
            usuarioActivo = { username: data.usuario.username, nombre: data.usuario.nombre, rol: data.usuario.rol };
            localStorage.setItem('usuarioActivo', JSON.stringify(usuarioActivo));
            localStorage.setItem('tokioAuthToken', data.token);

            const formLogin = document.getElementById('formLogin');
            if (formLogin) formLogin.reset();
            
            verificarSesion();
        } else {
            if (errorMsg) { errorMsg.innerText = "Usuario o PIN incorrectos."; errorMsg.classList.remove('hidden'); }
        }
    } catch (error) {
        if (errorMsg) { errorMsg.innerText = "Error de conexión con el servidor."; errorMsg.classList.remove('hidden'); }
    } finally {
        if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = 'Ingresar <i class="fa-solid fa-arrow-right"></i>'; }
    }
}

function cerrarSesion() {
    localStorage.removeItem('usuarioActivo');
    localStorage.removeItem('tokioAuthToken');
    verificarSesion();
}


// ---- Sucursales: el dueño filtra por sucursal; el empleado ve solo la suya ----
window.__verSucursal = false;
async function prepararFiltroSucursal() {
    if (!usuarioActivo || document.getElementById('filtroSucursal') || document.getElementById('etiquetaSucursalFija')) return;
    let lista = [];
    try { const r = await fetch(API_BASE + '/api/sitio'); lista = ((await r.json()).sucursales || []).filter(s => s.activa !== false); } catch (e) {}
    if (lista.length < 2) return;
    const contenedor = document.getElementById('calendarioFiltro') && document.getElementById('calendarioFiltro').parentElement;
    if (!contenedor) return;
    if (usuarioActivo.sucursal_id) {
        const s = lista.find(x => Number(x.id) === Number(usuarioActivo.sucursal_id));
        const e = document.createElement('div');
        e.id = 'etiquetaSucursalFija';
        e.className = 'flex items-center bg-amber-500/10 text-amber-300 border border-amber-500/30 px-3 h-10 rounded-lg text-sm font-bold';
        e.textContent = '📍 ' + (s ? s.nombre : 'Mi sucursal');
        contenedor.parentElement.insertBefore(e, contenedor);
        return;
    }
    window.__verSucursal = true;
    const sel = document.createElement('select');
    sel.id = 'filtroSucursal';
    sel.className = 'bg-slate-700 text-slate-100 text-sm font-semibold border border-slate-600 rounded-lg px-3 h-10 focus:outline-none cursor-pointer';
    sel.innerHTML = '<option value="">📍 Todas las sucursales</option>' + lista.map(s => '<option value="' + s.id + '">' + escapeHtml(s.nombre) + '</option>').join('');
    sel.value = localStorage.getItem('filtro_sucursal') || '';
    sel.onchange = () => { localStorage.setItem('filtro_sucursal', sel.value); cargarPedidos(); };
    contenedor.parentElement.insertBefore(sel, contenedor);
    cargarPedidos();
}

function aplicarRestriccionesRol() {
    const inputTasa = document.getElementById('tasaBCV');
    const badgeUsuario = document.getElementById('badgeUsuario');
    if (!usuarioActivo || !badgeUsuario || !inputTasa) return;

    let colorRol = 'bg-slate-600/20 text-slate-300 border-slate-600/30';
    if (usuarioActivo.rol === 'superadmin') colorRol = 'bg-red-500/10 text-red-400 border-red-500/20';
    if (usuarioActivo.rol === 'admin') colorRol = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';

    badgeUsuario.innerHTML = `
        <div class="flex items-center gap-2 overflow-hidden">
            <span class="text-[10px] text-slate-400 uppercase font-semibold shrink-0">Op:</span>
            <span class="text-xs font-bold text-white truncate max-w-[110px]" title="${escapeHtml(usuarioActivo.nombre)}">${escapeHtml(usuarioActivo.nombre)}</span>
        </div>
        <span class="text-[9px] uppercase font-mono font-bold px-1.5 py-0.5 rounded border ${colorRol} shrink-0">${escapeHtml(usuarioActivo.rol)}</span>
    `;

    if (usuarioActivo.rol === 'cajero') {
        inputTasa.disabled = true;
        inputTasa.classList.add('opacity-40', 'cursor-not-allowed');
    } else {
        inputTasa.disabled = false;
        inputTasa.classList.remove('opacity-40', 'cursor-not-allowed');
    }
}

// Editar un pedido ya no se hace desde aquí. Este tablero no sabe armar combos
// —elegir los rolls, los estilos, las bebidas—, así que un combo agregado desde
// su viejo mini-menú llegaba a la cocina pelado, sin decir qué llevaba. En vez de
// mantener aquí una segunda copia del menú, el lápiz manda a la caja
// (menu_trabajadores.html), que es la pantalla que sí sabe armarlos, con el
// pedido ya cargado. Ver "Modo edición" al final de menu_trabajadores.js.
function irAEditarPedidoEnCaja(idReal, idVisual) {
    const pedido = pedidosEnMemoria.find(p => String(p.id_pedido || p['ID_Pedido'] || p.ID || 'S/ID') === String(idReal));
    if (!pedido) return;

    // El pedido viaja por localStorage para que la caja no tenga que volver a
    // pedirlo. Si el apunte se pierde (una recarga, una ventana de incógnito),
    // esa pantalla lo consulta al servidor por su cuenta.
    try {
        localStorage.setItem('tokioPedidoEnEdicion', JSON.stringify({
            id: idReal,
            id_visual: idVisual,
            cliente: pedido.cliente || pedido['Cliente'] || '',
            telefono: pedido.telefono || '',
            direccion: pedido.direccion || '',
            tipo_entrega: pedido.tipo_entrega || '',
            metodo_pago: pedido.metodo_pago || pedido['Método de pago'] || pedido.Metodo_pago || '',
            pedido_detallado: pedido.pedido_detallado || pedido['Pedido Detallado'] || ''
        }));
    } catch (e) { /* sin localStorage, la caja lo pide al servidor */ }

    window.location.href = 'menu_trabajadores.html?editar=' + encodeURIComponent(idReal);
}

// --- CANCELAR PEDIDO ---
function cancelarPedido(idPedido) {
    if (!confirm("¿Estás seguro de que deseas eliminar este pedido sin pagar? Desaparecerá del tablero.")) return;
    const pedido = pedidosEnMemoria.find(p => String(p.id_pedido || p['ID_Pedido'] || p.ID || 'S/ID') === String(idPedido)); if (!pedido) return;
    const index = pedidosEnMemoria.findIndex(p => String(p.id_pedido || p['ID_Pedido'] || p.ID) === String(idPedido));
    if (index !== -1) { pedidosEnMemoria[index].estado = 'Cancelado'; renderizarTablero(); }
    const operadorFirma = usuarioActivo ? `${usuarioActivo.nombre} (${usuarioActivo.rol})` : "No registrado";
    const payload = {
        id: idPedido, estado: 'Cancelado', telefono: pedido.telefono || '', cliente: pedido.cliente || '', tipo_entrega: pedido.tipo_entrega || '', 
        procesado_por: operadorFirma, referencia_pago: pedido.referencia_pago || "", imagen_pago: pedido.imagen_pago || "",
        pedido_detallado: pedido.pedido_detallado || "", total_orden: parseFloat(pedido.total_orden || pedido['Total Orden']) || 0, tiempo_estimado: ""
    };
    fetch(API_ACTUALIZAR_ESTADO, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) }).catch(e => console.error(e));
}

// --- COMPROBANTES Y TIEMPO ---
if (document.getElementById('inputImagenPago')) {
    document.getElementById('inputImagenPago').addEventListener('change', function(event) {
        const file = event.target.files[0]; const preview = document.getElementById('previewComprobante');
        if (file) { const reader = new FileReader(); reader.onload = function(e) { preview.src = e.target.result; preview.classList.remove('hidden'); }; reader.readAsDataURL(file); } 
        else { preview.src = ""; preview.classList.add('hidden'); }
    });
}

// El "¿con cuánto paga?" se pregunta aquí y no al cotizar el delivery: el
// cliente recibe el mensaje de cobro justo después de que se calcula el
// envío, así que recién al aceptar el pago el cajero sabe con qué billete
// viene. Solo aplica al efectivo, que es el único caso con vuelto.
function pedirComprobantePago(metodoPago) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modalComprobante'); 
        const contenedorRef = document.getElementById('contenedorReferencia');
        const inputRef = document.getElementById('inputReferencia'); 
        const inputImg = document.getElementById('inputImagenPago');
        const preview = document.getElementById('previewComprobante'); 
        const txtMetodo = document.getElementById('txtMetodoPagoModal');
        const inputPagaCon = document.getElementById('inputPagaCon');
        const bloquePagaCon = document.getElementById('bloquePagaCon');

        inputRef.value = ''; inputImg.value = ''; preview.src = ''; preview.classList.add('hidden');
        if (inputPagaCon) inputPagaCon.value = '';
        const metodoLimpio = metodoPago || "Desconocido"; 
        txtMetodo.innerText = `Método de pago del cliente: ${metodoLimpio}`;
        
        const esEfectivo = metodoLimpio.toLowerCase().includes('efectivo');
        if (esEfectivo) contenedorRef.classList.add('hidden'); 
        else contenedorRef.classList.remove('hidden');
        if (bloquePagaCon) bloquePagaCon.style.display = esEfectivo ? 'block' : 'none';
        
        modal.classList.remove('hidden');

        document.getElementById('btnAceptarComprobante').onclick = async () => {
            if (!contenedorRef.classList.contains('hidden') && inputRef.value.trim() === '') { 
                alert("Por favor, ingresa el número de referencia."); return; 
            }
            
            const file = inputImg.files[0];
            let urlFinalImagen = "";

            // MAGIA NUEVA: Subir a ImgBB desde el navegador
            if (file) {
                const btnAceptar = document.getElementById('btnAceptarComprobante');
                btnAceptar.innerText = "Subiendo comprobante...";
                btnAceptar.disabled = true;

                const formData = new FormData();
                formData.append("image", file);

                try {
                    
                    const imgbbRes = await fetch('https://api.imgbb.com/1/upload', {
                        method: "POST",
                        body: formData
                    });
                    
                    const imgbbData = await imgbbRes.json();
                    if (imgbbData.success) {
                        urlFinalImagen = imgbbData.data.url; // Rescatamos la URL limpia
                    } else {
                        alert("Hubo un problema subiendo la imagen a ImgBB.");
                        btnAceptar.innerText = "Confirmar Pago"; btnAceptar.disabled = false;
                        return;
                    }
                } catch (error) {
                    console.error("Error subiendo imagen:", error);
                    alert("Fallo de conexión al subir imagen.");
                    btnAceptar.innerText = "Confirmar Pago"; btnAceptar.disabled = false;
                    return;
                }
                btnAceptar.innerText = "Confirmar Pago"; btnAceptar.disabled = false;
            }

            modal.classList.add('hidden'); 
            // Resolvemos la promesa entregando la referencia, la URL de ImgBB y
            // el billete con el que paga (vacío si no es efectivo).
            resolve({
                referencia: inputRef.value,
                imagen: urlFinalImagen,
                pagaCon: (esEfectivo && inputPagaCon) ? inputPagaCon.value.trim() : ''
            }); 
        };
        
        document.getElementById('btnCancelarComprobante').onclick = () => { 
            modal.classList.add('hidden'); resolve(null); 
        };
    });
}

// El tiempo ya no viaja como un numero suelto ("30") sino como la frase
// completa que va a leer el cliente ("25 a 30 minutos", "1 hora y 30
// minutos"), porque el restaurante prefiere prometer un rango y no una hora
// exacta. El backend la inserta tal cual en [TIEMPO_ESTIMADO].
function pedirTiempoEstimado() {
    return new Promise((resolve) => {
        resolveTiempoEstimado = resolve;
        const horas = document.getElementById('inputTiempoHoras');
        const minutos = document.getElementById('inputTiempoMinutos');
        if (horas) horas.value = '';
        if (minutos) minutos.value = '';
        document.getElementById('modalTiempoEstimado').classList.remove('hidden');
    });
}

function seleccionarTiempo(texto) {
    if (!texto || String(texto).trim() === '') { alert('Por favor ingresa un tiempo válido.'); return; }
    document.getElementById('modalTiempoEstimado').classList.add('hidden');
    if (resolveTiempoEstimado) resolveTiempoEstimado(String(texto).trim());
}

// Arma la frase a partir de las casillas de horas y minutos:
// 0h 40min -> "40 minutos" | 1h 0min -> "1 hora" | 1h 30min -> "1 hora y 30 minutos"
function aplicarTiempoPersonalizado() {
    const horas = parseInt(document.getElementById('inputTiempoHoras').value, 10) || 0;
    const minutos = parseInt(document.getElementById('inputTiempoMinutos').value, 10) || 0;

    if (horas <= 0 && minutos <= 0) { alert('Escribe cuántas horas o minutos va a tardar.'); return; }
    if (minutos > 59) { alert('Los minutos van de 0 a 59. Si es más de una hora, súbelo a las horas.'); return; }

    const partes = [];
    if (horas > 0) partes.push(horas === 1 ? '1 hora' : `${horas} horas`);
    if (minutos > 0) partes.push(minutos === 1 ? '1 minuto' : `${minutos} minutos`);

    seleccionarTiempo(partes.join(' y '));
}
function cancelarTiempoEstimado() {
    document.getElementById('modalTiempoEstimado').classList.add('hidden');
    if (resolveTiempoEstimado) resolveTiempoEstimado(null);
}

// --- FLUJO DE ESTADOS ---
async function procesarPasoCocina(idPedido, idVisual) {
    const pedido = pedidosEnMemoria.find(p => String(p.id_pedido || p['ID_Pedido'] || p.ID || 'S/ID') === String(idPedido)); 
    if (!pedido) return;
    
    const metodoPago = pedido.metodo_pago || pedido['Método de pago'] || pedido.Metodo_pago || '';
    const telefono = pedido.telefono || pedido['Teléfono'] || ''; 
    const cliente = pedido.cliente || pedido['Cliente'] || '';
    const tipoEntrega = pedido.tipo_entrega || pedido['Tipo de entrega'] || pedido.Tipo_entrega || '';

    const datosPago = await pedirComprobantePago(metodoPago); if (!datosPago) return; 
    const tiempoEstimado = await pedirTiempoEstimado(); if (!tiempoEstimado) return; 

    // 1. Guardamos todo en la base de datos (incluyendo la URL de ImgBB)
    ejecutarActualizacion(idPedido, 'En Cocina', telefono, cliente, tipoEntrega, datosPago, tiempoEstimado);

    // 2. MAGIA NUEVA: Disparamos el mensaje de WhatsApp al cliente
    const payloadAprobado = {
        telefono: telefono,
        cliente: cliente,
        tiempo_estimado: tiempoEstimado,
        id_visual: String(pedido.id_pedido || pedido.ID || idPedido)
    };

    fetch(API_BASE + "/api/pedidos/notificar-aprobado", {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payloadAprobado)
    }).catch(e => console.error("Error enviando WhatsApp de aprobación:", e));

    // 3. Y sale la comanda por la impresora del local: es el papel que antes
    // había que copiar a mano para la cocina. Va de último a propósito, porque
    // el cuadro de impresión del navegador congela la página mientras está
    // abierto y arriba ya quedaron disparados el guardado y el WhatsApp.
    if (typeof IMPRIMIR_AL_PASAR_A_COCINA !== "undefined" && IMPRIMIR_AL_PASAR_A_COCINA) {
        imprimirComandaDePedido(idPedido, idVisual, {
            tiempoEstimado: tiempoEstimado,
            pagaCon: datosPago ? datosPago.pagaCon : ''
        });
    }
}

function procesarPasoFinalizado(idPedido) {
    const pedido = pedidosEnMemoria.find(p => String(p.id_pedido || p['ID_Pedido'] || p.ID || 'S/ID') === String(idPedido)); 
    if (!pedido) return;
    
    const telefono = pedido.telefono || pedido['Teléfono'] || ''; 
    const cliente = pedido.cliente || pedido['Cliente'] || '';
    const tipoEntrega = pedido.tipo_entrega || pedido['Tipo de entrega'] || pedido.Tipo_entrega || '';
    
    // 1. Actualiza el tablero visualmente y la base de datos
    ejecutarActualizacion(idPedido, 'Finalizado', telefono, cliente, tipoEntrega, null, "");

    // 2. MAGIA FINAL: Disparamos el mensaje de WhatsApp de despacho
    const payloadDespacho = {
        telefono: telefono,
        cliente: cliente,
        tipo_entrega: tipoEntrega,
        id_visual: String(pedido.id_pedido || pedido.ID || idPedido),
        direccion: pedido.direccion || pedido.Direccion || 'Dirección no especificada'
    };

    fetch(API_BASE + "/api/pedidos/notificar-despacho", {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payloadDespacho)
    }).catch(e => console.error("Error enviando WhatsApp de despacho:", e));
}

function ejecutarActualizacion(id, estado, telefono, cliente, tipoEntrega, datosPago, tiempoEstimado = "") {
    const operadorFirma = usuarioActivo ? `${usuarioActivo.nombre} (${usuarioActivo.rol})` : "No registrado";
    const index = pedidosEnMemoria.findIndex(p => String(p.id_pedido || p['ID_Pedido'] || p.ID) === String(id));
    if (index === -1) return; const pedidoViejo = pedidosEnMemoria[index];

    const refGuardada = pedidoViejo.referencia_pago || pedidoViejo['Referencia_pago'] || pedidoViejo.Referencia_pago || "";
    const imgGuardada = pedidoViejo.imagen_pago || pedidoViejo['Imagen_pago'] || pedidoViejo['Imagen Pago'] || "";
    const nuevaRef = datosPago ? datosPago.referencia : refGuardada; const nuevaImg = datosPago ? datosPago.imagen : imgGuardada;
    
    // CAPTURAMOS LA TASA DE LA PANTALLA
    const tasaActual = parseFloat(document.getElementById('tasaBCV').value) || 1;

    pedidosEnMemoria[index].estado = estado; pedidosEnMemoria[index].procesado_por = operadorFirma;
    pedidosEnMemoria[index].referencia_pago = nuevaRef; pedidosEnMemoria[index].imagen_pago = nuevaImg;
    pedidosEnMemoria[index].tasa_bcv = tasaActual; // Actualizamos memoria
    renderizarTablero();

    const direccionGuardada = pedidoViejo.direccion || pedidoViejo.Direccion || "Dirección no especificada";

    const payload = {
        id: id, estado: estado, telefono: telefono, cliente: cliente, tipo_entrega: tipoEntrega, procesado_por: operadorFirma,
        referencia_pago: nuevaRef, imagen_pago: nuevaImg, pedido_detallado: pedidoViejo.pedido_detallado || pedidoViejo['Pedido Detallado'] || "",
        total_orden: parseFloat(pedidoViejo.total_orden || pedidoViejo['Total Orden']) || 0, tiempo_estimado: tiempoEstimado,
        direccion: direccionGuardada,
        tasa_bcv: tasaActual // ENVIAMOS LA TASA A LA BASE DE DATOS
    };

    // El billete con el que paga solo viaja cuando el modal de Validar Pago lo
    // preguntó. Mandarlo siempre lo borraría al despachar, que es justo cuando
    // el aviso al grupo de motorizados lo necesita.
    if (datosPago && typeof datosPago.pagaCon === 'string' && datosPago.pagaCon !== '') {
        payload.paga_con = datosPago.pagaCon;
    }

    fetch(API_ACTUALIZAR_ESTADO, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) }).catch(e => console.error(e));
}

// --- FECHAS Y RENDERIZADO ---
function esPedidoDeLaFecha(filaTexto) {
    if (!filaTexto) return false;
    
    let pedidoObj;
    try { pedidoObj = JSON.parse(filaTexto); } 
    catch(e) { return false; }

    const inputFecha = document.getElementById('calendarioFiltro') ? document.getElementById('calendarioFiltro').value : '';
    const fechaDeseada = inputFecha || new Date().toLocaleDateString('en-CA', {timeZone: 'America/Caracas'}); 

    const fechaRaw = pedidoObj.timestamp || pedidoObj['Timestamp'];
    if (!fechaRaw) return true;

    try {
        const d = new Date(fechaRaw);
        const fechaLocal = d.toLocaleDateString('en-CA', {timeZone: 'America/Caracas'});
        return fechaLocal === fechaDeseada;
    } catch(e) {
        return true;
    }
}

function normalizarEstado(estadoRaw) { return (!estadoRaw) ? '' : estadoRaw.replace(/[\s\uFEFF\xA0]+/g, '').toLowerCase(); }

async function cargarPedidos() {
    try {
        const fechaCalendario = document.getElementById('calendarioFiltro') ? document.getElementById('calendarioFiltro').value : '';
        let urlFetch = API_OBTENER_PEDIDOS + '?_t=' + new Date().getTime();
        if (fechaCalendario) urlFetch += '&fecha=' + fechaCalendario;
        const filtroSuc = document.getElementById('filtroSucursal') ? document.getElementById('filtroSucursal').value : '';
        if (filtroSuc) urlFetch += '&sucursal=' + filtroSuc;
        
        const response = await fetch(urlFetch, { headers: authHeaders() });
        // Sin esto, un token vencido dejaba el tablero en blanco y parecia que
        // simplemente no habia pedidos ese dia.
        if (sesionCaducada(response)) { forzarNuevoLogin(); return; }
        if (!response.ok) throw new Error('Error API');
        
        const datos = await response.json(); 
        pedidosEnMemoria = Array.isArray(datos) ? datos : [];
        
        const inputTasa = document.getElementById('tasaBCV');
        const hoy = new Date().toLocaleDateString('en-CA', {timeZone: 'America/Caracas'});

        if (fechaCalendario && fechaCalendario !== hoy) {
            const pedidoConTasa = pedidosEnMemoria.find(p => p.tasa_bcv && parseFloat(p.tasa_bcv) > 0);
            if (pedidoConTasa && inputTasa) {
                inputTasa.value = parseFloat(pedidoConTasa.tasa_bcv).toFixed(2);
                inputTasa.classList.add('text-amber-400'); 
            } else if (inputTasa) {
                inputTasa.value = "";
                inputTasa.classList.add('text-amber-400');
            }
        } else {
            actualizarTasaBCV();
            if (inputTasa) inputTasa.classList.remove('text-amber-400');
        }

        renderizarTablero(); 
    } catch (error) { 
        console.error(error); 
    }
}

function formatearMoneda(valor) {
    return new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor);
}

function renderizarTablero() {
    const colCalculando = document.getElementById('columnaCalculandoDelivery');
    const colPagoPendiente = document.getElementById('columnaPagoPendiente');
    const colEnCocina = document.getElementById('columnaEnCocina');
    const colFinalizado = document.getElementById('columnaFinalizado');

    if (!colPagoPendiente || !colEnCocina || !colFinalizado) return;
    
    if (colCalculando) colCalculando.innerHTML = '';
    colPagoPendiente.innerHTML = ''; colEnCocina.innerHTML = ''; colFinalizado.innerHTML = '';

    let conteoCalculando = 0, conteoPago = 0, conteoCocina = 0, conteoFinalizado = 0;
    
    let totalVentasDia = 0; 
    let totalVentasDiaBs = 0; // 🌟 NUEVO: Variable para sumar los Bs. históricos reales

    const inputTasa = document.getElementById('tasaBCV');
    const tasaPantalla = inputTasa ? (parseFloat(inputTasa.value) || 1) : 1;

    const pedidosHoy = pedidosEnMemoria.filter(p => esPedidoDeLaFecha(JSON.stringify(p)));
    pedidosHoy.sort((a, b) => parseInt(String(a.id_pedido || a.ID || 0).replace(/\D/g,'')) - parseInt(String(b.id_pedido || b.ID || 0).replace(/\D/g,'')));
    // Delivery y pickup llevan cuadernos separados: cada uno arranca en 1 cada
    // día. Tiene que coincidir con lo que numera el backend, porque ese es el
    // número que el cliente ve en su WhatsApp.
    const mapaIdsDiarios = {};
    const contadoresDiarios = { delivery: 0, pickup: 0, mesa: 0 };
    pedidosHoy.forEach((p) => {
        const id = p.id_pedido || p['ID_Pedido'] || p.ID || 'S/ID';
        const tipo = String(p.tipo_entrega || '').toLowerCase();
        const llave = tipo.includes('mesa') ? 'mesa' : ((tipo.includes('pickup') || tipo.includes('retiro')) ? 'pickup' : 'delivery');
        contadoresDiarios[llave] += 1;
        mapaIdsDiarios[id] = contadoresDiarios[llave];
    });

    pedidosEnMemoria.forEach(pedido => {
        if (!esPedidoDeLaFecha(JSON.stringify(pedido))) return;

        const idReal = pedido.id_pedido || pedido['ID_Pedido'] || pedido.ID || 'S/ID';
        const idVisual = mapaIdsDiarios[idReal] || idReal;

        const cliente = pedido.cliente || 'Desconocido';
        const telefonoRaw = pedido.telefono || '';
        const clienteSeguro = escapeHtml(cliente);
        const telefonoSeguro = escapeHtml(String(telefonoRaw));

        // Delivery o pickup. Se decide igual que la numeración diaria y que
        // es_entrega_pickup() del backend: solo cuenta lo que diga el campo de
        // entrega, para que la etiqueta y el número #N nunca se contradigan.
        const tipoEntregaStr = String(pedido.tipo_entrega || '').toLowerCase();
        const detalleStr = String(pedido.pedido_detallado || '').toLowerCase();
        const esMesa = tipoEntregaStr.includes('mesa');
        const esPickup = !esMesa && (tipoEntregaStr.includes('pickup') || tipoEntregaStr.includes('retiro'));
        const etiquetaSucursal = (window.__verSucursal && pedido.sucursal_nombre) ? ` <span class="text-[10px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5">📍 ${escapeHtml(pedido.sucursal_nombre)}</span>` : '';
        const etiquetaEntrega = (esMesa
            ? `<span class="text-[11px] font-semibold text-fuchsia-300">(🍽️ ${escapeHtml(pedido.direccion || 'Mesa')})</span>`
            : (esPickup
                ? '<span class="text-[11px] font-semibold text-amber-300">(Pickup)</span>'
                : '<span class="text-[11px] font-semibold text-sky-300">(Delivery)</span>')) + etiquetaSucursal;
        const metodoPago = String(pedido.metodo_pago || '').replace(/'/g, "\\'");
        const esPagoMovil = metodoPago.toLowerCase().includes('pago') || metodoPago.toLowerCase().includes('movil');
        const monto = parseFloat(String(pedido.total_orden || pedido.monto || 0).replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
        
        // 🌟 NUEVO: Usamos la tasa guardada en la Base de Datos para esta tarjeta
        const tasaHistorica = pedido.tasa_bcv ? parseFloat(pedido.tasa_bcv) : tasaPantalla;

        const montoFormateado = formatearMoneda(monto);
        const montoBsFormateado = formatearMoneda(monto * tasaHistorica);

        let htmlMonto = `<span class="text-xs font-bold text-slate-300">$${montoFormateado}</span>`;
        if (esPagoMovil) htmlMonto = `<div class="flex flex-col"><span class="text-xs font-bold text-slate-300">$${montoFormateado}</span><span class="text-[10px] font-bold text-amber-400">Bs. ${montoBsFormateado}</span></div>`;
        
        let hora = '--:--';
        const fechaRaw = pedido.timestamp || pedido['Timestamp'];
        if (fechaRaw) {
            const match = String(fechaRaw).match(/(\d{1,2}):(\d{2})/);
            
            if (match) {
                let h = parseInt(match[1], 10);
                const m = match[2];

                const ampm = (h >= 12 && h < 24) ? 'PM' : 'AM';
                h = h % 12 || 12; 
                
                hora = `${h}:${m} ${ampm}`;
            }
        }
        
        const art = pedido.pedido_detallado || 'Detalle no disponible'; 
        const estadoLimpio = normalizarEstado(String(pedido.estado || ''));

        let btnWhatsApp = '';
        const telLimpio = String(telefonoRaw).replace(/\D/g, ''); 
        if (telLimpio.length >= 10) {
            let telWA = telLimpio;
            if (telWA.startsWith('0')) telWA = '58' + telWA.substring(1);
            else if (!telWA.startsWith('58')) telWA = '58' + telWA;
            const esMovil = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            const urlWA = esMovil ? `https://wa.me/${telWA}` : `https://web.whatsapp.com/send?phone=${telWA}`;
            btnWhatsApp = `<a href="${urlWA}" target="_blank" onclick="event.stopPropagation()" class="text-slate-400 hover:text-emerald-400 transition cursor-pointer ml-1" title="Abrir chat en WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>`;
        }
        
        if (estadoLimpio === 'calculandodelivery') {
            conteoCalculando++;
            colCalculando.innerHTML += `
                <div class="bg-slate-700/40 p-4 rounded-lg border border-purple-500/10 hover:border-purple-500/30 transition duration-150 space-y-3">
                    <div class="flex justify-between items-start">
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded border border-purple-400/20">#${idVisual}</span>
                            
                            <button onclick="abrirModalDetalle('${idReal}')" class="text-slate-400 hover:text-white transition cursor-pointer" title="Ver Detalles"><i class="fa-solid fa-file-lines"></i></button>
                            
                            <button onclick="irAEditarPedidoEnCaja('${idReal}', '${idVisual}')" class="text-slate-400 hover:text-amber-400 transition cursor-pointer" title="Editar Pedido"><i class="fa-solid fa-pen"></i></button>
                            
                            <button onclick="cancelarPedido('${idReal}')" class="text-slate-400 hover:text-red-500 transition cursor-pointer" title="Cancelar Pedido"><i class="fa-solid fa-trash"></i></button>
                            
                            ${btnWhatsApp}
                        </div>
                        <span class="text-[10px] text-slate-400 font-medium"><i class="fa-regular fa-clock"></i> ${hora}</span>
                    </div>
                    <div><h4 class="font-bold text-white text-sm truncate">${clienteSeguro} ${etiquetaEntrega}</h4><p class="text-xs text-slate-400 mt-1 line-clamp-2">${escapeHtml(art)}</p>${pedido.distancia_km != null ? `<p class="text-[11px] font-semibold text-emerald-300 mt-1">📍 ~${pedido.distancia_km} km${pedido.delivery_sugerido != null ? ` · tarifa sugerida $${Number(pedido.delivery_sugerido).toFixed(2)}` : ''}</p>` : '<p class="text-[11px] text-slate-500 mt-1">📍 Sin ubicación del cliente: pon el precio a mano</p>'}</div>
                    <div class="flex justify-between items-center pt-2 border-t border-slate-600/50">
                        ${htmlMonto}
                        <button onclick="procesarPrecioDelivery('${idReal}')" class="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3 py-1.5 rounded-md transition flex items-center gap-1 cursor-pointer">Poner precio delivery <i class="fa-solid fa-motorcycle"></i></button>
                    </div>
                </div>`;
        } else if (estadoLimpio === 'pagopendiente') {
            conteoPago++;
            colPagoPendiente.innerHTML += `
                <div class="bg-slate-700/40 p-4 rounded-lg border border-yellow-500/10 hover:border-yellow-500/30 transition duration-150 space-y-3">
                    <div class="flex justify-between items-start">
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded border border-yellow-400/20">#${idVisual}</span>
                            
                            <button onclick="abrirModalDetalle('${idReal}')" class="text-slate-400 hover:text-white transition cursor-pointer" title="Ver Detalles"><i class="fa-solid fa-file-lines"></i></button>
                            
                            <button onclick="irAEditarPedidoEnCaja('${idReal}', '${idVisual}')" class="text-slate-400 hover:text-amber-400 transition cursor-pointer" title="Editar Pedido"><i class="fa-solid fa-pen"></i></button>
                            <button onclick="cancelarPedido('${idReal}')" class="text-slate-400 hover:text-red-500 transition cursor-pointer" title="Cancelar Pedido"><i class="fa-solid fa-trash"></i></button>
                            ${btnWhatsApp}
                        </div>
                        <span class="text-[10px] text-slate-400 font-medium"><i class="fa-regular fa-clock"></i> ${hora}</span>
                    </div>
                    <div><h4 class="font-bold text-white text-sm truncate">${clienteSeguro} ${etiquetaEntrega}</h4><p class="text-xs text-slate-400 mt-1 line-clamp-2">${escapeHtml(art)}</p></div>
                    <div class="flex justify-between items-center pt-2 border-t border-slate-600/50">
                        ${htmlMonto}
                        <button onclick="procesarPasoCocina('${idReal}', '${idVisual}')" class="bg-yellow-500 hover:bg-yellow-400 text-slate-950 text-xs font-bold px-3 py-1.5 rounded-md transition flex items-center gap-1 cursor-pointer">Aceptar <i class="fa-solid fa-arrow-right"></i></button>
                    </div>
                </div>`;
        } else if (estadoLimpio === 'encocina') {
            conteoCocina++;
            colEnCocina.innerHTML += `
                <div class="bg-slate-700/40 p-4 rounded-lg border border-sky-500/10 hover:border-sky-500/30 transition duration-150 space-y-3">
                    <div class="flex justify-between items-start">
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-sky-400 bg-sky-400/10 px-2 py-0.5 rounded border border-sky-400/20">#${idVisual}</span>
                            <button onclick="abrirModalDetalle('${idReal}')" class="text-slate-400 hover:text-white transition cursor-pointer"><i class="fa-solid fa-file-lines"></i></button>
                            <button onclick="imprimirComandaDePedido('${idReal}', '${idVisual}')" class="text-slate-400 hover:text-sky-300 transition cursor-pointer" title="Volver a imprimir la comanda"><i class="fa-solid fa-print"></i></button>
                            ${btnWhatsApp}
                        </div>
                        <span class="text-[10px] text-slate-400 font-medium"><i class="fa-regular fa-clock"></i> ${hora}</span>
                    </div>
                    <div><h4 class="font-bold text-white text-sm truncate">${clienteSeguro} ${etiquetaEntrega}</h4><p class="text-xs text-slate-400 mt-1 line-clamp-2">${escapeHtml(art)}</p></div>
                    <div class="flex justify-between items-center pt-2 border-t border-slate-600/50">
                        ${htmlMonto}
                        <button onclick="procesarPasoFinalizado('${idReal}')" class="bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold px-3 py-1.5 rounded-md transition flex items-center gap-1 cursor-pointer">Despachar <i class="fa-solid fa-check"></i></button>
                    </div>
                </div>`;
        } else if (estadoLimpio === 'finalizado') {
            conteoFinalizado++; 
            totalVentasDia += monto; 
            totalVentasDiaBs += (monto * tasaHistorica); 
            
            // Para el botón de pagarle al motorizado se sigue usando la
            // detección amplia (campo de entrega o la línea del cobro), que es
            // más permisiva que la etiqueta de la tarjeta a propósito.
            const esDelivery = tipoEntregaStr.includes('delivery') || detalleStr.includes('servicio de delivery');
            
            const repartidorAsignado = pedido.repartidor || pedido.Repartidor || '';
            let btnMoto = '';
            
            // El boton de pagar al repartidor solo aparece si la gestion de
            // motorizados esta encendida en config.js.
            const gestionMotos = (typeof FUNCION_MOTORIZADOS === "undefined") || FUNCION_MOTORIZADOS;
            if (esDelivery && gestionMotos) {
                // Si el motorizado ya está asignado se pinta de verde, si no, gris
                const colorMoto = repartidorAsignado !== '' ? 'text-emerald-400' : 'text-slate-400 hover:text-emerald-400';
                const tituloMoto = repartidorAsignado !== '' ? `Pagado a: ${repartidorAsignado}` : 'Asignar Motorizado';
                
                // Botón con el ícono de la moto ajustado al lado de WhatsApp
                btnMoto = `<button onclick="abrirModalRepartidor('${idReal}', event)" class="${colorMoto} transition cursor-pointer ml-1 text-[13px]" title="${escapeHtml(tituloMoto)}"><i class="fa-solid fa-motorcycle"></i></button>`;
            }

            let htmlMontoFinalizado = `<span class="text-sm font-bold text-emerald-400">$${montoFormateado}</span>`;
            if (esPagoMovil) htmlMontoFinalizado = `<div class="flex flex-col text-right"><span class="text-sm font-bold text-emerald-400">$${montoFormateado}</span><span class="text-[10px] font-bold text-amber-400">Bs. ${montoBsFormateado}</span></div>`;
            
            let htmlReferencia = '';
            if (esPagoMovil) {
                const ref = pedido.referencia_pago || pedido.Referencia_pago || pedido['Referencia_pago'] || '';
                if (ref && ref !== 'Sin comprobante') {
                    htmlReferencia = `<div class="mt-2 pt-2 border-t border-slate-700/50 text-[10px] text-slate-400 flex items-center justify-between"><span class="font-semibold text-amber-400">Ref: ${escapeHtml(ref)}</span><span class="text-emerald-400/70"><i class="fa-solid fa-check-double"></i></span></div>`;
                } else {
                    htmlReferencia = `<div class="mt-2 pt-2 border-t border-slate-700/50 text-[10px] text-slate-500 italic flex items-center gap-1"><i class="fa-solid fa-triangle-exclamation"></i> Sin referencia</div>`;
                }
            }

            colFinalizado.innerHTML += `
                <div onclick="abrirModalDetalle('${idReal}')" class="bg-slate-700/20 hover:bg-slate-700/50 p-3 rounded-lg border border-emerald-500/10 hover:border-emerald-500/30 transition cursor-pointer mb-2 flex flex-col">
                    <div class="flex justify-between items-start w-full">
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-semibold text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded border border-emerald-400/20">#${idVisual}</span>
                            ${btnWhatsApp}
                            ${btnMoto}
                        </div>
                        <span class="text-[10px] text-slate-400 font-medium whitespace-nowrap"><i class="fa-regular fa-clock"></i> ${hora}</span>
                    </div>
                    <div class="mt-2 w-full">
                        <h4 class="font-bold text-white text-sm truncate">${clienteSeguro} ${etiquetaEntrega}</h4>
                        ${telefonoSeguro ? `<p class="text-[11px] text-slate-400 mt-0.5">${telefonoSeguro}</p>` : ''}
                    </div>
                    <div class="flex justify-between items-end mt-2 w-full">
                        <span class="text-[11px] text-slate-400 underline decoration-slate-600 underline-offset-2 hover:text-white transition">Ver Recibo</span>
                        ${htmlMontoFinalizado}
                    </div>
                    ${htmlReferencia}
                </div>`;
        }
    });

    if (document.getElementById('cantCalculandoDelivery')) {
        document.getElementById('cantCalculandoDelivery').innerText = conteoCalculando;
    }
    document.getElementById('cantPagoPendiente').innerText = conteoPago; 
    document.getElementById('cantEnCocina').innerText = conteoCocina; 
    document.getElementById('cantFinalizado').innerText = conteoFinalizado;

    const totalVentasFormateado = formatearMoneda(totalVentasDia);
    const totalVentasBsFormateado = formatearMoneda(totalVentasDiaBs); // 🌟 NUEVO: Sumatoria histórica perfecta
    if (document.getElementById('totalDiaBottom')) document.getElementById('totalDiaBottom').innerHTML = `<div class="flex flex-col text-right leading-tight"><span class="text-lg font-bold text-emerald-400">$${totalVentasFormateado}</span><span class="text-[10px] font-bold text-amber-400">Bs. ${totalVentasBsFormateado}</span></div>`;
}

// --- VER RECIBOS ---
function verComprobanteDeMemoria(idReal) {
    const pedido = pedidosEnMemoria.find(p => String(p.id_pedido || p['ID_Pedido'] || p.ID || 'S/ID') === String(idReal)); if (!pedido) return;
    const imgData = pedido.imagen_pago || pedido.Imagen_pago || '';
    if (esUrlImagen(imgData)) window.open(imgData, '_blank');
    else if (imgData.length > 50) {
        const w = window.open('', '_blank');
        w.document.write(`<html><head><title>Comprobante #${idReal}</title></head><body style="margin:0; background:#0f172a; display:flex; justify-content:center; align-items:center; min-height:100vh;"><img src="${escapeHtml(imgData)}" style="max-width:100%; max-height:100vh; border-radius:8px;"/></body></html>`);
        w.document.close();
    }
}

function abrirModalDetalle(idPedido) {
    const pedido = pedidosEnMemoria.find(p => String(p.id_pedido || p['ID_Pedido'] || p.ID || 'S/ID') === String(idPedido)); if (!pedido) return;
    const idReal = pedido.id_pedido || pedido['ID_Pedido'] || 'S/ID'; const idVisual = String(idReal).split('-').pop();
    const cliente = pedido.cliente || 'Registrado'; const tel = pedido.telefono || 'No registrado';
    const cedula = pedido.cedula || '';
    const entrega = pedido.tipo_entrega || 'No definido'; const dir = pedido.direccion || 'No especificada';
    const pago = pedido.metodo_pago || 'No especificado'; const arts = pedido.pedido_detallado || '';
    const ref = pedido.referencia_pago || '';
    const monto = parseFloat(String(pedido.total_orden || 0).replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
    const operador = pedido.procesado_por || 'Sin registro';

    document.getElementById('modalID').innerText = `ID Base de datos: #${idVisual}`;

    // Calculamos la tasa histórica primero
    const inputTasa = document.getElementById('tasaBCV');
    const tasaPantalla = inputTasa ? (parseFloat(inputTasa.value) || 1.0) : 1.0;
    const tasaHistorica = pedido.tasa_bcv ? parseFloat(pedido.tasa_bcv) : tasaPantalla;

    document.getElementById('modalCuerpo').innerHTML = construirHtmlModalPedido({
        cliente, tel, cedula, operador, entrega, dir, arts, pago, ref, monto, tasaHistorica,
        imagenPago: pedido.imagen_pago
    });
    document.getElementById('modalDetalle').classList.remove('hidden');
}

function cerrarModal() { document.getElementById('modalDetalle').classList.add('hidden'); }

// --- SISTEMA DE TIEMPO REAL (PUSHER) ---
// En el prototipo Pusher es un simulado (mock-api.js) que avisa entre pestañas del mismo navegador
Pusher.logToConsole = false; 

const pusher = new Pusher('demo', { cluster: 'demo' });

// Nos suscribimos al mismo canal que configuramos en n8n
const channel = pusher.subscribe('canal-cocina');

// Escuchamos el evento exacto
channel.bind('actualizar-tablero', function(data) {
    console.log("¡Señal de Pusher recibida! Actualizando tablero...");
    
    // Al recibir el aviso, ejecutamos la carga de pedidos inmediatamente
    cargarPedidos();
});

// ==========================================
// ARRANQUE PRINCIPAL (PANTALLA DE OPERACIONES)
// ==========================================
async function inicializarTablero() {
    const calendario = document.getElementById('calendarioFiltro');
    if (calendario && !calendario.value) {
        calendario.value = new Date().toLocaleDateString('en-CA', {timeZone: 'America/Caracas'});
    }
    
    await cargarMotorizadosDesdeDB();
    verificarSesion();
    actualizarTasaBCV();
}

if (document.getElementById('vistaLogin')) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializarTablero);
    } else {
        inicializarTablero();
    }
}

function obtenerEmojiPlato() {
    const emojis = ['🍔', '🍟', '🍗', '🥤', '🍦', '🌭', '🍕', '🔥', '🍩', '🧃'];
    return emojis[Math.floor(Math.random() * emojis.length)];
}

// Precio que se cobra por casi todos los deliveries. Cambiarlo aqui cambia
// el boton del modal y lo que se cobra al tocarlo.
const PRECIO_DELIVERY_ESTANDAR = 2;
let DELIVERY_CFG = null;
// El panel (pestaña Delivery) puede cambiar el precio estándar y el modo; se lee una vez.
async function cargarConfigDelivery() {
    if (DELIVERY_CFG) return DELIVERY_CFG;
    try {
        const r = await fetch(API_BASE + '/api/delivery/config', { headers: authHeaders() });
        if (r.ok) { const d = await r.json(); if (d && d.config) DELIVERY_CFG = d.config; }
    } catch (e) { console.error('No se pudo leer la configuración de delivery:', e); }
    return DELIVERY_CFG;
}
function precioEstandarDelivery() {
    const n = DELIVERY_CFG ? Number(DELIVERY_CFG.precio_estandar) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : PRECIO_DELIVERY_ESTANDAR;
}

// Devuelve { precio }, o null si el cajero cancela.
// Hay dos caminos: el boton del precio estandar ($2), que es el de todos los
// dias, y el campo "otro monto" para las direcciones lejanas.
// El "¿con cuánto paga?" ya no se pregunta aquí: vive en el modal de
// Validar Pago (pedirComprobantePago), porque el cliente recién responde con
// qué billete viene después de recibir el cobro, que sale de este paso.
function pedirPrecioDelivery(cliente, pedido) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modalPrecioDelivery');
        const inputPrecio = document.getElementById('inputPrecioDelivery');
        const txtCliente = document.getElementById('txtClienteDelivery');
        const btnEstandar = document.getElementById('btnDeliveryEstandar');

        txtCliente.innerText = `Cliente: ${cliente}`;
        inputPrecio.value = '';
        if (btnEstandar) btnEstandar.innerText = `Delivery estándar · $${precioEstandarDelivery()}`;

        // Tarifa por distancia: si el cliente compartió su ubicación, la tabla del panel ya calculó el precio.
        const btnSug = document.getElementById('btnDeliverySugerido');
        const sugerido = pedido && pedido.delivery_sugerido != null ? Number(pedido.delivery_sugerido) : NaN;
        if (btnSug) {
            if (Number.isFinite(sugerido)) {
                btnSug.classList.remove('hidden');
                btnSug.innerText = `📍 Tarifa por distancia · $${sugerido.toFixed(2)}` + (pedido.distancia_km ? ` (${pedido.distancia_km} km)` : '');
                btnSug.onclick = () => confirmar(String(sugerido));
            } else { btnSug.classList.add('hidden'); btnSug.onclick = null; }
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');

        // Cierra el modal y entrega el monto elegido, venga del boton o del campo.
        const confirmar = (valor) => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            resolve({ precio: valor });
        };

        if (btnEstandar) btnEstandar.onclick = () => confirmar(String(precioEstandarDelivery()));

        document.getElementById('btnAceptarDelivery').onclick = () => {
            const valor = inputPrecio.value.trim();
            if (valor === '') { alert("Escribe el otro monto, o usa el botón del precio estándar."); return; }
            confirmar(valor);
        };

        // Enter en el campo de "otro monto" equivale a tocar Aplicar.
        inputPrecio.onkeydown = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btnAceptarDelivery').click(); }
        };

        document.getElementById('btnCancelarDelivery').onclick = () => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            resolve(null);
        };
    });
}

async function procesarPrecioDelivery(idPedido) {
    const pedido = pedidosEnMemoria.find(p => String(p.id_pedido || p['ID_Pedido'] || p.ID || 'S/ID') === String(idPedido));
    if (!pedido) return;

    await cargarConfigDelivery();
    const respuestaDelivery = await pedirPrecioDelivery(pedido.cliente, pedido);
    if (respuestaDelivery === null) return;

    const costoDelivery = parseFloat(String(respuestaDelivery.precio).replace(',', '.'));
    if (isNaN(costoDelivery)) {
        alert("Monto inválido.");
        return;
    }

    const nuevoTotal = parseFloat(pedido.total_orden) + costoDelivery;
    const nuevoDetalle = pedido.pedido_detallado + `\n1x Servicio de Delivery ($${costoDelivery})`;
    const operadorFirma = usuarioActivo ? `${usuarioActivo.nombre} (${usuarioActivo.rol})` : "No registrado";
    
    // CAPTURAMOS LA TASA DE LA PANTALLA Y CALCULAMOS BOLÍVARES
    const tasaActual = parseFloat(document.getElementById('tasaBCV').value) || 1;
    const totalBs = nuevoTotal * tasaActual;
    const totalBsFormateado = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalBs);

    const index = pedidosEnMemoria.findIndex(p => String(p.id_pedido || p['ID_Pedido'] || p.ID) === String(idPedido));
    pedidosEnMemoria[index].estado = 'Pago Pendiente';
    pedidosEnMemoria[index].total_orden = nuevoTotal;
    pedidosEnMemoria[index].pedido_detallado = nuevoDetalle;
    pedidosEnMemoria[index].tasa_bcv = tasaActual; 
    renderizarTablero();

    const payload = {
        id: idPedido, 
        estado: 'Pago Pendiente', 
        cliente: pedido.cliente, 
        pedido_detallado: nuevoDetalle, 
        total_orden: nuevoTotal,   
        telefono: pedido.telefono || '', 
        tipo_entrega: pedido.tipo_entrega || '', 
        metodo_pago: pedido.metodo_pago || pedido['Método de pago'] || pedido.Metodo_pago || '',
        procesado_por: operadorFirma,
        referencia_pago: pedido.referencia_pago || "", 
        imagen_pago: "Sin comprobante",
        es_cotizacion_delivery: true,
        tasa_bcv: tasaActual,

        // Para el aviso al grupo de motorizados. El "paga_con" no viaja aquí:
        // se captura al aceptar el pago, que sigue siendo antes del despacho.
        precio_delivery: costoDelivery
    };
    
    // 1. Actualizamos el estado en la base de datos
    fetch(API_ACTUALIZAR_ESTADO, { 
        method: 'POST', 
        headers: authHeaders(), 
        body: JSON.stringify(payload) 
    }).catch(e => console.error("Error BD:", e));

    // 2. MAGIA NUEVA: Disparamos la notificación de cobro al cliente
    const payloadCobro = {
        telefono: payload.telefono,
        cliente: payload.cliente,
        pedido_detallado: payload.pedido_detallado,
        total_orden: payload.total_orden,
        metodo_pago: payload.metodo_pago,
        total_bs: totalBsFormateado,
        id_visual: String(idPedido)
    };

    fetch(API_BASE + "/api/pedidos/notificar-cobro", { 
        method: 'POST', 
        headers: authHeaders(), 
        body: JSON.stringify(payloadCobro) 
    }).catch(e => console.error("Error enviando WhatsApp de cobro:", e));
}

// --- FUNCIONES DEL REPARTIDOR ---
let idPedidoRepartidorActual = null;

function abrirModalRepartidor(idReal, evento) {
    evento.stopPropagation(); 
    idPedidoRepartidorActual = idReal;
    
    const pedido = pedidosEnMemoria.find(p => String(p.id_pedido || p['ID_Pedido'] || p.ID || 'S/ID') === String(idReal));
    if (!pedido) return;

    document.getElementById('txtPedidoRepartidor').innerText = `Pedido para: ${pedido.cliente}`;
    const select = document.getElementById('selectRepartidor');
    select.innerHTML = '<option value="">-- Seleccionar --</option>';
    
    MOTORIZADOS_SISTEMA.forEach(m => {
        select.innerHTML += `<option value="${escapeHtml(m.nombre)}">${escapeHtml(m.nombre)}</option>`;
    });
    
    if (pedido.repartidor) select.value = pedido.repartidor;

    const modal = document.getElementById('modalAsignarRepartidor');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function cerrarModalRepartidor() {
    const modal = document.getElementById('modalAsignarRepartidor');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    idPedidoRepartidorActual = null;
}

function guardarRepartidor() {
    const select = document.getElementById('selectRepartidor');
    const nombreRepartidor = select.value;
    
    if (nombreRepartidor === "") {
        alert("Por favor selecciona un repartidor válido de la lista.");
        return;
    }

    const index = pedidosEnMemoria.findIndex(p => String(p.id_pedido || p['ID_Pedido'] || p.ID) === String(idPedidoRepartidorActual));
    if (index === -1) return;
    const pedido = pedidosEnMemoria[index];
    
    const idSeguro = idPedidoRepartidorActual;
    
    pedidosEnMemoria[index].repartidor = nombreRepartidor;
    renderizarTablero();

    const operadorFirma = usuarioActivo ? `${usuarioActivo.nombre} (${usuarioActivo.rol})` : "No registrado";
    
    // 🌟 RESCATAMOS LA TASA INTACTA QUE YA TENÍA EL PEDIDO 🌟
    const tasaIntacta = pedido.tasa_bcv || parseFloat(document.getElementById('tasaBCV').value) || 1;

    const payload = {
        id_pedido: idSeguro,
        id: idSeguro,
        estado: pedido.estado, 
        cliente: pedido.cliente,
        pedido_detallado: pedido.pedido_detallado,
        total_orden: pedido.total_orden,
        telefono: pedido.telefono || '',
        tipo_entrega: pedido.tipo_entrega || '',
        metodo_pago: pedido.metodo_pago || '',
        procesado_por: operadorFirma,
        referencia_pago: pedido.referencia_pago || "",
        imagen_pago: pedido.imagen_pago || "",
        repartidor: nombreRepartidor,
        actualizacion_silenciosa: true,
        tasa_bcv: tasaIntacta // <-- AHORA ENVIAMOS LA TASA DE VUELTA PARA QUE NO SE BORRE
    };

    fetch(API_ACTUALIZAR_ESTADO, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload)
    }).catch(e => console.error("Error BD:", e));
    
    cerrarModalRepartidor();
}
