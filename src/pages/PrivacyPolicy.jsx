import { Link } from 'react-router-dom';
import LegalPage, { Section, Table } from '../components/legal/LegalPage';
import { TITULAR, filasTitular } from '../utils/legal';

export default function PrivacyPolicy() {
  return (
    <LegalPage
      title="Política de Privacidad"
      updated="octubre de 2026"
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
          <li><strong>Datos de acceso:</strong> credenciales de usuario y un identificador interno de su cuenta. La contraseña se guarda cifrada y nunca en texto legible. Si elige iniciar sesión con Google, recibimos de Google su nombre, su correo electrónico y los datos básicos de su perfil. Si elige iniciar sesión con Apple (disponible en la app de iPhone), recibimos de Apple un identificador de su cuenta, su correo electrónico y, la primera vez, el nombre que decida compartir. Si elige ocultar su correo, Apple nos facilita una dirección de reenvío privado en lugar de su correo real, y nuestros correos le llegan a través del servicio de reenvío de Apple.</li>
          <li><strong>Datos de uso del servicio:</strong> reservas de pistas (pista, fecha, hora, importe, forma de pago y si está pagada), historial de partidos e inscripciones a torneos.</li>
          <li><strong>Datos de inscripción en torneos</strong>, tenga o no cuenta en la aplicación: nombre y teléfono de los dos jugadores de la pareja y el correo electrónico de al menos uno de ellos, la categoría, la talla de camiseta de cada jugador cuando el torneo la regala y las horas en que la pareja no puede jugar. Si inscribe a un compañero, debe informarle antes y contar con su permiso para facilitarnos sus datos.</li>
          <li><strong>Datos de pago:</strong> los pagos con tarjeta y Bizum se hacen en la página segura de la pasarela de Redsys. Ni la aplicación ni el club ven ni almacenan los datos de su tarjeta: solo guardamos la forma de pago, el importe y si está pagado.</li>
          <li><strong>Notificaciones:</strong> solo si las activa, el identificador técnico de su dispositivo para enviarle avisos. En la app de iPhone es el token que asigna el servicio de notificaciones de Apple (Apple Push Notification service, APNs); en la web y en la app de Android, la suscripción de avisos que crea su navegador.</li>
          <li><strong>Datos técnicos:</strong> dirección IP y datos del navegador o del dispositivo que se registran al acceder, necesarios para la seguridad del servicio.</li>
        </ul>
        <p><strong>Personal del club.</strong> Si trabaja para el club (por ejemplo, como monitor), tratamos además los datos de su trabajo: el registro horario con la hora de entrada y la de salida, que fija el servidor (si olvida fichar, un administrador puede añadir el turno a mano o corregir la hora, y queda constancia de la hora original, de quién la cambió y cuándo); la firma manuscrita que dibuja en la pantalla al fichar; la ubicación precisa del móvil en el momento de fichar, con su margen de precisión, si la autoriza; los precios de sus clases, las clases impartidas (número de alumnos y cómo pagó cada uno) y las horas que suman en su informe mensual. Estos datos nunca se recogen de los jugadores.</p>
        <p>Sobre la ubicación al fichar: antes de pedir el permiso, la aplicación explica para qué se usa. Solo se toma con la aplicación abierta, nunca en segundo plano, y solo se guarda la del momento de fichar, junto a la hora y la firma. Es opcional: sin ella se puede fichar igual, y el fichaje queda «sin ubicación» con una nota técnica del motivo (por ejemplo, permiso denegado) y del navegador utilizado. La ven el propio trabajador y los administradores del club, que pueden abrir ese punto en Google Maps.</p>
      </Section>

      <Section title="3. Finalidades del Tratamiento">
        <p>Sus datos se tratan con las siguientes finalidades:</p>
        <ul>
          <li>Gestionar su registro y cuenta de usuario en la aplicación, también cuando inicia sesión con Apple o con Google.</li>
          <li>Tramitar y gestionar las reservas de pistas de pádel.</li>
          <li>Gestionar la inscripción y participación en torneos y eventos: confirmar la inscripción de la pareja, organizar los cruces y horarios teniendo en cuenta su disponibilidad, publicar el cuadro y, cuando el torneo la regala, preparar la camiseta.</li>
          <li>Procesar los pagos por los servicios contratados.</li>
          <li>Enviarle por correo electrónico comunicaciones relacionadas con sus reservas, torneos e incidencias del servicio.</li>
          <li>Si activa los avisos, recordarle sus reservas con una notificación en su dispositivo unas tres horas antes de la pista o, si juega a primera hora, la víspera a las 21:00; nunca de noche (entre las 22:00 y las 9:00). En la web y en la app de Android, los avisos incluyen también los anuncios de eventos del club; en la app de iPhone solo recibe los recordatorios de sus reservas.</li>
          <li>Avisar a los administradores del club, con una notificación en sus dispositivos, de las reservas, cancelaciones y pagos (con el nombre del jugador, la pista y la hora), para gestionar las pistas.</li>
          <li>Gestionar el control horario del personal del club: fichajes, registro de jornada, clases impartidas e informe mensual de horas.</li>
          <li>Garantizar la seguridad del servicio y prevenir usos fraudulentos.</li>
          <li>Cumplir con obligaciones legales aplicables al responsable del tratamiento.</li>
        </ul>
      </Section>

      <Section title="4. Base Legal del Tratamiento">
        <Table rows={[
          ['Gestión de reservas y cuenta de usuario', 'Ejecución de un contrato (art. 6.1.b RGPD)'],
          ['Inicio de sesión con Apple o con Google', 'Ejecución de un contrato (art. 6.1.b RGPD), cuando usted elige ese método de acceso'],
          ['Comunicaciones del servicio', 'Ejecución de un contrato (art. 6.1.b RGPD)'],
          ['Inscripción en torneos y eventos, incluidos los datos del compañero de pareja', 'Ejecución de un contrato (art. 6.1.b RGPD)'],
          ['Publicación del cuadro del torneo con los nombres de las parejas', 'Interés legítimo en organizar la competición y dar a conocer los cruces, horarios y resultados (art. 6.1.f RGPD)'],
          ['Notificaciones en el dispositivo (recordatorios de reservas y, en la web y Android, anuncios de eventos)', 'Consentimiento del interesado (art. 6.1.a RGPD), que puede retirar en cualquier momento desde los ajustes de su móvil o de su navegador'],
          ['Registro horario, firma, clases e informe de horas del personal del club', 'Ejecución del contrato de trabajo (art. 6.1.b RGPD) y obligación legal de registro de jornada (art. 6.1.c RGPD y art. 34.9 del Estatuto de los Trabajadores)'],
          ['Ubicación al fichar (personal del club)', 'Consentimiento del trabajador (art. 6.1.a RGPD). Es opcional, se puede fichar sin ella y se retira desde los ajustes del móvil o del navegador'],
          ['Mapa de «Cómo llegar» y tipografía de Google', 'Interés legítimo en mostrar cómo llegar al club y en la presentación de la aplicación (art. 6.1.f RGPD)'],
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
          <li>Inscripciones a torneos: se conservan como historial del torneo (cuadros y resultados). Si elimina su cuenta, se borran su nombre, su correo y su teléfono de las inscripciones que lleven el correo de esa cuenta; los cuadros y resultados ya publicados no se modifican, así que su nombre puede seguir apareciendo en ellos. Cualquier jugador inscrito, tenga o no cuenta, puede pedir la supresión de sus datos, también en los cuadros.</li>
          <li>Identificador de notificaciones: hasta que cierre sesión en ese dispositivo, elimine su cuenta o el servicio de avisos (el de Apple o el de su navegador) nos indique que ha dejado de ser válido.</li>
          <li>Registro horario del personal, con la firma y, en su caso, la ubicación de cada fichaje: 4 años (art. 34.9 del Estatuto de los Trabajadores).</li>
          <li>Registros técnicos de acceso: durante un periodo limitado, el imprescindible para la seguridad del servicio.</li>
          <li>Tras la baja del servicio, los datos se bloquearán y eliminarán conforme a los plazos legales.</li>
        </ul>
      </Section>

      <Section title="6. Destinatarios de los Datos">
        <p>Sus datos no se cederán a terceros salvo obligación legal o cuando sea necesario para la prestación del servicio. Los encargados del tratamiento con acceso a sus datos son:</p>
        <ul>
          <li><strong>IONOS SE</strong>: alojamiento de la aplicación y de la base de datos, en servidores situados en España.</li>
          <li><strong>Resend, Inc.</strong>: envío de los correos electrónicos del servicio (códigos de verificación, confirmaciones y avisos de reservas y torneos).</li>
          <li><strong>Redsys / Banco Santander</strong>: procesamiento de los pagos con tarjeta y Bizum. Los datos de la tarjeta se introducen directamente en la pasarela de Redsys, y el club no tiene acceso a ellos.</li>
          <li><strong>Proveedor de desarrollo y mantenimiento técnico de la aplicación</strong>, que solo accede a los datos cuando es necesario para prestar ese servicio.</li>
        </ul>
        <p>Además, según las funciones que utilice, intervienen los siguientes proveedores, que tratan los datos conforme a sus propias políticas de privacidad:</p>
        <ul>
          <li><strong>Apple Distribution International Ltd.</strong>: inicio de sesión con Apple, incluido el reenvío privado de correo si oculta su dirección, y entrega de los avisos en la app de iPhone mediante el servicio de notificaciones de Apple (APNs). Consulte su <a href="https://www.apple.com/es/legal/privacy/" target="_blank" rel="noopener noreferrer">política de privacidad</a>.</li>
          <li><strong>Google Ireland Limited</strong>: inicio de sesión con Google (en la app de iPhone, mediante el componente oficial de inicio de sesión de Google), entrega de los avisos en Chrome y en la app de Android, el mapa de Google Maps del apartado «Cómo llegar» y la tipografía de Google Fonts. Consulte su <a href="https://policies.google.com/privacy?hl=es" target="_blank" rel="noopener noreferrer">política de privacidad</a>.</li>
          <li><strong>El fabricante de su navegador</strong> (por ejemplo, Mozilla en Firefox o Apple en Safari), si activa los avisos en ese navegador: entrega de esos avisos.</li>
        </ul>
        <p>Los nombres de las parejas inscritas en un torneo aparecen, con su categoría, cruces, horarios y resultados, en el cuadro del torneo, que es público.</p>
        <p>Todos los proveedores disponen de las garantías adecuadas conforme al RGPD.</p>
      </Section>

      <Section title="7. Transferencias Internacionales">
        <p>La aplicación y su base de datos se alojan en servidores situados en España. Resend, Inc. es una empresa estadounidense, por lo que el envío de correos electrónicos puede implicar una transferencia de datos fuera del Espacio Económico Europeo. Dicha transferencia está amparada por las garantías adecuadas previstas en el art. 46 RGPD, como las cláusulas contractuales tipo aprobadas por la Comisión Europea.</p>
        <p>Apple y Google pueden tratar en Estados Unidos los datos de las funciones descritas en el apartado 6 (inicio de sesión, avisos, mapa y tipografía). Esas transferencias se amparan en la decisión de adecuación de la Comisión Europea sobre el Marco de Privacidad de Datos UE-EE. UU. (art. 45 RGPD), al que están adheridas sus matrices estadounidenses, o en las cláusulas contractuales tipo (art. 46 RGPD).</p>
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
        <p>Los avisos y, en el caso del personal del club, la ubicación al fichar se pueden retirar en cualquier momento desde los ajustes del móvil (en el iPhone, desde Ajustes) o del navegador. Al cerrar sesión borramos el identificador de avisos de ese dispositivo y, al eliminar su cuenta, los de todos sus dispositivos. Si entró con Apple o con Google, puede quitar el acceso de {TITULAR.denominacion} desde los ajustes de su ID de Apple o de su cuenta de Google; eso no elimina su cuenta en la aplicación, que se borra como se indica a continuación.</p>
        <p>Puede <strong>eliminar su cuenta y sus datos personales</strong> usted mismo, desde <em>Perfil → Eliminar mi cuenta</em> en la aplicación, o solicitarlo por correo. Las instrucciones y el detalle de qué se borra y qué se conserva están en <Link to="/eliminar-cuenta">cómo eliminar su cuenta</Link>.</p>
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
        <p>Esta aplicación solo utiliza cookies y almacenamiento local técnicos, estrictamente necesarios para el funcionamiento del servicio (por ejemplo, para mantener la sesión iniciada o recordar si ya ha respondido a la invitación de activar los avisos). No utilizamos cookies publicitarias ni de análisis, ni herramientas de seguimiento.</p>
        <p>Dos contenidos de la aplicación se cargan desde servidores de Google:</p>
        <ul>
          <li><strong>Google Maps:</strong> el mapa del apartado «Cómo llegar», en la pantalla de inicio. Al mostrarse, Google recibe su dirección IP y datos técnicos de su navegador o dispositivo, y puede usar sus propias cookies o identificadores conforme a su política de privacidad. El club no recibe ni controla esos datos.</li>
          <li><strong>Google Fonts:</strong> la tipografía de la aplicación. Al descargarla, Google recibe su dirección IP.</li>
        </ul>
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
