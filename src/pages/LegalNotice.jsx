import { Link } from 'react-router-dom';
import LegalPage, { Section, Table } from '../components/legal/LegalPage';
import { TITULAR, filasTitular } from '../utils/legal';

export default function LegalNotice() {
  return (
    <LegalPage
      title="Aviso Legal"
      updated="septiembre de 2026"
      related={{ to: '/privacidad', label: 'Política de Privacidad' }}
    >
      <Section title="1. Datos Identificativos del Titular">
        <p>En cumplimiento del artículo 10 de la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se informa de los datos del titular del sitio web <strong>{TITULAR.web}</strong> y de su aplicación web (en adelante, «el Sitio»):</p>
        <Table rows={filasTitular()} />
      </Section>

      <Section title="2. Objeto y Aceptación">
        <p>Este Aviso legal regula el acceso y el uso del Sitio, a través del cual los usuarios pueden reservar y pagar pistas, inscribirse en torneos y eventos y gestionar su cuenta en {TITULAR.denominacion}.</p>
        <p>El acceso al Sitio atribuye la condición de usuario e implica la aceptación de este Aviso legal en la versión publicada en cada momento. Si no está de acuerdo con su contenido, le rogamos que no utilice el Sitio.</p>
      </Section>

      <Section title="3. Registro y Cuenta de Usuario">
        <p>Para reservar pistas o inscribirse en torneos es necesario registrarse. El usuario se compromete a facilitar datos veraces, exactos y actualizados, y a aceptar la <Link to="/privacidad">Política de Privacidad</Link> en el momento del registro.</p>
        <p>El usuario es responsable de custodiar su contraseña y de toda la actividad que se realice con su cuenta. Si detecta un uso no autorizado, debe comunicarlo cuanto antes a <strong>{TITULAR.email}</strong>.</p>
        <p>{TITULAR.denominacion} podrá suspender o cancelar las cuentas que incumplan este Aviso legal o hagan un uso fraudulento o abusivo del servicio.</p>
      </Section>

      <Section title="4. Condiciones de Uso">
        <p>El usuario se compromete a utilizar el Sitio de forma lícita, diligente y conforme a este Aviso legal. En particular, se compromete a no:</p>
        <ul>
          <li>Realizar reservas en nombre de terceros sin su consentimiento o suplantar la identidad de otra persona.</li>
          <li>Introducir virus o cualquier otro sistema que pueda dañar el Sitio, sus sistemas o los equipos de otros usuarios.</li>
          <li>Intentar acceder a áreas restringidas, a cuentas de otros usuarios o a los sistemas del Sitio sin autorización.</li>
          <li>Utilizar el Sitio con fines contrarios a la ley, a la moral o al orden público.</li>
        </ul>
      </Section>

      <Section title="5. Reservas, Pagos y Cancelaciones">
        <p>Las condiciones de cada reserva o inscripción (precio, formas de pago disponibles y plazo de cancelación) se muestran en el Sitio antes de confirmarla.</p>
        <p>Los pagos con tarjeta y Bizum se procesan a través de la pasarela segura de <strong>Redsys</strong>. {TITULAR.denominacion} no tiene acceso a los datos de su tarjeta ni los almacena.</p>
      </Section>

      <Section title="6. Propiedad Intelectual e Industrial">
        <p>Los contenidos del Sitio (textos, imágenes, logotipos, marcas, diseño gráfico y código) son titularidad de {TITULAR.denominacion} o de terceros que han autorizado su uso, y están protegidos por la normativa de propiedad intelectual e industrial.</p>
        <p>Queda prohibida su reproducción, distribución, comunicación pública o transformación, total o parcial, sin la autorización expresa de su titular, salvo para el uso personal y privado del Sitio.</p>
      </Section>

      <Section title="7. Responsabilidad">
        <p>{TITULAR.denominacion} trabaja para que el Sitio esté disponible y funcione correctamente, pero no garantiza la ausencia de interrupciones o errores. El acceso podrá suspenderse temporalmente por tareas de mantenimiento, actualización o causas ajenas a su control.</p>
        <p>{TITULAR.denominacion} no se hace responsable de los daños derivados del uso indebido del Sitio por parte de los usuarios, ni de los causados por virus u otros elementos que no hayan podido evitarse con medidas de seguridad razonables.</p>
      </Section>

      <Section title="8. Enlaces a Terceros">
        <p>El Sitio puede contener enlaces a sitios de terceros (por ejemplo, mapas, WhatsApp o la pasarela de pago). {TITULAR.denominacion} no controla esos sitios ni se responsabiliza de sus contenidos o de sus políticas de privacidad.</p>
      </Section>

      <Section title="9. Protección de Datos">
        <p>El tratamiento de los datos personales de los usuarios se rige por nuestra <Link to="/privacidad">Política de Privacidad</Link>, que el usuario acepta al registrarse.</p>
      </Section>

      <Section title="10. Cookies y Almacenamiento Local">
        <p>El Sitio solo utiliza cookies y almacenamiento local técnicos, estrictamente necesarios para su funcionamiento: mantener la sesión iniciada, recordar preferencias y permitir la instalación como aplicación. No utiliza cookies publicitarias ni analíticas, por lo que no requieren su consentimiento previo (art. 22.2 LSSI-CE).</p>
      </Section>

      <Section title="11. Modificaciones">
        <p>{TITULAR.denominacion} podrá modificar este Aviso legal para adaptarlo a cambios normativos o del servicio. La versión vigente será siempre la publicada en esta página, con su fecha de última actualización.</p>
      </Section>

      <Section title="12. Legislación Aplicable y Jurisdicción">
        <p>Este Aviso legal se rige por la legislación española. Para la resolución de cualquier controversia, las partes se someten a los juzgados y tribunales que correspondan conforme a la normativa vigente; cuando el usuario tenga la condición de consumidor, a los de su domicilio.</p>
      </Section>
    </LegalPage>
  );
}
