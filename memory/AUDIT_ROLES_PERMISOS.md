# 🔍 AUDITORÍA READ-ONLY — Sistema de Puestos (Roles) y Permisos

> **Fecha**: 2026-02  
> **Modo**: SOLO LECTURA — Ningún archivo, DB o configuración fue modificado.  
> **Fuentes consultadas**: `mongosh`, `/app/backend/routers/auth.py`, `/app/backend/server.py`, `/app/frontend/src/pages/UserConfig.js`, `/app/frontend/src/pages/settings/UsersTab.js`.

---

## 1️⃣ ¿Cómo funcionan los puestos (roles) en MongoDB? (`custom_roles`)

### Ubicación de datos
- **Colección**: `custom_roles` en `test_database`.
- **Documentos actuales en DB**: **3**.

### Contenido EXACTO de los 3 documentos (sin `_id`)

| # | id (uuid) | name | code | level | builtin / is_system | permissions |
|---|-----------|------|------|-------|---------------------|-------------|
| 1 | `e760e43a-f90d-4203-8a78-4b554f2a608f` | **ADMINISTRADOR** | `administrador` | **80** | `is_system: false` | ❌ (no existe el campo) |
| 2 | `93868e8e-6111-418b-a96a-5e5e1ab36a31` | **GERENTE** | `gerente` | **60** | `is_system: false` | ❌ (no existe el campo) |
| 3 | `8320a9de-7110-4047-a3d4-b6ccc62d8aef` | **TestRole** | *(sin `code`)* | **20** | `builtin: false` | ❌ (no existe el campo) |

### Observación clave
- Los **3 custom_roles guardados no contienen el campo `permissions`** en la base.  
- El backend (`POST /api/roles`) sí permite guardar `permissions` al crearlos (línea 972 de `auth.py`: `doc = {"id": gen_id(), **input, "builtin": False, "level": level}`), y el frontend envía `permissions: {}` (UserConfig.js línea 348), pero el objeto llega **vacío**, por lo que Mongo no persiste la clave.
- Esto **NO rompe nada**: los permisos reales se calculan en tiempo de ejecución (ver sección 3).

### Roles **builtin** (hardcodeados, NO están en Mongo)
Definidos en `auth.py` → `BUILTIN_ROLE_LEVELS` (línea 151) y expuestos por `GET /api/roles` como una lista fija al inicio del response:

| code | name | level | permissions |
|------|------|-------|-------------|
| `admin` | Administrador | **100** | `DEFAULT_PERMISSIONS["admin"]` (≈54 flags en `True`) |
| `supervisor` | Supervisor | **40** | `DEFAULT_PERMISSIONS["supervisor"]` |
| `cashier` | Cajero | **30** | `DEFAULT_PERMISSIONS["cashier"]` |
| `waiter` | Mesero | **20** | `DEFAULT_PERMISSIONS["waiter"]` |
| `kitchen` | Cocina | **10** | `DEFAULT_PERMISSIONS["kitchen"]` (vacío `{}`) |

El endpoint `GET /api/roles` concatena: `builtin + custom_roles` y filtra por nivel del solicitante (línea 954–959).

---

## 2️⃣ ¿Cómo se cargan/asignan los permisos en el frontend?

### Archivo central: `/app/frontend/src/pages/UserConfig.js`

#### a) Definición de permisos disponibles (frontend)
```js
const PERMISSION_CATEGORIES = {
  ventas:          { permissions: { open_table, add_products, void_items, ... } },   // 14 permisos
  mesas:           { permissions: { move_tables, resize_tables, ... } },              // 6 permisos
  administracion:  { permissions: { view_dashboard, access_caja, open_shift, ... } }, // 14 permisos
  inventario:      { permissions: { manage_inventory, manage_suppliers, ... } },      // 4 permisos
  configuracion:   { permissions: { manage_users, manage_areas, ... } },              // 9 permisos
  pestanas_config: { permissions: { config_users, config_mesas, ... } },              // 16 permisos
};
```
Total: **~63 permisos** agrupados en **6 categorías**, con acordeón expandible (`expandedCats` state).

#### b) Permisos por defecto por puesto builtin (hardcodeado en frontend)
Líneas 122–146:
```js
const ROLE_DEFAULTS = {
  admin:      { /* TODOS en true (reduce sobre PERMISSION_CATEGORIES) */ },
  waiter:     { open_table, add_products, send_kitchen, create_bill,
                split_bill, view_dashboard, manage_reservations },
  cashier:    { 14 permisos en true },
  supervisor: { 21 permisos en true },
  kitchen:    { view_dashboard, send_kitchen },
};
```

#### c) Al seleccionar un puesto → se copian los defaults
Función `handleSelectRole` (línea 300):
```js
const handleSelectRole = (role) => {
  const code = getRoleCode(role);
  const defaults = role.builtin
    ? (ROLE_DEFAULTS[code] || {})          // builtin → frontend hardcoded
    : (role.permissions || {});            // custom   → lo que venga del backend
  setUser(p => ({ ...p, role: code, permissions: { ...defaults } }));
};
```
**Importante**: al cambiar de puesto se **sobrescribe** el objeto `user.permissions` con los defaults, descartando personalizaciones previas.

#### d) Guardado del usuario
- `handleSave` (línea 307) manda `PUT /api/users/{id}` o `POST /api/users` con el objeto `permissions` completo.
- **Backend filtra quién puede personalizar** (auth.py línea 590):
  ```python
  if caller_level < 100:
      permissions_input = {}   # Solo Admin Sistema (nivel 100) puede editar permisos
  ```
  → Si el que edita no es `admin` (100), el backend **borra las personalizaciones** y deja solo `permissions: {}`, aplicando los defaults del rol en tiempo de lectura.

#### e) Render de cada permiso
Líneas 713–750 aproximadamente:
- Por cada permiso se compara:
  - `userHas = user.permissions[permKey]`
  - `roleHas = roleDefaults[permKey] || false`
  - `isSpecial = userHas !== roleHas` → si es distinto del default → badge naranja "especial".

### Archivo de listado: `/app/frontend/src/pages/settings/UsersTab.js`
- Solo **lista** usuarios con filtros (`userRoleFilter`, `active`) y badges de colores por rol.
- **No gestiona permisos**. Al hacer click en un usuario redirige a `/users/:id` (`UserConfig.js`).

### No existen archivos `UserForm.js`, `EmployeeForm.js` ni `RoleSelector.js`
Toda la lógica vive en **`UserConfig.js`** (una sola página grande de ~850 líneas).

---

## 3️⃣ ¿Dónde se definen los permisos por defecto?

Hay **dos fuentes de defaults** (una por "lado" de la app):

| Capa | Archivo | Constante | Propósito |
|------|---------|-----------|-----------|
| **Backend** | `/app/backend/routers/auth.py` (línea 37) | `DEFAULT_PERMISSIONS` | Fuente de verdad para autorización en API. Se inyecta en `get_permissions(role, custom)` cada vez que se lee un usuario. |
| **Frontend** | `/app/frontend/src/pages/UserConfig.js` (línea 122) | `ROLE_DEFAULTS` | Usado al **seleccionar** un puesto en la UI para poblar los switches antes de guardar. |

### Función clave (backend) — `get_permissions()` en `auth.py` línea 178
```python
def get_permissions(role, custom=None):
    base = { k: False for k in ALL_PERMISSIONS }    # 1. todo en False
    base.update(DEFAULT_PERMISSIONS.get(role, {}))  # 2. overlay defaults del rol
    if custom:
        base.update(custom)                          # 3. overlay custom del usuario
    return base
```
→ **Merge en 3 capas**: todos los permisos `False` → defaults del rol → overrides personales del usuario.

### ⚠️ Inconsistencia detectada (read-only, NO fijar sin permiso)
- `DEFAULT_PERMISSIONS` (backend) y `ROLE_DEFAULTS` (frontend) **no están 100% sincronizados**.  
  Ejemplo: backend `waiter` tiene `manage_customers: True`, frontend `waiter` **no incluye** `manage_customers`.  
  Esto puede causar que la UI muestre un permiso apagado mientras la API lo acepta como activo al recalcular con `get_permissions()`.
- **No hay impacto crítico** porque el backend siempre recalcula con `DEFAULT_PERMISSIONS` al responder `GET /users/{id}`, pero al guardar se persiste lo que venga de la UI.

---

## 4️⃣ ¿Qué significa el contador "Xp" en la UI?

### Ubicación
`UserConfig.js` línea **643**, dentro del botón de cada puesto:
```jsx
<span className="text-xs ...">
  {permCount}p {role.level != null ? `· N${role.level}` : ''}
</span>
```

### Significado
- **`Xp`** = **"X permisos activos"** (cantidad de permisos con valor `true`) que tiene ese puesto por defecto.
- **`N<num>`** = **"Nivel jerárquico"** del puesto (0–100).

### Cómo se calcula (líneas 625–627)
```js
const permCount = role.builtin
  ? Object.values(ROLE_DEFAULTS[code] || {}).filter(Boolean).length
  : Object.values(role.permissions || {}).filter(Boolean).length;
```
- **Builtin** → cuenta `ROLE_DEFAULTS[code]` del frontend.  
- **Custom** → cuenta `role.permissions` que vino del backend (si está vacío → `0p`).

### Ejemplos esperados en la UI actual
| Puesto | Tipo | Se ve como |
|--------|------|------------|
| Administrador (builtin) | builtin | `~54p · N100` |
| Supervisor (builtin) | builtin | `~21p · N40` |
| Cajero (builtin) | builtin | `14p · N30` |
| Mesero (builtin) | builtin | `7p · N20` |
| Cocina (builtin) | builtin | `2p · N10` |
| **ADMINISTRADOR** (custom) | custom | `0p · N80` ⚠️ (no tiene `permissions` en DB) |
| **GERENTE** (custom) | custom | `0p · N60` ⚠️ |
| **TestRole** (custom) | custom | `0p · N20` ⚠️ |

---

## 5️⃣ Diagrama de flujo completo — creación/edición de usuario

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. UserConfig.js se monta → fetchData()                         │
│    GET /api/roles  →  builtin[5] + custom_roles[3] = 8 roles   │
│    GET /api/users/{id} → user con permissions "flat object"    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Usuario hace click en un puesto                              │
│    handleSelectRole(role)                                       │
│    → setUser({ role: code, permissions: { ...defaults } })      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. UI muestra switches por categoría con specialCount           │
│    specialCount = permisos que difieren del default             │
│    badge naranja "X especial(es)"                               │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. handleSave → PUT /api/users/{id}                             │
│    Backend (auth.py ~698):                                      │
│      if caller_level < 100:                                     │
│          del input["permissions"]  ◄── BLOQUEO JERÁRQUICO       │
│    → Solo Admin Sistema (lvl 100) puede guardar overrides       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Al leer el usuario de nuevo: get_permissions(role, custom)   │
│    → merge: all_false → DEFAULT_PERMISSIONS[role] → custom      │
│    Audit log en `role_audit_logs` si cambió algo                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Controles de seguridad detectados (para tu referencia)

1. **Jerarquía estricta por nivel** (`get_role_level_async` + `BUILTIN_ROLE_LEVELS`).  
   - Admin (100) lo ve/edita todo.  
   - Otros solo ven usuarios con `level < caller_level` (strictly lower).
2. **Sólo Admin Sistema puede personalizar permisos**: `caller_level < 100` → `del input["permissions"]`.
3. **Sólo Admin Sistema puede crear/editar/eliminar puestos custom** (`POST/PUT/DELETE /api/roles`).
4. **Integridad al eliminar puestos**: bloquea si hay usuarios usando el rol (auth.py línea 1029).
5. **Candado en UI**: el botón de borrar puesto custom NO existe (línea 645 "🔒 DO NOT MODIFY").
6. **Audit trail completo** en `role_audit_logs` (user_created, role_created, role_updated, role_deleted).

---

## 📌 Resumen ejecutivo (TL;DR)

1. **Puestos**: 5 builtin hardcodeados en backend (`admin`, `supervisor`, `cashier`, `waiter`, `kitchen`) + 3 custom en Mongo (ADMINISTRADOR N80, GERENTE N60, TestRole N20).
2. **Permisos**: ~63 flags booleanos agrupados en 6 categorías; se guardan por usuario en `users.permissions` como objeto plano.
3. **Defaults** viven en **2 lugares** no sincronizados al 100%: `DEFAULT_PERMISSIONS` (backend, fuente de verdad) y `ROLE_DEFAULTS` (frontend, solo para poblar UI).
4. **"Xp"** = cantidad de permisos activos (`true`) que trae ese puesto por defecto. Los 3 custom_roles actuales muestran **0p** porque no tienen `permissions` guardado en la DB.
5. **Solo el Admin Sistema (nivel 100) puede personalizar permisos**. Cualquier otro rol usa el default de su puesto.

---

> 📝 **Nada fue modificado durante esta auditoría**. Si quieres corregir alguna de las observaciones (ej.: sincronizar defaults backend↔frontend, migrar permisos a custom_roles, mostrar `Xp` real calculado en backend), indícamelo explícitamente antes de tocar código — hay **"CÓDIGO PROTEGIDO 🔒"** activo en PRD.md.
