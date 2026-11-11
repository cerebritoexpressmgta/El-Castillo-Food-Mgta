// Reseñas de clientes con aprobación del administrador.
// - Al hacer un pedido, el servidor entrega un "pase" firmado (resena_token) ligado a ESE pedido.
// - Solo se puede reseñar cuando el pedido está Finalizado, y una sola vez por pedido.
// - La reseña queda PENDIENTE hasta que un administrador la apruebe; entonces pasa a db.resenas (lo que se ve en la web).
// - En la web se muestra solo el primer nombre y la inicial del apellido (ej. "María P.").
import { leerObjeto } from './auth.mjs';

const MAX_PUBLICADAS = 12;   // mismo tope que ya tenía la sección de reseñas de la web
const MAX_PENDIENTES = 100;  // evita llenar la base con reseñas sin revisar

export function nombrePublico(nombre) {
    const partes = String(nombre || '').replace(/[^\p{L}\s'-]/gu, ' ').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return 'Cliente';
    const cap = (s) => s.charAt(0).toLocaleUpperCase('es') + s.slice(1).toLocaleLowerCase('es');
    const primero = cap(partes[0]).slice(0, 24);
    return partes[1] ? `${primero} ${partes[1].charAt(0).toLocaleUpperCase('es')}.` : primero;
}

export function registrarResenas(h) {
    const { ruta, ok, HttpError, requiereAdmin, limpiarTexto, siguienteId, contarNumeroDiario } = h;
    const lista = (db) => (db.resenas_cliente = db.resenas_cliente || []);

    async function pedidoDeToken(db, token) {
        const t = await leerObjeto(token);
        if (!t || t.fase !== 'resena') return null;
        return db.pedidos.find(x => x.id === t.pid && x.telefono === t.tel) || null;
    }
    const yaReseno = (db, pid) => lista(db).some(r => r.pedido_id === pid);

    // El cliente pregunta cuáles de sus pedidos ya se pueden calificar
    ruta('POST', '/api/resenas/pendientes', async (ctx, db) => {
        const tokens = Array.isArray((ctx.body || {}).tokens) ? ctx.body.tokens.slice(0, 10) : [];
        const salida = [];
        for (const token of tokens) {
            const p = await pedidoDeToken(db, token);
            if (!p) { salida.push({ token, estado: 'invalido' }); continue; }
            if (yaReseno(db, p.id)) { salida.push({ token, estado: 'hecho' }); continue; }
            if (p.estado !== 'Finalizado') { salida.push({ token, estado: 'esperando' }); continue; }
            salida.push({ token, estado: 'listo', id_visual: contarNumeroDiario(db, p) });
        }
        return { success: true, resenas: salida };
    });

    ruta('POST', '/api/resenas/enviar', async (ctx, db) => {
        const d = ctx.body || {};
        const p = await pedidoDeToken(db, d.token);
        if (!p) throw new HttpError(400, 'Este enlace de reseña ya no es válido.');
        if (p.estado !== 'Finalizado') throw new HttpError(400, 'Tu pedido todavía no ha sido entregado. Vuelve cuando lo recibas.');
        if (yaReseno(db, p.id)) throw new HttpError(400, 'Ya enviaste tu reseña de este pedido. ¡Gracias!');
        const estrellas = parseInt(d.estrellas, 10);
        if (!(estrellas >= 1 && estrellas <= 5)) throw new HttpError(400, 'Elige de 1 a 5 estrellas.');
        const texto = limpiarTexto(d.texto, 300);
        if (texto.length < 5) throw new HttpError(400, 'Cuéntanos un poquito más (mínimo 5 letras).');
        if (lista(db).filter(r => r.estado === 'pendiente').length >= MAX_PENDIENTES) throw new HttpError(429, 'Por ahora no podemos recibir más reseñas. Intenta más tarde.');
        lista(db).push({
            id: siguienteId(db, 'resenas_cliente'), pedido_id: p.id, id_visual: contarNumeroDiario(db, p),
            nombre: nombrePublico(p.cliente), estrellas, texto, fecha: new Date().toISOString().slice(0, 10), estado: 'pendiente'
        });
        // Mantiene la lista liviana: guarda todas las pendientes y solo las últimas 300 ya resueltas (solo para no repetir)
        const pend = lista(db).filter(r => r.estado === 'pendiente'), resu = lista(db).filter(r => r.estado !== 'pendiente').slice(-300);
        db.resenas_cliente = resu.concat(pend).sort((a, b) => a.id - b.id);
        return ok({ msg: '¡Gracias! Tu reseña será revisada y publicada pronto.' });
    });

    // ---- Administración ----
    ruta('GET', '/api/resenas/por-aprobar', (ctx, db) => {
        requiereAdmin(ctx);
        return { resenas: lista(db).filter(r => r.estado === 'pendiente').map(r => ({ id: r.id, nombre: r.nombre, estrellas: r.estrellas, texto: r.texto, fecha: r.fecha, id_visual: r.id_visual })), publicadas: (db.resenas || []).length, maximo: MAX_PUBLICADAS };
    });
    ruta('POST', '/api/resenas/moderar', (ctx, db) => {
        requiereAdmin(ctx); const d = ctx.body || {};
        const r = lista(db).find(x => x.id === d.id);
        if (!r || r.estado !== 'pendiente') throw new HttpError(404, 'Esa reseña ya fue revisada.');
        if (d.accion === 'rechazar') { r.estado = 'rechazada'; r.texto = ''; return ok({ msg: 'Reseña rechazada' }); }
        if (d.accion !== 'aprobar') throw new HttpError(400, 'Acción no válida');
        db.resenas = db.resenas || [];
        if (db.resenas.length >= MAX_PUBLICADAS) throw new HttpError(409, `Ya tienes ${MAX_PUBLICADAS} reseñas publicadas. Elimina una en "Reseñas de clientes" para poder aprobar esta.`);
        const texto = limpiarTexto(d.texto != null ? d.texto : r.texto, 300) || r.texto; // el admin puede corregir ortografía antes de publicar
        const nueva = { id: siguienteId(db, 'resenas'), nombre: r.nombre, texto, estrellas: r.estrellas, activa: true };
        db.resenas.push(nueva);
        r.estado = 'aprobada'; r.texto = '';
        return ok({ resena: nueva, msg: 'Reseña publicada en la web' });
    });
}
