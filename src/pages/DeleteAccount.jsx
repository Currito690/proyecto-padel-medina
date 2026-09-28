import { Link } from 'react-router-dom';
import LegalPage, { Section, Table } from '../components/legal/LegalPage';
import { TITULAR } from '../utils/legal';

// Página pública (sin sesión) exigida por Google Play: cualquiera debe poder
// consultar cómo eliminar su cuenta sin instalar la aplicación.
export default function DeleteAccount() {
  const asunto = encodeURIComponent('Solicitud de eliminación de cuenta - Padel Medina');
  const cuerpo = encodeURIComponent(
    'Hola:\n\nSolicito la eliminación de mi cuenta de Padel Medina y de mis datos personales.\n\n' +
    'Correo con el que me registré: \nNombre y apellidos: \n\nGracias.'
  );

  return (
    <LegalPage
      title="Eliminar tu cuenta"
      updated="septiembre de 2026"
      related={{ to: '/privacidad', label: 'Política de Privacidad' }}
    >
      <Section title="1. Desde la aplicación (lo más rápido)">
        <p>Si puedes entrar en tu cuenta, el borrado es inmediato:</p>
        <ol>
          <li>Abre la aplicación de {TITULAR.denominacion} o entra en <strong>{TITULAR.web}</strong>.</li>
          <li>Inicia sesión y ve a <strong>Perfil</strong>.</li>
          <li>Abajo del todo, pulsa <strong>Eliminar mi cuenta</strong> y confirma.</li>
        </ol>
        <p>La cuenta se borra en ese momento y se cierra la sesión.</p>
      </Section>

      <Section title="2. Por correo electrónico">
        <p>Si no puedes acceder a tu cuenta, escríbenos desde la dirección con la que te registraste:</p>
        <p style={{ fontWeight: 700 }}>
          <a href={`mailto:${TITULAR.email}?subject=${asunto}&body=${cuerpo}`}>{TITULAR.email}</a>
        </p>
        <p>Tramitamos la solicitud en un plazo máximo de 30 días naturales. Podemos pedirte que acredites tu identidad antes de borrar nada.</p>
      </Section>

      <Section title="3. Qué se borra y qué se conserva">
        <Table rows={[
          ['Se borra', 'Tu cuenta de acceso, tu nombre, tu correo electrónico, tu teléfono y los avisos que tuvieras activados en tus dispositivos.'],
          ['Se borra', 'Tus datos personales en las inscripciones a torneos. La inscripción se conserva sin tu nombre, para no alterar los cuadros ya jugados.'],
          ['Se cancela', 'Tus reservas futuras. Los huecos quedan libres para otros jugadores y no se devuelve el importe ya abonado.'],
          ['Se conserva', 'El histórico de reservas y cobros del club, sin ningún dato personal tuyo. La normativa fiscal y mercantil obliga al club a conservar la contabilidad durante 6 años (art. 30 del Código de Comercio).'],
        ]} />
        <p>Si eres monitor o administrador del club, tu cuenta no se puede eliminar desde la aplicación, porque de ella dependen los partes de trabajo y la gestión diaria. Escríbenos y lo gestionamos.</p>
      </Section>

      <Section title="4. Antes de eliminar tu cuenta">
        <ul>
          <li>El borrado <strong>no se puede deshacer</strong>: si vuelves, tendrás que registrarte de nuevo.</li>
          <li>Si tienes una reserva próxima que quieres aprovechar, juégala antes de darte de baja.</li>
          <li>Puedes consultar qué datos tratamos y tus derechos en la <Link to="/privacidad">Política de Privacidad</Link>.</li>
        </ul>
      </Section>
    </LegalPage>
  );
}
