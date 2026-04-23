# VexlyPOS — Roadmap

Prioridades:
- 🔴 **P0**: Crítico / Bloqueante — siguiente en la cola
- 🟠 **P1**: Importante — próximas iteraciones
- 🟡 **P2**: Deseable — backlog activo
- 🟢 **P3**: Nice-to-have — futuro

**Última actualización**: 2026-04-21 — ⏸️ Pausa en desarrollo de reportes. El módulo cubre ahora 15 reportes nuevos del audit (2026-04-19 → 21): A1, A3, A4, A5, A7, A8, B1, B5, D1/D4, F1-F4 (fiscales), F4 breakdown por tasa, 2 detallados DGII 606/607/608 + Ventas Generales. Los pendientes abajo quedan listos para retomar.

---

## 🔴 P0 — Crítico (próximo al retomar)

- [x] **Generar prompt distribuible Multiprod** — ✅ COMPLETADO 2026-04-19. Ver `/app/memory/REPLICATION_GUIDE_2026-04-19.md`.
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
- [ ] **Módulo Contable RD — Fase 4: Conciliación bancaria**
  - Importación de estados de cuenta, match automático de movimientos.

---

## 🟠 P1 — Reportes pendientes (PAUSADOS 2026-04-21)

> Estos quedan en backlog tras completar 15 reportes nuevos del audit. Retomar cuando el usuario lo solicite.

- [ ] **E2 — Items Menos Vendidos (Dogs)** · quick win ~1h
  - Endpoint: inverso de `/top-products-extended` con orden ASC.
  - Útil para identificar platos a sacar del menú.
- [ ] **E3 — Ventas por Modificador** · ~2-3h
  - Agregación desde `bills.items[].modifiers[]`.
  - Qué modificadores se piden más (ej: "sin cebolla", "extra queso").
  - Ayuda a decisiones de costeo y capacitación.
- [ ] **B3 — Detalle de Propinas por Mesero** · ~2h
  - Reporte independiente (hoy solo aparece anidado en by-waiter / cash-close).
  - Drill-down por fecha, método de pago, bill.
- [ ] **C3 — Comps / Cortesías** · ~2h
  - Diferenciar descuentos al 100% como categoría propia "Cortesía".
  - Requiere campo `discount_type: 'comp'|'discount'` en bill (backward-compatible).
- [ ] **D2 — Labor Cost %** · ~4h
  - Campo opcional `hourly_rate` en usuarios.
  - Cálculo ratio costo laboral / ventas por turno y global.
  - Métrica #1 de benchmarking para dueños.
  - Desbloquea **D3 Sales per Labor Hour (SPLH)**.
- [ ] **Ventas por Hora — Filtro "Día de la semana"** *(enhancement del Prompt 3)* — Added 2026-04-20
  - Multi-select Lun-Dom para detectar patrones (sábado 21:00 vs martes 21:00).
  - Requiere extender `/api/reports/hourly-sales` con parámetro `weekday`.
  - Estimado ~2-3h.
- [ ] **Ventas Comparativas — Presets rápidos** *(enhancement del A8)* — Added 2026-04-20
  - 4 botones: "Este mes vs Mes anterior", "Esta semana vs Semana anterior", "Este trimestre vs anterior", "Este año vs Año anterior".
  - También comparativo YoY (Abr 2026 vs Abr 2025) para estacionalidad.
  - Estimado ~1.5h.
- [ ] **Product Mix × Empleado — Vista invertida** *(enhancement del A7)* — Added 2026-04-20
  - Mismo dataset invertido: Producto → Empleados que más lo vendieron.
  - Para identificar "expertos" en platos (formación cruzada, programación de turnos).
  - ~1.5h.
- [ ] **Ranking por Mesa — Heatmap visual del salón** *(enhancement del A5)* — Added 2026-04-21
  - Overlay SVG sobre layout físico de mesas (x/y/width/height ya en DB).
  - Color por intensidad de ingresos (verde=top / gris=sin ventas).
  - Permite repensar layout del salón.
  - ~3h con Recharts + SVG.
- [ ] **Cuentas Abiertas — Alerta a mesero** *(enhancement del B5)* — Added 2026-04-20
  - Botón "Enviar alerta" por cada cuenta >120min vía Resend (email) o WhatsApp.
  - ~3h.
- [ ] **Impuestos — Indicador de cumplimiento DGII** *(enhancement del Prompt 4)* — Added 2026-04-20
  - Badge verde/amarillo/rojo que compara ITBIS recaudado vs ITBIS reportado en 607.
  - Detecta discrepancias antes de declarar IT-1.
  - ~2-3h.

### Otros P1 heredados

- [ ] **Integración IA — GPT-4o mini via Emergent LLM Key**
  - Sugerencias inteligentes (pricing, descuentos, combos).
  - Detección de anomalías (ventas, inventario).
- [ ] **CRM — Customer Loyalty**
  - Programa de puntos (expandir base existente).
  - Segmentación y campañas email/SMS.
- [ ] **Reporte de Ventas por Plataforma Externa** *(Uber Eats / PedidosYa / otras)* — Added 2026-04-19
  - Vista consolidada con total por plataforma, comisiones configurables, cotejo contra depósitos.

---

## 🟡 P2 — Deseable

- [ ] **Cheat Sheet Modal de atajos de teclado** *(Added 2026-04-23)* — al estilo Linear/Notion.
  - Disparador: `Ctrl+K` o botón `?` en el header.
  - Lista todos los atajos: `/` buscar (ya implementado globalmente), y futuros (`Ctrl+N` nuevo, `Esc` cerrar modal, `G+D` ir a dashboard, etc.).
  - Buscador dentro del modal para filtrar atajos.
  - Aumenta percepción de producto profesional y fideliza personal administrativo.
  - ~3h.
- [ ] **Reportes de Ventas por Hora / Horas Trabajadas — Filtros avanzados** (multi-select empleados, comparativo entre personas).
- [ ] **Print Agent Installer — actualización .bat** para impresoras locales de red.
- [ ] **Notificaciones Push para pedidos de Delivery Platforms** (Web Push API).
- [ ] **Exportación PDF del Panel de Diagnóstico Multiprod** — reporte semanal automático.
- [ ] **Refactor `_hours_worked_impl`** — mover filtro de rango a query Mongo `$gte/$lte` cuando volumen crezca (>1000 shifts/mes).
- [ ] **Refactor exports** — extraer helpers compartidos de WeasyPrint y openpyxl a `/app/backend/services/report_exports.py` (reports_xlsx.py ya supera 3500 líneas).

---

## 🟢 P3 — Futuro / Backlog

- [ ] **C5 — No-Sale del cajón de efectivo** — requiere log hardware.
- [ ] **B4 — Conciliación bancaria / batch settlements** — requiere integración bancos/procesadores.
- [ ] **B6 — Cuentas reabiertas (Re-opened)** — requiere registrar eventos de reapertura.
- [ ] **A2 — Ventas por Producto (Menu Item Analysis completo)** con margen/costo — requiere costeo configurado.
- [ ] **Exportar Audit Trail** — todos los eventos en CSV/JSON con filtros.
- [ ] **Testing cross-platform 5-viewports completo** del e-CF Dashboard.

---

## 📦 Infraestructura / DevOps

- [ ] **Limpiar seeds activas en Preview** antes del próximo rollout:
  - `db.shifts.delete_many({'_seed_hours': True})` (4 shifts OSCAR + CARLOS del D1/D4).
- [ ] **Push a GitHub + rollout a 8 tenants** de los 15 reportes completados 2026-04-19 → 21:
  - Alonzo, BlackBurguer, Casa Oliva, Lungomare, Kukaramacara, PunchBar, BikerBurger, LaTerraza.
  - Usar botón "Save to GitHub" (commit automático) + script `./rollout.sh`.
