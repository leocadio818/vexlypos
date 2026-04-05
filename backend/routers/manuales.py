"""
Manual PDF Generator - Generates PDF manuals for each role
"""
from fastapi import APIRouter, Response
from weasyprint import HTML, CSS
from weasyprint.text.fonts import FontConfiguration
import io

router = APIRouter(prefix="/manuales", tags=["manuales"])

# ═══════════════════════════════════════════════════════════════
# ESTILOS CSS PARA PDFs
# ═══════════════════════════════════════════════════════════════
PDF_CSS = """
@page {
    size: letter;
    margin: 2cm 1.5cm;
    @bottom-center {
        content: "Página " counter(page) " de " counter(pages);
        font-size: 10px;
        color: #666;
    }
}

body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #1a1a1a;
}

h1 {
    font-size: 24pt;
    color: #0f172a;
    border-bottom: 3px solid #3b82f6;
    padding-bottom: 10px;
    margin-bottom: 20px;
}

h2 {
    font-size: 16pt;
    color: #1e40af;
    margin-top: 30px;
    margin-bottom: 15px;
    padding: 10px 15px;
    background: #eff6ff;
    border-left: 4px solid #3b82f6;
    page-break-after: avoid;
}

h3 {
    font-size: 12pt;
    color: #374151;
    margin-top: 20px;
    margin-bottom: 10px;
}

.header {
    text-align: center;
    margin-bottom: 40px;
    padding: 30px;
    background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
    color: white;
    border-radius: 10px;
}

.header h1 {
    color: white;
    border: none;
    margin: 0;
    padding: 0;
}

.header p {
    color: rgba(255,255,255,0.9);
    margin: 10px 0 0 0;
}

.paso {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin: 12px 0;
    padding: 10px 15px;
    background: #f8fafc;
    border-radius: 8px;
}

.paso-num {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    background: #3b82f6;
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 12px;
}

.paso-text {
    flex: 1;
    padding-top: 4px;
}

.nota {
    margin: 15px 0;
    padding: 15px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 8px;
    font-size: 10pt;
}

.nota-icon {
    color: #3b82f6;
    font-weight: bold;
}

.importante {
    margin: 15px 0;
    padding: 15px;
    background: #fef3c7;
    border: 1px solid #fcd34d;
    border-radius: 8px;
    font-size: 10pt;
}

.importante-icon {
    color: #d97706;
    font-weight: bold;
}

.tip {
    margin: 15px 0;
    padding: 15px;
    background: #ecfdf5;
    border: 1px solid #6ee7b7;
    border-radius: 8px;
    font-size: 10pt;
}

.tip-icon {
    color: #059669;
    font-weight: bold;
}

.footer {
    margin-top: 50px;
    padding-top: 20px;
    border-top: 1px solid #e5e7eb;
    text-align: center;
    font-size: 9pt;
    color: #6b7280;
}

.toc {
    margin: 30px 0;
    padding: 20px;
    background: #f8fafc;
    border-radius: 10px;
}

.toc h2 {
    margin-top: 0;
    background: none;
    padding: 0;
    border: none;
}

.toc ul {
    list-style: none;
    padding: 0;
}

.toc li {
    padding: 8px 0;
    border-bottom: 1px dotted #d1d5db;
}

.toc li:last-child {
    border-bottom: none;
}

.section {
    page-break-inside: avoid;
}
"""

# ═══════════════════════════════════════════════════════════════
# CONTENIDO DE LOS MANUALES
# ═══════════════════════════════════════════════════════════════

def generar_manual_mesero():
    return f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>Manual del Mesero - VexlyPOS</title>
    </head>
    <body>
        <div class="header">
            <h1>📋 Manual del Mesero</h1>
            <p>Guía completa para tomar pedidos, gestionar mesas y atender clientes</p>
            <p style="font-size: 10pt; margin-top: 15px;">VexlyPOS - Sistema de Punto de Venta</p>
        </div>
        
        <div class="toc">
            <h2>Contenido</h2>
            <ul>
                <li>1. Inicio de Sesión</li>
                <li>2. Abrir una Mesa</li>
                <li>3. Tomar un Pedido</li>
                <li>4. Enviar a Cocina/Bar</li>
                <li>5. Modificar un Pedido</li>
                <li>6. Solicitar Pre-Cuenta</li>
                <li>7. Dividir la Cuenta</li>
                <li>8. Transferir Mesa</li>
                <li>9. Mover a Otra Mesa</li>
                <li>10. Consejos Útiles</li>
            </ul>
        </div>
        
        <div class="section">
            <h2>1. Inicio de Sesión</h2>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Ingresa tu PIN de 4 dígitos en el teclado numérico</div>
            </div>
            <div class="paso">
                <div class="paso-num">2</div>
                <div class="paso-text">Presiona el botón <strong>ENTRAR</strong></div>
            </div>
            <div class="nota">
                <span class="nota-icon">ℹ️ Nota:</span> Si olvidaste tu PIN, contacta al administrador para que te lo proporcione o lo resetee.
            </div>
        </div>
        
        <div class="section">
            <h2>2. Abrir una Mesa</h2>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Toca <strong>Mesas</strong> en el menú inferior</div>
            </div>
            <div class="paso">
                <div class="paso-num">2</div>
                <div class="paso-text">Las mesas <span style="color: #22c55e; font-weight: bold;">verdes</span> están disponibles, las <span style="color: #f97316; font-weight: bold;">naranjas/rojas</span> están ocupadas</div>
            </div>
            <div class="paso">
                <div class="paso-num">3</div>
                <div class="paso-text">Toca una mesa verde para abrirla</div>
            </div>
            <div class="paso">
                <div class="paso-num">4</div>
                <div class="paso-text">Automáticamente entrarás a la pantalla de pedido</div>
            </div>
            <div class="importante">
                <span class="importante-icon">⚠️ Importante:</span> Solo puedes atender tus propias mesas. Si una mesa tiene otro mesero asignado, verás un mensaje indicándolo.
            </div>
        </div>
        
        <div class="section">
            <h2>3. Tomar un Pedido</h2>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Una vez en la mesa, verás las categorías de productos arriba</div>
            </div>
            <div class="paso">
                <div class="paso-num">2</div>
                <div class="paso-text">Toca una categoría para ver los productos</div>
            </div>
            <div class="paso">
                <div class="paso-num">3</div>
                <div class="paso-text">Toca un producto para agregarlo al pedido</div>
            </div>
            <div class="paso">
                <div class="paso-num">4</div>
                <div class="paso-text">Si el producto tiene modificadores (ej: punto de cocción), selecciona las opciones requeridas</div>
            </div>
            <div class="paso">
                <div class="paso-num">5</div>
                <div class="paso-text">Para cambiar cantidad: toca el producto en la cuenta y usa +/-</div>
            </div>
            <div class="nota">
                <span class="nota-icon">💡 Tip:</span> Usa el icono de búsqueda (🔍) para encontrar productos rápidamente por nombre.
            </div>
        </div>
        
        <div class="section">
            <h2>4. Enviar a Cocina/Bar</h2>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Cuando termines de agregar productos, toca el botón <strong style="color: #3b82f6;">ENVIAR</strong> (azul)</div>
            </div>
            <div class="paso">
                <div class="paso-num">2</div>
                <div class="paso-text">Los productos se enviarán automáticamente a cocina o bar según su categoría</div>
            </div>
            <div class="paso">
                <div class="paso-num">3</div>
                <div class="paso-text">Los items enviados cambiarán de "Pendiente" a "Enviado"</div>
            </div>
            <div class="importante">
                <span class="importante-icon">⚠️ Importante:</span> ¡Los pedidos se envían automáticamente cuando sales de la mesa! Si agregas items y tocas "Mesas", se enviarán solos.
            </div>
        </div>
        
        <div class="section">
            <h2>5. Modificar un Pedido</h2>
            <h3>Agregar más items:</h3>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Simplemente agrega más productos como antes</div>
            </div>
            
            <h3>Eliminar items NO enviados:</h3>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Desliza el item hacia la izquierda</div>
            </div>
            <div class="paso">
                <div class="paso-num">2</div>
                <div class="paso-text">Toca el botón rojo de eliminar</div>
            </div>
            
            <h3>Anular items YA enviados:</h3>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Requiere autorización de un supervisor/gerente</div>
            </div>
            <div class="paso">
                <div class="paso-num">2</div>
                <div class="paso-text">Desliza el item y selecciona "Anular"</div>
            </div>
            <div class="paso">
                <div class="paso-num">3</div>
                <div class="paso-text">Se pedirá el PIN de un supervisor</div>
            </div>
        </div>
        
        <div class="section">
            <h2>6. Solicitar Pre-Cuenta</h2>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Toca el botón <strong style="color: #06b6d4;">PRE-CUENTA</strong> (cyan/verde)</div>
            </div>
            <div class="paso">
                <div class="paso-num">2</div>
                <div class="paso-text">Se imprimirá un ticket con el detalle y total estimado</div>
            </div>
            <div class="nota">
                <span class="nota-icon">ℹ️ Nota:</span> La pre-cuenta NO es un comprobante fiscal. Es solo para que el cliente revise antes de pagar.
            </div>
        </div>
        
        <div class="section">
            <h2>7. Dividir la Cuenta</h2>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Toca el icono de <strong>Funciones</strong> (⚙️) en el menú lateral</div>
            </div>
            <div class="paso">
                <div class="paso-num">2</div>
                <div class="paso-text">Selecciona <strong>Dividir Cuenta</strong></div>
            </div>
            <div class="paso">
                <div class="paso-num">3</div>
                <div class="paso-text">Selecciona los items que irán a la nueva cuenta</div>
            </div>
            <div class="paso">
                <div class="paso-num">4</div>
                <div class="paso-text">Confirma la división</div>
            </div>
            <div class="nota">
                <span class="nota-icon">ℹ️ Nota:</span> Cada cuenta puede pagarse por separado y generar su propia factura.
            </div>
        </div>
        
        <div class="section">
            <h2>8. Transferir Mesa</h2>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Toca <strong>Funciones</strong> → <strong>Transferir Mesa</strong></div>
            </div>
            <div class="paso">
                <div class="paso-num">2</div>
                <div class="paso-text">Selecciona el mesero destino</div>
            </div>
            <div class="paso">
                <div class="paso-num">3</div>
                <div class="paso-text">Confirma la transferencia</div>
            </div>
            <div class="nota">
                <span class="nota-icon">💡 Tip:</span> Útil cuando termina tu turno o necesitas ayuda de otro mesero.
            </div>
        </div>
        
        <div class="section">
            <h2>9. Mover a Otra Mesa</h2>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Toca <strong>Funciones</strong> → <strong>Mover Mesa</strong></div>
            </div>
            <div class="paso">
                <div class="paso-num">2</div>
                <div class="paso-text">Selecciona la mesa destino (debe estar disponible)</div>
            </div>
            <div class="paso">
                <div class="paso-num">3</div>
                <div class="paso-text">Confirma el movimiento</div>
            </div>
            <div class="nota">
                <span class="nota-icon">ℹ️ Nota:</span> El pedido completo se moverá a la nueva mesa.
            </div>
        </div>
        
        <div class="section">
            <h2>10. Consejos Útiles</h2>
            <div class="tip">
                <span class="tip-icon">✅</span> Usa la vista de cuadrícula grande para seleccionar productos más fácil en pantallas pequeñas
            </div>
            <div class="tip">
                <span class="tip-icon">✅</span> El color de la mesa indica su estado: <span style="color: #22c55e;">Verde</span>=libre, <span style="color: #f97316;">Naranja</span>=con pedido, <span style="color: #ef4444;">Rojo</span>=esperando pago
            </div>
            <div class="tip">
                <span class="tip-icon">✅</span> Puedes agregar notas a los items tocando el icono de nota junto al producto
            </div>
            <div class="tip">
                <span class="tip-icon">✅</span> Si un cliente quiere cambiar un modificador, anula el item y agrégalo de nuevo con el modificador correcto
            </div>
        </div>
        
        <div class="footer">
            <p>VexlyPOS - Sistema de Punto de Venta para Restaurantes</p>
            <p>© 2024-2026 Todos los derechos reservados</p>
        </div>
    </body>
    </html>
    """


def generar_manual_cajero():
    return f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>Manual del Cajero - VexlyPOS</title>
    </head>
    <body>
        <div class="header">
            <h1>💳 Manual del Cajero</h1>
            <p>Guía completa para procesar pagos, manejar la caja y generar facturas</p>
            <p style="font-size: 10pt; margin-top: 15px;">VexlyPOS - Sistema de Punto de Venta</p>
        </div>
        
        <div class="toc">
            <h2>Contenido</h2>
            <ul>
                <li>1. Inicio del Turno</li>
                <li>2. Cobrar una Mesa</li>
                <li>3. Formas de Pago</li>
                <li>4. Tipos de Factura (e-CF)</li>
                <li>5. Reimprimir Facturas</li>
                <li>6. Anulaciones</li>
                <li>7. Cierre de Caja</li>
            </ul>
        </div>
        
        <div class="section">
            <h2>1. Inicio del Turno</h2>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Ingresa con tu PIN de cajero</div>
            </div>
            <div class="paso">
                <div class="paso-num">2</div>
                <div class="paso-text">Verifica que la jornada esté abierta (indicador verde en el sidebar)</div>
            </div>
            <div class="paso">
                <div class="paso-num">3</div>
                <div class="paso-text">Si la jornada está cerrada, contacta al administrador</div>
            </div>
            <div class="importante">
                <span class="importante-icon">⚠️ Importante:</span> Antes de procesar pagos, asegúrate de que haya una jornada activa.
            </div>
        </div>
        
        <div class="section">
            <h2>2. Cobrar una Mesa</h2>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Ve a <strong>Mesas</strong> y selecciona una mesa con pedido (naranja/roja)</div>
            </div>
            <div class="paso">
                <div class="paso-num">2</div>
                <div class="paso-text">Revisa que todos los items estén correctos</div>
            </div>
            <div class="paso">
                <div class="paso-num">3</div>
                <div class="paso-text">Toca <strong>PRE-CUENTA</strong> para que el cliente revise</div>
            </div>
            <div class="paso">
                <div class="paso-num">4</div>
                <div class="paso-text">Cuando el cliente esté listo, toca <strong style="color: #f97316;">FACTURAR</strong> (botón naranja)</div>
            </div>
        </div>
        
        <div class="section">
            <h2>3. Formas de Pago</h2>
            
            <h3>💵 Efectivo:</h3>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Selecciona <strong>Efectivo</strong> como método de pago</div>
            </div>
            <div class="paso">
                <div class="paso-num">2</div>
                <div class="paso-text">Ingresa el monto recibido del cliente</div>
            </div>
            <div class="paso">
                <div class="paso-num">3</div>
                <div class="paso-text">El sistema calculará el cambio automáticamente</div>
            </div>
            
            <h3>💳 Tarjeta:</h3>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Selecciona <strong>Tarjeta</strong> como método de pago</div>
            </div>
            <div class="paso">
                <div class="paso-num">2</div>
                <div class="paso-text">Procesa el pago en el terminal de tarjetas</div>
            </div>
            <div class="paso">
                <div class="paso-num">3</div>
                <div class="paso-text">Confirma el pago en el sistema</div>
            </div>
            
            <h3>🔀 Pago Dividido:</h3>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Puedes combinar efectivo y tarjeta</div>
            </div>
            <div class="paso">
                <div class="paso-num">2</div>
                <div class="paso-text">Ingresa primero el monto en efectivo, luego el resto en tarjeta</div>
            </div>
        </div>
        
        <div class="section">
            <h2>4. Tipos de Factura (e-CF)</h2>
            
            <h3>📄 Factura de Consumo (E32):</h3>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text">Para clientes finales <strong>sin RNC</strong></div>
            </div>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text">No requiere datos del cliente</div>
            </div>
            
            <h3>📄 Factura de Crédito Fiscal (E31):</h3>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text">Para empresas <strong>con RNC</strong></div>
            </div>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text">Requiere: RNC, Razón Social del cliente</div>
            </div>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text">El cliente puede usar esta factura para crédito fiscal</div>
            </div>
            
            <div class="importante">
                <span class="importante-icon">⚠️ Importante:</span> Siempre pregunta al cliente si necesita factura con crédito fiscal ANTES de procesar.
            </div>
        </div>
        
        <div class="section">
            <h2>5. Reimprimir Facturas</h2>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Ve a <strong>Caja/Turnos</strong> en el menú</div>
            </div>
            <div class="paso">
                <div class="paso-num">2</div>
                <div class="paso-text">Busca la transacción en el listado</div>
            </div>
            <div class="paso">
                <div class="paso-num">3</div>
                <div class="paso-text">Toca el botón de reimprimir</div>
            </div>
            <div class="nota">
                <span class="nota-icon">ℹ️ Nota:</span> Las reimpresiones se marcan como "COPIA" automáticamente.
            </div>
        </div>
        
        <div class="section">
            <h2>6. Anulaciones</h2>
            <div class="importante">
                <span class="importante-icon">⚠️ Importante:</span> Las anulaciones de facturas requieren autorización de administrador/gerente.
            </div>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text">Solo se pueden anular facturas del día actual</div>
            </div>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text">Se genera automáticamente una Nota de Crédito (E34)</div>
            </div>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text">El monto se descuenta del total de ventas del día</div>
            </div>
        </div>
        
        <div class="section">
            <h2>7. Cierre de Caja</h2>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Al final del turno, ve a <strong>Opciones</strong> → <strong>Cierre de Día</strong></div>
            </div>
            <div class="paso">
                <div class="paso-num">2</div>
                <div class="paso-text">Revisa el resumen de ventas</div>
            </div>
            <div class="paso">
                <div class="paso-num">3</div>
                <div class="paso-text">Cuenta el efectivo en caja</div>
            </div>
            <div class="paso">
                <div class="paso-num">4</div>
                <div class="paso-text">Compara con el total del sistema</div>
            </div>
            <div class="paso">
                <div class="paso-num">5</div>
                <div class="paso-text">Reporta cualquier diferencia al administrador</div>
            </div>
            <div class="nota">
                <span class="nota-icon">💡 Tip:</span> El Reporte Z muestra todas las transacciones del día para cuadrar.
            </div>
        </div>
        
        <div class="footer">
            <p>VexlyPOS - Sistema de Punto de Venta para Restaurantes</p>
            <p>© 2024-2026 Todos los derechos reservados</p>
        </div>
    </body>
    </html>
    """


def generar_manual_admin():
    return f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>Manual del Administrador - VexlyPOS</title>
    </head>
    <body>
        <div class="header">
            <h1>🛡️ Manual del Administrador</h1>
            <p>Guía completa para configurar el sistema, gestionar usuarios y supervisar operaciones</p>
            <p style="font-size: 10pt; margin-top: 15px;">VexlyPOS - Sistema de Punto de Venta</p>
        </div>
        
        <div class="toc">
            <h2>Contenido</h2>
            <ul>
                <li>1. Gestión de Usuarios</li>
                <li>2. Apertura y Cierre de Jornada</li>
                <li>3. Gestión de Productos</li>
                <li>4. Configuración de Impresoras</li>
                <li>5. Configuración de Facturación</li>
                <li>6. Reportes</li>
                <li>7. Autorizaciones</li>
            </ul>
        </div>
        
        <div class="section">
            <h2>1. Gestión de Usuarios</h2>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Ve a <strong>Configuración</strong> → <strong>Usuarios</strong></div>
            </div>
            <div class="paso">
                <div class="paso-num">2</div>
                <div class="paso-text">Para crear usuario: Toca <strong>+</strong>, ingresa nombre, rol y PIN</div>
            </div>
            <div class="paso">
                <div class="paso-num">3</div>
                <div class="paso-text">Para editar: Toca el usuario y modifica sus datos</div>
            </div>
            <div class="paso">
                <div class="paso-num">4</div>
                <div class="paso-text">Para desactivar: Desmarca la casilla "Activo"</div>
            </div>
            <div class="importante">
                <span class="importante-icon">⚠️ Importante:</span> Los PINs deben ser únicos. El sistema no permite duplicados.
            </div>
        </div>
        
        <div class="section">
            <h2>2. Apertura y Cierre de Jornada</h2>
            
            <h3>🟢 Abrir Jornada:</h3>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Toca el indicador de jornada en el sidebar</div>
            </div>
            <div class="paso">
                <div class="paso-num">2</div>
                <div class="paso-text">Toca <strong>Abrir Día</strong> e ingresa el fondo inicial de caja</div>
            </div>
            
            <h3>🔴 Cerrar Jornada:</h3>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Asegúrate de que TODAS las mesas estén cerradas</div>
            </div>
            <div class="paso">
                <div class="paso-num">2</div>
                <div class="paso-text">Toca <strong>Cerrar Día</strong> en el modal de jornada</div>
            </div>
            <div class="paso">
                <div class="paso-num">3</div>
                <div class="paso-text">Revisa el Reporte Z antes de cerrar</div>
            </div>
            <div class="importante">
                <span class="importante-icon">⚠️ Importante:</span> No se puede cerrar la jornada si hay mesas abiertas.
            </div>
        </div>
        
        <div class="section">
            <h2>3. Gestión de Productos</h2>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Ve a <strong>Configuración</strong> → <strong>Inventario</strong></div>
            </div>
            <div class="paso">
                <div class="paso-num">2</div>
                <div class="paso-text">Puedes crear categorías y productos</div>
            </div>
            <div class="paso">
                <div class="paso-num">3</div>
                <div class="paso-text">Configura modificadores para productos que los requieran</div>
            </div>
            <div class="paso">
                <div class="paso-num">4</div>
                <div class="paso-text">Asigna canales de impresión (cocina, bar, etc.)</div>
            </div>
        </div>
        
        <div class="section">
            <h2>4. Configuración de Impresoras</h2>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Ve a <strong>Configuración</strong> → <strong>Impresoras</strong></div>
            </div>
            <div class="paso">
                <div class="paso-num">2</div>
                <div class="paso-text">Configura los canales: Cocina, Bar, Recibos</div>
            </div>
            <div class="paso">
                <div class="paso-num">3</div>
                <div class="paso-text">Asigna la IP o nombre de cada impresora</div>
            </div>
            <div class="paso">
                <div class="paso-num">4</div>
                <div class="paso-text">Prueba cada impresora con el botón de test</div>
            </div>
        </div>
        
        <div class="section">
            <h2>5. Configuración de Facturación</h2>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Ve a <strong>Configuración</strong> → <strong>Facturación</strong></div>
            </div>
            <div class="paso">
                <div class="paso-num">2</div>
                <div class="paso-text">Configura el proveedor de e-CF (Alanube o The Factory)</div>
            </div>
            <div class="paso">
                <div class="paso-num">3</div>
                <div class="paso-text">Ingresa las credenciales del proveedor</div>
            </div>
            <div class="paso">
                <div class="paso-num">4</div>
                <div class="paso-text">Verifica la conexión con el botón de test</div>
            </div>
            <div class="importante">
                <span class="importante-icon">⚠️ Importante:</span> Sin configuración de e-CF, las facturas quedarán en estado "CONTINGENCIA".
            </div>
        </div>
        
        <div class="section">
            <h2>6. Reportes</h2>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Ve a <strong>Reportes</strong> en el menú principal</div>
            </div>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text"><strong>Dashboard de e-CF:</strong> Estado de facturas electrónicas</div>
            </div>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text"><strong>Reporte Z:</strong> Resumen de ventas del día</div>
            </div>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text"><strong>Historial:</strong> Todas las transacciones con filtros</div>
            </div>
        </div>
        
        <div class="section">
            <h2>7. Autorizaciones</h2>
            <div class="nota">
                <span class="nota-icon">ℹ️ Nota:</span> Como administrador, tu PIN se usará para autorizar:
            </div>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text">Anulación de items ya enviados a cocina</div>
            </div>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text">Anulación de facturas</div>
            </div>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text">Descuentos especiales</div>
            </div>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text">Cambios de precio</div>
            </div>
        </div>
        
        <div class="footer">
            <p>VexlyPOS - Sistema de Punto de Venta para Restaurantes</p>
            <p>© 2024-2026 Todos los derechos reservados</p>
        </div>
    </body>
    </html>
    """


def generar_manual_gerente():
    return f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>Manual del Gerente - VexlyPOS</title>
    </head>
    <body>
        <div class="header">
            <h1>👥 Manual del Gerente</h1>
            <p>Guía para supervisar operaciones, autorizar transacciones y gestionar el equipo</p>
            <p style="font-size: 10pt; margin-top: 15px;">VexlyPOS - Sistema de Punto de Venta</p>
        </div>
        
        <div class="toc">
            <h2>Contenido</h2>
            <ul>
                <li>1. Supervisión de Operaciones</li>
                <li>2. Autorizaciones</li>
                <li>3. Gestión del Equipo</li>
                <li>4. Reportes del Día</li>
            </ul>
        </div>
        
        <div class="section">
            <h2>1. Supervisión de Operaciones</h2>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text">El Dashboard muestra el estado actual del restaurante</div>
            </div>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text">Mesas abiertas, órdenes activas, ocupación</div>
            </div>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text">Ventas del día en tiempo real</div>
            </div>
            <div class="nota">
                <span class="nota-icon">💡 Tip:</span> Revisa periódicamente las mesas con mucho tiempo abiertas.
            </div>
        </div>
        
        <div class="section">
            <h2>2. Autorizaciones</h2>
            <div class="nota">
                <span class="nota-icon">ℹ️ Nota:</span> Tu PIN puede autorizar las mismas operaciones que el administrador:
            </div>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text">Anulación de items enviados</div>
            </div>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text">Descuentos y cortesías</div>
            </div>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text">Cambios de precio</div>
            </div>
        </div>
        
        <div class="section">
            <h2>3. Gestión del Equipo</h2>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text">Puedes ver qué mesero atiende cada mesa</div>
            </div>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text">Transferir mesas entre meseros si es necesario</div>
            </div>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text">Monitorear el tiempo de atención de cada mesa</div>
            </div>
        </div>
        
        <div class="section">
            <h2>4. Reportes del Día</h2>
            <div class="paso">
                <div class="paso-num">1</div>
                <div class="paso-text">Accede a <strong>Reportes</strong> para ver el desempeño</div>
            </div>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text"><strong>Reporte Z:</strong> Ventas totales, por método de pago</div>
            </div>
            <div class="paso">
                <div class="paso-num">•</div>
                <div class="paso-text"><strong>Historial:</strong> Detalle de cada transacción</div>
            </div>
        </div>
        
        <div class="footer">
            <p>VexlyPOS - Sistema de Punto de Venta para Restaurantes</p>
            <p>© 2024-2026 Todos los derechos reservados</p>
        </div>
    </body>
    </html>
    """


# ═══════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════

@router.get("/manual-waiter.pdf")
async def get_manual_mesero_pdf():
    """Genera el PDF del manual del mesero"""
    html_content = generar_manual_mesero()
    font_config = FontConfiguration()
    
    html = HTML(string=html_content)
    css = CSS(string=PDF_CSS, font_config=font_config)
    
    pdf_buffer = io.BytesIO()
    html.write_pdf(pdf_buffer, stylesheets=[css], font_config=font_config)
    pdf_buffer.seek(0)
    
    return Response(
        content=pdf_buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=manual-mesero.pdf"}
    )


@router.get("/manual-cashier.pdf")
async def get_manual_cajero_pdf():
    """Genera el PDF del manual del cajero"""
    html_content = generar_manual_cajero()
    font_config = FontConfiguration()
    
    html = HTML(string=html_content)
    css = CSS(string=PDF_CSS, font_config=font_config)
    
    pdf_buffer = io.BytesIO()
    html.write_pdf(pdf_buffer, stylesheets=[css], font_config=font_config)
    pdf_buffer.seek(0)
    
    return Response(
        content=pdf_buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=manual-cajero.pdf"}
    )


@router.get("/manual-admin.pdf")
async def get_manual_admin_pdf():
    """Genera el PDF del manual del administrador"""
    html_content = generar_manual_admin()
    font_config = FontConfiguration()
    
    html = HTML(string=html_content)
    css = CSS(string=PDF_CSS, font_config=font_config)
    
    pdf_buffer = io.BytesIO()
    html.write_pdf(pdf_buffer, stylesheets=[css], font_config=font_config)
    pdf_buffer.seek(0)
    
    return Response(
        content=pdf_buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=manual-administrador.pdf"}
    )


@router.get("/manual-manager.pdf")
async def get_manual_gerente_pdf():
    """Genera el PDF del manual del gerente"""
    html_content = generar_manual_gerente()
    font_config = FontConfiguration()
    
    html = HTML(string=html_content)
    css = CSS(string=PDF_CSS, font_config=font_config)
    
    pdf_buffer = io.BytesIO()
    html.write_pdf(pdf_buffer, stylesheets=[css], font_config=font_config)
    pdf_buffer.seek(0)
    
    return Response(
        content=pdf_buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=manual-gerente.pdf"}
    )
