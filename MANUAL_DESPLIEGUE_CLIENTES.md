# VexlyPOS — Manual de Despliegue para Nuevos Clientes
## Guía Paso a Paso (Opción A: Una Instancia por Cliente)

---

## REQUISITOS PREVIOS

- Cuenta en Emergent (app.emergent.sh) con membresía activa
- Cuenta en GitHub (github.com) conectada a Emergent
- Cuenta en Supabase (supabase.com) — para secuencias NCF y notas de crédito
- Dominio vexlyapp.com configurado en Cloudflare (dash.cloudflare.com)
- Repositorio base: github.com/leocadio818/vexlypos
- Credenciales de integraciones (si el cliente las necesita):
  - Alanube: API Key para e-CF DGII
  - The Factory HKA: Usuario y contraseña sandbox/producción
  - Resend: API Key para emails

---

## COSTO POR CLIENTE

- 50 créditos/mes por cada despliegue activo
- Sin costo adicional por actualizaciones (re-deploy)

---

## VARIABLES DE ENTORNO REQUERIDAS

Estas son las variables que DEBES configurar para cada nuevo cliente en `backend/.env`:

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| DB_NAME | Nombre de la base de datos MongoDB | blendbar_pos |
| SUPABASE_URL | URL del proyecto Supabase | https://xxxxx.supabase.co |
| SUPABASE_SERVICE_KEY | Service Key de Supabase | eyJhbGciOiJIUzI1NiIsInR5cCI6... |
| ALANUBE_API_KEY | API Key de Alanube (si usa e-CF) | (proporcionado por Alanube) |
| THEFACTORY_* | Credenciales The Factory HKA (si usa) | (proporcionado por The Factory) |
| RESEND_API_KEY | API Key para emails (opcional) | re_xxxxx |

**NOTA:** Las variables MONGO_URL y REACT_APP_BACKEND_URL son gestionadas automáticamente por Emergent. NO las cambies.

---

## PASO 1: CREAR NUEVO PROYECTO EN EMERGENT

1. Abre tu navegador y ve a: https://app.emergent.sh
2. Haz clic en "New Chat" o "Nuevo Proyecto" (botón en la esquina superior)
3. En el chat, escribe exactamente:

   "Importa el proyecto desde https://github.com/leocadio818/vexlypos"

4. Espera a que Emergent descargue y cargue todo el código
5. Cuando termine, verás un preview de la aplicación

---

## PASO 2: CONFIGURAR BASE DE DATOS DEL NUEVO CLIENTE

IMPORTANTE: Cada cliente DEBE tener su propia base de datos para que sus datos estén completamente separados.

### 2A. Configurar MongoDB (Base de datos principal)

1. En el mismo chat de Emergent, escribe:

   "Cambia el DB_NAME en backend/.env a [nombre_del_cliente]_pos"

   Ejemplos:
   - Para BlendBar:  "Cambia el DB_NAME en backend/.env a blendbar_pos"
   - Para CaféLuna:  "Cambia el DB_NAME en backend/.env a cafeluna_pos"
   - Para Sushi Express: "Cambia el DB_NAME en backend/.env a sushiexpress_pos"

   REGLAS para el nombre:
   - Solo letras minúsculas, números y guion bajo (_)
   - Sin espacios ni caracteres especiales
   - Siempre terminar con _pos para organizarlos mejor

2. El agente cambiará el archivo automáticamente
3. Verifica que te confirme el cambio

### 2B. Configurar Supabase (Secuencias NCF y Notas de Crédito)

IMPORTANTE: Supabase se usa para manejar secuencias de NCF y algunas funcionalidades específicas de DGII. Cada cliente necesita su propia configuración.

**Opción A: Crear nuevo proyecto de Supabase para el cliente**

1. Ve a https://supabase.com e inicia sesión
2. Haz clic en "New Project"
3. Nombra el proyecto igual que el cliente (ej: "blendbar-pos")
4. Espera a que se cree el proyecto (1-2 minutos)
5. Ve a Settings > API y copia:
   - Project URL (es tu SUPABASE_URL)
   - anon public key (es tu SUPABASE_ANON_KEY)

**Opción B: Usar el mismo proyecto de Supabase (clientes pequeños)**

Si prefieres gestionar todos los clientes en un solo proyecto de Supabase, puedes usar las mismas credenciales, pero asegúrate de que las tablas usen el `tenant_id` para separar los datos.

6. En el chat de Emergent, escribe:

   "Actualiza backend/.env con estas credenciales de Supabase:
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_SERVICE_KEY=eyJxxxxx"

7. Ejecutar migraciones en Supabase (solo la primera vez para cada proyecto nuevo):
   - En Supabase, ve a SQL Editor
   - Ejecuta las migraciones que están en /app/backend/migrations/supabase/

---

## PASO 3: PERSONALIZAR LA APP DEL CLIENTE

1. En el mismo chat, pídele al agente:

   "Cambia el título de la pestaña en index.html a [Nombre del Cliente]"

2. Haz clic en el Preview para abrir la app
3. Entra con el PIN por defecto: 10000
4. Ve a Config > Sistema:
   - Cambia "Nombre del Restaurante" al nombre del cliente
   - Sube el logo del cliente (PNG, JPG o WebP, máximo 5MB)
   - Configura la zona horaria correcta
   - Configura el RNC del cliente
5. Crea los usuarios/empleados del cliente en Config > Usuarios
6. Configura las mesas, productos, categorías, etc.

---

## PASO 4: HACER EL DEPLOY

1. En Emergent, busca el botón "Deploy" (parte superior del chat)
2. Haz clic en "Deploy Now"
3. Espera 10-15 minutos hasta que diga "Live"
4. Anota la URL que te da Emergent (ejemplo: blendbar-pos.emergent.host)

---

## PASO 5: CONECTAR EL SUBDOMINIO EN CLOUDFLARE

### 5A. Agregar registro DNS en Cloudflare:

1. Ve a: https://dash.cloudflare.com
2. Selecciona el dominio "vexlyapp.com"
3. En el menú izquierdo, haz clic en "DNS" > "Records"
4. Haz clic en el botón azul "+ Add record"
5. Configura así:

   - Type:   CNAME
   - Name:   [nombre del cliente]  (ejemplo: blendbar)
   - Target: [URL del deploy en Emergent SIN https://]  (ejemplo: blendbar-pos.emergent.host)
   - Proxy status: DNS only (nube GRIS, no naranja)
   - TTL: Auto

6. Haz clic en "Save"

### 5B. Vincular dominio en Emergent:

1. Ve a tu deploy en Emergent (Home > tu app desplegada)
2. Haz clic en "+ Add your Domain"
3. Escribe: [nombre].vexlyapp.com  (ejemplo: blendbar.vexlyapp.com)
4. Intenta "Auto-link Domain" primero
5. Si falla, haz clic en "Manual Setup" y confirma que ya agregaste los registros DNS
6. Espera 5-15 minutos hasta que diga "Linked"

---

## PASO 6: VERIFICAR

1. Abre tu navegador y ve a: https://blendbar.vexlyapp.com
2. Deberías ver la pantalla de login con el logo y nombre del cliente
3. Entra con el PIN del administrador que configuraste
4. Verifica que los datos estén vacíos (es una base de datos nueva)

---

## ACTUALIZACIONES FUTURAS

Cuando hagas mejoras al código y quieras actualizar un cliente específico:

1. Ve al proyecto de ESE cliente en Emergent
2. Haz los cambios necesarios
3. Haz clic en "Re-deploy changes"
4. Solo ese cliente se actualiza, los demás NO se afectan

---

## EJEMPLO COMPLETO: Desplegar "BlendBar"

| Paso | Acción | Resultado |
|------|--------|-----------|
| 1 | Nuevo chat en Emergent + importar repo | Código cargado |
| 2A | DB_NAME = blendbar_pos | MongoDB separado |
| 2B | Crear proyecto Supabase + configurar credenciales | Secuencias NCF listas |
| 3 | Config > Sistema > "BlendBar" + logo | App personalizada |
| 4 | Deploy Now | blendbar-pos.emergent.host |
| 5 | CNAME: blendbar > blendbar-pos.emergent.host | DNS configurado |
| 6 | Verificar blendbar.vexlyapp.com | TODO LISTO |

---

## TABLA DE CLIENTES (usa esta tabla para llevar control)

| # | Cliente | Subdominio | DB_NAME | URL Emergent | Estado |
|---|---------|------------|---------|--------------|--------|
| 1 | Alonzo Restaurant | vexlyapp.com | (original) | minimalist-pos.emergent.host | LIVE |
| 2 | | .vexlyapp.com | _pos | | |
| 3 | | .vexlyapp.com | _pos | | |
| 4 | | .vexlyapp.com | _pos | | |
| 5 | | .vexlyapp.com | _pos | | |

---

## SOLUCIÓN DE PROBLEMAS

### "El subdominio no carga"
- Espera 15-30 minutos (el DNS necesita tiempo para propagar)
- Verifica que el registro CNAME en Cloudflare tenga la nube GRIS (no naranja)
- Verifica que el Target apunte al URL correcto del deploy

### "Dice Linking is Pending"
- Es normal, espera 10-15 minutos
- Haz clic en el botón de recheck en Emergent

### "Los datos de un cliente aparecen en otro"
- Verificaste que el DB_NAME sea DIFERENTE para cada cliente
- Cada cliente debe tener su propio nombre único de base de datos

### "Quiero dejar de pagar por un cliente"
- Ve a Emergent > Home > selecciona el deploy
- Haz clic en "Shut Down" para apagar ese despliegue
- Se dejan de cobrar los 50 créditos/mes de ese cliente

---

Documento creado: Marzo 2026
Versión: 1.1 (Abril 2026 - Agregada configuración de Supabase y variables de entorno)
