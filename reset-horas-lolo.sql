-- PONER A CERO las horas apuntadas de lolo: borra TODOS sus fichajes de
-- entrada/salida. Los contadores del Control horario del admin y el informe
-- mensual del monitor salen de esta tabla, así que quedan en 0h en todos los
-- meses. NO toca sus clases confirmadas, sus tarifas ni los ingresos.
--
-- ⚠️ IRREVERSIBLE. Ejecutar en Supabase → SQL Editor.
-- (Desde la app no se puede: la tabla fichajes no tiene política de DELETE
-- a propósito — el registro horario es inmutable para los usuarios.)

DELETE FROM public.fichajes
WHERE user_id = (SELECT id FROM public.profiles WHERE email = 'lolo@padelmedina.com');

-- Comprobación: debe devolver 0 filas
SELECT count(*) AS fichajes_restantes
FROM public.fichajes
WHERE user_id = (SELECT id FROM public.profiles WHERE email = 'lolo@padelmedina.com');
