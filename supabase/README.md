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
genera desde el panel **Cuotas → Generar cuotas del mes**.
