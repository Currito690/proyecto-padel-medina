-- HUECOS PERSONALIZADOS: el admin puede añadir en cualquier pista y día un
-- hueco a medida fuera de la parrilla fija (ej.: tras una clase de 20:00-21:00,
-- ofrecer "21:00 - 22:30"). Los jugadores lo ven y reservan como uno normal
-- (mismo circuito: pago, holds, candado único — todo va por el texto del hueco).
CREATE TABLE IF NOT EXISTS public.custom_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL,
  date DATE NOT NULL,
  time_slot TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (court_id, date, time_slot)
);

CREATE INDEX IF NOT EXISTS idx_custom_slots_fecha ON public.custom_slots (date, court_id);

ALTER TABLE public.custom_slots ENABLE ROW LEVEL SECURITY;

-- Todo el mundo los ve (los jugadores necesitan verlos para reservar)
DROP POLICY IF EXISTS "Ver huecos personalizados" ON public.custom_slots;
CREATE POLICY "Ver huecos personalizados"
  ON public.custom_slots FOR SELECT
  USING (true);

-- Solo el admin los crea y los borra
DROP POLICY IF EXISTS "Admin crea huecos" ON public.custom_slots;
CREATE POLICY "Admin crea huecos"
  ON public.custom_slots FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin borra huecos" ON public.custom_slots;
CREATE POLICY "Admin borra huecos"
  ON public.custom_slots FOR DELETE TO authenticated
  USING (public.is_admin());
