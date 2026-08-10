-- Cada clase confirmada por el monitor lleva ahora:
--   precio: el precio de ESA clase, editable por el monitor junto a la hora
--           (si es NULL vale su tarifa por grupo de monitor_tarifas)
--   pagos:  con qué pagó cada alumno, uno por persona:
--           ['tarjeta','bizum','mano', null...] ('mano' = efectivo/en el club,
--           null = sin marcar)
-- Con esto el admin ve en Control horario los ingresos por día y por clase
-- y cómo pagó cada jugador.
ALTER TABLE public.clases_monitor
  ADD COLUMN IF NOT EXISTS precio NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS pagos JSONB DEFAULT '[]'::jsonb;
