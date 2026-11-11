// Rellena el nombre del negocio y los datos de contacto desde la configuración de la web (panel → Datos de la web)
(function () {
    var nombre = 'El Castillo Food Mgta';
    function poner(sel, txt) { document.querySelectorAll(sel).forEach(function (e) { e.textContent = txt; }); }
    function limpiarWa(w) { return String(w || '').replace(/[^\d]/g, ''); }
    poner('[data-negocio]', nombre);
    fetch('/api/sitio').then(function (r) { return r.json(); }).then(function (d) {
        var s = (d && d.sitio) || {};
        if (s.titulo) { nombre = s.titulo; poner('[data-negocio]', nombre); document.title = document.title.replace('El Castillo Food Mgta', nombre); }
        document.querySelectorAll('[data-contacto]').forEach(function (e) {
            var partes = [];
            if (s.email) { var a = document.createElement('a'); a.href = 'mailto:' + s.email; a.textContent = s.email; partes.push(['por correo: ', a]); }
            if (limpiarWa(s.whatsapp)) { var w = document.createElement('a'); w.href = 'https://wa.me/' + limpiarWa(s.whatsapp); w.target = '_blank'; w.rel = 'noopener'; w.textContent = 'WhatsApp ' + s.whatsapp; partes.push(['por ', w]); }
            if (!partes.length) return;
            e.textContent = '';
            partes.forEach(function (p, i) { if (i) e.appendChild(document.createTextNode(' o ')); e.appendChild(document.createTextNode(p[0])); e.appendChild(p[1]); });
            e.appendChild(document.createTextNode('.'));
        });
    }).catch(function () { });
})();
