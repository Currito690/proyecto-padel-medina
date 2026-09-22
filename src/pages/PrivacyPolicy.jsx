import LegalPage, { Section, Table } from '../components/legal/LegalPage';
import { TITULAR, filasTitular } from '../utils/legal';

export default function PrivacyPolicy() {
  return (
    <LegalPage
      title="Política de Privacidad"
      updated="septiembre de 2026"
      related={{ to: '/aviso-legal', label: 'Aviso Legal' }}
    >
      <Section title="1. Responsable del Tratamiento">
        <p>En cumplimiento del Reglamento (UE) 2016/679 del Parlamento Europeo y del Consejo (RGPD) y la Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía de los derechos digitales (LOPD-GDD), le informamos que el responsable del tratamiento de sus datos personales es:</p>
        <Table rows={filasTitular()} />
      </Section>

      <Section title="2. Datos Personales que Tratamos">
        <p>En función de los servicios que utilice, podemos tratar los siguientes datos:</p>
        <ul>
          <li><strong>Datos identificativos:</strong> nombre y apellidos.</li>
          <li><strong>Datos de contacto:</strong> dirección de correo electrónico, número de teléfono.</li>
          <li><strong>Datos de acceso:</strong> credenciales de usuario. La contraseña se guarda cifrada y nunca en texto legible. Si elige iniciar sesión con Google, recibimos de Google su nombre y su correo electrónico.</li>
          <li><strong>Datos de uso del servicio:</strong> reservas de pistas, historial de partidos, inscripciones a torneos.</li>
          <li><strong>Datos de pago:</strong> los pagos se procesan mediante la pasarela externa de Redsys. No almacenamos datos de tarjetas bancarias.</li>
          <li><strong>Notificaciones:</strong> si las activa, el identificador técnico que su navegador nos facilita para enviarle avisos.</li>
          <li><strong>Datos técnicos:</strong> dirección IP y datos del navegador que se registran al acceder, necesarios para la seguridad del servicio.</li>
        </ul>
      </Section>

      <Section title="3. Finalidades del Tratamiento">
        <p>Sus datos se tratan con las siguientes finalidades:</p>
        <ul>
          <li>Gestionar su registro y cuenta de usuario en la aplicación.</li>
          <li>Tramitar y gestionar las reservas de pistas de pádel.</li>
          <li>Gestionar la inscripción y participación en torneos y eventos.</li>
          <li>Procesar los pagos por los servicios contratados.</li>
          <li>Enviarle comunicaciones relacionadas con sus reservas, torneos e incidencias del servicio, por correo electrónico y, si las activa, mediante notificaciones.</li>
          <li>Garantizar la seguridad del servicio y prevenir usos fraudulentos.</li>
          <li>Cumplir con obligaciones legales aplicables al responsable del tratamiento.</li>
        </ul>
      </Section>

      <Section title="4. Base Legal del Tratamiento">
        <Table rows={[
          ['Gestión de reservas y cuenta de usuario', 'Ejecución de un contrato (art. 6.1.b RGPD)'],
          ['Comunicaciones del servicio', 'Ejecución de un contrato (art. 6.1.b RGPD)'],
          ['Inscripción en torneos y eventos', 'Ejecución de un contrato (art. 6.1.b RGPD)'],
          ['Notificaciones en el dispositivo', 'Consentimiento del interesado (art. 6.1.a RGPD), que puede retirar en cualquier momento desde su navegador'],
          ['Seguridad del servicio', 'Interés legítimo (art. 6.1.f RGPD)'],
          ['Cumplimiento de obligaciones fiscales y legales', 'Obligación legal (art. 6.1.c RGPD)'],
          ['Comunicaciones comerciales (si las hubiere)', 'Consentimiento del interesado (art. 6.1.a RGPD)'],
        ]} />
      </Section>

      <Section title="5. Plazo de Conservación">
        <p>Los datos se conservarán durante el tiempo necesario para la prestación del servicio y, en todo caso, durante los plazos legalmente exigidos:</p>
        <ul>
          <li>Datos de usuario activo: durante toda la vigencia de la relación contractual.</li>
          <li>Datos contables y fiscales: 6 años (art. 30 Código de Comercio).</li>
          <li>Registros técnicos de acceso: durante un periodo limitado, el imprescindible para la seguridad del servicio.</li>
          <li>Tras la baja del servicio, los datos se bloquearán y eliminarán conforme a los plazos legales.</li>
        </ul>
      </Section>

      <Section title="6. Destinatarios de los Datos">
        <p>Sus datos no se cederán a terceros salvo obligación legal o cuando sea necesario para la prestación del servicio. Los encargados del tratamiento con acceso a sus datos son:</p>
        <ul>
          <li><strong>IONOS SE</strong>: alojamiento de la aplicación y de la base de datos, en servidores situados en España.</li>
          <li><strong>Resend, Inc.</strong>: envío de los correos electrónicos del servicio (códigos de verificación, confirmaciones y avisos de reservas).</li>
          <li><strong>Redsys / Banco Santander</strong>: procesamiento de los pagos con tarjeta y Bizum.</li>
          <li><strong>Proveedor de desarrollo y mantenimiento técnico de la aplicación</strong>, que solo accede a los datos cuando es necesario para prestar ese servicio.</li>
        </ul>
        <p>Si elige iniciar sesión con Google, Google Ireland Limited le identifica conforme a su propia política de privacidad.</p>
        <p>Todos los proveedores disponen de las garantías adecuadas conforme al RGPD.</p>
      </Section>

      <Section title="7. Transferencias Internacionales">
        <p>La aplicación y su base de datos se alojan en servidores situados en España. Resend, Inc. es una empresa estadounidense, por lo que el envío de correos electrónicos puede implicar una transferencia de datos fuera del Espacio Económico Europeo. Dicha transferencia está amparada por las garantías adecuadas previstas en el art. 46 RGPD, como las cláusulas contractuales tipo aprobadas por la Comisión Europea.</p>
      </Section>

      <Section title="8. Sus Derechos">
        <p>En virtud del RGPD y la LOPD-GDD, puede ejercer los siguientes derechos dirigiéndose a <strong>{TITULAR.email}</strong> con una copia de su DNI o documento identificativo equivalente:</p>
        <ul>
          <li><strong>Acceso:</strong> conocer qué datos suyos tratamos.</li>
          <li><strong>Rectificación:</strong> solicitar la corrección de datos inexactos.</li>
          <li><strong>Supresión ("derecho al olvido"):</strong> solicitar la eliminación de sus datos cuando ya no sean necesarios.</li>
          <li><strong>Oposición:</strong> oponerse al tratamiento de sus datos en determinadas circunstancias.</li>
          <li><strong>Limitación del tratamiento:</strong> solicitar la suspensión del tratamiento en ciertos supuestos.</li>
          <li><strong>Portabilidad:</strong> recibir sus datos en formato estructurado y de uso común.</li>
          <li><strong>Retirada del consentimiento:</strong> en los tratamientos basados en su consentimiento, en cualquier momento y sin que afecte a la licitud del tratamiento previo.</li>
        </ul>
        <p>Si considera que el tratamiento de sus datos no es conforme a la normativa, puede presentar una reclamación ante la <strong>Agencia Española de Protección de Datos (AEPD)</strong> en <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">www.aepd.es</a>.</p>
      </Section>

      <Section title="9. Seguridad de los Datos">
        <p>Aplicamos medidas técnicas y organizativas apropiadas para proteger sus datos frente a accesos no autorizados, pérdida, destrucción o alteración, incluyendo:</p>
        <ul>
          <li>Cifrado de las comunicaciones mediante HTTPS/TLS.</li>
          <li>Contraseñas almacenadas cifradas y verificación del correo electrónico al registrarse.</li>
          <li>Acceso restringido a los datos únicamente al personal autorizado.</li>
          <li>Copias de seguridad diarias de la base de datos.</li>
        </ul>
      </Section>

      <Section title="10. Uso de Cookies">
        <p>Esta aplicación solo utiliza cookies y almacenamiento local técnicos, estrictamente necesarios para el funcionamiento del servicio (por ejemplo, para mantener la sesión iniciada). No utilizamos cookies publicitarias ni de seguimiento de terceros.</p>
        <p>Puede configurar su navegador para rechazar cookies, aunque ello puede afectar al correcto funcionamiento de la aplicación.</p>
      </Section>

      <Section title="11. Modificaciones de la Política de Privacidad">
        <p>Podemos actualizar esta Política de Privacidad para adaptarla a cambios normativos o del servicio. Le notificaremos cualquier cambio relevante a través de la aplicación. La fecha de la última actualización siempre aparecerá en la parte superior de este documento.</p>
      </Section>

      <Section title="12. Contacto">
        <p>Para cualquier consulta relacionada con el tratamiento de sus datos personales, puede contactarnos en:</p>
        <p style={{ fontWeight: 700, color: '#0F172A' }}>{TITULAR.email}</p>
      </Section>
    </LegalPage>
  );
}
