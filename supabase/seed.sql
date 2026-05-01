-- ============================================================================
-- Seed inicial — claves de config con defaults vacíos.
-- El admin las completa desde el panel (pestaña Configuración).
-- ============================================================================
insert into public.config (key, value) values
  ('titular',                      'Club S. y D. Agronomía Central'),
  ('cuit',                         ''),
  ('cbu',                          ''),
  ('alias',                        ''),
  ('mp_alias',                     ''),
  ('mp_link',                      ''),
  ('whatsapp',                     ''),
  ('telefono_secretaria',          ''),
  ('direccion_pago',               'Bauness 958, Parque Chas, CABA'),
  ('horario_pago',                 'Lun a Vie 18 a 22 hs · Sábados 10 a 14 hs'),
  ('dia_debito',                   'Los 5 de cada mes'),
  ('cuota_monto_base',             '15000'),
  ('cuota_dia_vencimiento',        '10'),
  ('recargo_monto',                '3000'),
  ('recargo_dias_post_vencimiento','60'),
  ('auto_generar_cuotas',          'si'),
  ('site_url',                     '')
on conflict (key) do nothing;
