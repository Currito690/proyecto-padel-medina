-- El trabajador FIRMA cada fichaje (dibuja su firma). Se guarda como imagen
-- PNG en base64 (data URL). El admin la ve junto a la hora y la ubicación.
ALTER TABLE public.fichajes
  ADD COLUMN IF NOT EXISTS firma TEXT;
