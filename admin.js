// =====================================================================
// 🍔 PROTOTIPO COMIDA RÁPIDA - PANEL DE ADMINISTRACIÓN AVANZADO (admin.js) 🍔
// Lógica exclusiva, limpia y blindada.
// =====================================================================

// --- URLs DE CONEXIÓN CON FASTAPI (REEMPLAZANDO n8n) ---
const API_VALIDAR_ACCESO = API_BASE + "/api/usuarios/validar-acceso";
const ADMIN_URL_MENU = API_BASE + "/api/menu/";
const ADMIN_URL_GUARDAR_CAT = API_BASE + "/api/menu/guardar-categoria";
const ADMIN_URL_GUARDAR_PROD = API_BASE + "/api/menu/guardar-producto";
const ADMIN_URL_GUARDAR_COMBO = API_BASE + "/api/menu/guardar-combo";
const ADMIN_URL_ELIMINAR = API_BASE + "/api/menu/eliminar-item";
const ADMIN_URL_ORDENAR = API_BASE + "/api/menu/ordenar";

const URL_OBTENER_USUARIOS_ADMIN = API_BASE + "/api/usuarios/";
const ADMIN_URL_GUARDAR_USUARIO = API_BASE + "/api/usuarios/guardar";
const ADMIN_URL_ELIMINAR_USUARIO = API_BASE + "/api/usuarios/eliminar";

const URL_OBTENER_MOTORIZADOS = API_BASE + "/api/motorizados/";
const ADMIN_URL_GUARDAR_MOT = API_BASE + "/api/motorizados/guardar";
const ADMIN_URL_ELIMINAR_MOT = API_BASE + "/api/motorizados/eliminar";

const URL_OBTENER_MSJ = API_BASE + "/api/mensajes/";
const URL_GUARDAR_MSJ = API_BASE + "/api/mensajes/guardar";

const URL_OBTENER_HORARIOS = API_BASE + "/api/horarios/";
const URL_GUARDAR_HORARIOS = API_BASE + "/api/horarios/guardar";

const URL_OBTENER_ANUNCIOS = API_BASE + "/api/anuncios/";
const ADMIN_URL_GUARDAR_ANUNCIO = API_BASE + "/api/anuncios/guardar";
const ADMIN_URL_ELIMINAR_ANUNCIO = API_BASE + "/api/anuncios/eliminar";


// ==========================================
// SUBIDA DE IMÁGENES DE MENÚ (redimensiona antes de guardar (en el prototipo queda en el navegador))
// ==========================================
function redimensionarImagen(file, maxDimension = 700, calidad = 0.8) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
            let { width, height } = img;
            if (width > maxDimension || height > maxDimension) {
                if (width > height) {
                    height = Math.round(height * (maxDimension / width));
                    width = maxDimension;
                } else {
                    width = Math.round(width * (maxDimension / height));
                    height = maxDimension;
                }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            canvas.toBlob(blob => {
                URL.revokeObjectURL(objectUrl);
                if (blob) resolve(blob); else reject(new Error('No se pudo procesar la imagen'));
            }, 'image/jpeg', calidad);
        };
        img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('No se pudo leer la imagen')); };
        img.src = objectUrl;
    });
}

// El ancho a guardar depende del tamaño MÁS GRANDE en que esa imagen llega a
// verse en el menú del cliente (ver urlImagen en config.js):
//   - categorías: solo aparecen en un recuadro de 48px, nunca en grande
//   - productos/combos: se abren en el modal de detalle y en el lightbox
//   - anuncios: ocupan casi toda la pantalla del popup
// Guardar más grande que eso es peso que nadie llega a ver.
const ANCHOS_SUBIDA = { categoria: 300, producto: 900, combo: 900, anuncio: 1000 };

async function manejarSeleccionImagen(event, inputUrlId, statusId, tipoImagen) {
    const file = event.target.files[0];
    if (!file) return;

    const inputUrl = document.getElementById(inputUrlId);
    const statusEl = document.getElementById(statusId);
    if (statusEl) statusEl.innerText = "⏳ Optimizando y subiendo...";

    try {
        const blobRedimensionado = await redimensionarImagen(file, ANCHOS_SUBIDA[tipoImagen] || 900);
        const formData = new FormData();
        formData.append("image", blobRedimensionado, "imagen.jpg");

        const res = await fetch('https://api.imgbb.com/1/upload', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            inputUrl.value = data.data.url;
            const pesoKB = Math.round(blobRedimensionado.size / 1024);
            if (statusEl) statusEl.innerText = `✅ Imagen lista (${pesoKB} KB)`;
        } else {
            if (statusEl) statusEl.innerText = "❌ Error al subir la imagen a ImgBB.";
        }
    } catch (error) {
        console.error("Error redimensionando/subiendo imagen:", error);
        if (statusEl) statusEl.innerText = "❌ No se pudo procesar la imagen.";
    } finally {
        event.target.value = "";
    }
}

// --- MEMORIA DEL ADMINISTRADOR ---
let adminCategorias = [];
let adminProductos = [];
let adminCombos = [];
let USUARIOS_SISTEMA = [];
let MOTORIZADOS_SISTEMA = [];
let adminToken = ""; // 🛡️ LLAVE MAESTRA OCULTA PARA OPERACIONES CRÍTICAS

// ==========================================
// 1. LÓGICA DE SEGURIDAD Y DESBLOQUEO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const inputPin = document.getElementById('input-pin-admin');
    if (inputPin) inputPin.focus();
});

async function desbloquearAdmin() {
    const userIngresado = document.getElementById('input-user-admin').value.trim();
    const pinIngresado = document.getElementById('input-pin-admin').value.trim();
    const errorMsg = document.getElementById('error-pin-admin');
    const boton = document.getElementById('btn-desbloquear-admin');
    
    // Verificamos que no deje las cajas vacías
    if (!userIngresado || !pinIngresado) {
        lanzarErrorBloqueo(errorMsg, boton, "Debes ingresar usuario y PIN.");
        return;
    }
    
    errorMsg.classList.add('hidden');
    boton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando...';
    boton.disabled = true;

    try {
        const response = await fetch(API_VALIDAR_ACCESO, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // AHORA ENVIAMOS EL USUARIO AL BACKEND
            body: JSON.stringify({ tipo: 'login_admin', username: userIngresado, pin: pinIngresado })
        });

        const data = await response.json();

        if (data.success && data.usuario) {
            adminToken = data.token;
            localStorage.setItem('tokioAuthToken', data.token);
            localStorage.setItem('usuarioActivo', JSON.stringify(data.usuario));

            document.getElementById('pantalla-bloqueo-admin').style.opacity = '0';
            setTimeout(() => { document.getElementById('pantalla-bloqueo-admin').classList.add('hidden'); }, 300);
            
            cargarDatosAdmin();
            cargarMensajesWP();
            cargarHorarios();
            cargarAnuncios();
        } else {
            lanzarErrorBloqueo(errorMsg, boton, "Usuario/PIN incorrecto o sin privilegios.");
        }
    } catch (error) {
        lanzarErrorBloqueo(errorMsg, boton, "Error de conexión con el servidor.");
    }
}

function lanzarErrorBloqueo(errorMsg, boton, mensaje) {
    errorMsg.innerText = mensaje;
    errorMsg.classList.remove('hidden');
    boton.innerHTML = 'Desbloquear Panel <i class="fa-solid fa-unlock-keyhole"></i>';
    boton.disabled = false;
    document.getElementById('input-pin-admin').value = ''; // Borramos el PIN por seguridad
    document.getElementById('input-pin-admin').focus();
}

// ==========================================
// 2. CARGA DE DATOS MAESTRA
// ==========================================

// ---- Sucursales (configuración) ----
let SUCURSALES_ADMIN = [];
function nombreSucursalAdmin(id) { const s = SUCURSALES_ADMIN.find(x => Number(x.id) === Number(id)); return s ? s.nombre : ''; }
async function cargarSucursalesAdmin() {
    try {
        const r = await fetch(API_BASE + '/api/sitio?todas=1', { headers: { 'Authorization': `Bearer ${adminToken}` } });
        SUCURSALES_ADMIN = ((await r.json()).sucursales || []).filter(s => s.activa !== false && !s.fuera_de_plan);
    } catch (e) { SUCURSALES_ADMIN = []; }
    pintarCamposSucursal();
}
function pintarCamposSucursal() {
    const multi = SUCURSALES_ADMIN.length > 1;
    const opts = SUCURSALES_ADMIN.map(s => `<option value="${s.id}">${escapeHtml(s.nombre)}</option>`).join('');
    const us = document.getElementById('usr-sucursal');
    if (us) { us.innerHTML = '<option value="">Todas las sucursales</option>' + opts; document.getElementById('wrap-usr-sucursal').style.display = multi ? '' : 'none'; }
    const ms = document.getElementById('mesa-sucursal');
    if (ms) { ms.innerHTML = '<option value="">Sin asignar (aparece en todas)</option>' + opts; document.getElementById('wrap-mesa-sucursal').style.display = multi ? '' : 'none'; }
    ['prod', 'combo'].forEach(pref => {
        const c = document.getElementById(pref + '-sucursales'); if (!c) return;
        c.style.display = multi ? '' : 'none';
        c.innerHTML = '<p style="margin-top:14px;font-weight:700">No disponible en:</p><p style="font-size:0.75rem;color:var(--text-muted)">Marca las sucursales donde NO se vende este plato. Ahí no aparecerá en el menú.</p>' +
            SUCURSALES_ADMIN.map(s => `<label style="display:flex;align-items:center;margin-top:6px;cursor:pointer"><input type="checkbox" data-suc="${s.id}"> ${escapeHtml(s.nombre)}</label>`).join('');
    });
}
function leerNoDisponible(pref) { return Array.from(document.querySelectorAll('#' + pref + '-sucursales input[data-suc]:checked')).map(i => parseInt(i.dataset.suc, 10)); }
function marcarNoDisponible(pref, arr) { const set = new Set((arr || []).map(Number)); document.querySelectorAll('#' + pref + '-sucursales input[data-suc]').forEach(i => { i.checked = set.has(parseInt(i.dataset.suc, 10)); }); }

async function cargarDatosAdmin() {
    try {
        const res = await fetch(ADMIN_URL_MENU);
        const rawData = await res.json();
        const data = Array.isArray(rawData) ? rawData[0] : rawData;
        
        adminCategorias = data.menu ? (data.menu.categorias || []) : [];
        adminProductos = data.menu ? (data.menu.productos || []) : [];
        adminCombos = data.menu ? (data.menu.combos || []) : [];

        await cargarSucursalesAdmin();
        renderListaCategorias();
        renderListaProductos();
        renderListaCombos();
        actualizarSelectCategorias();
        actualizarSelectsCombos();

        ocultarPestanaMotorizados();
        await cargarMotorizadosDesdeDB();
        await cargarUsuariosDesdeDB();
        
        const listaItems = document.getElementById('lista-items-combo');
        if (listaItems && listaItems.innerHTML === '') agregarFilaProductoCombo();
    } catch (error) {
        console.error("Error cargando datos del admin:", error);
    }
}

// ==========================================
// 3. MENSAJES DE WHATSAPP
// ==========================================
async function cargarMensajesWP() {
    const txtRecepcion = document.getElementById('msg-recepcion');
    if(!txtRecepcion) return; 

    // Antes de pedir nada: si la carga falla, el recuadro tiene que quedar
    // escondido igual. Esconderlo no le quita el texto, porque un elemento
    // con display:none acepta que le asignen .value como cualquier otro.
    ocultarPlantillaZelle();

    try {
        txtRecepcion.value = "Cargando plantillas desde la base de datos...";
        const res = await fetch(URL_OBTENER_MSJ, { headers: authHeaders() });
        const data = await res.json();
        const mensajes = Array.isArray(data) ? data : (data.data || []);
        
        mensajes.forEach(m => {
            if(m.id === 'recepcion') document.getElementById('msg-recepcion').value = m.texto;
            if(m.id === 'cobro_pago_movil') document.getElementById('msg-cobro-pago-movil').value = m.texto;
            if(m.id === 'cobro_zelle') document.getElementById('msg-cobro-zelle').value = m.texto;
            if(m.id === 'cobro_efectivo') document.getElementById('msg-cobro-efectivo').value = m.texto;
            if(m.id === 'aprobado') document.getElementById('msg-aprobado').value = m.texto;
            if(m.id === 'final_delivery') document.getElementById('msg-final-delivery').value = m.texto;
            if(m.id === 'final_pickup') document.getElementById('msg-final-pickup').value = m.texto;
            if(m.id === 'modificado') document.getElementById('msg-modificado').value = m.texto;
            if(m.id === 'aviso_grupo_delivery') document.getElementById('msg-grupo-delivery').value = m.texto;
        });
    } catch (e) { 
        if(txtRecepcion) txtRecepcion.value = "Error de conexión. Verifica n8n.";
    }
}

const formMensajes = document.getElementById('form-mensajes');
if(formMensajes) {
    formMensajes.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            recepcion: document.getElementById('msg-recepcion').value,
            cobro_pago_movil: document.getElementById('msg-cobro-pago-movil').value,
            cobro_zelle: document.getElementById('msg-cobro-zelle').value,
            cobro_efectivo: document.getElementById('msg-cobro-efectivo').value,
            aprobado: document.getElementById('msg-aprobado').value,
            final_delivery: document.getElementById('msg-final-delivery').value,
            final_pickup: document.getElementById('msg-final-pickup').value,
            modificado: document.getElementById('msg-modificado').value,
            aviso_grupo_delivery: document.getElementById('msg-grupo-delivery').value
        };
        try {
            await fetch(URL_GUARDAR_MSJ, { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}`}, 
                body: JSON.stringify(payload) 
            });
            alert("¡Mensajes actualizados con éxito!");
        } catch (error) { alert("Error al guardar en la base de datos."); }
    });
}

// ==========================================
// 4. GESTIÓN DE USUARIOS
// ==========================================
async function cargarUsuariosDesdeDB() {
    try {
        const response = await fetch(URL_OBTENER_USUARIOS_ADMIN, { headers: authHeaders() });
        const data = await response.json();
        USUARIOS_SISTEMA = Array.isArray(data) ? data : (data.data || []);
        renderListaUsuarios();
    } catch (error) { console.error("Error obteniendo usuarios:", error); }
}

function renderListaUsuarios() {
    const cont = document.getElementById('lista-usuarios-container');
    if(!cont) return;
    cont.innerHTML = '';
    
    if (USUARIOS_SISTEMA.length === 0) {
        cont.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">No hay usuarios registrados.</p>'; return;
    }
    
    USUARIOS_SISTEMA.forEach(u => {
        const esAdmin = (String(u.rol).toLowerCase() === 'admin' || String(u.rol).toLowerCase() === 'superadmin');
        let botones = esAdmin 
            ? `<button type=\"button\" class=\"action-btn btn-edit\" onclick=\"editarUsuario(${u.id})\" title=\"Editar\">✏️</button>
               <span style="font-size: 10px; background: rgba(239,68,68,0.2); color: #f87171; padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(239,68,68,0.3); text-transform: uppercase; font-weight: bold;">Protegido 🛡️</span>`
            : `<button type="button" class="action-btn btn-edit" onclick="editarUsuario(${u.id})" title="Editar">✏️</button>
               <button type="button" class="action-btn btn-delete" onclick="eliminarUsuario(${u.id})" title="Eliminar">🗑️</button>`;

        cont.innerHTML += `
            <div class="list-item">
                <div class="item-info">
                    <p class="item-title">👤 ${u.nombre}</p>
                    <p class="item-meta">User: <span style="color:#38bdf8; font-weight:bold;">${u.username}</span> | Rol: ${u.rol}${u.sucursal_id ? ' | 📍 ' + escapeHtml(nombreSucursalAdmin(u.sucursal_id)) : ''}</p>
                </div>
                <div class="item-actions">${botones}</div>
            </div>`;
    });
}

if (document.getElementById('form-usuario')) {
    document.getElementById('form-usuario').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('usr-id').value;
        const pinIngresado = document.getElementById('usr-pin').value.trim();

        if (!id && !pinIngresado) {
            alert('El PIN es obligatorio al crear un usuario nuevo.');
            return;
        }

        const payload = {
            id: id ? parseInt(id) : null,
            nombre: document.getElementById('usr-nombre').value.trim(),
            username: document.getElementById('usr-username').value.trim(),
            pin: pinIngresado || null,
            rol: document.getElementById('usr-rol').value,
            sucursal_id: parseInt((document.getElementById('usr-sucursal') || {}).value, 10) || null
        };
        try {
            const res = await fetch(ADMIN_URL_GUARDAR_USUARIO, { 
                method: 'POST', 
                headers:{'Content-Type':'application/json', 'Authorization': `Bearer ${adminToken}`}, 
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (!data.success) {
                alert("Error de Base de Datos: " + data.error);
                return;
            }
            
            resetFormUsr(); 
            await cargarUsuariosDesdeDB();
        } catch (error) { alert('Error de red al intentar conectar con el servidor.'); }
    });
}

function desplazarseAlFormulario(idTitulo) {
    const el = document.getElementById(idTitulo);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function editarUsuario(id) {
    const u = USUARIOS_SISTEMA.find(x => x.id === id); if(!u) return;
    document.getElementById('usr-id').value = u.id;
    document.getElementById('usr-nombre').value = u.nombre;
    document.getElementById('usr-username').value = u.username;
    // El PIN nunca vuelve del backend (queda hasheado) — se deja vacío,
    // solo se sobreescribe si el admin escribe uno nuevo.
    const inputPin = document.getElementById('usr-pin');
    inputPin.value = '';
    inputPin.placeholder = 'Dejar en blanco para no cambiar la contraseña';
    document.getElementById('usr-rol').value = u.rol;
    if (document.getElementById('usr-sucursal')) document.getElementById('usr-sucursal').value = u.sucursal_id || '';
    document.getElementById('titulo-form-usr').innerText = "Editar Usuario";
    document.getElementById('btn-save-usr').innerText = "💾 Actualizar Usuario";
    document.getElementById('btn-cancel-usr').style.display = "block";
    desplazarseAlFormulario('titulo-form-usr');
}

function resetFormUsr() {
    document.getElementById('form-usuario').reset();
    document.getElementById('usr-id').value = "";
    document.getElementById('usr-pin').placeholder = 'Contraseña';
    document.getElementById('titulo-form-usr').innerText = "Crear Usuario";
    document.getElementById('btn-save-usr').innerText = "💾 Guardar Usuario";
    document.getElementById('btn-cancel-usr').style.display = "none";
}

async function eliminarUsuario(id) {
    if (!confirm(`¿Seguro que deseas ELIMINAR este usuario del sistema?`)) return;
    try {
        await fetch(ADMIN_URL_ELIMINAR_USUARIO, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }, 
            body: JSON.stringify({ id: id }) 
        });
        await cargarUsuariosDesdeDB();
    } catch(e) { alert('Error al eliminar.'); }
}

// ==========================================
// 5. GESTIÓN DE MOTORIZADOS
// ==========================================

// Esconde el recuadro de la plantilla de Zelle cuando esta apagada en
// config.js. Solo lo oculta: el textarea sigue en el HTML, asi que su texto
// se sigue cargando y volviendo a guardar sin que nadie lo pise.
function ocultarPlantillaZelle() {
    if (typeof PLANTILLA_ZELLE === "undefined" || PLANTILLA_ZELLE) return;
    ocultarSiExiste('#bloque-plantilla-zelle');
}

// Esconde la pestana "Motorizados" cuando la funcion esta apagada en
// config.js. Solo oculta: el formulario y la lista siguen en el HTML y
// vuelven solos poniendo FUNCION_MOTORIZADOS en true.
function ocultarPestanaMotorizados() {
    if (typeof FUNCION_MOTORIZADOS === "undefined" || FUNCION_MOTORIZADOS) return;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if ((btn.getAttribute('onclick') || '').includes('motorizados')) btn.style.display = 'none';
    });
    ocultarSiExiste('#tab-motorizados');
}

async function cargarMotorizadosDesdeDB() {
    // Funcion apagada desde config.js: no se pide nada al backend.
    if (typeof FUNCION_MOTORIZADOS !== "undefined" && !FUNCION_MOTORIZADOS) return;
    try {
        const res = await fetch(URL_OBTENER_MOTORIZADOS + "?t=" + new Date().getTime(), { headers: authHeaders() });
        const data = await res.json();
        MOTORIZADOS_SISTEMA = Array.isArray(data) ? data : (data.data || []);
        renderListaMotorizados();
    } catch (error) { console.error("Error obteniendo motorizados:", error); }
}

function renderListaMotorizados() {
    const cont = document.getElementById('lista-motorizados-container');
    if(!cont) return;
    cont.innerHTML = '';
    
    if (MOTORIZADOS_SISTEMA.length === 0) {
        cont.innerHTML = '<p class="text-sm text-slate-500 italic">No hay motorizados registrados.</p>'; return;
    }
    
    MOTORIZADOS_SISTEMA.forEach(m => {
        cont.innerHTML += `
            <div class="list-item">
                <div class="item-info"><p class="item-title">🏍️ ${m.nombre}</p></div>
                <div class="item-actions">
                    <button class="action-btn btn-edit" onclick="editarMotorizado(${m.id})" title="Editar">✏️</button>
                    <button class="action-btn btn-delete" onclick="eliminarMotorizado(${m.id})" title="Eliminar">🗑️</button>
                </div>
            </div>`;
    });
}

if (document.getElementById('form-motorizado')) {
    document.getElementById('form-motorizado').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('mot-id').value;
        const payload = { id: id ? parseInt(id) : null, nombre: document.getElementById('mot-nombre').value.trim() };
        try {
            const res = await fetch(ADMIN_URL_GUARDAR_MOT, { 
                method: 'POST', 
                headers:{'Content-Type':'application/json', 'Authorization': `Bearer ${adminToken}`}, 
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (!data.success) {
                alert("Error de Base de Datos: " + data.error);
                return;
            }
            
            resetFormMot(); 
            await cargarMotorizadosDesdeDB();
        } catch (error) { alert('Error de red al intentar conectar con el servidor.'); }
    });
}

function editarMotorizado(id) {
    const m = MOTORIZADOS_SISTEMA.find(x => x.id === id); if(!m) return;
    document.getElementById('mot-id').value = m.id; 
    document.getElementById('mot-nombre').value = m.nombre;
    document.getElementById('titulo-form-mot').innerText = "Editar Motorizado";
    document.getElementById('btn-save-mot').innerText = "💾 Actualizar";
    document.getElementById('btn-cancel-mot').style.display = "block";
    desplazarseAlFormulario('titulo-form-mot');
}

function resetFormMot() {
    document.getElementById('form-motorizado').reset(); 
    document.getElementById('mot-id').value = "";
    document.getElementById('titulo-form-mot').innerText = "Registrar Motorizado";
    document.getElementById('btn-save-mot').innerText = "💾 Guardar Chofer";
    document.getElementById('btn-cancel-mot').style.display = "none";
}

async function eliminarMotorizado(id) {
    if (!confirm(`¿Seguro que deseas eliminar este motorizado?`)) return;
    try {
        await fetch(ADMIN_URL_ELIMINAR_MOT, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }, 
            body: JSON.stringify({ id: id }) 
        });
        await cargarMotorizadosDesdeDB();
    } catch(e) { alert('Error al eliminar.'); }
}

// ==========================================
// GESTIÓN DEL HORARIO DE ATENCIÓN
// ==========================================
async function cargarHorarios() {
    try {
        const res = await fetch(URL_OBTENER_HORARIOS, { headers: authHeaders() });
        const data = await res.json();
        const horarios = Array.isArray(data) ? data : (data.data || []);
        horarios.forEach(h => {
            const chk = document.getElementById(`hor-activo-${h.dia_semana}`);
            const inicio = document.getElementById(`hor-inicio-${h.dia_semana}`);
            const fin = document.getElementById(`hor-fin-${h.dia_semana}`);
            if (!chk || !inicio || !fin) return;
            chk.checked = h.activo;
            inicio.value = h.hora_apertura || '';
            fin.value = h.hora_cierre || '';
            inicio.disabled = !h.activo;
            fin.disabled = !h.activo;
        });
    } catch (error) { console.error("Error obteniendo horarios:", error); }
}

function toggleHorarioDia(dia) {
    const activo = document.getElementById(`hor-activo-${dia}`).checked;
    document.getElementById(`hor-inicio-${dia}`).disabled = !activo;
    document.getElementById(`hor-fin-${dia}`).disabled = !activo;
}

async function guardarHorarios() {
    const btn = document.getElementById('btn-save-horarios');
    const horarios = [];
    for (let dia = 0; dia <= 6; dia++) {
        const activo = document.getElementById(`hor-activo-${dia}`).checked;
        const inicio = document.getElementById(`hor-inicio-${dia}`).value;
        const fin = document.getElementById(`hor-fin-${dia}`).value;
        if (activo && (!inicio || !fin)) {
            alert('Falta la hora de apertura o cierre en un día marcado como abierto.');
            return;
        }
        horarios.push({ dia_semana: dia, activo, hora_apertura: inicio || '00:00', hora_cierre: fin || '00:00' });
    }

    btn.disabled = true; btn.innerText = "Guardando...";
    try {
        const res = await fetch(URL_GUARDAR_HORARIOS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
            body: JSON.stringify({ horarios })
        });
        const data = await res.json();
        if (data.success) {
            alert("✅ Horario de atención actualizado.");
        } else {
            alert("Error al guardar: " + (data.detail || data.error || "desconocido"));
        }
    } catch (error) {
        alert('Error de red al guardar el horario.');
    } finally {
        btn.disabled = false; btn.innerText = "💾 Guardar Horario";
    }
}

// ==========================================
// GESTIÓN DE ANUNCIOS (popup al abrir el menú)
// ==========================================
let ANUNCIOS_SISTEMA = [];

async function cargarAnuncios() {
    try {
        const res = await fetch(URL_OBTENER_ANUNCIOS + "?t=" + new Date().getTime(), { headers: authHeaders() });
        const data = await res.json();
        ANUNCIOS_SISTEMA = Array.isArray(data) ? data : (data.data || []);
        renderListaAnuncios();
    } catch (error) { console.error("Error obteniendo anuncios:", error); }
}

function renderListaAnuncios() {
    const cont = document.getElementById('lista-anuncios-container');
    if(!cont) return;
    cont.innerHTML = '';

    if (ANUNCIOS_SISTEMA.length === 0) {
        cont.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">No hay anuncios creados.</p>'; return;
    }

    ANUNCIOS_SISTEMA.forEach(a => {
        const opacityClass = a.activo ? '' : 'deshabilitado';
        cont.innerHTML += `
            <div class="list-item ${opacityClass}">
                <div class="item-info">
                    <p class="item-title">📢 ${a.titulo || '(sin título)'}</p>
                    <p class="item-meta">Orden: ${a.orden || 0} | Activo: ${a.activo ? 'Sí' : 'No'}</p>
                </div>
                <div class="item-actions">
                    <button class="action-btn btn-edit" onclick="editarAnuncio(${a.id})" title="Editar">✏️</button>
                    <button class="action-btn btn-delete" onclick="eliminarAnuncio(${a.id})" title="Eliminar">🗑️</button>
                </div>
            </div>`;
    });
}

function buscarItemAnuncio(inputElement) {
    const contenedor = document.getElementById('caja-sugerencias-anuncio-item');
    document.getElementById('anuncio-item-ref').value = '';
    const texto = inputElement.value.toLowerCase().trim();
    const comboFiltrados = adminCombos.filter(c => c.nombre.toLowerCase().includes(texto));
    const prodFiltrados = adminProductos.filter(p => p.nombre.toLowerCase().includes(texto));

    let html = `<div data-ref="" data-nombre="" onclick="seleccionarItemAnuncio(this)" style="padding: 10px; cursor: pointer; font-size: 13px; color: #94a3b8; font-style: italic; border-bottom: 1px solid #334155;" onmouseover="this.style.background='#334155'" onmouseout="this.style.background='transparent'">Ninguno (anuncio solo informativo)</div>`;
    if (comboFiltrados.length > 0) {
        comboFiltrados.forEach(c => {
            const nombreLegible = `🍱 ${c.nombre} ($${c.precio.toFixed(2)})`;
            html += `<div data-ref="c_${c.id}" data-nombre="${escapeHtml(nombreLegible)}" onclick="seleccionarItemAnuncio(this)" style="padding: 10px; cursor: pointer; font-size: 13px; color: white; border-bottom: 1px solid #334155;" onmouseover="this.style.background='#334155'" onmouseout="this.style.background='transparent'">${escapeHtml(nombreLegible)}</div>`;
        });
    }
    if (prodFiltrados.length > 0) {
        prodFiltrados.forEach(p => {
            const nombreLegible = `🍔 ${p.nombre} ($${p.precio.toFixed(2)})`;
            html += `<div data-ref="p_${p.id}" data-nombre="${escapeHtml(nombreLegible)}" onclick="seleccionarItemAnuncio(this)" style="padding: 10px; cursor: pointer; font-size: 13px; color: white; border-bottom: 1px solid #334155;" onmouseover="this.style.background='#334155'" onmouseout="this.style.background='transparent'">${escapeHtml(nombreLegible)}</div>`;
        });
    }

    document.querySelectorAll('.caja-sugerencias').forEach(caja => caja.style.display = 'none');
    contenedor.innerHTML = html;
    contenedor.style.display = 'block';
}

function seleccionarItemAnuncio(elemento) {
    document.getElementById('anuncio-item-ref').value = elemento.dataset.ref;
    document.getElementById('anuncio-item-visible').value = elemento.dataset.nombre || '';
    document.getElementById('caja-sugerencias-anuncio-item').style.display = 'none';
}

if (document.getElementById('form-anuncio')) {
    document.getElementById('form-anuncio').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('anuncio-id').value;
        const imagen = document.getElementById('anuncio-imagen').value.trim();
        if (!imagen) { alert('Falta la imagen del anuncio.'); return; }
        const payload = {
            id: id ? parseInt(id) : null,
            imagen,
            titulo: document.getElementById('anuncio-titulo').value.trim(),
            texto: document.getElementById('anuncio-texto').value.trim(),
            activo: document.getElementById('anuncio-activo').checked,
            orden: parseInt(document.getElementById('anuncio-orden').value) || 0,
            producto_ref: document.getElementById('anuncio-item-ref').value || null
        };
        try {
            const res = await fetch(ADMIN_URL_GUARDAR_ANUNCIO, {
                method: 'POST',
                headers:{'Content-Type':'application/json', 'Authorization': `Bearer ${adminToken}`},
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!data.success) { alert("Error de Base de Datos: " + data.error); return; }
            resetFormAnuncio(); await cargarAnuncios();
        } catch (error) { alert('Error al guardar el anuncio.'); }
    });
}

function editarAnuncio(id) {
    const a = ANUNCIOS_SISTEMA.find(x => x.id === id); if(!a) return;
    document.getElementById('anuncio-id').value = a.id;
    document.getElementById('anuncio-imagen').value = a.imagen || '';
    document.getElementById('anuncio-titulo').value = a.titulo || '';
    document.getElementById('anuncio-texto').value = a.texto || '';
    document.getElementById('anuncio-orden').value = a.orden || 0;
    document.getElementById('anuncio-activo').checked = !!a.activo;

    document.getElementById('anuncio-item-ref').value = a.producto_ref || '';
    let nombreItemVinculado = '';
    if (a.producto_ref) {
        const [tipo, refId] = a.producto_ref.split('_');
        const idNum = parseInt(refId);
        if (tipo === 'c') {
            const c = adminCombos.find(x => x.id === idNum);
            if (c) nombreItemVinculado = `🍱 ${c.nombre} ($${c.precio.toFixed(2)})`;
        } else if (tipo === 'p') {
            const p = adminProductos.find(x => x.id === idNum);
            if (p) nombreItemVinculado = `🍔 ${p.nombre} ($${p.precio.toFixed(2)})`;
        }
    }
    document.getElementById('anuncio-item-visible').value = nombreItemVinculado;

    document.getElementById('titulo-form-anuncio').innerText = "Editar Anuncio"; document.getElementById('btn-save-anuncio').innerText = "💾 Actualizar Anuncio"; document.getElementById('btn-cancel-anuncio').style.display = "block";
    desplazarseAlFormulario('titulo-form-anuncio');
}

function resetFormAnuncio() {
    document.getElementById('form-anuncio').reset(); document.getElementById('anuncio-id').value = "";
    document.getElementById('anuncio-orden').value = 0;
    if (document.getElementById('anuncio-imagen-status')) document.getElementById('anuncio-imagen-status').innerText = "O sube una foto: se redimensiona y comprime automáticamente antes de subirla.";
    document.getElementById('titulo-form-anuncio').innerText = "Crear Anuncio"; document.getElementById('btn-save-anuncio').innerText = "💾 Guardar Anuncio"; document.getElementById('btn-cancel-anuncio').style.display = "none";
}

async function eliminarAnuncio(id) {
    if (!confirm(`¿Seguro que deseas eliminar este anuncio?`)) return;
    try {
        await fetch(ADMIN_URL_ELIMINAR_ANUNCIO, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
            body: JSON.stringify({ id: id })
        });
        await cargarAnuncios();
    } catch(e) { alert('Error al eliminar.'); }
}

// ==========================================
// 6. GESTIÓN DEL MENÚ (CAT, PROD, COMBOS)
// ==========================================
function renderListaCategorias(lista = adminCategorias) {
    const cont = document.getElementById('lista-categorias-container');
    if(!cont) return;
    cont.innerHTML = '';
    if (lista.length === 0) { cont.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">No se encontraron categorías.</p>'; return; }

    lista.forEach(cat => {
        cont.innerHTML += `
            <div class="list-item">
                <div class="item-info"><p class="item-title">${cat.nombre}</p></div>
                <div class="item-actions">
                    <button class="action-btn btn-edit" onclick="moverItem(${cat.id}, 'categoria', -1)" title="Subir">▲</button>
                    <button class="action-btn btn-edit" onclick="moverItem(${cat.id}, 'categoria', 1)" title="Bajar">▼</button>
                    <button class="action-btn btn-edit" onclick="editarCategoria(${cat.id})" title="Editar">✏️</button>
                    <button class="action-btn btn-delete" onclick="eliminarItem(${cat.id}, 'categoria')" title="Eliminar">🗑️</button>
                </div>
            </div>`;
    });
}

function filtrarCategoriasAdmin() {
    const input = document.getElementById('buscador-categorias-admin');
    const textoBuscado = input.value.toLowerCase();
    const resultados = adminCategorias.filter(c => c.nombre.toLowerCase().includes(textoBuscado));
    renderListaCategorias(resultados);
    const panel = input.closest('.list-panel');
    if (panel) panel.scrollTop = 0;
}

if (document.getElementById('form-categoria')) {
    document.getElementById('form-categoria').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('cat-id').value;
        const payload = { id: id ? parseInt(id) : null, nombre: document.getElementById('cat-nombre').value.trim(), imagen: document.getElementById('cat-imagen').value.trim() };
        try {
            await fetch(ADMIN_URL_GUARDAR_CAT, { 
                method: 'POST', 
                headers:{'Content-Type':'application/json', 'Authorization': `Bearer ${adminToken}`}, 
                body: JSON.stringify(payload)
            });
            resetFormCat(); cargarDatosAdmin();
        } catch (error) { alert('Error al guardar la categoría.'); }
    });
}

function editarCategoria(id) {
    const cat = adminCategorias.find(c => c.id === id); if(!cat) return;
    document.getElementById('cat-id').value = cat.id; document.getElementById('cat-nombre').value = cat.nombre; document.getElementById('cat-imagen').value = cat.imagen || '';
    document.getElementById('titulo-form-cat').innerText = "Editar Categoría"; document.getElementById('btn-save-cat').innerText = "💾 Actualizar Categoría"; document.getElementById('btn-cancel-cat').style.display = "block";
    document.getElementById('buscador-categorias-admin').value = '';
    renderListaCategorias();
    desplazarseAlFormulario('titulo-form-cat');
}

function resetFormCat() {
    document.getElementById('form-categoria').reset(); document.getElementById('cat-id').value = "";
    if (document.getElementById('cat-imagen')) document.getElementById('cat-imagen').value = "";
    if (document.getElementById('cat-imagen-status')) document.getElementById('cat-imagen-status').innerText = "O sube una foto: se redimensiona y comprime automáticamente antes de subirla.";
    document.getElementById('titulo-form-cat').innerText = "Crear Categoría"; document.getElementById('btn-save-cat').innerText = "💾 Guardar Categoría"; document.getElementById('btn-cancel-cat').style.display = "none";
    if(document.getElementById('buscador-categorias-admin')) document.getElementById('buscador-categorias-admin').value = '';
}

function renderListaProductos(lista = adminProductos) {
    const cont = document.getElementById('lista-productos-container');
    if(!cont) return;
    cont.innerHTML = '';
    if (lista.length === 0) { cont.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">No se encontraron productos.</p>'; return; }

    lista.forEach(p => {
        const opacityClass = p.disponible ? '' : 'deshabilitado';
        const badgeAgotado = p.agotado ? ' <span style="color:#f87171; font-weight:bold;">🚫 Agotado</span>' : '';
        cont.innerHTML += `
            <div class="list-item ${opacityClass}">
                <div class="item-info">
                    <p class="item-title">${p.favorito ? '⭐ ' : ''}${p.nombre} <span style="color:#10b981">$${p.precio}</span>${badgeAgotado}</p>
                    <p class="item-meta">Cat: ${p.categoria} | Disp: ${p.disponible ? 'Sí' : 'No'}</p>
                </div>
                <div class="item-actions">
                    <button class="action-btn btn-edit" onclick="moverItem(${p.id}, 'producto', -1)" title="Subir">▲</button>
                    <button class="action-btn btn-edit" onclick="moverItem(${p.id}, 'producto', 1)" title="Bajar">▼</button>
                    <button class="action-btn btn-edit" onclick="editarProducto(${p.id})" title="Editar">✏️</button>
                    <button class="action-btn btn-delete" onclick="eliminarItem(${p.id}, 'producto')" title="Eliminar">🗑️</button>
                </div>
            </div>`;
    });
}

function filtrarProductosAdmin() {
    const input = document.getElementById('buscador-productos-admin');
    const textoBuscado = input.value.toLowerCase();
    const resultados = adminProductos.filter(p => p.nombre.toLowerCase().includes(textoBuscado));
    renderListaProductos(resultados);
    const panel = input.closest('.list-panel');
    if (panel) panel.scrollTop = 0;
}

function actualizarSelectCategorias() {
    const select = document.getElementById('prod-categoria');
    if(!select) return;
    select.innerHTML = '<option value="">-- Selecciona Categoría --</option>';
    adminCategorias.forEach(cat => { select.innerHTML += `<option value="${cat.nombre}">${cat.nombre}</option>`; });
}

function buscarCategoriaCombo(inputElement) {
    const contenedor = document.getElementById('caja-sugerencias-categoria-combo');
    document.getElementById('combo-categoria').value = '';
    const texto = inputElement.value.toLowerCase().trim();
    const filtradas = adminCategorias.filter(c => c.nombre.toLowerCase().includes(texto));

    let html = '';
    if (texto === '' || 'combos'.includes(texto)) {
        html += `<div data-valor="" data-nombre="" onclick="seleccionarCategoriaCombo(this)" style="padding: 10px; cursor: pointer; font-size: 13px; color: #94a3b8; font-style: italic; border-bottom: 1px solid #334155;" onmouseover="this.style.background='#334155'" onmouseout="this.style.background='transparent'">Combos (por defecto)</div>`;
    }
    if (filtradas.length > 0) {
        filtradas.forEach(c => {
            html += `<div data-valor="${escapeHtml(c.nombre)}" data-nombre="${escapeHtml(c.nombre)}" onclick="seleccionarCategoriaCombo(this)" style="padding: 10px; cursor: pointer; font-size: 13px; color: white; border-bottom: 1px solid #334155;" onmouseover="this.style.background='#334155'" onmouseout="this.style.background='transparent'">${escapeHtml(c.nombre)}</div>`;
        });
    }
    if (html === '') html = '<div style="padding: 10px; font-size: 13px; color: #94a3b8; font-style: italic;">No hay coincidencias...</div>';

    document.querySelectorAll('.caja-sugerencias').forEach(caja => caja.style.display = 'none');
    contenedor.innerHTML = html;
    contenedor.style.display = 'block';
}

function seleccionarCategoriaCombo(elemento) {
    document.getElementById('combo-categoria').value = elemento.dataset.valor;
    document.getElementById('combo-categoria-visible').value = elemento.dataset.nombre || 'Combos (por defecto)';
    document.getElementById('caja-sugerencias-categoria-combo').style.display = 'none';
}

function obtenerEmojiPlato() {
    const emojis = ['🍔', '🍟', '🍗', '🥤', '🍦', '🌭', '🍕', '🔥', '🍩', '🧃'];
    return emojis[Math.floor(Math.random() * emojis.length)];
}

if (document.getElementById('form-producto')) {
    document.getElementById('form-producto').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('prod-id').value;
        let imgFinalProd = document.getElementById('prod-imagen').value.trim();
        if (imgFinalProd === '') imgFinalProd = obtenerEmojiPlato();

        const prodDesde = document.getElementById('prod-disponible-desde').value;
        const prodHasta = document.getElementById('prod-disponible-hasta').value;
        if ((prodDesde && !prodHasta) || (!prodDesde && prodHasta)) {
            alert('⚠️ Para limitar el horario de disponibilidad completa tanto "Desde" como "Hasta" (o deja ambos vacíos).');
            return;
        }

        const payload = {
            id: id ? parseInt(id) : null, nombre: document.getElementById('prod-nombre').value.trim(), categoria: document.getElementById('prod-categoria').value,
            precio: parseFloat(document.getElementById('prod-precio').value), imagen: imgFinalProd, descripcion: document.getElementById('prod-descripcion').value.trim(), disponible: document.getElementById('prod-disponible').checked,
            agotado: document.getElementById('prod-agotado').checked,
            favorito: document.getElementById('prod-favorito').checked,
            no_disponible_en: leerNoDisponible('prod'),
            disponible_desde: document.getElementById('prod-disponible-desde').value || null,
            disponible_hasta: document.getElementById('prod-disponible-hasta').value || null,
            dias_disponibles: leerDiasSeleccionados('prod') || null,
            ...leerEmpaque('prod'),
            ...leerPaquete('prod')
        };
        try {
            await fetch(ADMIN_URL_GUARDAR_PROD, { 
                method: 'POST', 
                headers:{'Content-Type':'application/json', 'Authorization': `Bearer ${adminToken}`}, 
                body: JSON.stringify(payload)
            });
            resetFormProd(); cargarDatosAdmin();
        } catch (error) { alert('Error al guardar el producto.'); }
    });
}

function editarProducto(id) {
    const p = adminProductos.find(x => x.id === id); if(!p) return;
    document.getElementById('prod-id').value = p.id; document.getElementById('prod-nombre').value = p.nombre; document.getElementById('prod-categoria').value = p.categoria;
    document.getElementById('prod-precio').value = p.precio; document.getElementById('prod-imagen').value = p.imagen || ''; document.getElementById('prod-descripcion').value = p.descripcion; document.getElementById('prod-disponible').checked = p.disponible;
    document.getElementById('prod-agotado').checked = !!p.agotado;
    document.getElementById('prod-favorito').checked = !!p.favorito;
    document.getElementById('prod-disponible-desde').value = p.disponible_desde || '';
    marcarNoDisponible('prod', p.no_disponible_en);
    document.getElementById('prod-disponible-hasta').value = p.disponible_hasta || '';
    construirChipsDias('prod', parsearDiasDisponibles(p.dias_disponibles));
    document.getElementById('prod-bandejas').value = (p.bandejas === null || p.bandejas === undefined) ? 1 : p.bandejas;
    document.getElementById('prod-cajas-pizza').value = p.cajas_pizza || 0;
    document.getElementById('prod-cantidad-paquete').value = p.cantidad_paquete || 0;
    document.getElementById('prod-precio-paquete').value = p.precio_paquete || '';
    previsualizarPaquete();
    document.getElementById('titulo-form-prod').innerText = "Editar Producto"; document.getElementById('btn-save-prod').innerText = "💾 Actualizar Producto"; document.getElementById('btn-cancel-prod').style.display = "block";
    document.getElementById('buscador-productos-admin').value = '';
    renderListaProductos();
    desplazarseAlFormulario('titulo-form-prod');
}

function resetFormProd() {
    document.getElementById('form-producto').reset(); document.getElementById('prod-id').value = "";
    if (document.getElementById('prod-imagen')) document.getElementById('prod-imagen').value = "";
    if (document.getElementById('prod-imagen-status')) document.getElementById('prod-imagen-status').innerText = "O sube una foto: se redimensiona y comprime automáticamente antes de subirla.";
    construirChipsDias('prod', []);
    document.getElementById('titulo-form-prod').innerText = "Crear Producto"; document.getElementById('btn-save-prod').innerText = "💾 Guardar Producto"; document.getElementById('btn-cancel-prod').style.display = "none";
    const cantPaq = document.getElementById('prod-cantidad-paquete');
    if (cantPaq) { cantPaq.value = 0; document.getElementById('prod-precio-paquete').value = ''; previsualizarPaquete(); }
}

function renderListaCombos(lista = adminCombos) {
    const cont = document.getElementById('lista-combos-container');
    if(!cont) return;
    cont.innerHTML = '';
    if (lista.length === 0) { cont.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">No se encontraron combos.</p>'; return; }

    lista.forEach(c => {
        const opacityClass = c.disponible ? '' : 'deshabilitado';
        cont.innerHTML += `
            <div class="list-item ${opacityClass}">
                <div class="item-info">
                    <p class="item-title">${c.favorito ? '⭐ ' : ''}${c.nombre} <span style="color:#10b981">$${c.precio}</span></p>
                    <p class="item-meta">Disp: ${c.disponible ? 'Sí' : 'No'}</p>
                </div>
                <div class="item-actions">
                    <button class="action-btn btn-edit" onclick="moverItem(${c.id}, 'combo', -1)" title="Subir">▲</button>
                    <button class="action-btn btn-edit" onclick="moverItem(${c.id}, 'combo', 1)" title="Bajar">▼</button>
                    <button class="action-btn btn-edit" onclick="editarCombo(${c.id})" title="Editar">✏️</button>
                    <button class="action-btn btn-delete" onclick="eliminarItem(${c.id}, 'combo')" title="Eliminar">🗑️</button>
                </div>
            </div>`;
    });
}

function filtrarCombosAdmin() {
    const input = document.getElementById('buscador-combos-admin');
    const textoBuscado = input.value.toLowerCase();
    const resultados = adminCombos.filter(c => c.nombre.toLowerCase().includes(textoBuscado));
    renderListaCombos(resultados);
    const panel = input.closest('.list-panel');
    if (panel) panel.scrollTop = 0;
}

function actualizarSelectsCombos() {
    let datalist = document.getElementById('lista-productos-combo');
    if (!datalist) { datalist = document.createElement('datalist'); datalist.id = 'lista-productos-combo'; document.body.appendChild(datalist); }
    datalist.innerHTML = adminProductos.map(p => `<option value="${p.nombre} ($${p.precio})"></option>`).join('');
}

function buscarProductoPromo(inputElement) {
    const contenedor = document.getElementById('caja-sugerencias-promo');
    document.getElementById('combo-promo-producto').value = '';
    const texto = inputElement.value.toLowerCase().trim();
    const filtrados = adminProductos.filter(p => p.nombre.toLowerCase().includes(texto));

    let html = '';
    if (filtrados.length > 0) {
        filtrados.forEach(p => {
            const nombreLegible = `${p.nombre} ($${p.precio.toFixed(2)})`;
            html += `<div class="opcion-promo-producto" data-id="${p.id}" data-nombre="${escapeHtml(nombreLegible)}" onclick="seleccionarProductoPromo(this)" style="padding: 10px; cursor: pointer; font-size: 13px; color: white; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center;" onmouseover="this.style.background='#334155'" onmouseout="this.style.background='transparent'"><span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 10px;">${escapeHtml(p.nombre)}</span><span style="color:#10b981; font-weight: bold; flex-shrink: 0;">$${p.precio.toFixed(2)}</span></div>`;
        });
    } else {
        html = '<div style="padding: 10px; font-size: 13px; color: #94a3b8; font-style: italic;">No hay coincidencias...</div>';
    }

    document.querySelectorAll('.caja-sugerencias').forEach(caja => caja.style.display = 'none');
    contenedor.innerHTML = html;
    contenedor.style.display = 'block';
}

function seleccionarProductoPromo(elemento) {
    document.getElementById('combo-promo-producto').value = elemento.dataset.id;
    document.getElementById('combo-promo-producto-visible').value = elemento.dataset.nombre;
    document.getElementById('caja-sugerencias-promo').style.display = 'none';
}

function agregarFilaProductoCombo(valorSeleccionado = "", qty = 1) {
    const contenedor = document.getElementById('lista-items-combo');
    const fila = document.createElement('div');
    fila.className = 'fila-item-combo'; fila.style.display = 'flex'; fila.style.gap = '10px'; fila.style.marginBottom = '10px';

    let nombreLegible = "";
    if (valorSeleccionado.startsWith('CAT_')) { nombreLegible = "📁 Categoría: " + valorSeleccionado.replace('CAT_', ''); } 
    else if (valorSeleccionado.startsWith('PROD_')) {
        const pId = parseInt(valorSeleccionado.replace('PROD_', ''));
        const p = adminProductos.find(x => x.id === pId);
        if (p) nombreLegible = "🍔 Producto: " + p.nombre;
    }

    const idCaja = 'sug-combo-' + Math.random().toString(36).substr(2, 9);
    fila.innerHTML = `
        <div style="flex: 2; position: relative;">
            <input type="text" onfocus="buscarItemCombo(this, '${idCaja}')" oninput="buscarItemCombo(this, '${idCaja}')" value="${nombreLegible}" placeholder="🔍 Buscar producto..." autocomplete="off" class="item-visible" style="width: 100%; padding: 0.75rem; background-color: #0f172a; border: 1px solid #334155; color: white; border-radius: 6px; outline: none;">
            <input type="hidden" class="item-referencia" value="${valorSeleccionado}">
            <div id="${idCaja}" class="caja-sugerencias hidden" style="display: none; position: absolute; z-index: 50; width: 100%; margin-top: 4px; background: #1e293b; border: 1px solid #334155; border-radius: 6px; max-height: 250px; overflow-y: auto; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5);"></div>
        </div>
        <input type="number" class="item-cantidad" min="1" value="${qty}" required style="flex: 1; padding: 0.75rem; background-color: #0f172a; border: 1px solid #334155; color: white; border-radius: 6px;" placeholder="Cant.">
        <button type="button" onclick="this.parentElement.remove()" style="background: #e11d48; color: white; border: none; border-radius: 4px; padding: 0 15px; cursor: pointer; font-weight: bold;">X</button>
    `;
    contenedor.appendChild(fila);
}

function agregarGrupoPiezasAlternativas(alternativasExistentes = null, modoExistente = 'excluyente') {
    const contenedor = document.getElementById('lista-items-combo');
    const grupo = document.createElement('div');
    grupo.className = 'fila-piezas-alternativas';
    grupo.style.cssText = 'border: 1px solid #92400e; background: linear-gradient(#1c1509, #171310); border-radius: 10px; padding: 14px; margin-bottom: 12px;';
    grupo.innerHTML = `
        <div style="display:flex; justify-content: space-between; align-items:flex-start; gap: 10px; margin-bottom: 12px;">
            <div>
                <p style="color:#fbbf24; font-size: 13px; font-weight: bold; margin: 0;">🍥 Elección por piezas</p>
                <p style="color:#94a3b8; font-size: 11.5px; margin: 4px 0 0; line-height: 1.5;">El cliente elige rolls completos tocándolos, no piezas sueltas: en cada fila defines cuántos rolls elige y cuántas piezas vale cada uno. Para que pueda mezclar categorías (ej. 3 rolls entre clásicos, tempura y fríos) usa UNA sola fila y márcale todas esas categorías. Usa 2+ filas solo cuando sean ofertas distintas entre sí (ej. Tempura 12pz o Frío 10pz); ahí elige abajo cómo se comportan esas pestañas.</p>
            </div>
            <button type="button" onclick="this.closest('.fila-piezas-alternativas').remove()" style="flex-shrink:0; background:#e11d48; color:white; border:none; border-radius:6px; padding:6px 12px; cursor:pointer; font-weight:bold; font-size: 11px;">Quitar</button>
        </div>
        <label style="display:block; margin-bottom:12px; font-size:11px; color:#fbbf24; font-weight:normal; text-transform:none;">
            Con 2+ filas, ¿cómo se comportan las pestañas?
            <select class="grupo-modo-piezas" onchange="sincronizarModoPiezas(this.closest('.fila-piezas-alternativas'))" style="width:100%; margin-top:4px; padding:8px; background:#0f172a; border:1px solid #334155; color:white; border-radius:6px; font-size:12px;">
                <option value="excluyente" ${modoExistente === 'excluyente' ? 'selected' : ''}>Excluyentes: el cliente elige SOLO una pestaña (ej. Tempura 12pz o Frío 10pz)</option>
                ${modoExistente === 'compartido' ? `<option value="compartido" selected>Piezas compartidas (opción retirada — al guardar se convertirá a excluyente)</option>` : ''}
                <option value="todas" ${modoExistente === 'todas' ? 'selected' : ''}>Todas obligatorias: el cliente debe completar cada pestaña por separado (ej. 1 roll clásico + 1 tempura + 1 individual + 1 guarnición)</option>
            </select>
        </label>
        <div class="lista-alternativas-piezas" style="display:flex; flex-direction:column; gap:10px;"></div>
        <button type="button" class="btn-add-alternativa" style="margin-top:10px; background:#334155; color:white; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:bold;">+ Agregar fila</button>
    `;
    contenedor.appendChild(grupo);

    const listaAlt = grupo.querySelector('.lista-alternativas-piezas');
    grupo.querySelector('.btn-add-alternativa').onclick = () => { agregarFilaAlternativaPiezas(listaAlt); sincronizarModoPiezas(grupo); };

    const datos = (alternativasExistentes && alternativasExistentes.length > 0) ? alternativasExistentes : [{}, {}];
    datos.forEach(alt => agregarFilaAlternativaPiezas(listaAlt, alt));
    sincronizarModoPiezas(grupo);
}

function sincronizarModoPiezas(grupo) {
    const modo = grupo.querySelector('.grupo-modo-piezas').value;
    const filas = grupo.querySelectorAll('.fila-alternativa-piezas');
    filas.forEach((fila, i) => {
        const inputPiezas = fila.querySelector('.alt-cantidades');
        const ocultar = modo === 'compartido' && i > 0;
        inputPiezas.style.display = ocultar ? 'none' : 'flex';

        let nota = fila.querySelector('.nota-piezas-compartidas');
        if (ocultar) {
            if (!nota) {
                nota = document.createElement('span');
                nota.className = 'nota-piezas-compartidas';
                nota.style.cssText = 'width:80px; text-align:center; font-size:10px; color:#64748b;';
                nota.textContent = '↳ usa el de arriba';
                inputPiezas.insertAdjacentElement('afterend', nota);
            }
            nota.style.display = '';
        } else if (nota) {
            nota.style.display = 'none';
        }
    });
}

function claseChipCategoria(activo) {
    return activo
        ? 'chip-categoria'
        : 'chip-categoria chip-categoria-inactivo';
}

// --- DÍAS DE DISPONIBILIDAD PROGRAMADA (productos y combos) ---
const NOMBRES_DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function construirChipsDias(prefix, diasSeleccionados = []) {
    const cont = document.getElementById(`${prefix}-chips-dias`);
    if (!cont) return;
    cont.innerHTML = NOMBRES_DIAS_CORTOS.map((nombre, i) => {
        const activo = diasSeleccionados.includes(i);
        return `<button type="button" class="${claseChipCategoria(activo)}" data-dia="${i}" data-activo="${activo ? '1' : '0'}" onclick="toggleChipCategoria(this)">${nombre}</button>`;
    }).join('');
}

// Cuanto ocupa un plato al empacarlo. Vacio o negativo se corrige solo: las
// bandejas caen a 1 (todo ocupa al menos una) y las cajas a 0.
function leerEmpaque(prefijo) {
    const leer = (sufijo, porDefecto) => {
        const campo = document.getElementById(`${prefijo}-${sufijo}`);
        const valor = campo ? parseInt(campo.value, 10) : NaN;
        return (isNaN(valor) || valor < 0) ? porDefecto : valor;
    };
    return { bandejas: leer('bandejas', 1), cajas_pizza: leer('cajas-pizza', 0) };
}

// Precio por paquete: lo que se vende mas barato "de a varios" (el par de
// lumpias en $1,50 aunque la suelta valga $0,60). Si falta cualquiera de los
// dos datos se guarda apagado, y el producto se cobra por unidad como siempre.
function leerPaquete(prefijo) {
    const cantidad = parseInt(document.getElementById(`${prefijo}-cantidad-paquete`).value, 10) || 0;
    const precio = parseFloat(document.getElementById(`${prefijo}-precio-paquete`).value) || 0;
    if (cantidad < 2 || precio <= 0) return { cantidad_paquete: 0, precio_paquete: null };
    return { cantidad_paquete: cantidad, precio_paquete: precio };
}

// Muestra en el formulario cuanto pagaria el cliente por las primeras
// cantidades, que es la forma rapida de ver si los numeros quedaron bien.
function previsualizarPaquete() {
    const salida = document.getElementById('prod-preview-paquete');
    if (!salida) return;

    const unitario = parseFloat(document.getElementById('prod-precio').value) || 0;
    const { cantidad_paquete: cantidad, precio_paquete: precio } = leerPaquete('prod');

    if (!cantidad || !precio || unitario <= 0) { salida.innerText = ''; return; }

    const cobro = (n) => {
        const paquetes = Math.floor(n / cantidad);
        const sueltas = n % cantidad;
        return paquetes * precio + sueltas * unitario;
    };
    const ejemplos = [1, 2, 3, 4, 5].map(n => `${n} = $${cobro(n).toFixed(2)}`).join('   ·   ');
    salida.innerText = `Se cobraría:   ${ejemplos}`;
}

function leerDiasSeleccionados(prefix) {
    const cont = document.getElementById(`${prefix}-chips-dias`);
    if (!cont) return '';
    const dias = Array.from(cont.querySelectorAll('.chip-categoria')).filter(b => b.dataset.activo === '1').map(b => b.dataset.dia);
    return dias.length > 0 ? dias.join(',') : '';
}

function parsearDiasDisponibles(diasCsv) {
    if (!diasCsv) return [];
    return String(diasCsv).split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d));
}

construirChipsDias('prod', []);
construirChipsDias('combo', []);

function agregarFilaAlternativaPiezas(listaAlt, datos = {}) {
    const fila = document.createElement('div');
    fila.className = 'fila-alternativa-piezas';
    fila.style.cssText = 'background:#0f172a; border:1px solid #334155; border-radius:8px; padding:10px;';

    const categoriasSeleccionadas = datos.categorias || (datos.categoria ? [datos.categoria] : []);
    const chipsCategorias = adminCategorias.map(c => {
        const activo = categoriasSeleccionadas.includes(c.nombre);
        return `<button type="button" class="${claseChipCategoria(activo)}" data-valor="${escapeHtml(c.nombre)}" data-activo="${activo ? '1' : '0'}" onclick="toggleChipCategoria(this)">${escapeHtml(c.nombre)}</button>`;
    }).join('');

    // Los combos guardados antes de esta pantalla solo traen piezas_objetivo:
    // eran 1 sola eleccion que se llevaba todas las piezas.
    const selecciones = parseInt(datos.selecciones, 10) > 0 ? parseInt(datos.selecciones, 10) : 1;
    const objetivoGuardado = parseInt(datos.piezas_objetivo, 10) || 0;
    const porSeleccion = parseInt(datos.piezas_por_seleccion, 10) || (objetivoGuardado ? Math.round(objetivoGuardado / selecciones) : '');

    fila.innerHTML = `
        <div style="display:flex; gap:8px; align-items:center;">
            <input type="text" class="alt-nombre" placeholder="Nombre (ej. Opción 1, o 'Variado')" value="${escapeHtml(datos.nombre || '')}" style="flex:1; padding:8px; background:#0b1120; border:1px solid #334155; color:white; border-radius:6px; font-size:13px; margin:0;">
            <button type="button" onclick="this.closest('.fila-alternativa-piezas').remove()" title="Quitar esta fila" style="flex-shrink:0; background:transparent; color:#f87171; border:1px solid #7f1d1d; border-radius:6px; width:34px; height:34px; cursor:pointer; font-size:14px;"><i class="fa-solid fa-trash-can"></i></button>
        </div>
        <div class="alt-cantidades" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:10px;">
            <label style="font-size:11px; color:#94a3b8; margin:0; text-transform:none; font-weight:normal;">El cliente elige</label>
            <input type="number" class="alt-selecciones" min="1" value="${selecciones}" onchange="recalcularTotalPiezas(this)" oninput="recalcularTotalPiezas(this)" style="width:64px; padding:8px; background:#0b1120; border:1px solid #334155; color:white; border-radius:6px; font-size:13px; margin:0; text-align:center;">
            <label style="font-size:11px; color:#94a3b8; margin:0; text-transform:none; font-weight:normal;">opción(es), y cada una vale</label>
            <input type="number" class="alt-piezas" min="1" placeholder="Piezas" value="${porSeleccion}" onchange="recalcularTotalPiezas(this)" oninput="recalcularTotalPiezas(this)" style="width:70px; padding:8px; background:#0b1120; border:1px solid #334155; color:white; border-radius:6px; font-size:13px; margin:0; text-align:center;">
            <label style="font-size:11px; color:#94a3b8; margin:0; text-transform:none; font-weight:normal;">piezas</label>
            <span class="alt-total-piezas" style="font-size:12px; font-weight:bold; color:#fbbf24; margin-left:auto;"></span>
        </div>
        <p style="font-size:10px; color:#64748b; margin:6px 0 0; line-height:1.5;">Ej: 12 piezas de un solo roll = 1 opción x 12 piezas. 54 piezas repartidas en 3 rolls = 3 opciones x 18 piezas. El cliente elige tocando el roll, no piezas sueltas. Si marcas varias categorías abajo, el cliente ve una pestaña por cada una y puede repartir sus elecciones entre ellas (ej. 1 clásico + 1 tempura + 1 frío).</p>
        <p style="font-size:10px; text-transform:uppercase; letter-spacing:0.03em; color:#64748b; font-weight:bold; margin:10px 0 6px;">Categorías de sabores (toca las que apliquen)</p>
        <div class="chips-categorias" style="display:flex; flex-wrap:wrap; gap:6px;">${chipsCategorias}</div>
    `;
    listaAlt.appendChild(fila);
    recalcularTotalPiezas(fila.querySelector('.alt-selecciones'));
}

// Muestra el total resultante (opciones x piezas) al lado de los dos campos,
// para que quien arma el combo vea de una que le dio 24 y no 26.
function recalcularTotalPiezas(input) {
    const fila = input ? input.closest('.fila-alternativa-piezas') : null;
    if (!fila) return;
    const selecciones = parseInt(fila.querySelector('.alt-selecciones').value, 10) || 0;
    const porSeleccion = parseInt(fila.querySelector('.alt-piezas').value, 10) || 0;
    const etiqueta = fila.querySelector('.alt-total-piezas');
    if (!etiqueta) return;
    etiqueta.textContent = (selecciones > 0 && porSeleccion > 0) ? `= ${selecciones * porSeleccion} piezas en total` : '';
}

function toggleChipCategoria(btn) {
    const activo = btn.dataset.activo === '1';
    btn.dataset.activo = activo ? '0' : '1';
    btn.className = claseChipCategoria(!activo);
}

function buscarItemCombo(inputElement, idCaja) {
    const contenedor = document.getElementById(idCaja); const hiddenInput = inputElement.nextElementSibling; const texto = inputElement.value.toLowerCase().trim();
    hiddenInput.value = "";
    const prodFiltrados = adminProductos.filter(p => p.nombre.toLowerCase().includes(texto) || texto === '');

    let html = '';
    if (prodFiltrados.length > 0) {
        prodFiltrados.forEach(p => { html += `<div onclick="seleccionarSugerenciaCombo(this, '${idCaja}', 'PROD_${p.id}', '🍔 Producto: ${p.nombre}')" style="padding: 10px 20px 10px 10px; cursor: pointer; font-size: 13px; color: white; border-bottom: 1px solid #334155; transition: background 0.2s; display: flex; justify-content: space-between; align-items: center;" onmouseover="this.style.background='#334155'" onmouseout="this.style.background='transparent'"><span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 10px;">🍔 ${p.nombre}</span><span style="color:#10b981; font-weight: bold; flex-shrink: 0;">$${p.precio.toFixed(2)}</span></div>`; });
    }
    if (html === '') html = '<div style="padding: 10px; font-size: 13px; color: #94a3b8; font-style: italic;">No hay coincidencias...</div>';

    document.querySelectorAll('.caja-sugerencias').forEach(caja => caja.style.display = 'none');
    contenedor.innerHTML = html; contenedor.style.display = 'block';
}

function seleccionarSugerenciaCombo(elemento, idCaja, valorReal, textoLegible) {
    const contenedor = document.getElementById(idCaja); const hiddenInput = contenedor.previousElementSibling; const visibleInput = hiddenInput.previousElementSibling;
    hiddenInput.value = valorReal; visibleInput.value = textoLegible; contenedor.style.display = 'none';
}

document.addEventListener('click', function(e) {
    if (!e.target.classList.contains('item-visible')) document.querySelectorAll('.caja-sugerencias').forEach(caja => caja.style.display = 'none');
});

const btnAddCombo = document.getElementById('btn-add-item');
if (btnAddCombo) btnAddCombo.onclick = function() { agregarFilaProductoCombo(); };

const formCombo = document.getElementById('form-combo');
if (formCombo) {
    formCombo.onsubmit = async function(e) {
        e.preventDefault();
        const id = document.getElementById('combo-id').value;
        const itemsSeleccionados = [];
        let faltaHacerClic = false;

        document.querySelectorAll('.fila-item-combo').forEach(fila => {
            const ref = fila.querySelector('.item-referencia').value; const qty = parseInt(fila.querySelector('.item-cantidad').value); const visibleText = fila.querySelector('.item-visible').value.trim();
            if (visibleText !== "" && ref === "") faltaHacerClic = true;
            else if (ref && qty > 0) {
                if (ref.startsWith('CAT_')) itemsSeleccionados.push({ tipo: 'categoria', valor: ref.replace('CAT_', ''), cantidad: qty });
                else if (ref.startsWith('PROD_')) {
                    const pId = parseInt(ref.replace('PROD_', ''));
                    const pEncontrado = adminProductos.find(x => x.id === pId);
                    const nombreReal = pEncontrado ? pEncontrado.nombre : 'Producto Fijo';
                    itemsSeleccionados.push({ tipo: 'producto', valor: pId, nombre_producto: nombreReal, cantidad: qty });
                }
            }
        });

        let faltaCompletarPiezas = false;
        document.querySelectorAll('.fila-piezas-alternativas').forEach(grupoEl => {
            const modo = grupoEl.querySelector('.grupo-modo-piezas').value;
            const alternativas = [];
            let piezasCompartidas = null;
            grupoEl.querySelectorAll('.fila-alternativa-piezas').forEach((fila, i) => {
                const nombre = fila.querySelector('.alt-nombre').value.trim();
                const categorias = Array.from(fila.querySelectorAll('.chip-categoria')).filter(b => b.dataset.activo === '1').map(b => b.dataset.valor);
                const seleccionesInput = parseInt(fila.querySelector('.alt-selecciones').value);
                const piezasInput = parseInt(fila.querySelector('.alt-piezas').value);
                if (!nombre && categorias.length === 0 && !piezasInput) return;

                // En modo "compartido" solo la 1ra fila define las piezas; las demás heredan ese número.
                const piezas = (modo === 'compartido' && i > 0) ? piezasCompartidas : piezasInput;
                if (i === 0) piezasCompartidas = piezasInput;

                const selecciones = seleccionesInput > 0 ? seleccionesInput : 1;
                if (!nombre || categorias.length === 0 || !(piezas > 0)) { faltaCompletarPiezas = true; return; }
                // piezas_objetivo queda guardado (el total) para que lo lea todo lo
                // que ya existía; los dos campos nuevos son los que mandan.
                alternativas.push({
                    nombre,
                    categorias,
                    selecciones,
                    piezas_por_seleccion: piezas,
                    piezas_objetivo: selecciones * piezas
                });
            });
            if (alternativas.length > 0) itemsSeleccionados.push({ tipo: 'piezas_alternativas', alternativas, modo });
        });

        if (faltaHacerClic) { alert('⚠️ Importante: Debes HACER CLIC en una de las opciones flotantes.'); return; }
        if (faltaCompletarPiezas) { alert('⚠️ En cada "Elección por piezas" completa nombre, al menos 1 categoría, cuántas opciones elige el cliente y cuántas piezas vale cada una (o quita la fila).'); return; }
        if (itemsSeleccionados.length === 0) { alert('Añade al menos 1 elemento válido al combo.'); return; }

        let imgFinalCombo = document.getElementById('combo-imagen').value.trim();
        if (imgFinalCombo === '' && typeof obtenerEmojiPlato === 'function') imgFinalCombo = obtenerEmojiPlato();

        const promoCantidadMinima = parseInt(document.getElementById('combo-promo-cantidad-minima').value) || null;
        const promoProductoIdVal = document.getElementById('combo-promo-producto').value;
        const promoProductoId = promoProductoIdVal ? parseInt(promoProductoIdVal) : null;
        const promoProductoCantidad = parseInt(document.getElementById('combo-promo-producto-cantidad').value) || null;

        if (promoCantidadMinima && (!promoProductoId || !promoProductoCantidad)) {
            alert('⚠️ Para la promoción por cantidad completa también el producto de regalo y la cantidad de regalo (o borra "Cada cuántos combos" para no aplicar ninguna).');
            return;
        }

        const comboDesde = document.getElementById('combo-disponible-desde').value;
        const comboHasta = document.getElementById('combo-disponible-hasta').value;
        if ((comboDesde && !comboHasta) || (!comboDesde && comboHasta)) {
            alert('⚠️ Para limitar el horario de disponibilidad completa tanto "Desde" como "Hasta" (o deja ambos vacíos).');
            return;
        }

        const payload = {
            id: id ? parseInt(id) : null, nombre: document.getElementById('combo-nombre').value.trim(), categoria: document.getElementById('combo-categoria').value || null, precio: parseFloat(document.getElementById('combo-precio').value),
            imagen: imgFinalCombo, descripcion: document.getElementById('combo-descripcion').value.trim(), items: itemsSeleccionados, disponible: document.getElementById('combo-disponible').checked, favorito: document.getElementById('combo-favorito').checked,
            promo_cantidad_minima: promoCantidadMinima, promo_producto_id: promoProductoId, promo_producto_cantidad: promoProductoCantidad,
            no_disponible_en: leerNoDisponible('combo'),
            disponible_desde: document.getElementById('combo-disponible-desde').value || null,
            disponible_hasta: document.getElementById('combo-disponible-hasta').value || null,
            dias_disponibles: leerDiasSeleccionados('combo') || null,
            ...leerEmpaque('combo')
        };
        
        try {
            await fetch(ADMIN_URL_GUARDAR_COMBO, { 
                method: 'POST', 
                headers:{'Content-Type':'application/json', 'Authorization': `Bearer ${adminToken}`}, 
                body: JSON.stringify(payload)
            });
            resetFormCombo(); cargarDatosAdmin();
        } catch (error) { alert('Error al guardar el combo.'); }
    };
}

function editarCombo(id) {
    const c = adminCombos.find(x => x.id === id); if(!c) return;
    document.getElementById('combo-id').value = c.id; document.getElementById('combo-nombre').value = c.nombre; document.getElementById('combo-precio').value = c.precio;
    document.getElementById('combo-categoria').value = c.categoria || '';
    document.getElementById('combo-categoria-visible').value = c.categoria || '';
    document.getElementById('combo-imagen').value = c.imagen || ''; document.getElementById('combo-descripcion').value = c.descripcion || ''; document.getElementById('combo-disponible').checked = c.disponible; document.getElementById('combo-favorito').checked = !!c.favorito;
    document.getElementById('combo-promo-cantidad-minima').value = c.promo_cantidad_minima || '';
    document.getElementById('combo-promo-producto-cantidad').value = c.promo_producto_cantidad || '';
    const prodPromo = c.promo_producto_id ? adminProductos.find(p => p.id === c.promo_producto_id) : null;
    document.getElementById('combo-promo-producto').value = c.promo_producto_id || '';
    document.getElementById('combo-promo-producto-visible').value = prodPromo ? `${prodPromo.nombre} ($${prodPromo.precio.toFixed(2)})` : '';
    document.getElementById('combo-disponible-desde').value = c.disponible_desde || '';
    marcarNoDisponible('combo', c.no_disponible_en);
    document.getElementById('combo-disponible-hasta').value = c.disponible_hasta || '';
    construirChipsDias('combo', parsearDiasDisponibles(c.dias_disponibles));
    document.getElementById('combo-bandejas').value = (c.bandejas === null || c.bandejas === undefined) ? 1 : c.bandejas;
    document.getElementById('combo-cajas-pizza').value = c.cajas_pizza || 0;

    document.getElementById('lista-items-combo').innerHTML = '';
    let parsedItems = [];
    try { parsedItems = typeof c.items_json === 'string' ? JSON.parse(c.items_json) : c.items_json; } catch(e){}
    
    if (parsedItems && parsedItems.length > 0) {
        parsedItems.forEach(item => {
            if (item.tipo === 'piezas_alternativas') { agregarGrupoPiezasAlternativas(item.alternativas, item.modo || (item.compartido === true ? 'compartido' : 'excluyente')); }
            else if (item.tipo) { const valorSelect = item.tipo === 'categoria' ? 'CAT_' + item.valor : 'PROD_' + item.valor; agregarFilaProductoCombo(valorSelect, item.cantidad); }
        });
    } else agregarFilaProductoCombo(); 

    document.getElementById('titulo-form-combo').innerText = "Editar Combo"; document.getElementById('btn-save-combo').innerText = "🍱 Actualizar Combo"; document.getElementById('btn-cancel-combo').style.display = "block";
    document.getElementById('buscador-combos-admin').value = '';
    renderListaCombos();
    desplazarseAlFormulario('titulo-form-combo');
}

function resetFormCombo() {
    document.getElementById('form-combo').reset(); document.getElementById('combo-id').value = ""; document.getElementById('lista-items-combo').innerHTML = '';
    if (document.getElementById('combo-imagen-status')) document.getElementById('combo-imagen-status').innerText = "O sube una foto: se redimensiona y comprime automáticamente antes de subirla.";
    construirChipsDias('combo', []);
    agregarFilaProductoCombo(); document.getElementById('titulo-form-combo').innerText = "Crear Combo"; document.getElementById('btn-save-combo').innerText = "🍱 Guardar Combo"; document.getElementById('btn-cancel-combo').style.display = "none";
    if(document.getElementById('buscador-combos-admin')) document.getElementById('buscador-combos-admin').value = '';
}

// Sube (-1) o baja (+1) un producto/combo en la lista; ese es el orden en que se ve en el menú
async function guardarOrden(tipo, ids) {
    try {
        await fetch(ADMIN_URL_ORDENAR, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }, body: JSON.stringify({ tipo, ids }) });
        await cargarDatosAdmin();
    } catch (e) { alert('Error al guardar el orden.'); }
}
function moverItem(id, tipo, dir) {
    const lista = tipo === 'combo' ? adminCombos : (tipo === 'categoria' ? adminCategorias : adminProductos);
    const buscador = document.getElementById({ combo: 'buscador-combos-admin', categoria: 'buscador-categorias-admin', producto: 'buscador-productos-admin' }[tipo]);
    const txt = buscador ? buscador.value.toLowerCase() : '';
    const visibles = txt ? lista.filter(x => x.nombre.toLowerCase().includes(txt)) : lista; // con búsqueda, se mueve entre los que se ven
    const k = visibles.findIndex(x => x.id === id), vecino = visibles[k + dir];
    if (k < 0 || !vecino) return;
    const ids = lista.map(x => x.id);
    const i = ids.indexOf(id), j = ids.indexOf(vecino.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    guardarOrden(tipo, ids);
}
function ordenarPorPrecio(tipo) {
    const lista = tipo === 'combo' ? adminCombos : adminProductos;
    const ids = lista.map((x, i) => [x, i]).sort((a, b) => (Number(a[0].precio) - Number(b[0].precio)) || (a[1] - b[1])).map(x => x[0].id);
    guardarOrden(tipo, ids);
}

async function eliminarItem(id, tipo) {
    if (!confirm(`¿Seguro que deseas eliminar este ${tipo}? Esta acción no se puede deshacer.`)) return;
    try {
        await fetch(ADMIN_URL_ELIMINAR, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
            body: JSON.stringify({ id: id, tipo: tipo })
        });
        cargarDatosAdmin();
    } catch(e) { alert('Error al intentar eliminar el elemento.'); }
}
