import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useProductCart } from '../../context/ProductCartContext';
import { useAuth } from '../../context/AuthContext';
import { fmtEur } from '../../utils/shopFormat';
import { calcShipping } from '../../utils/shopPricing';
import { SHOP, displayFont, ctaBtn, darkCard, darkInput } from './shopTheme';
import { toast } from '../../utils/notify';

// Provincias peninsulares (v1: solo se envía a Península; recogida sin restricción).
const PROVINCIAS_PENINSULA = [
  'A Coruña', 'Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias', 'Ávila', 'Badajoz',
  'Barcelona', 'Bizkaia', 'Burgos', 'Cáceres', 'Cádiz', 'Cantabria', 'Castellón', 'Ciudad Real',
  'Córdoba', 'Cuenca', 'Gipuzkoa', 'Girona', 'Granada', 'Guadalajara', 'Huelva', 'Huesca', 'Jaén',
  'La Rioja', 'León', 'Lleida', 'Lugo', 'Madrid', 'Málaga', 'Murcia', 'Navarra', 'Ourense',
  'Palencia', 'Pontevedra', 'Salamanca', 'Segovia', 'Sevilla', 'Soria', 'Tarragona', 'Teruel',
  'Toledo', 'Valencia', 'Valladolid', 'Zamora', 'Zaragoza',
];

export default function ShopCheckout() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items, subtotalCentimos } = useProductCart();

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [entrega, setEntrega] = useState('recogida'); // recogida | envio
  const [calle, setCalle] = useState('');
  const [cp, setCp] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [provincia, setProvincia] = useState('');
  const [metodoPago, setMetodoPago] = useState('redsys'); // redsys (tarjeta) | bizum
  const [rates, setRates] = useState([]);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    document.title = 'Finalizar compra · Tienda Padel Medina';
    if (user) { setNombre(user.name || ''); setEmail(user.email || ''); }
    supabase.from('shipping_rates').select('*').eq('activo', true).order('orden')
      .then(({ data }) => setRates(data || []));
  }, [user]);

  // Carrito vacío → fuera
  useEffect(() => { if (items.length === 0) navigate('/tienda/carrito'); }, [items.length, navigate]);

  // Tarifa de envío aplicable (v1: zona Península). El servidor recalcula igualmente.
  const rate = useMemo(() => rates.find(r => /pen[ií]nsula/i.test(r.zona)) || rates[0] || null, [rates]);
  const envioCentimos = useMemo(
    () => calcShipping({ subtotalCentimos, metodoEntrega: entrega, rate }),
    [entrega, rate, subtotalCentimos]
  );
  const totalCentimos = subtotalCentimos + envioCentimos;

  const validate = () => {
    if (!nombre.trim()) return 'Indica tu nombre';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return 'Email no válido';
    if (!telefono.trim()) return 'Indica un teléfono de contacto';
    if (entrega === 'envio') {
      if (!calle.trim() || !cp.trim() || !ciudad.trim() || !provincia) return 'Completa la dirección de envío';
      if (!/^\d{5}$/.test(cp.trim())) return 'Código postal no válido (5 dígitos)';
    }
    return null;
  };

  const submitToRedsys = ({ redsysUrl, Ds_SignatureVersion, Ds_MerchantParameters, Ds_Signature }) => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = redsysUrl;
    const add = (name, value) => {
      const inp = document.createElement('input');
      inp.type = 'hidden'; inp.name = name; inp.value = value;
      form.appendChild(inp);
    };
    add('Ds_SignatureVersion', Ds_SignatureVersion || 'HMAC_SHA256_V1');
    add('Ds_MerchantParameters', Ds_MerchantParameters);
    add('Ds_Signature', Ds_Signature);
    document.body.appendChild(form);
    form.submit();
  };

  const handlePay = async () => {
    const err = validate();
    if (err) { toast(err, 'error'); return; }
    setPaying(true);
    try {
      // El SERVIDOR recalcula precios/stock/total desde la BD (nunca se confía
      // en el importe del cliente) y crea el pedido en 'pendiente_pago'.
      const { data, error } = await supabase.functions.invoke('shop-create-order', {
        body: {
          items: items.map(i => ({ productId: i.productId, variantId: i.variantId, cantidad: i.cantidad })),
          cliente: { nombre: nombre.trim(), email: email.trim(), telefono: telefono.trim() },
          metodo_entrega: entrega,
          direccion: entrega === 'envio' ? { calle: calle.trim(), cp: cp.trim(), ciudad: ciudad.trim(), provincia } : null,
          metodo_pago: metodoPago,
          user_id: user?.id || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.Ds_MerchantParameters) throw new Error('Respuesta de pago inválida');
      // Redirige a Redsys (sale de la SPA). El carrito se vacía en la página de
      // resultado tras confirmar el pago.
      submitToRedsys(data);
    } catch (e) {
      console.error(e);
      toast('No se pudo iniciar el pago: ' + (e.message || e), 'error');
      setPaying(false);
    }
  };

  // Paso "activo" del stepper (visual): datos → entrega → pago
  const step = !nombre.trim() || !email.trim() || !telefono.trim() ? 1 : (entrega === 'envio' && (!calle.trim() || !cp.trim() || !ciudad.trim() || !provincia)) ? 2 : 3;

  return (
    <div>
      <Link to="/tienda/carrito" style={{ color: SHOP.muted, fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none' }}>← Carrito</Link>
      <h1 style={{ ...displayFont('1.5rem'), margin: '0.75rem 0 1rem' }}>Finalizar <span style={{ color: SHOP.lime }}>compra</span></h1>

      {/* Stepper visual 1-2-3 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[[1, 'Datos'], [2, 'Entrega'], [3, 'Pago']].map(([n, l], i) => (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {i > 0 && <div style={{ width: 22, height: 2, background: step >= n ? SHOP.lime : SHOP.line }} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 900, background: step >= n ? SHOP.lime : SHOP.card, color: step >= n ? '#0D0D0D' : SHOP.muted, border: `1.5px solid ${step >= n ? SHOP.lime : SHOP.line}` }}>{step > n ? '✓' : n}</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: step >= n ? SHOP.white : SHOP.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
        {/* Formulario */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <Card title="1 · Tus datos">
            <Field label="Nombre completo *"><input style={darkInput()} value={nombre} onChange={e => setNombre(e.target.value)} /></Field>
            <Field label="Email *"><input style={darkInput()} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="para enviarte la confirmación" /></Field>
            <Field label="Teléfono *"><input style={darkInput()} value={telefono} onChange={e => setTelefono(e.target.value)} /></Field>
          </Card>

          <Card title="2 · Entrega">
            <div style={{ display: 'flex', gap: '0.6rem', marginBottom: entrega === 'envio' ? '1rem' : 0 }}>
              {[['recogida', '🏬 Recogida en club'], ['envio', '📦 Envío a domicilio']].map(([v, l]) => (
                <button key={v} onClick={() => setEntrega(v)} style={{ flex: 1, padding: '0.8rem', borderRadius: '0.75rem', border: `2px solid ${entrega === v ? SHOP.lime : SHOP.line}`, background: entrega === v ? SHOP.limeSoft : SHOP.cardSoft, fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', color: SHOP.white }}>{l}</button>
              ))}
            </div>
            {entrega === 'envio' && (
              <>
                <Field label="Dirección *"><input style={darkInput()} value={calle} onChange={e => setCalle(e.target.value)} placeholder="Calle, número, piso" /></Field>
                <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '0.6rem' }}>
                  <Field label="C.P. *"><input style={darkInput()} value={cp} onChange={e => setCp(e.target.value)} inputMode="numeric" maxLength={5} /></Field>
                  <Field label="Ciudad *"><input style={darkInput()} value={ciudad} onChange={e => setCiudad(e.target.value)} /></Field>
                </div>
                <Field label="Provincia *">
                  <select style={darkInput({ cursor: 'pointer' })} value={provincia} onChange={e => setProvincia(e.target.value)}>
                    <option value="">— Selecciona —</option>
                    {PROVINCIAS_PENINSULA.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
                <p style={{ fontSize: '0.72rem', color: SHOP.muted, margin: '0.25rem 0 0' }}>Envíos solo a España peninsular por ahora.</p>
              </>
            )}
          </Card>

          <Card title="3 · Método de pago">
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              {[['redsys', '💳 Tarjeta'], ['bizum', '📲 Bizum']].map(([v, l]) => (
                <button key={v} onClick={() => setMetodoPago(v)} style={{ flex: 1, padding: '0.8rem', borderRadius: '0.75rem', border: `2px solid ${metodoPago === v ? SHOP.lime : SHOP.line}`, background: metodoPago === v ? SHOP.limeSoft : SHOP.cardSoft, fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', color: SHOP.white }}>{l}</button>
              ))}
            </div>
          </Card>
        </div>

        {/* Resumen */}
        <div style={darkCard({ padding: '1.25rem', position: 'sticky', top: 110 })}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '0.85rem', fontWeight: 900, color: SHOP.white, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tu pedido</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '0.85rem' }}>
            {items.map(it => (
              <div key={it.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span style={{ color: SHOP.muted }}>{it.cantidad}× {it.nombre}{it.varianteDesc ? ` (${it.varianteDesc})` : ''}</span>
                <span style={{ fontWeight: 700, color: SHOP.text }}>{fmtEur(it.precioCentimos * it.cantidad)}</span>
              </div>
            ))}
          </div>
          <div style={{ borderTop: `1px solid ${SHOP.line}`, paddingTop: '0.75rem', fontSize: '0.88rem' }}>
            <Line k="Subtotal" v={fmtEur(subtotalCentimos)} />
            <Line k={`Envío${entrega === 'envio' && envioCentimos === 0 ? ' (gratis)' : ''}`} v={entrega === 'envio' ? fmtEur(envioCentimos) : '—'} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '1.1rem', color: SHOP.white, marginTop: '0.5rem' }}>
              <span>Total</span><span style={{ color: SHOP.lime }}>{fmtEur(totalCentimos)}</span>
            </div>
            <p style={{ fontSize: '0.7rem', color: SHOP.muted, margin: '0.35rem 0 0' }}>IVA incluido</p>
          </div>
          <button onClick={handlePay} disabled={paying} style={ctaBtn({ width: '100%', marginTop: '1rem', opacity: paying ? 0.7 : 1, cursor: paying ? 'not-allowed' : 'pointer' })}>
            {paying ? 'Redirigiendo al pago…' : `Pagar ${fmtEur(totalCentimos)}`}
          </button>
          <p style={{ fontSize: '0.68rem', color: SHOP.muted, textAlign: 'center', margin: '0.6rem 0 0' }}>🔒 Pago seguro mediante Redsys</p>
        </div>
      </div>
    </div>
  );
}

const Card = ({ title, children }) => (
  <div style={darkCard({ padding: '1.25rem' })}>
    <h3 style={{ margin: '0 0 1rem', fontSize: '0.82rem', fontWeight: 900, color: '#F5F5F5', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</h3>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>{children}</div>
  </div>
);
const Field = ({ label, children }) => (
  <div>
    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: '#A3A3A3', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
    {children}
  </div>
);
const Line = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#A3A3A3', marginBottom: '0.3rem' }}><span>{k}</span><span style={{ fontWeight: 700, color: '#F5F5F5' }}>{v}</span></div>
);
