// Registra la PWA y muestra el botón "Instalar app" (Android, escritorio y iPhone/iPad).
(function () {
    'use strict';
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {}); });
    }

    var ruta = location.pathname.replace(/\/+$/, '') || '/';
    var esPersonal = ruta === '/panel.html';
    var muestra = ruta === '/' || ruta === '/index.html' || esPersonal;
    if (!muestra) return;

    var instalada = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (instalada) return;
    var KEY = 'pwa_pill_oculta', DIAS = 7;
    try { var t = Number(localStorage.getItem(KEY) || 0); if (t && Date.now() - t < DIAS * 864e5) return; } catch (e) {}

    var esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var evento = null, pill = null;

    function crearPill() {
        if (pill) return;
        pill = document.createElement('div');
        pill.style.cssText = 'position:fixed;left:14px;bottom:68px;z-index:2147482000;display:flex;align-items:center;gap:2px;background:#1e293b;color:#fff;border:1px solid #475569;border-radius:999px;box-shadow:0 6px 18px rgba(0,0,0,.4);font:700 14px system-ui,-apple-system,Segoe UI,sans-serif;';
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = '📲 ' + (esPersonal ? 'Instalar app del personal' : 'Instalar app');
        b.style.cssText = 'background:none;border:0;color:inherit;font:inherit;padding:10px 6px 10px 16px;cursor:pointer';
        var x = document.createElement('button');
        x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', 'Cerrar');
        x.style.cssText = 'background:none;border:0;color:#94a3b8;font:inherit;padding:10px 14px 10px 6px;cursor:pointer';
        b.onclick = instalar;
        x.onclick = function () { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {} quitar(); };
        pill.appendChild(b); pill.appendChild(x); document.body.appendChild(pill);
    }
    function quitar() { if (pill) { pill.remove(); pill = null; } }

    function guiaIOS() {
        var d = document.createElement('div');
        d.style.cssText = 'position:fixed;inset:0;z-index:2147483100;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;padding:16px';
        d.innerHTML = '<div style="background:#fff;color:#111;border-radius:20px;padding:22px;max-width:380px;width:100%;font:15px/1.5 system-ui,-apple-system,sans-serif">' +
            '<b style="font-size:17px">Instalar en tu iPhone / iPad</b>' +
            '<ol style="padding-left:20px;margin:12px 0">' +
            '<li>Toca el botón <b>Compartir</b> (el cuadro con la flecha ⬆️).</li>' +
            '<li>Elige <b>Añadir a pantalla de inicio</b>.</li>' +
            '<li>Toca <b>Añadir</b>.</li></ol>' +
            '<button type="button" style="width:100%;background:#b4231a;color:#fff;border:0;border-radius:12px;padding:12px;font-weight:800;font-size:15px">Entendido</button></div>';
        d.onclick = function (e) { if (e.target === d || e.target.tagName === 'BUTTON') d.remove(); };
        document.body.appendChild(d);
    }
    function instalar() {
        if (evento) {
            evento.prompt();
            evento.userChoice.then(function () { evento = null; quitar(); });
        } else if (esIOS) { guiaIOS(); }
    }

    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); evento = e; if (document.body) crearPill(); else addEventListener('DOMContentLoaded', crearPill); });
    window.addEventListener('appinstalled', function () { evento = null; quitar(); });
    if (esIOS) addEventListener('DOMContentLoaded', function () { setTimeout(crearPill, 1500); });
})();
