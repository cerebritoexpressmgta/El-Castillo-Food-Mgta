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

    async function compartir(lista) {
        lista = (lista || []).filter(function (m) { return m && m.nombre; });
        if (!lista.length) { aviso('No hay métodos de pago para compartir.'); return; }
        var txt = textoTodos(lista);
        try {
            if (navigator.share) {
                var files = await archivosQr(lista);
                if (files.length && navigator.canShare && navigator.canShare({ files: files, text: txt })) {
                    await navigator.share({ files: files, text: txt, title: 'Métodos de pago' }); return;
                }
                await navigator.share({ text: txt, title: 'Métodos de pago' });
                if (files.length) aviso('Se compartió el texto. Para el QR usa "Ver QR" y compártelo desde ahí.');
                return;
            }
        } catch (e) { if (e && e.name === 'AbortError') return; }
        // Sin menú nativo (por ejemplo, computador): WhatsApp Web con el texto listo
        window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank', 'noopener');
    }

    async function copiar(lista) {
        var txt = textoTodos(lista || []);
        try { await navigator.clipboard.writeText(txt); aviso('✅ Datos copiados.'); }
        catch (e) { prompt('Copia los datos:', txt); }
    }

    function verQr(url) { if (url) window.open(url, '_blank', 'noopener'); }

    return { texto: texto, compartir: compartir, copiar: copiar, verQr: verQr, aviso: aviso };
})();
