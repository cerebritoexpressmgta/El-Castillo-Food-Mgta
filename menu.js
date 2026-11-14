// ==========================================
// PROTOTIPO COMIDA RÁPIDA - LÓGICA DEL CLIENTE (FRONTEND)
// ==========================================

const URL_OBTENER_MENU = API_BASE + "/api/menu/";
const URL_VERIFICAR_CLIENTE = API_BASE + "/api/clientes/verificar";
const URL_REGISTRAR_CLIENTE = API_BASE + "/api/clientes/registrar";
const URL_OBTENER_HORARIOS = API_BASE + "/api/horarios/";
const URL_OBTENER_ANUNCIOS = API_BASE + "/api/anuncios/";

let menuData = {};
let cart = {};
let datosClienteLogueado = null;
let horariosAtencion = [];
let anunciosActivos = [];
let anuncioIndiceActual = 0;
let loteComboEnCurso = null; // { id, restantes, total } — unidades de un combo que aún faltan por personalizar tras escribir una cantidad mayor ('restantes' incluye la que se está armando)
let comboIdSelectorActivo = null; // combo cuyas personalizaciones se están listando para eliminar
let pendientesPersonalizarCombo = {}; // { [comboId]: cantidad } — el cliente ya eligió cuántos quiere pero todavía no los personalizó

// --- 1. ARRANQUE Y CONTROL DE ESTADOS ---
function mostrarIconosHeaderSesion(mostrar) {
    ['header-settings-btn', 'header-logout-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.classList.toggle('hidden', !mostrar);
        btn.classList.toggle('flex', mostrar);
    });
}


// =====================================================================
// SUCURSALES: el cliente elige dónde pide; el menú, las mesas y el
// WhatsApp son los de esa sucursal.
// =====================================================================
let SUCURSALES = [];
let SUCURSAL_ACTUAL = null;
let WHATSAPP_GENERAL = '';
function numeroWhatsAppPedido() { const n = v => String(v || '').replace(/\D/g, ''); return n(SUCURSAL_ACTUAL && SUCURSAL_ACTUAL.whatsapp) || n(WHATSAPP_GENERAL); }
const CLAVE_SUCURSAL = 'sucursal_elegida';

function sucursalParam() { return SUCURSAL_ACTUAL ? 'sucursal=' + SUCURSAL_ACTUAL.id : ''; }
function buscarSucursal(id) { return SUCURSALES.find(s => String(s.id) === String(id)) || null; }

function pedirSucursal() {
    return new Promise(resolve => {
        const fondo = document.createElement('div');
        fondo.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:16px';
        const caja = document.createElement('div');
        caja.style.cssText = 'background:#fff;color:#111;border-radius:20px;padding:22px;max-width:420px;width:100%;max-height:90vh;overflow:auto;font-family:system-ui,sans-serif';
        caja.innerHTML = '<div style="font-size:20px;font-weight:800;margin-bottom:4px">¿Dónde quieres pedir?</div><div style="color:#6b7280;font-size:14px;margin-bottom:14px">Elige la sucursal. El menú y la entrega serán de esa sucursal.</div>';
        SUCURSALES.forEach(s => {
            const b = document.createElement('button');
            b.type = 'button';
            b.style.cssText = 'display:block;width:100%;text-align:left;background:#f9fafb;border:2px solid #e5e7eb;border-radius:14px;padding:14px;margin-bottom:10px;cursor:pointer;font:inherit';
            b.innerHTML = '<div style="font-weight:800;font-size:16px">📍 ' + escapeHtml(s.nombre) + '</div>' +
                (s.direccion ? '<div style="color:#6b7280;font-size:13px;margin-top:2px">' + escapeHtml(s.direccion) + '</div>' : '') +
                (s.horario ? '<div style="color:#6b7280;font-size:12px;margin-top:2px">🕒 ' + escapeHtml(s.horario) + '</div>' : '');
            b.onclick = () => { fondo.remove(); resolve(s); };
            caja.appendChild(b);
        });
        fondo.appendChild(caja); document.body.appendChild(fondo);
    });
}

function pintarChipSucursal() {
    const previo = document.getElementById('chip-sucursal'); if (previo) previo.remove();
    if (!SUCURSAL_ACTUAL || SUCURSALES.length < 2) return;
    const chip = document.createElement('div');
    chip.id = 'chip-sucursal';
    chip.style.cssText = 'background:#fef3c7;color:#78350f;border-bottom:1px solid #fde68a;text-align:center;font-size:14px;font-weight:600;padding:8px 12px';
    chip.innerHTML = '📍 Pides en <b>' + escapeHtml(SUCURSAL_ACTUAL.nombre) + '</b> · <button type="button" style="background:none;border:0;color:#b45309;font:inherit;font-weight:800;text-decoration:underline;cursor:pointer">Cambiar</button>';
    chip.querySelector('button').onclick = async () => {
        const nueva = await pedirSucursal();
        if (String(nueva.id) === String(SUCURSAL_ACTUAL.id)) return;
        if (Object.keys(cart).length && !confirm('Al cambiar de sucursal se vacía tu carrito porque el menú puede ser distinto. ¿Continuar?')) return;
        localStorage.setItem(CLAVE_SUCURSAL, nueva.id);
        const u = new URL(location.href); u.searchParams.delete('sucursal'); u.searchParams.delete('mesa'); location.href = u.toString();
    };
    const cab = document.querySelector('header');
    if (cab) cab.insertAdjacentElement('afterend', chip);
}

async function resolverSucursal() {
    try { const r = await fetch(API_BASE + '/api/sitio'); const d = await r.json(); SUCURSALES = (d.sucursales || []).filter(s => s.activa !== false); WHATSAPP_GENERAL = (d.sitio && d.sitio.whatsapp) || ''; } catch (e) { SUCURSALES = []; }
    if (SUCURSALES.length === 0) { SUCURSAL_ACTUAL = null; return; }
    if (SUCURSALES.length === 1) { SUCURSAL_ACTUAL = SUCURSALES[0]; return; }
    const deUrl = buscarSucursal(new URLSearchParams(location.search).get('sucursal'));
    SUCURSAL_ACTUAL = deUrl || buscarSucursal(localStorage.getItem(CLAVE_SUCURSAL)) || await pedirSucursal();
    localStorage.setItem(CLAVE_SUCURSAL, SUCURSAL_ACTUAL.id);
    pintarChipSucursal();
}

function armarMensajeWhatsApp(datos, items, tipo, direccion, nombre, metodoPago) {
    const negocio = (window.MARCA && window.MARCA.nombre) || 'el restaurante';
    const lineas = items.map(i => '• ' + i.qty + 'x ' + i.name).join('\n');
    const num = datos && datos.pedido ? ' #' + datos.pedido.id_visual : '';
    const total = datos && datos.pedido ? '\nTotal: $' + Number(datos.pedido.total).toFixed(2) : '';
    return 'Hola, soy ' + nombre + '. Hice el pedido' + num + ' en ' + negocio + (SUCURSAL_ACTUAL && SUCURSALES.length > 1 ? ' (' + SUCURSAL_ACTUAL.nombre + ')' : '') + '.\n' +
        'Tipo: ' + tipo + (direccion ? ' · ' + direccion : '') + '\nPago: ' + metodoPago + '\n' + lineas + total;
}
function mostrarBotonWhatsApp(texto) {
    const cont = document.getElementById('wa-sucursal'); if (!cont) return;
    const num = numeroWhatsAppPedido();
    if (!num) { cont.classList.add('hidden'); cont.innerHTML = ''; return; }
    cont.classList.remove('hidden');
    cont.innerHTML = '<a href="https://wa.me/' + num + '?text=' + encodeURIComponent(texto) + '" target="_blank" rel="noopener" style="display:inline-block;background:#16a34a;color:#fff;font-weight:800;padding:14px 22px;border-radius:14px;text-decoration:none;font-size:16px">💬 Enviar mi pedido por WhatsApp' + (SUCURSALES.length > 1 && SUCURSAL_ACTUAL ? ' a ' + escapeHtml(SUCURSAL_ACTUAL.nombre) : '') + '</a>' +
        '<div style="color:#6b7280;font-size:12px;margin-top:8px">Así coordinas el pago y la entrega directamente.</div>';
}

window.onload = async function() {
    await resolverSucursal(); // primero se sabe la sucursal: de ella dependen el menú y las mesas
    cargarMesasCliente().then(aplicarMesaDeUrl); // lista de mesas y, si viene de un QR de mesa, la deja elegida
    precargarAnuncios(); // arranca la descarga de las imágenes de anuncios de una vez, sin esperar al login
    history.replaceState({ step: 'auth' }, "Autenticación");


    const sesionCliente = localStorage.getItem('sesionCliente');
    if (sesionCliente) {
        datosClienteLogueado = JSON.parse(sesionCliente);
        document.getElementById('lbl-cliente-activo').innerText = datosClienteLogueado.nombre;
        mostrarIconosHeaderSesion(true);
        await cargarMenuDesdeDB();
        goToStep(1);
        revisarClaveDeSesionGuardada(); // en segundo plano
    } else {
        goToStep('auth');
    }
};

// Quien ya tenía la sesión guardada en este celular no pasa por el paso del
// número, así que aquí es donde se entera de que tiene que crear su clave.
// De paso refresca sus direcciones con lo que hay en la base.
async function revisarClaveDeSesionGuardada() {
    if (!datosClienteLogueado || !datosClienteLogueado.telefono) return;
    try {
        const response = await fetch(`${URL_VERIFICAR_CLIENTE}?telefono=${encodeURIComponent(datosClienteLogueado.telefono)}`);
        if (!response.ok) return;
        const lista = await response.json();
        if (!Array.isArray(lista) || lista.length === 0) return;
        datosClienteLogueado = { ...datosClienteLogueado, ...lista[0] };
        localStorage.setItem('sesionCliente', JSON.stringify(datosClienteLogueado));
        // `=== false` a propósito: un backend viejo no manda el campo y no hay
        // que pedirle una clave que todavía no sabe guardar.
        if (lista[0].tiene_clave === false) goToStep('crear-clave');
    } catch (e) { /* sin conexión: se revisa la próxima vez */ }
}

window.onpopstate = function(event) {
    if (event.state && event.state.step) {
        goToStep(event.state.step, false);
    } else {
        goToStep('auth', false);
    }
};

function goToStep(stepNumber, pushState = true) {
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    document.getElementById(`step-${stepNumber}`).classList.add('active');
    window.scrollTo(0, 0);

    const backBtn = document.getElementById('header-back-btn');
    if (stepNumber !== 'auth' && stepNumber !== 'registro' && stepNumber > 1 && stepNumber < 4) {
        backBtn.classList.remove('invisible');
    } else {
        backBtn.classList.add('invisible');
    }

    updateStickyBarVisibility(stepNumber);

    if (stepNumber === 3) {
        const banner = document.getElementById('banner-cerrado');
        if (banner) {
            if (estaAbiertoAhora()) banner.classList.add('hidden');
            else mostrarBannerCerrado();
        }
    }

    if (pushState) {
        history.pushState({ step: stepNumber }, `Paso ${stepNumber}`);
    }
}

// --- HORARIO DE ATENCIÓN: los clientes pueden ver el menú siempre, pero solo pedir dentro del horario ---
async function cargarHorariosAtencion() {
    try {
        const response = await fetch(URL_OBTENER_HORARIOS);
        if (!response.ok) throw new Error('Error al obtener horarios');
        const data = await response.json();
        horariosAtencion = Array.isArray(data) ? data : (data.data || []);
    } catch (error) {
        console.error("Error obteniendo horario de atención:", error);
    }
}

function obtenerFechaHoraCaracas() {
    const ahora = new Date();
    const fechaCaracas = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Caracas' }); // "YYYY-MM-DD"
    const [anio, mes, dia] = fechaCaracas.split('-').map(Number);
    const diaSemanaJS = new Date(anio, mes - 1, dia).getDay(); // 0=domingo...6=sábado
    const diaSemana = (diaSemanaJS + 6) % 7; // 0=lunes...6=domingo (igual que el backend)
    const horaActual = ahora.toLocaleTimeString('en-GB', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit' });
    return { diaSemana, horaActual };
}

function horaEnRango(horaActual, desde, hasta) {
    if (desde <= hasta) return horaActual >= desde && horaActual <= hasta;
    // El rango cruza la medianoche (ej: desde 17:00 hasta 02:00) — sigue "abierto" desde `desde` hasta el final del día, y de nuevo desde el inicio del día hasta `hasta`.
    return horaActual >= desde || horaActual <= hasta;
}

function estaAbiertoAhora() {
    if (!Array.isArray(horariosAtencion) || horariosAtencion.length === 0) return true; // sin config cargada, no bloqueamos
    const { diaSemana, horaActual } = obtenerFechaHoraCaracas();
    const hoy = horariosAtencion.find(h => h.dia_semana === diaSemana);
    if (!hoy || !hoy.activo || !hoy.hora_apertura || !hoy.hora_cierre) return false;
    return horaEnRango(horaActual, hoy.hora_apertura, hoy.hora_cierre);
}

function formatearHorarioTexto() {
    if (!Array.isArray(horariosAtencion) || horariosAtencion.length === 0) return "nuestro horario habitual";
    const nombres = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const ordenados = [...horariosAtencion].sort((a, b) => a.dia_semana - b.dia_semana);

    const grupos = [];
    ordenados.forEach(h => {
        const clave = h.activo ? `${h.hora_apertura}-${h.hora_cierre}` : 'cerrado';
        const ultimo = grupos[grupos.length - 1];
        if (ultimo && ultimo.clave === clave) {
            ultimo.diaFin = h.dia_semana;
        } else {
            grupos.push({ clave, activo: h.activo, diaInicio: h.dia_semana, diaFin: h.dia_semana, apertura: h.hora_apertura, cierre: h.hora_cierre });
        }
    });

    const texto = grupos.filter(g => g.activo).map(g => {
        const rango = g.diaInicio === g.diaFin ? nombres[g.diaInicio] : `${nombres[g.diaInicio]} a ${nombres[g.diaFin]}`;
        return `${rango} de ${g.apertura} a ${g.cierre}`;
    }).join(', ');

    return texto || "nuestro horario habitual";
}

function mostrarBannerCerrado() {
    const banner = document.getElementById('banner-cerrado');
    if (!banner) return;
    banner.innerText = `⏰ En este momento no nos encontramos laborando. Prueba hacer tu pedido en nuestro horario laboral: ${formatearHorarioTexto()}. También puedes escribirnos por WhatsApp si deseas más información.`;
    banner.classList.remove('hidden');
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// --- DISPONIBILIDAD PROGRAMADA POR HORARIO/DÍA (productos y combos individuales) ---
function itemDentroDeHorarioProgramado(item) {
    if (!item.disponible_desde && !item.disponible_hasta && !item.dias_disponibles) return true;
    const { diaSemana, horaActual } = obtenerFechaHoraCaracas();

    if (item.dias_disponibles) {
        const dias = String(item.dias_disponibles).split(',').map(d => parseInt(d.trim()));
        if (!dias.includes(diaSemana)) return false;
    }
    if (item.disponible_desde && item.disponible_hasta) {
        if (!horaEnRango(horaActual, item.disponible_desde, item.disponible_hasta)) return false;
    }
    return true;
}

// --- ANUNCIOS/POPUPS DE PROMOCIONES AL ABRIR EL MENÚ ---

// INTERRUPTOR: mientras esté en false, el anuncio no lleva al producto. Ni al
// tocar la foto ni con el botón "Ordenar esta promoción", que queda escondido.
// Toda la lógica sigue intacta más abajo (irAItemDeAnuncio): para volver a
// activarlo basta con poner true aquí, no hay que tocar nada más.
const ANUNCIOS_LLEVAN_AL_PRODUCTO = false;

// Un anuncio lleva al producto solo si la función está activada Y ese anuncio
// tiene un producto asociado desde el panel de administración.
function anuncioLlevaAlProducto(anuncio) {
    return ANUNCIOS_LLEVAN_AL_PRODUCTO && !!(anuncio && anuncio.producto_ref);
}

let promesaPrecargaAnuncios = null;

// Se llama lo antes posible (antes de terminar el login) para que las imágenes
// ya estén descargadas en caché del navegador cuando el popup deba mostrarse.
function precargarAnuncios() {
    if (promesaPrecargaAnuncios) return promesaPrecargaAnuncios;
    promesaPrecargaAnuncios = (async () => {
        try {
            const response = await fetch(URL_OBTENER_ANUNCIOS + "?t=" + new Date().getTime());
            if (!response.ok) throw new Error('Error al obtener anuncios');
            const data = await response.json();
            const anuncios = Array.isArray(data) ? data : (data.data || []);
            anunciosActivos = anuncios.filter(a => a.activo).sort((a, b) => (a.orden || 0) - (b.orden || 0));
            anunciosActivos.forEach(a => {
                if (!a.imagen) return;
                // <link rel=preload fetchpriority=high> le pide al navegador que la
                // descargue YA y le dé prioridad sobre otras imágenes de la página
                // (ej. los íconos de categoría), en vez de competir en igualdad de
                // condiciones por las conexiones disponibles.
                const link = document.createElement('link');
                link.rel = 'preload';
                link.as = 'image';
                // Tiene que ser EXACTAMENTE la misma URL que luego usa el <img>
                // del modal (ver mostrarAnuncioEnIndice), o el navegador la
                // descarga dos veces y la precarga no sirve de nada.
                link.href = urlImagen(a.imagen, 800);
                link.setAttribute('fetchpriority', 'high');
                document.head.appendChild(link);
            });
        } catch (error) {
            console.error("Error precargando anuncios:", error);
        }
    })();
    return promesaPrecargaAnuncios;
}

async function cargarYMostrarAnuncios() {
    await precargarAnuncios();
    anuncioIndiceActual = 0;
    if (anunciosActivos.length > 0) mostrarAnuncioEnIndice(0);
}

function mostrarAnuncioEnIndice(indice) {
    const anuncio = anunciosActivos[indice];
    if (!anuncio) return;

    const imgEl = document.getElementById('anuncio-modal-imagen');
    imgEl.setAttribute('data-original', anuncio.imagen || '');
    imgEl.onerror = () => imagenConRespaldo(imgEl);
    imgEl.src = urlImagen(anuncio.imagen || '', 800); // mismo ancho que la precarga
    imgEl.style.cursor = anuncioLlevaAlProducto(anuncio) ? 'pointer' : 'default';

    document.getElementById('anuncio-modal-titulo').innerText = anuncio.titulo || '';
    document.getElementById('anuncio-modal-titulo').classList.toggle('hidden', !anuncio.titulo);
    document.getElementById('anuncio-modal-texto').innerText = anuncio.texto || '';
    document.getElementById('anuncio-modal-texto').classList.toggle('hidden', !anuncio.texto);

    const btnPedir = document.getElementById('anuncio-modal-btn-pedir');
    btnPedir.classList.toggle('hidden', !anuncioLlevaAlProducto(anuncio));

    const hayMas = indice < anunciosActivos.length - 1;
    const btnEntendido = document.getElementById('anuncio-modal-btn');
    btnEntendido.innerText = hayMas ? 'Siguiente ➔' : 'Entendido, ver menú';
    // Si no hay a dónde llevar, "Entendido" es la única acción y va destacado.
    if (anuncioLlevaAlProducto(anuncio)) {
        btnEntendido.className = 'mt-3 w-full font-bold py-3 rounded-xl transition cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700';
    } else {
        btnEntendido.className = 'mt-3 w-full font-bold py-3 rounded-xl transition cursor-pointer bg-red-600 hover:bg-red-700 text-white';
    }

    const modal = document.getElementById('modal-anuncio');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function cerrarAnuncioActual() {
    if (anuncioIndiceActual < anunciosActivos.length - 1) {
        anuncioIndiceActual++;
        mostrarAnuncioEnIndice(anuncioIndiceActual);
        return;
    }
    const modal = document.getElementById('modal-anuncio');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function irAItemDeAnuncio() {
    // Desactivado a propósito: la foto del anuncio conserva su onclick en el
    // HTML, pero aquí no pasa nada mientras el interruptor esté en false.
    if (!ANUNCIOS_LLEVAN_AL_PRODUCTO) return;

    const anuncio = anunciosActivos[anuncioIndiceActual];
    if (!anuncio || !anuncio.producto_ref) return;

    const modal = document.getElementById('modal-anuncio');
    modal.classList.add('hidden');
    modal.classList.remove('flex');

    const itemId = anuncio.producto_ref;
    let categoriaEncontrada = null;
    let itemEncontrado = null;
    Object.keys(menuData).forEach(catKey => {
        const encontrado = menuData[catKey].items.find(i => i.id === itemId);
        if (encontrado) { categoriaEncontrada = catKey; itemEncontrado = encontrado; }
    });

    if (!itemEncontrado) {
        alert('Este producto o combo ya no está disponible.');
        return;
    }

    selectCategory(categoriaEncontrada);

    const esComboConOpciones = itemEncontrado.opciones_combo && itemEncontrado.opciones_combo !== '' && itemEncontrado.opciones_combo !== '[]';
    if (esComboConOpciones) {
        abrirModalCombo(itemEncontrado);
    } else {
        setTimeout(() => {
            const cardEl = document.getElementById('item-card-' + itemId);
            if (!cardEl) return;
            cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            cardEl.classList.add('ring-4', 'ring-red-400');
            setTimeout(() => cardEl.classList.remove('ring-4', 'ring-red-400'), 2000);
        }, 100);
    }
}

// --- 2. AUTENTICACIÓN Y REGISTRO ---
async function procesarVerificacionTelefono(event) {
    event.preventDefault();
    const txtTelefono = leerTelefonoDeFormulario('auth-phone');
    if (!txtTelefono) return;

    const btn = document.getElementById('btn-auth-submit');
    btn.disabled = true; btn.innerText = "Verificando...";

    try {
        // encodeURIComponent es obligatorio: sin él, el '+' de los números
        // internacionales se decodifica como espacio y el cliente no se encuentra.
        const response = await fetch(`${URL_VERIFICAR_CLIENTE}?telefono=${encodeURIComponent(txtTelefono)}`);
        if (!response.ok) throw new Error('Error de red');
        
        const resultado = await response.json();
        const listaClientes = Array.isArray(resultado) ? resultado : (resultado.data || []);

        if (listaClientes.length > 0) {
            datosClienteLogueado = listaClientes[0];
            localStorage.setItem('sesionCliente', JSON.stringify(datosClienteLogueado));
            document.getElementById('lbl-cliente-activo').innerText = datosClienteLogueado.nombre;
            mostrarIconosHeaderSesion(true);

            await cargarMenuDesdeDB();
            // Cliente de antes de que existiera la clave: la crea una sola vez.
            goToStep(datosClienteLogueado.tiene_clave === false ? 'crear-clave' : 1);
        } else {
            document.getElementById('reg-name').value = '';
            document.getElementById('reg-clave').value = '';
            document.getElementById('reg-clave-2').value = '';
            document.getElementById('reg-doc-tipo').value = 'V';
            document.getElementById('reg-cedula-numero').value = '';
            document.getElementById('reg-address').value = '';
            goToStep('registro');
        }
    } catch (e) {
        console.error(e);
        alert("Ocurrió un error de conexión al verificar el teléfono.");
    } finally {
        btn.disabled = false; btn.innerText = "Ingresar ➔";
    }
}

async function procesarRegistroCliente(event) {
    event.preventDefault();

    // La cédula/RIF es opcional: si no la escriben, el cliente se guarda sin ella.
    // Se manda "" y no null a propósito: así el registro sigue funcionando aunque el
    // backend todavía no haya terminado de desplegar el cambio que la vuelve opcional.
    const tipoDoc = document.getElementById('reg-doc-tipo').value;
    const numeroDoc = document.getElementById('reg-cedula-numero').value.trim().replace(/[^0-9]/g, '');

    const clave = document.getElementById('reg-clave').value;
    if (!claveNuevaValida(clave, document.getElementById('reg-clave-2').value)) return;

    const payload = {
        telefono: leerTelefonoDeFormulario('auth-phone'),
        nombre: document.getElementById('reg-name').value.trim(),
        cedula: numeroDoc ? `${tipoDoc}-${numeroDoc}` : '',
        direccion_principal: document.getElementById('reg-address').value.trim(),
        direcciones_extra: '[]',
        clave: clave
    };

    const btn = document.getElementById('btn-reg-submit');
    btn.disabled = true; btn.innerText = "Registrando...";

    try {
        const response = await fetch(URL_REGISTRAR_CLIENTE, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            alert(await motivoDelRechazo(response, "No se pudo completar el registro."));
            return;
        }

        // La clave no se guarda en el navegador: solo viaja al registrarse.
        delete payload.clave;
        payload.tiene_clave = true;
        datosClienteLogueado = payload;
        localStorage.setItem('sesionCliente', JSON.stringify(datosClienteLogueado));
        document.getElementById('lbl-cliente-activo').innerText = datosClienteLogueado.nombre;
        mostrarIconosHeaderSesion(true);

        await cargarMenuDesdeDB();
        goToStep(1);
    } catch(e) {
        console.error(e);
        alert("No se pudo completar el registro.");
    } finally {
        btn.disabled = false; btn.innerText = "Crear Cuenta y Ver Menú 🎉";
    }
}

// --- CLAVE DEL CLIENTE ---
// Se crea una vez. Para pedir basta el número; la clave solo se pide para
// cambiar el número o borrar/cambiar direcciones (lo decide el backend).

function claveNuevaValida(clave, repetida) {
    if ((clave || '').trim().length < 4) { alert('La clave debe tener al menos 4 caracteres.'); return false; }
    if (clave !== repetida) { alert('Las dos claves no coinciden. Escríbelas de nuevo.'); return false; }
    return true;
}

async function procesarCrearClave(event) {
    event.preventDefault();
    const clave = document.getElementById('nueva-clave').value;
    if (!claveNuevaValida(clave, document.getElementById('nueva-clave-2').value)) return;

    const btn = document.getElementById('btn-crear-clave');
    btn.disabled = true; btn.innerText = 'Guardando...';
    try {
        const response = await fetch(API_BASE + "/api/clientes/crear-clave", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telefono: datosClienteLogueado.telefono, clave: clave })
        });
        if (!response.ok) {
            alert(await motivoDelRechazo(response, 'No se pudo guardar la clave. Intenta de nuevo.'));
            return;
        }
        datosClienteLogueado.tiene_clave = true;
        localStorage.setItem('sesionCliente', JSON.stringify(datosClienteLogueado));
        document.getElementById('nueva-clave').value = '';
        document.getElementById('nueva-clave-2').value = '';
        goToStep(1);
    } catch (e) {
        console.error(e);
        alert('Error de conexión al guardar la clave.');
    } finally {
        btn.disabled = false; btn.innerText = 'Guardar clave y ver el menú';
    }
}

// Ventanita para pedir la clave. Devuelve la clave, o null si el cliente cancela.
// Se arma aquí y no en el HTML para que la caja (que carga este mismo archivo)
// no tenga que copiar el marcado.
function pedirClaveCliente(mensaje) {
    return new Promise(resolve => {
        const fondo = document.createElement('div');
        fondo.className = 'fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4';
        fondo.innerHTML = `
            <form class="bg-white rounded-3xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
                <h3 class="text-lg font-black text-gray-800">🔐 Confirma que eres tú</h3>
                <p class="text-xs text-gray-500"></p>
                <input type="password" autocomplete="current-password" required class="w-full p-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-red-500" placeholder="Tu clave">
                <div class="flex gap-2">
                    <button type="button" data-accion="cancelar" class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-2.5 rounded-xl text-sm cursor-pointer">Cancelar</button>
                    <button type="submit" class="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl text-sm cursor-pointer">Confirmar</button>
                </div>
                <p class="text-[10px] text-gray-400 text-center">¿La olvidaste? Escríbenos por WhatsApp y la restablecemos.</p>
            </form>`;
        fondo.style.zIndex = '60'; // por encima del modal "Mis datos" (z-50)
        fondo.querySelector('p').textContent = mensaje || 'Para este cambio necesitamos tu clave.';
        const input = fondo.querySelector('input');
        const cerrar = (valor) => { fondo.remove(); resolve(valor); };
        fondo.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); cerrar(input.value); });
        fondo.querySelector('[data-accion="cancelar"]').addEventListener('click', () => cerrar(null));
        document.body.appendChild(fondo);
        input.focus();
    });
}

// Hace un POST de cambio de datos y, si el backend responde que hace falta la
// clave (401), la pide y reintenta hasta que sea correcta o el cliente cancele.
// Devuelve la respuesta final, o null si canceló.
async function enviarCambioConClave(url, cuerpo) {
    let clave = null;
    let mensaje = null;
    while (true) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(clave ? { ...cuerpo, clave } : cuerpo)
        });
        if (response.status !== 401) return response;

        mensaje = clave ? 'La clave no es correcta. Intenta de nuevo.' : null;
        clave = await pedirClaveCliente(mensaje);
        if (clave === null) return null;
    }
}

function cerrarSesionCliente() {
    localStorage.removeItem('sesionCliente');
    datosClienteLogueado = null;
    document.getElementById('auth-phone').value = '';
    mostrarIconosHeaderSesion(false);
    goToStep('auth');
}

// --- 1. CARGA DINÁMICA DE LA BASE DE DATOS ---
async function cargarMenuDesdeDB() {
    cargarHorariosAtencion(); // en paralelo, no bloquea el render del catálogo
    cargarMetodosPago('payment-method'); // métodos de pago configurables, en paralelo
    cargarYMostrarAnuncios(); // popup de promociones, en paralelo
    try {
        const urlFresca = URL_OBTENER_MENU + "?t=" + new Date().getTime() + (SUCURSAL_ACTUAL ? "&" + sucursalParam() : "");
        const response = await fetch(urlFresca);
        
        if (!response.ok) throw new Error('Error al conectar con el servidor');
        
        const rawData = await response.json();
        const data = (Array.isArray(rawData) && rawData[0].menu) ? rawData[0] : rawData;

        menuData = {}; 

        const productosBase = data.menu ? (data.menu.productos || []) : (Array.isArray(data) ? data : []);
        const combos = data.menu ? (data.menu.combos || []) : [];
        const categoriasDeBaseDatos = data.menu ? (data.menu.categorias || []) : []; 

        const procesarItem = (prod, esCombo = false) => {
            const categoriaRaw = String(prod.categoria || (esCombo ? 'Combos' : 'Otros')).trim();
            const categoriaKey = categoriaRaw.toLowerCase().replace(/\s+/g, '_');

            if (!menuData[categoriaKey]) {
                const catInfoDB = categoriasDeBaseDatos.find(c => c.nombre.toLowerCase() === categoriaRaw.toLowerCase());
                menuData[categoriaKey] = {
                    titulo: categoriaRaw.charAt(0).toUpperCase() + categoriaRaw.slice(1),
                    imagen: catInfoDB ? catInfoDB.imagen : '', 
                    items: []
                };
            }

            const idUnico = esCombo ? 'c_' + prod.id : 'p_' + prod.id;

            menuData[categoriaKey].items.push({
                id: idUnico,
                name: prod.nombre,
                price: parseFloat(prod.precio),
                desc: prod.descripcion || "",
                image: prod.imagen || "",
                opciones_combo: esCombo ? (prod.items_json || prod.items || null) : null,
                disponible: prod.disponible !== false,
                agotado: prod.agotado === true,
                promoCantidadMinima: esCombo ? (parseInt(prod.promo_cantidad_minima) || 0) : 0,
                promoProductoId: esCombo ? (prod.promo_producto_id || null) : null,
                promoProductoCantidad: esCombo ? (parseInt(prod.promo_producto_cantidad) || 0) : 0,
                disponible_desde: prod.disponible_desde || null,
                disponible_hasta: prod.disponible_hasta || null,
                dias_disponibles: prod.dias_disponibles || null,
                // Precio por paquete (ej. el par de lumpias). Solo productos.
                precioPaquete: esCombo ? 0 : (parseFloat(prod.precio_paquete) || 0),
                cantidadPaquete: esCombo ? 0 : (parseInt(prod.cantidad_paquete, 10) || 0)
            });
        };

        productosBase.forEach(p => procesarItem(p, false));
        combos.forEach(c => procesarItem(c, true));

        // Las categorías se muestran en el orden definido en Administración (las que no estén ahí van al final)
        const ordenCats = categoriasDeBaseDatos.map(c => String(c.nombre).trim().toLowerCase().replace(/\s+/g, '_'));
        const clavesOrdenadas = Object.keys(menuData).sort((a, b) => {
            const ia = ordenCats.indexOf(a), ib = ordenCats.indexOf(b);
            return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
        });
        const menuOrdenado = {};
        clavesOrdenadas.forEach(k => { menuOrdenado[k] = menuData[k]; });
        menuData = menuOrdenado;
        
        renderizarCategorias(); 
    } catch (error) {
        console.error("Error obteniendo el menú:", error);
    }
}

// --- 2. EL PINTOR DE BOTONES DE CATEGORÍAS ---
function renderizarCategorias() {
    const container = document.getElementById('contenedor-categorias');
    if (!container) return;
    container.innerHTML = ''; 

    const iconosRespado = ['🍔', '🍟', '🍗', '🥤', '🍦', '🌭', '🍕', '🔥']; 

    Object.keys(menuData).forEach((catKey, index) => {
        const catInfo = menuData[catKey];
        const itemsVisibles = catInfo.items.filter(i => i.disponible !== false && !i.agotado && itemDentroDeHorarioProgramado(i));
        if (itemsVisibles.length === 0) return; // categoría solo con ítems de uso interno (ej. componentes de combos)

        let arteVisual = '';
        if (catInfo.imagen && esUrlImagen(catInfo.imagen)) {
            // Se pinta en un recuadro de 48px (w-12 h-12); 128 cubre pantallas 2x
            arteVisual = `<img src="${urlImagen(catInfo.imagen, 128)}" data-original="${escapeHtml(catInfo.imagen)}" onerror="imagenConRespaldo(this)" alt="${catInfo.titulo}" loading="lazy" fetchpriority="low" class="w-full h-full object-cover">`;
        } else {
            // Si la categoría trae un emoji como imagen se usa; si no, uno de respaldo
            arteVisual = (catInfo.imagen && String(catInfo.imagen).trim()) ? escapeHtml(catInfo.imagen.trim()) : iconosRespado[index % iconosRespado.length];
        }

        const btnHtml = `
            <button type="button" onclick="selectCategory('${catKey}')" class="w-full bg-white rounded-2xl p-4 flex items-center gap-4 shadow-sm border border-gray-100 hover:border-red-200 transition cursor-pointer text-left">
                <div class="w-12 h-12 bg-red-50 text-red-600 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 overflow-hidden">
                    ${arteVisual}
                </div>
                <div>
                    <h3 class="font-bold text-gray-800 text-lg">${catInfo.titulo}</h3>
                    <p class="text-xs text-gray-400">${itemsVisibles.length} ${itemsVisibles.length === 1 ? 'opción disponible' : 'opciones disponibles'}</p>
                </div>
            </button>
        `;
        container.insertAdjacentHTML('beforeend', btnHtml);
    });
}

// --- 3. ACTUALIZACIÓN DEL SELECTOR DE CATEGORÍAS ---
// La tarjeta de un plato o combo se pinta igual en el menú del cliente y en el de
// los trabajadores (que además la reutiliza para los resultados del buscador),
// así que vive aparte en vez de estar enterrada dentro de selectCategory.
function construirTarjetaItemHtml(item) {
    let currentQty = 0;
    Object.keys(cart).forEach(key => {
        if (key === String(item.id) || key.startsWith(item.id + "_")) {
            currentQty += cart[key].qty;
        }
    });
    const pendientesActuales = pendientesPersonalizarCombo[item.id] || 0;
    currentQty += pendientesActuales;

    const esEnlace = item.image && esUrlImagen(item.image);
    const vistaImagen = esEnlace
        ? `<img src="${urlImagen(item.image, 192)}" data-original="${escapeHtml(item.image)}" onerror="imagenConRespaldo(this)" alt="${item.name}" loading="lazy" class="w-20 h-20 object-cover rounded-xl flex-shrink-0 bg-gray-100 border border-gray-100 shadow-sm">`
        : `<div class="w-20 h-20 rounded-xl flex-shrink-0 bg-red-50 text-red-500 border border-red-100 flex items-center justify-center text-4xl shadow-sm">${item.image || '🍔'}</div>`;

    // Los combos con opciones personalizables ya llevan su propia nota dentro del
    // modal de personalización (cada unidad puede querer una distinta); mostrar
    // aquí también el campo de nota creaba una línea de carrito fantasma sin piezas
    // seleccionadas en cuanto el cliente empezaba a escribir.
    const esComboPersonalizable = esComboConOpciones(item);
    const bloqueNotaHtml = esComboPersonalizable
        ? `<p class="text-[10px] text-gray-400 mt-1">👉 Podrás elegir las opciones de tu combo y añadir una nota</p>`
        : `
            <button type="button" onclick="toggleNoteField('${item.id}')" id="note-btn-${item.id}" class="text-[11px] font-medium text-gray-500 hover:text-red-600 flex items-center gap-1 cursor-pointer select-none">
                📝 Añadir nota especial
            </button>
            <input type="text" id="note-input-${item.id}" oninput="updateItemNote('${item.id}', '${item.name}', ${item.price}, this.value)" class="hidden w-full mt-1.5 p-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-red-500 placeholder-gray-400" placeholder="Especificación para este plato...">
        `;

    // Para combos con opciones: elegir la cantidad no abre el modal de una vez, solo
    // "reserva" cuántos faltan por personalizar. Este botón aparece mientras haya
    // pendientes y es el único disparador que abre el modal para ese combo.
    const bloquePersonalizarPendienteHtml = esComboPersonalizable ? `
        <div id="personalizar-pendiente-${item.id}" class="${pendientesActuales > 0 ? '' : 'hidden'}">
            <button type="button" onclick="personalizarPendientesCombo('${item.id}')" class="w-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold py-2 rounded-xl transition cursor-pointer mt-1.5">
                👉 Elegir opciones (${pendientesActuales} por elegir)
            </button>
        </div>
    ` : '';

    const itemHtml = `
        <div id="item-card-${item.id}" class="bg-white p-3 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-2 transition-all">
            <div class="flex items-center justify-between gap-3">
                
                <div class="flex items-center gap-3 flex-grow min-w-0 cursor-pointer" onclick="abrirDetalleProducto('${item.id}')">
                    ${vistaImagen}
                    <div class="flex-grow min-w-0 pr-1">
                        <h4 class="text-sm font-bold text-gray-800 leading-snug">${item.name}</h4>
                        <p class="text-xs text-gray-400 my-0.5 line-clamp-2">${item.desc}</p>
                        <span class="text-red-600 font-bold text-sm block mt-0.5">$${item.price.toFixed(2)}</span>
                        ${(parseFloat(item.precioPaquete) || 0) > 0 && (parseInt(item.cantidadPaquete, 10) || 0) > 1
                            ? `<span class="inline-block mt-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">${item.cantidadPaquete} por $${parseFloat(item.precioPaquete).toFixed(2)}</span>`
                            : ''}
                    </div>
                </div>
                <div class="flex items-center space-x-1 bg-gray-100 p-1 rounded-xl flex-shrink-0 border border-gray-200">
                    <button type="button" onclick="updateQty('${item.id}', '${item.name}', ${item.price}, -1)" class="w-8 h-8 bg-white rounded-lg font-bold text-lg text-gray-700 shadow-sm select-none cursor-pointer">-</button>
                    <input type="number" id="qty-${item.id}" value="${currentQty}" min="0" onchange="setExactQty('${item.id}', '${item.name}', ${item.price}, this.value)" class="w-9 text-center font-black bg-transparent focus:outline-none text-sm text-gray-800">
                    <button type="button" onclick="updateQty('${item.id}', '${item.name}', ${item.price}, 1)" class="w-8 h-8 bg-white rounded-lg font-bold text-lg text-gray-700 shadow-sm select-none cursor-pointer">+</button>
                </div>
            </div>
            <div class="border-t border-gray-100 pt-1">
                ${bloqueNotaHtml}
            </div>
            ${bloquePersonalizarPendienteHtml}
        </div>
    `;

    return itemHtml;
}

function selectCategory(categoryKey) {
    const container = document.getElementById('items-container');
    container.innerHTML = '';

    document.getElementById('category-title').innerText = menuData[categoryKey].titulo;

    menuData[categoryKey].items
        .filter(item => item.disponible !== false && !item.agotado && itemDentroDeHorarioProgramado(item))
        .forEach(item => container.insertAdjacentHTML('beforeend', construirTarjetaItemHtml(item)));

    goToStep(2);
}

// --- MODAL DE DETALLE DE PRODUCTO (foto grande + descripción completa) ---
function abrirDetalleProducto(itemId) {
    let encontrado = null;
    Object.values(menuData).forEach(cat => {
        const match = cat.items.find(i => i.id === itemId);
        if (match) encontrado = match;
    });
    if (!encontrado) return;

    const esEnlace = encontrado.image && esUrlImagen(encontrado.image);
    document.getElementById('modal-detalle-producto-imagen-wrap').innerHTML = esEnlace
        ? `<div class="relative w-full h-full">
                <div class="absolute inset-0 flex items-center justify-center">
                    <div class="w-8 h-8 border-4 border-gray-300 border-t-red-500 rounded-full animate-spin"></div>
                </div>
                <img src="${urlImagen(encontrado.image, 640)}" data-original="${escapeHtml(encontrado.image)}" alt="${escapeHtml(encontrado.name)}" class="relative w-full h-full object-contain opacity-0 transition-opacity duration-300" onload="this.classList.remove('opacity-0')" onerror="if (this.dataset.original &amp;&amp; this.src !== this.dataset.original) { this.src = this.dataset.original; } else { this.closest('.relative').innerHTML='<div class=&quot;w-full h-full flex items-center justify-center text-7xl bg-red-50 text-red-500&quot;>🍔</div>'; }">
           </div>`
        : `<div class="w-full h-full flex items-center justify-center text-7xl bg-red-50 text-red-500">${encontrado.image || '🍔'}</div>`;

    document.getElementById('modal-detalle-producto-nombre').innerText = encontrado.name;
    document.getElementById('modal-detalle-producto-desc').innerText = encontrado.desc || 'Sin descripción disponible.';
    document.getElementById('modal-detalle-producto-precio').innerText = `$${encontrado.price.toFixed(2)}`;

    const modal = document.getElementById('modal-detalle-producto');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function cerrarModalDetalleProducto() {
    const modal = document.getElementById('modal-detalle-producto');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// --- 4. LÓGICA DEL CARRITO ---
function toggleNoteField(id) {
    const input = document.getElementById(`note-input-${id}`);
    const btn = document.getElementById(`note-btn-${id}`);
    if (input.classList.contains('hidden')) {
        input.classList.remove('hidden'); input.focus(); btn.innerHTML = '❌ Quitar nota';
    } else {
        input.classList.add('hidden'); input.value = '';
        if (cart[id]) cart[id].note = '';
        btn.innerHTML = '📝 Añadir nota especial (ej. sin papas)';
        if (document.getElementById('step-3').classList.contains('active')) prepareCheckout();
    }
}

function updateItemNote(id, name, price, value) {
    // Los combos con opciones no usan este campo (su nota vive en el modal de
    // personalización); esto es un blindaje por si algo dispara la función igual.
    if (esComboConOpciones(buscarItemEnMenuPorId(id))) return;

    if (!cart[id]) {
        cart[id] = { id: id, name: name, price: price, qty: 1, note: value };
        const qtyInput = document.getElementById(`qty-${id}`); if (qtyInput) qtyInput.value = 1;
        calculateTotals();
    } else {
        cart[id].note = value;
    }
    if (document.getElementById('step-3').classList.contains('active')) prepareCheckout();
}

function removeNoteFromCheckout(id) {
    if (cart[id]) {
        cart[id].note = '';
        const noteInput = document.getElementById(`note-input-${id}`); const noteBtn = document.getElementById(`note-btn-${id}`);
        if (noteInput) { noteInput.classList.add('hidden'); noteInput.value = ''; }
        if (noteBtn) noteBtn.innerHTML = '📝 Añadir nota especial (ej. sin papas)';
        prepareCheckout();
    }
}

function buscarItemEnMenuPorId(id) {
    for (let catKey in menuData) {
        const found = menuData[catKey].items.find(p => String(p.id) === String(id));
        if (found) return found;
    }
    return null;
}

function esComboConOpciones(itemOriginal) {
    try {
        if (itemOriginal && itemOriginal.opciones_combo && itemOriginal.opciones_combo !== '[]') {
            const arr = typeof itemOriginal.opciones_combo === 'string' ? JSON.parse(itemOriginal.opciones_combo) : itemOriginal.opciones_combo;
            return Array.isArray(arr) && arr.length > 0;
        }
    } catch (e) {}
    return false;
}

function totalEnCarritoParaId(id) {
    let total = 0;
    Object.keys(cart).forEach(k => { if (k === String(id) || k.startsWith(id + "_")) total += cart[k].qty; });
    return total;
}

// Cuántas unidades quiere el cliente en total para este combo: las que ya personalizó
// (viven en el carrito) más las que reservó pero todavía no personaliza.
function totalDeseadoParaId(id) {
    return totalEnCarritoParaId(id) + (pendientesPersonalizarCombo[id] || 0);
}

// Refleja en pantalla el número del stepper y el botón "Personalizar (N pendientes)"
// para un combo puntual, sin tocar el resto de la tarjeta.
function actualizarUiPendienteCombo(id) {
    const inputQty = document.getElementById(`qty-${id}`);
    if (inputQty) inputQty.value = totalDeseadoParaId(id);

    const bloque = document.getElementById(`personalizar-pendiente-${id}`);
    if (!bloque) return;
    const pendientes = pendientesPersonalizarCombo[id] || 0;
    if (pendientes > 0) {
        bloque.classList.remove('hidden');
        const btn = bloque.querySelector('button');
        if (btn) btn.innerHTML = `👉 Elegir opciones (${pendientes} por elegir)`;
    } else {
        bloque.classList.add('hidden');
    }
}

function updateQty(id, name, price, change) {
    const itemOriginal = buscarItemEnMenuPorId(id);
    const isComboWithItems = esComboConOpciones(itemOriginal);

    if (isComboWithItems) {
        ajustarPendientesCombo(id, name, change);
        return;
    }

    if (!cart[id]) cart[id] = { id: id, name: name, price: price, qty: 0, note: "" };
    cart[id].qty += change;

    if (cart[id].qty <= 0) {
        delete cart[id];
        const element = document.getElementById(`qty-${id}`); if (element) element.value = 0;
    } else {
        const element = document.getElementById(`qty-${id}`); if (element) element.value = cart[id].qty;
    }
    calculateTotals();
    if (document.getElementById('step-3').classList.contains('active')) prepareCheckout();
}

// Para combos con opciones, +/- ya NO abre el modal de inmediato: solo ajusta cuántos
// hay "reservados" a la espera de personalizarse. El cliente decide cuándo personalizar
// tocando el botón que aparece en la tarjeta (o se le pide al llegar al checkout).
function ajustarPendientesCombo(id, name, change) {
    const pendientesActuales = pendientesPersonalizarCombo[id] || 0;

    if (change > 0) {
        pendientesPersonalizarCombo[id] = pendientesActuales + change;
        actualizarUiPendienteCombo(id);
        calculateTotals();
        // El carrito ahora muestra los pendientes, así que hay que repintarlo.
        if (document.getElementById('step-3').classList.contains('active')) prepareCheckout();
        return;
    }

    // Primero se descuenta de lo reservado-sin-personalizar: no hay nada que preguntar,
    // porque esas unidades todavía no existen como línea de carrito.
    if (pendientesActuales > 0) {
        const nuevoPendiente = pendientesActuales + change;
        if (nuevoPendiente > 0) pendientesPersonalizarCombo[id] = nuevoPendiente;
        else delete pendientesPersonalizarCombo[id];
        actualizarUiPendienteCombo(id);
        calculateTotals();
        if (document.getElementById('step-3').classList.contains('active')) prepareCheckout();
        return;
    }

    // Sin pendientes: se resta de unidades ya personalizadas (comportamiento de siempre).
    const keys = Object.keys(cart).filter(k => k.startsWith(id + "_"));
    if (keys.length > 1) {
        abrirSelectorEliminarVariantes(id, name);
        return;
    }
    if (keys.length === 1) {
        const lastKey = keys[0];
        cart[lastKey].qty += change;
        if (cart[lastKey].qty <= 0) delete cart[lastKey];
    }

    actualizarUiPendienteCombo(id);
    calculateTotals();
    if (document.getElementById('step-3').classList.contains('active')) prepareCheckout();
}

// Abre el modal para personalizar, una por una, las unidades que el cliente dejó pendientes.
function personalizarPendientesCombo(id) {
    const pendientes = pendientesPersonalizarCombo[id] || 0;
    if (pendientes <= 0) return;
    const itemOriginal = buscarItemEnMenuPorId(id);
    if (!itemOriginal) return;
    loteComboEnCurso = { id: id, restantes: pendientes, total: pendientes };
    abrirModalCombo(itemOriginal);
}

function ajustarCantidadComboEscrita(id, name, itemOriginal, value) {
    let nuevoTotalDeseado = parseInt(value, 10);
    if (isNaN(nuevoTotalDeseado) || nuevoTotalDeseado < 0) nuevoTotalDeseado = 0;

    const totalActual = totalEnCarritoParaId(id); // ya personalizados, viven en el carrito
    const nuevoPendiente = nuevoTotalDeseado - totalActual;

    if (nuevoPendiente > 0) {
        pendientesPersonalizarCombo[id] = nuevoPendiente;
        actualizarUiPendienteCombo(id);
        calculateTotals();
        return;
    }

    delete pendientesPersonalizarCombo[id];

    if (nuevoPendiente < 0) {
        const keys = Object.keys(cart).filter(k => k.startsWith(id + "_"));
        if (keys.length > 1) {
            abrirSelectorEliminarVariantes(id, name);
            return;
        }
        if (keys.length === 1) {
            const lastKey = keys[0];
            cart[lastKey].qty += nuevoPendiente;
            if (cart[lastKey].qty <= 0) delete cart[lastKey];
        }
    }

    actualizarUiPendienteCombo(id);
    calculateTotals();
    if (document.getElementById('step-3').classList.contains('active')) prepareCheckout();
}

function setExactQty(id, name, price, value) {
    const itemOriginal = buscarItemEnMenuPorId(id);
    if (esComboConOpciones(itemOriginal)) {
        ajustarCantidadComboEscrita(id, name, itemOriginal, value);
        return;
    }

    let parsedQty = parseInt(value, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
        delete cart[id];
        const element = document.getElementById(`qty-${id}`); if (element) element.value = 0;
        const noteInput = document.getElementById(`note-input-${id}`); const noteBtn = document.getElementById(`note-btn-${id}`);
        if (noteInput) { noteInput.classList.add('hidden'); noteInput.value = ''; }
        if (noteBtn) noteBtn.innerHTML = '📝 Añadir nota especial (ej. sin papas)';
    } else {
        if (!cart[id]) cart[id] = { id: id, name: name, price: price, qty: 0, note: "" };
        cart[id].qty = parsedQty;
        const element = document.getElementById(`qty-${id}`); if (element) element.value = parsedQty;
    }
    calculateTotals();
    if (document.getElementById('step-3').classList.contains('active')) prepareCheckout();
}

// --- ELEGIR CUÁL PERSONALIZACIÓN DE UN COMBO QUITAR (cuando hay más de una distinta en el carrito) ---
function abrirSelectorEliminarVariantes(id, nombreCombo) {
    comboIdSelectorActivo = id;
    document.getElementById('eliminar-variantes-subtitulo').innerText = `Tienes varias versiones de "${nombreCombo}"`;
    renderizarSelectorEliminarVariantes();

    const modal = document.getElementById('modal-eliminar-variantes');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function renderizarSelectorEliminarVariantes() {
    const cont = document.getElementById('lista-variantes-eliminar');
    if (!comboIdSelectorActivo) return;
    const keys = Object.keys(cart).filter(k => k.startsWith(comboIdSelectorActivo + "_"));

    if (keys.length === 0) {
        cerrarSelectorEliminarVariantes();
        return;
    }

    cont.innerHTML = keys.map(key => `
        <div class="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl border border-gray-200">
            <p class="text-xs text-gray-700 flex-grow leading-snug">${escapeHtml(cart[key].name)}</p>
            <div class="flex items-center gap-1.5 flex-shrink-0">
                <button type="button" onclick="quitarUnaUnidadVariante('${key}')" class="w-7 h-7 rounded-full bg-white border border-gray-300 hover:bg-gray-100 text-gray-600 font-bold text-sm cursor-pointer">−</button>
                <span class="w-5 text-center text-xs font-bold">${cart[key].qty}</span>
                <button type="button" onclick="eliminarVarianteCompleta('${key}')" title="Quitar todas" class="w-7 h-7 rounded-full bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center cursor-pointer">🗑️</button>
            </div>
        </div>
    `).join('');
}

function quitarUnaUnidadVariante(key) {
    if (!cart[key]) return;
    cart[key].qty -= 1;
    if (cart[key].qty <= 0) delete cart[key];
    sincronizarQtyTrasEdicionVariantes();
}

function eliminarVarianteCompleta(key) {
    delete cart[key];
    sincronizarQtyTrasEdicionVariantes();
}

function sincronizarQtyTrasEdicionVariantes() {
    const id = comboIdSelectorActivo;
    const element = document.getElementById(`qty-${id}`); if (element) element.value = totalEnCarritoParaId(id);
    calculateTotals();
    if (document.getElementById('step-3').classList.contains('active')) prepareCheckout();
    renderizarSelectorEliminarVariantes();
}

function cerrarSelectorEliminarVariantes() {
    const modal = document.getElementById('modal-eliminar-variantes');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    // Por si escribieron un número y cerraron sin quitar nada: el campo de cantidad
    // debe reflejar el total real del carrito, no el número que habían tecleado.
    if (comboIdSelectorActivo) {
        const element = document.getElementById(`qty-${comboIdSelectorActivo}`);
        if (element) element.value = totalEnCarritoParaId(comboIdSelectorActivo);
    }
    comboIdSelectorActivo = null;
}

function removeCartItem(id) {
    delete cart[id];
    const element = document.getElementById(`qty-${id}`); if (element) element.value = 0;
    const noteInput = document.getElementById(`note-input-${id}`); const noteBtn = document.getElementById(`note-btn-${id}`);
    if (noteInput) { noteInput.classList.add('hidden'); noteInput.value = ''; }
    if (noteBtn) noteBtn.innerHTML = '📝 Añadir nota especial (ej. sin papas)';
    calculateTotals();
    if (document.getElementById('step-3').classList.contains('active')) prepareCheckout();
}

function buscarProductoPorIdNumerico(idNumerico) {
    let encontrado = null;
    Object.values(menuData).forEach(cat => {
        const match = cat.items.find(i => i.id === 'p_' + idNumerico);
        if (match) encontrado = match;
    });
    return encontrado;
}

// --- PROMOCIONES "COMPRA N COMBOS, LLEVA M DE REGALO" ---
function sincronizarPromocionesCarrito() {
    Object.values(menuData).forEach(cat => {
        cat.items.forEach(item => {
            if (!item.id.startsWith('c_') || !item.promoCantidadMinima || !item.promoProductoId || !item.promoProductoCantidad) return;

            const promoKey = 'promo_' + item.id;
            let cantidadEnCarrito = 0;
            Object.keys(cart).forEach(k => {
                if (k === promoKey) return;
                if (cart[k].id === item.id) cantidadEnCarrito += cart[k].qty;
            });
            // Los pendientes por personalizar ya están "comprados" para efectos de la
            // promoción: si el cliente eligió cantidad suficiente, ve el regalo de una vez.
            cantidadEnCarrito += pendientesPersonalizarCombo[item.id] || 0;

            const veces = Math.floor(cantidadEnCarrito / item.promoCantidadMinima);
            const cantidadGratis = veces * item.promoProductoCantidad;

            if (cantidadGratis > 0) {
                const prodGratis = buscarProductoPorIdNumerico(item.promoProductoId);
                cart[promoKey] = {
                    id: 'p_' + item.promoProductoId,
                    name: `🎁 ${prodGratis ? prodGratis.name : 'Regalo'} (cortesía)`,
                    price: 0,
                    qty: cantidadGratis,
                    note: '',
                    esRegalo: true
                };
            } else {
                delete cart[promoKey];
            }
        });
    });
}

// --- PRECIO POR PAQUETE -------------------------------------------------
// Algunos platos se venden mas barato "de a varios": la lumpia suelta va a
// $0,60 y el par en $1,50. El precio de la linea se arma con los paquetes
// completos mas lo que sobre suelto (5 lumpias = 2 pares + 1 suelta).
// El backend hace exactamente la misma cuenta al crear el pedido; esto es solo
// para que el cliente vea el mismo numero antes de enviarlo.

// Devuelve {precio, cantidad} del paquete, o null si el item no tiene.
// Solo aplica a productos sueltos: los combos, los regalos de promocion y las
// lineas manuales del cajero se cobran como siempre.
function paqueteDeItem(cartId) {
    if (!String(cartId || '').startsWith('p_')) return null;
    const item = buscarItemEnMenuPorId(cartId);
    if (!item) return null;
    const precio = parseFloat(item.precioPaquete) || 0;
    const cantidad = parseInt(item.cantidadPaquete, 10) || 0;
    return (precio > 0 && cantidad > 1) ? { precio, cantidad } : null;
}

function precioLinea(cartId, precioUnitario, cantidad) {
    const paquete = paqueteDeItem(cartId);
    if (!paquete || cantidad <= 0) return precioUnitario * cantidad;
    const paquetes = Math.floor(cantidad / paquete.cantidad);
    const sueltas = cantidad % paquete.cantidad;
    return paquetes * paquete.precio + sueltas * precioUnitario;
}

// Texto que explica la cuenta en el carrito ("1 paquete de 2 a $1.50 + 1 a $0.60").
function explicacionPaquete(cartId, precioUnitario, cantidad) {
    const paquete = paqueteDeItem(cartId);
    if (!paquete || cantidad <= 0) return '';
    const paquetes = Math.floor(cantidad / paquete.cantidad);
    const sueltas = cantidad % paquete.cantidad;
    if (paquetes === 0) return '';
    const partes = [`${paquetes}x (${paquete.cantidad} por $${paquete.precio.toFixed(2)})`];
    if (sueltas > 0) partes.push(`${sueltas} a $${precioUnitario.toFixed(2)}`);
    return partes.join(' + ');
}

function calculateTotals() {
    sincronizarPromocionesCarrito();
    let total = 0; let count = 0;
    Object.values(cart).forEach(item => { total += precioLinea(item.id, item.price, item.qty); count += item.qty; });

    // Los combos pendientes por personalizar ya cuentan como "elegidos": el total debe
    // reflejarlos de una vez, aunque el cliente todavía no haya escogido sus piezas.
    Object.keys(pendientesPersonalizarCombo).forEach(id => {
        const cantidad = pendientesPersonalizarCombo[id];
        if (!cantidad) return;
        const item = buscarItemEnMenuPorId(id);
        if (item) { total += item.price * cantidad; count += cantidad; }
    });

    document.getElementById('sticky-cart-total').innerText = `$${total.toFixed(2)}`;

    const activeStep = document.querySelector('.step.active') ? document.querySelector('.step.active').id : 'step-1';
    if (count > 0 && activeStep !== 'step-3' && activeStep !== 'step-4' && activeStep !== 'step-auth' && activeStep !== 'step-registro') {
        document.getElementById('sticky-cart-bar').classList.remove('hidden');
    } else {
        document.getElementById('sticky-cart-bar').classList.add('hidden');
    }
}

function updateStickyBarVisibility(currentStep) {
    let count = 0; Object.values(cart).forEach(item => { count += item.qty; });
    Object.values(pendientesPersonalizarCombo).forEach(cantidad => { count += cantidad || 0; });
    if (count > 0 && currentStep !== 3 && currentStep !== 4 && currentStep !== 'auth' && currentStep !== 'registro' && currentStep !== 'crear-clave') {
        document.getElementById('sticky-cart-bar').classList.remove('hidden');
    } else {
        document.getElementById('sticky-cart-bar').classList.add('hidden');
    }
}

// --- 5. CHECKOUT Y FORMULARIOS ---
// Punto de entrada del botón "Ver Pedido y Pagar". Antes bloqueaba el paso si
// quedaba algún combo sin personalizar, pero eso dejaba al cliente atrapado: no
// podía ni ver su carrito ni quitar de ahí el combo que ya no quería, tenía que
// volver a buscarlo en el menú para restarlo. Ahora se entra siempre; los combos
// pendientes se ven y se quitan desde el propio carrito, y el aviso salta al
// intentar enviar el pedido (ver sendOrder).
function irACheckout() {
    prepareCheckout();
}

// Devuelve los ids de combos con unidades reservadas y todavía sin personalizar.
function idsCombosPendientes() {
    return Object.keys(pendientesPersonalizarCombo).filter(id => pendientesPersonalizarCombo[id] > 0);
}

// Quita de una vez todas las unidades pendientes de un combo desde el carrito.
function eliminarPendientesCombo(id) {
    delete pendientesPersonalizarCombo[id];
    actualizarUiPendienteCombo(id);
    calculateTotals();
    if (document.getElementById('step-3').classList.contains('active')) prepareCheckout();
}

// Lista, con un botón de personalizar cada uno, todos los combos a los que el cliente
// les eligió cantidad pero todavía no les eligió piezas/opciones.
function abrirModalCombosPendientes(idsPendientes) {
    const lista = idsPendientes || Object.keys(pendientesPersonalizarCombo).filter(id => pendientesPersonalizarCombo[id] > 0);
    if (lista.length === 0) { cerrarModalCombosPendientes(); return; }

    document.getElementById('lista-combos-pendientes').innerHTML = lista.map(id => {
        const item = buscarItemEnMenuPorId(id);
        const cantidad = pendientesPersonalizarCombo[id] || 0;
        const nombre = item ? item.name : 'Combo';
        return `
            <div class="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                ${construirMiniaturaComboHtml(item ? item.image : '')}
                <div class="flex-grow min-w-0">
                    <p class="text-sm font-bold text-gray-800 leading-snug">${escapeHtml(nombre)}</p>
                    <p class="text-xs text-amber-700 font-medium mt-0.5">${cantidad} por elegir</p>
                </div>
                <button type="button" onclick="personalizarDesdeModalPendientes('${id}')" class="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition cursor-pointer flex-shrink-0">Elegir</button>
            </div>
        `;
    }).join('');

    const modal = document.getElementById('modal-combos-pendientes');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function cerrarModalCombosPendientes() {
    const modal = document.getElementById('modal-combos-pendientes');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function personalizarDesdeModalPendientes(id) {
    cerrarModalCombosPendientes();
    personalizarPendientesCombo(id);
}

// Pinta el carrito y el total en el paso 3. Devuelve false si el carrito quedó
// vacío (en ese caso ya devolvió al usuario al paso 1). Lo comparten el checkout
// del cliente y el de los trabajadores, que sí difieren en el formulario de abajo.
function renderizarResumenCarrito() {
    const summaryContainer = document.getElementById('checkout-cart-summary');
    summaryContainer.innerHTML = '';
    
    const cartItems = Object.keys(cart);
    const pendientes = idsCombosPendientes();

    // Un combo elegido pero sin personalizar todavía no es una línea de carrito,
    // pero para el cliente ya es algo que pidió: si solo hay de esos, el pedido
    // no está vacío y tiene que poder verlo (y quitarlo) desde aquí.
    if (cartItems.length === 0 && pendientes.length === 0) {
        document.getElementById('checkout-total-price').innerText = "$0.00";
        window.__totalCarritoCheckout = 0;
        goToStep(1);
        return false;
    }
    
    let total = 0;
    cartItems.forEach(id => {
        const item = cart[id]; const subtotal = precioLinea(id, item.price, item.qty); total += subtotal;
        
        const noteHtml = item.note ? `
            <div class="flex items-center justify-between text-xs text-amber-900 bg-amber-100/70 px-2 py-1.5 rounded-xl mt-1 font-medium border border-amber-200 gap-2 shadow-xs">
                <span class="truncate pr-1">📌 Nota: "${escapeHtml(item.note)}"</span>
                <button type="button" onclick="removeNoteFromCheckout('${id}')" class="text-red-500 hover:text-red-700 font-bold p-1 cursor-pointer select-none text-[11px] flex-shrink-0 transition">❌</button>
            </div>` : '';
        
        const controlesHtml = item.esRegalo ? `
                    <span class="flex-shrink-0 bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-2 rounded-xl">x${item.qty} gratis</span>
        ` : `
                    <div class="flex items-center space-x-1.5 bg-white border border-amber-300 p-1 rounded-xl flex-shrink-0">
                        <button type="button" onclick="updateQty('${id}', '${item.name}', ${item.price}, -1)" class="w-8 h-8 bg-amber-100 text-amber-900 rounded-lg font-bold text-md flex items-center justify-center cursor-pointer shadow-sm">-</button>
                        <input type="number" value="${item.qty}" min="0" onchange="setExactQty('${id}', '${item.name}', ${item.price}, this.value)" class="w-10 text-center font-black text-sm text-gray-800 bg-transparent focus:outline-none">
                        <button type="button" onclick="updateQty('${id}', '${item.name}', ${item.price}, 1)" class="w-8 h-8 bg-amber-100 text-amber-900 rounded-lg font-bold text-md flex items-center justify-center cursor-pointer shadow-sm">+</button>
                    </div>
                    <button type="button" onclick="removeCartItem('${id}')" class="text-red-500 hover:text-red-700 text-md p-1 cursor-pointer flex-shrink-0">❌</button>
        `;

        const summaryRowHtml = `
            <div class="py-2 border-b border-amber-200">
                <div class="flex items-center justify-between gap-2">
                    <div class="flex-grow">
                        <p class="font-bold text-gray-800 text-sm leading-tight">${item.name}</p>
                        <p class="text-xs text-amber-900 font-medium mt-0.5">${explicacionPaquete(id, item.price, item.qty) || `$${item.price.toFixed(2)} c/u`} • Subtotal: <span class="font-bold">$${subtotal.toFixed(2)}</span></p>
                    </div>
                    ${controlesHtml}
                </div>
                ${noteHtml}
            </div>`;
        summaryContainer.insertAdjacentHTML('beforeend', summaryRowHtml);
    });
    
    // Combos reservados y aún sin personalizar. Van con aviso y en su propio
    // estilo para que se distingan de lo que ya está cerrado, y con la opción de
    // personalizarlos o quitarlos sin salir del carrito.
    pendientes.forEach(id => {
        const item = buscarItemEnMenuPorId(id);
        if (!item) return;

        const cantidad = pendientesPersonalizarCombo[id];
        const subtotal = item.price * cantidad;
        total += subtotal;

        // Se pasa el nombre vacío a propósito: ajustarPendientesCombo solo lo usa
        // para el selector de variantes, y desde esta fila nunca se llega ahí
        // (al bajar a 0 pendientes la fila desaparece). Así evitamos que un
        // apóstrofo en el nombre rompa el onclick.
        summaryContainer.insertAdjacentHTML('beforeend', `
            <div class="py-2 border-b border-amber-200">
                <div class="flex items-center justify-between gap-2">
                    <div class="flex-grow min-w-0">
                        <p class="font-bold text-gray-800 text-sm leading-tight">${escapeHtml(item.name)}</p>
                        <p class="text-xs text-amber-900 font-medium mt-0.5">$${item.price.toFixed(2)} c/u • Subtotal: <span class="font-bold">$${subtotal.toFixed(2)}</span></p>
                    </div>
                    <div class="flex items-center space-x-1.5 bg-white border border-amber-300 p-1 rounded-xl flex-shrink-0">
                        <button type="button" onclick="ajustarPendientesCombo('${id}', '', -1)" class="w-8 h-8 bg-amber-100 text-amber-900 rounded-lg font-bold text-md flex items-center justify-center cursor-pointer shadow-sm">-</button>
                        <span class="w-10 text-center font-black text-sm text-gray-800">${cantidad}</span>
                        <button type="button" onclick="ajustarPendientesCombo('${id}', '', 1)" class="w-8 h-8 bg-amber-100 text-amber-900 rounded-lg font-bold text-md flex items-center justify-center cursor-pointer shadow-sm">+</button>
                    </div>
                    <button type="button" onclick="eliminarPendientesCombo('${id}')" title="Quitar del pedido" class="text-red-500 hover:text-red-700 text-md p-1 cursor-pointer flex-shrink-0">❌</button>
                </div>
                <div class="flex items-center gap-2 mt-1.5">
                    <span class="text-[11px] font-bold text-orange-700 flex-shrink-0">⚠️ Falta elegir opciones</span>
                    <button type="button" onclick="personalizarPendientesCombo('${id}')" class="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold py-2 rounded-xl transition cursor-pointer">
                        👉 Elegir ahora
                    </button>
                </div>
            </div>`);
    });

    document.getElementById('checkout-total-price').innerText = `$${total.toFixed(2)}`;
    window.__totalCarritoCheckout = total;
    refrescarCotizacionDelivery();

    return true;
}

function prepareCheckout() {
    if (!renderizarResumenCarrito()) return;

    document.getElementById('chk-usar-mis-datos').checked = true;
    toggleFormularioDatosEnvio();
    cargarSelectorDirecciones();
    toggleAddress();

    if (!document.getElementById('step-3').classList.contains('active')) goToStep(3);
}

function toggleFormularioDatosEnvio() {
    const isChecked = document.getElementById('chk-usar-mis-datos').checked;
    const wrapperNuevosDatos = document.getElementById('wrapper-datos-destinatario');
    const inputNombre = document.getElementById('client-name');
    const inputTelefono = document.getElementById('client-phone');
    const select = document.getElementById('sel-direccion-entrega');

    if (isChecked) {
        wrapperNuevosDatos.classList.add('hidden');
        inputNombre.removeAttribute('required');
        inputTelefono.removeAttribute('required');
        
        if (select && select.options.length > 0) {
            select.selectedIndex = 0; 
        }
    } else {
        wrapperNuevosDatos.classList.remove('hidden');
        inputNombre.setAttribute('required', 'required');
        inputTelefono.setAttribute('required', 'required');
        
        inputNombre.value = datosClienteLogueado ? datosClienteLogueado.nombre : '';
        inputTelefono.value = datosClienteLogueado ? datosClienteLogueado.telefono : '';

        if (select) {
            select.value = "__MANUAL__";
        }
    }
    manejarSeleccionDireccion();
}

function cargarSelectorDirecciones() {
    const select = document.getElementById('sel-direccion-entrega');
    if (!select || !datosClienteLogueado) return;

    select.innerHTML = ''; 

    const dirPrincipal = datosClienteLogueado.direccion_principal || "Mi dirección registrada";

    const optPrincipal = document.createElement('option');
    optPrincipal.value = dirPrincipal;
    optPrincipal.innerText = `🏠 Principal: ${String(dirPrincipal).substring(0, 35)}...`;
    select.appendChild(optPrincipal);

    let extras = [];
    try {
        if (datosClienteLogueado.direcciones_extra) {
            extras = typeof datosClienteLogueado.direcciones_extra === 'string' 
                ? JSON.parse(datosClienteLogueado.direcciones_extra) 
                : datosClienteLogueado.direcciones_extra;
        }
    } catch(e) { extras = []; }

    if (Array.isArray(extras)) {
        extras.forEach((dir, i) => {
            if (dir && typeof dir === 'string') {
                const opt = document.createElement('option');
                opt.value = dir;
                opt.innerText = `📍 Frecuente ${i+1}: ${dir.substring(0, 35)}...`;
                select.appendChild(opt);
            }
        });
    }

    const optManual = document.createElement('option');
    optManual.value = "__MANUAL__";
    optManual.innerText = "🗺️ Usar otra dirección (Playa, trabajo, etc)...";
    select.appendChild(optManual);

    manejarSeleccionDireccion(); 
}

function manejarSeleccionDireccion() {
    const select = document.getElementById('sel-direccion-entrega');
    const wrapperManual = document.getElementById('wrapper-direccion-manual');
    const inputAddress = document.getElementById('client-address');

    if (select.value === "__MANUAL__") {
        wrapperManual.classList.remove('hidden'); inputAddress.setAttribute('required', 'required'); inputAddress.value = '';
    } else {
        wrapperManual.classList.add('hidden'); inputAddress.removeAttribute('required'); inputAddress.value = select.value;
    }
    restaurarUbicacionDeDireccion();
    refrescarCotizacionDelivery();
}

function toggleAddress() {
    const type = document.getElementById('delivery-type').value;
    const container = document.getElementById('address-container');
    const input = document.getElementById('client-address');
    const select = document.getElementById('sel-direccion-entrega');
    const esMesa = type === 'Mesa';

    const cajaMesa = document.getElementById('mesa-container');
    const selMesa = document.getElementById('sel-mesa');
    if (cajaMesa) cajaMesa.classList.toggle('hidden', !esMesa);
    if (selMesa) { if (esMesa) selMesa.setAttribute('required', 'required'); else selMesa.removeAttribute('required'); }

    if (type === 'Pickup' || type === 'En el Local' || esMesa) {
        container.style.display = 'none'; input.removeAttribute('required'); select.removeAttribute('required');
    } else {
        container.style.display = 'block'; select.setAttribute('required', 'required'); manejarSeleccionDireccion();
    }
    refrescarCotizacionDelivery();
}

// --- Mesas (pedir comiendo en el local) ---
let mesaDeUrl = '';
async function cargarMesasCliente() {
    const sel = document.getElementById('sel-mesa');
    if (!sel) return;
    try {
        const res = await fetch(API_BASE + "/api/mesas/?t=" + Date.now() + (SUCURSAL_ACTUAL ? "&" + sucursalParam() : ""));
        const mesas = await res.json();
        const porZona = {};
        (Array.isArray(mesas) ? mesas : []).forEach(m => { (porZona[m.zona || 'Salón'] = porZona[m.zona || 'Salón'] || []).push(m); });
        sel.innerHTML = '<option value="">Elige tu mesa...</option>' + Object.keys(porZona).map(z =>
            `<optgroup label="${escapeHtml(z)}">${porZona[z].map(m => `<option value="${escapeHtml(m.nombre)}">${escapeHtml(m.nombre)} · ${m.capacidad} personas</option>`).join('')}</optgroup>`).join('');
    } catch (e) { sel.innerHTML = '<option value="">No se pudieron cargar las mesas</option>'; }
}

// Si entró escaneando el QR de una mesa (?mesa=Mesa 3) deja el pedido listo para esa mesa
function aplicarMesaDeUrl() {
    const nombre = new URLSearchParams(location.search).get('mesa');
    if (!nombre) return;
    const sel = document.getElementById('sel-mesa'), tipo = document.getElementById('delivery-type');
    if (!sel || !tipo) return;
    const existe = Array.from(sel.options).some(o => o.value === nombre);
    if (!existe) return;
    mesaDeUrl = nombre;
    tipo.value = 'Mesa'; sel.value = nombre; toggleAddress();
    const banner = document.getElementById('banner-mesa'), etiqueta = document.getElementById('banner-mesa-nombre');
    if (banner && etiqueta) { etiqueta.textContent = nombre; banner.classList.remove('hidden'); }
}

function resetForm() {
    cart = {}; document.getElementById('order-form').reset();
    calculateTotals(); toggleAddress(); aplicarMesaDeUrl(); goToStep(1); 
}

// --- 6. ENVÍO DE ORDEN AL BACKEND ---
async function sendOrder(event) {
    event.preventDefault();

    // Aquí sí se frena: al carrito se entra con combos sin personalizar, pero no
    // se puede enviar un pedido así porque la cocina no sabría qué preparar.
    const pendientes = idsCombosPendientes();
    if (pendientes.length > 0) { abrirModalCombosPendientes(pendientes); return; }

    const itemsInCart = Object.values(cart);
    if (itemsInCart.length === 0) { alert("⚠️ Tu carrito está vacío."); goToStep(1); return; }

    if (!estaAbiertoAhora()) { mostrarBannerCerrado(); return; }

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.innerText = "Enviando Orden..."; submitBtn.disabled = true;

    const esParaMi = document.getElementById('chk-usar-mis-datos').checked;
    const nombreFinal = esParaMi ? datosClienteLogueado.nombre : document.getElementById('client-name').value.trim();
    const telefonoFinal = esParaMi ? datosClienteLogueado.telefono : leerTelefonoDeFormulario('client-phone');

    const tipoEntrega = document.getElementById('delivery-type').value;
    let direccionFinal = "Retiro por local";

    if (tipoEntrega === 'Mesa') {
        direccionFinal = document.getElementById('sel-mesa').value;
        if (!direccionFinal) {
            alert("Elige en qué mesa estás.");
            submitBtn.innerText = "🚀 Confirmar y Enviar Pedido"; submitBtn.disabled = false;
            return;
        }
    }
    
    if (tipoEntrega === 'Delivery') {
        const select = document.getElementById('sel-direccion-entrega');
        if (select.value === "__MANUAL__") {
            direccionFinal = document.getElementById('client-address').value.trim();
            if (document.getElementById('chk-guardar-frecuente').checked) {
                let extras = [];
                try { extras = JSON.parse(datosClienteLogueado.direcciones_extra || '[]'); } catch(e){}
                if (!extras.includes(direccionFinal)) {
                    extras.push(direccionFinal);
                    datosClienteLogueado.direcciones_extra = JSON.stringify(extras);
                    localStorage.setItem('sesionCliente', JSON.stringify(datosClienteLogueado));
                    
                    fetch(API_BASE + "/api/clientes/actualizar-direcciones-cliente", {
                        method: 'POST', 
                        headers: { 
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ telefono: datosClienteLogueado.telefono, direcciones_extra: datosClienteLogueado.direcciones_extra })
                    }).catch(err => console.error(err));
                }
            }
        } else {
            direccionFinal = select.value;
        }
    }

    // Delivery automático: si el servidor ya dijo que este pedido no cumple (mínimo, zona), se avisa antes de enviar
    if (tipoEntrega === 'Delivery' && COTIZACION_DELIVERY && COTIZACION_DELIVERY.automatico && COTIZACION_DELIVERY.ok === false) {
        alert(COTIZACION_DELIVERY.mensaje || 'Este pedido no cumple las condiciones de delivery.');
        submitBtn.innerText = "🚀 Confirmar y Enviar Pedido"; submitBtn.disabled = false;
        return;
    }

    const orderPayload = {
        timestamp: new Date().toISOString(),
        cliente: nombreFinal,
        telefono: telefonoFinal,
        tipo_entrega: tipoEntrega,
        direccion: direccionFinal,
        metodo_pago: document.getElementById('payment-method').value,
        articulos: itemsInCart,
        sucursal_id: SUCURSAL_ACTUAL ? SUCURSAL_ACTUAL.id : undefined,
        lat: (tipoEntrega === 'Delivery' && UBICACION_ENTREGA) ? UBICACION_ENTREGA.lat : undefined,
        lng: (tipoEntrega === 'Delivery' && UBICACION_ENTREGA) ? UBICACION_ENTREGA.lng : undefined,
        metadata_titular: datosClienteLogueado ? `Pedido por: ${datosClienteLogueado.nombre} ` : "No registrado",
        estado_inicial: tipoEntrega === 'Delivery' ? 'Calculando Delivery' : 'Pago Pendiente',
        pedido_detallado: "Generado por Backend" // Validacion Pydantic FastAPI
    };

    const urlBackendPedidos = API_BASE + "/api/pedidos/"; 

    try {
        const response = await fetch(urlBackendPedidos, {
            method: 'POST', 
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(orderPayload)
        });
        
        if (response.ok) {
            const datosOk = await response.json().catch(() => ({}));
            const msgOk = document.getElementById('msg-pedido-recibido');
            const hayWa = !!numeroWhatsAppPedido();
            if (tipoEntrega === 'Delivery' && UBICACION_ENTREGA) guardarUbicacionDeDireccion(direccionFinal, UBICACION_ENTREGA);
            const delAuto = datosOk && datosOk.delivery && datosOk.delivery.auto ? datosOk.delivery : null;
            if (msgOk) msgOk.textContent = delAuto
                ? `Recibimos tu pedido. El delivery (${delAuto.precio > 0 ? '$' + Number(delAuto.precio).toFixed(2) : 'gratis'}) ya está incluido: total $${Number(datosOk.pedido.total).toFixed(2)}. ` + (hayWa ? 'Toca el botón verde para enviarlo por WhatsApp y coordinar el pago.' : 'La sucursal se comunicará contigo para coordinar el pago.')
                : tipoEntrega === 'Mesa'
                ? `Tu pedido ya está en cocina. Te lo llevamos a la ${direccionFinal} en cuanto esté listo.`
                : (hayWa ? 'Recibimos tu pedido. Toca el botón verde para enviarlo por WhatsApp y coordinar el pago y la entrega.' : 'Recibimos tu pedido. La sucursal se comunicará contigo para coordinar el pago y la entrega.');
            mostrarBotonWhatsApp(armarMensajeWhatsApp(datosOk, itemsInCart, tipoEntrega, direccionFinal, nombreFinal, orderPayload.metodo_pago));
            goToStep(4);
        } else {
            alert(await motivoDelRechazo(response, "Hubo un error al procesar tu pedido. Por favor intenta de nuevo."));
        }
    } catch (error) {
        console.error("Error de conexión:", error); 
        alert("Fallo de conexión. Revisa tu internet e intenta de nuevo.");
    } finally {
        submitBtn.innerText = "🚀 Confirmar y Enviar Pedido"; submitBtn.disabled = false;
    }
}

// --- CONTROL EXCLUSIVO DEL MODAL DE COMBOS ---
let comboEnPersonalizacion = null;
let estadoPiezasCombo = {};

// Cuando el cliente pide varias unidades del mismo combo, el modal se reabre una
// vez por unidad. Sin explicación eso parece un bug ("no me deja seguir pidiendo"),
// así que mostramos en qué unidad va, cuántas faltan y qué pasa al confirmar.
function pintarProgresoLoteCombo(item) {
    const aviso = document.getElementById('modal-combo-progreso');
    const btn = document.getElementById('btn-confirmar-combo');
    if (!aviso) return;

    const lote = loteComboEnCurso;
    const enLote = lote && lote.id === item.id && lote.total > 1;

    if (!enLote) {
        aviso.className = 'hidden';
        aviso.innerHTML = '';
        if (btn) btn.innerText = 'Confirmar Selección';
        return;
    }

    const total = lote.total;
    const restantes = lote.restantes;          // incluye la unidad que se está armando
    const indice = total - restantes + 1;
    const faltanDespues = restantes - 1;

    let explicacion;
    if (faltanDespues === 0) {
        explicacion = 'Es el último. Al confirmar vuelves al menú.';
    } else if (indice === 1) {
        explicacion = `Pediste ${total} y cada uno se arma por separado, para que puedas ponerles cosas distintas. Al confirmar pasas al siguiente.`;
    } else {
        explicacion = `Al confirmar pasas al siguiente. Te ${faltanDespues === 1 ? 'queda 1 más' : `quedan ${faltanDespues} más`} después de este.`;
    }

    aviso.className = 'px-5 py-3 bg-amber-50 border-b border-amber-200';
    aviso.innerHTML = `
        <p class="text-sm font-black text-amber-900">Combo ${indice} de ${total}</p>
        <p class="text-xs text-amber-800 mt-0.5 leading-relaxed">${escapeHtml(explicacion)}</p>
    `;

    if (btn) {
        btn.innerText = faltanDespues === 0
            ? 'Confirmar y terminar'
            : `Confirmar y seguir (${indice} de ${total})`;
    }
}

function abrirModalCombo(item) {
    comboEnPersonalizacion = item;
    document.getElementById('modal-combo-title').innerText = item.name;
    const inputNotaCombo = document.getElementById('modal-combo-nota');
    if (inputNotaCombo) inputNotaCombo.value = '';
    pintarProgresoLoteCombo(item);

    let gruposOpciones = [];
    try {
        gruposOpciones = typeof item.opciones_combo === 'string' 
            ? JSON.parse(item.opciones_combo || '[]') 
            : (item.opciones_combo || []);
    } catch(e) { gruposOpciones = []; }

    const container = document.getElementById('modal-combo-options-container');
    container.innerHTML = '';
    let selectIndex = 0;
    let piezasGroupIndex = 0;
    estadoPiezasCombo = {};
    const btnConfirmarCombo = document.getElementById('btn-confirmar-combo');
    if (btnConfirmarCombo) { btnConfirmarCombo.disabled = false; btnConfirmarCombo.classList.remove('opacity-40', 'cursor-not-allowed'); }

    gruposOpciones.forEach((grupo) => {
        if (grupo.tipo === 'categoria') {
            let opcionesCat = [];
            for(let key in menuData) {
                if(menuData[key].titulo.toLowerCase() === grupo.valor.toLowerCase()) {
                    opcionesCat = menuData[key].items.filter(i => !i.agotado);
                    break;
                }
            }

            if(opcionesCat.length === 0) {
                container.insertAdjacentHTML('beforeend', `<p class="text-xs text-red-500 mb-2 font-bold">⚠️ Categoría "${grupo.valor}" vacía o inactiva.</p>`);
                return;
            }

            let optionsHtml = opcionesCat.map(opt => `<option value="${opt.name}" data-desc="${escapeHtml(opt.desc || '')}" data-img="${escapeHtml(opt.image || '')}">${opt.name}</option>`).join('');
            let primeraOpcion = opcionesCat[0];
            let primeraDesc = primeraOpcion && primeraOpcion.desc ? primeraOpcion.desc : '';

            for(let i=0; i < grupo.cantidad; i++) {
                let tituloVisual = grupo.cantidad > 1 ? `Elige: ${grupo.valor} (${i+1} de ${grupo.cantidad})` : `Elige: ${grupo.valor}`;

                let grupoHtml = `
                    <div class="space-y-1 mb-3">
                        <label class="block text-gray-500 font-bold text-[10px] uppercase tracking-wider">${tituloVisual}</label>
                        <div class="flex items-center gap-2">
                            <div id="img-combo-${selectIndex}" class="flex-shrink-0">${construirMiniaturaComboHtml(primeraOpcion ? primeraOpcion.image : '')}</div>
                            <div class="flex-grow min-w-0">
                                <select id="select-combo-grupo-${selectIndex}" onchange="actualizarDescripcionCombo(this, 'desc-combo-${selectIndex}', 'img-combo-${selectIndex}')" class="w-full p-2.5 border border-gray-300 rounded-xl text-xs bg-gray-50 focus:outline-none focus:border-red-500 font-medium text-gray-800 shadow-sm cursor-pointer">
                                    ${optionsHtml}
                                </select>
                                <p id="desc-combo-${selectIndex}" class="text-[10px] text-gray-400 italic px-1 min-h-[15px] mt-1">${primeraDesc}</p>
                            </div>
                        </div>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', grupoHtml);
                selectIndex++;
            }
        } else if (grupo.tipo === 'seleccion') {
            // Productos concretos que el dueño dejó escoger (no toda una categoría).
            const idsPermitidos = (grupo.productos || []).map(String);
            let opcionesSel = [];
            for (let key in menuData) {
                menuData[key].items.forEach(x => {
                    if (!x.agotado && idsPermitidos.includes(String(x.id).replace('p_', '')) && !opcionesSel.some(o => o.id === x.id)) opcionesSel.push(x);
                });
            }
            // Respeta el orden en que el dueño los marcó
            opcionesSel.sort((p, q) => idsPermitidos.indexOf(String(p.id).replace('p_', '')) - idsPermitidos.indexOf(String(q.id).replace('p_', '')));
            const etiqueta = grupo.nombre || 'opción';

            if (opcionesSel.length === 0) {
                container.insertAdjacentHTML('beforeend', `<p class="text-xs text-red-500 mb-2 font-bold">⚠️ Por ahora no hay "${escapeHtml(etiqueta)}" disponible para este combo.</p>`);
                return;
            }

            const optionsHtmlSel = opcionesSel.map(opt => `<option value="${escapeHtml(opt.name)}" data-desc="${escapeHtml(opt.desc || '')}" data-img="${escapeHtml(opt.image || '')}">${escapeHtml(opt.name)}</option>`).join('');
            const primeraSel = opcionesSel[0];
            const cantSel = Math.max(1, parseInt(grupo.cantidad, 10) || 1);

            for (let i = 0; i < cantSel; i++) {
                const tituloSel = cantSel > 1 ? `Elige: ${etiqueta} (${i + 1} de ${cantSel})` : `Elige: ${etiqueta}`;
                container.insertAdjacentHTML('beforeend', `
                    <div class="space-y-1 mb-3">
                        <label class="block text-gray-500 font-bold text-[10px] uppercase tracking-wider">${escapeHtml(tituloSel)}</label>
                        <div class="flex items-center gap-2">
                            <div id="img-combo-${selectIndex}" class="flex-shrink-0">${construirMiniaturaComboHtml(primeraSel.image)}</div>
                            <div class="flex-grow min-w-0">
                                <select id="select-combo-grupo-${selectIndex}" onchange="actualizarDescripcionCombo(this, 'desc-combo-${selectIndex}', 'img-combo-${selectIndex}')" class="w-full p-2.5 border border-gray-300 rounded-xl text-xs bg-gray-50 focus:outline-none focus:border-red-500 font-medium text-gray-800 shadow-sm cursor-pointer">
                                    ${optionsHtmlSel}
                                </select>
                                <p id="desc-combo-${selectIndex}" class="text-[10px] text-gray-400 italic px-1 min-h-[15px] mt-1">${escapeHtml(primeraSel.desc || '')}</p>
                            </div>
                        </div>
                    </div>
                `);
                selectIndex++;
            }
        } else if (grupo.tipo === 'producto') {
            let prodOriginal = null;
            for (let key in menuData) {
                const encontrado = menuData[key].items.find(x => x.id === 'p_' + grupo.valor);
                if (encontrado) { prodOriginal = encontrado; break; }
            }

            let prodName = grupo.nombre_producto || (prodOriginal ? prodOriginal.name : null) || (isNaN(grupo.valor) ? grupo.valor : "Producto Fijo");
            let descFija = prodOriginal ? prodOriginal.desc : "";

            if (prodOriginal && prodOriginal.agotado) {
                container.insertAdjacentHTML('beforeend', `
                    <div class="space-y-1 mb-3">
                        <div class="w-full p-3 rounded-xl text-xs bg-red-50 border border-red-200 text-red-700 font-medium leading-relaxed">
                            ⚠️ Por los momentos no tenemos <strong>${escapeHtml(prodName)}</strong> disponible, para que sea tomado en cuenta a la hora de ordenar.
                        </div>
                    </div>
                `);
                return;
            }

            let htmlDescFija = descFija ? `<p class="text-[10px] text-gray-400 italic px-1 mt-0.5">${descFija}</p>` : '';

            let fijoHtml = `
                <div class="space-y-1 mb-3">
                    <label class="block text-gray-500 font-bold text-[10px] uppercase tracking-wider">Incluido Fijo</label>
                    <div class="flex items-center gap-2">
                        ${construirMiniaturaComboHtml(prodOriginal ? prodOriginal.image : '')}
                        <div class="flex-grow min-w-0 p-2.5 border border-gray-200 rounded-xl text-xs bg-emerald-50 text-emerald-700 font-medium flex items-center justify-between shadow-sm">
                            <span class="truncate pr-2">✔️ ${prodName}</span>
                            <span class="font-black flex-shrink-0 bg-emerald-200 px-2 py-0.5 rounded">x${grupo.cantidad}</span>
                        </div>
                    </div>
                    ${htmlDescFija}
                </div>
            `;
            container.insertAdjacentHTML('beforeend', fijoHtml);
        } else if (grupo.tipo === 'piezas_alternativas') {
            const pgIndex = piezasGroupIndex++;
            // "compartido" quedó retirado: mezclar rolls dentro de un mismo
            // estilo no existe. Lo que llegue así se trata como excluyente.
            const modoCrudo = grupo.modo || (grupo.compartido === true ? 'compartido' : 'excluyente');
            const modo = modoCrudo === 'todas' ? 'todas' : 'excluyente';

            // Cada estilo dice cuántas opciones elige el cliente y cuántas
            // piezas vale cada una (ej. 3 rolls x 8 pz = 24 pz). Los combos
            // viejos solo traen piezas_objetivo: son 1 elección que se lleva
            // todas las piezas.
            const alternativasResueltas = (grupo.alternativas || []).map(alt => {
                const selecciones = Math.max(1, parseInt(alt.selecciones, 10) || 1);
                const objetivoGuardado = parseInt(alt.piezas_objetivo, 10) || 0;
                const porSeleccion = parseInt(alt.piezas_por_seleccion, 10) || (selecciones > 0 ? Math.round(objetivoGuardado / selecciones) : 0);
                return {
                    nombre: alt.nombre,
                    selecciones,
                    piezas_por_seleccion: porSeleccion,
                    piezas_objetivo: objetivoGuardado || (selecciones * porSeleccion),
                    categorias: alt.categorias || (alt.categoria ? [alt.categoria] : []),
                    opciones: resolverOpcionesCategorias(alt.categorias || (alt.categoria ? [alt.categoria] : []))
                };
            }).filter(alt => alt.piezas_objetivo > 0);

            if (alternativasResueltas.length === 0) return;

            estadoPiezasCombo[pgIndex] = { alternativas: alternativasResueltas, alternativaActiva: 0, seleccion: {}, modo, filtroCategoria: {} };

            const hayVariosEstilos = alternativasResueltas.length > 1;
            const tituloEstilos = modo === 'todas' ? 'Completa cada elección' : 'Elige tu estilo';
            const explicacionModo = modo === 'todas'
                ? 'Debes completar cada una de estas categorías antes de confirmar.'
                : 'Elige solo UNA de estas categorías para tu combo, las demás no aplican.';
            const selectorEstiloHtml = hayVariosEstilos ? `
                <label class="block text-gray-600 font-bold text-[10px] uppercase tracking-wider">${tituloEstilos}</label>
                <p class="text-[11px] text-gray-500 leading-snug">${explicacionModo}</p>
                <div class="flex gap-2 flex-wrap" id="estilos-piezas-${pgIndex}">${alternativasResueltas.map((alt, i) => `
                    <button type="button" onclick="seleccionarEstiloPiezas(${pgIndex}, ${i})" data-idx="${i}"
                        class="flex-1 py-2 rounded-xl text-xs font-bold border transition estilo-btn-${pgIndex} ${i === 0 ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-300'}">
                        <span class="chulo-estilo-${pgIndex}-${i}"></span>${escapeHtml(alt.nombre)} <span class="opacity-70">(${alt.piezas_objetivo}pz)</span>
                    </button>
                `).join('')}</div>
            ` : '';

            const grupoPiezasHtml = `
                <div class="space-y-2 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    ${selectorEstiloHtml}
                    <div class="flex items-center flex-wrap justify-between gap-x-3 gap-y-1 mt-1.5">
                        <span id="instruccion-piezas-${pgIndex}" class="text-[11px] text-gray-600 font-semibold"></span>
                        <span id="contador-piezas-${pgIndex}" class="text-xs font-black px-2.5 py-1 rounded-full bg-red-100 text-red-600 flex-shrink-0 whitespace-nowrap">Falta elegir</span>
                    </div>
                    <div id="cats-piezas-${pgIndex}" class="flex gap-1.5 flex-wrap"></div>
                    <div id="lista-sabores-piezas-${pgIndex}" class="space-y-2 mt-2"></div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', grupoPiezasHtml);
            renderSaboresPiezas(pgIndex);
        }
    });

    document.getElementById('btn-confirmar-combo').onclick = guardarSeleccionCombo;
    document.getElementById('modal-combo').classList.remove('hidden');
    document.getElementById('modal-combo').classList.add('flex');
}

function cerrarModalCombo() {
    document.getElementById('modal-combo').classList.remove('flex');
    document.getElementById('modal-combo').classList.add('hidden');
    comboEnPersonalizacion = null;
    // Si se cancela a mitad de pedir varias unidades seguidas, se aborta el resto del lote
    // (las unidades ya confirmadas antes de cancelar se quedan en el carrito).
    loteComboEnCurso = null;
}

function construirMiniaturaComboHtml(valorImagen) {
    if (valorImagen && esUrlImagen(valorImagen)) {
        // Miniatura de 56px (w-14); el lightbox sí abre la imagen grande
        return `<img src="${urlImagen(valorImagen, 144)}" data-original="${escapeHtml(valorImagen)}" data-respaldo="miniatura" alt="" loading="lazy" onclick="abrirLightboxImagen('${valorImagen.replace(/'/g, "\\'")}')" onerror="imagenConRespaldo(this)" class="w-14 h-14 rounded-lg object-cover border border-gray-200 bg-gray-50 flex-shrink-0 cursor-zoom-in active:opacity-70 transition">`;
    }
    return `<div class="w-14 h-14 rounded-lg border border-gray-200 bg-red-50 text-red-400 flex-shrink-0 flex items-center justify-center text-2xl">${valorImagen || '🍔'}</div>`;
}

function mostrarFallbackMiniatura(imgEl) {
    const div = document.createElement('div');
    div.className = 'w-14 h-14 rounded-lg border border-gray-200 bg-red-50 text-red-400 flex-shrink-0 flex items-center justify-center text-2xl';
    div.textContent = '🍔';
    imgEl.replaceWith(div);
}

function abrirLightboxImagen(url) {
    if (!url) return;
    // Aquí el cliente pidió ver la foto en grande, así que servimos una versión
    // amplia (no la original completa, que puede pesar cientos de KB).
    const img = document.getElementById('lightbox-imagen-img');
    img.setAttribute('data-original', url);
    img.onerror = () => imagenConRespaldo(img);
    img.src = urlImagen(url, 900); // 900 = el máximo que guarda el admin para productos/combos
    const modal = document.getElementById('modal-lightbox-imagen');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function cerrarLightboxImagen() {
    const modal = document.getElementById('modal-lightbox-imagen');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.getElementById('lightbox-imagen-img').src = '';
}

// --- GRUPOS DE COMBO "ELIGE ESTILO + COMBINA SABORES POR PIEZAS" ---
function resolverOpcionesCategoria(nombreCategoria) {
    for (let key in menuData) {
        if (menuData[key].titulo.toLowerCase() === (nombreCategoria || '').toLowerCase()) {
            return menuData[key].items.filter(i => !i.agotado);
        }
    }
    return [];
}

function resolverOpcionesCategorias(nombresCategorias) {
    const vistos = new Set();
    const resultado = [];
    (nombresCategorias || []).forEach(nombre => {
        resolverOpcionesCategoria(nombre).forEach(item => {
            if (!vistos.has(item.id)) {
                vistos.add(item.id);
                // Copia con la categoria de la que salio, para poder ofrecer las
                // pestañas de navegacion cuando la fila abarca varias.
                resultado.push(Object.assign({}, item, { categoriaOrigen: nombre }));
            }
        });
    });
    return resultado;
}

function seleccionarEstiloPiezas(pgIndex, altIndex) {
    const estado = estadoPiezasCombo[pgIndex];
    if (!estado) return;
    estado.alternativaActiva = altIndex;
    // Cambiar de estilo borra lo elegido: el cliente se lleva SOLO uno de los
    // estilos. En modo "todas" cada pestaña es obligatoria, así que se respeta.
    if (estado.modo !== 'todas') estado.seleccion = {};
    renderSaboresPiezas(pgIndex);
}

// Cuántas elecciones lleva hechas el cliente dentro de un estilo.
// Ojo: cuenta ROLLS elegidos, no piezas. Las piezas salen de multiplicar por
// alt.piezas_por_seleccion.
function subtotalParaAlt(estado, alt) {
    let total = 0;
    alt.opciones.forEach(item => { total += estado.seleccion[item.id] || 0; });
    return total;
}

// Frase que le dice al cliente qué tiene que hacer en el estilo activo.
function instruccionParaAlt(alt, mostrarNombre) {
    const prefijo = mostrarNombre ? `${escapeHtml(alt.nombre)} · ` : '';
    if (alt.selecciones === 1) {
        return `${prefijo}Elige 1 opción para tus ${alt.piezas_objetivo} piezas`;
    }
    return `${prefijo}Elige ${alt.selecciones} opciones (${alt.piezas_por_seleccion} piezas cada opción)`;
}

// Interruptor: pestañas de categoría dentro de una misma tanda de rolls.
// Cuando una fila abarca varias categorías se puede mostrar una tira de chips
// (Todos / Roll clásico / Roll tempura...) que filtra la lista. Está apagado
// porque confunde al cliente promedio: hoy ve una sola lista larga con todos
// los rolls, que es justo lo que se pidió. El código queda entero — poner esto
// en true devuelve las pestañas, sin tocar nada más.
const PESTANAS_CATEGORIA_COMBO = false;

// Categorías que abarca una fila y que de verdad tienen sabores hoy.
// Si son 2 o más, el cliente navega entre ellas con pestañas, pero el cupo de
// elecciones es UNO solo para toda la fila: así arma sus 3 rolls mezclando
// clásicos, tempura y fríos si quiere.
function categoriasConSabores(alt) {
    const conSabores = [];
    (alt.categorias || []).forEach(nombre => {
        if (alt.opciones.some(o => o.categoriaOrigen === nombre)) conSabores.push(nombre);
    });
    return conSabores;
}

function filtrarCategoriaPiezas(pgIndex, nombreCategoria) {
    const estado = estadoPiezasCombo[pgIndex];
    if (!estado) return;
    estado.filtroCategoria[estado.alternativaActiva] = nombreCategoria;
    renderSaboresPiezas(pgIndex);
}

function renderSaboresPiezas(pgIndex) {
    const estado = estadoPiezasCombo[pgIndex];
    if (!estado) return;
    const alt = estado.alternativas[estado.alternativaActiva];

    document.querySelectorAll(`.estilo-btn-${pgIndex}`).forEach(btn => {
        const idx = parseInt(btn.dataset.idx);
        const activo = idx === estado.alternativaActiva;
        const altBtn = estado.alternativas[idx];
        const completo = estado.modo === 'todas' && subtotalParaAlt(estado, altBtn) === altBtn.selecciones;
        let clases = `flex-1 py-2 rounded-xl text-xs font-bold border transition estilo-btn-${pgIndex} `;
        if (activo) clases += 'bg-red-600 text-white border-red-600';
        else if (completo) clases += 'bg-emerald-50 text-emerald-700 border-emerald-300';
        else clases += 'bg-white text-gray-600 border-gray-300';
        btn.className = clases;
        const chulo = btn.querySelector(`.chulo-estilo-${pgIndex}-${idx}`);
        if (chulo) chulo.textContent = (completo && !activo) ? '✓ ' : '';
    });

    const instruccion = document.getElementById(`instruccion-piezas-${pgIndex}`);
    if (instruccion) instruccion.innerHTML = instruccionParaAlt(alt, estado.alternativas.length === 1);

    // --- Pestañas de categoría (solo si la fila abarca varias) ---
    const categorias = PESTANAS_CATEGORIA_COMBO ? categoriasConSabores(alt) : [];
    const filtro = estado.filtroCategoria[estado.alternativaActiva] || '';
    const cajaCats = document.getElementById(`cats-piezas-${pgIndex}`);
    if (cajaCats) {
        if (categorias.length < 2) {
            cajaCats.innerHTML = '';
        } else {
            const botones = [''].concat(categorias).map(nombre => {
                const activo = filtro === nombre;
                // Cuántas elecciones lleva hechas dentro de esa categoría, para
                // que no se le pierdan al filtrar.
                const hechas = nombre === ''
                    ? subtotalParaAlt(estado, alt)
                    : alt.opciones.filter(o => o.categoriaOrigen === nombre).reduce((n, o) => n + (estado.seleccion[o.id] || 0), 0);
                const etiqueta = nombre === '' ? 'Todos' : escapeHtml(nombre);
                const clases = activo
                    ? 'px-2.5 py-1 rounded-full text-[11px] font-bold border bg-gray-800 text-white border-gray-800'
                    : 'px-2.5 py-1 rounded-full text-[11px] font-bold border bg-white text-gray-600 border-gray-300';
                return `<button type="button" onclick="filtrarCategoriaPiezas(${pgIndex}, '${nombre.replace(/'/g, "\\'")}')" class="${clases}">${etiqueta}${hechas > 0 ? ` <span class="text-emerald-500">(${hechas})</span>` : ''}</button>`;
            }).join('');
            cajaCats.innerHTML = botones;
        }
    }

    const contenedor = document.getElementById(`lista-sabores-piezas-${pgIndex}`);
    if (!contenedor) return;

    const usadas = subtotalParaAlt(estado, alt);
    // Con una sola elección siempre se puede tocar otra tarjeta (cambia la
    // elegida). Con varias, se apagan las que ya no caben.
    const quedaCupo = alt.selecciones === 1 || usadas < alt.selecciones;
    // El filtro solo esconde tarjetas: lo elegido en otra categoría sigue contando.
    const visibles = (categorias.length >= 2 && filtro !== '')
        ? alt.opciones.filter(o => o.categoriaOrigen === filtro)
        : alt.opciones;

    if (visibles.length === 0) {
        contenedor.innerHTML = `<p class="text-xs text-red-500 font-bold px-1">⚠️ No hay sabores disponibles para "${escapeHtml(filtro || alt.nombre)}" en este momento.</p>`;
    } else {
        contenedor.innerHTML = visibles.map(item => {
            const veces = estado.seleccion[item.id] || 0;
            const elegido = veces > 0;
            const apagado = !elegido && !quedaCupo;

            let clasesTarjeta = 'p-2.5 rounded-lg border transition ';
            if (elegido) clasesTarjeta += 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-300 cursor-pointer';
            else if (apagado) clasesTarjeta += 'bg-white border-gray-200 opacity-40 cursor-not-allowed';
            else clasesTarjeta += 'bg-white border-gray-200 hover:border-red-400 cursor-pointer';

            // Insignia de la derecha: chulo cuando es una sola elección, contador
            // con su botón de quitar cuando el combo permite varias.
            let insignia = '';
            if (elegido && alt.selecciones === 1) {
                insignia = `<span class="text-emerald-600 text-lg leading-none flex-shrink-0">✓</span>`;
            } else if (elegido) {
                insignia = `
                    <span class="flex items-center gap-1.5 flex-shrink-0">
                        <span class="text-[11px] font-black text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">×${veces}</span>
                        <span onclick="quitarSaborPieza(${pgIndex}, '${item.id}', event)" title="Quitar uno" class="w-6 h-6 rounded-full bg-white border border-gray-300 text-gray-500 hover:text-red-600 hover:border-red-300 text-sm font-bold flex items-center justify-center cursor-pointer">−</span>
                    </span>`;
            }

            const alTocar = apagado ? '' : `onclick="elegirSaborPieza(${pgIndex}, '${item.id}')"`;

            return `
            <div ${alTocar} class="${clasesTarjeta}">
                <div class="flex items-center gap-2">
                    ${construirMiniaturaComboHtml(item.image)}
                    <div class="flex-grow min-w-0">
                        <p class="text-xs font-bold text-gray-800 leading-snug">${escapeHtml(item.name)}</p>
                        ${item.desc ? `<p class="text-[10px] text-gray-400 italic leading-snug mt-0.5">${escapeHtml(item.desc)}</p>` : ''}
                    </div>
                    ${insignia}
                </div>
            </div>
        `;
        }).join('');
    }

    actualizarContadorPiezas(pgIndex);
}

// Tocar una tarjeta. Con una sola elección permitida, tocar otra cambia la
// elegida; con varias, va sumando hasta llenar el cupo.
function elegirSaborPieza(pgIndex, itemId) {
    const estado = estadoPiezasCombo[pgIndex];
    if (!estado) return;
    const alt = estado.alternativas[estado.alternativaActiva];

    if (alt.selecciones === 1) {
        alt.opciones.forEach(o => { delete estado.seleccion[o.id]; });
        estado.seleccion[itemId] = 1;
        renderSaboresPiezas(pgIndex);
        return;
    }

    if (subtotalParaAlt(estado, alt) >= alt.selecciones) return;
    estado.seleccion[itemId] = (estado.seleccion[itemId] || 0) + 1;
    renderSaboresPiezas(pgIndex);
}

function quitarSaborPieza(pgIndex, itemId, evento) {
    if (evento) evento.stopPropagation();
    const estado = estadoPiezasCombo[pgIndex];
    if (!estado) return;

    const actual = estado.seleccion[itemId] || 0;
    if (actual <= 1) delete estado.seleccion[itemId];
    else estado.seleccion[itemId] = actual - 1;

    renderSaboresPiezas(pgIndex);
}

// Devuelve el avance del estilo activo, contado en elecciones (no en piezas).
function calcularPiezasSeleccionadas(estado) {
    const alt = estado.alternativas[estado.alternativaActiva];
    return { total: subtotalParaAlt(estado, alt), objetivo: alt.selecciones, alt };
}

function actualizarContadorPiezas(pgIndex) {
    const estado = estadoPiezasCombo[pgIndex];
    if (!estado) return;
    const { total, objetivo } = calcularPiezasSeleccionadas(estado);

    const badge = document.getElementById(`contador-piezas-${pgIndex}`);
    if (badge) {
        badge.innerText = objetivo === 1 ? (total === 1 ? 'Listo' : 'Falta elegir') : `${total} / ${objetivo}`;
        badge.className = `text-xs font-black px-2.5 py-1 rounded-full flex-shrink-0 whitespace-nowrap ${total === objetivo ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`;
    }

    actualizarEstadoBotonConfirmar();
}

function grupoPiezasCompleto(estado) {
    if (estado.modo === 'todas') {
        return estado.alternativas.every(alt => subtotalParaAlt(estado, alt) === alt.selecciones);
    }
    const { total, objetivo } = calcularPiezasSeleccionadas(estado);
    return total === objetivo;
}

function todosLosGruposPiezasCompletos() {
    return Object.values(estadoPiezasCombo).every(grupoPiezasCompleto);
}

function actualizarEstadoBotonConfirmar() {
    const btn = document.getElementById('btn-confirmar-combo');
    if (!btn) return;
    const listo = todosLosGruposPiezasCompletos();
    btn.disabled = !listo;
    btn.classList.toggle('opacity-40', !listo);
    btn.classList.toggle('cursor-not-allowed', !listo);
}

function actualizarDescripcionCombo(selectElement, idParrafo, idImgWrap) {
    const opcionSeleccionada = selectElement.options[selectElement.selectedIndex];
    const descripcion = opcionSeleccionada.getAttribute('data-desc');
    const parrafo = document.getElementById(idParrafo);

    if (parrafo) {
        parrafo.innerText = descripcion || '';
    }

    if (idImgWrap) {
        const imgWrap = document.getElementById(idImgWrap);
        if (imgWrap) imgWrap.innerHTML = construirMiniaturaComboHtml(opcionSeleccionada.getAttribute('data-img'));
    }
}

function guardarSeleccionCombo() {
    if (!comboEnPersonalizacion) return;

    if (!todosLosGruposPiezasCompletos()) {
        alert('⚠️ Elige todas las opciones del combo antes de continuar.');
        return;
    }

    let elecciones = [];
    let clavesVariante = [];
    let selects = document.querySelectorAll('[id^="select-combo-grupo-"]');

    selects.forEach(select => {
        elecciones.push(select.value);
        clavesVariante.push(select.value);
    });

    Object.keys(estadoPiezasCombo).forEach(pgIndex => {
        const estado = estadoPiezasCombo[pgIndex];
        const todasLasOpciones = estado.alternativas.flatMap(a => a.opciones);
        // La cocina necesita ver las piezas, no solo el nombre del roll:
        //   1 eleccion  -> "Tiger roll (12pz)"
        //   3 elecciones -> "2x Tiger roll (8pz c/u), 1x Sensei roll (8pz c/u)"
        const formatearDetalles = (itemIds, alt) => itemIds.map(itemId => {
            const item = todasLasOpciones.find(o => o.id === itemId);
            const cant = estado.seleccion[itemId];
            clavesVariante.push(`${itemId}x${cant}`);
            const nombre = item ? item.name : itemId;
            if (alt.selecciones === 1) return `${nombre} (${alt.piezas_objetivo}pz)`;
            return `${cant}x ${nombre} (${alt.piezas_por_seleccion}pz c/u)`;
        }).join(', ');

        if (estado.modo === 'todas') {
            estado.alternativas.forEach(alt => {
                const idsDeEstaAlt = alt.opciones.map(o => o.id).filter(id => estado.seleccion[id] > 0);
                if (idsDeEstaAlt.length > 0) elecciones.push(`${alt.nombre}: ${formatearDetalles(idsDeEstaAlt, alt)}`);
            });
        } else {
            const altActiva = estado.alternativas[estado.alternativaActiva];
            const idsSeleccionados = Object.keys(estado.seleccion);
            if (idsSeleccionados.length > 0) {
                elecciones.push(`${altActiva.nombre}: ${formatearDetalles(idsSeleccionados, altActiva)}`);
            }
        }
    });

    let descripcionVariante = elecciones.length > 0 ? elecciones.join(' | ') : '';
    let stringClave = clavesVariante.length > 0 ? clavesVariante.join('_').replace(/[^a-zA-Z0-9]/g, '') : 'fijo';
    let variantKey = comboEnPersonalizacion.id + "_" + stringClave;

    let cartName = elecciones.length > 0 ? `${comboEnPersonalizacion.name} (${descripcionVariante})` : comboEnPersonalizacion.name;
    const inputNotaCombo = document.getElementById('modal-combo-nota');
    const notaCombo = inputNotaCombo ? inputNotaCombo.value.trim() : '';

    if (!cart[variantKey]) {
        cart[variantKey] = {
            id: comboEnPersonalizacion.id,
            name: cartName,
            price: comboEnPersonalizacion.price,
            qty: 1,
            note: notaCombo
        };
    } else {
        cart[variantKey].qty += 1;
        if (notaCombo) cart[variantKey].note = notaCombo;
    }

    const idCombo = comboEnPersonalizacion.id;

    // Esta unidad ya quedó personalizada: se descuenta de lo pendiente.
    const pendientesActuales = pendientesPersonalizarCombo[idCombo] || 0;
    if (pendientesActuales > 1) pendientesPersonalizarCombo[idCombo] = pendientesActuales - 1;
    else delete pendientesPersonalizarCombo[idCombo];
    actualizarUiPendienteCombo(idCombo);

    calculateTotals();
    if (document.getElementById('step-3').classList.contains('active')) prepareCheckout();

    // Si el cliente escribió una cantidad mayor (ej. 3) y todavía faltan unidades por
    // personalizar de ese lote, reabrimos el modal para la siguiente en vez de cerrar.
    if (loteComboEnCurso && loteComboEnCurso.id === comboEnPersonalizacion.id && loteComboEnCurso.restantes > 1) {
        loteComboEnCurso.restantes -= 1;
        abrirModalCombo(comboEnPersonalizacion);
        return;
    }

    loteComboEnCurso = null;
    cerrarModalCombo();
}

// ==========================================
// GESTIÓN DE DIRECCIONES Y PERFIL
// ==========================================

// Copia de los datos al abrir "Mis datos". Borrar una dirección en el modal es
// solo local hasta que se guarda; si el cliente cierra sin guardar, o cancela
// cuando le piden la clave, se vuelve a esta copia.
let copiaDatosAntesDeEditar = null;

function abrirModalEditarDatos() {
    if (!datosClienteLogueado) return;
    copiaDatosAntesDeEditar = JSON.parse(JSON.stringify(datosClienteLogueado));

    document.getElementById('lbl-cliente-activo').innerText = datosClienteLogueado.nombre;
    document.getElementById('edit-telefono').value = datosClienteLogueado.telefono || '';
    document.getElementById('edit-dir-principal').value = datosClienteLogueado.direccion_principal || '';
    renderizarDireccionesExtra();

    document.getElementById('modal-editar-datos').classList.remove('hidden');
    document.getElementById('modal-editar-datos').classList.add('flex');
}

async function guardarTelefonoCliente() {
    const btn = document.getElementById('btn-guardar-telefono');
    const nuevoTelefono = leerTelefonoDeFormulario('edit-telefono');
    if (!nuevoTelefono) { alert('Ingresa un número de teléfono.'); return; }
    if (nuevoTelefono === datosClienteLogueado.telefono) return;

    btn.disabled = true; btn.innerText = '...';

    try {
        // Cambiar el número siempre pide la clave.
        const response = await enviarCambioConClave(API_BASE + "/api/clientes/actualizar-telefono",
            { telefono_actual: datosClienteLogueado.telefono, telefono_nuevo: nuevoTelefono });
        if (response === null) return; // canceló al pedirle la clave

        if (!response.ok) {
            alert(await motivoDelRechazo(response, 'No se pudo actualizar el número.'));
            return;
        }

        datosClienteLogueado.telefono = nuevoTelefono;
        if (copiaDatosAntesDeEditar) copiaDatosAntesDeEditar.telefono = nuevoTelefono;
        localStorage.setItem('sesionCliente', JSON.stringify(datosClienteLogueado));
        alert('✅ Número actualizado correctamente.');
    } catch (e) {
        console.error("Error al actualizar teléfono:", e);
        alert('Error de conexión al actualizar el número.');
    } finally {
        btn.disabled = false; btn.innerText = 'Actualizar';
    }
}

function cerrarModalEditarDatos(guardado = false) {
    if (!guardado && copiaDatosAntesDeEditar && datosClienteLogueado) {
        datosClienteLogueado = copiaDatosAntesDeEditar;
        localStorage.setItem('sesionCliente', JSON.stringify(datosClienteLogueado));
        cargarSelectorDirecciones();
    }
    copiaDatosAntesDeEditar = null;
    document.getElementById('modal-editar-datos').classList.remove('flex');
    document.getElementById('modal-editar-datos').classList.add('hidden');
}

function renderizarDireccionesExtra() {
    const contenedor = document.getElementById('lista-direcciones-extra');
    contenedor.innerHTML = '';
    
    let extras = [];
    try {
        if (datosClienteLogueado.direcciones_extra) {
            extras = typeof datosClienteLogueado.direcciones_extra === 'string' 
                ? JSON.parse(datosClienteLogueado.direcciones_extra) 
                : datosClienteLogueado.direcciones_extra;
        }
    } catch(e) { extras = []; }

    if (!Array.isArray(extras) || extras.length === 0) {
        contenedor.innerHTML = '<p class="text-xs text-gray-400 italic bg-gray-50 p-3 rounded-lg border border-dashed border-gray-200">No tienes direcciones adicionales guardadas aún.</p>';
        return;
    }

    extras.forEach((dir, index) => {
        if (!dir) return;
        const div = document.createElement('div');
        div.className = "flex items-center justify-between bg-white p-2.5 rounded-xl border border-gray-200 gap-3 shadow-sm";
        div.innerHTML = `
            <p class="text-[13px] text-gray-700 line-clamp-2 flex-grow font-medium leading-snug">${escapeHtml(dir)}</p>
            <button type="button" onclick="eliminarDireccionExtra(${index})" class="w-8 h-8 flex items-center justify-center bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-lg text-sm transition flex-shrink-0 cursor-pointer" title="Eliminar">🗑️</button>
        `;
        contenedor.appendChild(div);
    });
}

function eliminarDireccionExtra(index) {
    let extras = [];
    try {
        extras = typeof datosClienteLogueado.direcciones_extra === 'string' 
            ? JSON.parse(datosClienteLogueado.direcciones_extra) 
            : datosClienteLogueado.direcciones_extra;
    } catch(e) { return; }
    
    extras.splice(index, 1);
    
    datosClienteLogueado.direcciones_extra = JSON.stringify(extras);
    localStorage.setItem('sesionCliente', JSON.stringify(datosClienteLogueado));
    
    renderizarDireccionesExtra();
    cargarSelectorDirecciones(); 
}

async function guardarEdicionDatos() {
    const btn = document.getElementById('btn-guardar-datos');
    const dirPrincipalNueva = document.getElementById('edit-dir-principal').value.trim();
    
    btn.disabled = true; btn.innerText = "Guardando...";

    try {
        // Solo agregar no pide clave; borrar o cambiar una dirección sí. Lo
        // decide el backend: si hace falta, responde 401 y aquí se pide.
        const response = await enviarCambioConClave(API_BASE + "/api/clientes/actualizar-direcciones-cliente", {
            telefono: datosClienteLogueado.telefono,
            direccion_principal: dirPrincipalNueva,
            direcciones_extra: datosClienteLogueado.direcciones_extra
        });
        if (response === null) return; // canceló: el modal sigue abierto, nada cambió
        if (!response.ok) {
            alert(await motivoDelRechazo(response, 'No se pudieron guardar los cambios.'));
            return;
        }

        datosClienteLogueado.direccion_principal = dirPrincipalNueva;
        localStorage.setItem('sesionCliente', JSON.stringify(datosClienteLogueado));
        cargarSelectorDirecciones();
        cerrarModalEditarDatos(true);
    } catch(e) {
        console.error("Error al guardar en servidor:", e);
        alert('Error de conexión al guardar los cambios.');
    } finally {
        btn.disabled = false; btn.innerText = "💾 Guardar Direcciones";
    }
}


// ==========================================
// DELIVERY POR DISTANCIA: ubicación del cliente y precio antes de pedir
// ==========================================
let UBICACION_ENTREGA = null;     // { lat, lng } compartida por el cliente
let COTIZACION_DELIVERY = null;   // última respuesta de /api/delivery/cotizar
let _cotizSeq = 0;

function claveUbicacion(dir) { return String(dir || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200); }
function leerUbicacionesGuardadas() { try { return JSON.parse(localStorage.getItem('ubicacionesEntrega') || '{}') || {}; } catch (e) { return {}; } }
function guardarUbicacionDeDireccion(dir, ub) {
    if (!dir || !ub) return;
    const m = leerUbicacionesGuardadas();
    m[claveUbicacion(dir)] = { lat: ub.lat, lng: ub.lng };
    const claves = Object.keys(m);
    if (claves.length > 20) delete m[claves[0]];
    try { localStorage.setItem('ubicacionesEntrega', JSON.stringify(m)); } catch (e) {}
}
// Cada dirección guardada recuerda su ubicación, así el cliente que repite no tiene que compartirla otra vez.
function restaurarUbicacionDeDireccion() {
    const sel = document.getElementById('sel-direccion-entrega');
    UBICACION_ENTREGA = null;
    if (sel && sel.value && sel.value !== '__MANUAL__') {
        const g = leerUbicacionesGuardadas()[claveUbicacion(sel.value)];
        if (g && Number.isFinite(g.lat) && Number.isFinite(g.lng)) UBICACION_ENTREGA = g;
    }
}

function compartirUbicacion() {
    const estado = document.getElementById('txt-ubicacion-estado');
    const btn = document.getElementById('btn-ubicacion');
    if (!navigator.geolocation) { if (estado) estado.textContent = 'Tu navegador no permite compartir la ubicación. Igual puedes pedir: el costo del delivery te lo confirmamos.'; return; }
    if (estado) estado.textContent = 'Buscando tu ubicación...';
    if (btn) btn.disabled = true;
    navigator.geolocation.getCurrentPosition(pos => {
        UBICACION_ENTREGA = { lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6 };
        if (btn) btn.disabled = false;
        refrescarCotizacionDelivery();
    }, err => {
        if (btn) btn.disabled = false;
        if (estado) estado.textContent = err && err.code === 1
            ? 'No pudimos acceder a tu ubicación. Activa el permiso de ubicación en tu navegador y vuelve a intentar. Igual puedes pedir: el costo del delivery te lo confirmamos.'
            : 'No pudimos obtener tu ubicación ahora. Intenta de nuevo, o pide igual y te confirmamos el costo del delivery.';
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
}

async function refrescarCotizacionDelivery() {
    const caja = document.getElementById('caja-ubicacion-delivery');
    if (!caja) return; // esta pantalla no tiene el bloque (ej. menú de trabajadores)
    const tipo = (document.getElementById('delivery-type') || {}).value;
    if (tipo !== 'Delivery') { COTIZACION_DELIVERY = null; pintarCotizacionDelivery(); return; }
    const seq = ++_cotizSeq;
    try {
        const r = await fetch(API_BASE + '/api/delivery/cotizar', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sucursal_id: SUCURSAL_ACTUAL ? SUCURSAL_ACTUAL.id : undefined, lat: UBICACION_ENTREGA ? UBICACION_ENTREGA.lat : undefined, lng: UBICACION_ENTREGA ? UBICACION_ENTREGA.lng : undefined, articulos: Object.values(cart) })
        });
        if (seq !== _cotizSeq) return; // llegó una respuesta más nueva
        COTIZACION_DELIVERY = r.ok ? await r.json() : null;
    } catch (e) { COTIZACION_DELIVERY = null; }
    pintarCotizacionDelivery();
}

function pintarCotizacionDelivery() {
    const caja = document.getElementById('caja-ubicacion-delivery');
    if (!caja) return;
    const btn = document.getElementById('btn-ubicacion'), estado = document.getElementById('txt-ubicacion-estado'), box = document.getElementById('caja-cotizacion-delivery');
    const fila = document.getElementById('checkout-delivery-row'), filaTot = document.getElementById('checkout-total-con-delivery-row');
    const c = COTIZACION_DELIVERY;
    const ocultarFilas = () => { fila.classList.add('hidden'); filaTot.classList.add('hidden'); };
    box.classList.add('hidden'); ocultarFilas();
    if (!c) { caja.classList.add('hidden'); return; }
    caja.classList.remove('hidden');
    const sub = Number(window.__totalCarritoCheckout) || 0;

    if (!c.automatico) {
        // Modo manual (o sucursal sin coordenadas) o aún sin ubicación
        if (c.motivo === 'sin_ubicacion') {
            btn.classList.remove('hidden'); btn.innerText = '📍 Compartir mi ubicación para ver el costo del delivery';
            estado.textContent = 'Solo la usamos para calcular el delivery. Si prefieres no compartirla, igual puedes pedir: el costo te lo confirmamos.';
        } else {
            btn.classList.add('hidden');
            estado.textContent = '🛵 ' + (c.mensaje || 'El costo del delivery te lo confirmamos al recibir tu pedido.');
        }
        return;
    }
    btn.classList.remove('hidden'); btn.innerText = '📍 Actualizar mi ubicación';
    if (c.ok === false) {
        estado.textContent = '';
        box.className = 'rounded-xl p-3 border text-sm font-semibold bg-red-50 border-red-300 text-red-800';
        box.textContent = '⚠️ ' + c.mensaje; return;
    }
    estado.textContent = 'Ubicación recibida ✓ · distancia aproximada: ' + c.km + ' km.';
    const rec = (c.recargos || []).map(x => x.tipo === 'nocturno' ? 'recargo nocturno' : (x.tipo === 'lluvia' ? 'recargo por lluvia' : x.tipo));
    box.className = 'rounded-xl p-3 border text-sm font-semibold bg-green-50 border-green-300 text-green-800';
    box.textContent = c.gratis ? '🎁 ¡Delivery gratis en este pedido!' : '🛵 Delivery: $' + Number(c.precio).toFixed(2) + (rec.length ? ' (incluye ' + rec.join(' y ') + ')' : '');
    fila.classList.remove('hidden'); filaTot.classList.remove('hidden');
    document.getElementById('checkout-delivery-price').innerText = c.gratis ? 'Gratis' : '$' + Number(c.precio).toFixed(2);
    document.getElementById('checkout-total-con-delivery').innerText = '$' + (sub + Number(c.precio)).toFixed(2);
}
