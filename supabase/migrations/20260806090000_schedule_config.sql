-- Parrilla de horarios EDITABLE por el admin (pestaña Horario).
-- periods: tramos del día con tope duro (mañana hasta las 14:00, tarde desde
-- las 16:00). Las horas NO cambian solas: un hueco pisado por un entreno o
-- reserva queda ocupado y no se recoloca; los ajustes los hace el admin a mano
-- (este editor o los huecos personalizados de custom_slots).
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS schedule_config JSONB DEFAULT '{"slot_minutes":90,"periods":[{"start":"09:00","end":"14:00"},{"start":"16:00","end":"22:00"}]}'::jsonb;
