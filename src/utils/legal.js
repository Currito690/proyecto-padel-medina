// Datos del titular del sitio web (LSSI-CE art. 10 y RGPD art. 13).
// Se usan en el Aviso legal y en la Política de Privacidad: cambiarlos aquí
// los cambia en las dos páginas.
//
// PENDIENTE (lo tiene que facilitar el club): NIF/CIF y, si es una sociedad o
// una asociación deportiva, su razón social exacta y el registro en el que
// está inscrita. Mientras estén vacíos, esas filas no se muestran.
export const TITULAR = {
  denominacion: 'Padel Medina',
  razonSocial: '',
  nif: '',
  registro: '',
  actividad: 'Club deportivo de pádel',
  domicilio: 'Calle Alemania, 4-20, 11170 Medina Sidonia, Cádiz',
  email: 'padelmedina@hotmail.com',
  telefono: '+34 667 421 519',
  web: 'padelmedina.com',
};

// Versión de los textos legales que el usuario acepta al registrarse. Se
// guarda en su cuenta junto a la fecha de aceptación (prueba del art. 7.1 RGPD).
// Súbela cuando cambie la Política de Privacidad o el Aviso legal.
export const VERSION_TEXTOS_LEGALES = '2026-09';

// Filas de identificación del titular, omitiendo las que aún no se conocen.
export const filasTitular = () => [
  ['Titular', TITULAR.razonSocial || TITULAR.denominacion],
  TITULAR.razonSocial ? ['Nombre comercial', TITULAR.denominacion] : null,
  TITULAR.nif ? ['NIF / CIF', TITULAR.nif] : null,
  ['Actividad', TITULAR.actividad],
  ['Domicilio', TITULAR.domicilio],
  ['Correo electrónico', TITULAR.email],
  ['Teléfono', TITULAR.telefono],
  TITULAR.registro ? ['Datos registrales', TITULAR.registro] : null,
  ['Sitio web', TITULAR.web],
].filter(Boolean);
