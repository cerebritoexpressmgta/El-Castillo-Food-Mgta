// Quitar (o devolver) el servicio en mesa de UNA mesa, como en Gelly: el
// administrador decide perdonarlo a una mesa concreta sin apagarlo para todas.
//
// No cambia cómo se calcula el servicio (eso es de worker/rutas.mjs: cada
// pedido de mesa lo suma al crearse, con el porcentaje del panel). Aquí solo:
//   - se marca la mesa (m.servicio_quitado) mientras dure esa ocupación, para
//     que los pedidos nuevos de esa mesa no lo sumen (rutas.mjs pregunta a
//     servicioQuitado(mesa) antes de sumarlo);
//   - a los pedidos que ya tiene se les quita la línea y el monto, y quedan
//     igual que un pedido que nunca lo llevó (servicio_mesa.pct = 0, así
//     /api/pedidos/editar tampoco lo vuelve a sumar). Se guarda qué porcentaje
//     tenían para poder devolverlo.
// Al liberar la mesa la marca deja de valer sola: se compara con ocupada_desde.

const LINEA_SERVICIO = /\n?1x Servicio en mesa \([^)]*%\) \(\$[\d.,]+\)/;

const redondear = (n) => Math.round(n * 100) / 100;

/** ¿Esta mesa tiene el servicio quitado en su ocupación actual? */
export function servicioQuitado(mesa) {
    return !!(mesa && mesa.estado !== 'libre' && mesa.servicio_quitado && mesa.servicio_quitado.desde === mesa.ocupada_desde);
}

export function quitarServicioDelPedido(p, quien, cuando) {
    const s = p.servicio_mesa;
    if (!s || !(s.pct > 0)) return false;
    p.total_orden = redondear((p.total_orden || 0) - (s.monto || 0));
    p.pedido_detallado = String(p.pedido_detallado || '').replace(LINEA_SERVICIO, '');
    p.servicio_mesa = { pct: 0, monto: 0, quitado: { pct: s.pct, por: quien, en: cuando } };
    return true;
}

/**
 * Le devuelve el servicio a un pedido: con el porcentaje que tenía si se le
 * quitó, o con `pctNuevo` si se creó mientras el servicio estaba quitado (y por
 * eso nunca lo sumó).
 */
export function devolverServicioAlPedido(p, pctNuevo = 0) {
    const q = p.servicio_mesa && p.servicio_mesa.quitado;
    const yaLoTiene = p.servicio_mesa && p.servicio_mesa.pct > 0;
    const pct = q && q.pct > 0 ? q.pct : (!yaLoTiene ? pctNuevo : 0);
    if (!(pct > 0)) return false;
    // Se calcula sobre lo que el pedido vale hoy (pudo editarse mientras tanto),
    // con la misma cuenta que rutas.mjs.
    const monto = Math.round((p.total_orden || 0) * pct) / 100;
    p.total_orden = redondear((p.total_orden || 0) + monto);
    p.pedido_detallado = String(p.pedido_detallado || '') + `\n1x Servicio en mesa (${pct}%) ($${monto.toFixed(2)})`;
    p.servicio_mesa = { pct, monto };
    return true;
}

export function registrarServicioPorMesa(h) {
    const { ruta, HttpError, requiereAdmin, sucursalDelPersonal, mesaEnSucursal, pedidosDeMesa, configServicioMesa, ahoraCaracas, emitirTablero } = h;

    // { id, quitar: true } quita el servicio de la mesa; { id, quitar: false } lo devuelve.
    ruta('POST', '/api/mesas/servicio', (ctx, db) => {
        const admin = requiereAdmin(ctx); const d = ctx.body || {};
        const m = db.mesas.find(x => x.id === Number(d.id));
        if (!m) throw new HttpError(404, 'Mesa no encontrada');
        if (!mesaEnSucursal(m, sucursalDelPersonal(ctx, db))) throw new HttpError(403, 'Esa mesa es de otra sucursal.');
        if (m.estado === 'libre') throw new HttpError(400, 'La mesa está libre: no tiene cuenta abierta.');
        const quien = String(admin.sub || 'admin'), cuando = ahoraCaracas();
        const pedidos = pedidosDeMesa(db, m);
        let cambiados = 0;
        if (d.quitar !== false) {
            // Si ya estaba quitado (otra pantalla sin actualizar), se conserva desde cuándo:
            // es lo que decide qué pedidos lo recuperan al devolverlo.
            if (!servicioQuitado(m)) m.servicio_quitado = { desde: m.ocupada_desde, por: quien, en: cuando };
            pedidos.forEach(p => { if (quitarServicioDelPedido(p, quien, cuando)) cambiados++; });
        } else {
            // Los pedidos hechos mientras estaba quitado nunca lo sumaron: reciben el
            // porcentaje de hoy del panel (si el servicio sigue activo).
            const quitadoEn = servicioQuitado(m) ? m.servicio_quitado.en : null;
            const cfg = configServicioMesa(db);
            const pctHoy = cfg.activo && cfg.porcentaje > 0 ? cfg.porcentaje : 0;
            delete m.servicio_quitado;
            pedidos.forEach(p => {
                const hechoSinServicio = quitadoEn && String(p.timestamp || '') >= quitadoEn;
                if (devolverServicioAlPedido(p, hechoSinServicio ? pctHoy : 0)) cambiados++;
            });
        }
        ctx.tras.push(() => emitirTablero('mesas', m.sucursal_id || null));
        return { success: true, servicio_quitado: servicioQuitado(m), pedidos_cambiados: cambiados };
    });
}
