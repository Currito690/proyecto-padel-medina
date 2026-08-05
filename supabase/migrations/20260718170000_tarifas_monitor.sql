-- Tarifas del trabajador/monitor para el control horario:
--   tarifa_hora_club → €/hora cuando está en el club atendiendo
--   entrenos con precio DISTINTO según el tipo de grupo:
--     tarifa_entreno_individual · tarifa_entreno_grupo2 · _grupo3 · _grupo4
-- Las horas de entreno se calculan cruzando los fichajes con los huecos
-- marcados como 'entreno' en el horario (blocked_slots), y cada entreno
-- lleva su tipo de grupo (el admin lo elige al marcarlo).
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS tarifa_hora_club NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tarifa_entreno_individual NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tarifa_entreno_grupo2 NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tarifa_entreno_grupo3 NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tarifa_entreno_grupo4 NUMERIC(6,2) DEFAULT 0;

-- Tipo de grupo de cada entreno del horario
ALTER TABLE public.blocked_slots
  ADD COLUMN IF NOT EXISTS entreno_grupo TEXT
  CHECK (entreno_grupo IS NULL OR entreno_grupo IN ('individual', 'grupo2', 'grupo3', 'grupo4'));
