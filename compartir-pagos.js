// =====================================================================
// Compartir métodos de pago (datos + enlace + imagen del QR).
// Lo usan el panel de Administración y el menú "💳 Pagos" del personal.
// En el celular abre el menú nativo de compartir (WhatsApp, etc.); si el navegador no puede,
// copia el texto o abre WhatsApp con el mensaje listo.
// =====================================================================
window.PagosCompartir = (function () {
    'use strict';

    function texto(m) {
        var t = '*' + (m.nombre || 'Método de pago') + '*';
        if (m.datos) t += '\n' + m.datos;
        if (m.enlace) t += '\nEnlace de pago: ' + m.enlace;
        return t;
    }
    function textoTodos(lista) { return lista.map(texto).join('\n\n'); }

    function aviso(msg) {
        var a = document.getElementById('pagos-aviso');
        if (!a) {
            a = document.createElement('div'); a.id = 'pagos-aviso';
            a.style.cssText = 'position:fixed;left:50%;bottom:70px;transform:translateX(-50%);z-index:2147483600;background:#0f172a;color:#fff;border:1px solid #475569;border-radius:10px;padding:10px 16px;font:600 13px system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.5);max-width:90vw;text-align:center;display:none';
            document.body.appendChild(a);
        }
        a.textContent = msg; a.style.display = 'block';
        clearTimeout(a._t); a._t = setTimeout(function () { a.style.display = 'none'; }, 2600);
    }

    async function archivosQr(lista) {
        var out = [];
        for (var i = 0; i < lista.length; i++) {
            var m = lista[i]; if (!m.qr) continue;
            try {
                var blob = await (await fetch(m.qr)).blob();
                var ext = /png/.test(blob.type) ? 'png' : /webp/.test(blob.type) ? 'webp' : 'jpg';
                out.push(new File([blob], 'QR-' + String(m.nombre).replace(/[^\w-]+/g, '_') + '.' + ext, { type: blob.type || 'image/png' }));
            } catch (e) { /* sin permiso para leer la imagen: se comparte solo el texto */ }
        }
        return out;
    }

    // En celulares/tablets se usa el menú nativo de compartir. En computadores (Windows/Mac) ese panel
    // suele abrir "Enlace móvil" o quedarse en blanco, así que se muestra un menú propio más útil.
    function esMovil() {
        return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    async function compartir(lista) {
        lista = (lista || []).filter(function (m) { return m && m.nombre; });
        if (!lista.length) { aviso('No hay métodos de pago para compartir.'); return; }
        var txt = textoTodos(lista);
        if (esMovil() && navigator.share) {
            try {
                var files = await archivosQr(lista);
                if (files.length && navigator.canShare && navigator.canShare({ files: files, text: txt })) {
                    await navigator.share({ files: files, text: txt, title: 'Métodos de pago' }); return;
                }
                await navigator.share({ text: txt, title: 'Métodos de pago' });
                if (files.length) aviso('Se compartió el texto. Para el QR usa "Ver QR" y compártelo desde ahí.');
                return;
            } catch (e) { if (e && e.name === 'AbortError') return; }
        }
        menuEscritorio(lista, txt);
    }

    // ---- Menú para computador ----
    function whatsapp(txt) { window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank', 'noopener'); }

    async function blobPng(url) {
        var blob = await (await fetch(url)).blob();
        if (blob.type === 'image/png') return blob;
        // El portapapeles solo acepta PNG: se convierte
        var bmp = await createImageBitmap(blob), c = document.createElement('canvas');
        c.width = bmp.width; c.height = bmp.height;
        var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0);
        return await new Promise(function (res) { c.toBlob(res, 'image/png'); });
    }
    async function copiarImagen(url) {
        try {
            var b = await blobPng(url);
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
            aviso('✅ QR copiado. Pégalo en el chat con Ctrl+V.');
        } catch (e) { aviso('No se pudo copiar la imagen. Usa "Descargar QR".'); }
    }
    async function descargarImagen(url, nombre) {
        try {
            var blob = await (await fetch(url)).blob(), a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = 'QR-' + String(nombre).replace(/[^\w-]+/g, '_') + '.png';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
        } catch (e) { window.open(url, '_blank', 'noopener'); }
    }

    function menuEscritorio(lista, txt) {
        var ant = document.getElementById('pagos-menu'); if (ant) ant.remove();
        var fondo = document.createElement('div'); fondo.id = 'pagos-menu';
        fondo.style.cssText = 'position:fixed;inset:0;z-index:2147483500;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,Segoe UI,sans-serif';
        var caja = document.createElement('div');
        caja.style.cssText = 'background:#1e293b;color:#e2e8f0;border:1px solid #475569;border-radius:14px;width:100%;max-width:380px;max-height:90vh;overflow:auto;padding:16px';
        var BTN = 'display:block;width:100%;padding:11px;margin-top:8px;border:0;border-radius:10px;color:#fff;font-weight:700;font-size:14px;cursor:pointer;background:#334155;text-align:center';
        var titulo = lista.length === 1 ? lista[0].nombre : 'Todos los métodos (' + lista.length + ')';
        caja.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:16px">📤 Compartir · ' + titulo.replace(/[<>&]/g, '') + '</b><button type="button" data-a="x" style="background:none;border:0;color:#fff;font-size:18px;cursor:pointer">✕</button></div>' +
            '<button type="button" data-a="wa" style="' + BTN + ';background:#16a34a">💬 Enviar por WhatsApp</button>' +
            '<button type="button" data-a="txt" style="' + BTN + '">📋 Copiar texto</button>';
        lista.forEach(function (m, i) {
            if (!m.qr) return;
            var et = String(m.nombre).replace(/[<>&]/g, '');
            caja.innerHTML += '<div style="margin-top:10px;font-size:12px;color:#94a3b8">QR de ' + et + '</div>' +
                '<div style="display:flex;gap:6px"><button type="button" data-a="img" data-i="' + i + '" style="' + BTN + ';margin-top:4px">🖼️ Copiar QR</button>' +
                '<button type="button" data-a="dl" data-i="' + i + '" style="' + BTN + ';margin-top:4px">💾 Descargar QR</button></div>';
        });
        fondo.appendChild(caja); document.body.appendChild(fondo);
        var cerrar = function () { fondo.remove(); };
        fondo.addEventListener('click', function (e) {
            if (e.target === fondo) { cerrar(); return; }
            var t = e.target.closest('button'); if (!t) return;
            var a = t.getAttribute('data-a'), m = lista[Number(t.getAttribute('data-i'))];
            if (a === 'x') cerrar();
            else if (a === 'wa') { whatsapp(txt); cerrar(); }
            else if (a === 'txt') copiar(lista);
            else if (a === 'img') copiarImagen(m.qr);
            else if (a === 'dl') descargarImagen(m.qr, m.nombre);
        });
    }

    async function copiar(lista) {
        var txt = textoTodos(lista || []);
        try { await navigator.clipboard.writeText(txt); aviso('✅ Datos copiados.'); }
        catch (e) { prompt('Copia los datos:', txt); }
    }

    function verQr(url) { if (url) window.open(url, '_blank', 'noopener'); }

    return { texto: texto, compartir: compartir, copiar: copiar, verQr: verQr, aviso: aviso };
})();
