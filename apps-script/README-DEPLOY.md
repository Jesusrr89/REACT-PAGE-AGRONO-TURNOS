# Backend de socios — Deploy paso a paso

Este backend corre 100% en Google Apps Script sobre una planilla de Google Sheets.
**Costo: $0**. **Infra a mantener: ninguna.** La secretaría administra todo desde Excel.

---

## 1. Crear la planilla (2 minutos)

1. Ir a [drive.google.com](https://drive.google.com) con la cuenta del club.
2. **Nuevo → Hoja de cálculo de Google.** Nombrarla **"AC - Socios"**.
3. **Extensiones → Apps Script.** Se abre el editor en una pestaña nueva.

## 2. Pegar el script (1 minuto)

1. En el editor de Apps Script, borrar el contenido del archivo `Código.gs` (o `Code.gs`) que viene por defecto.
2. Copiar **todo el contenido** del archivo [`Code.gs`](./Code.gs) de este repo y pegarlo.
3. Click en el ícono de disquete (💾) o `Ctrl+S` para guardar.
4. Renombrar el proyecto a "AC - Socios Backend" desde el título arriba a la izquierda.

## 3. Inicializar la estructura (30 segundos)

1. **Volver a la pestaña de la planilla** y recargar la página (F5).
2. Aparece un menú nuevo en la barra: **"Club Admin"**.
3. Click en `Club Admin → 1. Inicializar estructura de hojas`.
4. Google va a pedir permisos la primera vez:
   - Click en **"Continuar"** → elegir tu cuenta.
   - Aparece "Google no ha verificado esta aplicación" → click en **"Configuración avanzada"** → **"Ir a AC - Socios Backend (no seguro)"**. Es **tu propio script**, está bien.
   - Aceptar los permisos (necesita acceso a la planilla).
5. Volver a hacer click en `Club Admin → 1. Inicializar estructura de hojas`. Esta vez se ejecuta y crea las 4 hojas: **Socios, Cuotas, Config, Auditoria**.

## 4. Generar el secreto HMAC (10 segundos)

1. `Club Admin → 2. Inicializar secreto HMAC`. Listo.

## 4b. Instalar las tareas automáticas (1 minuto)

1. `Club Admin → 3. Instalar tareas automáticas (cuotas y recargos)`.
2. Google va a pedir permiso para crear triggers + acceder a Drive (para los backups) + mandar mails — aceptar todos.
3. Quedan instaladas **3 tareas**:
   - **Diaria (~3 AM)**: genera la cuota del mes corriente para cada socio activo + aplica recargos a cuotas vencidas hace más del plazo configurado.
   - **Semanal (domingos ~4 AM)**: backup completo de la planilla a Drive, manteniendo los últimos 12.
   - **Al editar la columna `estado` en Socios**: manda mail al socio cuando se aprueba (`pendiente → activo`) o se rechaza (`pendiente → rechazado`) su cuenta.
4. Ajustá los valores en hoja `Config` según el club (cuota base, día de vencimiento, recargo, URL del sitio para incluir en los mails). El cron lee la config en cada ejecución, no hace falta redeploy.

### Activar notificaciones de error (recomendado)

Si una tarea falla por algún motivo (planilla bloqueada, MP cambió la API, etc.), por default Google no avisa. Activalo:

1. Apps Script → ⏰ **Triggers** (panel izquierdo).
2. Click el ícono de filtro al lado de cada trigger → **Failure notification settings** → "Notify me immediately".
3. Te llega mail si una ejecución se rompe.

> El secreto se guarda en `Project Settings → Script Properties` y nunca sale del servidor de Google. Es lo que firma los tokens de sesión.

## 5. Cargar socios (5 minutos)

Ver [`SHEET-TEMPLATE.md`](./SHEET-TEMPLATE.md) para el detalle de columnas. En resumen:

### Hoja `Socios`
Llenar las columnas: `email, password_plain, nombre, dorsal, categoria, telefono`.

**No tocar `password_hash`** — el script la llena automáticamente.

Ejemplo:

| email | password_hash | password_plain | nombre | dorsal | categoria | telefono |
|---|---|---|---|---|---|---|
| jugador1@gmail.com | (vacío) | temporal123 | Juan Pérez | 7 | 3ra División | 1145678901 |

### Hoja `Cuotas`
Una fila por socio y mes:

| email | mes | anio | monto | estado | fecha_pago |
|---|---|---|---|---|---|
| jugador1@gmail.com | Abril | 2026 | 15000 | pendiente | (vacío) |
| jugador1@gmail.com | Marzo | 2026 | 15000 | pagado | 05/03/2026 |

`estado` debe ser `pendiente` o `pagado` (en minúscula).

### Hoja `Config`
Editá los valores con los datos reales del club (CBU, alias MP, WhatsApp, dirección).

## 6. Hashear las contraseñas (5 segundos)

1. `Club Admin → Hashear contraseñas pendientes`.
2. El script lee todo lo que esté en `password_plain`, lo hashea, lo escribe en `password_hash` y **borra** el plain.

> **Comunicale a cada socio su contraseña por un canal privado** (WhatsApp directo, no grupo). Una vez hasheada, ya no podés recuperarla — solo regenerar una nueva.

## 7. Deployar como Web App (1 minuto)

1. En el editor de Apps Script, arriba a la derecha: **Deploy → New deployment**.
2. Click en el engranaje ⚙️ junto a "Select type" → **Web app**.
3. Configurar:
   - **Description:** `AC Socios v1`
   - **Execute as:** `Me (tu_email@gmail.com)`
   - **Who has access:** **`Anyone`** ← importante, sin esto el frontend no puede conectarse.
4. Click **Deploy**.
5. La primera vez vuelve a pedir permisos → aceptar.
6. **Copiar la "Web app URL"**. Tiene este formato:
   ```
   https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/exec
   ```

## 8. Conectar el frontend (30 segundos)

1. En el repo de la web (`ac-react`), abrir el archivo `.env.production`.
2. Pegar la URL en `VITE_API_URL`:
   ```
   VITE_API_URL=https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/exec
   ```
3. Hacer build:
   ```
   npm run build
   ```
4. Subir el contenido de `dist/` al hosting (Netlify, Vercel, Hostinger, lo que uses).

---

## Verificar que anda

1. Abrí la URL del deploy en el navegador. Debería responder:
   ```json
   {"ok":true,"service":"ac-socios","version":1}
   ```
2. En el sitio, hacé login con un socio cargado. Si todo está bien, aparece el portal con el estado de cuenta.
3. Probá un login con clave incorrecta 5 veces seguidas → te bloquea por 15 min.
4. Mirá la hoja `Auditoria` — ahí queda registro de todo.

---

## Auto-generación de cuotas y recargos por mora

Si instalaste la tarea diaria (paso 4b), el sistema gestiona solo dos cosas que antes eran manuales:

### Generación mensual automática

- Todos los días el cron revisa: ¿cada socio `activo` ya tiene cuota para el mes actual?
- Si no la tiene, la crea con `monto = cuota_monto_base` y `fecha_vencimiento = día configurado del mes actual`.
- **Idempotente**: aunque corra 100 veces el mismo día no duplica nada (la cuota_id es determinística — `socio_id-AAAAMM`).
- **Cuándo aparece la primera cuota de un socio nuevo**: cuando lo aprobás (cambiás `pendiente → activo`), dentro de las 24hs el cron le genera la cuota del mes en curso. Si querés que aparezca ya, andá a `Club Admin → Tareas automáticas → Ejecutar tareas ahora`.

### Recargo por mora prolongada

- Cuando una cuota lleva más de `recargo_dias_post_vencimiento` (default 60 días, configurable) sin pagarse, el cron le suma `recargo_monto` (default $3000) a la cuota.
- El recargo se aplica **una sola vez por cuota** (no es progresivo). Si querés progresivos extender `applyRecargos_` en el script.
- El total que el socio ve en el portal es `monto + recargo`, y el carrito cobra ese total automáticamente.
- Cuando el cron aplica un recargo, también actualiza la columna `estado` para que se vea en la planilla.

### Para cambiar montos sin tocar código

Editar en hoja `Config`:
| Clave | Default | Qué controla |
|---|---|---|
| `cuota_monto_base` | 15000 | Monto de las cuotas mensuales nuevas |
| `cuota_dia_vencimiento` | 10 | Día del mes que vencen (1-28) |
| `recargo_monto` | 3000 | Recargo a aplicar |
| `recargo_dias_post_vencimiento` | 60 | Plazo desde el vencimiento para aplicar el recargo |
| `auto_generar_cuotas` | si | Apagar/prender el cron sin desinstalarlo (`si` o `no`) |

Los cambios en `Config` impactan en la próxima ejecución del cron (al día siguiente, o ya mismo si forzás `Ejecutar tareas ahora`).

### Para apagar momentáneamente

- Forma rápida: en hoja `Config`, cambiá `auto_generar_cuotas` de `si` a `no`. El cron sigue corriendo pero no genera cuotas (los recargos sí siguen aplicándose).
- Forma definitiva: `Club Admin → Tareas automáticas → Desinstalar todas las tareas`. Hasta reinstalar, no hay generación automática, recargos, backups ni mails al socio.

---

## Mails automáticos al socio

Cuando la secretaría cambia la columna `estado` de un socio, el sistema dispara un mail automático:

| Cambio de estado | Mail que se manda |
|---|---|
| `pendiente → activo` (aprobación) | "Tu cuenta está activa, ya podés ingresar al portal: {site_url}". Incluye el `socio_id`. |
| `desactivado → activo` (reactivación) | Mismo mail de bienvenida. |
| `pendiente → rechazado` | "No pudimos aprobar tu solicitud, comunicate con la secretaría al {telefono}". |
| Cualquier otro cambio (ej. `activo → desactivado`) | **No manda mail.** Las bajas conviene comunicarlas personalmente. |

> Para que el link al portal aparezca en el mail de aprobación, completá la clave `site_url` en hoja `Config` con la URL pública del sitio (ej: `https://agronomiacentral.com.ar`).

---

## Reset de contraseña self-service

El portal tiene un link **"¿Olvidaste tu contraseña?"** en el modal de login. Flujo:

1. El socio entra el email.
2. El backend genera un código de 6 dígitos válido por 15 minutos y se lo manda por mail. **Nunca dice si el email existe o no** (anti-enumeration: misma respuesta para emails registrados y no registrados).
3. El socio recibe el mail, vuelve al portal, ingresa el código + nueva contraseña.
4. Backend verifica el código, hashea la contraseña nueva, la guarda y limpia cualquier bloqueo de login que pudiera tener.

**Cuándo NO manda mail** (por seguridad, sin avisar al usuario):
- El email no existe en la planilla.
- La cuenta está en estado `rechazado` o `desactivado`.
- Hubo otro pedido de reset al mismo email hace menos de 60 segundos.

**Si la secretaría sigue queriendo resetear manualmente** (ej. el socio no tiene acceso al mail viejo): cargar la nueva clave en `password_plain`, correr `Hashear contraseñas pendientes`. Sigue funcionando exactamente como antes.

---

## Backup semanal de la planilla

La tarea semanal (domingos ~4 AM) hace una copia completa de la planilla en Drive con el nombre `AC - Socios - Backup AAAA-MM-DD`. Mantiene **los últimos 12 backups** (≈ 3 meses) y borra los más viejos automáticamente.

**Dónde van los backups**:
- Por default, en la **misma carpeta** donde está la planilla.
- Para cambiarlo: copiar el ID de la carpeta destino (de la URL de Drive: `drive.google.com/drive/folders/XYZ` → `XYZ`), pegarlo en hoja `Config` clave `backup_folder_id`.

**Hacer un backup ahora** (sin esperar al domingo): `Club Admin → Tareas automáticas → Hacer backup ahora`. Útil antes de cualquier cambio grande en la planilla.

**Restaurar desde un backup**: simplemente abrir el archivo de backup en Drive — es una planilla normal. Para restaurar: copiar las hojas que querés sobre la planilla principal (Socios, Cuotas, Pagos), o renombrar el backup como `AC - Socios` y cambiar el deploy de Apps Script para que apunte a esa.

---

## Notas de seguridad y riesgos asumidos

### Lo que protege el sistema

- **Hashing PBKDF2-HMAC-SHA256 con 20.000 iteraciones** (formato `pbkdf2:20000:salt:hash`). Las cuentas viejas con formato `sha256:` se migran automáticamente al primer login.
- **Tokens HMAC firmados con `pwd_check`**: cuando un socio cambia la contraseña (reset, edición manual del hash), todos sus tokens viejos quedan inválidos al instante.
- **Lock global en confirmación de pagos**: doble click / dos pestañas / replay no pueden acreditar dos veces.
- **CSPRNG en lugar de Math.random** para salts, secretos HMAC, códigos de reset y pago_id.
- **Server-to-server verification con MP** (no webhooks) — la respuesta de MP se valida con el access token del club.
- **Anti sheet-injection**: nombres/categorías que empiezan con `=`, `+`, `-`, `@` se neutralizan con `'` antes de escribir en la planilla.
- **Logs de fallos con email hasheado** — no se acumula PII en `Auditoria`.

### Headers de seguridad en producción

Para que la CSP y otros headers se apliquen en producción (no solo en `vite preview`), el repo incluye:
- **`public/_headers`** — para Netlify y Cloudflare Pages.
- **`vercel.json`** — para Vercel.
- Otros hostings (Hostinger, Hetzner, etc.): replicar los mismos headers en `.htaccess` o el equivalente del proveedor.

### Riesgos conocidos / asumidos

- **CSRF en endpoints anónimos** (`register`, `requestPasswordReset`): Apps Script no expone los HTTP headers `Origin`/`Referer`, así que no podemos validar CSRF a fondo. El daño máximo es: un atacante hace que la víctima registre una cuenta o pida un código de reset (spam-amplification). No hay account compromise. La mitigación real es el cooldown de 60 segundos por email + el honeypot. **Aceptado**.
- **Password lockout DoS**: cualquiera puede bloquear 15 minutos a un socio fallando 5 logins seguidos a su email. Apps Script no expone IP, no se puede mitigar de raíz. **Aceptado**.
- **Backups con `password_hash`**: el backup contiene los hashes. Con PBKDF2-20k están protegidos contra crackeo masivo, pero igual conviene configurar `backup_folder_id` con una carpeta exclusiva del club, no compartida.

### Operacional recomendado

- **2FA en la cuenta Google** que aloja la planilla y los backups.
- **Activar "Failure notifications"** en Apps Script Triggers para enterarte si el cron se rompe.
- **Revisar `Auditoria` mensualmente** para detectar patrones de brute-force.
- **Rotar el HMAC_SECRET cada 6-12 meses** (borrarlo de Script Properties + correr `Inicializar secreto HMAC`). Esto invalida todas las sesiones activas — los socios tienen que volver a loguearse, pero es un reset chico.

---

## Operación diaria de la secretaría

| Tarea | Cómo |
|---|---|
| **Aprobar solicitud de socio nuevo** | En `Socios`, buscar fila con `estado=pendiente`, validar el socio (llamarlo si hace falta), cambiar a `estado=activo`. La cuota del mes se genera sola en el próximo run del cron (≤ 24hs). Para que aparezca al instante: `Tareas automáticas → Ejecutar tareas ahora`. |
| **Rechazar solicitud** | Cambiar `estado=pendiente` → `estado=rechazado`. La fila queda en la sheet por trazabilidad. |
| **Dar de baja un socio** | Cambiar `estado=activo` → `estado=desactivado`. Conserva el historial de cuotas, no puede volver a entrar hasta reactivarlo. |
| Alta manual de socio | Agregar fila en `Socios`, llenar `password_plain`, dejar `estado=activo`, correr `Hashear contraseñas pendientes`. |
| Marcar cuota como pagada | En `Cuotas`, cambiar `estado` de `pendiente` a `pagado` y completar `fecha_pago` |
| Generar cuotas del mes | Copiar/pegar las filas del mes anterior, cambiar `mes`, dejar `estado=pendiente` y `fecha_pago` vacío |
| Resetear contraseña de socio | Llenar `password_plain` con la nueva, correr `Hashear contraseñas pendientes` |
| Cambiar CBU/alias/WhatsApp | Editar el valor en la hoja `Config` — el cambio aparece **al instante** en la web sin redeploy |
| Ver intentos de login y solicitudes | Abrir hoja `Auditoria` |
| Confirmar pago hecho por MP | Ver mail/dashboard de MP, identificar al socio (`external_reference` en MP tiene el formato `email\|cuotas`), marcar pagado en hoja `Cuotas` |

---

## Auto-registro de socios — cómo funciona

El sitio tiene un botón **"Crear cuenta"** que abre un formulario donde cualquier persona puede registrarse. **No queda activa al instante** — la solicitud entra a la planilla con `estado=pendiente` y la secretaría tiene que aprobarla.

### Flujo completo

1. El interesado entra al sitio, click en "Crear cuenta", llena: nombre, DNI, email, teléfono, categoría que solicita, contraseña.
2. El backend valida (no duplica email/DNI, contraseña con mínimo 8 caracteres, etc.) y crea la fila en `Socios` con `estado=pendiente`.
3. **Llega un email a la secretaría** (si está configurado `notification_email` en `Config`) con los datos de la solicitud.
4. El usuario ve el mensaje: "Tu solicitud fue recibida, te vamos a contactar para confirmar tu alta".
5. Si en ese momento intenta loguearse: entra, pero ve un banner amarillo grande "Tu cuenta está siendo verificada" en lugar del portal — sin acceso a cuotas ni carrito.
6. La secretaría:
   - Llama/whatsappea al teléfono que dejó el usuario para verificar que es real.
   - Si confirma → cambia `estado=pendiente` → `estado=activo` en la planilla. Le carga las cuotas en hoja `Cuotas`. Listo.
   - Si no es socio real → cambia `estado=pendiente` → `estado=rechazado`. La cuenta queda bloqueada (no puede entrar) pero la fila se conserva.
7. La próxima vez que el usuario abra el portal, ya ve todo funcionando.

### Notificación por email

Para que llegue el email de aviso a la secretaría:

1. Abrir la hoja `Config`.
2. En la fila `notification_email`, completar la columna `valor` con el mail del club (ej: `secretaria@agronomiacentral.com.ar`).
3. **No hace falta redeploy** — el siguiente registro ya manda mail.

> Apps Script tiene un límite de **100 emails por día** en cuentas Gmail gratuitas (1500 si la cuenta es de Google Workspace). Es muchísimo más que suficiente para un club. Si por algún motivo se alcanza el límite, el registro igual queda guardado en la planilla — solo no llega el aviso.

### Spam y abuso

- **Honeypot**: el formulario tiene un campo oculto que humanos no llenan. Si llega lleno, el backend simula éxito sin guardar nada (los bots no se enteran que fueron detectados).
- **Cooldown**: 60 segundos entre intentos al mismo email.
- **Validación server-side**: email único, DNI único, formato válido, longitud máxima.
- **Quedan en `pendiente`**: aunque pase el honeypot, las solicitudes falsas **no acceden al sistema** porque la secretaría tiene que aprobarlas explícitamente.

---

## Mercado Pago — checkout integrado

El portal del socio tiene un **carrito**: el jugador selecciona qué cuotas pendientes quiere pagar y el botón "Pagar con Mercado Pago" lo manda al checkout oficial de MP. El dinero entra directo a la cuenta de MP del club.

### Habilitar MP (5 minutos)

1. Crear/usar la cuenta de **Mercado Pago** del club (la que va a recibir el dinero).
2. Ir a [www.mercadopago.com.ar/developers/panel/app](https://www.mercadopago.com.ar/developers/panel/app) y crear una **aplicación** ("Crear aplicación" → tipo "Pagos online" / "Checkout Pro").
3. Dentro de la aplicación, sección **Credenciales**, copiar el **Access Token de Producción** (empieza con `APP_USR-`).
   - Si todavía no tenés validados los datos del club en MP, podés probar con el token de **Sandbox** (empieza con `TEST-`) — los pagos no son reales pero el flujo se prueba completo.
4. En la planilla: `Club Admin → Configurar token de Mercado Pago` → pegar el token.
5. Verificar: `Club Admin → Verificar token de Mercado Pago` → te muestra a qué cuenta de MP pertenece y si está en modo producción o sandbox.

### Cómo funciona en el portal

- El socio entra al portal, marca con un check las cuotas que quiere pagar (puede ser una sola o todas las pendientes).
- El total se calcula en pantalla y aparece el botón **"Pagar con Mercado Pago"**.
- Al apretarlo, se abre MP en una pestaña nueva con el monto exacto. El socio paga con tarjeta, dinero en cuenta, QR, lo que sea.
- Al volver al sitio, ve un banner: ✓ pago recibido / ⚠ pago pendiente / ✗ error.

### Confirmación automática (server-to-server)

**El sistema marca la cuota como pagada automáticamente** cuando el usuario vuelve del checkout de MP. No usamos webhooks (que serían difíciles de validar desde Apps Script), sino una verificación server-to-server más segura:

```
1. Usuario tilda cuotas → "Pagar con MP"
2. Backend crea preference en MP + registra fila en hoja "Pagos" como "iniciado"
3. Frontend redirige a MP, usuario paga
4. MP redirige al sitio: site.com/?pago=ok&pref=PREFERENCE_ID
5. Frontend llama a backend: confirmPayment(token, preference_id)
6. Backend (server-to-server con MP):
     a) Verifica que la preference existe en hoja Pagos
     b) Verifica que pertenece al socio que hace el request
     c) GET https://api.mercadopago.com/v1/payments/search?preference_id=...
     d) Si MP responde status=approved → distribuye el monto entre las cuotas
        cubiertas (más vieja primero), actualiza monto_pagado y estado
     e) Marca la fila de Pagos como "confirmado"
7. Frontend refresca el portal con todo al día
```

**Por qué es seguro**:
- Nadie puede falsificar la respuesta de MP (es server-to-server con el access token del club).
- Aunque alguien adivine un `preference_id` ajeno, no puede confirmarlo desde su cuenta porque la verificación de socio_id lo bloquea.
- Si por algún motivo el usuario nunca vuelve al sitio (cerró el browser después de pagar), la fila en `Pagos` queda como `iniciado`. La secretaría la ve y puede confirmarla manualmente revisando el mail de MP.

### Si querés revisar pagos manualmente

- Abrir hoja `Pagos`. Ordenar por `fecha` descendente para ver los más recientes.
- Filtrar `estado = iniciado` para ver pagos donde el usuario inició el checkout pero no se confirmó (probablemente abandonó o cerró el browser).
- Para confirmar a mano un pago en `iniciado`: verificar en el panel de MP que el pago entró, después editar la fila de Pagos y aplicar el monto a las cuotas (sumar a `monto_pagado` en hoja `Cuotas`). O esperar a que el usuario vuelva al sitio (el sistema lo va a confirmar solo).

### Si MP no está configurado

El portal sigue funcionando: el botón "Pagar con MP" se reemplaza automáticamente por **"Coordinar pago por WhatsApp"**, que abre WhatsApp con el detalle del carrito ya escrito en el mensaje. Los métodos tradicionales (transferencia, efectivo, débito) tampoco se rompen.

---

## Si tenés que actualizar el código del backend

1. Pegar la nueva versión de `Code.gs` en el editor.
2. **Deploy → Manage deployments → ✏️ (editar el deployment existente) → Version: New version → Deploy.**
3. **Importante:** la URL **no cambia**. Si creás un "New deployment" en lugar de versionar el existente, te dará una URL nueva y vas a tener que actualizar `VITE_API_URL`.

---

## Troubleshooting

**El frontend dice "API_URL_NOT_CONFIGURED"**
→ Falta `VITE_API_URL` en `.env.production`. Hay que rebuildear después de configurarla.

**Login devuelve `invalid_credentials` aunque la clave es correcta**
→ Probable: la clave nunca se hasheó. Confirmá que `password_hash` tiene contenido (algo tipo `sha256:...:...`) y `password_plain` está vacío.

**Login devuelve `server_error`**
→ Mirá los logs en Apps Script: `Ejecuciones` (panel izquierdo). El error más común es no haber corrido `2. Inicializar secreto HMAC`.

**`too_many_attempts`**
→ El email quedó bloqueado 15 min por brute-force. Esperá o borralo manualmente desde el editor de Apps Script ejecutando: `CacheService.getScriptCache().remove('lock:email@ejemplo.com')`.

**El navegador dice "blocked by CORS"**
→ El deploy no está en `Who has access: Anyone`. Reconfigurá el deployment.
