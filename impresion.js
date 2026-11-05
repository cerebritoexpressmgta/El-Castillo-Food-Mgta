// =============================================================================
// IMPRESIÓN DE COMANDAS EN LA IMPRESORA TÉRMICA  (tablero de cocina)
//
// Quién imprime y por qué: el backend vive en la nube (Railway) y la impresora
// está enchufada por USB a la computadora del local, así que el servidor no
// puede alcanzarla. Quien sí la alcanza es el navegador que tiene abierto el
// tablero, y desde ahí se manda a imprimir como cualquier página.
//
// La comanda se arma dentro de un <iframe> invisible con su propio documento,
// no en la página del tablero. Es a propósito: así el CSS del tablero (Tailwind,
// los modales, los colores oscuros) no se mete en el papel, y no hace falta
// esconder media pantalla con reglas @media print.
//
// Para que salga SIN preguntar nada hay que abrir Chrome con --kiosk-printing
// (ver el README de la impresora). Sin esa bandera funciona igual, pero el
// cajero tiene que darle "Imprimir" en el cuadro que abre el navegador.
// =============================================================================

// Ancho del rollo de papel, en milímetros. 80 es el estándar de cocina; las
// impresoras chiquitas y las portátiles suelen ser de 58. Si el texto sale
// cortado o muy angosto, este es el único número que hay que cambiar.
const ANCHO_TICKET_MM = 80;

// Imprimir solo, sin que nadie lo pida, cuando un pedido pasa a cocina.
// En false queda únicamente el botón 🖨️ de cada tarjeta.
const IMPRIMIR_AL_PASAR_A_COCINA = true;

// Nombre que va arriba del papel.
const NOMBRE_LOCAL_TICKET = String((window.MARCA && window.MARCA.nombre) || 'RESTAURANTE').toUpperCase();


// --- Lectura del pedido ------------------------------------------------------

// `pedido_detallado` es un bloque de texto: un renglón por artículo con la forma
// "2x Nombre ($8.20) (Nota: sin picante)", y debajo, en su propio renglón, la
// descripción del plato. En el papel la descripción sobra —la cocina sabe qué
// lleva un chop suey— así que se ignoran los renglones que no empiezan por "Nx".
function lineasParaComanda(textoDetallado) {
    const lineas = [];

    String(textoDetallado || '').split('\n').forEach(linea => {
        const match = linea.trim().match(/^(\d+)[xX]\s+(.+)$/);
        if (!match) return;

        let nombre = match[2].trim();
        let nota = '';

        // La nota va al final del todo, después del precio.
        const matchNota = nombre.match(/\(Nota:\s*(.+?)\)$/i);
        if (matchNota) {
            nota = matchNota[1].trim();
            nombre = nombre.replace(/\s*\(Nota:\s*.+?\)$/i, '').trim();
        }

        nombre = nombre.replace(/\s*\(\$[\d.]+\)$/, '').trim();

        // Un combo personalizado viene como "Combo Dúo (Rolls: 2x California)".
        // Se parte en dos para que el papel muestre el nombre grande y debajo,
        // en su propio renglón, lo que de verdad hay que preparar.
        let detalle = '';
        const abre = nombre.indexOf(' (');
        if (abre > 0 && nombre.endsWith(')')) {
            detalle = nombre.slice(abre + 2, -1).trim();
            nombre = nombre.slice(0, abre).trim();
        }

        lineas.push({ cantidad: parseInt(match[1], 10) || 1, nombre, detalle, nota });
    });

    return lineas;
}

// Fecha y hora del pedido tal como se guardaron. Si el timestamp viene raro, se
// cae a la hora de ahora: un papel sin hora es peor que uno con la hora del
// momento en que se imprimió.
function fechaHoraDeComanda(pedido) {
    const crudo = pedido.timestamp || pedido['Timestamp'] || '';
    const fecha = new Date(crudo);
    const valida = crudo && !isNaN(fecha.getTime()) ? fecha : new Date();

    return valida.toLocaleString('es-VE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
    });
}


// --- Armado del papel --------------------------------------------------------

function construirHtmlComanda(datos) {
    const anchoUtil = ANCHO_TICKET_MM - 6; // 3mm de margen a cada lado
    const esMesa = /mesa/i.test(String(datos.tipoEntrega || ''));
    const esPickup = esMesa || String(datos.tipoEntrega || '').toLowerCase().match(/pickup|retiro/);
    const tipo = esMesa ? 'MESA' : (esPickup ? 'PICKUP' : 'DELIVERY');

    const filas = datos.articulos.map(item => `
        <div class="art">
            <div class="art-linea">
                <span class="cant">${item.cantidad}</span>
                <span class="nom">${escapeHtml(item.nombre)}</span>
            </div>
            ${item.detalle ? `<div class="detalle">${escapeHtml(item.detalle)}</div>` : ''}
            ${item.nota ? `<div class="nota">NOTA: ${escapeHtml(item.nota)}</div>` : ''}
        </div>`).join('');

    // Renglones de la cabecera que solo aplican a veces.
    const filaDireccion = ((!esPickup || esMesa) && datos.direccion)
        ? `<div class="dato"><b>${esMesa ? 'Mesa' : 'Dir'}:</b> ${escapeHtml(datos.direccion)}</div>` : '';
    const filaTiempo = datos.tiempoEstimado
        ? `<div class="dato tiempo"><b>Listo en:</b> ${escapeHtml(datos.tiempoEstimado)}</div>` : '';
    const filaTelefono = datos.telefono
        ? `<div class="dato"><b>Tel:</b> ${escapeHtml(datos.telefono)}</div>` : '';

    return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Comanda ${escapeHtml(String(datos.idVisual))}</title>
<style>
    @page { size: ${ANCHO_TICKET_MM}mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body {
        width: ${anchoUtil}mm;
        margin: 0; padding: 3mm 0 8mm 0;
        font-family: "Consolas", "Courier New", monospace;
        font-size: 12px; line-height: 1.35;
        color: #000; background: #fff;
        -webkit-print-color-adjust: exact;
    }
    .local { text-align: center; font-size: 13px; font-weight: bold; letter-spacing: 1px; }
    .numero {
        text-align: center; font-size: 30px; font-weight: bold;
        line-height: 1.1; margin: 2mm 0 1mm 0;
    }
    .tipo { text-align: center; font-size: 15px; font-weight: bold; letter-spacing: 2px; }
    .regla { border-top: 1px dashed #000; margin: 2mm 0; }
    .regla-gruesa { border-top: 2px solid #000; margin: 2mm 0; }
    .dato { font-size: 12px; word-break: break-word; }
    .tiempo { font-size: 13px; font-weight: bold; margin-top: 1mm; }
    .art { margin-bottom: 2.5mm; }
    .art-linea { display: flex; gap: 2mm; align-items: baseline; }
    .cant {
        font-size: 17px; font-weight: bold; min-width: 7mm;
        border: 1.5px solid #000; text-align: center; line-height: 1.2;
    }
    .nom { font-size: 14px; font-weight: bold; text-transform: uppercase; word-break: break-word; }
    .detalle { font-size: 12px; margin-left: 9mm; word-break: break-word; }
    .nota {
        font-size: 12px; font-weight: bold; margin-left: 9mm; margin-top: 0.5mm;
        border: 1px solid #000; padding: 0.5mm 1mm; display: inline-block;
    }
    .pie { font-size: 11px; }
    .pie .total { font-size: 14px; font-weight: bold; }
    .fila { display: flex; justify-content: space-between; gap: 2mm; }
</style></head>
<body>
    <div class="local">${escapeHtml(NOMBRE_LOCAL_TICKET)}</div>
    <div class="numero">#${escapeHtml(String(datos.idVisual))}</div>
    <div class="tipo">${tipo}</div>
    <div class="regla"></div>

    <div class="dato">${escapeHtml(datos.fechaHora)}</div>
    <div class="dato"><b>Cliente:</b> ${escapeHtml(datos.cliente || 'Sin nombre')}</div>
    ${filaTelefono}
    ${filaDireccion}
    ${filaTiempo}

    <div class="regla-gruesa"></div>
    ${filas || '<div class="dato">(El pedido no trae artículos)</div>'}
    <div class="regla-gruesa"></div>

    <div class="pie">
        <div class="fila"><span><b>Pago:</b> ${escapeHtml(datos.metodoPago || '-')}</span>
                          <span class="total">$${datos.total.toFixed(2)}</span></div>
        ${datos.pagaCon ? `<div>Paga con: ${escapeHtml(datos.pagaCon)}</div>` : ''}
        ${datos.operador ? `<div>Atendió: ${escapeHtml(datos.operador)}</div>` : ''}
    </div>
</body></html>`;
}


// --- Envío al papel ----------------------------------------------------------

// Se imprime desde un iframe con su propio documento. El iframe se borra después
// de un rato y no de inmediato: si se quita mientras el navegador todavía está
// armando el trabajo de impresión, el papel sale en blanco.
function mandarAImprimir(html) {
    const marco = document.createElement('iframe');
    marco.setAttribute('aria-hidden', 'true');
    marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';

    let yaImprimio = false;
    marco.onload = function () {
        if (yaImprimio) return;
        yaImprimio = true;
        try {
            marco.contentWindow.focus();
            marco.contentWindow.print();
        } catch (e) {
            console.error('No se pudo imprimir la comanda:', e);
        }
        setTimeout(() => marco.remove(), 3000);
    };

    marco.srcdoc = html;
    document.body.appendChild(marco);
}

// Imprime la comanda de un pedido del tablero. `extras` deja pasar datos que
// solo existen en el momento de aceptarlo (el tiempo prometido no se guarda en
// la base, así que al reimprimir ese renglón simplemente no sale).
function imprimirComandaDePedido(idReal, idVisual, extras = {}) {
    const pedido = pedidosEnMemoria.find(p => String(p.id_pedido || p['ID_Pedido'] || p.ID || 'S/ID') === String(idReal));
    if (!pedido) {
        alert('No se encontró el pedido para imprimir.');
        return;
    }

    const datos = {
        idVisual: idVisual || pedido.id_pedido || idReal,
        cliente: pedido.cliente || pedido['Cliente'] || '',
        telefono: pedido.telefono || '',
        direccion: pedido.direccion || pedido.Direccion || '',
        tipoEntrega: pedido.tipo_entrega || '',
        metodoPago: pedido.metodo_pago || pedido['Método de pago'] || pedido.Metodo_pago || '',
        pagaCon: extras.pagaCon || pedido.paga_con || '',
        total: parseFloat(pedido.total_orden || 0) || 0,
        operador: (usuarioActivo && usuarioActivo.nombre) || '',
        tiempoEstimado: extras.tiempoEstimado || '',
        fechaHora: fechaHoraDeComanda(pedido),
        articulos: lineasParaComanda(pedido.pedido_detallado || pedido['Pedido Detallado'] || '')
    };

    mandarAImprimir(construirHtmlComanda(datos));
}
