-- ============================================================================
-- Pausar cuota por socio
-- ============================================================================
-- Cuando `cuota_pausada` es true, los generadores mensuales (panel admin)
-- saltean al socio. Útil para licencias temporales, jugadores lesionados,
-- becados, etc. — sin tener que desactivar la cuenta entera.
-- ============================================================================

alter table public.profiles
  add column if not exists cuota_pausada boolean not null default false;

create index if not exists profiles_cuota_pausada_idx
  on public.profiles (cuota_pausada) where cuota_pausada = true;

-- ----------------------------------------------------------------------------
-- Repinear la policy de auto-update: el socio NO puede cambiar su propio flag
-- de pausa (el admin sí, vía profiles_admin_write).
-- ----------------------------------------------------------------------------
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role          = (select role          from public.profiles where id = auth.uid())
    and estado        = (select estado        from public.profiles where id = auth.uid())
    and numero_socio  is not distinct from
        (select numero_socio  from public.profiles where id = auth.uid())
    and cuota_monto   is not distinct from
        (select cuota_monto   from public.profiles where id = auth.uid())
    and cuota_pausada is not distinct from
        (select cuota_pausada from public.profiles where id = auth.uid())
  );
