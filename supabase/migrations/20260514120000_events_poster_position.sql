-- Posición/zoom del cartel del evento, para que el admin elija el encuadre
-- (X% e Y% son focal point dentro del recuadro tipo object-position; zoom es
-- factor de escala con 1 = sin zoom).
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS poster_pos_x NUMERIC NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS poster_pos_y NUMERIC NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS poster_zoom  NUMERIC NOT NULL DEFAULT 1;
