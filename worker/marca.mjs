// MARCA DINÁMICA: nombre, logo y colores de cada negocio salen de SUS datos (panel > Datos de la web),
// no de textos escritos en las páginas. El Worker reescribe el HTML y genera los manifiestos por dominio.
import { leerSitio } from './supabase.mjs';

const HEX = /^#[0-9a-fA-F]{6}$/;
const cache = new Map(); // negocioId -> { m, hasta }

const escHtml = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const urlHttps = (u) => (typeof u === 'string' && /^https:\/\//i.test(u) ? u : '');

export async function leerMarca(env, negocio) {
    const c = cache.get(negocio.id);
    if (c && c.hasta > Date.now()) return c.m;
    let s = {};
    try { s = await leerSitio(env, negocio.id); } catch (e) { s = {}; }
    const nombre = String(s.titulo || negocio.nombre || 'Mi negocio').trim().slice(0, 40) || 'Mi negocio';
    const m = {
        nombre,
        corto: nombre.length > 12 ? nombre.slice(0, 12).trim() : nombre,
        emoji: '🍽️',
        eslogan: String(s.eslogan || '').slice(0, 120),
        color: HEX.test(s.colorPrincipal || '') ? s.colorPrincipal : '#0f766e',
        logo: urlHttps(s.logoSistema) || urlHttps(s.logo),
        original: !!negocio.marca_original   // true = el negocio original: conserva sus archivos de marca tal cual
    };
    m.icono = '/api/marca/icono.svg';          // si no subió logo: un ícono con su inicial y su color
    m.logoFinal = m.logo || m.icono;
    cache.set(negocio.id, { m, hasta: Date.now() + 60e3 });
    if (cache.size > 200) cache.clear();
    return m;
}
export function olvidarMarcas() { cache.clear(); }

// Ícono por defecto: la inicial del negocio sobre su color principal
export function iconoSvg(m) {
    const ini = escHtml((Array.from(m.nombre.trim())[0] || '?').toUpperCase());
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="${m.color}"/>` +
        `<text x="256" y="256" dy=".35em" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="300" fill="#ffffff">${ini}</text></svg>`;
}

// Emojis del castillo en los fondos (vienen codificados dentro de los SVG): se cambian por símbolos neutros
function neutralizarFondos(t, m) {
    return t.replace(/%F0%9F%8F%B0/g, encodeURIComponent(m.emoji))      // 🏰 -> emoji del negocio
            .replace(/%E2%9A%94(%EF%B8%8F)?/g, '%E2%AD%90')                // ⚔️ -> ⭐
            .replace(/%F0%9F%91%91/g, '%E2%9C%A8')                         // 👑 -> ✨
            .replace(/%F0%9F%9B%A1(%EF%B8%8F)?/g, '%F0%9F%94%B7');         // 🛡️ -> 🔷
}
// fondos.css: solo el fondo del panel del dueño (data-fondo="dueno") es temático del castillo
export function reescribirFondos(css, m) {
    if (m.original) return css;
    return css.replace(/body\[data-fondo="dueno"\]\{[^}]*\}/, (b) => neutralizarFondos(b, m));
}

// Archivos de marca del negocio original que se sustituyen en los demás negocios
const ARCHIVOS_ORIGINAL = ['icons/logo-escudo.jpg?v=1', 'icons/logo-castillo.jpg?v=1', 'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/favicon-16.png', 'icons/icon-192.png'];

export function reescribirHtml(texto, m) {
    if (m.original) return texto;
    const nombre = escHtml(m.nombre);
    const logo = m.logoFinal.replace(/["'<>\s]/g, c => encodeURIComponent(c)); // URL segura dentro de HTML y de textos JS
    let t = texto.split('El Castillo Food Mgta').join(nombre).split('El Castillo').join(nombre);
    t = t.split('Castillo Staff').join(escHtml(m.corto) + ' Staff').split('el escudo del Castillo').join('el ícono de tu negocio');
    // Emoji del castillo (también dentro de los fondos en SVG): se cambia por el del negocio
    t = t.split('🏰').join(m.emoji);
    t = neutralizarFondos(t, m);
    // Imágenes de fondo del castillo: sin imagen (queda el degradado)
    t = t.replace(/url\((['"]?)\/?icons\/castillo-(?:fondo|portada)\.jpg(?:\?v=\d+)?\1\)/g, 'none');
    // Logo e íconos del castillo -> logo propio o ícono generado
    ARCHIVOS_ORIGINAL.forEach(a => { t = t.split('/' + a).join(logo).split(a).join(logo); });
    // Favicon: se quitan los del castillo (incluido /favicon.ico) y se pone uno solo
    t = t.replace(/<link\s+rel="(?:icon|shortcut icon|apple-touch-icon)"[^>]*>\s*/gi, '');
    const iconos = '<link rel="icon" href="' + logo + '"><link rel="apple-touch-icon" href="' + logo + '">';
    // Marca para los scripts (se pone al inicio del <head>, antes de que corra cualquiera)
    const dato = JSON.stringify({ nombre: m.nombre, emoji: m.emoji, eslogan: m.eslogan, color: m.color, iconoUrl: m.logoFinal })
        .replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    return t.replace(/<head[^>]*>/i, (h) => h + iconos + '<script>window.__MARCA=' + dato + ';</script>');
}

// Manifiestos de la app instalable (clientes y personal), con el nombre de cada negocio
export function reescribirManifiesto(json, m, esPersonal) {
    if (m.original) return json;
    const o = Object.assign({}, json);
    o.name = esPersonal ? m.nombre + ' · Personal' : m.nombre;
    o.short_name = esPersonal ? (m.corto + ' · Personal').slice(0, 24) : m.corto;
    o.description = esPersonal
        ? 'Cocina, mesas, caja y administración de ' + m.nombre + '.'
        : 'Pide en ' + m.nombre + ': mesa, para llevar y delivery.';
    o.theme_color = m.color;
    const ic = m.logo ? [{ src: m.logo, sizes: '512x512', purpose: 'any' }]
                      : [{ src: m.icono, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }];
    o.icons = ic;
    if (Array.isArray(o.shortcuts)) o.shortcuts = o.shortcuts.map(x => Object.assign({}, x, { icons: ic.map(i => Object.assign({}, i, { sizes: i.sizes === 'any' ? 'any' : '192x192' })) }));
    return o;
}
