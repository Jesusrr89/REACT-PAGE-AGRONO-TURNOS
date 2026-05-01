-- ============================================================================
-- AC Socios — schema inicial
-- ============================================================================
-- Tablas: profiles, cuotas, pagos, config
-- Auth la maneja Supabase Auth (auth.users). profiles extiende esa tabla.
-- ============================================================================

-- Helper: chequea si el usuario actual es admin.
-- SECURITY DEFINER evita la recursión infinita cuando se usa dentro de RLS
-- policies sobre la propia tabla profiles.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ============================================================================
-- profiles
-- ============================================================================
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  numero_socio    text unique,
  nombre          text not null,
  dni             text unique,
  dorsal          int,
  categoria       text,
  telefono        text,
  estado          text not null default 'activo'
                    check (estado in ('activo', 'desactivado')),
  role            text not null default 'socio'
                    check (role in ('admin', 'socio')),
  fecha_alta      date not null default current_date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists profiles_estado_idx   on public.profiles (estado);
create index if not exists profiles_role_idx     on public.profiles (role);
create index if not exists profiles_nombre_idx   on public.profiles (lower(nombre));

-- ============================================================================
-- cuotas
-- ============================================================================
create table if not exists public.cuotas (
  id                  uuid primary key default gen_random_uuid(),
  socio_id            uuid not null references public.profiles(id) on delete cascade,
  mes                 int  not null check (mes between 1 and 12),
  anio                int  not null check (anio between 2020 and 2100),
  monto               numeric(12,2) not null check (monto >= 0),
  monto_pagado        numeric(12,2) not null default 0 check (monto_pagado >= 0),
  recargo             numeric(12,2) not null default 0 check (recargo >= 0),
  fecha_vencimiento   date,
  fecha_pago          date,
  -- columnas computadas: el cliente las lee, no se escriben
  total_a_cobrar      numeric(12,2) generated always as (monto + recargo) stored,
  saldo               numeric(12,2) generated always as (
                        greatest(monto + recargo - monto_pagado, 0)
                      ) stored,
  estado              text generated always as (
                        case
                          when monto_pagado >= monto + recargo
                            and (monto + recargo) > 0  then 'pagado'
                          when monto_pagado > 0        then 'parcial'
                          else                              'pendiente'
                        end
                      ) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (socio_id, anio, mes)
);

create index if not exists cuotas_socio_idx        on public.cuotas (socio_id);
create index if not exists cuotas_estado_idx       on public.cuotas (estado);
create index if not exists cuotas_anio_mes_idx     on public.cuotas (anio desc, mes desc);

-- ============================================================================
-- pagos (audit trail)
-- ============================================================================
create table if not exists public.pagos (
  id                  uuid primary key default gen_random_uuid(),
  socio_id            uuid not null references public.profiles(id) on delete cascade,
  monto               numeric(12,2) not null check (monto > 0),
  metodo              text not null
                        check (metodo in ('mp','transferencia','efectivo','debito','manual')),
  referencia          text,
  cuotas_cubiertas    jsonb not null default '[]'::jsonb,
  estado              text not null default 'confirmado'
                        check (estado in ('iniciado','confirmado','rechazado','anulado')),
  fecha               timestamptz not null default now(),
  fecha_confirmacion  timestamptz,
  notas               text,
  created_at          timestamptz not null default now()
);

create index if not exists pagos_socio_idx   on public.pagos (socio_id);
create index if not exists pagos_estado_idx  on public.pagos (estado);
create index if not exists pagos_fecha_idx   on public.pagos (fecha desc);

-- ============================================================================
-- config (key/value público — CBU, alias, WhatsApp, etc.)
-- Secretos como tokens de MP NO van acá: van en Supabase Vault o en env vars
-- de las Edge Functions.
-- ============================================================================
create table if not exists public.config (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now()
);

-- ============================================================================
-- Trigger: mantener updated_at en sync
-- ============================================================================
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists cuotas_updated_at on public.cuotas;
create trigger cuotas_updated_at
  before update on public.cuotas
  for each row execute function public.touch_updated_at();

drop trigger if exists config_updated_at on public.config;
create trigger config_updated_at
  before update on public.config
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- Trigger: cuando una cuota pasa a pagado, llenar fecha_pago
-- ============================================================================
create or replace function public.set_fecha_pago()
returns trigger
language plpgsql
as $$
begin
  if new.estado = 'pagado' and new.fecha_pago is null then
    new.fecha_pago = current_date;
  elsif new.estado <> 'pagado' then
    new.fecha_pago = null;
  end if;
  return new;
end;
$$;

drop trigger if exists cuotas_fecha_pago on public.cuotas;
create trigger cuotas_fecha_pago
  before insert or update on public.cuotas
  for each row execute function public.set_fecha_pago();

-- ============================================================================
-- Trigger: cuando se crea un auth.users, crear su profile.
-- El admin pasa los datos via raw_user_meta_data al invitar:
--   { nombre, dni, dorsal, categoria, telefono, role, numero_socio }
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, nombre, dni, dorsal, categoria, telefono, role, numero_socio
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    nullif(new.raw_user_meta_data->>'dni', ''),
    (new.raw_user_meta_data->>'dorsal')::int,
    nullif(new.raw_user_meta_data->>'categoria', ''),
    nullif(new.raw_user_meta_data->>'telefono', ''),
    coalesce(new.raw_user_meta_data->>'role', 'socio'),
    nullif(new.raw_user_meta_data->>'numero_socio', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.cuotas   enable row level security;
alter table public.pagos    enable row level security;
alter table public.config   enable row level security;

-- ---------------- profiles ----------------
drop policy if exists profiles_self_read     on public.profiles;
drop policy if exists profiles_self_update   on public.profiles;
drop policy if exists profiles_admin_read    on public.profiles;
drop policy if exists profiles_admin_write   on public.profiles;

-- socio: lee su propia fila
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid());

-- socio: puede actualizar campos de contacto propios.
-- No puede tocar role, estado ni numero_socio (la app los pisa de vuelta
-- desde el cliente, y la policy chequea via WITH CHECK que no cambien).
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role         = (select role         from public.profiles where id = auth.uid())
    and estado       = (select estado       from public.profiles where id = auth.uid())
    and numero_socio is not distinct from
        (select numero_socio from public.profiles where id = auth.uid())
  );

-- admin: lee todas las profiles
create policy profiles_admin_read on public.profiles
  for select using (public.is_admin());

-- admin: insert/update/delete en todas
create policy profiles_admin_write on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------- cuotas ----------------
drop policy if exists cuotas_self_read    on public.cuotas;
drop policy if exists cuotas_admin_all    on public.cuotas;

create policy cuotas_self_read on public.cuotas
  for select using (socio_id = auth.uid());

create policy cuotas_admin_all on public.cuotas
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------- pagos ----------------
drop policy if exists pagos_self_read     on public.pagos;
drop policy if exists pagos_admin_all     on public.pagos;

create policy pagos_self_read on public.pagos
  for select using (socio_id = auth.uid());

create policy pagos_admin_all on public.pagos
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------- config ----------------
-- Cualquier usuario autenticado lee (CBU, alias, etc. para mostrar en el portal)
-- Solo admin escribe.
drop policy if exists config_auth_read    on public.config;
drop policy if exists config_admin_write  on public.config;

create policy config_auth_read on public.config
  for select using (auth.role() = 'authenticated');

create policy config_admin_write on public.config
  for all using (public.is_admin()) with check (public.is_admin());
