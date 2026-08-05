-- Las tarifas de las CLASES las fija el MONITOR (no el admin): tabla propia
-- con RLS de dueño. La tarifa de hora de club sigue en site_settings (admin).
CREATE TABLE IF NOT EXISTS public.monitor_tarifas (
  user_id UUID PRIMARY KEY,
  tarifa_individual NUMERIC(6,2) NOT NULL DEFAULT 0,
  tarifa_grupo2 NUMERIC(6,2) NOT NULL DEFAULT 0,
  tarifa_grupo3 NUMERIC(6,2) NOT NULL DEFAULT 0,
  tarifa_grupo4 NUMERIC(6,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.monitor_tarifas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Monitor crea sus tarifas" ON public.monitor_tarifas;
CREATE POLICY "Monitor crea sus tarifas"
  ON public.monitor_tarifas FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Monitor edita sus tarifas" ON public.monitor_tarifas;
CREATE POLICY "Monitor edita sus tarifas"
  ON public.monitor_tarifas FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Ver tarifas propias o admin" ON public.monitor_tarifas;
CREATE POLICY "Ver tarifas propias o admin"
  ON public.monitor_tarifas FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- Arranque: heredar para lolo las tarifas que hubiera puesto el admin
INSERT INTO public.monitor_tarifas (user_id, tarifa_individual, tarifa_grupo2, tarifa_grupo3, tarifa_grupo4)
SELECT p.id,
       COALESCE(s.tarifa_entreno_individual, 0),
       COALESCE(s.tarifa_entreno_grupo2, 0),
       COALESCE(s.tarifa_entreno_grupo3, 0),
       COALESCE(s.tarifa_entreno_grupo4, 0)
FROM public.profiles p
CROSS JOIN (SELECT * FROM public.site_settings ORDER BY id ASC LIMIT 1) s
WHERE p.email = 'lolo@padelmedina.com'
ON CONFLICT (user_id) DO NOTHING;
