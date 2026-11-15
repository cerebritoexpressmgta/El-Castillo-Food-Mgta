// Lo que se usa del plano desde fuera de esta carpeta.
export { Editor, type PropsDelEditor } from "./Editor"
export {
  VistaDelPlano,
  NOMBRE_DEL_ESTADO,
  type MesaDelPlano,
} from "./VistaDelPlano"
export {
  Marco,
  DibujoDeMesa,
  DibujoDeDecoracion,
  Fondo,
  Leyenda,
} from "./Lienzo"
export { aplicarGuardado, limpiarTexto, PlanoInvalido } from "./guardado"
export { planoDeEjemplo } from "./ejemplo"
export {
  LIENZO_POR_DEFECTO,
  sillas,
  type EstadoDeMesa,
  type Forma,
  type Lienzo,
  type PlanoParaGuardar,
  type ZonaGuardada,
  type MesaGuardada,
  type DecoracionGuardada,
  type TipoDeDecoracion,
} from "./plano"
