-- REINICIAR las horas apuntadas de lolo: borra sus fichajes ANTERIORES A HOY
-- (hora española), de modo que el contador vuelve a cero y solo cuenta desde
-- hoy. Lo que fiche HOY se conserva. Los contadores del Control horario del
-- admin y el informe mensual del monitor salen de esta tabla. NO toca sus
-- clases confirmadas, sus tarifas ni los ingresos.
--
-- ⚠️ IRREVERSIBLE. Ejecutar en Supabase → SQL Editor.
-- (Desde la app no se puede: los fichajes del trabajador son inmutables a
-- propósito — solo se pueden borrar turnos manuales del admin.)

DELETE FROM public.fichajes
WHERE user_id = (SELECT id FROM public.profiles WHERE email = 'lolo@padelmedina.com')
  AND fichado_at < ((now() AT TIME ZONE 'Europe/Madrid')::date::timestamp AT TIME ZONE 'Europe/Madrid');

-- Comprobación: lo único que debe quedar son los fichajes de HOY (0 si aún no fichó)
SELECT tipo, fichado_at AT TIME ZONE 'Europe/Madrid' AS hora_local, manual
FROM public.fichajes
WHERE user_id = (SELECT id FROM public.profiles WHERE email = 'lolo@padelmedina.com')
ORDER BY fichado_at;
