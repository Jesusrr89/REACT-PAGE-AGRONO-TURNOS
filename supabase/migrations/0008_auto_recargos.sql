-- ============================================================================
-- Migration 0008 — Aplicación automática de recargos por mora (pg_cron)
-- ============================================================================
-- Objetivo:
--   Para cuotas que llevan más de N días vencidas y siguen con saldo pendiente,
--   sumarles un recargo (config.recargo_monto). Idempotente: si la cuota ya
--   tiene recargo aplicado, no se le suma otro.
--
--   Lee del config:
--     - auto_recargos (toggle: 'si' | 'no')
--     - recargo_monto (default 3000)
--     - recargo_dias_post_vencimiento (default 60)
--
--   Corre diario a las 04:00 UTC = 01:00 hora Argentina, 1 hora después del
--   cron de generación de cuotas (no se pisan).
--
-- Cómo se apaga sin desinstalar:
--   update public.config set value = 'no' where key = 'auto_recargos';
--
-- Cómo ver el historial:
--   select * from cron.job_run_details
--   where jobname = 'aplicar-recargos-mora'
--   order by start_time desc limit 10;
--
-- Cómo desinstalar:
--   select cron.unschedule('aplicar-recargos-mora');
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Función: aplica el recargo a cuotas con +N días de mora y saldo pendiente.
-- ----------------------------------------------------------------------------
create or replace function public.aplicar_recargos_mora()
returns table (recargadas int, monto_recargo numeric, dias_corte int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled        text;
  v_recargo_monto  numeric;
  v_dias_corte     int;
  v_fecha_limite   date;
  v_recargadas     int;
begin
  -- Toggle: si está apagado, no hace nada.
  select value into v_enabled
  from public.config
  where key = 'auto_recargos';

  if v_enabled is null or lower(v_enabled) <> 'si' then
    return query select 0, 0::numeric, 0;
    return;
  end if;

  -- Lee monto y días con defaults seguros.
  select coalesce(nullif(value, '')::numeric, 3000) into v_recargo_monto
    from public.config where key = 'recargo_monto';
  if v_recargo_monto is null then v_recargo_monto := 3000; end if;

  select coalesce(nullif(value, '')::int, 60) into v_dias_corte
    from public.config where key = 'recargo_dias_post_vencimiento';
  if v_dias_corte is null then v_dias_corte := 60; end if;
  v_dias_corte := greatest(v_dias_corte, 1);

  -- Cuotas elegibles: vencidas hace más de N días + saldo pendiente
  -- + recargo aún no aplicado. Pagadas y parciales que cubrieron monto+recargo
  -- quedan excluidas naturalmente porque tienen saldo = 0.
  v_fecha_limite := current_date - (v_dias_corte || ' days')::interval;

  -- updated_at lo setea el trigger cuotas_updated_at (definido en 0001),
  -- no hace falta repetirlo acá.
  update public.cuotas
  set recargo = v_recargo_monto
  where coalesce(recargo, 0) = 0
    and fecha_vencimiento is not null
    and fecha_vencimiento < v_fecha_limite
    and (monto + coalesce(recargo, 0) - coalesce(monto_pagado, 0)) > 0;

  get diagnostics v_recargadas = row_count;
  return query select v_recargadas, v_recargo_monto, v_dias_corte;
end;
$$;

revoke all on function public.aplicar_recargos_mora() from public;
grant execute on function public.aplicar_recargos_mora() to postgres;

-- ----------------------------------------------------------------------------
-- Asegurar que el toggle existe (default 'si').
-- ----------------------------------------------------------------------------
insert into public.config (key, value)
values ('auto_recargos', 'si')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- Schedule: diario a las 04:00 UTC = 01:00 hora Argentina.
-- Una hora después del cron de cuotas para evitar superposición.
-- ----------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('aplicar-recargos-mora')
  where exists (select 1 from cron.job where jobname = 'aplicar-recargos-mora');
exception when others then
  null;
end $$;

select cron.schedule(
  'aplicar-recargos-mora',
  '0 4 * * *',                              -- todos los días a las 04:00 UTC
  $$select public.aplicar_recargos_mora();$$
);
