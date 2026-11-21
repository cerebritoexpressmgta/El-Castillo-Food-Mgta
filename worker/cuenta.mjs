// ESTADO DE LA SUSCRIPCIÓN de cada negocio. Se calcula con las fechas en cada solicitud (no necesita tarea programada):
//   sin_control : sin fecha de vencimiento (negocio propio / de cortesía): nunca se bloquea por fecha
//   al_dia      : vence dentro de más de 'AVISO_PREVIO' días
//   por_vencer  : vence en 'AVISO_PREVIO' días o menos  -> aviso en el panel del dueño
//   vencido     : ya venció, dentro de los días de gracia -> aviso en el panel del dueño (con la fecha de bloqueo)
//   bloqueado   : pasaron los días de gracia              -> se bloquea TODO (web pública y panel)
//   suspendido  : suspendido a mano                       -> se bloquea TODO
export const AVISO_PREVIO = 3;

export function hoyCaracasISO() { return new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10); }
const dia = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400e3;
export const diasEntre = (desde, hasta) => Math.round(dia(hasta) - dia(desde));
export function sumarDias(iso, n) { const d = new Date(dia(iso) * 86400e3 + n * 86400e3); return d.toISOString().slice(0, 10); }
export function sumarMeses(iso, n) {
    const y = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1, d = +iso.slice(8, 10);
    const total = y * 12 + m + n, ny = Math.floor(total / 12), nm = total % 12;
    const ultimo = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
    return new Date(Date.UTC(ny, nm, Math.min(d, ultimo))).toISOString().slice(0, 10);
}

export function estadoCuenta(negocio, hoy) {
    hoy = hoy || hoyCaracasISO();
    if (!negocio) return { estado: 'suspendido', dias: null, vence_el: null, bloqueo_el: null };
    const venc = negocio.vence_el ? String(negocio.vence_el).slice(0, 10) : null;
    const gracia = Math.max(0, parseInt(negocio.dias_gracia, 10) || 0);
    const base = { vence_el: venc, bloqueo_el: venc ? sumarDias(venc, gracia) : null, dias: null };
    if (negocio.activo === false) return Object.assign(base, { estado: 'suspendido' });
    if (!venc) return Object.assign(base, { estado: 'sin_control' });
    const falta = diasEntre(hoy, venc);              // >0 faltan días; 0 vence hoy; <0 ya venció
    if (falta >= 0) return Object.assign(base, { estado: falta <= AVISO_PREVIO ? 'por_vencer' : 'al_dia', dias: falta });
    const atraso = -falta;
    if (atraso <= gracia) return Object.assign(base, { estado: 'vencido', dias: diasEntre(hoy, base.bloqueo_el) }); // días que faltan para el bloqueo
    return Object.assign(base, { estado: 'bloqueado', dias: -diasEntre(hoy, base.bloqueo_el) });                  // días de bloqueo
}
export const estaBloqueado = (c) => c.estado === 'bloqueado' || c.estado === 'suspendido';

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export function paginaBloqueada(nombre, contacto) {
    return '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<meta name="robots" content="noindex"><title>Servicio suspendido</title>' +
        '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#e2e8f0;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px}' +
        '.c{max-width:28rem}h1{font-size:1.4rem;margin:.4rem 0}p{color:#94a3b8}.i{font-size:3rem}</style></head><body><div class="c"><div class="i">⏸️</div>' +
        '<h1>' + esc(nombre) + '</h1><h1>Servicio temporalmente suspendido</h1>' +
        '<p>Este servicio está suspendido por falta de renovación de la suscripción. Si eres el responsable del negocio, comunícate con soporte para reactivarlo.</p>' +
        (contacto ? '<p><b>' + esc(contacto) + '</b></p>' : '') + '</div></body></html>';
}
