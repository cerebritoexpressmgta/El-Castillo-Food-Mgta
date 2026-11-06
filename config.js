// =====================================================================
// Prototipo Comida Rápida - utilidades compartidas por las páginas del frontend
// =====================================================================

// =====================================================================
// Direccion del "backend"
// =====================================================================
// En este prototipo NO hay servidor: mock-api.js (cargado justo despues de este
// archivo) atiende las llamadas a "/api/..." dentro del navegador, con datos
// inventados guardados en localStorage. Por eso la base es vacia: las rutas
// quedan relativas al propio sitio y el interceptor las responde.
//
// Para volver a un backend real, poner aqui su URL (sin barra final) y quitar
// la linea <script src="mock-api.js"> de las paginas.
const API_BASE = "";

// =====================================================================
// Interruptor: gestion de motorizados propios (registro + nomina)
// =====================================================================
// Este restaurante no lleva motorizados en planilla, asi que la funcion
// queda apagada: se ocultan la pestana "Motorizados" del panel admin, el
// boton de "Pagar a repartidor" del tablero y el widget "Nomina de
// Repartidores" de estadisticas.
//
// El codigo sigue completo y sin tocar. Poner esto en true lo devuelve
// todo tal como estaba, sin editar nada mas: sirve para reactivarlo aqui
// o para otro cliente que reutilice esta base.
//
// OJO: esto NO apaga el aviso al grupo de WhatsApp ni el precio del
// delivery. Esas dos cosas se siguen usando todos los dias.
const FUNCION_MOTORIZADOS = false;

// Zelle no se le ofrece a los clientes desde hace rato (la opcion ya no esta
// en el menu), asi que su plantilla de WhatsApp tampoco tiene por que ocupar
// espacio en el panel. Esto SOLO esconde ese recuadro: la fila cobro_zelle
// sigue en la base de datos, el textarea sigue en el HTML cargando y
// guardando su texto tal cual, y el backend sigue sabiendo mandarla. Los
// pedidos viejos pagados por Zelle se siguen leyendo igual.
// Ponerlo en true lo devuelve a la vista, aqui o para otro cliente.
const PLANTILLA_ZELLE = false;

// Oculta un elemento por selector, si existe. Usado para apagar la UI de
// motorizados sin borrar el HTML.
function ocultarSiExiste(selector) {
    const el = document.querySelector(selector);
    if (el) el.style.display = 'none';
}

// Headers de autenticación para llamadas de staff logueado (cocina.html, admin.html, estadisticas.html)
function authHeaders() {
    const token = localStorage.getItem('tokioAuthToken');
    return token
        ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        : { 'Content-Type': 'application/json' };
}

// El token del personal dura 12 horas, pero las pantallas daban la sesión por
// buena solo porque `usuarioActivo` seguía guardado en el navegador. Al vencer
// el token, todas las llamadas empezaban a fallar sin avisar: el tablero se veía
// vacío como si no hubiera pedidos, y el buscador de clientes decía que no podía
// consultar la base de datos. Un 401 significa siempre que la sesión ya no sirve.
//
// Ojo: solo el 401. Un 403 es "estás dentro pero esto es de administradores", y
// sacar a un cajero por eso sería un error.
function sesionCaducada(response) {
    return !!response && response.status === 401;
}

function forzarNuevoLogin(mensaje) {
    localStorage.removeItem('tokioAuthToken');
    localStorage.removeItem('usuarioActivo');
    alert(mensaje || 'Tu sesión venció. Inicia sesión de nuevo para continuar.');
    window.location.href = 'cocina.html';
}

// El backend explica por qué rechaza un pedido ("X se agotó", "espera unos
// minutos") en el campo `detail`. Se muestra ese texto cuando es legible y el
// mensaje genérico cuando no (un 500, o un error de validación que es una lista).
async function motivoDelRechazo(response, mensajeGenerico) {
    try {
        const cuerpo = await response.json();
        console.error('Respuesta del servidor:', cuerpo);
        if (cuerpo && typeof cuerpo.detail === 'string' && cuerpo.detail.trim()) return cuerpo.detail;
    } catch (e) { /* el cuerpo no era JSON */ }
    return mensajeGenerico;
}

function escapeHtml(valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// =====================================================================
// Imágenes: servirlas al tamaño en que realmente se ven
// =====================================================================
// Las imágenes viven en imgbb en su tamaño original y se pintan en cajas
// mucho más chicas: había miniaturas de categoría de 473 KB para un recuadro
// de 48 px. wsrv.nl las redimensiona y convierte a WebP al vuelo sobre la
// misma URL, así que también arregla las que ya estaban subidas, sin tener
// que resubir nada ni tocar la base de datos.
//
// Si el proxy fallara, imagenConRespaldo() vuelve a la URL original de imgbb:
// se verían pesadas como antes, pero nunca rotas.
//
// OJO: no usar esto con los comprobantes de pago. El personal necesita leer
// el número de referencia en la captura, y bajarle la resolución lo dificulta.

// Una imagen puede ser un enlace, una imagen incrustada (data:image, la que sube el
// panel en el prototipo) o un emoji. Solo las dos primeras se pintan con <img>.
function esUrlImagen(valor) {
    return /^(https?:\/\/|data:image\/)/i.test(String(valor || '').trim());
}

function urlImagen(urlOriginal, ancho) {
    const url = String(urlOriginal || '').trim();
    if (!url.startsWith('http')) return url; // data: y emojis pasan tal cual
    const sinEsquema = url.replace(/^https?:\/\//, '');
    return `https://wsrv.nl/?url=${encodeURIComponent(sinEsquema)}&w=${ancho}&output=webp&q=78`;
}

// Para el onerror de las <img> servidas por el proxy. Requiere que la etiqueta
// lleve data-original con la URL de imgbb sin transformar.
function imagenConRespaldo(img) {
    const original = img.getAttribute('data-original') || '';
    if (original && img.src !== original) {
        img.src = original; // falló el proxy: servimos el original de imgbb
        return;
    }
    // Falló también el original: cada pantalla decide cómo disimularlo
    if (img.dataset.respaldo === 'miniatura' && typeof mostrarFallbackMiniatura === 'function') {
        mostrarFallbackMiniatura(img);
        return;
    }
    img.style.visibility = 'hidden';
}

// =====================================================================
// Teléfonos: normalización
// =====================================================================
// OJO: el teléfono es la CLAVE PRIMARIA de la tabla `clientes` y es lo que
// une cada pedido con su cliente, así que el formato guardado no se puede
// cambiar para los venezolanos ya registrados.
//
// La regla es una sola y la decide el propio cliente al escribir:
//   - empieza por '+'  -> número extranjero, se guarda como +<código><número>
//   - cualquier otra cosa -> venezolano, formato legado 0XXXXXXXXXX
//
// Ese '+' es justamente la señal que usa el backend
// (services/evolution_api.py) para saber que un número ya viene en formato
// internacional y NO anteponerle el 58 de Venezuela.
//
// A propósito NO se valida la longitud ni el formato de cada país: se deja
// pasar todo. Si el cliente escribió mal su número simplemente no le llegan
// los WhatsApp, y la cajera lo corrige desde la base de datos.

// Convierte lo que el cliente escribió en el formato exacto que se guarda
// en la BD. Es idempotente: volver a pasarle su propia salida no la altera.
function normalizarTelefono(valorCrudo) {
    const texto = String(valorCrudo || '').trim();
    const digitos = texto.replace(/\D/g, '');
    if (!digitos) return '';

    // Devuelve el formato venezolano legado a partir del número nacional,
    // sin importar cuántos ceros de más traiga delante.
    const comoVenezolano = (numero) => {
        const nacional = numero.replace(/^0+/, '');
        return nacional ? '0' + nacional : '';
    };

    if (texto.startsWith('+')) {
        // +58 ES Venezuela. Hay que devolverlo al formato legado: si lo
        // guardáramos como +58... quedaría como un cliente DISTINTO del que
        // ya existe con 0412..., y perdería su historial y sus direcciones.
        if (digitos.startsWith('58')) return comoVenezolano(digitos.slice(2));
        return '+' + digitos;
    }

    // Sin '+' asumimos venezolano, aceptando las tres formas de escribirlo:
    // 04127437112, 4127437112 y 584127437112 (pegado desde WhatsApp).
    if (digitos.startsWith('58') && digitos.length >= 12) return comoVenezolano(digitos.slice(2));
    return comoVenezolano(digitos);
}

// Lee un input de teléfono y devuelve el número ya normalizado.
function leerTelefonoDeFormulario(idInput) {
    const input = document.getElementById(idInput);
    return input ? normalizarTelefono(input.value) : '';
}

// Arma el HTML del modal de detalle de pedido (usado en app.js y estadisticas.js)
// escapando todo dato que pueda venir de un cliente (nombre, dirección, notas, etc.)
// antes de inyectarlo en el DOM.
function construirHtmlModalPedido({ cliente, tel, cedula, operador, entrega, dir, arts, pago, ref, monto, tasaHistorica, imagenPago }) {
    const pagoLower = String(pago || '').toLowerCase();

    let seccionVES = '';
    if (pagoLower.includes('pago') || pagoLower.includes('movil')) {
        const totalBsFormateado = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(monto * tasaHistorica);
        seccionVES = `<div class="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg mt-2 text-amber-300 text-xs text-center font-bold">Total en Bolívares: Bs. ${totalBsFormateado} (Tasa: ${tasaHistorica.toFixed(2)} Bs/$)</div>`;
    }

    const refHtml = ref ? `<p class="text-xs text-amber-400 mt-1 font-mono bg-slate-900 border border-slate-700 px-2 py-1 rounded inline-block">Ref: ${escapeHtml(ref)}</p>` : '';

    const cedulaHtml = cedula ? `<p class="text-xs text-slate-400 mt-0.5"><i class="fa-solid fa-id-card"></i> ${escapeHtml(cedula)}</p>` : '';

    let btnImg = '';
    const imagenSegura = String(imagenPago || '').trim();
    if (esUrlImagen(imagenSegura)) {
        const imagenEscapada = escapeHtml(imagenSegura);
        btnImg = `
            <div class="mt-4 pt-4 border-t border-slate-700/50 flex flex-col items-center justify-center w-full">
                <span class="text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-2">Comprobante Adjunto</span>
                <a href="${imagenEscapada}" target="_blank" class="block border border-slate-600 rounded-lg overflow-hidden hover:border-emerald-500 transition shadow-lg max-w-[220px] w-full">
                    <img src="${imagenEscapada}" class="w-full h-auto object-contain rounded-lg bg-slate-900" alt="Comprobante de Pago" onerror="this.style.display='none'">
                </a>
                <span class="text-[10px] text-slate-500 mt-1 italic"><i class="fa-solid fa-magnifying-glass-plus"></i> Clic en la imagen para ampliar</span>
            </div>
        `;
    }

    return `<div class="space-y-3.5"><div class="flex justify-between"><div><span class="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Cliente</span><p class="font-bold text-white text-base">${escapeHtml(cliente)}</p><p class="text-xs text-slate-400 mt-0.5"><i class="fa-solid fa-phone"></i> ${escapeHtml(tel)}</p>${cedulaHtml}</div><div class="text-right"><span class="text-[10px] uppercase text-slate-400 font-bold tracking-wider block">Comandado por</span><p class="text-xs text-white bg-slate-900 border border-slate-700 px-2 py-1 rounded mt-1 font-semibold">${escapeHtml(operador)}</p></div></div><div class="border-t border-slate-700/50 pt-2.5"><span class="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Método de Distribución</span><p class="text-white text-xs mt-0.5 font-medium">${escapeHtml(entrega)}</p><p class="text-xs text-slate-400 mt-1 bg-slate-900/40 p-2 rounded border border-slate-700/30 italic">${escapeHtml(dir)}</p></div><div class="border-t border-slate-700/50 pt-2.5"><span class="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Productos</span><div class="text-xs bg-slate-900/40 p-2.5 rounded border border-slate-700/30 whitespace-pre-line max-h-32 overflow-y-auto text-slate-300 font-mono">${escapeHtml(arts)}</div></div><div class="border-t border-slate-700/50 pt-2.5 flex justify-between items-center"><div><span class="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Forma de Pago</span><p class="text-white text-xs font-semibold">${escapeHtml(pago)}</p>${refHtml}</div><div class="text-right"><span class="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Total</span><p class="text-emerald-400 font-bold text-lg">$${monto.toFixed(2)}</p></div></div>${seccionVES}${btnImg}</div>`;
}
