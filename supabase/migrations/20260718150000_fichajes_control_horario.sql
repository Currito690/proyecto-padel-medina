-- CONTROL HORARIO: fichajes de entrada/salida del personal (lolo).
-- La hora la pone el SERVIDOR (default now()) — el cliente no puede falsearla.
-- La ubicación (lat/lng + precisión) se captura del GPS del dispositivo.
-- Sin UPDATE ni DELETE: el registro horario es inmutable (integridad laboral).

CREATE TABLE IF NOT EXISTS public.fichajes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida')),
  fichado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  precision_m DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fichajes_user_fecha ON public.fichajes (user_id, fichado_at DESC);

ALTER TABLE public.fichajes ENABLE ROW LEVEL SECURITY;

-- El trabajador ficha SOLO en su propio nombre (y no puede elegir la hora)
DROP POLICY IF EXISTS "Trabajador ficha" ON public.fichajes;
CREATE POLICY "Trabajador ficha"
  ON public.fichajes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- El trabajador ve sus propios fichajes; el admin los ve todos
DROP POLICY IF EXISTS "Ver fichajes propios o admin" ON public.fichajes;
CREATE POLICY "Ver fichajes propios o admin"
  ON public.fichajes FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());
