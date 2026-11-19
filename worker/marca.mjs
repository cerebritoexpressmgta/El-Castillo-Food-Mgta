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

// Archivos de marca del negocio original que se sustituyen en los demás negocios
const ARCHIVOS_ORIGINAL = ['icons/logo-escudo.jpg?v=1', 'icons/logo-castillo.jpg?v=1', 'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/favicon-16.png', 'icons/icon-192.png'];

export function reescribirHtml(texto, m) {
    if (m.original) return texto;
    const nombre = escHtml(m.nombre);
    let t = texto.split('El Castillo Food Mgta').join(nombre).split('El Castillo').join(nombre);
    // Los íconos/logo del castillo se cambian por el logo propio o el ícono generado
    const logo = m.logoFinal.replace(/["'<>\s]/g, c => encodeURIComponent(c)); // URL segura dentro de HTML y de textos JS
    ARCHIVOS_ORIGINAL.forEach(a => { t = t.split('/' + a).join(logo).split(a).join(logo); });
    // Marca para los scripts (se pone al inicio del <head>, antes de que corra cualquiera)
    const dato = JSON.stringify({ nombre: m.nombre, emoji: m.emoji, eslogan: m.eslogan, color: m.color, iconoUrl: m.logoFinal })
        .replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    return t.replace(/<head[^>]*>/i, (h) => h + '<script>window.__MARCA=' + dato + ';</script>');
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
