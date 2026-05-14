-- ============================================================================
-- Pagos transaccionales + audit log
-- ============================================================================
-- Antes los pagos se hacían en dos pasos desde el cliente (UPDATE cuotas +
-- INSERT pagos). Si fallaba el INSERT, las cuotas quedaban saldadas sin audit
-- trail. Acá movemos esa lógica a RPCs `security definer` que hacen todo en
-- una transacción.
--
-- Las 4 funciones públicas son:
--   marcar_cuotas_pagadas(socio_id, notas)
--   marcar_cuota_pagada(cuota_id, notas)
--   pagar_cuota_parcial(cuota_id, monto, notas)
--   anular_pago(pago_id)
--
-- Todas chequean adentro que el caller sea admin (auth.uid() role='admin').
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Audit: quién creó cada pago
-- ----------------------------------------------------------------------------
alter table public.pagos
  add column if not exists creado_por uuid references auth.users(id) on delete set null;

-- ----------------------------------------------------------------------------
-- marcar_cuotas_pagadas: salda TODAS las cuotas pendientes de un socio
-- ----------------------------------------------------------------------------
create or replace function public.marcar_cuotas_pagadas(
  p_socio_id uuid,
  p_notas    text default null
)
returns uuid -- id del pago insertado
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago_id     uuid;
  v_cuotas_ids  uuid[];
  v_total       numeric(12,2);
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  select array_agg(id), coalesce(sum(total_a_cobrar - monto_pagado), 0)
    into v_cuotas_ids, v_total
    from public.cuotas
   where socio_id = p_socio_id and estado <> 'pagado';

  if v_cuotas_ids is null or array_length(v_cuotas_ids, 1) = 0 or v_total <= 0 then
    raise exception 'no_pending';
  end if;

  update public.cuotas
     set monto_pagado = total_a_cobrar
   where id = any(v_cuotas_ids);

  insert into public.pagos (
    socio_id, monto, metodo, referencia, cuotas_cubiertas,
    estado, fecha_confirmacion, notas, creado_por
  )
  values (
    p_socio_id, v_total, 'manual', 'admin-' || extract(epoch from now())::bigint::text,
    to_jsonb(v_cuotas_ids), 'confirmado', now(),
    coalesce(p_notas, 'Pago manual desde panel admin'),
    auth.uid()
  )
  returning id into v_pago_id;

  return v_pago_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- marcar_cuota_pagada: salda 1 cuota específica
-- ----------------------------------------------------------------------------
create or replace function public.marcar_cuota_pagada(
  p_cuota_id uuid,
  p_notas    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_socio_id uuid;
  v_total    numeric(12,2);
  v_pagado   numeric(12,2);
  v_a_pagar  numeric(12,2);
  v_pago_id  uuid;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  select socio_id, total_a_cobrar, monto_pagado
    into v_socio_id, v_total, v_pagado
    from public.cuotas where id = p_cuota_id;

  if v_socio_id is null then
    raise exception 'cuota_not_found';
  end if;

  v_a_pagar := v_total - v_pagado;
  if v_a_pagar <= 0 then
    raise exception 'already_paid';
  end if;

  update public.cuotas
     set monto_pagado = total_a_cobrar
   where id = p_cuota_id;

  insert into public.pagos (
    socio_id, monto, metodo, referencia, cuotas_cubiertas,
    estado, fecha_confirmacion, notas, creado_por
  )
  values (
    v_socio_id, v_a_pagar, 'manual', 'admin-' || extract(epoch from now())::bigint::text,
    to_jsonb(array[p_cuota_id]), 'confirmado', now(),
    coalesce(p_notas, 'Cuota saldada desde panel admin'),
    auth.uid()
  )
  returning id into v_pago_id;

  return v_pago_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- pagar_cuota_parcial: suma `monto` a monto_pagado (sin pasarse del total)
-- ----------------------------------------------------------------------------
create or replace function public.pagar_cuota_parcial(
  p_cuota_id uuid,
  p_monto    numeric,
  p_notas    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_socio_id  uuid;
  v_total     numeric(12,2);
  v_pagado    numeric(12,2);
  v_nuevo     numeric(12,2);
  v_aplicado  numeric(12,2);
  v_pago_id   uuid;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'invalid_amount';
  end if;

  select socio_id, total_a_cobrar, monto_pagado
    into v_socio_id, v_total, v_pagado
    from public.cuotas where id = p_cuota_id;

  if v_socio_id is null then
    raise exception 'cuota_not_found';
  end if;

  v_nuevo    := least(v_pagado + p_monto, v_total);
  v_aplicado := v_nuevo - v_pagado;

  if v_aplicado <= 0 then
    raise exception 'already_paid';
  end if;

  update public.cuotas
     set monto_pagado = v_nuevo
   where id = p_cuota_id;

  insert into public.pagos (
    socio_id, monto, metodo, referencia, cuotas_cubiertas,
    estado, fecha_confirmacion, notas, creado_por
  )
  values (
    v_socio_id, v_aplicado, 'manual',
    'admin-parcial-' || extract(epoch from now())::bigint::text,
    to_jsonb(array[p_cuota_id]), 'confirmado', now(),
    coalesce(p_notas, 'Pago parcial desde panel admin'),
    auth.uid()
  )
  returning id into v_pago_id;

  return v_pago_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- anular_pago: marca pago como anulado Y revierte las cuotas afectadas
-- ----------------------------------------------------------------------------
-- Reparte el monto del pago entre las cuotas listadas en `cuotas_cubiertas`
-- (split proporcional), restando del monto_pagado. Cap a >= 0 para no dejar
-- monto negativo si el admin ya tocó la cuota a mano.
-- ----------------------------------------------------------------------------
create or replace function public.anular_pago(p_pago_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado      text;
  v_monto       numeric(12,2);
  v_cuotas_ids  uuid[];
  v_n           int;
  v_per_cuota   numeric(12,2);
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  select estado, monto,
         (select array_agg(value::uuid) from jsonb_array_elements_text(cuotas_cubiertas))
    into v_estado, v_monto, v_cuotas_ids
    from public.pagos where id = p_pago_id;

  if v_estado is null then
    raise exception 'pago_not_found';
  end if;
  if v_estado = 'anulado' then
    raise exception 'already_anulled';
  end if;

  v_n := coalesce(array_length(v_cuotas_ids, 1), 0);
  if v_n > 0 and v_monto > 0 then
    v_per_cuota := v_monto / v_n;
    update public.cuotas
       set monto_pagado = greatest(monto_pagado - v_per_cuota, 0)
     where id = any(v_cuotas_ids);
  end if;

  update public.pagos
     set estado = 'anulado'
   where id = p_pago_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Permisos: el role authenticated puede ejecutarlas. Adentro hay un check
-- `is_admin()` que rechaza a los socios.
-- ----------------------------------------------------------------------------
grant execute on function public.marcar_cuotas_pagadas(uuid, text)            to authenticated;
grant execute on function public.marcar_cuota_pagada(uuid, text)              to authenticated;
grant execute on function public.pagar_cuota_parcial(uuid, numeric, text)     to authenticated;
grant execute on function public.anular_pago(uuid)                            to authenticated;
