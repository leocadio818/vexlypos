// Shared constants for inventory module

export const INGREDIENT_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'carnes', label: 'Carnes' },
  { value: 'lacteos', label: 'Lácteos' },
  { value: 'vegetales', label: 'Vegetales' },
  { value: 'frutas', label: 'Frutas' },
  { value: 'bebidas', label: 'Bebidas' },
  { value: 'licores', label: 'Licores' },
  { value: 'condimentos', label: 'Condimentos' },
  { value: 'empaque', label: 'Empaque' },
  { value: 'limpieza', label: 'Limpieza' },
];

export const UNITS = [
  { value: 'unidad', label: 'Unidad' },
  { value: 'kg', label: 'Kilogramo (kg)' },
  { value: 'g', label: 'Gramo (g)' },
  { value: 'lb', label: 'Libra (lb)' },
  { value: 'oz', label: 'Onza (oz)' },
  { value: 'lt', label: 'Litro (lt)' },
  { value: 'ml', label: 'Mililitro (ml)' },
  { value: 'gal', label: 'Galón' },
  { value: 'botella', label: 'Botella' },
  { value: 'caja', label: 'Caja' },
  { value: 'paquete', label: 'Paquete' },
];

export const PO_STATUS = {
  draft: { label: 'Borrador', color: 'bg-gray-500' },
  pending: { label: 'Pendiente', color: 'bg-yellow-500' },
  partial: { label: 'Parcial', color: 'bg-blue-500' },
  received: { label: 'Recibida', color: 'bg-green-500' },
  cancelled: { label: 'Cancelada', color: 'bg-red-500' },
};

export const DIFFERENCE_REASONS = [
  { value: 'conteo_fisico', label: 'Conteo Físico' },
  { value: 'error_registro', label: 'Error de Registro' },
  { value: 'producto_danado', label: 'Producto Dañado' },
  { value: 'vencimiento', label: 'Vencimiento' },
  { value: 'perdida_desconocida', label: 'Pérdida Desconocida' },
  { value: 'robo', label: 'Robo/Hurto' },
  { value: 'otro', label: 'Otro' },
];
