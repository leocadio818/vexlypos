# VexlyPOS — Roadmap

Prioridades:
- 🔴 **P0**: Crítico / Bloqueante — siguiente en la cola
- 🟠 **P1**: Importante — próximas iteraciones
- 🟡 **P2**: Deseable — backlog activo
- 🟢 **P3**: Nice-to-have — futuro

---

## 🔴 P0 — Crítico

- [x] **Generar prompt distribuible Multiprod** — ✅ COMPLETADO 2026-04-19. Ver `/app/memory/REPLICATION_GUIDE_2026-04-19.md` (instrucciones manuales paso a paso, 10 cambios, checklist de validación).
- [ ] **Módulo Contable RD — Fase 1: Cuentas por Pagar / Cobrar (AP/AR)**
  - Registro de facturas proveedor (entrada).
  - Registro de cuentas por cobrar (clientes a crédito).
  - Estados: pendiente, parcial, pagado, vencido.
  - Vista de cartera y alertas de vencimiento.
- [ ] **Módulo Contable RD — Fase 2: Asientos automáticos desde ventas/compras**
  - Generación automática de débitos/créditos por transacción.
  - Catálogo de cuentas configurable.
- [ ] **Módulo Contable RD — Fase 3: Estados financieros + reportes DGII completos**
  - Balance General, Estado de Resultados, Flujo de Caja.
  - Reportes DGII: 606 (compras), 607 (ventas), 608 (anulaciones).
- [ ] **Módulo Contable RD — Fase 4: Conciliación bancaria**
  - Importación de estados de cuenta.
  - Match automático de movimientos.

---

## 🟠 P1 — Importante

- [ ] **Reporte de Horas Trabajadas** (dashboard para gerentes)
  - Horas por empleado, por jornada, por rango de fechas.
  - Exportación a Excel/PDF.
- [ ] **Integración IA — GPT-4o mini via Emergent LLM Key**
  - Sugerencias inteligentes (pricing, descuentos, combos).
  - Detección de anomalías (ventas, inventario).
- [ ] **CRM — Customer Loyalty**
  - Programa de puntos (ya base, expandir).
  - Segmentación de clientes.
  - Campañas de email/SMS dirigidas.
- [ ] **Reporte de Ventas por Plataforma Externa** *(Uber Eats / PedidosYa / otras)*  — Added 2026-04-19
  - Vista consolidada en menú Reportes con total facturado por plataforma.
  - Cálculo de neto después de comisiones (comisión configurable por plataforma).
  - Cotejo contra depósitos semanales reales para detectar discrepancias.
  - Útil para identificar pagos faltantes y negociar mejores términos comerciales.
- [ ] **Ventas por Hora — Filtro "Día de la semana"** *(enhancement del Prompt 3)* — Added 2026-04-20
  - Multi-select Lun-Dom para detectar patrones (ej: sábado 21:00 vs martes 21:00).
  - Requiere extender endpoint `/api/reports/hourly-sales` con parámetro `weekday` (el actual no lo acepta).
  - Útil para decisiones de staffing más finas.
  - Estimado ~2-3h.

---

## 🟡 P2 — Deseable

- [ ] **Reporte DGII 608 (Anulaciones)** — formato oficial.
- [ ] **Print Agent Installer — actualización .bat** para impresoras locales de red.
- [ ] **Notificaciones Push para pedidos de Delivery Platforms** (Web Push API).
- [ ] **Exportación PDF del Panel de Diagnóstico Multiprod** — reporte semanal automático para auditoría y cumplimiento DGII.

---

## 🟢 P3 — Futuro / Backlog

- [ ] **Exportar Audit Trail** — todos los eventos de auditoría en CSV/JSON con filtros.
- [ ] **Testing cross-platform 5-viewports completo** del e-CF Dashboard (Safari iOS, Android Chrome, Desktop Chrome, Dark Mode, Light Mode).

---

**Última actualización**: 2026-04-19
