-- ============================================================================
-- Migration 0007 — Generación automática de cuotas mensuales (pg_cron)
-- ============================================================================
-- Objetivo:
--   Crear automáticamente la cuota del mes en curso para cada socio activo
--   no-pausado que todavía no la tenga. Corre todos los días a las 03:00 UTC
--   (00:00 hora Argentina). Es idempotente: si la cuota ya existe, no la
--   duplica. Esto da resiliencia: si el server estuvo caído el 1°, el día 2
--   se pone al día.
--
-- Cómo se apaga sin desinstalar:
--   update public.config set value = 'no' where key = 'auto_generar_cuotas';
--   (la función chequea el toggle antes de generar)
--
-- Cómo se ve qué hizo en el último run:
--   select * from cron.job_run_details
--   where jobname = 'generar-cuotas-mensuales'
--   order by start_time desc limit 10;
--
-- Cómo se desinstala completamente:
--   select cron.unschedule('generar-cuotas-mensuales');
-- ============================================================================

create extension if not exists pg_cron;

-- ----------------------------------------------------------------------------
-- Función: genera la cuota del mes actual para activos no-pausados que falten.
-- ----------------------------------------------------------------------------
create or replace function public.generar_cuotas_mes_actual()
returns table (creadas int, mes int, anio int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mes        int  := extract(month from current_date)::int;
  v_anio       int  := extract(year  from current_date)::int;
  v_monto_base numeric;
  v_dia_venc   int;
  v_fecha_venc date;
  v_enabled    text;
  v_creadas    int;
begin
  -- Respetamos el toggle: si está en 'no', no hacemos nada.
  select value into v_enabled
  from public.config
  where key = 'auto_generar_cuotas';

  if v_enabled is null or lower(v_enabled) <> 'si' then
    return query select 0, v_mes, v_anio;
    return;
  end if;

  -- Monto base y día de vencimiento desde config (con defaults seguros).
  select coalesce(nullif(value, '')::numeric, 15000) into v_monto_base
    from public.config where key = 'cuota_monto_base';
  if v_monto_base is null then v_monto_base := 15000; end if;

  select coalesce(nullif(value, '')::int, 10) into v_dia_venc
    from public.config where key = 'cuota_dia_vencimiento';
  if v_dia_venc is null then v_dia_venc := 10; end if;
  v_dia_venc := least(greatest(v_dia_venc, 1), 28);

  v_fecha_venc := make_date(v_anio, v_mes, v_dia_venc);

  -- INSERT idempotente: solo crea las que faltan. El unique constraint
  -- (socio_id, anio, mes) garantiza que no se duplique, pero igual filtramos
  -- con NOT EXISTS para no generar conflictos por cada socio.
  insert into public.cuotas (socio_id, mes, anio, monto, fecha_vencimiento)
  select
    p.id,
    v_mes,
    v_anio,
    coalesce(p.cuota_monto, v_monto_base),
    v_fecha_venc
  from public.profiles p
  where p.role = 'socio'
    and p.estado = 'activo'
    and p.cuota_pausada = false
    and not exists (
      select 1 from public.cuotas c
      where c.socio_id = p.id
        and c.mes = v_mes
        and c.anio = v_anio
    );

  get diagnostics v_creadas = row_count;
  return query select v_creadas, v_mes, v_anio;
end;
$$;

-- Solo el rol postgres (donde corre pg_cron) puede llamarla. No la exponemos
-- a anon/authenticated — la app sigue pudiendo usar su path manual existente.
revoke all on function public.generar_cuotas_mes_actual() from public;
grant execute on function public.generar_cuotas_mes_actual() to postgres;

-- ----------------------------------------------------------------------------
-- Asegurar que el toggle existe en config (default 'si').
-- Si tu instalación ya lo tiene, el ON CONFLICT lo respeta sin pisarlo.
-- ----------------------------------------------------------------------------
insert into public.config (key, value)
values ('auto_generar_cuotas', 'si')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- Schedule: diario a las 03:00 UTC = 00:00 hora Argentina.
-- Si ya existía un job con el mismo nombre, lo reemplazamos.
-- ----------------------------------------------------------------------------
do $$
begin
  -- Limpiamos cualquier schedule previo con el mismo nombre, por idempotencia.
  perform cron.unschedule('generar-cuotas-mensuales')
  where exists (select 1 from cron.job where jobname = 'generar-cuotas-mensuales');
exception when others then
  -- Si la tabla cron.job no existe todavía o el job no está, seguimos.
  null;
end $$;

select cron.schedule(
  'generar-cuotas-mensuales',
  '0 3 * * *',                              -- todos los días a las 03:00 UTC
  $$select public.generar_cuotas_mes_actual();$$
);
