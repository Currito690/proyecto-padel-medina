// Inicio de sesión con Google en la app de iPhone. Google no permite su login
// dentro de las pantallas web de una app, así que en iPhone va por su SDK nativo
// (@capgo/capacitor-social-login): ventana del sistema con las cuentas de Google
// y vuelta automática a la app, sin pasar por padelmedina.com.
//
// ID de cliente OAuth de tipo iOS (Google Cloud > Google Auth Platform > Clientes,
// Bundle ID com.padelmedina.app). Es público, no es un secreto. Requisitos para
// que funcione: este mismo ID añadido a GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID en el
// servidor de login, y su "esquema invertido" (com.googleusercontent.apps.…) en
// Xcode > Info > URL Types. Mientras esté vacío, el botón de Google no sale en iPhone.
// Esquema invertido para Xcode: com.googleusercontent.apps.334773436875-n3l0aeja91vpue19kal2d1mvhstear5n
export const GOOGLE_IOS_CLIENT_ID = '334773436875-n3l0aeja91vpue19kal2d1mvhstear5n.apps.googleusercontent.com';

export const googleNativoListo = () => GOOGLE_IOS_CLIENT_ID.endsWith('.apps.googleusercontent.com');
