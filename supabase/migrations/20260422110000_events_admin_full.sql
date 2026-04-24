-- El admin debe poder ver y gestionar TODOS los eventos (no solo los que ha creado él).
-- La política original "Admins can manage own events" usa auth.uid() = admin_id, así
-- que eventos creados desde otra sesión/admin quedan huérfanos: siguen visibles en la
-- web pública (si published=true) pero el admin actual no los puede ni ver en su panel
-- ni borrar. Reemplazo la policy por una basada en email, coherente con tournaments.

DROP POLICY IF EXISTS "Admins can manage own events" ON public.events;

DROP POLICY IF EXISTS "Admins manage all events" ON public.events;
CREATE POLICY "Admins manage all events"
  ON public.events
  FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'email' = 'admin@padelmedina.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'admin@padelmedina.com');
