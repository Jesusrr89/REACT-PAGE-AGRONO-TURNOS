-- ============================================================================
-- Migration 0009 — Día configurable de generación de cuotas
-- ============================================================================
-- Objetivo:
--   Permitir al admin elegir el día del mes en que se generan automáticamente
--   las cuotas (visible para el socio). Antes era fijo: el primer día en que
--   el cron lograba correr (en la práctica, día 1).
--
--   El cron sigue corriendo todos los días a las 03:00 UTC por resiliencia
--   (si la DB estuvo caída, recupera al día siguiente). Pero la función
--   ahora chequea: si el día del mes actual es ANTES del día configurado,
--   no genera nada. A partir del día configurado en adelante, genera lo
--   que falte (idempotente).
--
--   Ejemplo: cuota_dia_generacion = 5
--     - Días 1, 2, 3, 4 del mes: cron corre, no genera nada.
--     - Día 5: cron corre, genera las cuotas del mes.
--     - Días 6, 7, ...: ya están creadas, no duplica.
--
-- Cómo modificarlo desde la app:
--   update public.config set value = '5' where key = 'cuota_dia_generacion';
--
-- Cómo apagar la auto-generación (no usa este día):
--   update public.config set value = 'no' where key = 'auto_generar_cuotas';
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Asegurar que la key existe en config. Default = 1 (mantiene el comportamiento
-- anterior: genera el día 1 del mes).
-- ----------------------------------------------------------------------------
insert into public.config (key, value)
values ('cuota_dia_generacion', '1')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- Recreamos la función para que respete cuota_dia_generacion.
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
  v_dia_actual int  := extract(day   from current_date)::int;
  v_monto_base numeric;
  v_dia_venc   int;
  v_dia_gen    int;
  v_fecha_venc date;
  v_enabled    text;
  v_creadas    int;
begin
  -- Toggle global: si está en 'no', no hace nada.
  select value into v_enabled
  from public.config
  where key = 'auto_generar_cuotas';

  if v_enabled is null or lower(v_enabled) <> 'si' then
    return query select 0, v_mes, v_anio;
    return;
  end if;

  -- Día del mes en que arrancamos a generar. Defaults a 1 si no está seteado.
  -- Clamp entre 1 y 28 (no usamos 29-31 para evitar problemas con febrero).
  select coalesce(nullif(value, '')::int, 1) into v_dia_gen
    from public.config where key = 'cuota_dia_generacion';
  if v_dia_gen is null then v_dia_gen := 1; end if;
  v_dia_gen := least(greatest(v_dia_gen, 1), 28);

  -- Si todavía no llegamos al día configurado, no generamos. Esto convierte
  -- al cron diario en un "no antes del día X": el primer día >= X que el cron
  -- logre correr genera las cuotas; los días siguientes ya las encuentra
  -- creadas y no duplica.
  if v_dia_actual < v_dia_gen then
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
  -- (socio_id, anio, mes) garantiza que no se duplique, pero filtramos
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

-- Mismos permisos que la versión original.
revoke all on function public.generar_cuotas_mes_actual() from public;
grant execute on function public.generar_cuotas_mes_actual() to postgres;
