-- Horario de pago en club por día de la semana
-- Clave: 0=domingo, 1=lunes, ..., 6=sábado
-- Valor: "HH:MM" = disponible a partir de esa hora | null = no disponible ese día
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS club_hours JSONB DEFAULT '{"0":"00:00","1":"00:00","2":"00:00","3":"00:00","4":"00:00","5":"00:00","6":"00:00"}'::jsonb;
