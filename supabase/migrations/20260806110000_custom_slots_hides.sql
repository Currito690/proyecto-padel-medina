-- "EDITAR HORA" de un hueco para UN día concreto: el hueco personalizado
-- guarda en hides el texto del hueco base de la parrilla al que sustituye ese
-- día (ej.: hides='19:00 - 20:30' y time_slot='19:30 - 21:00'). Mientras el
-- personalizado exista, el hueco base no se ofrece ese día; al borrarlo
-- (Quitar hueco), el hueco base reaparece solo.
ALTER TABLE public.custom_slots
  ADD COLUMN IF NOT EXISTS hides TEXT;
