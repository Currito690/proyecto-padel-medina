-- BORRA las clases de prueba del miércoles 5 de agosto de 2026 confirmadas en
-- clases_monitor (las que salían en ingresos sin reflejarse en ningún entreno).
-- La sección Entrenos ya las IGNORA sola (solo cuenta confirmaciones con su
-- entreno en el horario), así que este script es solo limpieza de datos.
-- ⚠️ Ejecutar en Supabase → SQL Editor (la tabla no permite DELETE desde la app).

DELETE FROM public.clases_monitor WHERE date = '2026-08-05';

-- Comprobación: debe devolver 0
SELECT count(*) AS clases_restantes_5_agosto
FROM public.clases_monitor WHERE date = '2026-08-05';
