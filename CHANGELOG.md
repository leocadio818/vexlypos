# VexlyPOS - Changelog

Todos los cambios notables de este proyecto serán documentados aquí.

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [1.0.0] - 2026-04-10

### 🎉 Primera versión estable de producción

#### Funcionalidades Core
- Sistema completo de mesas y áreas (crear, editar, mover, dividir, unir)
- Gestión de pedidos con envío a cocina/bar por área
- Sistema de pagos múltiples (efectivo, tarjeta, transferencia, mixto)
- Propinas configurables (legal 10% + voluntaria)
- Pre-cuenta con envío automático de items pendientes

#### Facturación Electrónica DGII (e-CF)
- Integración Alanube (E31, E32, E33, E34, E44, E45, E46, E47)
- Integración TheFactory HKA
- Dispatcher unificado con fallback automático
- Dashboard e-CF con reenvío manual y edición de tipo
- Modo contingencia para plataformas delivery (Uber Eats, etc.)
- Notas de crédito electrónicas

#### Impresión
- Soporte impresoras térmicas ESC/POS (red)
- Recibos HTML para impresoras de tinta
- Comandas automáticas por área (cocina/bar)
- Logo del negocio en recibos
- Print Agent para Windows

#### Inventario
- Productos con variantes y modificadores
- Control de stock con alertas
- Recetas y costo de producción
- Importación masiva desde Excel

#### Usuarios y Seguridad
- Roles personalizables (Admin, Gerente, Cajero, Mesero, Cocina, Bar)
- Permisos granulares por función
- Login por PIN
- Audit trail completo

#### Reportes
- Dashboard en tiempo real
- Ventas por período, producto, categoría, mesero
- Reporte Z de cierre de caja
- Reportes DGII (606, 607)

#### Configuración
- Multi-área (Salón, Terraza, Bar, VIP, etc.)
- Métodos de pago personalizables con código DGII
- Tipos de venta (Para llevar, Comer aquí, Delivery)
- Descuentos y promociones
- Clientes de fidelidad

#### Sistema
- Limpieza de mesas huérfanas
- Backup automático
- Temas claro/oscuro
- Responsive (móvil, tablet, desktop)
- Compatible Safari iOS, Android Chrome, Desktop

---

## [Próximas versiones]

### [1.1.0] - Planificado
- Módulo Contable Fase 1: Cuentas por Pagar/Cobrar

### [1.2.0] - Planificado
- Reporte de Horas Trabajadas

### [2.0.0] - Futuro
- Integración IA (GPT-4o mini)
- CRM y fidelización avanzada

---

## Repositorio
- GitHub: https://github.com/leocadio818/vexlypos
- Documentación: /app/MANUAL_DESPLIEGUE_CLIENTES.md
