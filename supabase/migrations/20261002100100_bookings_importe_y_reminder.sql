-- Dos columnas que faltaban en bookings:
--
-- importe (numeric): el precio cobrado por esa reserva, en euros. Hasta ahora no
-- se guardaba, asi que Finanzas recalculaba el pasado con el precio actual de la
-- pista (si cambiabas un precio, cambiaba el valor de reservas ya hechas). Se
-- rellena al crear la reserva (club, tarjeta/bizum via redsys-notify, y manual).
-- Las reservas antiguas quedan en NULL y Finanzas cae al calculo de siempre.
--
-- reminder_sent (boolean): la funcion send-reminders la usa para no repetir el
-- aviso "Juegas en 10h", pero la columna no existia en este servidor, asi que la
-- funcion fallaba nada mas ejecutarse. Sin ella, los recordatorios no pueden
-- funcionar.

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS importe numeric;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS reminder_sent boolean NOT NULL DEFAULT false;
