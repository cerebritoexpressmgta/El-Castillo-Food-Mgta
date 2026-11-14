// Tarifas de delivery por distancia (en moto). Funciones puras: sin base de datos, fáciles de probar.
// La distancia es la línea recta entre la sucursal y el cliente multiplicada por un "factor de ruta"
// (las calles nunca son rectas; 1.3 es un valor razonable para ciudad). El dueño lo puede ajustar.

export const DELIVERY_DEFECTO = {
    modo: 'automatico',          // 'automatico' (precio por tabla) | 'manual' (el cajero lo pone, como antes)
    factor_ruta: 1.3,
    precio_estandar: 2,          // botón "Delivery estándar" del cajero cuando no hay tarifa por tabla
    tramos: [                    // "hasta_km" inclusive; precios redondos en USD
        { hasta_km: 2, precio: 1.5 },
        { hasta_km: 5, precio: 2.5 },
        { hasta_km: 8, precio: 4 },
        { hasta_km: 12, precio: 5.5 }
    ],
    extra: { base: 6, por_km: 0.5 },   // más allá del último tramo: base + por_km por cada km adicional
    max_km: 0,                         // 0 = sin límite de distancia
    recargo_nocturno: { activo: false, desde: '21:00', hasta: '05:00', monto: 1 },
    recargo_lluvia: { activo: false, monto: 1 },                // interruptor manual: se enciende cuando llueve
    minimo_lejos: { activo: false, desde_km: 8, monto: 15 },    // pedido mínimo para zonas lejanas
    gratis_cerca: { activo: false, hasta_km: 2, desde_pedido: 15 }
};

const r2 = n => Math.round(n * 100) / 100;
const num = (v, d) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : d; };
const hhmm = (v, d) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : d);
const clon = o => JSON.parse(JSON.stringify(o));

// Mezcla lo guardado con los valores por defecto (así una base vieja funciona sin migrar nada).
export function configDelivery(db) {
    const g = (db && db.delivery) || {};
    const base = clon(DELIVERY_DEFECTO);
    const out = Object.assign(base, { modo: g.modo === 'manual' ? 'manual' : 'automatico' });
    out.factor_ruta = Math.min(3, Math.max(1, num(g.factor_ruta, base.factor_ruta)));
    out.precio_estandar = Math.max(0, num(g.precio_estandar, base.precio_estandar));
    if (Array.isArray(g.tramos) && g.tramos.length) out.tramos = g.tramos.map(t => ({ hasta_km: num(t.hasta_km, 0), precio: num(t.precio, 0) })).filter(t => t.hasta_km > 0).sort((a, b) => a.hasta_km - b.hasta_km);
    if (!out.tramos.length) out.tramos = clon(DELIVERY_DEFECTO.tramos);
    out.extra = { base: Math.max(0, num(g.extra && g.extra.base, base.extra.base)), por_km: Math.max(0, num(g.extra && g.extra.por_km, base.extra.por_km)) };
    out.max_km = Math.max(0, num(g.max_km, 0));
    const n = g.recargo_nocturno || {}, ll = g.recargo_lluvia || {}, mi = g.minimo_lejos || {}, gr = g.gratis_cerca || {};
    out.recargo_nocturno = { activo: !!n.activo, desde: hhmm(n.desde, '21:00'), hasta: hhmm(n.hasta, '05:00'), monto: Math.max(0, num(n.monto, 1)) };
    out.recargo_lluvia = { activo: !!ll.activo, monto: Math.max(0, num(ll.monto, 1)) };
    out.minimo_lejos = { activo: !!mi.activo, desde_km: Math.max(0, num(mi.desde_km, 8)), monto: Math.max(0, num(mi.monto, 15)) };
    out.gratis_cerca = { activo: !!gr.activo, hasta_km: Math.max(0, num(gr.hasta_km, 2)), desde_pedido: Math.max(0, num(gr.desde_pedido, 15)) };
    return out;
}

// Valida lo que manda el panel. Devuelve { ok, config } o { ok:false, error }.
export function validarConfigDelivery(b) {
    const d = b || {};
    if (!Array.isArray(d.tramos) || d.tramos.length < 1) return { ok: false, error: 'Agrega al menos un tramo de distancia.' };
    if (d.tramos.length > 10) return { ok: false, error: 'Máximo 10 tramos.' };
    let ultimo = 0;
    const tramos = [];
    for (const t of d.tramos) {
        const hasta = num(t.hasta_km, NaN), precio = num(t.precio, NaN);
        if (!(hasta > 0) || !(precio >= 0)) return { ok: false, error: 'Cada tramo necesita kilómetros (mayores a 0) y un precio (0 o más).' };
        if (hasta <= ultimo) return { ok: false, error: 'Los tramos deben ir de menor a mayor distancia, sin repetir kilómetros.' };
        ultimo = hasta; tramos.push({ hasta_km: hasta, precio: r2(precio) });
    }
    const f = num(d.factor_ruta, NaN);
    if (!(f >= 1 && f <= 3)) return { ok: false, error: 'El factor de ruta debe estar entre 1 y 3 (lo normal es 1.3).' };
    const tmp = { delivery: Object.assign({}, d, { tramos, modo: d.modo }) };
    return { ok: true, config: configDelivery(tmp) };
}

// "10.9577,-63.8697" -> { lat, lng } (o null)
export function parsearCoords(texto) {
    const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(String(texto || ''));
    if (!m) return null;
    return coordenadasValidas(m[1], m[2]);
}
export function coordenadasValidas(lat, lng) {
    const a = Number(lat), o = Number(lng);
    if (lat === '' || lng === '' || lat == null || lng == null) return null;
    if (!Number.isFinite(a) || !Number.isFinite(o) || Math.abs(a) > 90 || Math.abs(o) > 180) return null;
    if (a === 0 && o === 0) return null;
    return { lat: a, lng: o };
}

// Distancia estimada por calle, en km: Haversine x factor de ruta.
export function distanciaKm(a, b, factor) {
    const rad = x => x * Math.PI / 180, R = 6371.0088;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h)) * (factor || 1);
}

// ¿la hora actual cae en la franja nocturna? (cruza la medianoche si desde > hasta)
function esNocturna(hora, desde, hasta) {
    if (desde === hasta) return false;
    return desde < hasta ? (hora >= desde && hora < hasta) : (hora >= desde || hora < hasta);
}

// Precio del delivery para una distancia. Devuelve
//   { ok:true, precio, km, base, recargos:[{tipo,monto}], gratis } o { ok:false, codigo, mensaje }
export function cotizarDelivery(cfg, { km, subtotal, hora }) {
    const kmR = Math.round(km * 10) / 10;
    if (cfg.max_km > 0 && km > cfg.max_km) return { ok: false, codigo: 'fuera_zona', mensaje: `Por ahora no llegamos tan lejos (máximo ${cfg.max_km} km). Tu ubicación está a unos ${kmR} km.` };
    if (cfg.minimo_lejos.activo && km > cfg.minimo_lejos.desde_km && subtotal < cfg.minimo_lejos.monto) {
        return { ok: false, codigo: 'minimo', mensaje: `Para entregas a más de ${cfg.minimo_lejos.desde_km} km el pedido mínimo es $${cfg.minimo_lejos.monto.toFixed(2)} (tu pedido: $${(subtotal || 0).toFixed(2)}).` };
    }
    if (cfg.gratis_cerca.activo && km <= cfg.gratis_cerca.hasta_km && subtotal >= cfg.gratis_cerca.desde_pedido) {
        return { ok: true, precio: 0, km: kmR, base: 0, recargos: [], gratis: true };
    }
    let base;
    const tramo = cfg.tramos.find(t => km <= t.hasta_km);
    if (tramo) base = tramo.precio;
    else {
        const ultimo = cfg.tramos[cfg.tramos.length - 1];
        base = cfg.extra.base + cfg.extra.por_km * Math.ceil(km - ultimo.hasta_km);
    }
    const recargos = [];
    if (cfg.recargo_nocturno.activo && esNocturna(hora || '12:00', cfg.recargo_nocturno.desde, cfg.recargo_nocturno.hasta)) recargos.push({ tipo: 'nocturno', monto: cfg.recargo_nocturno.monto });
    if (cfg.recargo_lluvia.activo) recargos.push({ tipo: 'lluvia', monto: cfg.recargo_lluvia.monto });
    const precio = r2(base + recargos.reduce((s, x) => s + x.monto, 0));
    return { ok: true, precio, km: kmR, base: r2(base), recargos, gratis: false };
}
