-- ============================================================================
-- Migration 0010 — cuota_monto NOT NULL + DEFAULT en profiles
-- ============================================================================
-- Hasta acá la columna profiles.cuota_monto podía ser NULL, y se usaba
-- config.cuota_monto_base como fallback. Eso volvía confuso para el admin
-- saber qué paga realmente cada socio. Ahora:
--   1. Backfill: los socios con NULL toman el valor actual del config
--      (o 15000 como último recurso).
--   2. DEFAULT 15000: si el trigger handle_new_user inserta un profile sin
--      cuota_monto, queda con este default y la app después lo updatea.
--   3. NOT NULL: la DB rechaza intentos de dejarlo nulo.
--   4. CHECK >= 0: el monto puede ser 0 (socios honorarios/exentos) o positivo.
--      Lo único que ya no se admite es NULL o negativos.
--
-- Notas:
--   - La función generar_cuotas_mes_actual sigue con coalesce(p.cuota_monto,
--     v_monto_base) pero en la práctica ahora nunca cae al fallback porque
--     cuota_monto está garantizado por NOT NULL. Lo dejamos por defensa.
--   - El check anterior (`cuota_monto is null or cuota_monto >= 0`) tiene
--     nombre auto-generado por Postgres; lo buscamos en pg_constraint y lo
--     dropeamos antes de poner el nuevo.
-- ============================================================================

-- 1. Backfill: a los que tienen NULL les asignamos el monto base del config.
update public.profiles
set cuota_monto = coalesce(
  (select nullif(value, '')::numeric from public.config where key = 'cuota_monto_base'),
  15000
)
where cuota_monto is null;

-- 2. Default para futuras inserciones (el trigger handle_new_user no setea
-- cuota_monto; este default cubre ese caso para no violar el NOT NULL).
alter table public.profiles
  alter column cuota_monto set default 15000;

-- 3. NOT NULL constraint.
alter table public.profiles
  alter column cuota_monto set not null;

-- 4. Reemplazar el check existente por uno que admite 0 y positivos (>= 0).
-- El check viejo se llama auto-generado (algo como profiles_cuota_monto_check),
-- lo buscamos y lo borramos antes de agregar el nuevo.
do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'public.profiles'::regclass
    and contype  = 'c'
    and pg_get_constraintdef(oid) ilike '%cuota_monto%'
    -- excluir el que vamos a crear nosotros, por idempotencia
    and conname <> 'profiles_cuota_monto_nonneg';
  if v_constraint_name is not null then
    execute format('alter table public.profiles drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table public.profiles
  drop constraint if exists profiles_cuota_monto_nonneg;

-- Por si quedó del intento anterior (con >0). Lo borramos para no duplicar.
alter table public.profiles
  drop constraint if exists profiles_cuota_monto_positive;

alter table public.profiles
  add constraint profiles_cuota_monto_nonneg check (cuota_monto >= 0);
