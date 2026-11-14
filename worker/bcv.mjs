// Tasa oficial del dólar del Banco Central de Venezuela (BCV).
// Fuentes, en este orden:
//   1) la página del BCV (bcv.org.ve): es la fuente oficial;
//   2) ve.dolarapi.com: API pública sin llave que replica la tasa oficial del BCV (respaldo).
// Todo lo de aquí es "puro" (sin base de datos) para poder probarlo; rutas.mjs e index.mjs lo usan.

const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const dos = n => String(n).padStart(2, '0');

// "911,62340000" / "1.234,5678" / "911.6234" -> número
export function numeroVe(texto) {
    let t = String(texto == null ? '' : texto).trim().replace(/[^\d.,]/g, '');
    if (!t) return NaN;
    const coma = t.lastIndexOf(','), punto = t.lastIndexOf('.');
    if (coma > -1 && punto > -1) t = coma > punto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    else if (coma > -1) t = t.replace(',', '.');
    return parseFloat(t);
}
const redondear2 = n => Math.round(n * 100) / 100;

// Página del BCV: el dólar vive en <div id="dolar"> ... <strong> 911,62340000 </strong>
// y "Fecha Valor" trae el día desde el que rige (en fines de semana, el lunes).
export function parsearHtmlBcv(html) {
    const h = String(html || '');
    const m = /id=["']dolar["'][\s\S]{0,2500}?<strong>\s*([\d.,]+)\s*<\/strong>/i.exec(h);
    if (!m) throw new Error('No encontré la tasa del dólar en la página del BCV');
    const tasa = redondear2(numeroVe(m[1]));
    if (!(tasa > 0)) throw new Error('La tasa leída del BCV no es válida');
    let fechaValor = null;
    const iso = /Fecha\s+Valor[\s\S]{0,400}?content=["'](\d{4}-\d{2}-\d{2})/i.exec(h);
    if (iso) fechaValor = iso[1];
    else {
        const t = /Fecha\s+Valor[\s\S]{0,300}?(\d{1,2})\s+([A-Za-zñáéíóú]+)\s+(\d{4})/i.exec(h);
        if (t && MESES[t[2].toLowerCase()]) fechaValor = `${t[3]}-${dos(MESES[t[2].toLowerCase()])}-${dos(t[1])}`;
    }
    return { tasa, fechaValor, fuente: 'bcv' };
}

// ve.dolarapi.com/v1/dolares/oficial -> { promedio, fechaActualizacion, ... }
export function parsearDolarApi(json) {
    const j = json || {};
    const tasa = redondear2(Number(j.promedio != null ? j.promedio : (j.venta != null ? j.venta : (j.compra != null ? j.compra : j.precio))));
    if (!(tasa > 0)) throw new Error('DolarAPI no trajo una tasa válida');
    return { tasa, fechaValor: null, fuente: 'dolarapi' };
}

async function pedirConTiempo(fetchFn, url, init, ms) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms || 9000);
    try { return await fetchFn(url, Object.assign({}, init, { signal: ctl.signal })); }
    finally { clearTimeout(t); }
}

// Consulta las fuentes y devuelve { tasa, fechaValor, fuente }. Si todas fallan, lanza un error con el detalle.
export async function consultarBcv(fetchFn) {
    const f = fetchFn || fetch;
    const errores = [];
    try {
        const r = await pedirConTiempo(f, 'https://www.bcv.org.ve/', { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ElCastilloBot/1.0)', 'Accept': 'text/html' } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return parsearHtmlBcv(await r.text());
    } catch (e) { errores.push('BCV: ' + (e && e.message || e)); }
    try {
        const r = await pedirConTiempo(f, 'https://ve.dolarapi.com/v1/dolares/oficial', { headers: { 'Accept': 'application/json' } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return parsearDolarApi(await r.json());
    } catch (e) { errores.push('DolarAPI: ' + (e && e.message || e)); }
    throw new Error(errores.join(' | '));
}

export const TASA_DEFECTO_CONFIG = { auto: true };
export function configTasa(db) { return Object.assign({}, TASA_DEFECTO_CONFIG, db.tasa_config || {}); }

// Qué ve el tablero y el panel sobre la tasa.
export function infoTasa(db) {
    const t = db.tasa || {};
    return {
        tasa: Number(t.tasa) || 0, fecha: t.fecha || null, fuente: t.fuente || 'manual', fecha_valor: t.fecha_valor || null,
        actualizado: t.actualizado || null, anterior: t.anterior != null ? Number(t.anterior) : null,
        error: t.error || null, ultimo_intento: t.ultimo_intento || null, auto: configTasa(db).auto
    };
}

function anotarHistorial(db, tasa, fuente, ahora) {
    db.tasa_historial = (db.tasa_historial || []);
    db.tasa_historial.unshift({ fecha: String(ahora).slice(0, 10), hora: String(ahora).slice(11, 16), tasa, fuente });
    db.tasa_historial = db.tasa_historial.slice(0, 40);
}

// Guarda en la base una tasa manual (la del cajero o el administrador).
export function aplicarTasaManual(db, tasa, hoy, ahora) {
    const prev = db.tasa || {};
    db.tasa = Object.assign({}, prev, {
        tasa, fecha: hoy, fuente: 'manual', fecha_valor: null, actualizado: ahora,
        anterior: Number(prev.tasa) !== tasa ? Number(prev.tasa) || null : (prev.anterior != null ? prev.anterior : null), error: null
    });
    anotarHistorial(db, tasa, 'manual', ahora);
}

// Aplica el resultado de una consulta al BCV a la base. Devuelve { aplicada, cambio, motivo }.
//  - Si el modo es manual, no toca nada (salvo forzar = true: botón "Actualizar ahora").
//  - Si el BCV publicó una tasa que rige desde una fecha futura (ej. viernes en la tarde para el lunes), se espera.
//  - Si la tasa nueva se aleja >35% de la anterior automática, se rechaza (probable error de lectura).
export function aplicarTasaBcv(db, r, { hoy, ahora, forzar }) {
    const prev = db.tasa || {};
    if (!configTasa(db).auto && !forzar) return { aplicada: false, cambio: false, motivo: 'modo_manual' };
    if (r.fechaValor && r.fechaValor > hoy) {
        db.tasa = Object.assign({}, prev, { ultimo_intento: ahora, error: null });
        return { aplicada: false, cambio: false, motivo: 'rige_despues', fecha_valor: r.fechaValor };
    }
    const anterior = Number(prev.tasa) || 0;
    if ((prev.fuente === 'bcv' || prev.fuente === 'dolarapi') && anterior > 0) {
        const razon = r.tasa / anterior;
        if (razon > 1.35 || razon < 0.74) {
            db.tasa = Object.assign({}, prev, { ultimo_intento: ahora, error: `La tasa leída (${r.tasa}) se aleja demasiado de la actual (${anterior}); no se aplicó. Revísala a mano.` });
            return { aplicada: false, cambio: false, motivo: 'fuera_de_rango' };
        }
    }
    const cambio = anterior !== r.tasa;
    db.tasa = Object.assign({}, prev, {
        tasa: r.tasa, fecha: hoy, fuente: r.fuente, fecha_valor: r.fechaValor || null, actualizado: ahora, ultimo_intento: ahora,
        anterior: cambio ? (anterior || null) : (prev.anterior != null ? prev.anterior : null), error: null
    });
    if (cambio || !(db.tasa_historial || []).some(h => h.fecha === hoy)) anotarHistorial(db, r.tasa, r.fuente, ahora);
    return { aplicada: true, cambio, motivo: 'ok' };
}

// Anota que se intentó y no se pudo (el tablero avisa y se conserva la última tasa).
export function anotarFalloBcv(db, mensaje, ahora) {
    db.tasa = Object.assign({}, db.tasa || {}, { ultimo_intento: ahora, error: String(mensaje).slice(0, 300) });
}
