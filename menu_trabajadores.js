// =============================================================================
// MENÚ DE TRABAJADORES  (menu_trabajadores.html)
//
// Esta pantalla reutiliza menu.js entero: el catálogo, el carrito, y sobre todo
// toda la personalización de combos (piezas, estilos, variantes, promociones).
// Aquí solo se reemplaza lo que cambia cuando quien arma el pedido no es el
// cliente sino la caja:
//
//   · la sesión es la del personal (JWT), no la del cliente por teléfono
//   · no hay pasos de login/registro ni popups de anuncios
//   · el horario del local no bloquea (el backend deja pasar al personal)
//   · el cierre pide los datos del cliente en vez de sacarlos de su cuenta
//   · hay buscador, y un renglón escrito a mano para admins
//
// Este archivo se carga DESPUÉS de menu.js a propósito: al declarar una función
// con el mismo nombre, la de aquí es la que queda. Si tocas una de las funciones
// listadas en "REEMPLAZOS" dentro de menu.js, revisa también su gemela de aquí.
// =============================================================================

// API_BASE viene de config.js, que se carga antes que este archivo.
const URL_BUSCAR_CLIENTES_TRAB = API_BASE + "/api/clientes/buscar";
const URL_CREAR_PEDIDO_TRAB = API_BASE + "/api/pedidos/";
const URL_EDITAR_PEDIDO_TRAB = API_BASE + "/api/pedidos/editar";
const URL_NOTIFICAR_EDICION_TRAB = API_BASE + "/api/pedidos/notificar-edicion";

// El tablero deja aquí el pedido que se va a editar antes de mandar al cajero a
// esta pantalla, para no tener que volver a pedírselo al servidor.
const CLAVE_PEDIDO_EN_EDICION = 'tokioPedidoEnEdicion';

let usuarioActivoTrabajador = null;
let contadorLineaManual = 0;
let _ultimoTelefonoBuscadoTrab = null;

// Pedido que se está editando, o null si se está tomando uno nuevo. Es el
// interruptor de todo el modo edición: cambia el título, el botón de cerrar y
// a dónde se manda el pedido al guardar.
let pedidoEnEdicion = null;
let contadorLineaPrecargada = 0;


// --- Sesión del personal -----------------------------------------------------

function esAdminTrabajador() {
    const rol = (usuarioActivoTrabajador && usuarioActivoTrabajador.rol || '').toLowerCase();
    return rol === 'admin' || rol === 'superadmin';
}

// La flecha de la cabecera retrocede un paso dentro del pedido. Para salir al
// tablero esta el boton "Tablero", que es lo que se espera de cada uno.
function retrocederPaso() {
    const activo = document.querySelector('.step.active');
    const paso = activo ? parseInt(String(activo.id).replace('step-', ''), 10) : 1;

    // Desde el cierre se vuelve a la lista de categorias, igual que hace el
    // boton "Anadir mas platos" del propio carrito.
    if (paso === 2 || paso === 3) goToStep(1);
    // En los pasos 1 y 4 no hay a donde volver: ahi la flecha esta oculta.
}

function volverAlTablero() {
    // Editando un pedido que ya existe, salir sin guardar deja las cosas como
    // estaban: mejor preguntar, porque el cajero llegó aquí desde el tablero.
    if (pedidoEnEdicion && !confirm('¿Salir sin guardar los cambios del pedido?')) return;
    limpiarPedidoEnEdicionGuardado();
    window.location.href = 'cocina.html';
}

function pintarBadgeUsuario() {
    const badge = document.getElementById('badge-usuario');
    if (!badge || !usuarioActivoTrabajador) return;

    let colorRol = 'bg-slate-500/10 text-slate-300 border-slate-500/20';
    if (usuarioActivoTrabajador.rol === 'superadmin') colorRol = 'bg-red-500/10 text-red-400 border-red-500/20';
    if (usuarioActivoTrabajador.rol === 'admin') colorRol = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';

    badge.innerHTML = `
        <span class="text-[10px] uppercase text-slate-500 font-bold">Op:</span>
        <span class="text-xs font-bold text-white truncate max-w-[120px]">${escapeHtml(usuarioActivoTrabajador.nombre || '')}</span>
        <span class="text-[9px] uppercase font-mono font-bold px-1.5 py-0.5 rounded border ${colorRol} shrink-0">${escapeHtml(usuarioActivoTrabajador.rol || '')}</span>
    `;
}


// --- REEMPLAZOS de menu.js ---------------------------------------------------

// El personal no ve el popup de promociones; cargarMenuDesdeDB lo dispara solo,
// así que lo anulamos aquí en vez de tocar menu.js.
async function cargarYMostrarAnuncios() { /* intencionalmente vacío */ }


// ---- Sucursales: el empleado pide para la suya; el dueño elige ----
async function resolverSucursalPersonal() {
    let lista = [];
    try { const r = await fetch(API_BASE + '/api/sitio'); lista = ((await r.json()).sucursales || []).filter(s => s.activa !== false); } catch (e) {}
    SUCURSALES = lista;
    if (lista.length === 0) return;
    if (lista.length === 1) { SUCURSAL_ACTUAL = lista[0]; return; }
    const cab = document.querySelector('header');
    const barra = document.createElement('div');
    barra.style.cssText = 'background:#1e293b;border-bottom:1px solid #334155;color:#fde68a;text-align:center;font-size:14px;font-weight:700;padding:8px 12px';
    const miId = usuarioActivoTrabajador && usuarioActivoTrabajador.sucursal_id;
    if (miId) {
        SUCURSAL_ACTUAL = lista.find(s => Number(s.id) === Number(miId)) || null;
        barra.textContent = '📍 Pedido para: ' + (SUCURSAL_ACTUAL ? SUCURSAL_ACTUAL.nombre : 'tu sucursal');
    } else {
        SUCURSAL_ACTUAL = lista.find(s => String(s.id) === localStorage.getItem('filtro_sucursal')) || lista[0];
        barra.innerHTML = '📍 Pedido para: <select style="background:#0f172a;color:#fff;border:1px solid #475569;border-radius:8px;padding:4px 8px;font:inherit;margin-left:6px">' +
            lista.map(s => '<option value="' + s.id + '"' + (s.id === SUCURSAL_ACTUAL.id ? ' selected' : '') + '>' + escapeHtml(s.nombre) + '</option>').join('') + '</select>';
        barra.querySelector('select').onchange = e => {
            if (Object.keys(cart).length && !confirm('Al cambiar de sucursal se vacía el pedido en curso. ¿Continuar?')) { e.target.value = SUCURSAL_ACTUAL.id; return; }
            localStorage.setItem('filtro_sucursal', e.target.value); location.reload();
        };
    }
    if (cab) cab.insertAdjacentElement('afterend', barra);
}

window.onload = async function() {
    cargarMetodosPago('trab-pago'); // métodos de pago configurables
    const sesion = localStorage.getItem('usuarioActivo');
    const token = localStorage.getItem('tokioAuthToken');

    // Sin sesión de personal esta pantalla no tiene nada que hacer: al tablero,
    // que es donde se inicia sesión.
    if (!sesion || !token) {
        window.location.replace('cocina.html');
        return;
    }

    try {
        usuarioActivoTrabajador = JSON.parse(sesion);
    } catch (e) {
        window.location.replace('cocina.html');
        return;
    }

    pintarBadgeUsuario();

    // El renglón a mano deja escribir un precio libre, así que solo para admins.
    if (esAdminTrabajador()) {
        document.getElementById('bloque-linea-manual').classList.remove('hidden');
    }

    history.replaceState({ step: 1 }, "Categorías");
    await resolverSucursalPersonal(); // antes del menú: de ella dependen platos y mesas
    await cargarMenuDesdeDB();

    // ?editar=<id> significa que venimos del lápiz del tablero: en vez de un
    // pedido en blanco, cargamos el que ya existe y abrimos directo el carrito.
    const idAEditar = new URLSearchParams(window.location.search).get('editar');
    if (idAEditar) {
        await entrarEnModoEdicion(idAEditar);
        return;
    }

    goToStep(1, false);
};

window.onpopstate = function(event) {
    const paso = (event.state && event.state.step) ? event.state.step : 1;
    goToStep(paso, false);
};

function goToStep(stepNumber, pushState = true) {
    const destino = document.getElementById(`step-${stepNumber}`);
    if (!destino) return; // esta pantalla no tiene los pasos de login del cliente

    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    destino.classList.add('active');
    window.scrollTo(0, 0);

    // El buscador solo sirve mientras se agregan artículos.
    const barra = document.getElementById('barra-busqueda');
    if (barra) barra.classList.toggle('hidden', stepNumber === 3 || stepNumber === 4);

    // La flecha de atrás solo tiene sentido si hay un paso anterior. Se usa
    // `invisible` y no `hidden` para que el título no salte de sitio.
    const btnAtras = document.getElementById('btn-atras');
    if (btnAtras) btnAtras.classList.toggle('invisible', stepNumber === 1 || stepNumber === 4);

    // Al entrar a una categoría se cierra el buscador. Si el mismo plato quedara
    // pintado en los dos sitios habría dos elementos con el mismo id, y los
    // botones de cantidad actualizarían la tarjeta escondida en vez de la visible.
    if (stepNumber === 2) limpiarBusqueda(false);

    updateStickyBarVisibility(stepNumber);

    if (pushState) history.pushState({ step: stepNumber }, `Paso ${stepNumber}`);
}

// Mosaico de categorías pensado para PC: 4 por fila en pantallas grandes (las
// columnas las pone el contenedor en el HTML) y la foto mucho más grande que en
// el menú del cliente, que las muestra en una lista de una sola columna.
function renderizarCategorias() {
    const container = document.getElementById('contenedor-categorias');
    if (!container) return;
    container.innerHTML = '';

    const iconosRespaldo = ['🍔', '🍟', '🍗', '🥤', '🍦', '🌭', '🍕', '🔥'];
    let pintadas = 0;

    Object.keys(menuData).forEach((catKey, index) => {
        const catInfo = menuData[catKey];
        // Si el catálogo no llegó a cargar, menuData todavía trae su forma inicial
        // sin `items`. Aquí se repinta también al empezar un pedido nuevo, así que
        // no puede dar por hecho que ya hay menú.
        const itemsVisibles = (catInfo && catInfo.items ? catInfo.items : [])
            .filter(i => i.disponible !== false && !i.agotado && itemDentroDeHorarioProgramado(i));
        if (itemsVisibles.length === 0) return; // categorías que solo tienen piezas de combos

        let arteVisual;
        if (catInfo.imagen && esUrlImagen(catInfo.imagen)) {
            // El recuadro mide 96px (w-24); 192 cubre pantallas 2x sin pasarse del
            // ancho con el que se suben estas imágenes (ANCHOS_SUBIDA en admin.js).
            arteVisual = `<img src="${urlImagen(catInfo.imagen, 192)}" data-original="${escapeHtml(catInfo.imagen)}" onerror="imagenConRespaldo(this)" alt="${escapeHtml(catInfo.titulo)}" loading="lazy" class="w-full h-full object-cover">`;
        } else {
            arteVisual = (catInfo.imagen && String(catInfo.imagen).trim()) ? escapeHtml(catInfo.imagen.trim()) : iconosRespaldo[index % iconosRespaldo.length];
        }

        container.insertAdjacentHTML('beforeend', `
            <button type="button" onclick="selectCategory('${catKey}')" class="bg-white rounded-2xl p-5 flex flex-col items-center gap-3 shadow-sm border-2 border-transparent hover:border-emerald-400 hover:shadow-lg transition cursor-pointer text-center">
                <div class="w-24 h-24 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center text-5xl flex-shrink-0 overflow-hidden">
                    ${arteVisual}
                </div>
                <div class="min-w-0 w-full">
                    <h3 class="font-bold text-slate-800 text-base leading-tight break-words">${escapeHtml(catInfo.titulo)}</h3>
                    <p class="text-xs text-slate-400 mt-1">${itemsVisibles.length} platos</p>
                </div>
            </button>
        `);
        pintadas++;
    });

    if (pintadas === 0) {
        container.innerHTML = '<div class="col-span-full text-center text-slate-400 text-sm py-10">No hay platos disponibles ahora mismo.</div>';
    }
}

// El checkout del cliente rellena datos de su cuenta; aquí el formulario es otro
// y lo llena el trabajador, así que solo se reaprovecha el resumen del carrito.
function prepareCheckout() {
    if (!renderizarResumenCarrito()) return;
    if (!document.getElementById('step-3').classList.contains('active')) goToStep(3);
}

// menu.js llama a resetForm desde su pantalla de "pedido enviado"; aquí el
// equivalente es empezar un pedido nuevo.
function resetForm() {
    reiniciarPedidoTrabajador();
}

// Si algo del motor del cliente intenta enviar el pedido, que use el nuestro.
function sendOrder(event) {
    return enviarPedidoTrabajador(event);
}


// --- Buscador ----------------------------------------------------------------

// Cierra el panel de resultados y devuelve las categorías, sin tocar lo escrito
// en la caja de búsqueda. Vaciar la lista es obligatorio: si quedaran tarjetas
// del mismo plato aquí y en el paso 2, habría ids repetidos en la página.
function ocultarResultadosBusqueda() {
    const panel = document.getElementById('resultados-busqueda');
    const cats = document.getElementById('vista-categorias');
    const lista = document.getElementById('lista-resultados');
    if (panel) panel.classList.add('hidden');
    if (cats) cats.classList.remove('hidden');
    if (lista) lista.innerHTML = '';
}

// Además borra lo escrito. `devolverFoco` va en false cuando la limpieza es un
// efecto secundario (entrar a una categoría, empezar un pedido nuevo) y no algo
// que el trabajador pidió.
function limpiarBusqueda(devolverFoco = true) {
    const input = document.getElementById('buscador-menu');
    if (input) input.value = '';

    const btn = document.getElementById('btn-limpiar-busqueda');
    if (btn) btn.classList.add('hidden');

    ocultarResultadosBusqueda();
    if (devolverFoco && input) input.focus();
}

function buscarEnMenuTrabajador() {
    const input = document.getElementById('buscador-menu');
    const texto = (input ? input.value : '').trim().toLowerCase();

    const panelResultados = document.getElementById('resultados-busqueda');
    const vistaCategorias = document.getElementById('vista-categorias');
    const btnLimpiar = document.getElementById('btn-limpiar-busqueda');
    const vacio = document.getElementById('resultados-vacio');
    const lista = document.getElementById('lista-resultados');

    btnLimpiar.classList.toggle('hidden', texto.length === 0);

    // Con una sola letra saldría medio menú; a partir de dos ya filtra de verdad.
    if (texto.length < 2) {
        ocultarResultadosBusqueda();
        return;
    }

    if (!document.getElementById('step-1').classList.contains('active')) goToStep(1);

    // Mismo motivo que en goToStep: no puede haber dos tarjetas del mismo plato.
    const contenedorPaso2 = document.getElementById('items-container');
    if (contenedorPaso2) contenedorPaso2.innerHTML = '';

    const vistos = new Set();
    const encontrados = [];
    Object.keys(menuData).forEach(catKey => {
        // El buscador está visible desde que abre la pantalla, así que puede
        // usarse antes de que termine de bajar el catálogo.
        const items = (menuData[catKey] && menuData[catKey].items) || [];
        items.forEach(item => {
            if (item.disponible === false || item.agotado) return;
            if (!itemDentroDeHorarioProgramado(item)) return;
            if (vistos.has(item.id)) return;

            const nombre = String(item.name || '').toLowerCase();
            const desc = String(item.desc || '').toLowerCase();
            if (nombre.includes(texto) || desc.includes(texto)) {
                vistos.add(item.id);
                encontrados.push(item);
            }
        });
    });

    vistaCategorias.classList.add('hidden');
    panelResultados.classList.remove('hidden');
    document.getElementById('contador-resultados').innerText = encontrados.length;

    lista.innerHTML = encontrados.map(item => construirTarjetaItemHtml(item)).join('');
    vacio.classList.toggle('hidden', encontrados.length > 0);
}


// --- Búsqueda del cliente por teléfono ---------------------------------------

function _estadoClienteTrab(tipo, html) {
    const caja = document.getElementById('trab-estado-cliente');
    if (!caja) return;
    const estilos = {
        buscando: 'bg-slate-50 border-slate-200 text-slate-500',
        encontrado: 'bg-emerald-50 border-emerald-200 text-emerald-800',
        nuevo: 'bg-amber-50 border-amber-200 text-amber-800',
        error: 'bg-red-50 border-red-200 text-red-800'
    };
    caja.className = `mt-1.5 text-xs px-2.5 py-2 rounded-lg border ${estilos[tipo] || estilos.buscando}`;
    caja.innerHTML = html;
}

// Permite volver a buscar el mismo numero tras un fallo (si no, el guard de
// "no repetir la consulta" impediria el reintento).
function _ultimoTelefonoBuscado_reintentable() {
    _ultimoTelefonoBuscadoTrab = null;
}

function _limpiarEstadoClienteTrab() {
    const caja = document.getElementById('trab-estado-cliente');
    if (caja) { caja.className = 'hidden'; caja.innerHTML = ''; }
    _ultimoTelefonoBuscadoTrab = null;
}

async function buscarClienteTrabajador() {
    // Editando, el teléfono no se puede cambiar (es la clave que une el pedido
    // con su cliente), así que tampoco hay nada que buscar: la consulta solo
    // serviría para pisar el nombre o la dirección que el cajero acaba de corregir.
    if (pedidoEnEdicion) return;

    const inputTel = document.getElementById('trab-telefono');
    const telefono = normalizarTelefono(inputTel.value);

    if (!telefono) { _limpiarEstadoClienteTrab(); return; }

    // Dejamos a la vista el número ya normalizado, que es el que se guardará.
    inputTel.value = telefono;

    // El onblur salta cada vez que sale del campo: no repetimos la consulta si
    // el número no cambió desde la última búsqueda.
    if (telefono === _ultimoTelefonoBuscadoTrab) return;
    _ultimoTelefonoBuscadoTrab = telefono;

    _estadoClienteTrab('buscando', '<i class="fa-solid fa-spinner fa-spin"></i> Buscando cliente...');

    try {
        const res = await fetch(`${URL_BUSCAR_CLIENTES_TRAB}?q=${encodeURIComponent(telefono)}`, { headers: authHeaders() });

        // Un 401 no es "no encontre al cliente": es que la sesion del trabajador
        // vencio. Decirlo claro evita pensar que el cliente no esta registrado.
        // No cerramos sesion solos porque se perderia el pedido a medio armar.
        if (sesionCaducada(res)) {
            _ultimoTelefonoBuscado_reintentable();
            _estadoClienteTrab('error',
                '<i class="fa-solid fa-lock"></i> <b>Tu sesión venció.</b> No se puede buscar al cliente. ' +
                'Termina este pedido a mano o <a href="cocina.html" class="underline font-bold">inicia sesión otra vez</a> ' +
                '(perderías lo que llevas en el carrito).');
            return;
        }

        if (!res.ok) throw new Error('Respuesta ' + res.status);

        const resultados = await res.json();
        // `buscar` hace LIKE, así que exigimos la coincidencia exacta del teléfono.
        const cliente = (Array.isArray(resultados) ? resultados : []).find(c => c.telefono === telefono);

        if (!cliente) {
            _estadoClienteTrab('nuevo',
                '<i class="fa-solid fa-user-plus"></i> <b>Cliente nuevo.</b> Este número no está registrado — pídele los datos y llénalos abajo.');
            return;
        }

        document.getElementById('trab-cliente').value = cliente.nombre || '';

        const inputDireccion = document.getElementById('trab-direccion');
        let notaDireccion = '';
        if (cliente.direccion_principal && !inputDireccion.value.trim()) {
            inputDireccion.value = cliente.direccion_principal;
            notaDireccion = ' Se cargó su dirección guardada.';
        }

        const detalles = [];
        if (cliente.cedula) detalles.push(escapeHtml(cliente.cedula));
        if (cliente.total_pedidos) detalles.push(`${cliente.total_pedidos} pedido${cliente.total_pedidos === 1 ? '' : 's'}`);

        _estadoClienteTrab('encontrado',
            `<i class="fa-solid fa-user-check"></i> <b>${escapeHtml(cliente.nombre || 'Cliente')}</b>` +
            (detalles.length ? ` <span class="opacity-70">· ${detalles.join(' · ')}</span>` : '') +
            notaDireccion);

    } catch (e) {
        console.error('Error buscando cliente:', e);
        // No bloqueamos el pedido: el trabajador puede llenar los datos a mano.
        _ultimoTelefonoBuscadoTrab = null; // permitimos reintentar
        _estadoClienteTrab('error',
            '<i class="fa-solid fa-triangle-exclamation"></i> No se pudo consultar la base de datos. Llena los datos a mano y continúa.');
    }
}


// --- Renglón escrito a mano (solo admin) -------------------------------------

function agregarLineaManual() {
    if (!esAdminTrabajador()) return; // el bloque está oculto, pero por si acaso

    const inputNombre = document.getElementById('manual-nombre');
    const inputPrecio = document.getElementById('manual-precio');
    const inputCantidad = document.getElementById('manual-cantidad');

    const nombre = inputNombre.value.trim();
    const precio = parseFloat(inputPrecio.value);
    const cantidad = parseInt(inputCantidad.value) || 1;

    if (!nombre) { alert('Escribe qué se está cobrando.'); inputNombre.focus(); return; }
    if (isNaN(precio) || precio < 0) { alert('Escribe un precio válido.'); inputPrecio.focus(); return; }

    // El resumen del carrito mete el nombre dentro de un onclick con comillas
    // simples, así que un apóstrofo dejaría los botones de +/- sin funcionar.
    // Cambiamos el apóstrofo por el tipográfico (se lee igual) y quitamos lo demás.
    const nombreLimpio = nombre.replace(/'/g, '’').replace(/["<>\\]/g, '').trim();
    if (!nombreLimpio) { alert('Escribe un nombre válido.'); inputNombre.focus(); return; }

    // El backend parte el id por "_" y espera un número en el segundo trozo; con
    // "custom_0_..." lee 0, no encuentra producto y respeta el precio que mandamos
    // (que es justo lo que queremos en una línea escrita a mano).
    contadorLineaManual++;
    const id = `custom_0_${contadorLineaManual}`;

    cart[id] = { id: id, name: nombreLimpio, price: precio, qty: cantidad, note: '' };

    inputNombre.value = '';
    inputPrecio.value = '';
    inputCantidad.value = 1;

    calculateTotals();
    renderizarResumenCarrito();
    inputNombre.focus();
}


// --- Envío del pedido --------------------------------------------------------

async function enviarPedidoTrabajador(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();

    // El mismo formulario sirve para tomar un pedido nuevo y para editar uno que
    // ya está en el tablero; lo único que cambia es a dónde va.
    if (pedidoEnEdicion) return guardarEdicionDePedido();

    // Si quedaron combos elegidos pero sin personalizar, no se puede enviar: la
    // cocina recibiría un combo sin saber qué piezas lleva. Va antes que el aviso
    // de carrito vacío porque un pedido con solo pendientes no está vacío.
    const idsPendientes = idsCombosPendientes();
    if (idsPendientes.length > 0) {
        abrirModalCombosPendientes(idsPendientes);
        return;
    }

    const articulos = Object.values(cart);
    if (articulos.length === 0) {
        alert('El pedido está vacío. Agrega al menos un plato.');
        goToStep(1);
        return;
    }

    const nombreCliente = document.getElementById('trab-cliente').value.trim();
    if (!nombreCliente) {
        alert('Falta el nombre del cliente.');
        document.getElementById('trab-cliente').focus();
        return;
    }

    const tipoEntrega = document.getElementById('trab-entrega').value;
    const direccion = direccionDelPedido();
    if (tipoEntrega === 'Mesa' && !direccion) {
        alert('Elige la mesa del pedido.');
        document.getElementById('trab-mesa').focus();
        return;
    }
    const telefono = normalizarTelefono(document.getElementById('trab-telefono').value) || 'No registrado';
    const operador = usuarioActivoTrabajador
        ? `${usuarioActivoTrabajador.nombre} (${usuarioActivoTrabajador.rol})`
        : 'No registrado';

    const payload = {
        timestamp: new Date().toISOString(),
        cliente: nombreCliente,
        telefono: telefono,
        tipo_entrega: tipoEntrega,
        direccion: direccion || 'Retiro por local',
        metodo_pago: document.getElementById('trab-pago').value,
        articulos: articulos,
        sucursal_id: SUCURSAL_ACTUAL ? SUCURSAL_ACTUAL.id : undefined,
        estado_inicial: tipoEntrega === 'Delivery' ? 'Calculando Delivery' : 'Pago Pendiente',
        pedido_detallado: "Generado por Backend", // el backend arma el texto real
        metadata_titular: `Pedido registrado en caja por ${operador}`
    };

    const btn = document.getElementById('btn-enviar-pedido');
    const htmlOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';

    try {
        // authHeaders() manda el token del personal: es lo que hace que el backend
        // permita registrar el pedido aunque el local esté cerrado.
        const res = await fetch(URL_CREAR_PEDIDO_TRAB, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            goToStep(4);
        } else {
            alert(await motivoDelRechazo(res, 'El servidor rechazó el pedido. Revisa los datos e intenta de nuevo.'));
        }
    } catch (e) {
        console.error('Error de conexión:', e);
        alert('Fallo de conexión al enviar el pedido. Revisa el internet e intenta de nuevo.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = htmlOriginal;
    }
}

function reiniciarPedidoTrabajador() {
    cart = {};
    pendientesPersonalizarCombo = {};

    document.getElementById('order-form').reset();
    _limpiarEstadoClienteTrab();
    limpiarBusqueda(false);

    const contenedorPaso2 = document.getElementById('items-container');
    if (contenedorPaso2) contenedorPaso2.innerHTML = '';

    calculateTotals();
    renderizarCategorias();
    goToStep(1);
}



// --- Modo edición: un pedido que ya existe -----------------------------------
//
// El tablero ya no trae su propio mini-menú para editar. Su lápiz manda aquí con
// ?editar=<id>, y esta pantalla —que es la que sabe armar combos— se encarga del
// resto. Al guardar, el backend rehace el texto y el total con la misma cuenta
// que usa al crear un pedido.

function limpiarPedidoEnEdicionGuardado() {
    try { localStorage.removeItem(CLAVE_PEDIDO_EN_EDICION); } catch (e) { /* modo incógnito */ }
}

// El tablero deja el pedido en localStorage antes de navegar. Si el cajero
// recarga la página ese apunte puede haberse perdido, así que hay respaldo:
// se lo pedimos al servidor.
async function recuperarPedidoAEditar(idPedido) {
    try {
        const guardado = JSON.parse(localStorage.getItem(CLAVE_PEDIDO_EN_EDICION) || 'null');
        if (guardado && String(guardado.id) === String(idPedido)) return guardado;
    } catch (e) { /* apunte ilegible: lo pedimos al servidor */ }

    try {
        const res = await fetch(API_BASE + '/api/pedidos/?t=' + Date.now(), { headers: authHeaders() });
        if (!res.ok) return null;
        const pedidos = await res.json();
        const encontrado = (Array.isArray(pedidos) ? pedidos : [])
            .find(p => String(p.id_pedido || p.id) === String(idPedido));
        if (!encontrado) return null;
        return {
            id: encontrado.id_pedido || encontrado.id,
            id_visual: '',
            cliente: encontrado.cliente || '',
            telefono: encontrado.telefono || '',
            direccion: encontrado.direccion || '',
            tipo_entrega: encontrado.tipo_entrega || '',
            metodo_pago: encontrado.metodo_pago || '',
            pedido_detallado: encontrado.pedido_detallado || ''
        };
    } catch (e) {
        console.error('No se pudo recuperar el pedido a editar:', e);
        return null;
    }
}

async function entrarEnModoEdicion(idPedido) {
    const pedido = await recuperarPedidoAEditar(idPedido);
    if (!pedido) {
        alert('No se encontró el pedido que querías editar. Vuelve al tablero e inténtalo de nuevo.');
        window.location.replace('cocina.html');
        return;
    }

    pedidoEnEdicion = pedido;

    precargarCarritoDesdePedido(pedido.pedido_detallado);
    rellenarFormularioDeEdicion(pedido);
    pintarPantallaDeEdicion(pedido);

    calculateTotals();
    // Se entra por el carrito: el cajero ya sabe lo que el cliente pidió, lo que
    // viene a hacer es cambiarlo. prepareCheckout pinta el resumen y salta al paso 3.
    prepareCheckout();
}

// Busca un plato del menú por su nombre exacto. menuData incluye los que no se
// venden sueltos (piezas de combos) y los agotados, y aquí eso es lo correcto:
// el pedido ya se hizo, solo estamos recuperando de qué plato hablaba.
function buscarItemPorNombreExacto(nombre) {
    const buscado = String(nombre || '').trim().toLowerCase();
    for (const catKey in menuData) {
        const items = (menuData[catKey] && menuData[catKey].items) || [];
        const encontrado = items.find(i => String(i.name || '').trim().toLowerCase() === buscado);
        if (encontrado) return encontrado;
    }
    return null;
}

// Un combo ya personalizado se guardó como "Combo Dúo (Rolls: 2x California)":
// su nombre exacto no está en el menú. Lo buscamos por lo que va antes del
// paréntesis y SOLO para recuperar su id, que es lo que le dice al backend
// cuántas bandejas ocupa. El texto y el precio de la línea no se tocan.
function buscarItemPorNombreBase(nombre) {
    const completo = String(nombre || '').trim().toLowerCase();
    let mejor = null;
    for (const catKey in menuData) {
        const items = (menuData[catKey] && menuData[catKey].items) || [];
        items.forEach(item => {
            const base = String(item.name || '').trim().toLowerCase();
            if (!base || !completo.startsWith(base + ' (')) return;
            // Con varios nombres que encajan gana el más largo ("Combo Dúo Grande"
            // antes que "Combo Dúo").
            if (!mejor || base.length > String(mejor.name).trim().length) mejor = item;
        });
    }
    return mejor;
}

// Convierte el texto guardado del pedido en líneas de carrito. Es el mismo
// formato que arma el backend: "2x Nombre ($4.50) (Nota: sin picante)", y en su
// propio renglón la descripción del plato (que aquí se ignora).
function precargarCarritoDesdePedido(textoDetallado) {
    cart = {};
    pendientesPersonalizarCombo = {};
    contadorLineaPrecargada = 0;

    String(textoDetallado || '').split('\n').forEach(linea => {
        const match = linea.trim().match(/^(\d+)[xX]\s+(.+)$/);
        if (!match) return; // renglón de descripción, no es un artículo

        const cantidad = parseInt(match[1], 10) || 0;
        if (cantidad <= 0) return;

        let nombre = match[2].trim();

        // Primero la nota: va al final del todo, después del precio.
        let nota = '';
        const matchNota = nombre.match(/\(Nota:\s*(.+?)\)$/i);
        if (matchNota) {
            nota = matchNota[1].trim();
            nombre = nombre.replace(/\s*\(Nota:\s*.+?\)$/i, '').trim();
        }

        // Quitada la nota, el precio sí queda al final: ($12.50). Es el precio de
        // UNA unidad, salvo cuando el plato tiene precio por paquete: ahí el
        // backend escribe el total de la línea, porque el unitario ya no explica
        // la cuenta. Ese caso no molesta aquí, porque un plato del menú recupera
        // su precio del catálogo y no de este texto.
        let precioEnTexto = 0;
        const matchPrecio = nombre.match(/\(\$(\d+(?:\.\d+)?)\)$/);
        if (matchPrecio) {
            precioEnTexto = parseFloat(matchPrecio[1]) || 0;
            nombre = nombre.replace(/\s*\(\$[\d.]+\)$/, '').trim();
        }

        // El regalo de una promoción no se precarga: sincronizarPromocionesCarrito
        // lo vuelve a poner solo si el pedido editado sigue calificando, y así no
        // quedan dos regalos si el cajero quita combos.
        if (nombre.startsWith('🎁')) return;

        const itemMenu = buscarItemPorNombreExacto(nombre);
        if (itemMenu) {
            // Se guarda con el mismo id que usa la tarjeta del menú: si el cajero
            // agrega otro igual desde el buscador, se suma a esta línea en vez de
            // abrir una segunda. El precio se toma del menú, no del texto, para que
            // el precio por paquete vuelva a hacer su cuenta.
            cart[itemMenu.id] = {
                id: itemMenu.id, name: itemMenu.name, price: itemMenu.price,
                qty: cantidad, note: nota
            };
            return;
        }

        // Combo personalizado o línea escrita a mano: se conserva tal cual, con su
        // propia clave para que no choque con nada del menú.
        const base = buscarItemPorNombreBase(nombre);
        contadorLineaPrecargada++;
        const idLinea = base ? base.id : 'custom_0';
        cart[`${idLinea}_ya${contadorLineaPrecargada}`] = {
            id: idLinea,
            name: nombre,
            price: precioEnTexto,
            qty: cantidad,
            note: nota
        };
    });
}

function rellenarFormularioDeEdicion(pedido) {
    const inputTel = document.getElementById('trab-telefono');
    inputTel.value = pedido.telefono || '';
    // El teléfono es la clave con la que el pedido se une a su cliente: cambiarlo
    // aquí dejaría el historial del cliente huérfano. Se muestra, no se edita.
    inputTel.readOnly = true;
    inputTel.classList.add('bg-slate-100', 'text-slate-500', 'cursor-not-allowed');
    inputTel.title = 'El teléfono no se cambia desde aquí';

    document.getElementById('trab-cliente').value = pedido.cliente || '';
    document.getElementById('trab-direccion').value = pedido.direccion || '';

    // El tipo de entrega decide el número diario del pedido (#3 de delivery, #3 de
    // pickup) y la columna en la que vive en el tablero; cambiarlo a mitad de
    // camino lo renumeraría. Se ve, pero no se toca.
    const selEntrega = document.getElementById('trab-entrega');
    const tipoGuardado = String(pedido.tipo_entrega || '').toLowerCase();
    const entrega = tipoGuardado.includes('mesa') ? 'Mesa' : (tipoGuardado.includes('deliver') ? 'Delivery' : 'Pickup');
    selEntrega.value = entrega;
    if (entrega === 'Mesa') window.__mesaPendiente = pedido.direccion || '';
    alternarCamposEntrega();
    selEntrega.disabled = true;
    selEntrega.classList.add('opacity-60', 'cursor-not-allowed');
    selEntrega.title = 'El tipo de entrega no se cambia desde aquí';

    const selPago = document.getElementById('trab-pago');
    const pagoGuardado = String(pedido.metodo_pago || '');
    const sinAcento = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    selPago.dataset.guardado = pagoGuardado; // si la lista de métodos llega después, se respeta este
    let opcionIgual = Array.from(selPago.options).find(o => sinAcento(o.value) === sinAcento(pagoGuardado));
    if (!opcionIgual && pagoGuardado) {
        opcionIgual = document.createElement('option'); opcionIgual.value = pagoGuardado; opcionIgual.textContent = pagoGuardado;
        selPago.appendChild(opcionIgual);
    }
    if (opcionIgual) selPago.value = opcionIgual.value;
}

function pintarPantallaDeEdicion(pedido) {
    const numero = pedido.id_visual ? `#${pedido.id_visual}` : `#${pedido.id}`;

    const titulo = document.getElementById('titulo-pantalla');
    if (titulo) titulo.innerHTML = `✏️ Editando pedido <span class="text-amber-400">${escapeHtml(numero)}</span>`;
    const subtitulo = document.getElementById('subtitulo-pantalla');
    if (subtitulo) subtitulo.innerText = 'Los cambios se avisan al cliente por WhatsApp';

    const aviso = document.getElementById('aviso-modo-edicion');
    if (aviso) {
        aviso.classList.remove('hidden');
        aviso.innerHTML = `Estás editando el pedido <b>${escapeHtml(numero)}</b> de <b>${escapeHtml(pedido.cliente || 'un cliente')}</b>. Al guardar, el cliente recibe el pedido corregido por WhatsApp.`;
    }

    const btn = document.getElementById('btn-enviar-pedido');
    if (btn) {
        btn.innerHTML = 'Guardar cambios <i class="fa-solid fa-floppy-disk"></i>';
        btn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
        btn.classList.add('bg-amber-500', 'hover:bg-amber-400', 'text-slate-900');
    }
}

async function guardarEdicionDePedido() {
    // Igual que al tomar un pedido nuevo: un combo sin personalizar no puede
    // llegar a la cocina. Va antes del carrito vacío porque un pedido con solo
    // pendientes tampoco está vacío.
    const idsPendientes = idsCombosPendientes();
    if (idsPendientes.length > 0) {
        abrirModalCombosPendientes(idsPendientes);
        return;
    }

    const articulos = Object.values(cart);
    if (articulos.length === 0) {
        alert('El pedido quedaría vacío. Si quieres anularlo, hazlo desde el tablero con la papelera.');
        goToStep(1);
        return;
    }

    const nombreCliente = document.getElementById('trab-cliente').value.trim();
    if (!nombreCliente) {
        alert('Falta el nombre del cliente.');
        document.getElementById('trab-cliente').focus();
        return;
    }

    const operador = usuarioActivoTrabajador
        ? `${usuarioActivoTrabajador.nombre} (${usuarioActivoTrabajador.rol})`
        : 'No registrado';

    const payload = {
        id: pedidoEnEdicion.id,
        cliente: nombreCliente,
        direccion: direccionDelPedido(),
        metodo_pago: document.getElementById('trab-pago').value,
        procesado_por: `Editado en caja por ${operador}`,
        articulos: articulos
    };

    const btn = document.getElementById('btn-enviar-pedido');
    const htmlOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';

    try {
        const res = await fetch(URL_EDITAR_PEDIDO_TRAB, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            console.error('Respuesta del servidor:', await res.text());
            alert('El servidor rechazó los cambios. Revisa el pedido e intenta de nuevo.');
            return;
        }

        // El backend devuelve el texto y el total definitivos (los recalculó él),
        // así que el WhatsApp al cliente sale con exactamente lo que quedó guardado.
        const guardado = await res.json();
        await avisarEdicionAlCliente(payload, guardado);

        limpiarPedidoEnEdicionGuardado();
        pedidoEnEdicion = null; // para que volverAlTablero no vuelva a preguntar
        window.location.href = 'cocina.html';
    } catch (e) {
        console.error('Error guardando la edición:', e);
        alert('Fallo de conexión al guardar. Revisa el internet e intenta de nuevo.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = htmlOriginal;
    }
}

async function avisarEdicionAlCliente(payload, guardado) {
    const metodo = String(payload.metodo_pago || '').toLowerCase();
    const esPagoMovil = metodo.includes('pago') || metodo.includes('movil') || metodo.includes('móvil');

    // Al pago móvil se le agrega el equivalente en bolívares con la tasa que el
    // pedido tiene guardada desde que se creó, no con la de hoy.
    let textoBolivares = '';
    const tasa = parseFloat(guardado.tasa_bcv) || 0;
    if (esPagoMovil && tasa > 0) {
        const totalBs = (parseFloat(guardado.total_orden) || 0) * tasa;
        const formateado = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalBs);
        textoBolivares = `\nEquivalente en Bolívares: *${formateado} Bs*`;
    }

    try {
        await fetch(URL_NOTIFICAR_EDICION_TRAB, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                telefono: pedidoEnEdicion.telefono || '',
                cliente: payload.cliente,
                pedido_detallado: guardado.pedido_detallado || '',
                total_orden: parseFloat(guardado.total_orden) || 0,
                texto_bolivares: textoBolivares,
                // notificar-edicion traduce este id de base de datos al número
                // diario que el cliente conoce (#3 del día).
                id_visual: String(pedidoEnEdicion.id)
            })
        });
    } catch (e) {
        // El pedido ya quedó guardado: que falle el WhatsApp no debe deshacerlo.
        console.error('No se pudo avisar al cliente por WhatsApp:', e);
    }
}


// Escape cierra el buscador sin tener que llegar al botón de la X.
document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    const buscador = document.getElementById('buscador-menu');
    if (buscador && document.activeElement === buscador && buscador.value) {
        limpiarBusqueda();
    }
});


// =====================================================================
// MESAS: el pedido de caja también puede ser para una mesa del local
// =====================================================================
function direccionDelPedido() {
    const sel = document.getElementById('trab-entrega');
    if (sel && sel.value === 'Mesa') return document.getElementById('trab-mesa').value;
    return document.getElementById('trab-direccion').value.trim();
}

function alternarCamposEntrega() {
    const esMesa = document.getElementById('trab-entrega').value === 'Mesa';
    document.getElementById('trab-wrap-mesa').classList.toggle('hidden', !esMesa);
    document.getElementById('trab-wrap-direccion').classList.toggle('hidden', esMesa);
    if (esMesa) pintarMesasCaja();
}

let MESAS_CAJA = [];
function pintarMesasCaja() {
    const sel = document.getElementById('trab-mesa');
    if (!sel) return;
    const elegido = sel.value || window.__mesaPendiente || '';
    const porZona = {};
    MESAS_CAJA.forEach(m => { (porZona[m.zona || 'Salón'] = porZona[m.zona || 'Salón'] || []).push(m); });
    sel.innerHTML = '<option value="">Elige la mesa...</option>' + Object.keys(porZona).map(z =>
        `<optgroup label="${escapeHtml(z)}">${porZona[z].map(m => `<option value="${escapeHtml(m.nombre)}">${escapeHtml(m.nombre)} · ${m.capacidad} pers.${m.estado !== 'libre' ? ' · en uso' : ''}</option>`).join('')}</optgroup>`).join('');
    if (elegido) sel.value = elegido;
}

async function cargarMesasCaja() {
    try {
        const res = await fetch(API_BASE + '/api/mesas/?t=' + Date.now() + (SUCURSAL_ACTUAL ? '&sucursal=' + SUCURSAL_ACTUAL.id : ''), { headers: authHeaders() });
        const datos = await res.json();
        MESAS_CAJA = Array.isArray(datos) ? datos : [];
    } catch (e) { MESAS_CAJA = []; }
    pintarMesasCaja();
}

window.addEventListener('load', () => {
    const sel = document.getElementById('trab-entrega');
    if (!sel) return;
    sel.addEventListener('change', alternarCamposEntrega);
    cargarMesasCaja();
    // Viene desde el plano de mesas: ?mesa=Mesa 3 deja el pedido listo para esa mesa
    const mesa = new URLSearchParams(location.search).get('mesa');
    if (mesa && !sel.disabled) { window.__mesaPendiente = mesa; sel.value = 'Mesa'; alternarCamposEntrega(); }
});
