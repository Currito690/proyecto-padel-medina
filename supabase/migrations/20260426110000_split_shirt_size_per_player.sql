-- Talla por jugador: en vez de concatenar 'M / L' en un solo campo (que no
-- pasaba el CHECK de la migración anterior), guardamos la talla de cada
-- jugador en su propia columna.

ALTER TABLE public.tournament_registrations
  ADD COLUMN IF NOT EXISTS player1_shirt_size text,
  ADD COLUMN IF NOT EXISTS player2_shirt_size text;

-- Drop del CHECK viejo que rechazaba combinados como "M / L"
ALTER TABLE public.tournament_registrations
  DROP CONSTRAINT IF EXISTS tournament_registrations_shirt_size_chk;

-- CHECKs por jugador
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournament_registrations_p1_shirt_chk'
  ) THEN
    ALTER TABLE public.tournament_registrations
      ADD CONSTRAINT tournament_registrations_p1_shirt_chk
      CHECK (player1_shirt_size IS NULL OR player1_shirt_size IN ('XS','S','M','L','XL','XXL'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournament_registrations_p2_shirt_chk'
  ) THEN
    ALTER TABLE public.tournament_registrations
      ADD CONSTRAINT tournament_registrations_p2_shirt_chk
      CHECK (player2_shirt_size IS NULL OR player2_shirt_size IN ('XS','S','M','L','XL','XXL'));
  END IF;
END $$;

-- Migrar datos previos: si shirt_size es una sola talla ('M', 'L'…), copiar
-- a ambas columnas. Si es combinado ('M / L'), partir.
UPDATE public.tournament_registrations
SET
  player1_shirt_size = COALESCE(player1_shirt_size, NULLIF(SPLIT_PART(shirt_size, ' / ', 1), '')),
  player2_shirt_size = COALESCE(player2_shirt_size, NULLIF(SPLIT_PART(shirt_size, ' / ', 2), ''))
WHERE shirt_size IS NOT NULL
  AND (player1_shirt_size IS NULL OR player2_shirt_size IS NULL);

-- Si tras dividir quedó una sola talla (ej. 'M' → SPLIT_PART devuelve 'M' y ''),
-- copiar p1 a p2 cuando p2 sea NULL.
UPDATE public.tournament_registrations
SET player2_shirt_size = player1_shirt_size
WHERE shirt_size IS NOT NULL
  AND player1_shirt_size IS NOT NULL
  AND player2_shirt_size IS NULL;
