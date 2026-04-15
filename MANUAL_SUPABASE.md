# Manual de Configuración de Supabase para Nuevos Clientes

## VexlyPOS - Guía Paso a Paso

**Versión:** 1.0  
**Fecha:** Abril 2026  
**Aplica para:** Cada nuevo cliente/despliegue de VexlyPOS

---

## ¿Por qué necesitas Supabase?

Supabase se usa en VexlyPOS para:
- Secuencias de NCF (Números de Comprobante Fiscal)
- Notas de crédito electrónicas
- Algunas funcionalidades de DGII

**IMPORTANTE:** Cada cliente debe tener su propio proyecto de Supabase para mantener los datos separados.

---

## PASO 1: Crear Cuenta en Supabase (Solo la primera vez)

1. Ve a **https://supabase.com**
2. Haz clic en **"Start your project"** o **"Sign In"**
3. Puedes registrarte con:
   - GitHub (recomendado)
   - Google
   - Email y contraseña

---

## PASO 2: Crear Nuevo Proyecto para el Cliente

### 2.1 Iniciar creación del proyecto

1. En el dashboard de Supabase, haz clic en **"New Project"**
2. Si tienes múltiples organizaciones, selecciona la correcta

### 2.2 Configurar el proyecto

Completa los campos así:

| Campo | Qué poner | Ejemplo |
|-------|-----------|---------|
| **Project name** | Nombre del cliente + "-pos" | `blackburguer-pos` |
| **Database Password** | Genera uno automático (click en "Generate") | (automático) |
| **Region** | **Americas** (para República Dominicana) | East US o São Paulo |
| **Pricing Plan** | Free (para empezar) | Free |

### 2.3 Opciones adicionales (dejar activadas)

- ✅ **Enable Data API** → Activado
- ✅ **Enable automatic RLS** → Activado

### 2.4 Crear el proyecto

1. Haz clic en **"Create new project"**
2. Espera 1-2 minutos mientras se crea
3. Verás una pantalla de "Setting up project..."

---

## PASO 3: Obtener las Credenciales

Una vez creado el proyecto, necesitas 2 valores:

### 3.1 Obtener el Project URL

1. En el menú izquierdo, haz clic en **⚙️ Settings** (engranaje)
2. Haz clic en **"General"**
3. Busca **"Project ID"** (ejemplo: `pfpcwtamompctywsmnpt`)
4. Tu URL será: `https://[PROJECT_ID].supabase.co`

**Ejemplo:**
```
Project ID: pfpcwtamompctywsmnpt
URL final: https://pfpcwtamompctywsmnpt.supabase.co
```

### 3.2 Obtener el Service Key (Secret Key)

1. En el menú izquierdo, dentro de Settings, haz clic en **"API Keys"**
2. Verás dos secciones:
   - "Publishable and secret API keys" (nueva interfaz)
   - O "Project API keys" (interfaz antigua)

3. Busca la sección **"Secret keys"**
4. Haz clic en el **ícono del ojo 👁️** para revelar la key
5. Copia la key completa (empieza con `sb_secret_...` o `eyJ...`)

**⚠️ IMPORTANTE:** 
- Usa la key **SECRET/SERVICE**, NO la "anon" o "publishable"
- Esta key tiene permisos administrativos completos
- Guárdala de forma segura

---

## PASO 4: Configurar en el Proyecto de Emergent

### 4.1 Abrir el chat del cliente en Emergent

Ve al proyecto del cliente (ej: BlackBurguer) en Emergent.

### 4.2 Enviar el comando al agente

Copia y pega este mensaje, reemplazando los valores:

```
Agrega estas variables de Supabase a backend/.env:

SUPABASE_URL=https://[TU_PROJECT_ID].supabase.co
SUPABASE_SERVICE_KEY=[TU_SECRET_KEY]

Reinicia el backend después de guardar.
```

**Ejemplo real:**
```
Agrega estas variables de Supabase a backend/.env:

SUPABASE_URL=https://pfpcwtamompctywsmnpt.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_VWMvm8x7yZ...resto_de_la_key

Reinicia el backend después de guardar.
```

### 4.3 Verificar

El agente debe confirmar:
- ✅ Variables agregadas a backend/.env
- ✅ Backend reiniciado

---

## PASO 5: Ejecutar Migraciones (Solo primera vez por proyecto)

Si es un proyecto nuevo de Supabase, necesitas crear las tablas.

### 5.1 En Supabase

1. Ve a **SQL Editor** en el menú izquierdo
2. Haz clic en **"New query"**
3. Pega el SQL de migración (está en `/app/backend/migrations/supabase/`)
4. Haz clic en **"Run"**

### 5.2 O pídele al agente

```
Ejecuta las migraciones de Supabase para crear las tablas necesarias.
Las migraciones están en /app/backend/migrations/supabase/
```

---

## Resumen: Checklist por Cliente

| # | Paso | Verificación |
|---|------|--------------|
| 1 | Crear proyecto en Supabase | ✅ Nombre: `[cliente]-pos` |
| 2 | Región Americas | ✅ East US o São Paulo |
| 3 | Copiar Project URL | ✅ `https://xxx.supabase.co` |
| 4 | Copiar Secret Key | ✅ `sb_secret_...` o `eyJ...` |
| 5 | Configurar en backend/.env | ✅ SUPABASE_URL y SUPABASE_SERVICE_KEY |
| 6 | Reiniciar backend | ✅ Confirmado por el agente |
| 7 | Ejecutar migraciones | ✅ Tablas creadas |

---

## Credenciales de Ejemplo (SANDBOX - Solo para pruebas)

Estas son las credenciales de sandbox compartidas para desarrollo:

```
# NO USAR EN PRODUCCIÓN - Solo para pruebas
SUPABASE_URL=https://pfpcwtamompctywsmnpt.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_xxx (obtener de tu proyecto)
```

---

## Preguntas Frecuentes

### ¿Puedo usar el mismo proyecto de Supabase para varios clientes?

**No recomendado.** Cada cliente debe tener su propio proyecto para:
- Separación completa de datos
- Facturación independiente
- Mejor seguridad

### ¿Cuánto cuesta Supabase?

- **Free tier:** 500MB de base de datos, suficiente para empezar
- **Pro:** $25/mes cuando necesites más capacidad

### ¿Qué pasa si pierdo la Secret Key?

Puedes generar una nueva en Supabase:
1. Settings → API Keys
2. En Secret keys, haz clic en "Generate new key"
3. Actualiza la variable en backend/.env

### ¿Las credenciales de Alanube/TheFactory van en Supabase?

**No.** Esas van directamente en el archivo `backend/.env` del proyecto en Emergent.

---

## Soporte

Si tienes problemas:
1. Verifica que las credenciales estén correctas
2. Asegúrate de usar la SECRET key, no la anon key
3. Verifica que el backend se reinició después de agregar las variables

---

**Documento creado:** Abril 2026  
**Autor:** Sistema VexlyPOS  
**Versión:** 1.0


---

## Migracion V1.1 — Multiprod e-NCF Reservation Support

**Fecha:** Abril 2026  
**Aplica para:** Clientes que activen Multiprod AM SRL como proveedor e-CF

### Contexto
La integracion con Multiprod requiere un sistema de reserva temporal de secuencias e-NCF
para evitar consumir numeros cuando el envio falla por errores transitorios (timeout, red caida).

### Tabla afectada: `ncf_sequences`

### Columnas nuevas:
- `status` (text, default 'available') — 'available', 'reserved', 'consumed'
- `reserved_until` (timestamptz, nullable) — Hasta cuando esta reservada
- `reserved_for_invoice_id` (text, nullable) — ID de la factura que reservo

### Script de migracion (idempotente — seguro ejecutar multiples veces):

```sql
-- ============================================================
-- Multiprod e-NCF Reservation Support
-- Version: 1.1
-- Ejecutar en: Supabase SQL Editor de cada cliente
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ncf_sequences' AND column_name = 'status'
    ) THEN
        ALTER TABLE ncf_sequences ADD COLUMN status text DEFAULT 'available';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ncf_sequences' AND column_name = 'reserved_until'
    ) THEN
        ALTER TABLE ncf_sequences ADD COLUMN reserved_until timestamptz;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ncf_sequences' AND column_name = 'reserved_for_invoice_id'
    ) THEN
        ALTER TABLE ncf_sequences ADD COLUMN reserved_for_invoice_id text;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ncf_sequences_status
    ON ncf_sequences (status)
    WHERE status = 'reserved';

SELECT 'Migracion V1.1 completada' AS resultado;
```

### Script de auditoria:

```sql
-- Si retorna "No rows returned" = columnas existen correctamente
SELECT column_name AS columna_faltante
FROM (VALUES ('status'), ('reserved_until'), ('reserved_for_invoice_id')) AS expected(column_name)
WHERE column_name NOT IN (
    SELECT column_name FROM information_schema.columns WHERE table_name = 'ncf_sequences'
);
```

### Clientes donde aplicar (solo al activar Multiprod):
- [ ] Alonzo
- [ ] BlackBurguer
- [ ] Casa Oliva
- [ ] Lungomare
