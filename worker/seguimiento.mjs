// Seguimiento del pedido (al estilo "rastrear mi pedido"): hitos de estado y lo que ve el cliente.
// Todo son funciones puras; rutas.mjs las usa.

// Duración de preparación en minutos a partir de la frase que ve el cliente:
//   "25 a 30 minutos" -> 30 (se promete hasta el número mayor) | "1 hora y 30 minutos" -> 90 | "40 minutos" -> 40
export function minutosDeFrase(frase) {
    const t = String(frase || '').toLowerCase();
    if (!t.trim()) return 0;
    const h = /(\d+)\s*horas?/.exec(t);
    if (h) {
        const resto = t.replace(h[0], '');
        const m = /(\d+)\s*min/.exec(resto);
        return parseInt(h[1], 10) * 60 + (m ? parseInt(m[1], 10) : 0);
    }
    const nums = (t.match(/\d+/g) || []).map(Number).filter(n => n > 0);
    return nums.length ? Math.max(...nums) : 0;
}

// Anota un hito (estado + momento) una sola vez seguida y sin repetir el mismo estado.
export function anotarHito(p, clave, ahoraMs) {
    p.historial = Array.isArray(p.historial) ? p.historial : [];
    const ult = p.historial[p.historial.length - 1];
    if (ult && ult.estado === clave) return;
    p.historial.push({ estado: clave, ms: ahoraMs });
    if (p.historial.length > 30) p.historial = p.historial.slice(-30);
}

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
function tipoDe(p) {
    const t = norm(p.tipo_entrega);
    return t.includes('mesa') ? 'mesa' : ((t.includes('pickup') || t.includes('retiro')) ? 'pickup' : 'delivery');
}
function msDe(p, clave) {
    const h = (p.historial || []).filter(x => x.estado === clave);
    return h.length ? h[h.length - 1].ms : null;
}

// Lo que ve el cliente. No incluye teléfono, dirección, precios ni datos de pago.
export function armarSeguimiento(p, numeroVisible) {
    const tipo = tipoDe(p);
    const est = norm(p.estado);
    const cancelado = est === 'cancelado';
    const calculando = est === 'calculandodelivery';
    const pagoPend = est === 'pagopendiente';
    const cocina = est === 'encocina';
    const fin = est === 'finalizado';
    const camino = fin && !!p.en_camino_ms;
    const entregado = fin && !!p.entregado_ms;

    const ms = {
        realizado: msDe(p, 'Pedido realizado') || null,
        pago: msDe(p, 'Pago Pendiente'),
        cocina: p.en_cocina_ms || msDe(p, 'En Cocina'),
        despachado: msDe(p, 'Finalizado'),
        camino: p.en_camino_ms || null,
        entregado: p.entregado_ms || null
    };

    let pasos;
    if (tipo === 'delivery') pasos = [
        { clave: 'realizado', titulo: 'Pedido realizado', ms: ms.realizado, hecho: true },
        { clave: 'pago', titulo: 'Esperando pago', ms: ms.pago, hecho: pagoPend ? false : (cocina || fin) },
        { clave: 'cocina', titulo: 'En cocina', ms: ms.cocina, hecho: fin },
        { clave: 'despachado', titulo: 'Despachado', ms: ms.despachado, hecho: camino || entregado },
        { clave: 'camino', titulo: 'En camino', ms: ms.camino, hecho: entregado },
        { clave: 'entregado', titulo: 'Entregado', ms: ms.entregado, hecho: entregado }
    ];
    else if (tipo === 'pickup') pasos = [
        { clave: 'realizado', titulo: 'Pedido realizado', ms: ms.realizado, hecho: true },
        { clave: 'pago', titulo: 'Esperando pago', ms: ms.pago, hecho: pagoPend ? false : (cocina || fin) },
        { clave: 'cocina', titulo: 'En cocina', ms: ms.cocina, hecho: fin },
        { clave: 'despachado', titulo: 'Listo para retirar', ms: ms.despachado, hecho: fin }
    ];
    else pasos = [
        { clave: 'realizado', titulo: 'Pedido realizado', ms: ms.realizado, hecho: true },
        { clave: 'cocina', titulo: 'En cocina', ms: ms.cocina, hecho: fin },
        { clave: 'despachado', titulo: 'Servido en tu mesa', ms: ms.despachado, hecho: fin }
    ];

    // Cada paso queda "hecho"; el primero que falta es el "actual" y el resto "pendiente".
    const iActual = pasos.findIndex(x => !x.hecho);
    pasos.forEach((x, i) => { x.estado = cancelado ? 'pendiente' : (x.hecho ? 'hecho' : (i === iActual ? 'actual' : 'pendiente')); });
    const claveActual = iActual === -1 ? pasos[pasos.length - 1].clave : pasos[iActual].clave;

    let mensaje;
    if (cancelado) mensaje = 'Este pedido fue cancelado. Si tienes dudas, escríbenos.';
    else if (calculando) mensaje = 'Recibimos tu pedido. Estamos calculando el costo de tu delivery y te escribiremos para el pago.';
    else if (pagoPend) mensaje = 'Estamos esperando tu pago para empezar a prepararlo. Revisa tu WhatsApp: ahí te enviamos los datos.';
    else if (cocina) mensaje = 'Tu pedido se está preparando.';
    else if (entregado) mensaje = '¡Tu pedido fue entregado! Gracias por pedir con nosotros.';
    else if (camino) mensaje = 'Tu pedido va en camino.';
    else if (fin) mensaje = tipo === 'delivery' ? 'Tu pedido ya salió de cocina y está esperando al motorizado.' : (tipo === 'pickup' ? 'Tu pedido está listo. Puedes pasar a retirarlo.' : 'Tu pedido está listo en tu mesa.');
    else mensaje = 'Recibimos tu pedido.';

    // "2x Combo (opciones) ($30.00) descripción..." -> nombre sin precio ni descripción
    const lineas = String(p.pedido_detallado || '').split('\n').map(l => /^\s*(\d+)[xX]\s+(.+)$/.exec(l)).filter(Boolean)
        .map(m => ({ cant: parseInt(m[1], 10), nombre: m[2].split(/\s\(\$/)[0].replace(/\s*\(Nota:.*$/i, '').trim() }));

    const listoMs = cocina && p.en_cocina_ms && p.tiempo_prep_min > 0 ? p.en_cocina_ms + p.tiempo_prep_min * 60000 : null;
    return {
        numero: numeroVisible, tipo, cancelado,
        cliente: String(p.cliente || '').trim().split(/\s+/)[0] || '',
        estado: cancelado ? 'cancelado' : claveActual, mensaje, pasos: pasos.map(x => ({ clave: x.clave, titulo: x.titulo, estado: x.estado, ms: x.ms || null })),
        tiempo_estimado: cocina ? (p.tiempo_estimado || '') : '', listo_ms: listoMs,
        articulos: lineas.slice(0, 20), creado_ms: ms.realizado, ahora_ms: Date.now()
    };
}
