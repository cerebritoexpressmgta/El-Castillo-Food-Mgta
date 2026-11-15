// El precio del delivery que pone el personal al cotizar un pedido.
//
// Antes, /api/pedidos/actualizar-estado copiaba tal cual el `total_orden` y el
// `pedido_detallado` que mandaba el navegador: cualquier empleado con sesión
// (un cajero) podía dejar un pedido con el total que quisiera, por ejemplo sin
// el servicio en mesa, sin que quedara rastro. Ahora esos dos campos solo los
// escribe el servidor: lo único que el tablero puede cambiar del dinero de un
// pedido es el precio del delivery, y la línea y la suma las hace esta función,
// con el mismo formato que usaba el tablero (app.js: cotizarDelivery) y que usa
// la creación de pedidos con delivery automático.

// Una línea entera (no un texto parecido dentro de la nota de un cliente).
const LINEA_DELIVERY = /\n1x Servicio de Delivery \(\$[\d.,]+\)(?=\n|$)/;
const PRECIO_MAXIMO = 10000;

const redondear = (n) => Math.round(n * 100) / 100;

/** Interpreta lo que mandó el tablero ("2", "2,5", 3). null si no es un precio válido. */
export function leerPrecioDelivery(valor) {
    if (valor === null || valor === undefined || valor === '') return null;
    const n = Number(String(valor).trim().replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > PRECIO_MAXIMO) return null;
    return redondear(n);
}

/**
 * Pone (o cambia) el precio del delivery de un pedido: deja una sola línea
 * "1x Servicio de Delivery ($X)" en el detalle y ajusta el total en lo que
 * cambió. Si el pedido ya tenía delivery, se cambia el precio viejo por el nuevo.
 */
export function aplicarPrecioDelivery(p, precio) {
    let texto = String(p.pedido_detallado || '');
    let total = Number(p.total_orden) || 0;
    if (LINEA_DELIVERY.test(texto)) {
        total -= Number(p.precio_delivery) || 0;
        texto = texto.replace(LINEA_DELIVERY, '');
    }
    p.pedido_detallado = texto + `\n1x Servicio de Delivery ($${precio})`;
    p.total_orden = redondear(total + precio);
    p.precio_delivery = precio;
}

/**
 * Las líneas de un pedido guardado, nombre -> precio que muestran
 * ("2x Algo ($3.50)" -> "Algo" -> 3.5). Sirve para que, al editar un pedido,
 * un cajero pueda conservar una línea fuera de carta que ya estaba (la puso un
 * administrador, o es un plato que se borró de la carta) sin poder inventar otras.
 */
export function lineasConPrecio(texto) {
    const lineas = new Map();
    for (const linea of String(texto || '').split('\n')) {
        const m = /^\d+x (.*) \(\$(\d+(?:\.\d+)?)\)(?: \(Nota: .*\))?$/.exec(linea.trim());
        if (m) lineas.set(m[1], Number(m[2]));
    }
    return lineas;
}
