-- Inscripciones a torneos: la misma pareja no puede inscribirse dos veces en
-- la misma categoría del mismo torneo (orden de jugadores indistinto).
--
-- Problema: TournamentRegistration.jsx comprobaba duplicados con un SELECT
-- antes de insertar, pero los jugadores (anon) no tienen policy SELECT sobre
-- tournament_registrations, así que siempre devolvía vacío y nunca detectaba
-- nada. Desde 9e736d4 el formulario confía en el error 23505 (unique_violation)
-- del INSERT... y hasta esta migración no existía ningún índice único que lo
-- provocara: una pareja podía inscribirse (y pagar) dos veces.
--
-- Qué hace:
--   1) Función IMMUTABLE public.norm_nombre_inscripcion(text): misma
--      normalización que hacía normalizeForCompare() en la web (minúsculas,
--      espacios sobrantes fuera, sin acentos/ñ/ç) para poder usarla en un
--      índice. No depende de la extensión unaccent (no es IMMUTABLE).
--   2) Índice único sobre (torneo, categoría, pareja normalizada sin importar
--      el orden J1/J2). La categoría se compara tal cual, igual que hacía la
--      web (sale de la lista del torneo, no la escribe el jugador).
--
-- Efectos:
--   - El INSERT público devuelve 23505 y la web enseña "Esta pareja ya está
--     inscrita en esa categoría".
--   - También afecta al admin al editar nombres o categoría desde el panel:
--     si el cambio deja dos filas iguales, el UPDATE falla con 23505.
--   - "Ana García" y "ana garcia" son la misma jugadora; "García Ana" no
--     (el orden de las palabras sí cuenta, como antes en la web).
--
-- SI LA MIGRACIÓN FALLA al crear el índice ("could not create unique index"):
-- ya hay parejas duplicadas en la tabla. Lístalas con:
--
--   SELECT tournament_id, category,
--          LEAST(public.norm_nombre_inscripcion(player1_name), public.norm_nombre_inscripcion(player2_name)) AS j_a,
--          GREATEST(public.norm_nombre_inscripcion(player1_name), public.norm_nombre_inscripcion(player2_name)) AS j_b,
--          count(*) AS veces,
--          array_agg(id ORDER BY created_at) AS ids
--   FROM public.tournament_registrations
--   GROUP BY 1, 2, 3, 4
--   HAVING count(*) > 1;
--
-- Borra las sobrantes desde el panel de inscripciones (o con el DELETE de
-- abajo, que conserva la más antigua de cada grupo; va comentado a propósito
-- para que nadie borre inscripciones sin mirarlas antes) y vuelve a lanzar la
-- migración.
--
--   DELETE FROM public.tournament_registrations r
--   USING public.tournament_registrations r2
--   WHERE r.tournament_id = r2.tournament_id
--     AND r.category = r2.category
--     AND LEAST(public.norm_nombre_inscripcion(r.player1_name), public.norm_nombre_inscripcion(r.player2_name))
--       = LEAST(public.norm_nombre_inscripcion(r2.player1_name), public.norm_nombre_inscripcion(r2.player2_name))
--     AND GREATEST(public.norm_nombre_inscripcion(r.player1_name), public.norm_nombre_inscripcion(r.player2_name))
--       = GREATEST(public.norm_nombre_inscripcion(r2.player1_name), public.norm_nombre_inscripcion(r2.player2_name))
--     AND r.id <> r2.id
--     AND (r.created_at, r.id) > (r2.created_at, r2.id);

-- 1) Normalización de nombre (misma regla que normalizeForCompare en la web).
--    Solo usa funciones IMMUTABLE de pg_catalog, así que vale para un índice.
CREATE OR REPLACE FUNCTION public.norm_nombre_inscripcion(s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT translate(
    lower(regexp_replace(btrim(coalesce(s, '')), '\s+', ' ', 'g')),
    'áàäâãåéèëêíìïîóòöôõúùüûñçýÿ',
    'aaaaaaeeeeiiiiooooouuuuncyy'
  );
$$;

COMMENT ON FUNCTION public.norm_nombre_inscripcion(text) IS
  'Nombre de jugador normalizado para detectar parejas duplicadas: minúsculas, sin acentos, un solo espacio entre palabras.';

-- 2) Misma pareja (orden J1/J2 indistinto) + misma categoría + mismo torneo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_registrations_pareja_categoria
  ON public.tournament_registrations (
    tournament_id,
    category,
    LEAST(public.norm_nombre_inscripcion(player1_name), public.norm_nombre_inscripcion(player2_name)),
    GREATEST(public.norm_nombre_inscripcion(player1_name), public.norm_nombre_inscripcion(player2_name))
  );
