import { useNavigate } from 'react-router-dom';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>

        {/* Back button */}
        <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', color: '#64748B', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', marginBottom: '2rem', padding: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Volver
        </button>

        <div style={{ backgroundColor: 'white', borderRadius: '1.25rem', border: '1px solid #E2E8F0', padding: '2rem 2.5rem', boxShadow: '0 4px 24px rgba(0,0,0,0.05)' }}>

          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.75rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>
            Política de Privacidad
          </h1>
          <p style={{ margin: '0 0 2rem', fontSize: '0.85rem', color: '#64748B', fontWeight: 500 }}>
            Última actualización: abril de 2025
          </p>

          <Section title="1. Responsable del Tratamiento">
            <p>En cumplimiento del Reglamento (UE) 2016/679 del Parlamento Europeo y del Consejo (RGPD) y la Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía de los derechos digitales (LOPD-GDD), le informamos que el responsable del tratamiento de sus datos personales es:</p>
            <Table rows={[
              ['Denominación', 'Padel Medina'],
              ['Actividad', 'Club deportivo de pádel'],
              ['Dirección', 'Calle Alemania, 4-20, 11170 Medina Sidonia, Cádiz'],
              ['Correo electrónico de contacto', 'padelmedina@hotmail.com'],
            ]} />
          </Section>

          <Section title="2. Datos Personales que Tratamos">
            <p>En función de los servicios que utilice, podemos tratar los siguientes datos:</p>
            <ul>
              <li><strong>Datos identificativos:</strong> nombre y apellidos.</li>
              <li><strong>Datos de contacto:</strong> dirección de correo electrónico, número de teléfono.</li>
              <li><strong>Datos de acceso:</strong> credenciales de usuario (gestionadas de forma segura a través de Supabase Auth).</li>
              <li><strong>Datos de uso del servicio:</strong> reservas de pistas, historial de partidos, inscripciones a torneos.</li>
              <li><strong>Datos de pago:</strong> los pagos se procesan mediante plataformas de pago externas (Redsys). No almacenamos datos de tarjetas bancarias.</li>
            </ul>
          </Section>

          <Section title="3. Finalidades del Tratamiento">
            <p>Sus datos se tratan con las siguientes finalidades:</p>
            <ul>
              <li>Gestionar su registro y cuenta de usuario en la aplicación.</li>
              <li>Tramitar y gestionar las reservas de pistas de pádel.</li>
              <li>Gestionar la inscripción y participación en torneos y eventos.</li>
              <li>Procesar los pagos por los servicios contratados.</li>
              <li>Enviarle comunicaciones relacionadas con sus reservas, torneos e incidencias del servicio.</li>
              <li>Cumplir con obligaciones legales aplicables al responsable del tratamiento.</li>
            </ul>
          </Section>

          <Section title="4. Base Legal del Tratamiento">
            <Table rows={[
              ['Gestión de reservas y cuenta de usuario', 'Ejecución de un contrato (art. 6.1.b RGPD)'],
              ['Comunicaciones del servicio', 'Ejecución de un contrato (art. 6.1.b RGPD)'],
              ['Inscripción en torneos y eventos', 'Ejecución de un contrato (art. 6.1.b RGPD)'],
              ['Cumplimiento de obligaciones fiscales y legales', 'Obligación legal (art. 6.1.c RGPD)'],
              ['Comunicaciones comerciales (si las hubiere)', 'Consentimiento del interesado (art. 6.1.a RGPD)'],
            ]} />
          </Section>

          <Section title="5. Plazo de Conservación">
            <p>Los datos se conservarán durante el tiempo necesario para la prestación del servicio y, en todo caso, durante los plazos legalmente exigidos:</p>
            <ul>
              <li>Datos de usuario activo: durante toda la vigencia de la relación contractual.</li>
              <li>Datos contables y fiscales: 6 años (art. 30 Código de Comercio).</li>
              <li>Tras la baja del servicio, los datos se bloquearán y eliminarán conforme a los plazos legales.</li>
            </ul>
          </Section>

          <Section title="6. Destinatarios de los Datos">
            <p>Sus datos no se cederán a terceros salvo obligación legal o cuando sea necesario para la prestación del servicio. Los encargados del tratamiento con acceso a sus datos son:</p>
            <ul>
              <li><strong>Supabase Inc.</strong> (infraestructura de base de datos y autenticación) — con servidores en la UE.</li>
              <li><strong>Vercel Inc.</strong> (plataforma de alojamiento de la aplicación web).</li>
              <li><strong>Redsys / Banco Santander</strong> (procesador de pagos con tarjeta).</li>
            </ul>
            <p>Todos los proveedores disponen de las garantías adecuadas conforme al RGPD.</p>
          </Section>

          <Section title="7. Transferencias Internacionales">
            <p>Vercel Inc. y Supabase Inc. son empresas estadounidenses que pueden transferir datos fuera del Espacio Económico Europeo. Dichas transferencias están amparadas por las cláusulas contractuales tipo aprobadas por la Comisión Europea u otras garantías adecuadas conforme al art. 46 RGPD.</p>
          </Section>

          <Section title="8. Sus Derechos">
            <p>En virtud del RGPD y la LOPD-GDD, puede ejercer los siguientes derechos dirigiéndose a <strong>padelmedina@hotmail.com</strong> con una copia de su DNI o documento identificativo equivalente:</p>
            <ul>
              <li><strong>Acceso:</strong> conocer qué datos suyos tratamos.</li>
              <li><strong>Rectificación:</strong> solicitar la corrección de datos inexactos.</li>
              <li><strong>Supresión ("derecho al olvido"):</strong> solicitar la eliminación de sus datos cuando ya no sean necesarios.</li>
              <li><strong>Oposición:</strong> oponerse al tratamiento de sus datos en determinadas circunstancias.</li>
              <li><strong>Limitación del tratamiento:</strong> solicitar la suspensión del tratamiento en ciertos supuestos.</li>
              <li><strong>Portabilidad:</strong> recibir sus datos en formato estructurado y de uso común.</li>
            </ul>
            <p>Si considera que el tratamiento de sus datos no es conforme a la normativa, puede presentar una reclamación ante la <strong>Agencia Española de Protección de Datos (AEPD)</strong> en <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" style={{ color: '#16A34A' }}>www.aepd.es</a>.</p>
          </Section>

          <Section title="9. Seguridad de los Datos">
            <p>Aplicamos medidas técnicas y organizativas apropiadas para proteger sus datos frente a accesos no autorizados, pérdida, destrucción o alteración, incluyendo:</p>
            <ul>
              <li>Cifrado de las comunicaciones mediante HTTPS/TLS.</li>
              <li>Autenticación segura gestionada por Supabase Auth.</li>
              <li>Acceso restringido a los datos únicamente al personal autorizado.</li>
              <li>Copias de seguridad periódicas de la base de datos.</li>
            </ul>
          </Section>

          <Section title="10. Uso de Cookies">
            <p>Esta aplicación puede utilizar cookies técnicas estrictamente necesarias para el funcionamiento del servicio (por ejemplo, para mantener la sesión iniciada). No utilizamos cookies publicitarias ni de seguimiento de terceros.</p>
            <p>Puede configurar su navegador para rechazar cookies, aunque ello puede afectar al correcto funcionamiento de la aplicación.</p>
          </Section>

          <Section title="11. Modificaciones de la Política de Privacidad">
            <p>Podemos actualizar esta Política de Privacidad para adaptarla a cambios normativos o del servicio. Le notificaremos cualquier cambio relevante a través de la aplicación. La fecha de la última actualización siempre aparecerá en la parte superior de este documento.</p>
          </Section>

          <Section title="12. Contacto">
            <p>Para cualquier consulta relacionada con el tratamiento de sus datos personales, puede contactarnos en:</p>
            <p style={{ fontWeight: 700, color: '#0F172A' }}>padelmedina@hotmail.com</p>
          </Section>

        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', borderBottom: '2px solid #F1F5F9', paddingBottom: '0.5rem' }}>
        {title}
      </h2>
      <div style={{ fontSize: '0.9rem', color: '#334155', lineHeight: 1.7 }}>
        {children}
      </div>
    </div>
  );
}

function Table({ rows }) {
  return (
    <div style={{ overflowX: 'auto', margin: '0.75rem 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
        <tbody>
          {rows.map(([label, value], i) => (
            <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
              <td style={{ padding: '0.6rem 0.75rem', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap', backgroundColor: '#F8FAFC', width: '40%' }}>{label}</td>
              <td style={{ padding: '0.6rem 0.75rem', color: '#334155' }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
