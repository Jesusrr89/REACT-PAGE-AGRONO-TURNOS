-- ============================================================================
-- RLS hardening
-- ============================================================================
-- Cierra dos huecos pequeños que detectó la auditoría final de seguridad:
--   1) Un socio podía cambiarse su propio `email` o `dni` desde el portal
--      (la policy `profiles_self_update` no los pineaba). Sin escalar
--      privilegio, pero ensuciaba la base.
--   2) `config_auth_read` exponía TODA la tabla `config` a cualquier socio
--      autenticado — incluido `notification_email` (mail interno de la
--      secretaría). Lo limitamos a una whitelist de keys públicas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles: pinear email y dni junto a los otros campos sensibles
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
    and email         is not distinct from
        (select email         from public.profiles where id = auth.uid())
    and dni           is not distinct from
        (select dni           from public.profiles where id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- config: el socio solo lee las keys "públicas" (CBU, alias, WhatsApp, horarios
-- de pago, etc.). Las internas (notification_email, site_url) quedan solo
-- visibles para admin.
-- ----------------------------------------------------------------------------
drop policy if exists config_auth_read on public.config;
create policy config_auth_read on public.config
  for select using (
    auth.role() = 'authenticated'
    and key in (
      'titular',
      'cuit',
      'cbu',
      'alias',
      'mp_alias',
      'mp_link',
      'whatsapp',
      'telefono_secretaria',
      'direccion_pago',
      'horario_pago',
      'dia_debito',
      'cuota_monto_base',
      'cuota_dia_vencimiento',
      'recargo_monto',
      'recargo_dias_post_vencimiento'
    )
  );

-- admin ve todo (la policy config_admin_write ya cubre escrituras; agregamos
-- una de lectura específica para admin que sí ve todo, incluyendo internas).
drop policy if exists config_admin_read on public.config;
create policy config_admin_read on public.config
  for select using (public.is_admin());

-- ----------------------------------------------------------------------------
-- config.key: limitar a charset razonable para evitar que un admin malicioso
-- inserte una key con HTML/JS (defensa en profundidad — hoy el cliente solo
-- lee keys conocidas, pero por las dudas).
-- ----------------------------------------------------------------------------
alter table public.config
  drop constraint if exists config_key_format;
alter table public.config
  add constraint config_key_format check (key ~ '^[a-z_][a-z0-9_]{0,39}$');
