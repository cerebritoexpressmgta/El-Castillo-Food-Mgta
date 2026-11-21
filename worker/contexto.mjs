// Contexto POR SOLICITUD (AsyncLocalStorage). Reemplaza las variables globales del Worker:
// con varios negocios en la misma base, dos solicitudes simultáneas en el mismo isolate
// NO deben compartir fallos de login, evento del tablero, límite de sucursales ni negocio.
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();

export function correrEnContexto(valores, fn) { return als.run(Object.assign({ evento: null, fallos: {}, limite: 1, negocioId: 0, cuenta: null }, valores), fn); }
export function contexto() { return als.getStore() || { evento: null, fallos: {}, limite: 1, negocioId: 0 }; }
export function negocioActual() { return contexto().negocioId; }
