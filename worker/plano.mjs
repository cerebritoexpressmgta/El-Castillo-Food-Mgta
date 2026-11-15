// Plano del local: dónde está dibujada cada mesa, por sucursal y por zona.
//
// No cambia cómo funcionan las mesas (estado, cuenta, QR, cobro): les agrega
// el dibujo. Cada mesa guarda su sitio en `m.plano` ({x, y, ancho, alto,
// forma, rotacion}) y cada zona lo que se dibuja para orientarse (paredes,
// áreas, rótulos) en `db.plano_zonas`.
//
// El editor (carpeta /plano, hecha desde plano-de-mesas/) manda el plano de una
// sucursal ENTERO y aquí se compara con lo que había, con las reglas del plano
// original de Gelly (plano-de-mesas/referencia-backend/plano.py):
//   - lo que ya no viene se elimina, salvo una mesa en uso (409);
//   - el nombre de una mesa no se repite dentro de la sucursal;
//   - todo queda dentro del lienzo, con lados mínimos;
//   - al renombrar una mesa, sus pedidos la siguen (como en /api/mesas/guardar).

export const LIENZO = { ancho: 1200, alto: 800 };
const FORMAS = ['rectangular', 'redonda'];
const DECORACIONES = ['pared', 'area', 'texto'];
const LADO_MINIMO_MESA = 30;
const LADO_MINIMO_DECORACION = 6;
const MAX_PUESTOS = 30;
const MAX_ZONAS = 12;
const MAX_MESAS_POR_ZONA = 150;
const MAX_DECORACIONES_POR_ZONA = 80;
const LARGO_NOMBRE_MESA = 30; // el mismo tope que /api/mesas/guardar
const LARGO_NOMBRE_ZONA = 30;

// Sucursal de una mesa como número: 0 = sin sucursal.
const sucursalDe = (m) => Number(m.sucursal_id || 0);

// Mesas que todavía no se han dibujado: se acomodan en filas, sin pisar a las
// que sí tienen sitio. Es solo una propuesta: no se guarda hasta que el
// administrador guarde el plano.
function acomodar(mesas) {
    const puestas = mesas.filter(m => m.plano).map(m => m.plano);
    const choca = (c) => puestas.some(o => c.x < o.x + o.ancho + 20 && o.x < c.x + c.ancho + 20 && c.y < o.y + o.alto + 30 && o.y < c.y + c.alto + 30);
    const resultado = new Map();
    let x = 80, y = 90;
    for (const m of mesas) {
        if (m.plano) continue;
        const larga = (m.capacidad || 4) > 4;
        const caja = { ancho: larga ? 170 : 90, alto: 90, forma: 'rectangular', rotacion: 0 };
        for (let intento = 0; intento < 200; intento++) {
            if (x + caja.ancho > LIENZO.ancho - 40) { x = 80; y += 150; }
            if (y + caja.alto > LIENZO.alto - 20) { y = LIENZO.alto - caja.alto - 20; break; }
            if (!choca({ x, y, ancho: caja.ancho, alto: caja.alto })) break;
            x += 60;
        }
        const plano = Object.assign({ x, y }, caja);
        resultado.set(m.id, plano);
        puestas.push(plano);
        x += caja.ancho + 70;
    }
    return resultado;
}

function numero(v, que, HttpError) {
    const n = Number(v);
    if (typeof v !== 'number' || !Number.isFinite(n)) throw new HttpError(400, 'Una pieza tiene una medida que no es válida. Revisa su ancho, alto y giro, o recarga la página e inténtalo de nuevo.');
    return n;
}
const redondear = (v) => Math.round(v * 10) / 10;
function caja(e, ladoMinimo, HttpError) {
    const ancho = Math.min(Math.max(numero(e.ancho, 'Un ancho', HttpError), ladoMinimo), LIENZO.ancho);
    const alto = Math.min(Math.max(numero(e.alto, 'Un alto', HttpError), ladoMinimo), LIENZO.alto);
    const x = Math.min(Math.max(numero(e.x, 'Una posición', HttpError), 0), LIENZO.ancho - ancho);
    const y = Math.min(Math.max(numero(e.y, 'Una posición', HttpError), 0), LIENZO.alto - alto);
    const rotacion = ((numero(e.rotacion, 'Un giro', HttpError) % 360) + 360) % 360;
    return { x: redondear(x), y: redondear(y), ancho: redondear(ancho), alto: redondear(alto), rotacion: redondear(rotacion) };
}

export function registrarPlano(h) {
    const { ruta, ok, HttpError, requiereStaff, requiereAdmin, limpiarTexto, siguienteId, sucursalDelPersonal, idSucursalValido, sucursalesActivas, esEntregaMesa, emitirTablero } = h;

    // Qué sucursal se dibuja: la del empleado si tiene una; si no, la pedida.
    function sucursalPedida(ctx, db) {
        const mia = sucursalDelPersonal(ctx, db);
        if (mia) return mia;
        const pedida = parseInt(ctx.query.sucursal ?? (ctx.body || {}).sucursal_id, 10) || 0;
        if (pedida && !idSucursalValido(db, pedida)) throw new HttpError(400, 'Esa sucursal no existe.');
        return pedida;
    }

    // Las sucursales que tienen (o pueden tener) plano, para el selector del
    // editor. Un negocio de un solo local no ve selector (lista vacía), salvo que
    // tenga mesas repartidas entre "sin sucursal" y su sucursal.
    function opcionesDeSucursal(db) {
        const activas = sucursalesActivas(db);
        const lista = activas.map(s => ({ id: s.id, nombre: s.nombre }));
        if (db.mesas.some(m => !m.sucursal_id)) lista.unshift({ id: 0, nombre: 'Mesas sin sucursal' });
        const usadas = new Set(db.mesas.map(sucursalDe));
        return lista.length > 1 && (activas.length > 1 || usadas.size > 1) ? lista : [];
    }

    // `paraVer`: la pantalla de Mesas suma, como la cuadrícula (mesaEnSucursal),
    // las mesas sin sucursal, que son "de todas". El editor no: esas se dibujan
    // en su propio plano ("Mesas sin sucursal").
    function leerPlano(db, sid, paraVer) {
        const mesas = db.mesas.filter(m => sucursalDe(m) === sid || (paraVer && sid && !m.sucursal_id)).sort((a, b) => a.id - b.id);
        const guardadas = (db.plano_zonas || []).filter(z => Number(z.sucursal_id || 0) === sid).sort((a, b) => a.orden - b.orden);
        // Zonas: primero las del plano guardado, en su orden; luego las que solo
        // existen como texto en alguna mesa (creadas desde Administración → Mesas).
        const nombres = guardadas.map(z => z.nombre);
        mesas.forEach(m => { if (!nombres.some(n => n.toLowerCase() === String(m.zona || 'Salón').toLowerCase())) nombres.push(m.zona || 'Salón'); });
        return nombres.map((nombre, i) => {
            const enZona = mesas.filter(m => String(m.zona || 'Salón').toLowerCase() === nombre.toLowerCase());
            const propuestas = acomodar(enZona);
            const z = guardadas.find(g => g.nombre === nombre);
            return {
                // El id de zona solo sirve al editor para distinguirlas: al guardar se identifican por nombre.
                id: i + 1,
                nombre,
                decoracion: z ? z.decoracion : [],
                mesas: enZona.map(m => {
                    const p = m.plano || propuestas.get(m.id);
                    return { id: m.id, nombre: m.nombre, forma: p.forma, x: p.x, y: p.y, ancho: p.ancho, alto: p.alto, rotacion: p.rotacion, puestos: m.capacidad || 0 };
                })
            };
        });
    }

    // Lo que dibuja el editor y la pantalla de Mesas. Lo ve todo el personal.
    ruta('GET', '/api/mesas/plano', (ctx, db) => {
        requiereStaff(ctx);
        // Sin sucursal pedida (negocio de un solo local): la de las mesas que haya.
        const primera = db.mesas.slice().sort((a, b) => a.id - b.id)[0];
        const sid = ctx.query.sucursal === undefined && !sucursalDelPersonal(ctx, db) && primera
            ? sucursalDe(primera)
            : sucursalPedida(ctx, db);
        return {
            lienzo: LIENZO,
            sucursal_id: sid,
            sucursales: sucursalDelPersonal(ctx, db) ? [] : opcionesDeSucursal(db),
            zonas: leerPlano(db, sid, ctx.query.vista === '1'),
            // Las mesas que no se pueden quitar del plano: las que están en uso.
            bloqueadas: db.mesas.filter(m => sucursalDe(m) === sid && m.estado !== 'libre').map(m => m.id)
        };
    });

    // Guarda el plano entero de una sucursal (solo administradores).
    ruta('POST', '/api/mesas/plano/guardar', (ctx, db) => {
        requiereAdmin(ctx);
        const sid = sucursalPedida(ctx, db);
        const zonas = Array.isArray((ctx.body || {}).zonas) ? ctx.body.zonas : null;
        if (!zonas) throw new HttpError(422, 'No llegó el plano al guardar. Recarga la página e inténtalo de nuevo.');
        if (zonas.length > MAX_ZONAS) throw new HttpError(400, `El plano admite hasta ${MAX_ZONAS} zonas.`);

        const mesasDeAntes = new Map(db.mesas.filter(m => sucursalDe(m) === sid).map(m => [m.id, m]));

        // 1) Todo se revisa antes de cambiar nada.
        const nombresZona = new Set(), nombresMesa = new Set(), vistas = new Set();
        const limpias = zonas.map(z => {
            const nombre = limpiarTexto(z && z.nombre, LARGO_NOMBRE_ZONA);
            if (!nombre) throw new HttpError(400, 'Cada zona necesita un nombre.');
            if (nombresZona.has(nombre.toLowerCase())) throw new HttpError(400, `Hay dos zonas llamadas «${nombre}».`);
            nombresZona.add(nombre.toLowerCase());
            const mesas = Array.isArray(z.mesas) ? z.mesas : [];
            const decoracion = Array.isArray(z.decoracion) ? z.decoracion : [];
            if (mesas.length > MAX_MESAS_POR_ZONA) throw new HttpError(400, `Una zona admite hasta ${MAX_MESAS_POR_ZONA} mesas.`);
            if (decoracion.length > MAX_DECORACIONES_POR_ZONA) throw new HttpError(400, `Esa zona tiene demasiadas paredes, áreas y rótulos (máximo ${MAX_DECORACIONES_POR_ZONA}). Quita algunos.`);
            return {
                nombre,
                mesas: mesas.map(m => {
                    const nombreMesa = limpiarTexto(m && m.nombre, LARGO_NOMBRE_MESA);
                    if (!nombreMesa) throw new HttpError(400, 'Cada mesa necesita un nombre o un número.');
                    if (nombresMesa.has(nombreMesa.toLowerCase())) throw new HttpError(400, `Hay dos mesas llamadas «${nombreMesa}». Cada una necesita un nombre distinto.`);
                    nombresMesa.add(nombreMesa.toLowerCase());
                    if (!FORMAS.includes(m.forma)) throw new HttpError(400, 'Una mesa tiene una forma que no existe. Elige Recta o Redonda.');
                    const puestos = Number(m.puestos);
                    if (!Number.isInteger(puestos) || puestos < 1 || puestos > MAX_PUESTOS) throw new HttpError(400, `Cada mesa lleva de 1 a ${MAX_PUESTOS} puestos.`);
                    const id = m.id == null ? null : Number(m.id);
                    if (id !== null && (!mesasDeAntes.has(id) || vistas.has(id))) throw new HttpError(409, 'Alguien cambió el plano desde otra pantalla y el tuyo ya no coincide. Recarga la página y vuelve a hacer tus cambios.');
                    if (id !== null) vistas.add(id);
                    return { id, nombre: nombreMesa, puestos, forma: m.forma, ...caja(m, LADO_MINIMO_MESA, HttpError) };
                }),
                decoracion: decoracion.map(e => {
                    if (!e || !DECORACIONES.includes(e.tipo)) throw new HttpError(400, 'Hay una pieza del plano que no se reconoce. Recarga la página e inténtalo de nuevo.');
                    return { tipo: e.tipo, ...caja(e, LADO_MINIMO_DECORACION, HttpError), texto: limpiarTexto(e.texto, 30) };
                })
            };
        });

        // 2) Lo que desaparece del plano no puede estar en uso.
        const quitadas = [...mesasDeAntes.values()].filter(m => !vistas.has(m.id));
        const enUso = quitadas.find(m => m.estado !== 'libre');
        if (enUso) throw new HttpError(409, `La mesa ${enUso.nombre} está en uso. Cóbrala y libérala antes de quitarla del plano.`);

        // 3) Se aplica.
        // Los pedidos de cada mesa renombrada se buscan ANTES de renombrar nada:
        // si se intercambian dos nombres (A↔B) en un mismo guardado, renombrar en
        // cadena mezclaría los pedidos de las dos mesas.
        const pedidosQueSiguen = [];
        for (const z of limpias) for (const d of z.mesas) {
            const m = d.id !== null && mesasDeAntes.get(d.id);
            if (!m || m.nombre === d.nombre) continue;
            db.pedidos.filter(p => esEntregaMesa(p.tipo_entrega) && p.direccion === m.nombre && (!m.sucursal_id || Number(p.sucursal_id) === Number(m.sucursal_id)))
                .forEach(p => pedidosQueSiguen.push([p, d.nombre]));
        }
        pedidosQueSiguen.forEach(([p, nombre]) => { p.direccion = nombre; });

        const sucursalNueva = sid ? idSucursalValido(db, sid) : null;
        for (const z of limpias) {
            for (const d of z.mesas) {
                const plano = { x: d.x, y: d.y, ancho: d.ancho, alto: d.alto, forma: d.forma, rotacion: d.rotacion };
                if (d.id === null) {
                    db.mesas.push({ id: siguienteId(db, 'mesas'), nombre: d.nombre, zona: z.nombre, capacidad: d.puestos, estado: 'libre', ocupada_desde: null, sucursal_id: sucursalNueva, plano });
                    continue;
                }
                const m = mesasDeAntes.get(d.id);
                m.nombre = d.nombre; m.zona = z.nombre; m.capacidad = d.puestos; m.plano = plano;
            }
        }
        const idsQuitados = new Set(quitadas.map(m => m.id));
        db.mesas = db.mesas.filter(m => !idsQuitados.has(m.id));
        db.plano_zonas = (db.plano_zonas || []).filter(z => Number(z.sucursal_id || 0) !== sid)
            .concat(limpias.map((z, orden) => ({ sucursal_id: sid || null, nombre: z.nombre, orden, decoracion: z.decoracion })));

        ctx.tras.push(() => emitirTablero('mesas', sid || null));
        return ok();
    });
}
