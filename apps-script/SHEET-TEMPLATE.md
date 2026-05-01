# Estructura de la planilla "AC - Socios"

La función `Club Admin → 1. Inicializar estructura de hojas` crea las 5 hojas
con sus headers automáticamente y aplica la migración cuando hay datos viejos.
Este documento es la referencia de qué va en cada columna.

---

## Hoja `Socios`

Una fila por socio. La secretaría llena todo menos `password_hash` y `socio_id` (se autogeneran).

| Columna | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `socio_id` | texto | ✅ (auto) | **Primary key estable.** Formato `AC-0001`, `AC-0002`, etc. Se autogenera al ejecutar `setupSheets` o al registrarse un socio nuevo. **No editar a mano** — las cuotas se vinculan a este id. |
| `email` | texto | ✅ | Login del socio. Se normaliza a minúsculas. Tiene que ser único en la hoja. Si un socio cambia de mail en el futuro, su historial de cuotas no se rompe (se vincula por `socio_id`). |
| `password_hash` | texto | ✅ (auto) | **No tocar a mano.** Se completa al correr "Hashear contraseñas pendientes" o por el auto-registro. Formato: `sha256:<salt>:<hash>`. |
| `password_plain` | texto | — | Donde la secretaría escribe la contraseña temporal. Se borra automáticamente al hashearla. |
| `nombre` | texto | ✅ | Nombre y apellido del socio. |
| `dni` | texto | — | DNI del socio. Único en toda la hoja. Sirve para evitar duplicados en el auto-registro. |
| `dorsal` | número | — | Número de camiseta. Puede quedar vacío. |
| `categoria` | texto | — | Ej: "3ra División · División de Honor". |
| `telefono` | texto | — | Sin formato específico. Solo informativo. |
| `estado` | texto | ✅ | Estado administrativo del usuario. Ver tabla abajo. Si está vacío se asume `activo`. |
| `fecha_alta` | fecha | — | Fecha en que se creó la cuenta. Se completa sola en el auto-registro. |

> El campo financiero (al día / con deuda) **no existe en esta hoja** — se calcula
> server-side mirando si hay cuotas en `pendiente` en la hoja `Cuotas`. Eso
> garantiza que siempre esté correcto sin mantenimiento manual.

### Valores válidos del campo `estado`

| Valor | ¿Puede entrar? | Qué ve el socio | Cuándo usarlo |
|---|---|---|---|
| `pendiente` | Sí, pero limitado | Banner amarillo "Tu cuenta está siendo verificada", sin acceso a cuotas ni carrito | Estado por defecto cuando alguien se registra solo desde el formulario público. La secretaría tiene que aprobar. |
| `activo` | Sí, completo | Portal completo: carnet, stats, carrito, cuotas, MP | Socio en regla. Es el estado normal. |
| `rechazado` | ❌ No | Mensaje: "Tu solicitud fue rechazada. Comunicate con la secretaría." | Para solicitudes de auto-registro que la secretaría rechaza (no es socio real, datos inventados, etc.). |
| `desactivado` | ❌ No | Mensaje: "Tu cuenta está desactivada. Comunicate con la secretaría si querés reactivarla." | Ex-socio que dejó el club. La cuenta se conserva (con el historial) pero no puede ingresar. |

> **Tip:** dejar vacía la columna `estado` equivale a `activo`. Útil para los socios que ya tenías cargados antes de agregar este campo.

### Aprobar/rechazar/desactivar un socio

Es una edición directa en la hoja, sin macros ni botones:

1. Abrir la hoja `Socios`.
2. Encontrar la fila del socio (ordenar por `fecha_alta` descendente para ver primero los más recientes).
3. Editar la celda de la columna `estado`:
   - `pendiente` → `activo` para aprobarlo.
   - `pendiente` → `rechazado` para rechazarlo (la cuenta queda en la sheet por trazabilidad).
   - `activo` → `desactivado` para dar de baja un socio actual.
   - `desactivado` → `activo` para reactivarlo.
4. (Opcional) Cargar las cuotas correspondientes en la hoja `Cuotas` cuando lo aprobás.

El cambio impacta al instante en el sitio — la próxima vez que el usuario haga login (o refresque sesión) lo va a ver reflejado.

---

## Hoja `Cuotas`

Una fila por socio y por mes. Los datos pueden estar en cualquier orden — el frontend ordena por año descendente y mes descendente.

| Columna | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `cuota_id` | texto | ✅ (auto) | Primary key. Formato `AC-0001-202604` (socio_id + AAAAMM). Se autogenera. **No tocar.** |
| `socio_id` | texto | ✅ | A qué socio pertenece. Tiene que coincidir con un `socio_id` válido en hoja `Socios`. La migración la completa sola para cuotas viejas (matcheando por email). |
| `email` | texto | — | Solo para referencia visual humana. **El sistema NO usa esta columna** — usa `socio_id`. Se conserva para que la secretaría pueda ver de un vistazo de quién es la cuota. |
| `mes` | texto | ✅ | Nombre del mes en español: `Enero`, `Febrero`, `Marzo`, `Abril`, `Mayo`, `Junio`, `Julio`, `Agosto`, `Septiembre`, `Octubre`, `Noviembre`, `Diciembre`. |
| `anio` | número | ✅ | Año de la cuota. Ej: `2026`. |
| `monto` | número | ✅ | Importe **total** de la cuota en pesos. Ej: `15000`. Sin separador de miles, sin símbolo `$`. |
| `monto_pagado` | número | ✅ | Cuánto se cobró ya. Para cuotas nuevas: `0`. Para cuotas pagadas full: igual a `monto + recargo`. Para parciales: lo que se haya cobrado hasta ahora. **El backend lo actualiza automáticamente cuando se confirma un pago.** La secretaría también puede editarlo a mano para registrar pagos manuales. |
| `recargo` | número | — | Recargo por mora. Default `0`. **El cron diario lo setea automáticamente** cuando una cuota lleva más de N días vencida (configurable). El total a cobrar al socio es `monto + recargo`. |
| `estado` | texto | ✅ | `pendiente`, `parcial` o `pagado`. **Lo computa el script al leer comparando `monto + recargo` vs `monto_pagado`** — la columna se mantiene en sync para que la secretaría lo vea visualmente. No hace falta editarla a mano. |
| `fecha_vencimiento` | fecha | — | Cuándo vence esa cuota. Opcional — sirve para mostrar "X meses vencida" en el portal. |
| `fecha_pago` | fecha | — | Fecha en que se completó el pago. Lo llena el script cuando una cuota pasa a `pagado`. |

### Saldo y estado computados

El backend calcula al leer:
- **`total_a_cobrar` = `monto` + `recargo`**
- **`saldo` = `total_a_cobrar` − `monto_pagado`** (nunca negativo).
- **`estado`**:
  - `pagado` si `monto_pagado >= total_a_cobrar`
  - `parcial` si `0 < monto_pagado < total_a_cobrar`
  - `pendiente` si `monto_pagado == 0`

La secretaría ve estos valores reflejados en la columna `estado` de la planilla porque el script los escribe cuando confirma un pago o cuando aplica un recargo. Pero la **fuente de verdad** es la comparación `monto + recargo` vs `monto_pagado`.

### Ejemplo

```
cuota_id          | socio_id | email          | mes     | anio | monto | monto_pagado | estado    | fecha_vencimiento | fecha_pago
AC-0001-202604    | AC-0001  | test@test.com  | Abril   | 2026 | 15000 | 0            | pendiente | 2026-04-30        |
AC-0001-202603    | AC-0001  | test@test.com  | Marzo   | 2026 | 15000 | 8000         | parcial   | 2026-03-31        |
AC-0001-202602    | AC-0001  | test@test.com  | Febrero | 2026 | 15000 | 15000        | pagado    | 2026-02-28        | 03/02/2026
AC-0002-202604    | AC-0002  | otro@email.com | Abril   | 2026 | 18000 | 0            | pendiente | 2026-04-30        |
```

### Cómo registrar un pago manual / parcial

Para una transferencia o pago en efectivo (no MP), la secretaría tiene 2 opciones:

**A) Edición directa en hoja `Cuotas`** (rápida):
1. Buscar la fila de la cuota.
2. Sumar el monto cobrado a `monto_pagado`.
3. El script recalcula `estado` y `saldo` la próxima vez que el socio entre.

**B) Registrar en hoja `Pagos`** (mejor para auditoría):
1. Agregar una fila en `Pagos` con `metodo=transferencia` o `efectivo`, `estado=confirmado`, listar los `cuota_id` cubiertos.
2. **Importante**: hoy esto NO se aplica solo desde la planilla — la opción A es más práctica para pagos manuales. La hoja `Pagos` se usa principalmente como log de pagos de MP. (Se puede agregar una macro "Aplicar pagos confirmados" más adelante si la secretaría quiere ese flujo.)

---

## Hoja `Config`

Diccionario de claves y valores que se exponen al frontend. Permite cambiar
CBU, alias, WhatsApp, dirección, etc. **sin tocar código y sin redeploy**.

| Clave | Ejemplo | Dónde se usa en la web |
|---|---|---|
| `titular` | `Club S. y D. Agronomía Central` | Sección "Transferencia bancaria" |
| `cuit` | `30-12345678-9` | Sección "Transferencia bancaria" |
| `cbu` | `0110012345678901234567` | Sección "Transferencia bancaria" |
| `alias` | `AGRONOMIA.CENTRAL.AC` | Sección "Transferencia bancaria" |
| `mp_alias` | `agronomiacentral.mp` | Sección "Mercado Pago" |
| `mp_link` | `https://link.mercadopago.com.ar/agronomiacentral` | Botón "Pagar con Mercado Pago" (si está vacío, el botón no se muestra) |
| `whatsapp` | `541145242225` | Botón flotante de WhatsApp del portal. **Solo dígitos, con código de país, sin `+` ni espacios.** |
| `telefono_secretaria` | `+541145242225` | Sección "Débito automático" y mensaje de "olvidé mi contraseña". |
| `direccion_pago` | `Bauness 958` | Sección "Efectivo en el club" |
| `horario_pago` | `Lun a Vie 18 a 22 hs · Sábados 10 a 14 hs` | Sección "Efectivo en el club" |
| `dia_debito` | `Los 5 de cada mes` | Sección "Débito automático" |
| `notification_email` | `secretaria@clubagronomia.com.ar` | Email donde llegan las notificaciones de solicitudes nuevas de socios. Si está vacío, no se manda mail (las solicitudes igual aparecen en la hoja `Socios` como `pendiente`). |
| `auto_generar_cuotas` | `si` | Toggle global del cron diario. `si` → genera cuotas y aplica recargos. `no` → desactiva sin desinstalar el trigger. |
| `cuota_monto_base` | `15000` | Monto en pesos de cada cuota mensual. Lo aplica el cron al generar cuotas nuevas. **Cambiarlo solo afecta a futuras cuotas** — las viejas mantienen su monto. |
| `cuota_dia_vencimiento` | `10` | Día del mes (1-28) en que vence la cuota generada por el cron. Ej: `10` → la cuota de Abril vence el 10 de Abril. |
| `recargo_monto` | `3000` | Cuánto se le suma a una cuota cuando entra en mora prolongada. **Recargo fijo, una sola aplicación por cuota.** |
| `recargo_dias_post_vencimiento` | `60` | Días desde `fecha_vencimiento` para aplicar el recargo. Default 60 (≈ 2 meses). |
| `site_url` | `https://agronomiacentral.com.ar` | URL pública del sitio. Se incluye en el mail al socio cuando se aprueba su cuenta para que tenga el link a mano. Si está vacío, el mail no incluye link. |
| `backup_folder_id` | (vacío) | ID de carpeta de Google Drive donde guardar los backups semanales. Se obtiene de la URL de la carpeta (`drive.google.com/drive/folders/XYZ` → el `XYZ`). Si está vacío, los backups van a la misma carpeta donde está la planilla. |

> Cualquier otra clave que agregues queda disponible en el frontend bajo
> `config[clave]`, pero hay que tocar el código del componente para mostrarla.

---

## Hoja `Pagos`

**Audit trail completo de cada pago que entra al sistema.** Cada vez que un socio inicia un pago con MP se crea una fila acá; cuando MP confirma, se actualiza el estado y se aplica el monto a las cuotas. Es la única hoja que muestra "qué pagó cada socio, cuándo, con qué método".

| Columna | Tipo | Notas |
|---|---|---|
| `pago_id` | texto | ID interno único (timestamp + random). Auto. |
| `socio_id` | texto | A qué socio pertenece. |
| `fecha` | datetime | Cuándo se inició el pago (no necesariamente cuándo se confirmó). |
| `monto` | número | Total del pago en pesos. |
| `metodo` | texto | `mp` / `transferencia` / `efectivo` / `debito` / `manual`. |
| `referencia` | texto | Para MP: el `preference_id`. Para otros: el número de comprobante o lo que ponga la secretaría. |
| `cuotas_cubiertas` | texto | Lista de `cuota_id` separados por coma. Ej: `AC-0001-202604,AC-0001-202603`. |
| `estado` | texto | `iniciado` / `confirmado` / `rechazado` / `anulado`. |
| `fecha_confirmacion` | datetime | Cuándo se confirmó (o rechazó) el pago. |
| `notas` | texto | Comentarios libres. El sistema agrega notas automáticas cuando MP responde (ej: "MP payment_id=12345 monto=30000"). |

### Estados de un pago

| Estado | Cuándo | Qué hace el sistema |
|---|---|---|
| `iniciado` | Cuando el usuario aprieta "Pagar con MP" y el sistema crea la preference en MP. | Reserva la fila pero **no** marca cuotas como pagadas. |
| `confirmado` | Cuando el sistema verifica server-to-server con MP que el pago fue aprobado. | Distribuye el monto entre las cuotas cubiertas (vieja → nueva), actualiza `monto_pagado` y `estado` de cada cuota. |
| `rechazado` | Cuando MP responde que el pago fue rechazado o el usuario lo canceló. | No toca cuotas. La fila queda como histórico. |
| `anulado` | Cancelación manual por la secretaría (ej: chargeback). | La secretaría tiene que revertir manualmente las cuotas que quedaron como pagadas (cambiar `monto_pagado` y `estado`). |

### Notas importantes

- **No editar `pago_id`, `fecha` ni `referencia` a mano** — son inmutables.
- **Si querés "anular" un pago confirmado**: cambiar `estado` a `anulado` y revertir manualmente las cuotas afectadas en hoja `Cuotas` (volver `monto_pagado` a su valor anterior). Se podría automatizar, pero es raro y mejor que sea explícito.
- **Pagos viejos por transferencia / efectivo**: si la secretaría ya los registró editando `monto_pagado` en la hoja `Cuotas`, no hace falta re-registrarlos acá. La hoja `Pagos` sirve hacia adelante para tener un log centralizado.

---

## Hoja `Auditoria`

**Generada automáticamente por el script.** No editar a mano.

| Columna | Significado |
|---|---|
| `timestamp` | Fecha y hora del evento |
| `type` | `login` / `lockout` / `error` |
| `email` | Email del socio (o vacío en errores generales) |
| `action` | Acción intentada (`login`, `session`, etc.) |
| `result` | `success` / `failed` / `rate_limited` / mensaje de error |

Útil para detectar:
- Intentos de brute-force (muchos `failed` seguidos al mismo email).
- Cuentas comprometidas (logins exitosos a horas raras).
- Errores del backend.

Conviene limpiarla cada tanto si se hace muy grande (borrar filas viejas, no
borrar la hoja entera).
