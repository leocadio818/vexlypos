import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { 
  Book, Download, ChevronRight, ChevronDown, 
  UtensilsCrossed, CreditCard, ShieldCheck, Users,
  Table2, Receipt, Send, Printer, Clock, Calculator,
  HelpCircle, CheckCircle2, AlertCircle
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// MANUAL DEL MESERO
// ═══════════════════════════════════════════════════════════════
const manualMesero = {
  titulo: "Manual del Mesero",
  descripcion: "Guía completa para tomar pedidos, gestionar mesas y atender clientes.",
  icon: UtensilsCrossed,
  color: "text-green-500",
  bgColor: "bg-green-500/10",
  secciones: [
    {
      id: "inicio-sesion",
      titulo: "1. Inicio de Sesión",
      contenido: [
        {
          tipo: "paso",
          texto: "Ingresa tu PIN de 4 dígitos en el teclado numérico"
        },
        {
          tipo: "paso",
          texto: "Presiona el botón 'ENTRAR'"
        },
        {
          tipo: "nota",
          texto: "Si olvidaste tu PIN, contacta al administrador para que te lo proporcione o lo resetee."
        }
      ]
    },
    {
      id: "abrir-mesa",
      titulo: "2. Abrir una Mesa",
      contenido: [
        {
          tipo: "paso",
          texto: "Toca 'Mesas' en el menú inferior"
        },
        {
          tipo: "paso",
          texto: "Las mesas verdes están disponibles, las rojas/naranjas están ocupadas"
        },
        {
          tipo: "paso",
          texto: "Toca una mesa verde para abrirla"
        },
        {
          tipo: "paso",
          texto: "Automáticamente entrarás a la pantalla de pedido"
        },
        {
          tipo: "importante",
          texto: "Solo puedes atender tus propias mesas. Si una mesa tiene otro mesero asignado, verás un mensaje indicándolo."
        }
      ]
    },
    {
      id: "tomar-pedido",
      titulo: "3. Tomar un Pedido",
      contenido: [
        {
          tipo: "paso",
          texto: "Una vez en la mesa, verás las categorías de productos arriba"
        },
        {
          tipo: "paso",
          texto: "Toca una categoría para ver los productos"
        },
        {
          tipo: "paso",
          texto: "Toca un producto para agregarlo al pedido"
        },
        {
          tipo: "paso",
          texto: "Si el producto tiene modificadores (ej: punto de cocción), selecciona las opciones requeridas"
        },
        {
          tipo: "paso",
          texto: "Para cambiar cantidad: toca el producto en la cuenta y usa +/-"
        },
        {
          tipo: "nota",
          texto: "Usa el icono de búsqueda (🔍) para encontrar productos rápidamente por nombre."
        }
      ]
    },
    {
      id: "enviar-cocina",
      titulo: "4. Enviar a Cocina/Bar",
      contenido: [
        {
          tipo: "paso",
          texto: "Cuando termines de agregar productos, toca el botón 'ENVIAR' (azul)"
        },
        {
          tipo: "paso",
          texto: "Los productos se enviarán automáticamente a cocina o bar según su categoría"
        },
        {
          tipo: "paso",
          texto: "Los items enviados cambiarán de 'Pendiente' a 'Enviado'"
        },
        {
          tipo: "importante",
          texto: "¡Los pedidos se envían automáticamente cuando sales de la mesa! Si agregas items y tocas 'Mesas', se enviarán solos."
        }
      ]
    },
    {
      id: "modificar-pedido",
      titulo: "5. Modificar un Pedido",
      contenido: [
        {
          tipo: "subtitulo",
          texto: "Agregar más items:"
        },
        {
          tipo: "paso",
          texto: "Simplemente agrega más productos como antes"
        },
        {
          tipo: "subtitulo",
          texto: "Eliminar items NO enviados:"
        },
        {
          tipo: "paso",
          texto: "Desliza el item hacia la izquierda"
        },
        {
          tipo: "paso",
          texto: "Toca el botón rojo de eliminar"
        },
        {
          tipo: "subtitulo",
          texto: "Anular items YA enviados:"
        },
        {
          tipo: "paso",
          texto: "Requiere autorización de un supervisor/gerente"
        },
        {
          tipo: "paso",
          texto: "Desliza el item y selecciona 'Anular'"
        },
        {
          tipo: "paso",
          texto: "Se pedirá el PIN de un supervisor"
        }
      ]
    },
    {
      id: "pre-cuenta",
      titulo: "6. Solicitar Pre-Cuenta",
      contenido: [
        {
          tipo: "paso",
          texto: "Toca el botón 'PRE-CUENTA' (verde/cyan)"
        },
        {
          tipo: "paso",
          texto: "Se imprimirá un ticket con el detalle y total estimado"
        },
        {
          tipo: "nota",
          texto: "La pre-cuenta NO es un comprobante fiscal. Es solo para que el cliente revise antes de pagar."
        }
      ]
    },
    {
      id: "dividir-cuenta",
      titulo: "7. Dividir la Cuenta",
      contenido: [
        {
          tipo: "paso",
          texto: "Toca el icono de 'Funciones' (⚙️) en el menú lateral"
        },
        {
          tipo: "paso",
          texto: "Selecciona 'Dividir Cuenta'"
        },
        {
          tipo: "paso",
          texto: "Selecciona los items que irán a la nueva cuenta"
        },
        {
          tipo: "paso",
          texto: "Confirma la división"
        },
        {
          tipo: "nota",
          texto: "Cada cuenta puede pagarse por separado y generar su propia factura."
        }
      ]
    },
    {
      id: "transferir-mesa",
      titulo: "8. Transferir Mesa",
      contenido: [
        {
          tipo: "paso",
          texto: "Toca 'Funciones' → 'Transferir Mesa'"
        },
        {
          tipo: "paso",
          texto: "Selecciona el mesero destino"
        },
        {
          tipo: "paso",
          texto: "Confirma la transferencia"
        },
        {
          tipo: "nota",
          texto: "Útil cuando termina tu turno o necesitas ayuda de otro mesero."
        }
      ]
    },
    {
      id: "mover-mesa",
      titulo: "9. Mover a Otra Mesa",
      contenido: [
        {
          tipo: "paso",
          texto: "Toca 'Funciones' → 'Mover Mesa'"
        },
        {
          tipo: "paso",
          texto: "Selecciona la mesa destino (debe estar disponible)"
        },
        {
          tipo: "paso",
          texto: "Confirma el movimiento"
        },
        {
          tipo: "nota",
          texto: "El pedido completo se moverá a la nueva mesa."
        }
      ]
    },
    {
      id: "consejos",
      titulo: "10. Consejos Útiles",
      contenido: [
        {
          tipo: "tip",
          texto: "Usa la vista de cuadrícula grande para seleccionar productos más fácil en pantallas pequeñas"
        },
        {
          tipo: "tip",
          texto: "El color de la mesa indica su estado: Verde=libre, Naranja=con pedido, Rojo=esperando pago"
        },
        {
          tipo: "tip",
          texto: "Puedes agregar notas a los items tocando el icono de nota junto al producto"
        },
        {
          tipo: "tip",
          texto: "Si un cliente quiere cambiar un modificador, anula el item y agrégalo de nuevo con el modificador correcto"
        }
      ]
    }
  ]
};

// ═══════════════════════════════════════════════════════════════
// MANUAL DEL CAJERO
// ═══════════════════════════════════════════════════════════════
const manualCajero = {
  titulo: "Manual del Cajero",
  descripcion: "Guía completa para procesar pagos, manejar la caja y generar facturas.",
  icon: CreditCard,
  color: "text-blue-500",
  bgColor: "bg-blue-500/10",
  secciones: [
    {
      id: "inicio-turno",
      titulo: "1. Inicio del Turno",
      contenido: [
        {
          tipo: "paso",
          texto: "Ingresa con tu PIN de cajero"
        },
        {
          tipo: "paso",
          texto: "Verifica que la jornada esté abierta (indicador verde en el sidebar)"
        },
        {
          tipo: "paso",
          texto: "Si la jornada está cerrada, contacta al administrador"
        },
        {
          tipo: "importante",
          texto: "Antes de procesar pagos, asegúrate de que haya una jornada activa."
        }
      ]
    },
    {
      id: "cobrar-mesa",
      titulo: "2. Cobrar una Mesa",
      contenido: [
        {
          tipo: "paso",
          texto: "Ve a 'Mesas' y selecciona una mesa con pedido (naranja/roja)"
        },
        {
          tipo: "paso",
          texto: "Revisa que todos los items estén correctos"
        },
        {
          tipo: "paso",
          texto: "Toca 'PRE-CUENTA' para que el cliente revise"
        },
        {
          tipo: "paso",
          texto: "Cuando el cliente esté listo, toca 'FACTURAR' (botón naranja)"
        }
      ]
    },
    {
      id: "formas-pago",
      titulo: "3. Formas de Pago",
      contenido: [
        {
          tipo: "subtitulo",
          texto: "Efectivo:"
        },
        {
          tipo: "paso",
          texto: "Selecciona 'Efectivo' como método de pago"
        },
        {
          tipo: "paso",
          texto: "Ingresa el monto recibido del cliente"
        },
        {
          tipo: "paso",
          texto: "El sistema calculará el cambio automáticamente"
        },
        {
          tipo: "subtitulo",
          texto: "Tarjeta:"
        },
        {
          tipo: "paso",
          texto: "Selecciona 'Tarjeta' como método de pago"
        },
        {
          tipo: "paso",
          texto: "Procesa el pago en el terminal de tarjetas"
        },
        {
          tipo: "paso",
          texto: "Confirma el pago en el sistema"
        },
        {
          tipo: "subtitulo",
          texto: "Pago Dividido:"
        },
        {
          tipo: "paso",
          texto: "Puedes combinar efectivo y tarjeta"
        },
        {
          tipo: "paso",
          texto: "Ingresa primero el monto en efectivo, luego el resto en tarjeta"
        }
      ]
    },
    {
      id: "tipo-factura",
      titulo: "4. Tipos de Factura (e-CF)",
      contenido: [
        {
          tipo: "subtitulo",
          texto: "Factura de Consumo (E32):"
        },
        {
          tipo: "paso",
          texto: "Para clientes finales sin RNC"
        },
        {
          tipo: "paso",
          texto: "No requiere datos del cliente"
        },
        {
          tipo: "subtitulo",
          texto: "Factura de Crédito Fiscal (E31):"
        },
        {
          tipo: "paso",
          texto: "Para empresas con RNC"
        },
        {
          tipo: "paso",
          texto: "Requiere: RNC, Razón Social del cliente"
        },
        {
          tipo: "paso",
          texto: "El cliente puede usar esta factura para crédito fiscal"
        },
        {
          tipo: "importante",
          texto: "Siempre pregunta al cliente si necesita factura con crédito fiscal ANTES de procesar."
        }
      ]
    },
    {
      id: "reimprimir",
      titulo: "5. Reimprimir Facturas",
      contenido: [
        {
          tipo: "paso",
          texto: "Ve a 'Caja/Turnos' en el menú"
        },
        {
          tipo: "paso",
          texto: "Busca la transacción en el listado"
        },
        {
          tipo: "paso",
          texto: "Toca el botón de reimprimir"
        },
        {
          tipo: "nota",
          texto: "Las reimpresiones se marcan como 'COPIA' automáticamente."
        }
      ]
    },
    {
      id: "anulaciones",
      titulo: "6. Anulaciones",
      contenido: [
        {
          tipo: "importante",
          texto: "Las anulaciones de facturas requieren autorización de administrador/gerente."
        },
        {
          tipo: "paso",
          texto: "Solo se pueden anular facturas del día actual"
        },
        {
          tipo: "paso",
          texto: "Se genera automáticamente una Nota de Crédito (E34)"
        },
        {
          tipo: "paso",
          texto: "El monto se descuenta del total de ventas del día"
        }
      ]
    },
    {
      id: "cierre-caja",
      titulo: "7. Cierre de Caja",
      contenido: [
        {
          tipo: "paso",
          texto: "Al final del turno, ve a 'Opciones' → 'Cierre de Día'"
        },
        {
          tipo: "paso",
          texto: "Revisa el resumen de ventas"
        },
        {
          tipo: "paso",
          texto: "Cuenta el efectivo en caja"
        },
        {
          tipo: "paso",
          texto: "Compara con el total del sistema"
        },
        {
          tipo: "paso",
          texto: "Reporta cualquier diferencia al administrador"
        },
        {
          tipo: "nota",
          texto: "El Reporte Z muestra todas las transacciones del día para cuadrar."
        }
      ]
    }
  ]
};

// ═══════════════════════════════════════════════════════════════
// MANUAL DEL ADMINISTRADOR
// ═══════════════════════════════════════════════════════════════
const manualAdmin = {
  titulo: "Manual del Administrador",
  descripcion: "Guía completa para configurar el sistema, gestionar usuarios y supervisar operaciones.",
  icon: ShieldCheck,
  color: "text-purple-500",
  bgColor: "bg-purple-500/10",
  secciones: [
    {
      id: "gestion-usuarios",
      titulo: "1. Gestión de Usuarios",
      contenido: [
        {
          tipo: "paso",
          texto: "Ve a 'Configuración' → 'Usuarios'"
        },
        {
          tipo: "paso",
          texto: "Para crear usuario: Toca '+', ingresa nombre, rol y PIN"
        },
        {
          tipo: "paso",
          texto: "Para editar: Toca el usuario y modifica sus datos"
        },
        {
          tipo: "paso",
          texto: "Para desactivar: Desmarca la casilla 'Activo'"
        },
        {
          tipo: "importante",
          texto: "Los PINs deben ser únicos. El sistema no permite duplicados."
        }
      ]
    },
    {
      id: "jornada",
      titulo: "2. Apertura y Cierre de Jornada",
      contenido: [
        {
          tipo: "subtitulo",
          texto: "Abrir Jornada:"
        },
        {
          tipo: "paso",
          texto: "Toca el indicador de jornada en el sidebar"
        },
        {
          tipo: "paso",
          texto: "Toca 'Abrir Día' e ingresa el fondo inicial de caja"
        },
        {
          tipo: "subtitulo",
          texto: "Cerrar Jornada:"
        },
        {
          tipo: "paso",
          texto: "Asegúrate de que TODAS las mesas estén cerradas"
        },
        {
          tipo: "paso",
          texto: "Toca 'Cerrar Día' en el modal de jornada"
        },
        {
          tipo: "paso",
          texto: "Revisa el Reporte Z antes de cerrar"
        },
        {
          tipo: "importante",
          texto: "No se puede cerrar la jornada si hay mesas abiertas."
        }
      ]
    },
    {
      id: "productos",
      titulo: "3. Gestión de Productos",
      contenido: [
        {
          tipo: "paso",
          texto: "Ve a 'Configuración' → 'Inventario'"
        },
        {
          tipo: "paso",
          texto: "Puedes crear categorías y productos"
        },
        {
          tipo: "paso",
          texto: "Configura modificadores para productos que los requieran"
        },
        {
          tipo: "paso",
          texto: "Asigna canales de impresión (cocina, bar, etc.)"
        }
      ]
    },
    {
      id: "impresoras",
      titulo: "4. Configuración de Impresoras",
      contenido: [
        {
          tipo: "paso",
          texto: "Ve a 'Configuración' → 'Impresoras'"
        },
        {
          tipo: "paso",
          texto: "Configura los canales: Cocina, Bar, Recibos"
        },
        {
          tipo: "paso",
          texto: "Asigna la IP o nombre de cada impresora"
        },
        {
          tipo: "paso",
          texto: "Prueba cada impresora con el botón de test"
        }
      ]
    },
    {
      id: "facturacion",
      titulo: "5. Configuración de Facturación",
      contenido: [
        {
          tipo: "paso",
          texto: "Ve a 'Configuración' → 'Facturación'"
        },
        {
          tipo: "paso",
          texto: "Configura el proveedor de e-CF (Alanube o The Factory)"
        },
        {
          tipo: "paso",
          texto: "Ingresa las credenciales del proveedor"
        },
        {
          tipo: "paso",
          texto: "Verifica la conexión con el botón de test"
        },
        {
          tipo: "importante",
          texto: "Sin configuración de e-CF, las facturas quedarán en estado 'CONTINGENCIA'."
        }
      ]
    },
    {
      id: "reportes",
      titulo: "6. Reportes",
      contenido: [
        {
          tipo: "paso",
          texto: "Ve a 'Reportes' en el menú principal"
        },
        {
          tipo: "paso",
          texto: "Dashboard de e-CF: Estado de facturas electrónicas"
        },
        {
          tipo: "paso",
          texto: "Reporte Z: Resumen de ventas del día"
        },
        {
          tipo: "paso",
          texto: "Historial: Todas las transacciones con filtros"
        }
      ]
    },
    {
      id: "autorizaciones",
      titulo: "7. Autorizaciones",
      contenido: [
        {
          tipo: "nota",
          texto: "Como administrador, tu PIN se usará para autorizar:"
        },
        {
          tipo: "paso",
          texto: "Anulación de items ya enviados a cocina"
        },
        {
          tipo: "paso",
          texto: "Anulación de facturas"
        },
        {
          tipo: "paso",
          texto: "Descuentos especiales"
        },
        {
          tipo: "paso",
          texto: "Cambios de precio"
        }
      ]
    }
  ]
};

// ═══════════════════════════════════════════════════════════════
// MANUAL DEL GERENTE
// ═══════════════════════════════════════════════════════════════
const manualGerente = {
  titulo: "Manual del Gerente",
  descripcion: "Guía para supervisar operaciones, autorizar transacciones y gestionar el equipo.",
  icon: Users,
  color: "text-orange-500",
  bgColor: "bg-orange-500/10",
  secciones: [
    {
      id: "supervision",
      titulo: "1. Supervisión de Operaciones",
      contenido: [
        {
          tipo: "paso",
          texto: "El Dashboard muestra el estado actual del restaurante"
        },
        {
          tipo: "paso",
          texto: "Mesas abiertas, órdenes activas, ocupación"
        },
        {
          tipo: "paso",
          texto: "Ventas del día en tiempo real"
        },
        {
          tipo: "nota",
          texto: "Revisa periódicamente las mesas con mucho tiempo abiertas."
        }
      ]
    },
    {
      id: "autorizaciones",
      titulo: "2. Autorizaciones",
      contenido: [
        {
          tipo: "nota",
          texto: "Tu PIN puede autorizar las mismas operaciones que el administrador:"
        },
        {
          tipo: "paso",
          texto: "Anulación de items enviados"
        },
        {
          tipo: "paso",
          texto: "Descuentos y cortesías"
        },
        {
          tipo: "paso",
          texto: "Cambios de precio"
        }
      ]
    },
    {
      id: "gestion-equipo",
      titulo: "3. Gestión del Equipo",
      contenido: [
        {
          tipo: "paso",
          texto: "Puedes ver qué mesero atiende cada mesa"
        },
        {
          tipo: "paso",
          texto: "Transferir mesas entre meseros si es necesario"
        },
        {
          tipo: "paso",
          texto: "Monitorear el tiempo de atención de cada mesa"
        }
      ]
    },
    {
      id: "reportes",
      titulo: "4. Reportes del Día",
      contenido: [
        {
          tipo: "paso",
          texto: "Accede a 'Reportes' para ver el desempeño"
        },
        {
          tipo: "paso",
          texto: "Reporte Z: Ventas totales, por método de pago"
        },
        {
          tipo: "paso",
          texto: "Historial: Detalle de cada transacción"
        }
      ]
    }
  ]
};

// Todos los manuales
const manuales = {
  waiter: manualMesero,
  cashier: manualCajero,
  admin: manualAdmin,
  manager: manualGerente
};

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export default function Help() {
  const { user } = useAuth();
  const { isMinimalist } = useTheme();
  const [selectedManual, setSelectedManual] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});

  const toggleSection = (sectionId) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  const userRole = user?.role || 'waiter';
  
  // Determinar qué manuales puede ver el usuario según su rol
  const getAvailableManuals = () => {
    const roleLevel = {
      'waiter': 20,
      'cashier': 40,
      'manager': 60,
      'admin': 100
    };
    const level = roleLevel[userRole] || 20;
    
    const available = [];
    if (level >= 20) available.push('waiter');
    if (level >= 40) available.push('cashier');
    if (level >= 60) available.push('manager');
    if (level >= 100) available.push('admin');
    
    return available;
  };

  const availableManuals = getAvailableManuals();

  const renderContent = (item, index) => {
    switch (item.tipo) {
      case 'paso':
        return (
          <div key={index} className="flex items-start gap-3 py-2">
            <div 
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
              style={isMinimalist ? {
                backgroundColor: '#DBEAFE',
                color: '#1E40AF'
              } : {
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                color: '#60A5FA'
              }}
            >
              {index + 1}
            </div>
            <p className={isMinimalist ? 'text-gray-700' : 'text-white/80'}>{item.texto}</p>
          </div>
        );
      case 'nota':
        return (
          <div 
            key={index} 
            className="flex items-start gap-3 p-3 rounded-lg my-2"
            style={isMinimalist ? {
              backgroundColor: '#F0F9FF',
              border: '1px solid #BAE6FD'
            } : {
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)'
            }}
          >
            <HelpCircle size={18} className="flex-shrink-0 text-blue-500 mt-0.5" />
            <p className={`text-sm ${isMinimalist ? 'text-blue-800' : 'text-blue-300'}`}>{item.texto}</p>
          </div>
        );
      case 'importante':
        return (
          <div 
            key={index} 
            className="flex items-start gap-3 p-3 rounded-lg my-2"
            style={isMinimalist ? {
              backgroundColor: '#FEF3C7',
              border: '1px solid #FCD34D'
            } : {
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)'
            }}
          >
            <AlertCircle size={18} className="flex-shrink-0 text-amber-500 mt-0.5" />
            <p className={`text-sm font-medium ${isMinimalist ? 'text-amber-800' : 'text-amber-300'}`}>{item.texto}</p>
          </div>
        );
      case 'tip':
        return (
          <div 
            key={index} 
            className="flex items-start gap-3 p-3 rounded-lg my-2"
            style={isMinimalist ? {
              backgroundColor: '#ECFDF5',
              border: '1px solid #6EE7B7'
            } : {
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}
          >
            <CheckCircle2 size={18} className="flex-shrink-0 text-green-500 mt-0.5" />
            <p className={`text-sm ${isMinimalist ? 'text-green-800' : 'text-green-300'}`}>{item.texto}</p>
          </div>
        );
      case 'subtitulo':
        return (
          <h4 
            key={index} 
            className={`font-semibold mt-4 mb-2 ${isMinimalist ? 'text-gray-800' : 'text-white'}`}
          >
            {item.texto}
          </h4>
        );
      default:
        return null;
    }
  };

  // Vista de lista de manuales
  if (!selectedManual) {
    return (
      <div className={`min-h-full p-4 md:p-6 ${isMinimalist ? 'bg-gray-50' : ''}`}>
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 
              className={`text-2xl md:text-3xl font-oswald font-bold mb-2 ${isMinimalist ? 'text-gray-900' : 'text-white'}`}
            >
              Centro de Ayuda
            </h1>
            <p className={isMinimalist ? 'text-gray-600' : 'text-white/60'}>
              Selecciona un manual para ver las instrucciones
            </p>
          </div>

          {/* Grid de Manuales */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {availableManuals.map(manualKey => {
              const manual = manuales[manualKey];
              const Icon = manual.icon;
              return (
                <button
                  key={manualKey}
                  onClick={() => setSelectedManual(manualKey)}
                  className={`p-6 rounded-xl text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${
                    isMinimalist 
                      ? 'bg-white border border-gray-200 hover:border-gray-300 hover:shadow-lg' 
                      : 'bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10'
                  }`}
                  data-testid={`manual-btn-${manualKey}`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-xl ${manual.bgColor}`}>
                      <Icon size={28} className={manual.color} />
                    </div>
                    <div className="flex-1">
                      <h3 className={`font-oswald font-bold text-lg mb-1 ${isMinimalist ? 'text-gray-900' : 'text-white'}`}>
                        {manual.titulo}
                      </h3>
                      <p className={`text-sm ${isMinimalist ? 'text-gray-600' : 'text-white/60'}`}>
                        {manual.descripcion}
                      </p>
                    </div>
                    <ChevronRight size={20} className={isMinimalist ? 'text-gray-400' : 'text-white/40'} />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Descargar PDFs */}
          <div className={`mt-8 p-6 rounded-xl ${isMinimalist ? 'bg-white border border-gray-200' : 'bg-white/5 border border-white/10'}`}>
            <h3 className={`font-oswald font-bold text-lg mb-4 flex items-center gap-2 ${isMinimalist ? 'text-gray-900' : 'text-white'}`}>
              <Download size={20} />
              Descargar Manuales PDF
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {availableManuals.map(manualKey => {
                const manual = manuales[manualKey];
                return (
                  <a
                    key={manualKey}
                    href={`/manuales/manual-${manualKey}.pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-2 px-4 py-3 rounded-lg transition-all ${
                      isMinimalist
                        ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                        : 'bg-white/10 hover:bg-white/20 text-white'
                    }`}
                    data-testid={`download-pdf-${manualKey}`}
                  >
                    <Book size={16} className={manual.color} />
                    <span className="text-sm font-medium">{manual.titulo.replace('Manual del ', '')}</span>
                  </a>
                );
              })}
            </div>
            <p className={`mt-3 text-xs ${isMinimalist ? 'text-gray-500' : 'text-white/40'}`}>
              Los PDFs incluyen capturas de pantalla y están optimizados para imprimir.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Vista de manual seleccionado
  const manual = manuales[selectedManual];
  const Icon = manual.icon;

  return (
    <div className={`min-h-full p-4 md:p-6 ${isMinimalist ? 'bg-gray-50' : ''}`}>
      <div className="max-w-3xl mx-auto">
        {/* Header con botón volver */}
        <button
          onClick={() => setSelectedManual(null)}
          className={`flex items-center gap-2 mb-6 px-3 py-2 rounded-lg transition-all ${
            isMinimalist 
              ? 'text-gray-600 hover:bg-gray-200' 
              : 'text-white/60 hover:bg-white/10'
          }`}
          data-testid="back-to-manuals"
        >
          <ChevronRight size={18} className="rotate-180" />
          <span>Volver a manuales</span>
        </button>

        {/* Título del manual */}
        <div className="flex items-center gap-4 mb-8">
          <div className={`p-4 rounded-xl ${manual.bgColor}`}>
            <Icon size={32} className={manual.color} />
          </div>
          <div>
            <h1 className={`text-2xl md:text-3xl font-oswald font-bold ${isMinimalist ? 'text-gray-900' : 'text-white'}`}>
              {manual.titulo}
            </h1>
            <p className={isMinimalist ? 'text-gray-600' : 'text-white/60'}>
              {manual.descripcion}
            </p>
          </div>
        </div>

        {/* Secciones */}
        <div className="space-y-4">
          {manual.secciones.map(seccion => (
            <div 
              key={seccion.id}
              className={`rounded-xl overflow-hidden ${
                isMinimalist 
                  ? 'bg-white border border-gray-200' 
                  : 'bg-white/5 border border-white/10'
              }`}
            >
              <button
                onClick={() => toggleSection(seccion.id)}
                className={`w-full flex items-center justify-between p-4 text-left transition-all ${
                  isMinimalist ? 'hover:bg-gray-50' : 'hover:bg-white/5'
                }`}
                data-testid={`section-${seccion.id}`}
              >
                <h3 className={`font-oswald font-bold text-lg ${isMinimalist ? 'text-gray-900' : 'text-white'}`}>
                  {seccion.titulo}
                </h3>
                {expandedSections[seccion.id] ? (
                  <ChevronDown size={20} className={isMinimalist ? 'text-gray-500' : 'text-white/50'} />
                ) : (
                  <ChevronRight size={20} className={isMinimalist ? 'text-gray-500' : 'text-white/50'} />
                )}
              </button>
              
              {expandedSections[seccion.id] && (
                <div className={`px-4 pb-4 ${isMinimalist ? 'border-t border-gray-100' : 'border-t border-white/10'}`}>
                  <div className="pt-2">
                    {seccion.contenido.map((item, idx) => renderContent(item, idx))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Botón descargar PDF */}
        <div className="mt-8 flex justify-center">
          <a
            href={`/manuales/manual-${selectedManual}.pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${
              isMinimalist
                ? 'bg-primary text-white hover:bg-primary/90'
                : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-400 hover:to-blue-400'
            }`}
            data-testid="download-current-pdf"
          >
            <Download size={18} />
            Descargar PDF
          </a>
        </div>
      </div>
    </div>
  );
}
