// =====================================================================
// PERSONALIZACIÓN DE LA DEMO  (el único archivo que hay que editar)
// =====================================================================
// Aquí se define cómo se llama el negocio de ejemplo, qué vende y cuántas
// mesas tiene. Todo lo demás (menú del cliente, caja, cocina, mesas, admin,
// estadísticas, tickets, mensajes) se arma solo a partir de esto.
//
// Después de editar: abre la demo y pulsa «Reiniciar demo» (o borra los datos
// del sitio) para que se regeneren los datos con lo nuevo.
export const DEMO_CONFIG = {

    // ---- Marca del negocio de ejemplo -------------------------------
    nombreNegocio: 'El Castillo Food Mgta',
    emoji: '🏰',
    eslogan: 'Mesa, para llevar y delivery',

    // Moneda: el sistema original trabaja en dólares con conversión a bolívares.
    tasaBs: 40.0,

    // ---- Categorías --------------------------------------------------
    // Una categoría cuyo nombre contenga "bebida" o "refresco" se cuenta como
    // refresco en los avisos de delivery. "Combos" es la categoría de los combos.
    categorias: [
        { nombre: 'Combos', emoji: '🎉' },
        { nombre: 'Hamburguesas', emoji: '🍔' },
        { nombre: 'Pollo Frito', emoji: '🍗' },
        { nombre: 'Hot Dogs', emoji: '🌭' },
        { nombre: 'Pizzas', emoji: '🍕' },
        { nombre: 'Acompañantes', emoji: '🍟' },
        { nombre: 'Bebidas', emoji: '🥤' },
        { nombre: 'Postres', emoji: '🍦' }
    ],

    // ---- Productos ---------------------------------------------------
    // nombre · categoria · precio (USD) · emoji · descripcion
    // Opcionales: agotado:true · bandejas (empaques, por defecto 1) · cajasPizza
    //             paquete:{ precio, cantidad }  → "3 por $2" aunque suelto cueste más
    productos: [
        { nombre: 'Hamburguesa Clásica', categoria: 'Hamburguesas', precio: 4.5, emoji: '🍔', descripcion: 'Carne 120 g, queso, lechuga, tomate y salsa de la casa' },
        { nombre: 'Doble Queso', categoria: 'Hamburguesas', precio: 6, emoji: '🍔', descripcion: 'Doble carne y doble queso cheddar' },
        { nombre: 'BBQ Bacon', categoria: 'Hamburguesas', precio: 6.5, emoji: '🥓', descripcion: 'Carne, tocineta crujiente, cebolla caramelizada y salsa BBQ' },
        { nombre: 'Pollo Crispy', categoria: 'Hamburguesas', precio: 5.5, emoji: '🍔', descripcion: 'Pechuga empanizada, lechuga y mayonesa' },
        { nombre: 'Veggie', categoria: 'Hamburguesas', precio: 5, emoji: '🥬', descripcion: 'Medallón de lentejas, aguacate y tomate' },

        { nombre: 'Pollo Frito 2 Piezas', categoria: 'Pollo Frito', precio: 4, emoji: '🍗', descripcion: 'Dos piezas de pollo frito crujiente' },
        { nombre: 'Pollo Frito 4 Piezas', categoria: 'Pollo Frito', precio: 7, emoji: '🍗', descripcion: 'Cuatro piezas de pollo frito crujiente' },
        { nombre: 'Nuggets x6', categoria: 'Pollo Frito', precio: 3.5, emoji: '🍗', descripcion: 'Seis nuggets con salsa a elección' },
        { nombre: 'Alitas x8', categoria: 'Pollo Frito', precio: 6, emoji: '🍖', descripcion: 'Ocho alitas bañadas en salsa picante', agotado: true },

        { nombre: 'Hot Dog Clásico', categoria: 'Hot Dogs', precio: 2.5, emoji: '🌭', descripcion: 'Salchicha, salsas y papitas ralladas' },
        { nombre: 'Hot Dog Especial', categoria: 'Hot Dogs', precio: 3.5, emoji: '🌭', descripcion: 'Con queso, tocineta y cebolla crispy' },
        { nombre: 'Choripán', categoria: 'Hot Dogs', precio: 4, emoji: '🌭', descripcion: 'Chorizo parrillero en pan crujiente con chimichurri' },

        { nombre: 'Pizza Personal Pepperoni', categoria: 'Pizzas', precio: 5.5, emoji: '🍕', descripcion: 'Pizza individual de pepperoni', bandejas: 0, cajasPizza: 1 },
        { nombre: 'Pizza Personal Jamón y Queso', categoria: 'Pizzas', precio: 5.5, emoji: '🍕', descripcion: 'Pizza individual de jamón y queso', bandejas: 0, cajasPizza: 1 },

        { nombre: 'Papas Fritas Pequeñas', categoria: 'Acompañantes', precio: 2, emoji: '🍟', descripcion: 'Porción individual' },
        { nombre: 'Papas Fritas Grandes', categoria: 'Acompañantes', precio: 3, emoji: '🍟', descripcion: 'Porción para compartir' },
        { nombre: 'Aros de Cebolla', categoria: 'Acompañantes', precio: 3, emoji: '🧅', descripcion: 'Seis aros empanizados' },
        { nombre: 'Deditos de Queso', categoria: 'Acompañantes', precio: 0.8, emoji: '🧀', descripcion: 'Suelto a $0.80 · 3 por $2 (precio por paquete)', paquete: { precio: 2, cantidad: 3 } },

        { nombre: 'Refresco Cola', categoria: 'Bebidas', precio: 1.5, emoji: '🥤', descripcion: 'Lata 355 ml', bandejas: 0 },
        { nombre: 'Refresco Naranja', categoria: 'Bebidas', precio: 1.5, emoji: '🥤', descripcion: 'Lata 355 ml', bandejas: 0 },
        { nombre: 'Agua Mineral', categoria: 'Bebidas', precio: 1, emoji: '💧', descripcion: 'Botella 500 ml', bandejas: 0 },
        { nombre: 'Limonada Natural', categoria: 'Bebidas', precio: 2, emoji: '🍋', descripcion: 'Vaso grande, con hielo', bandejas: 0 },
        { nombre: 'Malteada de Chocolate', categoria: 'Bebidas', precio: 3.5, emoji: '🥛', descripcion: 'Cremosa, con crema batida', bandejas: 0 },

        { nombre: 'Helado de Vainilla', categoria: 'Postres', precio: 2, emoji: '🍦', descripcion: 'Copa con topping a elección' },
        { nombre: 'Brownie', categoria: 'Postres', precio: 2.5, emoji: '🍫', descripcion: 'Brownie tibio de chocolate' },
        { nombre: 'Churros x4', categoria: 'Postres', precio: 3, emoji: '🥖', descripcion: 'Cuatro churros con dulce de leche' }
    ],

    // ---- Combos ------------------------------------------------------
    // items:  { producto:'Nombre', cantidad:1 }        → viene fijo en el combo
    //         { categoria:'Bebidas', cantidad:1 }      → el cliente elige una de esa categoría
    // promo (opcional): al llevar `minimo` combos se regala `cantidad` de `producto`
    combos: [
        { nombre: 'Combo Clásico', precio: 7.5, emoji: '🍔', bandejas: 2,
          descripcion: 'Hamburguesa Clásica + papas pequeñas + tu bebida. ¡Lleva 2 y te regalamos un helado!',
          items: [{ producto: 'Hamburguesa Clásica' }, { producto: 'Papas Fritas Pequeñas' }, { categoria: 'Bebidas' }],
          promo: { minimo: 2, producto: 'Helado de Vainilla', cantidad: 1 } },
        { nombre: 'Combo Doble', precio: 9.5, emoji: '🍔', bandejas: 2,
          descripcion: 'Doble Queso + papas pequeñas + tu bebida',
          items: [{ producto: 'Doble Queso' }, { producto: 'Papas Fritas Pequeñas' }, { categoria: 'Bebidas' }] },
        { nombre: 'Combo Pollo', precio: 9, emoji: '🍗', bandejas: 2,
          descripcion: '4 piezas de pollo frito + papas pequeñas + tu bebida',
          items: [{ producto: 'Pollo Frito 4 Piezas' }, { producto: 'Papas Fritas Pequeñas' }, { categoria: 'Bebidas' }] },
        { nombre: 'Combo Dúo', precio: 13, emoji: '👫', bandejas: 3,
          descripcion: '2 hamburguesas a elección + papas grandes + 2 bebidas',
          items: [{ categoria: 'Hamburguesas', cantidad: 2 }, { producto: 'Papas Fritas Grandes' }, { categoria: 'Bebidas', cantidad: 2 }] },
        { nombre: 'Combo Familiar', precio: 24, emoji: '👨‍👩‍👧‍👦', bandejas: 5,
          descripcion: '4 hamburguesas a elección + 2 papas grandes + nuggets + 4 bebidas',
          items: [{ categoria: 'Hamburguesas', cantidad: 4 }, { producto: 'Papas Fritas Grandes', cantidad: 2 }, { producto: 'Nuggets x6' }, { categoria: 'Bebidas', cantidad: 4 }] },
        { nombre: 'Combo Pizza', precio: 9, emoji: '🍕', bandejas: 1, cajasPizza: 1,
          descripcion: 'Pizza personal a elección + papas pequeñas + tu bebida',
          items: [{ categoria: 'Pizzas' }, { producto: 'Papas Fritas Pequeñas' }, { categoria: 'Bebidas' }] }
    ],

    // ---- Mesas del local ---------------------------------------------
    mesas: [
        { nombre: 'Mesa 1', zona: 'Salón', capacidad: 2 },
        { nombre: 'Mesa 2', zona: 'Salón', capacidad: 2 },
        { nombre: 'Mesa 3', zona: 'Salón', capacidad: 4 },
        { nombre: 'Mesa 4', zona: 'Salón', capacidad: 4 },
        { nombre: 'Mesa 5', zona: 'Salón', capacidad: 6 },
        { nombre: 'Mesa 6', zona: 'Terraza', capacidad: 4 },
        { nombre: 'Mesa 7', zona: 'Terraza', capacidad: 4 },
        { nombre: 'Mesa 8', zona: 'Terraza', capacidad: 6 },
        { nombre: 'Barra 1', zona: 'Barra', capacidad: 2 },
        { nombre: 'Barra 2', zona: 'Barra', capacidad: 2 }
    ]
};

