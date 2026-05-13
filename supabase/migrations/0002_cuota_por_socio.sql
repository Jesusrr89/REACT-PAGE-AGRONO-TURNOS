-- ============================================================================
-- Cuota personalizada por socio
-- ============================================================================
-- Cada socio puede tener su propio monto de cuota mensual. Si `cuota_monto`
-- es NULL, se usa el valor general (config.cuota_monto_base).
-- ============================================================================

alter table public.profiles
  add column if not exists cuota_monto numeric(12,2)
    check (cuota_monto is null or cuota_monto >= 0);

-- ----------------------------------------------------------------------------
-- Repinear la policy de auto-update: el socio NO puede cambiar su propia cuota
-- (ni role, estado, numero_socio). La admin sí, vía la policy profiles_admin_write.
-- ----------------------------------------------------------------------------
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role         = (select role         from public.profiles where id = auth.uid())
    and estado       = (select estado       from public.profiles where id = auth.uid())
    and numero_socio is not distinct from
        (select numero_socio from public.profiles where id = auth.uid())
    and cuota_monto  is not distinct from
        (select cuota_monto  from public.profiles where id = auth.uid())
  );
