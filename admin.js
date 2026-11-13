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
const ADMIN_URL_INVENTARIO = API_BASE + "/api/menu/inventario";

const URL_OBTENER_USUARIOS_ADMIN = API_BASE + "/api/usuarios/";
const ADMIN_URL_GUARDAR_USUARIO = API_BASE + "/api/usuarios/guardar";
const ADMIN_URL_ELIMINAR_USUARIO = API_BASE + "/api/usuarios/eliminar";

const URL_OBTENER_MOTORIZADOS = API_BASE + "/api/motorizados/";
const ADMIN_URL_GUARDAR_MOT = API_BASE + "/api/motorizados/guardar";
const ADMIN_URL_ELIMINAR_MOT = API_BASE + "/api/motorizados/eliminar";

const URL_OBTENER_MSJ = API_BASE + "/api/mensajes/";
const URL_GUARDAR_MSJ = API_BASE + "/api/mensajes/guardar";

const URL_OBTENER_HORARIOS_TRABAJO = API_BASE + "/api/horarios-trabajo";
const URL_GUARDAR_HORARIOS_TRABAJO = API_BASE + "/api/horarios-trabajo/guardar";

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
            cargarMetodosPago();
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

        // Ayuda para quien olvidó su clave o perdió su teléfono (no aparece en tu propia fila)
        let yoUser = ''; try { yoUser = String((JSON.parse(localStorage.getItem('usuarioActivo') || '{}')).username || '').toLowerCase(); } catch (e) {}
        if (String(u.username).toLowerCase() !== yoUser) {
            botones = `<button type="button" class="action-btn" onclick="restablecerClaveUsuario(${u.id})" title="Restablecer clave (olvidó su contraseña)">🔑</button>`
                + (u.tiene_2fa ? `<button type="button" class="action-btn" onclick="quitar2faUsuario(${u.id})" title="Quitar 2FA / huella (perdió su teléfono)">🔓</button>` : '') + botones;
        }
        const etiquetas = (u.tiene_2fa ? ' | 🔐 2FA activo' : '') + (u.debe_cambiar ? ' | ⏳ debe cambiar su clave' : '');
        cont.innerHTML += `
            <div class="list-item">
                <div class="item-info">
                    <p class="item-title">👤 ${u.nombre}</p>
                    <p class="item-meta">User: <span style="color:#38bdf8; font-weight:bold;">${u.username}</span> | Rol: ${u.rol}${u.sucursal_id ? ' | 📍 ' + escapeHtml(nombreSucursalAdmin(u.sucursal_id)) : ''}${etiquetas}</p>
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

async function restablecerClaveUsuario(id) {
    const u = USUARIOS_SISTEMA.find(x => x.id === id); if (!u) return;
    if (!confirm(`¿Restablecer la clave de ${u.nombre}?\n\nSe creará una clave temporal y la actual dejará de servir. Al entrar con la temporal, ${u.nombre} deberá crear una contraseña nueva.`)) return;
    try {
        const r = await fetch(API_BASE + '/api/usuarios/restablecer-clave', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }, body: JSON.stringify({ id }) });
        const d = await r.json();
        if (!d.success) { alert(d.error || d.detail || 'No se pudo restablecer.'); return; }
        if (window.SEG) await window.SEG.mostrarClaveTemporal(u.nombre, d.clave_temporal); else prompt(`Clave temporal para ${u.nombre} (cópiala ahora):`, d.clave_temporal);
        await cargarUsuariosDesdeDB();
    } catch (e) { alert('Error de conexión.'); }
}

async function quitar2faUsuario(id) {
    const u = USUARIOS_SISTEMA.find(x => x.id === id); if (!u) return;
    if (!confirm(`¿Quitar la verificación en dos pasos y los dispositivos (huella/rostro) de ${u.nombre}?\n\nSolo hazlo si perdió su teléfono. Después puede volver a activarlo desde 🔐 Mi seguridad.`)) return;
    try {
        const r = await fetch(API_BASE + '/api/usuarios/quitar-2fa', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }, body: JSON.stringify({ id }) });
        const d = await r.json();
        alert(d.success ? (d.msg || 'Listo.') : (d.error || d.detail || 'No se pudo quitar.'));
        await cargarUsuariosDesdeDB();
    } catch (e) { alert('Error de conexión.'); }
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
// HORARIOS DE TRABAJO + FICHA DEL TRABAJADOR
// ==========================================
const DIAS_TRABAJO = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
let HORARIOS_TRABAJO = [];
let FOTO_TRABAJADOR = '';
let FICHA_EDITANDO = false; // la ficha se abre en modo "ver"; con "Editar" se puede modificar

async function cargarHorarios() {
    try {
        if (!SUCURSALES_ADMIN.length) await cargarSucursalesAdmin();
        const res = await fetch(URL_OBTENER_HORARIOS_TRABAJO, { headers: authHeaders() });
        const data = await res.json();
        HORARIOS_TRABAJO = Array.isArray(data) ? data : (data.data || []);
        pintarFiltroTienda();
        pintarListaTrabajadores();
        mostrarHorarioTrabajador();
    } catch (error) { console.error("Error obteniendo fichas de trabajadores:", error); }
}

// Con varias sucursales: "Todas las tiendas" + cada una. Si el plan es de un solo local, solo aparece la principal.
function pintarFiltroTienda() {
    const sel = document.getElementById('hor-tienda');
    if (!sel) return;
    const previo = sel.value;
    let html = SUCURSALES_ADMIN.length > 1 ? '<option value="">Todas las tiendas</option>' : '';
    html += SUCURSALES_ADMIN.length
        ? SUCURSALES_ADMIN.map(s => `<option value="${s.id}">${escapeHtml(s.nombre)}</option>`).join('')
        : '<option value="">Principal</option>';
    sel.innerHTML = html;
    if (Array.from(sel.options).some(o => o.value === previo)) sel.value = previo;
}

// Un trabajador asignado a "todas las sucursales" aparece en cualquier tienda que se elija
function trabajadoresVisibles() {
    const t = (document.getElementById('hor-tienda') || {}).value;
    if (!t || SUCURSALES_ADMIN.length <= 1) return HORARIOS_TRABAJO;
    return HORARIOS_TRABAJO.filter(u => !u.sucursal_id || String(u.sucursal_id) === t);
}

function pintarListaTrabajadores() {
    const sel = document.getElementById('hor-trabajador');
    const previo = sel.value;
    const multi = SUCURSALES_ADMIN.length > 1;
    const lista = trabajadoresVisibles();
    sel.innerHTML = lista.length
        ? lista.map(u => `<option value="${u.id}">${escapeHtml(((u.nombre || '') + ' ' + (u.apellido || '')).trim())} (${escapeHtml(u.cargo || u.rol)})${multi && u.sucursal_id ? ' · ' + escapeHtml(nombreSucursalAdmin(u.sucursal_id)) : ''}</option>`).join('')
        : '<option value="">— Sin trabajadores —</option>';
    if (previo && lista.some(u => String(u.id) === previo)) sel.value = previo;
}

function cambiarTienda() { pintarListaTrabajadores(); mostrarHorarioTrabajador(); }

function campoFicha(id, etiqueta, valor, opciones) {
    opciones = opciones || {};
    return `<div class="${opciones.full ? 'full' : ''}"><label for="${id}">${etiqueta}</label>` +
        `<input type="${opciones.tipo || 'text'}" id="${id}" class="fic-editable" value="${escapeHtml(valor)}" maxlength="${opciones.max || 80}" placeholder="${escapeHtml(opciones.ph || '')}"></div>`;
}

// La edad no se guarda: se calcula con la fecha de nacimiento y la fecha de hoy, así sube sola cada cumpleaños.
function calcularEdad(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return null;
    const hoy = new Date();
    let edad = hoy.getFullYear() - Number(m[1]);
    const mes = hoy.getMonth() + 1;
    if (mes < Number(m[2]) || (mes === Number(m[2]) && hoy.getDate() < Number(m[3]))) edad--;
    return edad >= 0 ? edad : null;
}

function actualizarEdad() {
    const e = calcularEdad(document.getElementById('fic-nacimiento').value);
    document.getElementById('fic-edad').value = e === null ? '' : (e === 1 ? '1 año' : e + ' años');
}

// ---------- Calendario de la semana (fechas reales) ----------
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
let SEMANA_FICHA = ''; // lunes (AAAA-MM-DD) de la semana que se está viendo

function isoHoyCaracas() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' }); }
function isoSumar(iso, dias) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); }
function lunesDe(iso) { const d = new Date(iso + 'T00:00:00Z'); return isoSumar(iso, -((d.getUTCDay() + 6) % 7)); }
function partesIso(iso) { const p = iso.split('-').map(Number); return { y: p[0], m: p[1], d: p[2] }; }
function fechaCorta(iso) { const p = partesIso(iso); return p.d + ' ' + MESES_CORTO[p.m - 1]; }
function tituloSemana(lunes) {
    const a = partesIso(lunes), b = partesIso(isoSumar(lunes, 6));
    if (a.y !== b.y) return `Semana del ${a.d} de ${MESES_LARGO[a.m - 1]} de ${a.y} al ${b.d} de ${MESES_LARGO[b.m - 1]} de ${b.y}`;
    if (a.m !== b.m) return `Semana del ${a.d} de ${MESES_LARGO[a.m - 1]} al ${b.d} de ${MESES_LARGO[b.m - 1]} de ${b.y}`;
    return `Semana del ${a.d} al ${b.d} de ${MESES_LARGO[b.m - 1]} de ${b.y}`;
}
function hora12(h) {
    const m = /^(\d{2}):(\d{2})$/.exec(h || ''); if (!m) return '';
    let n = parseInt(m[1], 10); const suf = n >= 12 ? 'p. m.' : 'a. m.'; n = n % 12 || 12;
    return n + ':' + m[2] + ' ' + suf;
}

// Lo que dice el formulario en este momento (así el calendario reacciona mientras se edita)
function leerContextoFicha() {
    const v = id => { const el = document.getElementById(id); return el ? el.value : ''; };
    const dias = [];
    for (let d = 0; d <= 6; d++) dias.push({ activo: document.getElementById(`hor-activo-${d}`).checked, ent: v(`hor-inicio-${d}`), sal: v(`hor-fin-${d}`), di: v(`hor-desc-ini-${d}`), df: v(`hor-desc-fin-${d}`) });
    return { ingreso: v('fic-ingreso'), egreso: v('fic-egreso'), vacOn: document.getElementById('fic-vacaciones').checked, vd: v('fic-vac-desde'), vh: v('fic-vac-hasta'), dias };
}

function estadoDiaFicha(iso, d, c) {
    if (c.ingreso && iso < c.ingreso) return { k: 'fuera', txt: 'Aún no ingresa', corto: '✖' };
    if (c.egreso && iso > c.egreso) return { k: 'fuera', txt: 'Ya egresó', corto: '✖' };
    if (c.vacOn && c.vd && c.vh && iso >= c.vd && iso <= c.vh) return { k: 'vac', txt: '🏖️ Vacaciones', corto: '🏖️' };
    const x = c.dias[d];
    if (x.activo) {
        let t = (x.ent && x.sal) ? `${hora12(x.ent)} – ${hora12(x.sal)}` : 'Trabaja';
        if (x.di && x.df) t += ` · descanso ${hora12(x.di)} – ${hora12(x.df)}`;
        return { k: 'trabaja', txt: t, corto: '✔' };
    }
    return { k: 'libre', txt: 'Libre', corto: '–' };
}

function pintarSemanaFicha() {
    if (!document.getElementById('sem-strip') || !SEMANA_FICHA) return;
    const c = leerContextoFicha(), hoy = isoHoyCaracas();
    document.getElementById('sem-titulo').textContent = tituloSemana(SEMANA_FICHA);
    let strip = '';
    for (let d = 0; d <= 6; d++) {
        const iso = isoSumar(SEMANA_FICHA, d), est = estadoDiaFicha(iso, d, c), esHoy = iso === hoy;
        strip += `<div class="sem-celda ${est.k} ${esHoy ? 'hoy' : ''}" title="${escapeHtml(DIAS_TRABAJO[d] + ' ' + fechaCorta(iso) + ': ' + est.txt)}">${DIAS_TRABAJO[d].slice(0, 3)}<b>${partesIso(iso).d}</b>${est.corto}</div>`;
        document.getElementById(`hor-fecha-${d}`).textContent = fechaCorta(iso) + (esHoy ? ' · hoy' : '');
        document.getElementById(`hor-estado-${d}`).textContent = est.txt;
        const fila = document.getElementById(`hor-row-${d}`);
        fila.classList.toggle('estado-vac', est.k === 'vac');
        fila.classList.toggle('estado-fuera', est.k === 'fuera');
    }
    document.getElementById('sem-strip').innerHTML = strip;
}

function cambiarSemanaFicha(delta) {
    SEMANA_FICHA = delta === 0 ? lunesDe(isoHoyCaracas()) : isoSumar(SEMANA_FICHA, 7 * delta);
    pintarSemanaFicha();
}

function aplicarModoFicha() {
    const cont = document.getElementById('ficha-trabajador');
    if (!cont) return;
    cont.querySelectorAll('.fic-editable').forEach(el => { el.disabled = !FICHA_EDITANDO; });
    // Con "de vacaciones" marcado se bloquean los días de trabajo; el periodo vacacional solo se edita en ese caso
    const vac = document.getElementById('fic-vacaciones').checked;
    ['fic-vac-desde', 'fic-vac-hasta'].forEach(id => { document.getElementById(id).disabled = !FICHA_EDITANDO || !vac; });
    for (let d = 0; d <= 6; d++) {
        document.getElementById(`hor-activo-${d}`).disabled = !FICHA_EDITANDO || vac;
        toggleHorarioDia(d, true);
        document.getElementById(`hor-row-${d}`).classList.toggle('vac-bloqueado', vac);
    }
    cont.querySelectorAll('.solo-edicion').forEach(el => el.classList.toggle('oculto', !FICHA_EDITANDO));
    cont.querySelectorAll('.solo-vista').forEach(el => el.classList.toggle('oculto', FICHA_EDITANDO));
    pintarSemanaFicha();
}

function editarFicha() { FICHA_EDITANDO = true; aplicarModoFicha(); }
function cancelarEdicionFicha() { FICHA_EDITANDO = false; mostrarHorarioTrabajador(); } // vuelve a mostrar lo guardado

function mostrarHorarioTrabajador() {
    FICHA_EDITANDO = false;
    const cont = document.getElementById('ficha-trabajador');
    const u = HORARIOS_TRABAJO.find(x => String(x.id) === document.getElementById('hor-trabajador').value);
    if (!u) { cont.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem; margin-top:1rem; text-align:center;">' + (HORARIOS_TRABAJO.length ? 'No hay trabajadores asignados a esta tienda.' : 'Aún no hay usuarios. Créalos en la pestaña Usuarios.') + '</p>'; return; }
    FOTO_TRABAJADOR = u.foto || '';
    SEMANA_FICHA = lunesDe(isoHoyCaracas());
    const hoyISO = new Date().toLocaleDateString('en-CA');
    const esAdminRol = ['admin', 'superadmin'].includes(String(u.rol).toLowerCase());
    const multiTienda = SUCURSALES_ADMIN.length > 1;
    const opcionesTienda = multiTienda
        ? '<option value="">Todas las sucursales</option>' + SUCURSALES_ADMIN.map(x => `<option value="${x.id}" ${String(u.sucursal_id) === String(x.id) ? 'selected' : ''}>${escapeHtml(x.nombre)}</option>`).join('')
        : `<option value="">${escapeHtml(SUCURSALES_ADMIN.length ? SUCURSALES_ADMIN[0].nombre : 'Principal')}</option>`;
    const tiendaNombre = u.sucursal_id ? nombreSucursalAdmin(u.sucursal_id) : (multiTienda ? 'Todas las sucursales' : (SUCURSALES_ADMIN[0] ? SUCURSALES_ADMIN[0].nombre : 'Principal'));

    const filas = u.horario.map(h => {
        const d = h.dia_semana;
        return `<div class="hor-dia" id="hor-row-${d}">
            <div><div class="dia-nombre">${DIAS_TRABAJO[d]}</div><div class="hor-fecha" id="hor-fecha-${d}"></div>
                <label style="display:flex; align-items:center; margin:4px 0 0; font-size:0.78rem;"><input type="checkbox" id="hor-activo-${d}" class="fic-editable" onchange="toggleHorarioDia(${d})" ${h.activo ? 'checked' : ''}> Trabaja</label>
                <div class="hor-estado" id="hor-estado-${d}"></div></div>
            <div>
                <div class="horas"><small>Entrada</small><input type="time" id="hor-inicio-${d}" class="fic-editable" value="${h.hora_entrada}" oninput="pintarSemanaFicha()">
                    <small>Salida</small><input type="time" id="hor-fin-${d}" class="fic-editable" value="${h.hora_salida}" oninput="pintarSemanaFicha()"></div>
                <div class="horas" style="margin-top:0.4rem;"><small>Descanso</small><input type="time" id="hor-desc-ini-${d}" class="fic-editable" value="${h.descanso_desde || ''}" oninput="pintarSemanaFicha()">
                    <small>a</small><input type="time" id="hor-desc-fin-${d}" class="fic-editable" value="${h.descanso_hasta || ''}" oninput="pintarSemanaFicha()"></div>
            </div></div>`;
    }).join('');

    cont.innerHTML = `<div class="ficha-card">
        <div class="ficha-head">
            <div id="ficha-foto-box" class="ficha-foto"></div>
            <div>
                <div style="font-size:1.15rem; font-weight:bold;">${escapeHtml(((u.nombre || '') + ' ' + (u.apellido || '')).trim())}</div>
                <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.5rem;">Usuario: ${escapeHtml(u.username)} · Rol: ${escapeHtml(u.rol)}${u.cargo ? ' · Cargo: ' + escapeHtml(u.cargo) : ''} · 📍 ${escapeHtml(tiendaNombre)}${u.vacaciones ? ' · 🏖️ De vacaciones' : ''}</div>
                <div class="ficha-acciones">
                    <button type="button" class="btn-submit solo-vista" onclick="editarFicha()">✏️ Editar</button>
                    <button type="button" class="btn-peligro solo-vista" onclick="eliminarTrabajador()">🗑️ Eliminar</button>
                    <label for="ficha-foto-input" class="action-btn btn-edit solo-edicion" style="display:inline-block; margin:0; cursor:pointer; text-transform:none; font-size:0.8rem;">📷 Subir foto</label>
                    <input type="file" id="ficha-foto-input" accept="image/*" style="display:none" onchange="elegirFotoTrabajador(this)">
                    <button type="button" class="action-btn btn-delete solo-edicion" onclick="quitarFotoTrabajador()">Quitar foto</button>
                    <button type="button" class="btn-submit solo-edicion btn-guardar-ficha" onclick="guardarHorarios()">💾 Guardar</button>
                    <button type="button" class="btn-gris solo-edicion" onclick="cancelarEdicionFicha()">Cancelar</button>
                </div>
            </div>
        </div>

        <h3 class="ficha-sub">Datos personales</h3>
        <div class="ficha-grid">
            ${campoFicha('fic-nombre', 'Nombre', u.nombre)}
            ${campoFicha('fic-apellido', 'Apellido', u.apellido)}
            ${campoFicha('fic-cedula', 'Cédula', u.cedula, { max: 20, ph: 'V-12345678' })}
            ${campoFicha('fic-telefono', 'Teléfono', u.telefono, { max: 30, tipo: 'tel' })}
            <div><label for="fic-nacimiento">Fecha de nacimiento</label>
                <input type="date" id="fic-nacimiento" class="fic-editable" value="${escapeHtml(u.fecha_nacimiento || '')}" min="1900-01-01" max="${hoyISO}" onchange="actualizarEdad()" oninput="actualizarEdad()"></div>
            <div><label for="fic-edad">Edad (automática)</label>
                <input type="text" id="fic-edad" readonly tabindex="-1" placeholder="Se calcula sola"></div>
            ${campoFicha('fic-direccion', 'Dirección', u.direccion, { full: true, max: 300 })}
            ${campoFicha('fic-tel-familiar', 'Teléfono de un familiar', u.telefono_familiar, { max: 30, tipo: 'tel', full: true })}
        </div>

        <h3 class="ficha-sub">Puesto de trabajo</h3>
        <div class="ficha-grid">
            <div><label for="fic-cargo">Cargo a desempeñar</label>
                <input type="text" id="fic-cargo" class="fic-editable" list="lista-cargos" value="${escapeHtml(u.cargo || '')}" maxlength="60" placeholder="Ej: Cajero, Cocinero, Mesero...">
                <datalist id="lista-cargos"><option value="Cajero/a"><option value="Cocinero/a"><option value="Ayudante de cocina"><option value="Mesero/a"><option value="Repartidor / Motorizado"><option value="Encargado/a"><option value="Limpieza"><option value="Administrador/a"></datalist></div>
            <div><label for="fic-tienda">Tienda asignada</label>
                <select id="fic-tienda" ${esAdminRol ? 'disabled' : 'class="fic-editable"'}>${opcionesTienda}</select>
                ${esAdminRol ? '<p style="font-size:0.72rem;color:var(--text-muted);margin:4px 0 0;">Los administradores ven todas las tiendas.</p>' : (multiTienda ? '<p style="font-size:0.72rem;color:var(--text-muted);margin:4px 0 0;">Solo verá los pedidos y mesas de su tienda.</p>' : '')}</div>
            <div><label for="fic-ingreso">Fecha de ingreso</label>
                <input type="date" id="fic-ingreso" class="fic-editable" value="${escapeHtml(u.fecha_ingreso || '')}" min="1900-01-01" max="2100-12-31" onchange="pintarSemanaFicha()" oninput="pintarSemanaFicha()"></div>
            <div><label for="fic-egreso">Fecha de egreso</label>
                <input type="date" id="fic-egreso" class="fic-editable" value="${escapeHtml(u.fecha_egreso || '')}" min="1900-01-01" max="2100-12-31" onchange="pintarSemanaFicha()" oninput="pintarSemanaFicha()">
                <p style="font-size:0.72rem;color:var(--text-muted);margin:4px 0 0;">Déjala vacía si sigue trabajando en la empresa.</p></div>
        </div>

        <h3 class="ficha-sub">Salud</h3>
        <div class="ficha-grid">
            ${campoFicha('fic-alergias', 'Alérgico a', u.alergias, { full: true, max: 200, ph: 'Ninguna' })}
            ${campoFicha('fic-condicion', 'Condición médica', u.condicion_medica, { full: true, max: 300, ph: 'Ninguna' })}
            ${campoFicha('fic-medicamentos', 'Medicamentos que toma', u.medicamentos, { full: true, max: 300, ph: 'Ninguno' })}
        </div>

        <h3 class="ficha-sub">Vacaciones</h3>
        <label class="fila-vac"><input type="checkbox" id="fic-vacaciones" class="fic-editable" onchange="aplicarModoFicha()" ${u.vacaciones ? 'checked' : ''}> 🏖️ El trabajador está de vacaciones</label>
        <p style="font-size:0.78rem; color:var(--text-muted); margin:0 0 0.6rem;">Al marcarlo se bloquean los días de trabajo y se activa el periodo vacacional.</p>
        <div class="ficha-grid">
            <div><label for="fic-vac-desde">Periodo vacacional · desde</label>
                <input type="date" id="fic-vac-desde" class="fic-editable" value="${escapeHtml(u.vacaciones_desde || '')}" min="1900-01-01" max="2100-12-31" onchange="pintarSemanaFicha()" oninput="pintarSemanaFicha()"></div>
            <div><label for="fic-vac-hasta">Periodo vacacional · hasta</label>
                <input type="date" id="fic-vac-hasta" class="fic-editable" value="${escapeHtml(u.vacaciones_hasta || '')}" min="1900-01-01" max="2100-12-31" onchange="pintarSemanaFicha()" oninput="pintarSemanaFicha()"></div>
        </div>

        <h3 class="ficha-sub">Horario de trabajo</h3>
        <p style="font-size:0.78rem; color:var(--text-muted); margin:0 0 0.6rem; text-align:center;">Para cambiar cualquier dato o el horario, pulsa <b>✏️ Editar</b>. El horario se repite cada semana; el calendario muestra las fechas reales.</p>
        <div class="sem-nav">
            <button type="button" class="btn-gris btn-mini" onclick="cambiarSemanaFicha(-1)">◀ Anterior</button>
            <span class="titulo" id="sem-titulo"></span>
            <button type="button" class="btn-gris btn-mini" onclick="cambiarSemanaFicha(1)">Siguiente ▶</button>
            <button type="button" class="btn-gris btn-mini" onclick="cambiarSemanaFicha(0)">Hoy</button>
        </div>
        <div class="sem-strip" id="sem-strip"></div>
        <div class="sem-leyenda"><span>✔ Trabaja</span><span>– Libre</span><span>🏖️ Vacaciones</span><span>✖ Fuera de la empresa (antes del ingreso o después del egreso)</span></div>
        ${filas}

        <div class="ficha-acciones" style="margin-top:1rem;">
            <button type="button" class="btn-submit solo-vista" onclick="editarFicha()">✏️ Editar</button>
            <button type="button" class="btn-submit solo-edicion btn-guardar-ficha" onclick="guardarHorarios()">💾 Guardar cambios</button>
            <button type="button" class="btn-gris solo-edicion" onclick="cancelarEdicionFicha()">Cancelar</button>
        </div>
    </div>`;
    actualizarEdad();
    pintarFotoTrabajador();
    aplicarModoFicha();
}

function pintarFotoTrabajador() {
    const box = document.getElementById('ficha-foto-box');
    if (!box) return;
    box.innerHTML = FOTO_TRABAJADOR ? `<img src="${FOTO_TRABAJADOR}" alt="Foto" style="width:100%; height:100%; object-fit:cover;">` : '👤';
}

function quitarFotoTrabajador() { FOTO_TRABAJADOR = ''; pintarFotoTrabajador(); }

// La foto se recorta cuadrada y se comprime en el navegador (240 px) para que pese poco
function elegirFotoTrabajador(input) {
    const archivo = input.files && input.files[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () => {
        const img = new Image();
        img.onload = () => {
            const lado = Math.min(img.width, img.height), T = 240;
            const c = document.createElement('canvas'); c.width = T; c.height = T;
            c.getContext('2d').drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, T, T);
            FOTO_TRABAJADOR = c.toDataURL('image/jpeg', 0.72);
            pintarFotoTrabajador();
        };
        img.onerror = () => alert('No se pudo leer esa imagen.');
        img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
    input.value = '';
}

function toggleHorarioDia(dia, sinPintar) {
    const activo = document.getElementById(`hor-activo-${dia}`).checked;
    const bloqueado = !activo || !FICHA_EDITANDO || document.getElementById('fic-vacaciones').checked;
    ['hor-inicio-', 'hor-fin-', 'hor-desc-ini-', 'hor-desc-fin-'].forEach(p => { document.getElementById(p + dia).disabled = bloqueado; });
    if (!sinPintar) pintarSemanaFicha();
}

async function guardarHorarios() {
    const botones = document.querySelectorAll('.btn-guardar-ficha');
    const usuarioId = Number(document.getElementById('hor-trabajador').value);
    if (!usuarioId) { alert('Elige un trabajador.'); return; }
    const val = id => document.getElementById(id).value.trim();
    const horarios = [];
    for (let dia = 0; dia <= 6; dia++) {
        const activo = document.getElementById(`hor-activo-${dia}`).checked;
        const inicio = document.getElementById(`hor-inicio-${dia}`).value;
        const fin = document.getElementById(`hor-fin-${dia}`).value;
        const di = document.getElementById(`hor-desc-ini-${dia}`).value;
        const df = document.getElementById(`hor-desc-fin-${dia}`).value;
        if (activo && (!inicio || !fin)) { alert(`Falta la hora de entrada o salida el ${DIAS_TRABAJO[dia]}.`); return; }
        if (activo && (!!di !== !!df)) { alert(`El descanso del ${DIAS_TRABAJO[dia]} necesita hora de inicio y de fin (o déjalo vacío).`); return; }
        horarios.push({ dia_semana: dia, activo, hora_entrada: inicio || '09:00', hora_salida: fin || '17:00', descanso_desde: activo ? di : '', descanso_hasta: activo ? df : '' });
    }
    const ficha = {
        nombre: val('fic-nombre'), apellido: val('fic-apellido'), cedula: val('fic-cedula'), telefono: val('fic-telefono'),
        fecha_nacimiento: document.getElementById('fic-nacimiento').value, direccion: val('fic-direccion'),
        telefono_familiar: val('fic-tel-familiar'), alergias: val('fic-alergias'),
        condicion_medica: val('fic-condicion'), medicamentos: val('fic-medicamentos'), cargo: val('fic-cargo'), foto: FOTO_TRABAJADOR
    };
    const selTienda = document.getElementById('fic-tienda');
    if (selTienda && !selTienda.disabled) ficha.sucursal_id = parseInt(selTienda.value, 10) || null;
    if (!ficha.nombre) { alert('El nombre es obligatorio.'); return; }
    const vacOn = document.getElementById('fic-vacaciones').checked;
    ficha.fecha_ingreso = document.getElementById('fic-ingreso').value;
    ficha.fecha_egreso = document.getElementById('fic-egreso').value;
    ficha.vacaciones = vacOn;
    ficha.vacaciones_desde = vacOn ? document.getElementById('fic-vac-desde').value : '';
    ficha.vacaciones_hasta = vacOn ? document.getElementById('fic-vac-hasta').value : '';
    if (ficha.fecha_ingreso && ficha.fecha_egreso && ficha.fecha_egreso < ficha.fecha_ingreso) { alert('La fecha de egreso no puede ser anterior a la de ingreso.'); return; }
    if (vacOn && (!ficha.vacaciones_desde || !ficha.vacaciones_hasta)) { alert('Indica el periodo vacacional: desde y hasta.'); return; }
    if (vacOn && ficha.vacaciones_hasta < ficha.vacaciones_desde) { alert('El periodo vacacional termina antes de empezar.'); return; }

    botones.forEach(b => { b.disabled = true; b.innerText = "Guardando..."; });
    try {
        const res = await fetch(URL_GUARDAR_HORARIOS_TRABAJO, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
            body: JSON.stringify(Object.assign({ usuario_id: usuarioId, horarios }, ficha))
        });
        const data = await res.json();
        if (data.success) {
            await cargarHorarios();       // vuelve al modo "ver" con lo guardado
            await cargarUsuariosDesdeDB(); // por si cambió el nombre
            alert("✅ Ficha y horario guardados.");
        } else {
            alert("Error al guardar: " + (data.detail || data.error || "desconocido"));
        }
    } catch (error) {
        alert('Error de red al guardar.');
    } finally {
        document.querySelectorAll('.btn-guardar-ficha').forEach(b => { b.disabled = false; b.innerText = "💾 Guardar"; });
    }
}

// Para quien ya no trabaja en la empresa: borra su usuario (ya no podrá entrar), su ficha y su horario.
async function eliminarTrabajador() {
    const u = HORARIOS_TRABAJO.find(x => String(x.id) === document.getElementById('hor-trabajador').value);
    if (!u) return;
    const nombre = ((u.nombre || '') + ' ' + (u.apellido || '')).trim() || u.username;
    if (!confirm(`¿Eliminar a ${nombre}?\n\nSe borrará su usuario (ya no podrá iniciar sesión), su ficha y su horario. Esta acción no se puede deshacer.`)) return;
    try {
        const res = await fetch(ADMIN_URL_ELIMINAR_USUARIO, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
            body: JSON.stringify({ id: u.id })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) { alert('No se pudo eliminar: ' + (data.detail || data.error || 'error desconocido')); return; }
        await cargarHorarios();
        await cargarUsuariosDesdeDB();
        alert(`✅ ${nombre} fue eliminado.`);
    } catch (e) { alert('Error de red al eliminar.'); }
}

// ==========================================
// MÉTODOS DE PAGO (los ve el cliente en el menú, la caja y las estadísticas)
// ==========================================
let METODOS_PAGO = [];

async function cargarMetodosPago() {
    try {
        const res = await fetch(API_BASE + "/api/metodos-pago", { headers: authHeaders() });
        const data = await res.json();
        METODOS_PAGO = Array.isArray(data) ? data.map(String) : [];
        renderMetodosPago();
    } catch (error) { console.error("Error obteniendo métodos de pago:", error); }
}

function renderMetodosPago() {
    const cont = document.getElementById('lista-metodos-pago');
    cont.innerHTML = METODOS_PAGO.map((n, i) => `<div style="display:flex; gap:0.5rem; align-items:center;">
        <input type="text" maxlength="30" value="${escapeHtml(n)}" oninput="METODOS_PAGO[${i}] = this.value" style="margin-top:0; flex:1;">
        <button type="button" class="action-btn btn-delete" onclick="quitarMetodoPago(${i})" title="Quitar">🗑️</button></div>`).join('')
        || '<p style="color:var(--text-muted); font-size:0.85rem;">No hay métodos de pago. Agrega al menos uno.</p>';
}

function agregarMetodoPago() {
    const inp = document.getElementById('nuevo-metodo-pago');
    const n = inp.value.trim();
    if (!n) return;
    if (METODOS_PAGO.some(x => x.trim().toLowerCase() === n.toLowerCase())) { alert('Ese método ya está en la lista.'); return; }
    if (METODOS_PAGO.length >= 12) { alert('Máximo 12 métodos de pago.'); return; }
    METODOS_PAGO.push(n); inp.value = ''; renderMetodosPago();
}

function quitarMetodoPago(i) {
    if (METODOS_PAGO.length <= 1) { alert('Debe quedar al menos un método de pago.'); return; }
    METODOS_PAGO.splice(i, 1); renderMetodosPago();
}

async function guardarMetodosPago() {
    const btn = document.getElementById('btn-save-pagos');
    const lista = METODOS_PAGO.map(x => x.trim()).filter(Boolean);
    if (!lista.length) { alert('Debe quedar al menos un método de pago.'); return; }
    btn.disabled = true; btn.innerText = "Guardando...";
    try {
        const res = await fetch(API_BASE + "/api/metodos-pago/guardar", { method: 'POST', headers: authHeaders(), body: JSON.stringify({ metodos: lista }) });
        const data = await res.json();
        if (data.success) { alert("✅ Métodos de pago actualizados. El menú ya los muestra."); await cargarMetodosPago(); }
        else alert("Error al guardar: " + (data.detail || data.error || "desconocido"));
    } catch (e) { alert('Error de red al guardar.'); }
    finally { btn.disabled = false; btn.innerText = "💾 Guardar métodos de pago"; }
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

    let html = `<div data-ref="" data-nombre="" onclick="seleccionarItemAnuncio(this)" style="padding: 10px; cursor: pointer; font-size: 13px; color: #94a3b8; font-style: italic; border-bottom: 1px solid #4a5b94;" onmouseover="this.style.background='#4a5b94'" onmouseout="this.style.background='transparent'">Ninguno (anuncio solo informativo)</div>`;
    if (comboFiltrados.length > 0) {
        comboFiltrados.forEach(c => {
            const nombreLegible = `🍱 ${c.nombre} ($${c.precio.toFixed(2)})`;
            html += `<div data-ref="c_${c.id}" data-nombre="${escapeHtml(nombreLegible)}" onclick="seleccionarItemAnuncio(this)" style="padding: 10px; cursor: pointer; font-size: 13px; color: white; border-bottom: 1px solid #4a5b94;" onmouseover="this.style.background='#4a5b94'" onmouseout="this.style.background='transparent'">${escapeHtml(nombreLegible)}</div>`;
        });
    }
    if (prodFiltrados.length > 0) {
        prodFiltrados.forEach(p => {
            const nombreLegible = `🍔 ${p.nombre} ($${p.precio.toFixed(2)})`;
            html += `<div data-ref="p_${p.id}" data-nombre="${escapeHtml(nombreLegible)}" onclick="seleccionarItemAnuncio(this)" style="padding: 10px; cursor: pointer; font-size: 13px; color: white; border-bottom: 1px solid #4a5b94;" onmouseover="this.style.background='#4a5b94'" onmouseout="this.style.background='transparent'">${escapeHtml(nombreLegible)}</div>`;
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
                    <button class="action-btn btn-edit" onclick="moverItem(${cat.id}, 'categoria', 'inicio')" title="Mover al inicio">⤒</button>
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
            <div class="list-item ${opacityClass}" data-id="${p.id}">
                <div class="item-info">
                    <p class="item-title">${p.favorito ? '⭐ ' : ''}${p.nombre} <span style="color:#10b981">$${p.precio}</span>${badgeAgotado}</p>
                    <p class="item-meta">Cat: ${p.categoria} | Disp: ${p.disponible ? 'Sí' : 'No'}${p.inventario != null ? ` | <span style="color:${p.inventario <= 0 ? '#f87171' : (p.inventario <= 5 ? '#fbbf24' : '#34d399')}; font-weight:bold;">Inventario: ${p.inventario}</span>` : ''}</p>
                </div>
                <div class="item-actions">
                    <button class="action-btn btn-edit drag-handle" title="Mantén presionado y arrastra para mover esta tarjeta a donde quieras">↕ Mover</button>
                    <button class="action-btn btn-edit" onclick="editarProducto(${p.id})" title="Editar">✏️</button>
                    <button class="action-btn btn-delete" onclick="eliminarItem(${p.id}, 'producto')" title="Eliminar">🗑️</button>
                    <button class="action-btn btn-edit" onclick="abrirInventario(${p.id})" title="Inventario: cantidad disponible">📦 Inventario</button>
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
        html += `<div data-valor="" data-nombre="" onclick="seleccionarCategoriaCombo(this)" style="padding: 10px; cursor: pointer; font-size: 13px; color: #94a3b8; font-style: italic; border-bottom: 1px solid #4a5b94;" onmouseover="this.style.background='#4a5b94'" onmouseout="this.style.background='transparent'">Combos (por defecto)</div>`;
    }
    if (filtradas.length > 0) {
        filtradas.forEach(c => {
            html += `<div data-valor="${escapeHtml(c.nombre)}" data-nombre="${escapeHtml(c.nombre)}" onclick="seleccionarCategoriaCombo(this)" style="padding: 10px; cursor: pointer; font-size: 13px; color: white; border-bottom: 1px solid #4a5b94;" onmouseover="this.style.background='#4a5b94'" onmouseout="this.style.background='transparent'">${escapeHtml(c.nombre)}</div>`;
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
            <div class="list-item ${opacityClass}" data-id="${c.id}">
                <div class="item-info">
                    <p class="item-title">${c.favorito ? '⭐ ' : ''}${c.nombre} <span style="color:#10b981">$${c.precio}</span></p>
                    <p class="item-meta">Disp: ${c.disponible ? 'Sí' : 'No'}</p>
                </div>
                <div class="item-actions">
                    <button class="action-btn btn-edit drag-handle" title="Mantén presionado y arrastra para mover esta tarjeta a donde quieras">↕ Mover</button>
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
            html += `<div class="opcion-promo-producto" data-id="${p.id}" data-nombre="${escapeHtml(nombreLegible)}" onclick="seleccionarProductoPromo(this)" style="padding: 10px; cursor: pointer; font-size: 13px; color: white; border-bottom: 1px solid #4a5b94; display: flex; justify-content: space-between; align-items: center;" onmouseover="this.style.background='#4a5b94'" onmouseout="this.style.background='transparent'"><span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 10px;">${escapeHtml(p.nombre)}</span><span style="color:#10b981; font-weight: bold; flex-shrink: 0;">$${p.precio.toFixed(2)}</span></div>`;
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
    if (valorSeleccionado.startsWith('CAT_')) { nombreLegible = "📁 Toda la categoría: " + valorSeleccionado.replace('CAT_', ''); } 
    else if (valorSeleccionado.startsWith('PROD_')) {
        const pId = parseInt(valorSeleccionado.replace('PROD_', ''));
        const p = adminProductos.find(x => x.id === pId);
        if (p) nombreLegible = "🍔 Producto: " + p.nombre;
    }

    const idCaja = 'sug-combo-' + Math.random().toString(36).substr(2, 9);
    fila.innerHTML = `
        <div style="flex: 2; position: relative;">
            <input type="text" onfocus="buscarItemCombo(this, '${idCaja}')" oninput="buscarItemCombo(this, '${idCaja}')" value="${nombreLegible}" placeholder="🔍 Buscar producto fijo..." autocomplete="off" class="item-visible" style="width: 100%; padding: 0.75rem; background-color: #222c57; border: 1px solid #4a5b94; color: white; border-radius: 6px; outline: none;">
            <input type="hidden" class="item-referencia" value="${valorSeleccionado}">
            <div id="${idCaja}" class="caja-sugerencias hidden" style="display: none; position: absolute; z-index: 50; width: 100%; margin-top: 4px; background: #2e3a68; border: 1px solid #4a5b94; border-radius: 6px; max-height: 250px; overflow-y: auto; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5);"></div>
        </div>
        <input type="number" class="item-cantidad" min="1" value="${qty}" required style="flex: 1; padding: 0.75rem; background-color: #222c57; border: 1px solid #4a5b94; color: white; border-radius: 6px;" placeholder="Cant.">
        ${valorSeleccionado.startsWith('CAT_') ? `<button type="button" onclick="convertirFilaCategoriaASeleccion(this)" title="Elegir cuáles productos de esta categoría puede escoger el cliente" style="background: #0e7490; color: white; border: none; border-radius: 4px; padding: 0 10px; cursor: pointer; font-size: 11px; font-weight: bold; white-space: nowrap;">👆 Elegir cuáles</button>` : ''}
        <button type="button" onclick="this.parentElement.remove()" style="background: #e11d48; color: white; border: none; border-radius: 4px; padding: 0 15px; cursor: pointer; font-weight: bold;">X</button>
    `;
    contenedor.appendChild(fila);
}

// Grupo "Elegir entre estos productos": el dueño marca cuáles productos concretos puede escoger
// el cliente y cuántos elige (ej. 4 hamburguesas entre 4 de las 8 del menú).
function agregarGrupoSeleccionCombo(existente = null) {
    const contenedor = document.getElementById('lista-items-combo');
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const marcados = new Set(((existente && existente.productos) || []).map(Number));
    const cats = [...new Set(adminProductos.map(p => p.categoria).filter(Boolean))];

    const grupo = document.createElement('div');
    grupo.className = 'fila-seleccion-combo';
    grupo.style.cssText = 'border: 1px solid #0e7490; background: linear-gradient(#10343f, #0d2c36); border-radius: 10px; padding: 14px; margin-bottom: 12px;';
    grupo.innerHTML = `
        <div style="display:flex; justify-content: space-between; align-items:flex-start; gap: 10px; margin-bottom: 10px;">
            <div>
                <p style="color:#67e8f9; font-size: 13px; font-weight: bold; margin: 0;">👆 El cliente elige entre estos productos</p>
                <p style="color:#94a3b8; font-size: 11.5px; margin: 4px 0 0; line-height: 1.5;">Marca solo los productos que puede escoger. Los agotados no se le muestran. El precio del combo no cambia, sea cual sea el que elija.</p>
            </div>
            <button type="button" class="sel-quitar" style="flex-shrink:0; background:#e11d48; color:white; border:none; border-radius:6px; padding:6px 12px; cursor:pointer; font-weight:bold; font-size: 11px;">Quitar</button>
        </div>
        <div style="display:flex; gap:10px; margin-bottom:10px;">
            <div style="flex:2;">
                <label style="display:block; font-size:11px; color:#67e8f9; font-weight:normal; text-transform:none; margin-bottom:3px;">¿Qué elige? (lo ve el cliente, ej. Hamburguesa, Refresco)</label>
                <input type="text" class="sel-nombre" value="${esc(existente ? existente.nombre : '')}" placeholder="Ej: Hamburguesa" style="width:100%; padding:0.6rem; background-color:#222c57; border:1px solid #4a5b94; color:white; border-radius:6px;">
            </div>
            <div style="flex:1;">
                <label style="display:block; font-size:11px; color:#67e8f9; font-weight:normal; text-transform:none; margin-bottom:3px;">¿Cuántos elige?</label>
                <input type="number" class="sel-cantidad" min="1" value="${existente ? (existente.cantidad || 1) : 1}" style="width:100%; padding:0.6rem; background-color:#222c57; border:1px solid #4a5b94; color:white; border-radius:6px;">
            </div>
        </div>
        <div style="display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
            <input type="text" class="sel-filtro" placeholder="🔍 Filtrar productos..." style="flex:2; min-width:120px; padding:0.5rem; background-color:#222c57; border:1px solid #4a5b94; color:white; border-radius:6px;">
            <select class="sel-cat" style="flex:1; min-width:110px; padding:0.5rem; background-color:#222c57; border:1px solid #4a5b94; color:white; border-radius:6px;">
                <option value="">Todas las categorías</option>
                ${cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
            </select>
        </div>
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px; flex-wrap:wrap;">
            <button type="button" class="sel-todos" style="background:#155e75; color:white; border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:11px;">Marcar los visibles</button>
            <button type="button" class="sel-ninguno" style="background:#334155; color:white; border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:11px;">Quitar todos</button>
            <span class="sel-contador" style="font-size:11px; color:#fbbf24; font-weight:bold; margin-left:auto;"></span>
        </div>
        <div class="sel-lista" style="max-height: 220px; overflow-y: auto; border: 1px solid #164e63; border-radius: 6px; background:#0b2530;">
            ${adminProductos.map(p => `
                <label class="sel-fila" data-nombre="${esc(String(p.nombre).toLowerCase())}" data-cat="${esc(p.categoria || '')}" style="display:flex; align-items:center; gap:8px; padding:7px 10px; border-bottom:1px solid #164e63; cursor:pointer; font-size:13px; color:white; text-transform:none; font-weight:normal; margin:0;">
                    <input type="checkbox" class="sel-chk" value="${p.id}" ${marcados.has(Number(p.id)) ? 'checked' : ''} style="width:auto; margin:0;">
                    <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(p.nombre)}</span>
                    <span style="color:#10b981; font-weight:bold; flex-shrink:0;">$${Number(p.precio || 0).toFixed(2)}</span>
                </label>`).join('')}
        </div>`;

    const contador = grupo.querySelector('.sel-contador');
    const actualizarContador = () => {
        const n = grupo.querySelectorAll('.sel-chk:checked').length;
        contador.textContent = n === 0 ? 'Ninguno marcado' : (n === 1 ? '1 marcado' : n + ' marcados');
    };
    const aplicarFiltro = () => {
        const t = grupo.querySelector('.sel-filtro').value.toLowerCase().trim();
        const c = grupo.querySelector('.sel-cat').value;
        grupo.querySelectorAll('.sel-fila').forEach(f => {
            const ok = (!t || f.dataset.nombre.includes(t)) && (!c || f.dataset.cat === c);
            f.style.display = ok ? 'flex' : 'none';
        });
    };
    grupo.querySelector('.sel-filtro').addEventListener('input', aplicarFiltro);
    grupo.querySelector('.sel-cat').addEventListener('change', aplicarFiltro);
    grupo.querySelectorAll('.sel-chk').forEach(ch => ch.addEventListener('change', actualizarContador));
    grupo.querySelector('.sel-todos').onclick = () => { grupo.querySelectorAll('.sel-fila').forEach(f => { if (f.style.display !== 'none') f.querySelector('.sel-chk').checked = true; }); actualizarContador(); };
    grupo.querySelector('.sel-ninguno').onclick = () => { grupo.querySelectorAll('.sel-chk').forEach(ch => ch.checked = false); actualizarContador(); };
    grupo.querySelector('.sel-quitar').onclick = () => grupo.remove();
    actualizarContador();
    contenedor.appendChild(grupo);
}

// Convierte una fila vieja "📁 Toda la categoría: X" en el bloque "El cliente elige entre estos
// productos", con todos los de esa categoría ya marcados para que solo desmarques los que no van.
function convertirFilaCategoriaASeleccion(btn) {
    const fila = btn.closest('.fila-item-combo');
    const ref = fila.querySelector('.item-referencia').value;
    if (!ref.startsWith('CAT_')) return;
    const cat = ref.replace('CAT_', '');
    const qty = parseInt(fila.querySelector('.item-cantidad').value, 10) || 1;
    const ids = adminProductos.filter(p => p.categoria === cat).map(p => p.id);
    agregarGrupoSeleccionCombo({ nombre: cat, cantidad: qty, productos: ids });
    const grupo = document.getElementById('lista-items-combo').lastElementChild;
    fila.replaceWith(grupo);
    grupo.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function agregarGrupoPiezasAlternativas(alternativasExistentes = null, modoExistente = 'excluyente') {
    const contenedor = document.getElementById('lista-items-combo');
    const grupo = document.createElement('div');
    grupo.className = 'fila-piezas-alternativas';
    grupo.style.cssText = 'border: 1px solid #92400e; background: linear-gradient(#4a3414, #3f2c12); border-radius: 10px; padding: 14px; margin-bottom: 12px;';
    grupo.innerHTML = `
        <div style="display:flex; justify-content: space-between; align-items:flex-start; gap: 10px; margin-bottom: 12px;">
            <div>
                <p style="color:#fbbf24; font-size: 13px; font-weight: bold; margin: 0;">🧩 Elección por piezas</p>
                <p style="color:#94a3b8; font-size: 11.5px; margin: 4px 0 0; line-height: 1.5;">El cliente elige rolls completos tocándolos, no piezas sueltas: en cada fila defines cuántos rolls elige y cuántas piezas vale cada uno. Para que pueda mezclar categorías (ej. 3 rolls entre clásicos, tempura y fríos) usa UNA sola fila y márcale todas esas categorías. Usa 2+ filas solo cuando sean ofertas distintas entre sí (ej. Tempura 12pz o Frío 10pz); ahí elige abajo cómo se comportan esas pestañas.</p>
            </div>
            <button type="button" onclick="this.closest('.fila-piezas-alternativas').remove()" style="flex-shrink:0; background:#e11d48; color:white; border:none; border-radius:6px; padding:6px 12px; cursor:pointer; font-weight:bold; font-size: 11px;">Quitar</button>
        </div>
        <label style="display:block; margin-bottom:12px; font-size:11px; color:#fbbf24; font-weight:normal; text-transform:none;">
            Con 2+ filas, ¿cómo se comportan las pestañas?
            <select class="grupo-modo-piezas" onchange="sincronizarModoPiezas(this.closest('.fila-piezas-alternativas'))" style="width:100%; margin-top:4px; padding:8px; background:#222c57; border:1px solid #4a5b94; color:white; border-radius:6px; font-size:12px;">
                <option value="excluyente" ${modoExistente === 'excluyente' ? 'selected' : ''}>Excluyentes: el cliente elige SOLO una pestaña (ej. Tempura 12pz o Frío 10pz)</option>
                ${modoExistente === 'compartido' ? `<option value="compartido" selected>Piezas compartidas (opción retirada — al guardar se convertirá a excluyente)</option>` : ''}
                <option value="todas" ${modoExistente === 'todas' ? 'selected' : ''}>Todas obligatorias: el cliente debe completar cada pestaña por separado (ej. 1 roll clásico + 1 tempura + 1 individual + 1 guarnición)</option>
            </select>
        </label>
        <div class="lista-alternativas-piezas" style="display:flex; flex-direction:column; gap:10px;"></div>
        <button type="button" class="btn-add-alternativa" style="margin-top:10px; background:#4a5b94; color:white; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:bold;">+ Agregar fila</button>
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
    fila.style.cssText = 'background:#222c57; border:1px solid #4a5b94; border-radius:8px; padding:10px;';

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
            <input type="text" class="alt-nombre" placeholder="Nombre (ej. Opción 1, o 'Variado')" value="${escapeHtml(datos.nombre || '')}" style="flex:1; padding:8px; background:#1d2650; border:1px solid #4a5b94; color:white; border-radius:6px; font-size:13px; margin:0;">
            <button type="button" onclick="this.closest('.fila-alternativa-piezas').remove()" title="Quitar esta fila" style="flex-shrink:0; background:transparent; color:#f87171; border:1px solid #7f1d1d; border-radius:6px; width:34px; height:34px; cursor:pointer; font-size:14px;"><i class="fa-solid fa-trash-can"></i></button>
        </div>
        <div class="alt-cantidades" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:10px;">
            <label style="font-size:11px; color:#94a3b8; margin:0; text-transform:none; font-weight:normal;">El cliente elige</label>
            <input type="number" class="alt-selecciones" min="1" value="${selecciones}" onchange="recalcularTotalPiezas(this)" oninput="recalcularTotalPiezas(this)" style="width:64px; padding:8px; background:#1d2650; border:1px solid #4a5b94; color:white; border-radius:6px; font-size:13px; margin:0; text-align:center;">
            <label style="font-size:11px; color:#94a3b8; margin:0; text-transform:none; font-weight:normal;">opción(es), y cada una vale</label>
            <input type="number" class="alt-piezas" min="1" placeholder="Piezas" value="${porSeleccion}" onchange="recalcularTotalPiezas(this)" oninput="recalcularTotalPiezas(this)" style="width:70px; padding:8px; background:#1d2650; border:1px solid #4a5b94; color:white; border-radius:6px; font-size:13px; margin:0; text-align:center;">
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
        prodFiltrados.forEach(p => { html += `<div onclick="seleccionarSugerenciaCombo(this, '${idCaja}', 'PROD_${p.id}', '🍔 Producto: ${p.nombre}')" style="padding: 10px 20px 10px 10px; cursor: pointer; font-size: 13px; color: white; border-bottom: 1px solid #4a5b94; transition: background 0.2s; display: flex; justify-content: space-between; align-items: center;" onmouseover="this.style.background='#4a5b94'" onmouseout="this.style.background='transparent'"><span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 10px;">🍔 ${p.nombre}</span><span style="color:#10b981; font-weight: bold; flex-shrink: 0;">$${p.precio.toFixed(2)}</span></div>`; });
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

        let faltaCompletarSeleccion = false;
        document.querySelectorAll('.fila-seleccion-combo').forEach(g => {
            const nombre = g.querySelector('.sel-nombre').value.trim();
            const cantidad = parseInt(g.querySelector('.sel-cantidad').value, 10);
            const productos = [...g.querySelectorAll('.sel-chk:checked')].map(ch => parseInt(ch.value, 10));
            if (!nombre || !(cantidad > 0) || productos.length < 2) { faltaCompletarSeleccion = true; return; }
            itemsSeleccionados.push({ tipo: 'seleccion', nombre, cantidad, productos });
        });
        if (faltaCompletarSeleccion) { alert('⚠️ En cada "El cliente elige entre estos productos" escribe qué elige, cuántos elige y marca al menos 2 productos. Si solo hay uno, agrégalo como producto fijo.'); return; }

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
            else if (item.tipo === 'seleccion') { agregarGrupoSeleccionCombo(item); }
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
    if (dir === 'inicio') {
        const l = tipo === 'combo' ? adminCombos : (tipo === 'categoria' ? adminCategorias : adminProductos);
        const ids = l.map(x => x.id).filter(x => x !== id);
        ids.unshift(id);
        return guardarOrden(tipo, ids);
    }
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
// Arrastrar tarjetas (ratón o dedo): se mantiene presionado "↕ Mover", se suelta donde se quiere la tarjeta
function activarArrastre(contId, tipo) {
    const cont = document.getElementById(contId);
    if (!cont || cont._arrastre) return;
    cont._arrastre = true;
    cont.addEventListener('pointerdown', e => {
        const h = e.target.closest('.drag-handle');
        if (!h || (e.pointerType === 'mouse' && e.button !== 0)) return;
        const card = h.closest('.list-item');
        if (!card) return;
        e.preventDefault();
        try { h.setPointerCapture(e.pointerId); } catch (_) {}
        let sc = cont.parentElement;
        while (sc && sc !== document.body && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
        if (!sc || sc === document.body) sc = document.scrollingElement;
        const esVentana = sc === document.scrollingElement;
        const y0 = e.clientY, scroll0 = sc.scrollTop;
        let y = y0, raf = 0, destino = null, alFinal = false;
        card.classList.add('arrastrando');
        const hermanas = () => [].slice.call(cont.children).filter(c => c !== card && c.classList.contains('list-item'));
        const marcar = () => {
            hermanas().forEach(c => c.classList.remove('drop-antes', 'drop-final'));
            const hs = hermanas();
            destino = hs.find(c => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; }) || null;
            alFinal = !destino;
            if (destino) destino.classList.add('drop-antes');
            else if (hs.length) hs[hs.length - 1].classList.add('drop-final');
        };
        const tick = () => {
            const r = esVentana ? { top: 0, bottom: window.innerHeight } : sc.getBoundingClientRect();
            const zona = 60;
            if (y < r.top + zona) sc.scrollTop -= 14; else if (y > r.bottom - zona) sc.scrollTop += 14;
            card.style.transform = 'translateY(' + (y - y0 + (sc.scrollTop - scroll0)) + 'px)';
            marcar();
            raf = requestAnimationFrame(tick);
        };
        const mover = ev => { y = ev.clientY; };
        const soltar = ev => {
            cancelAnimationFrame(raf);
            window.removeEventListener('pointermove', mover);
            window.removeEventListener('pointerup', soltar);
            window.removeEventListener('pointercancel', soltar);
            const hs = hermanas();
            hs.forEach(c => c.classList.remove('drop-antes', 'drop-final'));
            card.classList.remove('arrastrando'); card.style.transform = '';
            if (ev.type === 'pointercancel') return;
            const visIds = [].slice.call(cont.children).map(c => +c.dataset.id);
            const nuevoVis = hs.map(c => +c.dataset.id);
            nuevoVis.splice(alFinal ? nuevoVis.length : nuevoVis.indexOf(+destino.dataset.id), 0, +card.dataset.id);
            if (nuevoVis.join() === visIds.join()) return; // no cambió de lugar
            const lista = tipo === 'combo' ? adminCombos : adminProductos;
            const enVista = new Set(visIds); let k = 0;
            guardarOrden(tipo, lista.map(x => x.id).map(id => enVista.has(id) ? nuevoVis[k++] : id));
        };
        window.addEventListener('pointermove', mover);
        window.addEventListener('pointerup', soltar);
        window.addEventListener('pointercancel', soltar);
        raf = requestAnimationFrame(tick);
    });
}
activarArrastre('lista-productos-container', 'producto');
activarArrastre('lista-combos-container', 'combo');

// Inventario: cantidad disponible por producto; se descuenta con cada pedido y al llegar a 0 queda sin stock
let inventarioProductoId = null;
function abrirInventario(id) {
    const p = adminProductos.find(x => x.id === id); if (!p) return;
    inventarioProductoId = id;
    document.getElementById('inv-nombre').textContent = p.nombre;
    document.getElementById('inv-cantidad').value = p.inventario != null ? p.inventario : '';
    document.getElementById('inv-estado').textContent = p.inventario != null ? `Actualmente quedan ${p.inventario}.` : 'Este producto no tiene control de inventario (siempre disponible).';
    document.getElementById('inv-quitar').style.display = p.inventario != null ? '' : 'none';
    document.getElementById('modal-inventario').style.display = 'flex';
    setTimeout(() => document.getElementById('inv-cantidad').focus(), 50);
}
function cerrarInventario() { document.getElementById('modal-inventario').style.display = 'none'; inventarioProductoId = null; }
async function guardarInventario(quitar) {
    if (inventarioProductoId === null) return;
    let cantidad = null;
    if (!quitar) {
        const v = document.getElementById('inv-cantidad').value.trim();
        if (v === '' || !/^\d+$/.test(v)) { alert('Escribe la cantidad disponible (un número entero, 0 o más).'); return; }
        cantidad = parseInt(v, 10);
    }
    try {
        const r = await fetch(ADMIN_URL_INVENTARIO, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }, body: JSON.stringify({ id: inventarioProductoId, cantidad }) });
        if (!r.ok) throw new Error();
        cerrarInventario();
        await cargarDatosAdmin();
    } catch (e) { alert('No se pudo guardar el inventario.'); }
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
