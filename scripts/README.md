# 🚀 VexlyPOS — Onboarding de tenants e-CF

Scripts y plantillas para configurar nuevos clientes (multi-tenant) con e-CF DGII vía Multiprod en menos de 1 minuto.

---

## 📂 Archivos

| Archivo | Propósito |
|---|---|
| `setup_tenant.sh` | **Setup inicial**: datos fiscales + endpoint Multiprod + provider activo |
| `load_lungomare_sequences.sh` | Cargar/actualizar secuencias NCF oficiales DGII (modificar para nuevos clientes) |
| `test_ecf_lungomare.sh` | Test E2E: emite un e-CF de prueba contra Multiprod sandbox sin afectar nada real |
| `fix_lungomare_post_test.sh` | Limpieza después de testing en sandbox (saltar contadores, sobrescribir legacy) |
| `clientes/_template.env` | Plantilla copiable para cada cliente nuevo |
| `clientes/lungomare.env` | Ejemplo real (Lungomare Bar & Lounge) |

---

## 🎯 Workflow para cliente nuevo (5 minutos)

### 1. Copia la plantilla
```bash
cp /app/scripts/clientes/_template.env /app/scripts/clientes/NUEVO_CLIENTE.env
nano /app/scripts/clientes/NUEVO_CLIENTE.env
```

Rellenas:
- `TENANT_URL` (subdominio en `vexlyapp.com`)
- `RNC`, `RAZON_SOCIAL`, `NOMBRE_COMERCIAL`, `DIRECCION`, `EMAIL`, `TELEFONO`
- `PROVINCIA` y `MUNICIPIO` (códigos 6 dígitos — ver tabla abajo)
- `MULTIPROD_ENDPOINT` (URL completa con token embebido que te da Multiprod)

### 2. Verifica antes de aplicar (sin guardar)
```bash
/app/scripts/setup_tenant.sh --config /app/scripts/clientes/NUEVO_CLIENTE.env --dry-run
```

### 3. Aplica
```bash
/app/scripts/setup_tenant.sh --config /app/scripts/clientes/NUEVO_CLIENTE.env
```

Esto guarda:
- Datos fiscales en `system_config` (id="main") con TODAS las keys (`ticket_*`, `business_*`, legacy compat)
- Endpoint Multiprod en `ecf_provider_config`
- Activa provider = "multiprod"
- Prueba la conexión Multiprod automáticamente

### 4. Carga las secuencias NCF oficiales

**Edita `load_lungomare_sequences.sh`** y cambia:
- `TENANT_URL` y `ADMIN_PIN`
- Los rangos de `upsert_seq` con los oficiales que DGII le asignó al cliente

Luego corres:
```bash
/app/scripts/load_lungomare_sequences.sh
```

> ⚠️ Recomiendo guardar una copia por cliente: `load_NUEVOCLIENTE_sequences.sh`.
> Próxima iteración: parametrizarlo para que lea de `.env`.

### 5. Test final
```bash
# Adaptar TENANT_URL del script
/app/scripts/test_ecf_lungomare.sh
```

Si ves **estado=aceptado** y QR DGII → cliente listo para producción.

---

## 🔁 Cuando pasen a producción real (no sandbox)

Multiprod te dará una URL nueva (sin la palabra "test" en el path). Solo:

```bash
nano /app/scripts/clientes/NUEVO_CLIENTE.env
# Cambiar MULTIPROD_ENDPOINT a la URL productiva
/app/scripts/setup_tenant.sh --config /app/scripts/clientes/NUEVO_CLIENTE.env
```

Resetear contadores a 1 (DGII producción es ambiente separado, no recuerda los eNCFs del testbed):
```bash
/app/scripts/load_lungomare_sequences.sh  # con current_number=1
```

---

## 📋 Códigos Provincia/Municipio DGII (6 dígitos)

Lista completa en `/app/frontend/src/data/dgii_territories.js`. Los más comunes:

| Provincia | Código | Municipio principal | Código municipio |
|---|---|---|---|
| Distrito Nacional | `010000` | Santo Domingo de Guzmán | `010101` |
| Santiago | `250000` | Santiago de los Caballeros | `250101` |
| Santo Domingo | `320000` | Santo Domingo Este | `320101` |
| La Vega | `130000` | Concepción de La Vega | `130101` |
| San Cristóbal | `210000` | San Cristóbal | `210101` |
| La Romana | `120000` | La Romana | `120101` |
| La Altagracia (Higüey) | `110000` | Higüey | `110101` |
| Puerto Plata | `180000` | San Felipe de Puerto Plata | `180101` |
| San Pedro de Macorís | `230000` | San Pedro de Macorís | `230101` |

---

## ❌ Errores comunes y cómo solucionarlos

| Error | Causa | Solución |
|---|---|---|
| `403 Solo admin puede configurar el proveedor e-CF` | El usuario que corre el script no tiene `role="admin"` | Verificar que el PIN sea de admin |
| `DGII rechazó: La combinación e-NCF y código de seguridad ya han sido utilizados` | Ese eNCF ya se envió antes a DGII testbed | Saltar `current_number` con `fix_lungomare_post_test.sh` o usar números más altos |
| `RNC del emisor no configurado` | El cliente no tiene `ticket_rnc` poblado | Re-correr `setup_tenant.sh` |
| `FechaVencimientoSecuencia no disponible` | La secuencia E31/E44/E45 no tiene `valid_until` | Editar la secuencia desde la UI o por API |
| Conexión Multiprod falla / timeout | URL incorrecta, token expirado, o servicio caído | Verificar URL con Multiprod |

---

## 🔐 Notas de seguridad

- Estos scripts contienen el `ADMIN_PIN`. **No commitearlos al repo público.**
- `clientes/*.env` debe estar en `.gitignore` (ya lo está).
- El token Multiprod va embebido en la URL — tratar como credencial.

---

## 📞 Si algo falla

1. Verifica logs del backend del tenant:
   ```bash
   curl https://CLIENTE.vexlyapp.com/api/health
   ```

2. Lee la respuesta completa del API:
   ```bash
   /app/scripts/setup_tenant.sh --config clientes/CLIENTE.env --no-test
   # luego:
   curl https://CLIENTE.vexlyapp.com/api/ecf/test-multiprod -H "Authorization: Bearer TOKEN"
   ```

3. El widget **Salud del Sistema** (Configuración → Salud, solo Super Admin) muestra estado en tiempo real de MongoDB, Print Agent, e-CF, errores recientes.
