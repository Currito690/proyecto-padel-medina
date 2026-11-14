// Inicio de sesión con Google en las apps de iPhone y de Android. Google no
// permite su login dentro de las pantallas web de una app, así que en las apps va
// por su SDK nativo (@capgo/capacitor-social-login): ventana del sistema con las
// cuentas de Google y vuelta automática a la app, sin pasar por padelmedina.com.
import { Capacitor } from '@capacitor/core';

// iPhone: ID de cliente OAuth de tipo iOS (Google Cloud > Google Auth Platform >
// Clientes, Bundle ID com.padelmedina.app). Es público, no es un secreto. Requisitos:
// este mismo ID añadido a GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID en el servidor de login,
// y su "esquema invertido" (com.googleusercontent.apps.…) en Xcode > Info > URL Types
// (lo pone scripts/preparar-ios.mjs).
export const GOOGLE_IOS_CLIENT_ID = '334773436875-n3l0aeja91vpue19kal2d1mvhstear5n.apps.googleusercontent.com';

// Android: Google pide el ID del cliente WEB (el mismo del login de la web, el
// primero de GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID). Además, en Google Cloud tiene que
// existir un cliente de tipo Android con el paquete com.padelmedina.app y la huella
// SHA-1 de la firma (la de Google Play y la de la clave de subida); sin él, Google
// contesta "Developer console is not set up correctly".
export const GOOGLE_WEB_CLIENT_ID = '334773436875-prq4ntqu2am64fqrhikti1jneia3ih3k.apps.googleusercontent.com';

export const googleNativoListo = () => {
  const plataforma = Capacitor.getPlatform();
  if (plataforma === 'ios') return GOOGLE_IOS_CLIENT_ID.endsWith('.apps.googleusercontent.com');
  if (plataforma === 'android') return GOOGLE_WEB_CLIENT_ID.endsWith('.apps.googleusercontent.com');
  return false;
};
