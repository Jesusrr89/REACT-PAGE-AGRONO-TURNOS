-- ============================================================================
-- Migration 0006 — Login por DNI con primer ingreso forzando cambio de pass
-- ============================================================================
-- Cambios:
--   1. Columna profiles.must_change_password (boolean, default false).
--      El invite-socio la setea en TRUE para que el socio cambie la pass
--      en su primer ingreso. Una vez cambiada, queda en FALSE.
--   2. RPC get_email_by_dni(dni) — devuelve el email del profile a partir
--      del DNI. Security definer porque RLS sobre profiles no deja a anon
--      leer la tabla. Lo usa el cliente para resolver DNI -> email y luego
--      llamar signInWithPassword(email, pass).
--   3. RPC clear_must_change_password() — el socio la llama después de
--      cambiar su contraseña para limpiar la bandera de su propio profile.
--   4. Trigger handle_new_user actualizado para leer must_change_password
--      desde raw_user_meta_data al crear el profile.
-- ============================================================================

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

-- ----------------------------------------------------------------------------
-- RPC: dni -> email. La usa el login para resolver el DNI tipeado por el
-- jugador y obtener el email con el que signInWithPassword puede autenticar.
-- ----------------------------------------------------------------------------
create or replace function public.get_email_by_dni(p_dni text)
returns text
language sql
security definer
set search_path = public
as $$
  select email
  from public.profiles
  where dni = p_dni
    and estado = 'activo'
  limit 1
$$;

revoke all on function public.get_email_by_dni(text) from public;
grant execute on function public.get_email_by_dni(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- RPC: el socio limpia su propia bandera tras cambiar la pass.
-- ----------------------------------------------------------------------------
create or replace function public.clear_must_change_password()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set must_change_password = false
  where id = auth.uid()
$$;

revoke all on function public.clear_must_change_password() from public;
grant execute on function public.clear_must_change_password() to authenticated;

-- ----------------------------------------------------------------------------
-- Actualizar handle_new_user para que tome must_change_password del meta.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, email, nombre, dni, dorsal, categoria, telefono, role, numero_socio,
    must_change_password
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    nullif(new.raw_user_meta_data->>'dni', ''),
    (new.raw_user_meta_data->>'dorsal')::int,
    nullif(new.raw_user_meta_data->>'categoria', ''),
    nullif(new.raw_user_meta_data->>'telefono', ''),
    coalesce(new.raw_user_meta_data->>'role', 'socio'),
    nullif(new.raw_user_meta_data->>'numero_socio', ''),
    coalesce((new.raw_user_meta_data->>'must_change_password')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
