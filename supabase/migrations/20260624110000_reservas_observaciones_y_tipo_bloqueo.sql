-- ============================================================================
-- Reservas: observaciones (nombre libre para reservas manuales del admin a
-- personas NO registradas) + tipo de bloqueo de franja.
-- ============================================================================

-- Nombre/observaciones de una reserva (p. ej. reserva manual del admin para
-- alguien sin cuenta). La reserva sigue asociada al user_id del admin.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS observaciones TEXT;

-- Tipo de bloqueo: 'bloqueado' (cierre normal) | 'entreno' (bloqueada para entrenos)
ALTER TABLE public.blocked_slots
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'bloqueado';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blocked_slots_tipo_chk') THEN
    ALTER TABLE public.blocked_slots
      ADD CONSTRAINT blocked_slots_tipo_chk CHECK (tipo IN ('bloqueado', 'entreno'));
  END IF;
END $$;
