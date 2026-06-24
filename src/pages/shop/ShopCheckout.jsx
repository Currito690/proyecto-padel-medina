import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useProductCart } from '../../context/ProductCartContext';
import { useAuth } from '../../context/AuthContext';
import { fmtEur } from '../../utils/shopFormat';
import { calcShipping } from '../../utils/shopPricing';
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

  return (
    <div>
      <Link to="/tienda/carrito" style={{ color: '#64748B', fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none' }}>← Carrito</Link>
      <h1 style={{ margin: '0.75rem 0 1.25rem', fontSize: '1.5rem', fontWeight: 900, color: '#0F172A' }}>Finalizar compra</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
        {/* Formulario */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <Card title="Tus datos">
            <Field label="Nombre completo *"><input style={inp} value={nombre} onChange={e => setNombre(e.target.value)} /></Field>
            <Field label="Email *"><input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="para enviarte la confirmación" /></Field>
            <Field label="Teléfono *"><input style={inp} value={telefono} onChange={e => setTelefono(e.target.value)} /></Field>
          </Card>

          <Card title="Entrega">
            <div style={{ display: 'flex', gap: '0.6rem', marginBottom: entrega === 'envio' ? '1rem' : 0 }}>
              {[['recogida', '🏬 Recogida en club'], ['envio', '📦 Envío a domicilio']].map(([v, l]) => (
                <button key={v} onClick={() => setEntrega(v)} style={{ flex: 1, padding: '0.75rem', borderRadius: '0.7rem', border: `2px solid ${entrega === v ? '#16A34A' : '#E2E8F0'}`, background: entrega === v ? '#F0FDF4' : 'white', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', color: '#0F172A' }}>{l}</button>
              ))}
            </div>
            {entrega === 'envio' && (
              <>
                <Field label="Dirección *"><input style={inp} value={calle} onChange={e => setCalle(e.target.value)} placeholder="Calle, número, piso" /></Field>
                <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '0.6rem' }}>
                  <Field label="C.P. *"><input style={inp} value={cp} onChange={e => setCp(e.target.value)} inputMode="numeric" maxLength={5} /></Field>
                  <Field label="Ciudad *"><input style={inp} value={ciudad} onChange={e => setCiudad(e.target.value)} /></Field>
                </div>
                <Field label="Provincia *">
                  <select style={{ ...inp, cursor: 'pointer', background: 'white' }} value={provincia} onChange={e => setProvincia(e.target.value)}>
                    <option value="">— Selecciona —</option>
                    {PROVINCIAS_PENINSULA.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
                <p style={{ fontSize: '0.72rem', color: '#94A3B8', margin: '0.25rem 0 0' }}>Envíos solo a España peninsular por ahora.</p>
              </>
            )}
          </Card>

          <Card title="Método de pago">
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              {[['redsys', '💳 Tarjeta'], ['bizum', '📲 Bizum']].map(([v, l]) => (
                <button key={v} onClick={() => setMetodoPago(v)} style={{ flex: 1, padding: '0.75rem', borderRadius: '0.7rem', border: `2px solid ${metodoPago === v ? '#16A34A' : '#E2E8F0'}`, background: metodoPago === v ? '#F0FDF4' : 'white', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', color: '#0F172A' }}>{l}</button>
              ))}
            </div>
          </Card>
        </div>

        {/* Resumen */}
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: '1rem', padding: '1.25rem', position: 'sticky', top: 80 }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 800 }}>Tu pedido</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '0.85rem' }}>
            {items.map(it => (
              <div key={it.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span style={{ color: '#475569' }}>{it.cantidad}× {it.nombre}{it.varianteDesc ? ` (${it.varianteDesc})` : ''}</span>
                <span style={{ fontWeight: 600 }}>{fmtEur(it.precioCentimos * it.cantidad)}</span>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '0.75rem', fontSize: '0.88rem' }}>
            <Line k="Subtotal" v={fmtEur(subtotalCentimos)} />
            <Line k={`Envío${entrega === 'envio' && envioCentimos === 0 ? ' (gratis)' : ''}`} v={entrega === 'envio' ? fmtEur(envioCentimos) : '—'} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '1.05rem', color: '#0F172A', marginTop: '0.5rem' }}>
              <span>Total</span><span>{fmtEur(totalCentimos)}</span>
            </div>
            <p style={{ fontSize: '0.7rem', color: '#94A3B8', margin: '0.35rem 0 0' }}>IVA incluido</p>
          </div>
          <button onClick={handlePay} disabled={paying} style={{ width: '100%', marginTop: '1rem', padding: '0.95rem', background: '#16A34A', color: 'white', border: 'none', borderRadius: '0.8rem', fontWeight: 800, fontSize: '1rem', cursor: paying ? 'not-allowed' : 'pointer', opacity: paying ? 0.7 : 1 }}>
            {paying ? 'Redirigiendo al pago…' : `Pagar ${fmtEur(totalCentimos)}`}
          </button>
          <p style={{ fontSize: '0.68rem', color: '#94A3B8', textAlign: 'center', margin: '0.6rem 0 0' }}>Pago seguro mediante Redsys</p>
        </div>
      </div>
    </div>
  );
}

const Card = ({ title, children }) => (
  <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: '1rem', padding: '1.25rem' }}>
    <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: 800 }}>{title}</h3>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>{children}</div>
  </div>
);
const Field = ({ label, children }) => (
  <div>
    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</label>
    {children}
  </div>
);
const Line = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B', marginBottom: '0.3rem' }}><span>{k}</span><span style={{ fontWeight: 600, color: '#0F172A' }}>{v}</span></div>
);
const inp = { width: '100%', padding: '0.7rem 0.85rem', borderRadius: '0.625rem', border: '1.5px solid #CBD5E1', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none' };
