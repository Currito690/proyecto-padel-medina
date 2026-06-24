import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../services/supabase';
import { toast, confirmDialog } from '../../utils/notify';

// Gestión de pedidos de la tienda: listado con filtros, KPIs (ventas hoy/mes,
// stock bajo), detalle del pedido y cambio de estado. Patrón coherente con
// FinanceManager (KPI cards + tabla) y EventsManager (CRUD contra Supabase).

const LOW_STOCK = 5;

const ESTADOS = {
  pendiente_pago: { label: 'Pendiente de pago', bg: '#F1F5F9', color: '#64748B' },
  pagado:         { label: 'Pagado',            bg: '#DCFCE7', color: '#15803D' },
  preparando:     { label: 'Preparando',        bg: '#DBEAFE', color: '#1D4ED8' },
  enviado:        { label: 'Enviado',           bg: '#E0E7FF', color: '#4338CA' },
  entregado:      { label: 'Entregado',         bg: '#D1FAE5', color: '#065F46' },
  cancelado:      { label: 'Cancelado',         bg: '#FEE2E2', color: '#B91C1C' },
  pago_fallido:   { label: 'Pago fallido',      bg: '#FEF2F2', color: '#DC2626' },
};
// Flujo de fulfillment tras el cobro
const NEXT_STATE = { pagado: 'preparando', preparando: 'enviado', enviado: 'entregado' };

const fmtEur = (c) =>
  c === null || c === undefined ? '—'
    : (c / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const PAID_STATES = ['pagado', 'preparando', 'enviado', 'entregado'];

export default function OrdersManager() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lowStock, setLowStock] = useState(0);

  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('all');
  const [detail, setDetail] = useState(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    const [{ data: ords }, { count }] = await Promise.all([
      supabase
        .from('orders')
        .select('*, order_items(*), payments(estado,codigo_respuesta,ds_authorisation_code,created_at)')
        .order('created_at', { ascending: false }),
      supabase
        .from('product_variants')
        .select('id', { count: 'exact', head: true })
        .eq('activo', true)
        .lte('stock', LOW_STOCK),
    ]);
    setOrders(ords || []);
    setLowStock(count || 0);
    setLoading(false);
  };

  // ── KPIs ──
  const kpis = useMemo(() => {
    const now = new Date();
    const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    let ventasHoy = 0, ventasMes = 0, pagados = 0, pendientes = 0;
    for (const o of orders) {
      const paid = PAID_STATES.includes(o.estado);
      if (paid) {
        pagados++;
        const t = o.paid_at ? new Date(o.paid_at).getTime() : new Date(o.created_at).getTime();
        if (t >= startDay) ventasHoy += o.total_centimos || 0;
        if (t >= startMonth) ventasMes += o.total_centimos || 0;
      }
      if (o.estado === 'pendiente_pago') pendientes++;
    }
    return { ventasHoy, ventasMes, pagados, pendientes };
  }, [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter(o => {
      if (estadoFilter !== 'all' && o.estado !== estadoFilter) return false;
      if (q && !(`${o.numero_pedido} ${o.cliente_email} ${o.cliente_nombre}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [orders, search, estadoFilter]);

  const changeState = async (order, nuevo) => {
    if (nuevo === order.estado) return;
    if (nuevo === 'cancelado') {
      const ok = await confirmDialog(`¿Cancelar el pedido ${order.numero_pedido}? (No revierte el stock automáticamente.)`, { danger: true, okText: 'Cancelar pedido', title: 'Cancelar pedido' });
      if (!ok) return;
    }
    const { error } = await supabase.from('orders').update({ estado: nuevo }).eq('id', order.id);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, estado: nuevo } : o)));
    setDetail(prev => (prev && prev.id === order.id ? { ...prev, estado: nuevo } : prev));
    toast(`Pedido ${order.numero_pedido} → ${ESTADOS[nuevo]?.label || nuevo}`, 'success');
    // Email "enviado" al cliente: se conectará en la Fase 6 (send-order-email).
  };

  return (
    <div>
      <p className="section-label" style={{ marginBottom: '1rem' }}>Pedidos de la tienda</p>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <Kpi label="Ventas hoy" value={fmtEur(kpis.ventasHoy)} color="#16A34A" />
        <Kpi label="Ventas este mes" value={fmtEur(kpis.ventasMes)} color="#1B3A6E" />
        <Kpi label="Pedidos pagados" value={kpis.pagados} color="#0F172A" />
        <Kpi label="Stock bajo" value={lowStock} color={lowStock > 0 ? '#D97706' : '#0F172A'} hint={`≤ ${LOW_STOCK} uds`} />
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <input placeholder="Buscar por nº pedido, email o nombre…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, flex: '1 1 220px', maxWidth: '360px' }} />
        <select value={estadoFilter} onChange={e => setEstadoFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Todos los estados</option>
          {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94A3B8' }}>Cargando pedidos…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94A3B8', border: '2px dashed #E2E8F0', borderRadius: '1.25rem' }}>
          <p style={{ fontWeight: 700, color: '#64748B', margin: 0 }}>Sin pedidos</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {filtered.map(o => {
            const est = ESTADOS[o.estado] || ESTADOS.pendiente_pago;
            const nItems = (o.order_items || []).reduce((s, it) => s + (it.cantidad || 0), 0);
            return (
              <div key={o.id} onClick={() => setDetail(o)}
                style={{ backgroundColor: 'white', borderRadius: '0.875rem', border: '1.5px solid #E2E8F0', padding: '0.85rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0F172A' }}>{o.numero_pedido}</span>
                    <span style={badge(est.bg, est.color)}>{est.label}</span>
                    <span style={badge('#F1F5F9', '#475569')}>{o.metodo_entrega === 'envio' ? '📦 Envío' : '🏬 Recogida'}</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '0.2rem' }}>
                    {o.cliente_nombre} · {o.cliente_email}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, color: '#16A34A' }}>{fmtEur(o.total_centimos)}</div>
                  <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{nItems} art. · {fmtDate(o.created_at)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detail && <OrderDetailModal order={detail} onClose={() => setDetail(null)} onChangeState={changeState} />}
    </div>
  );
}

function Kpi({ label, value, color, hint }) {
  return (
    <div style={{ backgroundColor: 'white', border: '1.5px solid #E2E8F0', borderRadius: '1rem', padding: '1rem 1.1rem' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color, marginTop: '0.2rem' }}>{value}</div>
      {hint && <div style={{ fontSize: '0.68rem', color: '#94A3B8', marginTop: '0.1rem' }}>{hint}</div>}
    </div>
  );
}

function OrderDetailModal({ order, onClose, onChangeState }) {
  const est = ESTADOS[order.estado] || ESTADOS.pendiente_pago;
  const addr = order.direccion_envio;
  const next = NEXT_STATE[order.estado];

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...modalCard, maxWidth: '600px' }}>
        <div style={modalHeader}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>{order.numero_pedido}</h3>
            <span style={{ ...badge(est.bg, est.color), display: 'inline-block', marginTop: '0.35rem' }}>{est.label}</span>
          </div>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Cliente */}
          <Section title="Cliente">
            <Row k="Nombre" v={order.cliente_nombre} />
            <Row k="Email" v={order.cliente_email} />
            {order.cliente_telefono && <Row k="Teléfono" v={order.cliente_telefono} />}
            <Row k="Entrega" v={order.metodo_entrega === 'envio' ? 'Envío a domicilio' : 'Recogida en club'} />
            {order.metodo_entrega === 'envio' && addr && (
              <Row k="Dirección" v={[addr.calle, addr.cp, addr.ciudad, addr.provincia].filter(Boolean).join(', ')} />
            )}
          </Section>

          {/* Líneas */}
          <Section title="Artículos">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {(order.order_items || []).map(it => (
                <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: '#334155' }}>
                    {it.cantidad}× {it.nombre_producto}{it.variante_desc ? ` (${it.variante_desc})` : ''}
                  </span>
                  <span style={{ fontWeight: 600 }}>{fmtEur(it.subtotal_centimos)}</span>
                </div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid #E2E8F0', marginTop: '0.6rem', paddingTop: '0.6rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}><span>Subtotal</span><span>{fmtEur(order.subtotal_centimos)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}><span>Envío</span><span>{fmtEur(order.gastos_envio_centimos)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: '#0F172A', marginTop: '0.3rem' }}><span>Total</span><span>{fmtEur(order.total_centimos)}</span></div>
            </div>
          </Section>

          {/* Pago */}
          <Section title="Pago">
            <Row k="Método" v={order.metodo_pago || '—'} />
            <Row k="Pagado el" v={fmtDate(order.paid_at)} />
            {order.redsys_order_id && <Row k="Redsys Order" v={order.redsys_order_id} />}
            {(order.payments || []).map((p, i) => (
              <Row key={i} k={`Intento ${i + 1}`} v={`${p.estado || '—'}${p.codigo_respuesta ? ` · cod ${p.codigo_respuesta}` : ''}${p.ds_authorisation_code ? ` · auth ${p.ds_authorisation_code}` : ''}`} />
            ))}
          </Section>

          {/* Acciones de estado */}
          <Section title="Estado del pedido">
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {next && (
                <button onClick={() => onChangeState(order, next)} style={btnPrimary}>
                  Marcar como {ESTADOS[next].label}
                </button>
              )}
              <select value={order.estado} onChange={e => onChangeState(order, e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
                {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              {order.estado !== 'cancelado' && (
                <button onClick={() => onChangeState(order, 'cancelado')} style={pillBtn('#FECACA', '#FEF2F2', '#DC2626')}>Cancelar pedido</button>
              )}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

const Section = ({ title, children }) => (
  <div>
    <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 0.5rem' }}>{title}</p>
    {children}
  </div>
);
const Row = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.85rem', padding: '0.15rem 0' }}>
    <span style={{ color: '#94A3B8' }}>{k}</span>
    <span style={{ color: '#334155', fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{v}</span>
  </div>
);

// ── estilos compartidos ──
const inputStyle = { width: '100%', padding: '0.7rem 0.85rem', borderRadius: '0.625rem', border: '1.5px solid #CBD5E1', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none' };
const btnPrimary = { padding: '0.6rem 1.1rem', backgroundColor: '#16A34A', color: 'white', border: 'none', borderRadius: '0.75rem', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' };
const overlay = { position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' };
const modalCard = { backgroundColor: 'white', borderRadius: '1.25rem', width: '100%', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', marginTop: '2rem', marginBottom: '2rem' };
const modalHeader = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid #E2E8F0' };
const closeBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '1.4rem', lineHeight: 1, padding: '0.2rem' };
const badge = (bg, color) => ({ fontSize: '0.62rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '999px', backgroundColor: bg, color, textTransform: 'uppercase', letterSpacing: '0.04em' });
const pillBtn = (border, bg, color) => ({ padding: '0.55rem 0.9rem', borderRadius: '0.55rem', border: `1.5px solid ${border}`, backgroundColor: bg, color, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' });
