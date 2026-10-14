import { Capacitor } from '@capacitor/core';

// Dominio público de la web. En la app de iPhone (Capacitor) la web se sirve desde
// capacitor://localhost, así que window.location.origin no vale para enlaces que
// salen de la app (WhatsApp, QR, correos, compartir) ni para la vuelta de Redsys.
export const ORIGEN_PUBLICO = 'https://padelmedina.com';

// true solo en la app de iPhone. La app Android es una TWA (Chrome): aquí false.
export const esAppNativa = () => Capacitor.isNativePlatform();

// Origen para enlaces públicos: en web y Android, el de siempre; en iPhone, el dominio.
export const origenPublico = () => (esAppNativa() ? ORIGEN_PUBLICO : window.location.origin);
