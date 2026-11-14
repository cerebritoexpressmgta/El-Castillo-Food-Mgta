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
    let m = /id=["']dolar["'][\s\S]{0,2500}?<strong>\s*([\d.,]+)\s*<\/strong>/i.exec(h);
    let texto = null;
    if (!m) {
        // Si el BCV cambia el HTML: se lee el texto visible de la página ("USD  914,02180000 ... Fecha Valor: ...")
        texto = h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
        m = /\bUSD\b\s*\$?\s*([\d]{1,3}(?:\.\d{3})*,\d{2,8}|\d+[.,]\d{2,8})/.exec(texto);
    }
    if (!m) throw new Error('No encontré la tasa del dólar en la página del BCV');
    const tasa = redondear2(numeroVe(m[1]));
    if (!(tasa > 0)) throw new Error('La tasa leída del BCV no es válida');
    let fechaValor = null;
    const iso = /Fecha\s+Valor[\s\S]{0,400}?content=["'](\d{4}-\d{2}-\d{2})/i.exec(h);
    if (iso) fechaValor = iso[1];
    else {
        const base = texto || h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        const t = /Fecha\s+Valor:?[\s\S]{0,120}?(\d{1,2})\s+([A-Za-zñáéíóú]+)\s+(\d{4})/i.exec(base);
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

const FUENTES = [
    { id: 'bcv', nombre: 'Página del BCV', url: 'https://www.bcv.org.ve/', init: { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ElCastilloBot/1.0)', 'Accept': 'text/html' } }, leer: async r => parsearHtmlBcv(await r.text()) },
    { id: 'dolarapi', nombre: 'DolarAPI (respaldo)', url: 'https://ve.dolarapi.com/v1/dolares/oficial', init: { headers: { 'Accept': 'application/json' } }, leer: async r => parsearDolarApi(await r.json()) }
];
async function consultarFuente(f, fetchFn) {
    try {
        const r = await pedirConTiempo(fetchFn, f.url, f.init);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await f.leer(r);
        return { fuente: f.id, nombre: f.nombre, ok: true, tasa: d.tasa, fechaValor: d.fechaValor || null };
    } catch (e) { return { fuente: f.id, nombre: f.nombre, ok: false, error: String(e && e.message || e).slice(0, 160) }; }
}

// Consulta las fuentes EN ORDEN y se queda con la primera que responde. Devuelve { resultado, intentos }:
// "intentos" dice qué pasó con cada fuente (para mostrarlo en el panel y saber por qué falla algo).
export async function consultarBcvDetallado(fetchFn) {
    const f = fetchFn || fetch, intentos = [];
    for (const fu of FUENTES) {
        const i = await consultarFuente(fu, f);
        intentos.push(i);
        if (i.ok) return { resultado: { tasa: i.tasa, fechaValor: i.fechaValor, fuente: i.fuente }, intentos };
    }
    return { resultado: null, intentos };
}
// Prueba todas las fuentes a la vez (sin aplicar nada): botón "Probar conexión" del panel.
export async function probarFuentesBcv(fetchFn) {
    const f = fetchFn || fetch;
    return Promise.all(FUENTES.map(fu => consultarFuente(fu, f)));
}
// Versión simple (lanza error si todas fallan)
export async function consultarBcv(fetchFn) {
    const { resultado, intentos } = await consultarBcvDetallado(fetchFn);
    if (resultado) return resultado;
    throw new Error(intentos.map(i => i.nombre + ': ' + i.error).join(' | '));
}

// auto: actualizar sola cada mañana. anticipar: usar la tasa nueva apenas el BCV la publique, aunque rija desde el lunes.
export const TASA_DEFECTO_CONFIG = { auto: true, anticipar: false };
export function configTasa(db) { return Object.assign({}, TASA_DEFECTO_CONFIG, db.tasa_config || {}); }

// Qué ve el tablero y el panel sobre la tasa.
export function infoTasa(db) {
    const t = db.tasa || {};
    return {
        tasa: Number(t.tasa) || 0, fecha: t.fecha || null, fuente: t.fuente || 'manual', fecha_valor: t.fecha_valor || null,
        actualizado: t.actualizado || null, anterior: t.anterior != null ? Number(t.anterior) : null,
        error: t.error || null, ultimo_intento: t.ultimo_intento || null, auto: configTasa(db).auto, anticipar: !!configTasa(db).anticipar,
        proxima: t.proxima || null, diagnostico: t.diagnostico || []
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
export function aplicarTasaBcv(db, r, { hoy, ahora, forzar, adelantar }) {
    const prev = db.tasa || {};
    if (!configTasa(db).auto && !forzar) return { aplicada: false, cambio: false, motivo: 'modo_manual' };
    // El BCV publica la tasa del lunes el viernes en la tarde: rige desde el lunes. Por defecto se espera a esa fecha
    // (el fin de semana vale la del viernes); con "anticipar" (o al pedirlo en el panel) se usa de una vez.
    if (r.fechaValor && r.fechaValor > hoy && !(adelantar || configTasa(db).anticipar)) {
        db.tasa = Object.assign({}, prev, { ultimo_intento: ahora, error: null, proxima: { tasa: r.tasa, fecha_valor: r.fechaValor } });
        return { aplicada: false, cambio: false, motivo: 'rige_despues', fecha_valor: r.fechaValor, tasa: r.tasa };
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
        anterior: cambio ? (anterior || null) : (prev.anterior != null ? prev.anterior : null), error: null, proxima: null
    });
    if (cambio || !(db.tasa_historial || []).some(h => h.fecha === hoy)) anotarHistorial(db, r.tasa, r.fuente, ahora);
    return { aplicada: true, cambio, motivo: 'ok' };
}

// Anota que se intentó y no se pudo (el tablero avisa y se conserva la última tasa).
export function anotarFalloBcv(db, mensaje, ahora) {
    db.tasa = Object.assign({}, db.tasa || {}, { ultimo_intento: ahora, error: String(mensaje).slice(0, 300) });
}

// Guarda qué pasó con cada fuente en la última consulta (se muestra en el panel).
export function anotarIntentosBcv(db, intentos, ahora) {
    db.tasa = Object.assign({}, db.tasa || {}, { diagnostico: (intentos || []).map(i => ({ fuente: i.fuente, nombre: i.nombre, ok: !!i.ok, tasa: i.tasa || null, fecha_valor: i.fechaValor || null, error: i.error || null })), ultimo_intento: ahora });
}
