# Supabase — setup paso a paso

Backend del club corriendo sobre Supabase (Postgres + Auth + Edge Functions).
**Costo: free tier alcanza** para empezar.

---

## 1. Crear el proyecto en Supabase (5 min)

1. Entrar a [supabase.com](https://supabase.com) y crear cuenta.
2. **New project** → nombre: `ac-club` → región: `South America (São Paulo)`.
3. Anotá la **Database password** que generás — la vas a necesitar después.
4. Esperá ~2 min que arranque la DB.

## 2. Aplicar el schema (1 min)

En el dashboard del proyecto → **SQL Editor** → New query.

1. Copiar todo `supabase/migrations/0001_init.sql` y pegarlo. **Run**.
2. Copiar todo `supabase/seed.sql` y pegarlo. **Run**.

Listo. Tenés las 4 tablas (`profiles`, `cuotas`, `pagos`, `config`) con RLS prendido.

> Si más adelante el cliente va a usar el CLI de Supabase, esto se puede correr
> con `supabase db push`. Por ahora el SQL Editor alcanza.

## 3. Configurar el frontend (2 min)

1. Dashboard → **Project Settings → API**. Copiá:
   - `Project URL` (algo como `https://xxxxx.supabase.co`)
   - `anon` `public` key (la pública, no la `service_role`)
2. En la raíz del repo, crear `.env`:
   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
3. **Nunca pegues la `service_role` key en el frontend** — esa va solo en
   Edge Functions del backend.

## 4. Crear el primer admin (1 min)

El admin es un usuario común con `role='admin'` en `profiles`.

1. Dashboard → **Authentication → Users → Add user → Create new user**.
2. Mail + contraseña a tu gusto. **Auto Confirm** = on.
3. Volver al **SQL Editor** y correr:
   ```sql
   update public.profiles
   set role = 'admin', nombre = 'Tu Nombre'
   where id = (select id from auth.users where email = 'tu-email@dominio.com');
   ```
4. Logueate en el sitio con ese mail/contraseña → entrás al panel admin.

## 5. Deployar la Edge Function `invite-socio` (5 min)

Esta función es lo que se ejecuta cuando el admin clickea **"Nuevo socio"**.
Crea el `auth.user` y manda mail de invitación. Sin esto, el botón falla.

### 5.1. Instalar el CLI de Supabase

Una sola vez por máquina:

- Mac: `brew install supabase/tap/supabase`
- Windows: `scoop install supabase` (o ver [docs](https://supabase.com/docs/guides/local-development/cli/getting-started))

### 5.2. Login y vincular el proyecto

Desde la raíz del repo (`ac-react/`):

```bash
supabase login                       # abre el browser para autenticar
supabase link --project-ref xxxxx    # el ref está en la URL del dashboard
```

### 5.3. Deploy

```bash
supabase functions deploy invite-socio
```

Listo. El admin ya puede crear socios desde el panel.

> **Importante**: las env vars `SUPABASE_URL`, `SUPABASE_ANON_KEY` y
> `SUPABASE_SERVICE_ROLE_KEY` se inyectan automáticamente — no tenés que
> setearlas a mano.

## 6. Crear socios desde el panel

Una vez logueado como admin, **Socios → Nuevo socio**: completás email,
nombre, etc., y la app le manda un mail de invitación al socio para que se
ponga la contraseña.

---

## 7. Checklist de operación (para producción)

### 7.1. Verificar que RLS está activa

Dashboard → SQL Editor → correr:

```sql
select tablename, rowsecurity
  from pg_tables
 where schemaname = 'public';
```

Las 4 tablas (`profiles`, `cuotas`, `pagos`, `config`) deben mostrar
`rowsecurity = true`. Si alguna está en `false`, prendela con:

```sql
alter table public.<tabla> enable row level security;
```

### 7.2. Configurar SMTP propio (no usar el default)

El SMTP default de Supabase tiene rate-limits bajos (~2 mails/hora) y es
para testing. Para que los invites y resets lleguen bien (sin caer en
spam), conviene Resend (free tier: 3.000 mails/mes — más que de sobra
para 15 usuarios).

1. Crear cuenta en [resend.com](https://resend.com) (gratis, sin tarjeta).
2. **API Keys → Create** → copiar la key.
3. En Supabase: **Authentication → SMTP Settings** → activar **Enable Custom SMTP**:
   - Host: `smtp.resend.com`
   - Port: `587`
   - Username: `resend`
   - Password: la API key
   - Sender email: `no-reply@tu-dominio.com.ar` (verificá el dominio en Resend antes)
   - Sender name: `Club Agronomía Central`
4. **Save**.

Probá con un invite de prueba a tu propio mail.

### 7.3. URLs de Auth (para que el link del mail vuelva a tu dominio)

Dashboard → **Authentication → URL Configuration**:

- **Site URL**: `https://tu-dominio.com.ar`
- **Redirect URLs**: `https://tu-dominio.com.ar/**`

Sin esto el link del mail de invite/recovery te lleva a `localhost:3000`.

### 7.4. Monitoreo gratuito (UptimeRobot)

Que avise cuando el sitio o las Edge Functions se caen.

1. Crear cuenta en [uptimerobot.com](https://uptimerobot.com) (free: 50 monitors).
2. **Add New Monitor → HTTP(s)** → `https://tu-dominio.com.ar`. Intervalo: 5 min.
3. Otra para la Edge Function: `https://umfnazhsxwesxdujfeyy.supabase.co/functions/v1/invite-socio`. En advanced → expected status: 401 (sin auth devuelve 401, eso confirma que la function está viva).
4. **My Settings → Alert Contacts**: agregá tu mail / WhatsApp.

### 7.5. Backups manuales adicionales

Supabase free tier hace backups diarios automáticos retenidos por 7 días
(Dashboard → Database → Backups). Para descansar mejor, bajate uno por
mes a mano:

```bash
# Desde la raíz del repo (CLI ya instalado y linkeado):
supabase db dump --data-only --file backup-$(date +%Y%m).sql
```

Guardalo en Drive del club.

---

## 7. Ops antes de ir vivo (gratis)

Hacé estos 4 pasos antes de invitar a los socios reales. Todo es free tier.

### 7.1. Verificar que RLS está prendida

SQL Editor → correr:
```sql
select tablename, rowsecurity
  from pg_tables
 where schemaname = 'public';
```
Las 4 tablas (`profiles`, `cuotas`, `pagos`, `config`) tienen que mostrar
`rowsecurity = true`. Si alguna está en `false`:
```sql
alter table public.<nombre> enable row level security;
```

### 7.2. URLs de Auth (para que los mails apunten al sitio)

Dashboard → **Authentication → URL Configuration**:
- **Site URL**: `https://tu-dominio.com.ar`
- **Redirect URLs**: agregar `https://tu-dominio.com.ar/**`

Sin esto, el link del mail de invitación lleva a `localhost:3000`.

### 7.3. SMTP propio (gratis — Resend)

El SMTP default de Supabase **es para testing** (límite 2 mails/hora y va a spam).
Para 15 usuarios reales + invites a socios usá Resend free (3.000 mails/mes):

1. Crear cuenta en [resend.com](https://resend.com) (gratis).
2. **API Keys → Create** → copiar la key.
3. **Domains → Add Domain** → tu dominio. Agregar los registros TXT/MX que pide a Hostinger (zona DNS).
4. En Supabase → **Authentication → SMTP Settings**:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: la API key
   - Sender email: `no-reply@tu-dominio.com.ar`
   - Sender name: `Club Agronomía Central`
5. **Send test email** desde Supabase y verificar que llega.

### 7.4. Monitoreo (gratis — UptimeRobot)

[uptimerobot.com](https://uptimerobot.com) free tier: 50 monitores, check cada 5 min.

Crear 2 monitores:
- **HTTPS**: `https://tu-dominio.com.ar` (la landing).
- **HTTPS**: `https://umfnazhsxwesxdujfeyy.supabase.co/rest/v1/` (la API).

Notificación → mail de la secretaría. Si algo se cae más de 5 min, llega aviso.

### 7.5. Backups

Supabase free tier hace **backup diario automático** (retención 7 días).
- Verificar en Dashboard → **Database → Backups**.
- **Restaurar NO es 1-click en free**: hay que descargar el SQL y volver a correrlo manualmente. Documentalo.
- Como salvavidas paralelo: descargar el CSV de pagos del mes desde el panel admin y guardarlo en Drive del club.

---

## Troubleshooting

**"row violates row-level security policy"**
→ El usuario no es admin pero está intentando hacer una operación de admin.
Confirmá que `profiles.role = 'admin'` para tu usuario.

**El admin no ve los socios**
→ Mismo, falta el `role = 'admin'` en `profiles`. Si recién creaste el user,
el trigger `on_auth_user_created` lo creó como `socio` por default. Pasale
al SQL del paso 4.

**El socio se loguea pero no ve sus cuotas**
→ Tiene que tener cuotas creadas con `socio_id = su uuid`. El admin las
genera desde el panel **Configuración → Acciones del mes → Generar cuotas**.

**"function marcar_cuotas_pagadas does not exist" o "anular_pago does not exist"**
→ Falta correr la migración `0004_pagos_transaccionales.sql`. Copiala al SQL Editor
y ejecutala. Es idempotente.

**"function delete-socio not found" al apretar Eliminar definitivamente**
→ Falta deployar la Edge Function. Ejecutar:
```bash
supabase functions deploy delete-socio --project-ref umfnazhsxwesxdujfeyy
```
(necesitás un access token de Supabase — generar en https://supabase.com/dashboard/account/tokens y exportar como `SUPABASE_ACCESS_TOKEN`)
