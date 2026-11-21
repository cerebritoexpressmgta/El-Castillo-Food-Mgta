// PLANTILLAS POR TIPO DE NEGOCIO. El dueño de la plataforma elige una por negocio (el cliente no la cambia).
// Una plantilla define: símbolos del fondo, colores iniciales y cómo se llaman los locales.
// 'restaurante' conserva los fondos de comida originales; las demás generan su propio fondo.
export const PLANTILLAS = {
    general:      { nombre: 'General',            emojis: ['⭐', '✨', '🔷', '🏪', '📦', '💼', '🧾', '🤝'], colores: ['#0f766e', '#f59e0b', '#134e4a'], locales: 'Locales' },
    restaurante:  { nombre: 'Restaurante / comida', emojis: [], colores: null, locales: 'Sucursales' },
    taller:       { nombre: 'Taller mecánico',    emojis: ['🔧', '🚗', '⚙️', '🛠️', '🔩', '🛞', '⛽', '🔑'], colores: ['#1d4ed8', '#f59e0b', '#0b3b8c'], locales: 'Talleres' },
    peluqueria:   { nombre: 'Peluquería / belleza', emojis: ['✂️', '💈', '💇', '💅', '🪞', '🧴', '✨', '💄'], colores: ['#7c3aed', '#f472b6', '#3b0764'], locales: 'Salones' },
    abasto:       { nombre: 'Abasto / bodega',    emojis: ['🛒', '🥫', '🥖', '🧃', '🍎', '🥛', '🧺', '🏷️'], colores: ['#15803d', '#eab308', '#14532d'], locales: 'Tiendas' },
    carniceria:   { nombre: 'Carnicería',         emojis: ['🥩', '🔪', '🍖', '🐄', '🥓', '🧈', '🔥', '🏷️'], colores: ['#b91c1c', '#f59e0b', '#450a0a'], locales: 'Sucursales' },
    tienda_online:{ nombre: 'Tienda en línea',    emojis: ['🛍️', '📦', '🚚', '💳', '🏷️', '📱', '🎁', '⭐'], colores: ['#0f766e', '#f59e0b', '#134e4a'], locales: 'Tiendas' }
};
export const plantillaValida = (id) => Object.prototype.hasOwnProperty.call(PLANTILLAS, id);
export const plantillaDe = (id) => PLANTILLAS[plantillaValida(id) ? id : 'general'];
export function listarPlantillas() { return Object.keys(PLANTILLAS).map(id => ({ id, nombre: PLANTILLAS[id].nombre, emojis: PLANTILLAS[id].emojis.slice(0, 6) })); }

// Posiciones del mosaico (mismo esquema que los fondos originales: 300x300, suave y rotado)
const POS = [[34, 58, -14], [150, 40, 10], [262, 84, -8], [76, 168, 12], [196, 196, -12], [278, 270, 8], [40, 262, -10], [150, 120, 6]];
// Genera un fondo en SVG (data URI) con los símbolos de la plantilla. 'giro' reparte los símbolos distinto en cada fondo.
export function patronSvg(emojis, giro) {
    const n = emojis.length; if (!n) return '';
    const t = POS.map((p, i) => `<text x='${p[0]}' y='${p[1]}' font-size='34' transform='rotate(${p[2]} ${p[0]} ${p[1]})'>%%${(i + (giro || 0)) % n}%%</text>`).join('');
    let svg = `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300' opacity='0.1'>${t}</svg>`;
    svg = svg.replace(/%/g, '%25').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/#/g, '%23').replace(/\(/g, '%28').replace(/\)/g, '%29');
    emojis.forEach((e, i) => { svg = svg.split(`%25%25${i}%25%25`).join(encodeURIComponent(e)); });
    return 'url("data:image/svg+xml,' + svg + '")';
}
