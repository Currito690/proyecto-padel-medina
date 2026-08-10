import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import TournamentManager from '../components/admin/TournamentManager';
import EventsManager from '../components/admin/EventsManager';
import FinanceManager from '../components/admin/FinanceManager';
import ProductsManager from '../components/admin/ProductsManager';
import OrdersManager from '../components/admin/OrdersManager';
import TimeClockManager from '../components/admin/TimeClockManager';
import DateSelector from '../components/booking/DateSelector';
import { toast, confirmDialog } from '../utils/notify';
import { serverToday, serverNow } from '../utils/serverTime';
import { DEFAULT_SCHEDULE_CONFIG, normalizeScheduleConfig, buildScheduleTimes, rebuildAvailableTimes, parseSlot, toMin } from '../utils/schedule';

const formatDate = (dateStr) => {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
};

const slotColors = {
  available: { borderColor: '#86EFAC', backgroundColor: '#F0FDF4', color: '#15803D' },
  booked:    { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', color: '#DC2626' },
  online:    { borderColor: '#93C5FD', backgroundColor: '#EFF6FF', color: '#2563EB' }, // tarjeta/bizum
  club:      { borderColor: '#FDE68A', backgroundColor: '#FFFBEB', color: '#B45309' }, // pago en el club
  blocked:   { borderColor: '#CBD5E1', backgroundColor: '#F1F5F9', color: '#94A3B8' },
  entreno:   { borderColor: '#D8B4FE', backgroundColor: '#FAF5FF', color: '#9333EA' }, // bloqueada para entrenos
  selected:  { borderColor: '#0F172A', backgroundColor: '#0F172A', color: 'white' },
};

// Color de una reserva según su método de pago: tarjeta/bizum = AZUL;
// todo lo demás (pago en club, manual del admin, gratis, antiguas) = ROJO.
const metodoColor = (metodo) =>
  metodo === 'tarjeta' || metodo === 'bizum' ? slotColors.online : slotColors.booked;

// Etiqueta del método de pago de una reserva (con fallback para reservas antiguas).
const METODO_PAGO_LABELS = {
  club: '🏪 Pago en el club',
  tarjeta: '💳 Tarjeta',
  bizum: '📱 Bizum',
  gratis: '🎾 Gratis',
  manual: '✍️ Reserva manual',
};
const formatMetodoPago = (metodo, isFree) =>
  METODO_PAGO_LABELS[metodo] || (isFree ? '🎾 Gratis' : '—');

// Gestión del pago compartido por el admin: ver el estado X/4 y marcar pagada la
// parte de un jugador (p.ej. si paga en el club en vez de por su enlace).
function SplitAdmin({ bookingId }) {
  const [tokens, setTokens] = useState([]);
  const [paid, setPaid] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: b }, { data: toks }] = await Promise.all([
      supabase.from('bookings').select('split_paid').eq('id', bookingId).single(),
      supabase.from('shared_payment_tokens').select('id, phone, amount, paid').eq('booking_id', bookingId).order('created_at'),
    ]);
    setPaid(b?.split_paid || 1);
    setTokens(toks || []);
    setLoading(false);
  }, [bookingId]);

  useEffect(() => { if (bookingId) load(); }, [bookingId, load]);

  const bumpPaid = async (delta) => {
    const { data: b } = await supabase.from('bookings').select('split_paid').eq('id', bookingId).single();
    const next = Math.min(4, Math.max(0, (b?.split_paid || 1) + delta));
    await supabase.from('bookings').update({ split_paid: next }).eq('id', bookingId);
  };

  const markToken = async (tok) => {
    setBusy(true);
    await supabase.from('shared_payment_tokens').update({ paid: true, paid_at: new Date().toISOString() }).eq('id', tok.id);
    await bumpPaid(1);
    await load();
    setBusy(false);
  };

  const markClub = async () => {
    setBusy(true);
    await bumpPaid(1);
    await load();
    setBusy(false);
  };

  if (loading) return <p style={{ fontSize: '0.78rem', color: '#94A3B8', margin: '0.6rem 0 0' }}>Cargando pago compartido…</p>;

  return (
    <div style={{ marginTop: '0.6rem', background: 'white', border: '1px solid #E2E8F0', borderRadius: '0.6rem', padding: '0.7rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: tokens.length ? '0.5rem' : 0 }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A' }}>👥 Pago compartido</span>
        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: paid >= 4 ? '#15803D' : '#B45309', background: paid >= 4 ? '#F0FDF4' : '#FFFBEB', border: `1px solid ${paid >= 4 ? '#BBF7D0' : '#FDE68A'}`, padding: '0.15rem 0.5rem', borderRadius: 999 }}>
          {paid >= 4 ? '✓ Todo pagado' : `${paid}/4`}
        </span>
      </div>
      {tokens.map(t => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', padding: '0.35rem 0', borderTop: '1px solid #F1F5F9' }}>
          <span style={{ fontSize: '0.78rem', color: '#0F172A', fontWeight: 600 }}>📱 {t.phone} · {Number(t.amount).toFixed(2).replace('.', ',')}€</span>
          {t.paid ? (
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#15803D', whiteSpace: 'nowrap' }}>✓ Pagado</span>
          ) : (
            <button onClick={() => markToken(t)} disabled={busy} style={{ fontSize: '0.7rem', fontWeight: 800, color: 'white', background: '#16A34A', border: 'none', borderRadius: '0.45rem', padding: '0.35rem 0.55rem', cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>Marcar pagado</button>
          )}
        </div>
      ))}
      {paid < 4 && (
        <button onClick={markClub} disabled={busy} style={{ marginTop: '0.55rem', width: '100%', fontSize: '0.74rem', fontWeight: 800, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '0.5rem', padding: '0.45rem', cursor: busy ? 'wait' : 'pointer' }}>
          🏪 Marcar un pago en el club (+1)
        </button>
      )}
    </div>
  );
}

// Cómo ha pagado CADA JUGADOR de la reserva (lo marca el admin al pulsar la
// reserva en su Horario): 💳 tarjeta / 📱 bizum / 🏪 club por jugador, o el
// atajo "✓ Pista pagada" (= cobro_confirmado, el mismo check que usa Finanzas).
function PagosPistaAdmin({ bookingId, initPagos, initCobro, initIsFree, initMetodo, onSaved }) {
  const norm = (arr) => {
    const a = Array.isArray(arr) ? [...arr] : [];
    while (a.length < 4) a.push(null);
    return a.slice(0, 4);
  };
  const [pagos, setPagos] = useState(() => norm(initPagos));
  const [cobro, setCobro] = useState(!!initCobro);
  const [isFree, setIsFree] = useState(!!initIsFree);
  const [metodo, setMetodo] = useState(initMetodo || null);
  const [busy, setBusy] = useState(false);

  // Releer SIEMPRE de BD al abrir: el mapa de slots del padre solo se recarga
  // al cambiar de día — partir de su copia vieja machacaría pagos ya guardados.
  useEffect(() => {
    let alive = true;
    supabase.from('bookings').select('*').eq('id', bookingId).single().then(({ data }) => {
      if (!alive || !data) return;
      setPagos(norm(data.pagos_jugadores));
      setCobro(!!data.cobro_confirmado);
      setIsFree(!!data.is_free);
      setMetodo(data.metodo_pago || null);
    });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const marcar = async (idx, metodoPago) => {
    if (busy) return;
    const next = [...pagos];
    next[idx] = next[idx] === metodoPago ? null : metodoPago; // repetir = desmarcar
    setBusy(true);
    const { error } = await supabase.from('bookings').update({ pagos_jugadores: next }).eq('id', bookingId);
    setBusy(false);
    if (error) {
      toast(/pagos_jugadores/i.test(error.message || '')
        ? 'Falta aplicar la migración bookings_pagos_jugadores en Supabase'
        : 'Error: ' + error.message, 'error');
      return;
    }
    setPagos(next);
    onSaved?.({ pagosJugadores: next });
  };

  const togglePagada = async () => {
    if (busy) return;
    const next = !cobro;
    // La MISMA regla que Finanzas (confirmarCobro/deshacerCobro): una reserva
    // manual del admin nace is_free=true y pasa a contar como ingreso al
    // cobrarse; al deshacer vuelve a gratuita. Sin esto, el mismo botón daría
    // cifras distintas según se pulse aquí o en Finanzas.
    const patch = { cobro_confirmado: next, cobrado_at: next ? new Date().toISOString() : null };
    let nextFree = isFree;
    if (metodo === 'manual') {
      if (next && isFree) { patch.is_free = false; nextFree = false; }
      if (!next) { patch.is_free = true; nextFree = true; }
    }
    setBusy(true);
    const { error } = await supabase.from('bookings').update(patch).eq('id', bookingId);
    setBusy(false);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    setCobro(next);
    setIsFree(nextFree);
    onSaved?.({ cobroConfirmado: next, isFree: nextFree });
    toast(next ? '✓ Pista marcada como pagada (también en Finanzas)' : 'Pista marcada como pendiente de cobro', 'success');
  };

  const METODOS_PISTA = [['tarjeta', '💳 Tarjeta'], ['bizum', '📱 Bizum'], ['club', '🏪 Club']];
  return (
    <div style={{ marginTop: '0.6rem', marginBottom: '0.6rem', background: 'white', border: '1px solid #E2E8F0', borderRadius: '0.6rem', padding: '0.7rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A' }}>💰 Cómo han pagado los jugadores</span>
        <button onClick={togglePagada} disabled={busy}
          style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.3rem 0.7rem', borderRadius: 999, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
            border: `1.5px solid ${cobro ? '#16A34A' : '#CBD5E1'}`, background: cobro ? '#16A34A' : 'white', color: cobro ? 'white' : '#475569' }}>
          {cobro ? '✓ Pista pagada' : 'Marcar pista pagada'}
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', minWidth: 68 }}>👤 Jugador {i + 1}</span>
            {METODOS_PISTA.map(([mk, ml]) => (
              <button key={mk} disabled={busy} onClick={() => marcar(i, mk)}
                style={{ padding: '0.28rem 0.55rem', borderRadius: 999, fontSize: '0.68rem', fontWeight: 800, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
                  border: `1.5px solid ${pagos[i] === mk ? '#1D4ED8' : '#E2E8F0'}`,
                  background: pagos[i] === mk ? '#1D4ED8' : 'white',
                  color: pagos[i] === mk ? 'white' : '#64748B' }}>
                {ml}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const editLabel = { display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' };
const editInput = { width: '100%', padding: '0.7rem 0.85rem', borderRadius: '0.6rem', border: '1.5px solid #CBD5E1', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' };

const UserRow = ({ u, togglingId, toggleBan, onDeleted, onUpdated, supabase }) => {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [eName, setEName] = useState(u.name || '');
  const [eEmail, setEEmail] = useState(u.email || '');
  const [ePhone, setEPhone] = useState(u.phone || '');
  const [ePassword, setEPassword] = useState('');

  const openEdit = () => {
    setEName(u.name || ''); setEEmail(u.email || ''); setEPhone(u.phone || ''); setEPassword('');
    setShowEdit(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (ePassword && ePassword.length < 6) { toast('La contraseña debe tener al menos 6 caracteres', 'error'); return; }
    setSavingEdit(true);
    try {
      const body = { userId: u.id, name: eName.trim(), phone: ePhone.trim() };
      if (eEmail.trim() && eEmail.trim() !== u.email) body.email = eEmail.trim();
      if (ePassword) body.password = ePassword;
      const { data, error } = await supabase.functions.invoke('admin-update-user', { body });
      if (error) {
        let msg = error.message || 'Error desconocido';
        try { const b = await error.context?.json?.(); if (b?.error) msg = b.error; } catch {}
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      onUpdated(u.id, { name: eName.trim(), phone: ePhone.trim(), ...(body.email ? { email: body.email } : {}) });
      toast('Jugador actualizado', 'success');
      setShowEdit(false);
    } catch (err) {
      toast('Error al guardar: ' + (err.message || JSON.stringify(err)), 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId: u.id },
      });
      if (error) {
        let msg = error.message || 'Error desconocido';
        try { const body = await error.context?.json?.(); if (body?.error) msg = body.error; } catch {}
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      onDeleted(u.id);
    } catch (err) {
      toast('Error al eliminar: ' + (err.message || JSON.stringify(err)));
    } finally {
      setDeleting(false);
      setShowConfirmDelete(false);
    }
  };

  return (
    <>
      {showConfirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '1.25rem', padding: '2rem 1.75rem', maxWidth: '420px', width: '100%', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', border: '1px solid #FEE2E2' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '1.25rem' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>Eliminar usuario</h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#64748B' }}>Esta acción no se puede deshacer</p>
              </div>
            </div>
            <div style={{ background: '#FEF2F2', borderRadius: '0.75rem', padding: '0.875rem 1rem', marginBottom: '1.25rem', border: '1px solid #FECACA' }}>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#7F1D1D', fontWeight: 600 }}>¿Seguro que quieres eliminar permanentemente a <strong>{u.name || u.email}</strong>?</p>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#991B1B' }}>⚠️ Se eliminarán su perfil y todas sus reservas. El acceso a la app quedará revocado.</p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setShowConfirmDelete(false)} disabled={deleting} style={{ flex: 1, padding: '0.75rem', border: '1.5px solid #E2E8F0', borderRadius: '0.75rem', background: 'white', color: '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '0.75rem', border: 'none', borderRadius: '0.75rem', background: deleting ? '#FCA5A5' : '#DC2626', color: 'white', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9rem', cursor: deleting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                {deleting ? (
                  <><svg style={{ animation: 'spin 0.8s linear infinite' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>Eliminando...</>
                ) : '🗑 Eliminar para siempre'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showEdit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}>
          <div style={{ background: 'white', borderRadius: '1.25rem', padding: '1.5rem', maxWidth: '440px', width: '100%', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', marginTop: '3rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>Editar jugador</h3>
              <button onClick={() => setShowEdit(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '1.3rem', lineHeight: 1 }}>✕</button>
            </div>
            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div>
                <label style={editLabel}>Nombre</label>
                <input value={eName} onChange={e => setEName(e.target.value)} style={editInput} />
              </div>
              <div>
                <label style={editLabel}>Email</label>
                <input type="email" value={eEmail} onChange={e => setEEmail(e.target.value)} style={editInput} />
              </div>
              <div>
                <label style={editLabel}>Teléfono</label>
                <input value={ePhone} onChange={e => setEPhone(e.target.value)} style={editInput} />
              </div>
              <div>
                <label style={editLabel}>Nueva contraseña <span style={{ color: '#94A3B8', fontWeight: 500, textTransform: 'none' }}>(opcional)</span></label>
                <input type="password" value={ePassword} onChange={e => setEPassword(e.target.value)} placeholder="Dejar en blanco para no cambiarla" minLength={6} style={editInput} />
              </div>
              <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                <button type="button" onClick={() => setShowEdit(false)} disabled={savingEdit} style={{ padding: '0.65rem 1.1rem', borderRadius: '0.65rem', border: '1.5px solid #CBD5E1', background: 'white', color: '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" disabled={savingEdit} style={{ padding: '0.65rem 1.3rem', borderRadius: '0.65rem', border: 'none', background: '#16A34A', color: 'white', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.85rem', cursor: savingEdit ? 'not-allowed' : 'pointer', opacity: savingEdit ? 0.7 : 1 }}>
                  {savingEdit ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1rem', backgroundColor: u.banned ? '#FEF2F2' : 'white', borderRadius: '0.875rem', border: `1px solid ${u.banned ? '#FECACA' : '#E2E8F0'}`, opacity: u.banned ? 0.85 : 1, transition: 'all 0.2s' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: u.banned ? '#94A3B8' : '#0F172A', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name || '—'}</span>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '999px', backgroundColor: u.role === 'admin' ? '#FEF9C3' : '#F0FDF4', color: u.role === 'admin' ? '#92400E' : '#15803D', textTransform: 'uppercase' }}>{u.role || 'cliente'}</span>
            {u.banned && <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '999px', backgroundColor: '#FEF2F2', color: '#DC2626', textTransform: 'uppercase' }}>Baja</span>}
          </div>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.775rem', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email || '—'}{u.phone ? ` · ${u.phone}` : ''}</p>
        </div>
        {u.role !== 'admin' && (
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            <button onClick={openEdit} title="Editar datos y contraseña" style={{ padding: '0.4rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', color: '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', transition: 'all 0.2s' }}>
              ✎ Editar
            </button>
            <button disabled={togglingId === u.id} onClick={() => toggleBan(u)} style={{ padding: '0.4rem 0.875rem', borderRadius: '0.5rem', border: `1.5px solid ${u.banned ? '#16A34A' : '#DC2626'}`, backgroundColor: u.banned ? '#F0FDF4' : '#FEF2F2', color: u.banned ? '#16A34A' : '#DC2626', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.75rem', cursor: togglingId === u.id ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: togglingId === u.id ? 0.6 : 1 }}>
              {togglingId === u.id ? '...' : u.banned ? 'Reactivar' : 'Dar de baja'}
            </button>
            <button
              onClick={() => setShowConfirmDelete(true)}
              title="Eliminar usuario permanentemente"
              style={{ padding: '0.4rem 0.55rem', borderRadius: '0.5rem', border: '1.5px solid #E2E8F0', backgroundColor: 'white', color: '#94A3B8', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#DC2626'; e.currentTarget.style.backgroundColor = '#FEF2F2'; e.currentTarget.style.color = '#DC2626'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.color = '#94A3B8'; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
              </svg>
            </button>
          </div>
        )}
      </div>
    </>
  );
};

const UserDirectoryTab = ({ supabase, allUsers, setAllUsers }) => {
  const [search, setSearch] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  useEffect(() => {
    async function load() {
      setLoadingUsers(true);
      const { data } = await supabase.from('profiles').select('id, name, email, phone, role, banned').order('name');
      setAllUsers(data || []);
      setLoadingUsers(false);
    }
    if (allUsers.length === 0) load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleBan = async (u) => {
    setTogglingId(u.id);
    const newBanned = !u.banned;
    const { error } = await supabase.from('profiles').update({ banned: newBanned }).eq('id', u.id);
    if (error) {
      console.error('Error al actualizar estado del jugador:', error);
      toast('Error: ' + (error.message || 'No se pudo actualizar. Asegúrate de haber ejecutado la migración SQL en Supabase.'));
    } else {
      setAllUsers(prev => prev.map(p => p.id === u.id ? { ...p, banned: newBanned } : p));
    }
    setTogglingId(null);
  };

  const filtered = allUsers.filter(u =>
    (u.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.phone || '').includes(search)
  );

  return (
    <div>
      <div style={{ marginBottom: '1rem', position: 'relative' }}>
        <input
          type="text"
          placeholder="Buscar por nombre, email o teléfono..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: '0.75rem', border: '1.5px solid #E2E8F0', fontSize: '0.9rem', boxSizing: 'border-box' }}
        />
        <svg style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </div>

      {loadingUsers ? (
        <p style={{ color: '#94A3B8', textAlign: 'center', padding: '2rem' }}>Cargando jugadores...</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: '#94A3B8', textAlign: 'center', padding: '2rem' }}>No se encontraron jugadores.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(u => (
            <UserRow
              key={u.id}
              u={u}
              togglingId={togglingId}
              toggleBan={toggleBan}
              onDeleted={(id) => setAllUsers(prev => prev.filter(p => p.id !== id))}
              onUpdated={(id, patch) => setAllUsers(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))}
              supabase={supabase}
            />
          ))}
          <p style={{ color: '#94A3B8', fontSize: '0.78rem', textAlign: 'right', marginTop: '0.25rem' }}>{filtered.length} jugadores · {filtered.filter(u => u.banned).length} dados de baja</p>
        </div>
      )}
    </div>
  );
};

const AdminDashboard = () => {

  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('adminActiveTab') || 'schedule');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const DEFAULT_CLUB_HOURS = { 0:'00:00', 1:'00:00', 2:'00:00', 3:'00:00', 4:'00:00', 5:'00:00', 6:'00:00' };
  const [siteSettings, setSiteSettings] = useState({ booking_window_days: 7, court_price: 18.00, slots_release_time: '00:00', club_open_time: '00:00', club_hours: DEFAULT_CLUB_HOURS, cancellation_enabled: true, cancellation_hours: 24, schedule_config: DEFAULT_SCHEDULE_CONFIG });
  // Parrilla editable por el admin; loadSlots (useCallback sin deps) la lee de
  // este ref para usar siempre la última versión guardada.
  const scheduleCfgRef = useRef(DEFAULT_SCHEDULE_CONFIG);
  const [schedDraft, setSchedDraft] = useState(null); // null = editor de horario cerrado
  const [savingSched, setSavingSched] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState(null); // { type: 'ok'|'error', text: string }
  const [selectedDate, setSelectedDate] = useState(serverToday());
  const [courts, setCourts] = useState([]);
  const [slots, setSlots] = useState({});
  const [activeSlot, setActiveSlot] = useState(null);
  const [loading, setLoading] = useState(true);
  const courtsRef = useRef([]);
  const [allUsers, setAllUsers] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [bookObs, setBookObs] = useState(''); // nombre/observaciones para reserva manual (no registrados)
  const [allDbBookings, setAllDbBookings] = useState([]);
  const [loadingAllBookings, setLoadingAllBookings] = useState(false);
  const [bookingsDate, setBookingsDate] = useState(serverToday());

  // Cambio de día a MEDIANOCHE: si el admin estaba mirando "hoy" y la fecha
  // cambia (deja la web abierta o entra a las 00:0x), saltar al día nuevo solo.
  useEffect(() => {
    let prevToday = serverToday();
    const id = setInterval(() => {
      const t = serverToday();
      if (t !== prevToday) {
        const old = prevToday;
        prevToday = t;
        setSelectedDate(d => (d === old ? t : d));
        setBookingsDate(d => (d === old ? t : d));
      }
    }, 30 * 1000);
    return () => clearInterval(id);
  }, []);
  // Huecos personalizados (fuera de la parrilla fija) del día seleccionado
  const [customByCourt, setCustomByCourt] = useState({}); // courtId -> [{id, time}]
  const [customModal, setCustomModal] = useState(null); // { courtId, courtName } | null
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [customDate, setCustomDate] = useState('');
  // Entreno con duración a medida (Desde/Hasta editables al marcarlo)
  const [entrenoModal, setEntrenoModal] = useState(null); // { courtId, courtName, grupo, grupoLabel } | null
  const [entrenoStart, setEntrenoStart] = useState('');
  const [entrenoEnd, setEntrenoEnd] = useState('');
  // "Editar hora" de un hueco LIBRE, solo para el día seleccionado
  const [editHourModal, setEditHourModal] = useState(null); // { courtId, courtName, originalTime, customId, hides } | null
  const [editHourStart, setEditHourStart] = useState('');
  const [editHourEnd, setEditHourEnd] = useState('');
  const [moveBooking, setMoveBooking] = useState(null); // { id, courtId, courtName, date, time, client }
  const [moveTargetDate, setMoveTargetDate] = useState('');
  const [moveTargetCourtId, setMoveTargetCourtId] = useState('');
  const [moveTargetTime, setMoveTargetTime] = useState('');
  const [moveSlotInfo, setMoveSlotInfo] = useState(null); // null | 'checking' | 'available' | 'conflict'
  const [showStats, setShowStats] = useState(true);
  const [courtPriceEdits, setCourtPriceEdits] = useState({});
  const [savingCourtPrice, setSavingCourtPrice] = useState(null);
  const [courtPriceMsg, setCourtPriceMsg] = useState({});
  // paymentRules[courtId][day][timeSlot] = string[] de métodos permitidos.
  // day: -1 = todos los días, 0..6 = dom..sáb (Date.getDay()).
  // Sin entrada para (court, day, slot) → cae a (court, -1, slot) → si tampoco hay, todos los métodos.
  const [paymentRules, setPaymentRules] = useState({});
  const [expandedPaymentCourt, setExpandedPaymentCourt] = useState(null);
  const [paymentDayFilter, setPaymentDayFilter] = useState(-1); // selector de día activo en la UI
  const [savingPaymentCell, setSavingPaymentCell] = useState(null); // `${courtId}-${day}-${slot}-${method}`

  const ALL_METHODS = ['redsys', 'bizum', 'club'];
  const METHOD_LABELS = { redsys: 'Tarjeta', bizum: 'Bizum', club: 'Club' };
  const DAY_OPTIONS = [
    { key: -1, label: 'Todos los días', short: 'Todos' },
    { key: 1, label: 'Lunes', short: 'Lun' },
    { key: 2, label: 'Martes', short: 'Mar' },
    { key: 3, label: 'Miércoles', short: 'Mié' },
    { key: 4, label: 'Jueves', short: 'Jue' },
    { key: 5, label: 'Viernes', short: 'Vie' },
    { key: 6, label: 'Sábado', short: 'Sáb' },
    { key: 0, label: 'Domingo', short: 'Dom' },
  ];

  // Devuelve los métodos permitidos para (court, slot) en un día concreto.
  // Prioridad: regla del día específico → regla de "todos los días" → ALL_METHODS.
  const getAllowedMethods = (courtId, slot, day = paymentDayFilter) => {
    const courtRules = paymentRules[courtId];
    if (!courtRules) return ALL_METHODS;
    if (courtRules[day]?.[slot] !== undefined) return courtRules[day][slot];
    if (day !== -1 && courtRules[-1]?.[slot] !== undefined) return courtRules[-1][slot];
    return ALL_METHODS;
  };

  const togglePaymentMethod = async (courtId, slot, method) => {
    const day = paymentDayFilter;
    const current = getAllowedMethods(courtId, slot, day);
    const next = current.includes(method)
      ? current.filter(m => m !== method)
      : [...current, method];

    const cellKey = `${courtId}-${day}-${slot}-${method}`;
    setSavingPaymentCell(cellKey);

    // Optimistic update
    setPaymentRules(prev => ({
      ...prev,
      [courtId]: {
        ...(prev[courtId] || {}),
        [day]: { ...(prev[courtId]?.[day] || {}), [slot]: next },
      },
    }));

    const { error } = await supabase
      .from('court_payment_rules')
      .upsert(
        { court_id: courtId, time_slot: slot, day_of_week: day, methods: next, updated_at: new Date().toISOString() },
        { onConflict: 'court_id,time_slot,day_of_week' }
      );

    setSavingPaymentCell(null);
    if (error) {
      console.error('Error guardando regla de pago:', error);
      toast('Error al guardar: ' + error.message);
      // Revert
      setPaymentRules(prev => ({
        ...prev,
        [courtId]: {
          ...(prev[courtId] || {}),
          [day]: { ...(prev[courtId]?.[day] || {}), [slot]: current },
        },
      }));
    }
  };

  // Marcar el entreno con su duración REAL (puede diferir del hueco de la
  // parrilla; ej.: hueco 19:00-20:30 pero el entreno dura 20:00-21:00).
  const confirmarEntreno = async () => {
    if (!entrenoStart || !entrenoEnd || entrenoEnd <= entrenoStart) { toast('Pon una hora de inicio y una de fin válidas', 'error'); return; }
    const time_slot = `${entrenoStart} - ${entrenoEnd}`;
    const { error } = await supabase.from('blocked_slots').insert({
      court_id: entrenoModal.courtId,
      date: selectedDate,
      time_slot,
      created_by: user.id,
      tipo: 'entreno',
      entreno_grupo: null, // el nº de personas lo confirma el monitor
    });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    toast(`🏋️ Entreno de ${time_slot} marcado ✓ (las personas las confirma el monitor)`, 'success');
    setEntrenoModal(null);
    setActiveSlot(null);
    await loadSlots(selectedDate);
  };

  // ── "EDITAR HORA": cambiar un hueco LIBRE a otra hora SOLO ese día ──
  // Se materializa como hueco personalizado que lleva en hides el hueco base
  // al que sustituye; "Quitar hueco" sobre el nuevo restaura el original.
  // custom_slots no tiene política de UPDATE, así que re-editar un
  // personalizado = insertar el nuevo y borrar el viejo.
  const confirmarEditarHora = async () => {
    if (!editHourStart || !editHourEnd || editHourEnd <= editHourStart) { toast('Pon una hora de inicio y una de fin válidas', 'error'); return; }
    const time_slot = `${editHourStart} - ${editHourEnd}`;
    if (time_slot === editHourModal.originalTime) { setEditHourModal(null); return; }
    const finDt = new Date(`${selectedDate}T${editHourEnd}:00`);
    if (finDt <= serverNow()) { toast('Esa hora ya ha pasado para este día', 'error'); return; }
    // La hora nueva no puede pisar nada ocupado ese día en esa pista
    const [ini, fin] = parseSlot(time_slot);
    const pisaOcupado = Object.entries(slots[editHourModal.courtId] || {}).some(([t, v]) => {
      if (v.status === 'available') return false;
      const [a, b] = parseSlot(t);
      return ini < b && a < fin;
    });
    if (pisaOcupado) { toast('Esa hora pisa una reserva, bloqueo o entreno de ese día', 'error'); return; }
    const { error } = await supabase.from('custom_slots').insert({
      court_id: editHourModal.courtId,
      date: selectedDate,
      time_slot,
      created_by: user.id,
      // hueco base editado → hides = ese hueco; personalizado re-editado →
      // arrastra el hides que ya tuviera (o ninguno)
      hides: editHourModal.customId ? (editHourModal.hides || null) : editHourModal.originalTime,
    });
    if (error) {
      if (error.code === '23505') toast('Ya existe un hueco con esa hora ese día', 'error');
      else if (/hides/i.test(error.message || '')) toast('Falta aplicar la migración custom_slots_hides en Supabase', 'error');
      else toast('Error: ' + error.message, 'error');
      return;
    }
    if (editHourModal.customId) await supabase.from('custom_slots').delete().eq('id', editHourModal.customId);
    toast(`🕐 ${editHourModal.originalTime} → ${time_slot} (solo el ${selectedDate.split('-').reverse().join('/')})`, 'success');
    setEditHourModal(null);
    setActiveSlot(null);
    await loadSlots(selectedDate);
  };

  // ── Huecos personalizados: crear y quitar ──
  const crearCustomSlot = async () => {
    if (!customDate) { toast('Elige el día del hueco', 'error'); return; }
    if (!customStart || !customEnd || customEnd <= customStart) { toast('Pon una hora de inicio y una de fin válidas', 'error'); return; }
    // Evitar huecos nacidos "en el pasado" (ej.: crear un 00:00-01:00 por la
    // noche con la fecha de HOY — esa medianoche pertenece al día SIGUIENTE).
    const finDt = new Date(`${customDate}T${customEnd}:00`);
    if (finDt <= serverNow()) {
      toast('Ese horario ya ha pasado para ese día. Si es para esta noche, pon la fecha de MAÑANA.', 'error');
      return;
    }
    const time_slot = `${customStart} - ${customEnd}`;
    const { error } = await supabase.from('custom_slots').insert({
      court_id: customModal.courtId, date: customDate, time_slot, created_by: user.id,
    });
    if (error) { toast(error.code === '23505' ? 'Ese hueco ya existe ese día' : 'Error: ' + error.message, 'error'); return; }
    toast(`Hueco ${time_slot} añadido a ${customModal.courtName} el ${customDate.split('-').reverse().join('/')} ✓`, 'success');
    setCustomModal(null);
    // Saltar al día del hueco para verlo recién creado
    if (customDate !== selectedDate) setSelectedDate(customDate);
    await loadSlots(customDate);
  };

  const eliminarCustomSlot = async () => {
    const cs = (customByCourt[activeSlot?.courtId] || []).find(c => c.time === activeSlot?.time);
    if (!cs) return;
    const msg = cs.hides
      ? `¿Quitar el hueco ${activeSlot.time}? Volverá a ofrecerse el hueco original de ${cs.hides}.`
      : `¿Quitar el hueco personalizado ${activeSlot.time}? Dejará de ofrecerse a los jugadores.`;
    const ok = await confirmDialog(msg, { title: 'Quitar hueco', okText: 'Quitar', danger: true });
    if (!ok) return;
    const { error } = await supabase.from('custom_slots').delete().eq('id', cs.id);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    setActiveSlot(null);
    await loadSlots(selectedDate);
  };

  // ── Horario de la parrilla: el admin cambia las horas cuando quiere ──
  // Misma validación para la vista previa y para Guardar: lo que el admin ve
  // en verde es exactamente lo que se puede guardar.
  const validarBorradorHorario = (draft) => {
    const mins = parseInt(draft.slot_minutes, 10);
    if (!Number.isFinite(mins) || mins < 30 || mins > 240) return { error: 'La duración de cada sesión debe estar entre 30 y 240 minutos' };
    if (draft.periods.length === 0) return { error: 'Añade al menos un tramo' };
    if (draft.periods.some(p => !p.start || !p.end)) return { error: 'Completa las horas de todos los tramos' };
    if (draft.periods.some(p => p.end <= p.start)) return { error: 'En cada tramo, la hora de fin debe ser mayor que la de inicio' };
    const sorted = [...draft.periods].sort((a, b) => toMin(a.start) - toMin(b.start));
    for (let i = 1; i < sorted.length; i++) {
      if (toMin(sorted[i].start) < toMin(sorted[i - 1].end)) {
        return { error: `Los tramos se solapan: el de las ${sorted[i].start} empieza antes de que acabe el de las ${sorted[i - 1].start}` };
      }
    }
    const clean = { slot_minutes: mins, periods: sorted.map(p => ({ start: p.start, end: p.end })) };
    if (buildScheduleTimes(clean).length === 0) return { error: `Con esas horas no cabe ninguna sesión de ${mins} min — revisa los tramos` };
    return { clean };
  };

  const guardarHorario = async () => {
    if (!schedDraft) return;
    const { error: draftError, clean } = validarBorradorHorario(schedDraft);
    if (draftError) { toast(draftError, 'error'); return; }
    // Reglas de métodos de pago ligadas a franjas que desaparecen: avisar y
    // limpiarlas — si quedaran huérfanas, esas horas volverían en silencio a
    // aceptar todos los métodos sin que el admin pudiera verlo en su tabla.
    const nuevos = new Set(buildScheduleTimes(clean));
    const { data: reglas } = await supabase.from('court_payment_rules').select('time_slot');
    const huerfanas = [...new Set((reglas || []).map(r => r.time_slot).filter(t => !nuevos.has(t)))];
    if (huerfanas.length > 0) {
      const ok = await confirmDialog(
        `Tienes restricciones de métodos de pago en franjas que dejan de existir (${huerfanas.join(', ')}). Se eliminarán y esas horas volverán a aceptar todos los métodos hasta que las configures de nuevo. ¿Guardar igualmente?`,
        { title: 'Cambiar horario', okText: 'Guardar y limpiar', danger: true }
      );
      if (!ok) return;
    }
    setSavingSched(true);
    const { error } = await supabase.from('site_settings').update({ schedule_config: clean }).eq('id', 1);
    if (!error && huerfanas.length > 0) {
      const { error: delError } = await supabase.from('court_payment_rules').delete().in('time_slot', huerfanas);
      if (delError) toast('El horario se guardó, pero no se pudieron limpiar las reglas de pago antiguas: ' + delError.message, 'error');
      else setPaymentRules(prev => {
        const next = {};
        Object.entries(prev).forEach(([courtId, days]) => {
          next[courtId] = {};
          Object.entries(days).forEach(([day, slotRules]) => {
            next[courtId][day] = Object.fromEntries(Object.entries(slotRules).filter(([slot]) => nuevos.has(slot)));
          });
        });
        return next;
      });
    }
    setSavingSched(false);
    if (error) { toast('Error al guardar el horario: ' + error.message, 'error'); return; }
    scheduleCfgRef.current = normalizeScheduleConfig(clean);
    setSiteSettings(s => ({ ...s, schedule_config: clean }));
    setSchedDraft(null);
    setActiveSlot(null);
    await loadSlots(selectedDate);
    toast('✓ Horario actualizado. La nueva parrilla ya se ofrece a los jugadores.', 'success');
  };

  const loadSlots = useCallback(async (date) => {
    const [resBookings, resBlocked, resCustoms] = await Promise.all([
      supabase.from('bookings').select('*').eq('date', date).in('status', ['confirmed', 'pendiente_pago']),
      supabase.from('blocked_slots').select('*').eq('date', date),
      supabase.from('custom_slots').select('*').eq('date', date),
    ]);

    if (resBookings.error) {
      console.error('Error cargando reservas:', resBookings.error);
      toast('Error cargando reservas de BD: ' + resBookings.error.message);
    }

    // Holds 'pendiente_pago': bloquean el hueco 15 min (jugador pagando en el banco)
    const HOLD_MS = 15 * 60 * 1000;
    let bookings = (resBookings.data || []).filter(b =>
      b.status === 'confirmed' || (Date.now() - new Date(b.created_at).getTime()) < HOLD_MS
    );
    const blocked = resBlocked.data || [];

    if (bookings.length > 0) {
      const userIds = [...new Set(bookings.map(b => b.user_id))];
      const { data: profiles, error: pError } = await supabase.from('profiles').select('id, name, email').in('id', userIds);
      if (pError) console.error('Error cargando perfiles:', pError);
      if (profiles) {
        const profileMap = {};
        profiles.forEach(p => profileMap[p.id] = p.name || p.email?.split('@')[0] || 'Cliente');
        bookings = bookings.map(b => ({ ...b, profiles: { name: profileMap[b.user_id] } }));
      }
    }

    const newSlots = {};
    courtsRef.current.forEach(court => {
      newSlots[court.id] = {};
    });
    // Huecos personalizados del día (entran a la parrilla como ANCLAS;
    // hides = hueco base al que sustituyen ese día vía "Editar hora")
    const cMap = {};
    (resCustoms.data || []).forEach(cs => {
      (cMap[cs.court_id] = cMap[cs.court_id] || []).push({ id: cs.id, time: cs.time_slot, hides: cs.hides || null });
    });
    setCustomByCourt(cMap);
    bookings?.forEach(b => {
      if (newSlots[b.court_id]) {
        newSlots[b.court_id][b.time_slot] = {
          status: 'booked',
          client: b.status === 'pendiente_pago'
            ? `⏳ ${b.profiles?.name || 'Pago en curso'}`
            : (b.observaciones || b.profiles?.name || 'Cliente'),
          bookingId: b.id, metodo: b.metodo_pago, isFree: b.is_free, paymentType: b.payment_type,
          pagosJugadores: Array.isArray(b.pagos_jugadores) ? b.pagos_jugadores : [],
          cobroConfirmado: !!b.cobro_confirmado,
        };
      }
    });
    blocked?.forEach(b => {
      if (newSlots[b.court_id]) {
        newSlots[b.court_id][b.time_slot] = { status: 'blocked', blockedId: b.id, tipo: b.tipo || 'bloqueado' };
      }
    });

    // ── Disponibles (idéntico a la vista del jugador) ──
    // SIN auto-ajuste: las horas no cambian solas. Un hueco base pisado por
    // un entreno/reserva queda ocupado a su hora real y no se recoloca; los
    // huecos personalizados del admin se ofrecen tal cual y tapan al hueco
    // base que se solape. La parrilla base la define el admin aquí arriba.
    courtsRef.current.forEach(court => {
      const entries = newSlots[court.id] || {};
      const ocupadas = Object.entries(entries).filter(([, v]) => v.status !== 'available');
      const occupiedIvs = ocupadas.map(([t]) => parseSlot(t));
      const customTimes = (cMap[court.id] || []).map(c => c.time);
      const hiddenTimes = (cMap[court.id] || []).map(c => c.hides).filter(Boolean);
      const rebuilt = {};
      ocupadas.forEach(([t, v]) => { rebuilt[t] = v; });
      rebuildAvailableTimes(scheduleCfgRef.current, occupiedIvs, customTimes, hiddenTimes).forEach(t => {
        if (!rebuilt[t]) rebuilt[t] = { status: 'available' };
      });
      newSlots[court.id] = rebuilt;
    });

    setSlots(newSlots);
  }, []);

  // Carga inicial: siempre llama a setLoading(false) pase lo que pase
  useEffect(() => {
    async function init() {
      try {
        // Cargar ajustes globales
        const { data: settingsData } = await supabase.from('site_settings').select('*').single();
        if (settingsData) {
          const schedCfg = normalizeScheduleConfig(settingsData.schedule_config);
          scheduleCfgRef.current = schedCfg;
          setSiteSettings({
            booking_window_days: settingsData.booking_window_days,
            court_price: parseFloat(settingsData.court_price),
            slots_release_time: settingsData.slots_release_time || '00:00',
            club_open_time: settingsData.club_open_time || '00:00',
            club_hours: settingsData.club_hours || DEFAULT_CLUB_HOURS,
            cancellation_enabled: settingsData.cancellation_enabled ?? true,
            cancellation_hours: settingsData.cancellation_hours ?? 24,
            schedule_config: schedCfg,
          });
        }

        const { data } = await supabase.from('courts').select('*').order('name');
        const loaded = data || [];
        courtsRef.current = loaded;
        setCourts(loaded);

        // Cargar reglas de métodos de pago por pista + franja + día
        const { data: rulesData } = await supabase
          .from('court_payment_rules')
          .select('court_id, time_slot, day_of_week, methods');
        if (rulesData) {
          const rulesMap = {};
          rulesData.forEach(r => {
            const day = r.day_of_week ?? -1;
            if (!rulesMap[r.court_id]) rulesMap[r.court_id] = {};
            if (!rulesMap[r.court_id][day]) rulesMap[r.court_id][day] = {};
            rulesMap[r.court_id][day][r.time_slot] = r.methods || [];
          });
          setPaymentRules(rulesMap);
        }

        if (loaded.length > 0) await loadSlots(selectedDate);
      } finally {
        setLoading(false);
      }
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Comprueba disponibilidad del slot destino al mover una reserva
  useEffect(() => {
    if (!moveTargetDate || !moveTargetCourtId || !moveTargetTime) {
      setMoveSlotInfo(null);
      return;
    }
    setMoveSlotInfo('checking');
    const check = async () => {
      const [{ data: existing }, { data: blocked }] = await Promise.all([
        supabase.from('bookings').select('id').eq('court_id', moveTargetCourtId).eq('date', moveTargetDate).eq('time_slot', moveTargetTime).eq('status', 'confirmed').neq('id', moveBooking?.id || ''),
        supabase.from('blocked_slots').select('id').eq('court_id', moveTargetCourtId).eq('date', moveTargetDate).eq('time_slot', moveTargetTime),
      ]);
      setMoveSlotInfo((existing?.length > 0 || blocked?.length > 0) ? 'conflict' : 'available');
    };
    check();
  }, [moveTargetDate, moveTargetCourtId, moveTargetTime, moveBooking]);

  // Recarga slots cuando cambia la fecha
  useEffect(() => {
    if (courtsRef.current.length > 0) loadSlots(selectedDate);
  }, [selectedDate, loadSlots]);

  // Carga TODAS las reservas cuando se activa la pestaña Reservas
  useEffect(() => {
    if (activeTab !== 'bookings') return;
    setLoadingAllBookings(true);
    (async () => {
      const { data: bookings, error } = await supabase
        .from('bookings')
        .select('id, date, time_slot, status, is_free, court_id, user_id, courts(name, sport, gradient)')
        .eq('date', bookingsDate)
        .order('time_slot', { ascending: true });
      if (error) { console.error('Error cargando reservas:', error); setLoadingAllBookings(false); return; }
      const rows = bookings || [];
      if (rows.length > 0) {
        const userIds = [...new Set(rows.map(b => b.user_id))];
        const { data: profiles } = await supabase.from('profiles').select('id, name, email').in('id', userIds);
        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });
        setAllDbBookings(rows.map(b => ({ ...b, profiles: profileMap[b.user_id] || null })));
      } else {
        setAllDbBookings([]);
      }
      setLoadingAllBookings(false);
    })();
  }, [activeTab, bookingsDate]);

  const [isProcessing, setIsProcessing] = useState(false);

  const handleAction = async (action, opts = {}) => {
    if (isProcessing) return;
    setIsProcessing(true);
    const { courtId, time } = activeSlot;
    const slot = slots[courtId]?.[time];
    let actionError = null;

    if (action === 'reserve') {
      const obs = (bookObs || '').trim();
      const bookUserId = selectedUserId || user.id;
      const bookedUserName = obs || allUsers.find(u => u.id === bookUserId)?.name || user.name || 'Cliente';
      const courtName = courts.find(c => c.id === courtId)?.name || 'Pista';
      const { error } = await supabase.from('bookings').insert({ court_id: courtId, user_id: bookUserId, date: selectedDate, time_slot: time, status: 'confirmed', is_free: true, observaciones: obs || null, metodo_pago: 'manual' });
      actionError = error;
      if (!error) {
        supabase.functions.invoke('send-push', {
          body: {
            title: 'Nueva reserva',
            body: `${bookedUserName} — ${courtName} · ${time} · ${formatDate(selectedDate)}`,
            url: '/admin',
          },
        }).catch(() => {});
        // Si el admin asignó la reserva a un usuario REGISTRADO, avisarle por email.
        const bookedUser = selectedUserId ? allUsers.find(u => u.id === selectedUserId) : null;
        if (bookedUser?.email) {
          supabase.functions.invoke('send-booking-email', {
            body: {
              type: 'confirmation',
              email: bookedUser.email,
              userName: bookedUser.name || 'jugador/a',
              courtName,
              date: selectedDate,
              timeSlot: time,
            },
          }).catch(() => {});
        }
        // Y SIEMPRE (registrado o no), correo al admin con los datos de la reserva.
        supabase.functions.invoke('send-booking-email', {
          body: {
            type: 'admin',
            email: bookedUser?.email || '',
            userName: bookedUserName,
            userPhone: bookedUser?.phone || '',
            courtName,
            date: selectedDate,
            timeSlot: time,
            metodoPago: '✍️ Reserva manual (admin)',
          },
        }).catch(() => {});
      }
      setSelectedUserId(null);
      setShowUserPicker(false);
      setBookObs('');
    } else if (action === 'block') {
      const tipo = opts.tipo === 'entreno' ? 'entreno' : 'bloqueado';
      const { error } = await supabase.from('blocked_slots').insert({ court_id: courtId, date: selectedDate, time_slot: time, created_by: user.id, tipo, entreno_grupo: tipo === 'entreno' ? (opts.grupo || 'grupo4') : null });
      actionError = error;
    } else if (action === 'cancel') {
      const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', slot.bookingId);
      actionError = error;
    } else if (action === 'unblock') {
      const { error } = await supabase.from('blocked_slots').delete().eq('id', slot.blockedId);
      actionError = error;
    }

    if (actionError) {
      console.error('Action error:', actionError);
      toast('Error en base de datos: ' + actionError.message + (actionError.details ? ' - ' + actionError.details : ''));
    }

    setActiveSlot(null);
    await loadSlots(selectedDate);
    setIsProcessing(false);
  };

  const cancelBooking = async (bookingId) => {
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId);
    await loadSlots(selectedDate);
  };

  const handleMoveBooking = async () => {
    if (!moveBooking || !moveTargetDate || !moveTargetCourtId || !moveTargetTime) return;
    setIsProcessing(true);
    const { error } = await supabase.from('bookings').update({
      date: moveTargetDate,
      time_slot: moveTargetTime,
      court_id: moveTargetCourtId,
    }).eq('id', moveBooking.id);
    if (error) {
      toast('Error al mover la reserva: ' + error.message);
    } else {
      setMoveBooking(null);
      await loadSlots(selectedDate);
      if (activeTab === 'bookings') {
        const today = serverToday();
        // profiles NO se puede incrustar desde bookings (no hay FK): se cargan aparte.
        const { data } = await supabase.from('bookings')
          .select('id, date, time_slot, status, is_free, court_id, user_id, courts(name, sport, gradient)')
          .eq('status', 'confirmed').gte('date', today).order('date').order('time_slot');
        const rows = data || [];
        const uids = [...new Set(rows.map(b => b.user_id).filter(Boolean))];
        let pmap = {};
        if (uids.length) {
          const { data: profs } = await supabase.from('profiles').select('id, name, email').in('id', uids);
          (profs || []).forEach(p => { pmap[p.id] = p; });
        }
        setAllDbBookings(rows.map(b => ({ ...b, profiles: pmap[b.user_id] || null })));
      }
    }
    setIsProcessing(false);
  };

  const toggleCourt = async (courtId) => {
    const court = courts.find(c => c.id === courtId);
    await supabase.from('courts').update({ active: !court.active }).eq('id', courtId);
    const updated = courts.map(c => c.id === courtId ? { ...c, active: !c.active } : c);
    courtsRef.current = updated;
    setCourts(updated);
  };

  const saveCourtPrice = async (courtId) => {
    const raw = courtPriceEdits[courtId];
    if (raw === undefined) return;
    const price = parseFloat(raw);
    if (isNaN(price) || price < 0) return;
    setSavingCourtPrice(courtId);
    const { error } = await supabase.from('courts').update({ price }).eq('id', courtId);
    setSavingCourtPrice(null);
    if (error) {
      setCourtPriceMsg(prev => ({ ...prev, [courtId]: { type: 'error', text: error.message } }));
    } else {
      const updated = courts.map(c => c.id === courtId ? { ...c, price } : c);
      courtsRef.current = updated;
      setCourts(updated);
      setCourtPriceMsg(prev => ({ ...prev, [courtId]: { type: 'ok' } }));
      setTimeout(() => setCourtPriceMsg(prev => { const n = { ...prev }; delete n[courtId]; return n; }), 2000);
    }
  };

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
    setActiveSlot(null);
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setSettingsMsg(null);
    // Validar ANTES de guardar: un campo vacío guardaría null y rompería en silencio.
    const windowDays = parseInt(siteSettings.booking_window_days, 10);
    const price = parseFloat(siteSettings.court_price);
    if (!Number.isFinite(windowDays) || windowDays < 1) {
      setSavingSettings(false);
      setSettingsMsg({ type: 'error', text: 'Los días de antelación deben ser un número (mínimo 1).' });
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setSavingSettings(false);
      setSettingsMsg({ type: 'error', text: 'El precio de la pista debe ser un número (0 o más).' });
      return;
    }
    const { error } = await supabase.from('site_settings').update({
      booking_window_days: windowDays,
      court_price: price,
      slots_release_time: siteSettings.slots_release_time || '00:00',
      club_open_time: siteSettings.club_open_time || '00:00',
      club_hours: siteSettings.club_hours,
      cancellation_enabled: !!siteSettings.cancellation_enabled,
      cancellation_hours: Math.max(0, parseInt(siteSettings.cancellation_hours, 10) || 0),
    }).eq('id', 1);
    setSavingSettings(false);
    if (error) {
      console.error(error);
      setSettingsMsg({ type: 'error', text: 'Error al guardar: ' + error.message });
    } else {
      setSettingsMsg({ type: 'ok', text: '✓ Ajustes guardados. Los cambios ya son visibles para los clientes.' });
      setTimeout(() => setSettingsMsg(null), 4000);
    }
  };

  const allBookings = [];
  courts.forEach(court => {
    Object.keys(slots[court.id] || {}).forEach(time => {
      const slot = slots[court.id]?.[time];
      if (slot?.status === 'booked') {
        allBookings.push({ ...court, time, client: slot.client, bookingId: slot.bookingId });
      }
    });
  });

  const totalBlocked = Object.values(slots).flatMap(c => Object.values(c)).filter(s => s.status === 'blocked').length;
  const activeCourts = courts.filter(c => c.active).length;
  // Parrilla vigente (para la tabla de métodos de pago y el modal de mover)
  const scheduleCfgView = normalizeScheduleConfig(siteSettings.schedule_config);
  const scheduleTimes = buildScheduleTimes(scheduleCfgView);

  const menuItems = [
    { key: 'schedule', label: 'Horario', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { key: 'bookings', label: `Reservas (${allBookings.length})`, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> },
    { key: 'courts', label: 'Pistas', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="10"/><path d="M12 2 Q16 6 16 12 Q16 18 12 22"/><path d="M12 2 Q8 6 8 12 Q8 18 12 22"/><line x1="2" y1="12" x2="22" y2="12"/></svg> },
    { key: 'users', label: 'Jugadores', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { key: 'tournaments', label: 'Torneos', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg> },
    { key: 'events', label: 'Eventos', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> },
    { key: 'tienda', label: 'Tienda', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M9 22V12h6v10"/></svg> },
    { key: 'pedidos', label: 'Pedidos', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg> },
    { key: 'finance', label: 'Finanzas', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
    { key: 'timeclock', label: 'Control horario', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
    { key: 'settings', label: 'Configuración', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/><circle cx="12" cy="12" r="3"/></svg> },
  ];

  return (
    <>
      <style>{`
        .admin-layout { display: flex; min-height: 100vh; background: var(--color-bg-secondary); }
        .admin-sidebar {
          width: min(280px, 85vw); background: white; border-right: 1px solid var(--color-border);
          display: flex; flex-direction: column; position: fixed; top: 0; bottom: 0; left: 0; z-index: 50;
          padding-top: env(safe-area-inset-top);
          padding-bottom: env(safe-area-inset-bottom);
          transform: translateX(-100%); transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          overflow-y: auto;
        }
        .admin-sidebar.open { transform: translateX(0); }
        .sidebar-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 40;
          opacity: 0; pointer-events: none; transition: opacity 0.3s;
        }
        .sidebar-overlay.open { opacity: 1; pointer-events: auto; }

        .admin-main { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 100vh; }
        .admin-header {
          background: white; border-bottom: 1px solid var(--color-border);
          padding: 0.75rem 1rem;
          padding-top: calc(0.75rem + env(safe-area-inset-top));
          padding-left: calc(1rem + env(safe-area-inset-left));
          padding-right: calc(1rem + env(safe-area-inset-right));
          display: flex; align-items: center; justify-content: space-between;
          gap: 0.75rem;
          position: sticky; top: 0; z-index: 10; box-shadow: var(--shadow-sm);
          min-height: calc(56px + env(safe-area-inset-top));
        }
        .admin-header-title {
          flex: 1;
          min-width: 0;
          text-align: center;
          font-weight: 800;
          color: #0F172A;
          font-size: 1rem;
          letter-spacing: -0.02em;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .admin-burger {
          flex-shrink: 0;
          width: 44px; height: 44px;
          display: flex; align-items: center; justify-content: center;
          border: 1.5px solid var(--color-border);
          background: white;
          border-radius: 0.625rem;
          color: #0F172A;
          cursor: pointer;
          padding: 0;
        }
        .admin-burger:hover { border-color: #16A34A; color: #16A34A; }

        /* Filo de marca bajo la cabecera del panel (navy → verde) */
        .admin-header::after {
          content: '';
          position: absolute;
          left: 0; right: 0; bottom: -1px;
          height: 2.5px;
          background: linear-gradient(90deg, #1B3A6E 0%, #16A34A 60%, #4ADE80 100%);
          opacity: 0.85;
        }

        /* Items del menú: hover suave + barra verde en el activo */
        .admin-nav-item { position: relative; }
        .admin-nav-item:hover:not(.active) { background: #F1F5F9 !important; color: #0F172A !important; }
        .admin-nav-item.active::before {
          content: '';
          position: absolute;
          left: -1rem; top: 22%; bottom: 22%;
          width: 3.5px;
          border-radius: 0 4px 4px 0;
          background: linear-gradient(180deg, #16A34A, #4ADE80);
        }
        .admin-logout:hover { border-color: #FECACA !important; color: #DC2626 !important; background: #FEF2F2 !important; }
        .admin-body { flex: 1; padding: 1.5rem 1rem; max-width: 100%; width: 100%; padding-left: calc(1rem + env(safe-area-inset-left)); padding-right: calc(1rem + env(safe-area-inset-right)); }

        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
        .slots-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.4rem; margin-bottom: 0.625rem; }
        .courts-list { display: flex; flex-direction: column; gap: 1.25rem; }

        @media (min-width: 400px) { .slots-grid { grid-template-columns: repeat(4, 1fr); } }
        @media (min-width: 480px) { .slots-grid { grid-template-columns: repeat(7, 1fr); } }
        @media (min-width: 1024px) {
          .admin-sidebar { transform: translateX(0) !important; position: sticky; height: 100vh; top: 0; }
          .sidebar-overlay { display: none; }
          .desktop-hide { display: none !important; }
          .admin-header { padding: 0.875rem 2rem; }
          .admin-body { padding: 2rem; }
          .courts-list { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      
      <div className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} onClick={() => setIsSidebarOpen(false)} />

      {/* Modal: duración del entreno */}
      {entrenoModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '1.1rem', width: '100%', maxWidth: 380, padding: '1.4rem', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.05rem', fontWeight: 800, color: '#7E22CE' }}>🏋️ Entreno — {entrenoModal.courtName}</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: '#64748B' }}>
              Marca el horario real de la clase (ej.: de 20:00 a 21:00). Ese tramo queda ocupado para los jugadores. De cuántas personas es lo confirma el monitor al acabar el día.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
              <label style={{ flex: 1, fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Desde
                <input type="time" value={entrenoStart} onChange={e => setEntrenoStart(e.target.value)} style={{ width: '100%', marginTop: 4, padding: '0.55rem', borderRadius: '0.6rem', border: '1.5px solid #CBD5E1', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </label>
              <label style={{ flex: 1, fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Hasta
                <input type="time" value={entrenoEnd} onChange={e => setEntrenoEnd(e.target.value)} style={{ width: '100%', marginTop: 4, padding: '0.55rem', borderRadius: '0.6rem', border: '1.5px solid #CBD5E1', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.1rem' }}>
              <button onClick={() => setEntrenoModal(null)} style={{ flex: 1, padding: '0.7rem', borderRadius: '0.7rem', border: '1.5px solid #E2E8F0', background: 'white', color: '#475569', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={confirmarEntreno} style={{ flex: 2, padding: '0.7rem', borderRadius: '0.7rem', border: 'none', background: '#9333EA', color: 'white', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Marcar entreno</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: editar la hora de un hueco (solo ese día) */}
      {editHourModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '1.1rem', width: '100%', maxWidth: 380, padding: '1.4rem', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.05rem', fontWeight: 800, color: '#1D4ED8' }}>🕐 Editar hora — {editHourModal.courtName}</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: '#64748B' }}>
              El hueco de <strong>{editHourModal.originalTime}</strong> pasará a ofrecerse a la hora nueva <strong>solo este día</strong>. Para deshacerlo: pulsa el hueco nuevo → Quitar hueco. Para cambiar el horario de todos los días usa "✎ Modificar horas".
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
              <label style={{ flex: 1, fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Desde
                <input type="time" value={editHourStart} onChange={e => setEditHourStart(e.target.value)} style={{ width: '100%', marginTop: 4, padding: '0.55rem', borderRadius: '0.6rem', border: '1.5px solid #CBD5E1', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </label>
              <label style={{ flex: 1, fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Hasta
                <input type="time" value={editHourEnd} onChange={e => setEditHourEnd(e.target.value)} style={{ width: '100%', marginTop: 4, padding: '0.55rem', borderRadius: '0.6rem', border: '1.5px solid #CBD5E1', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.1rem' }}>
              <button onClick={() => setEditHourModal(null)} style={{ flex: 1, padding: '0.7rem', borderRadius: '0.7rem', border: '1.5px solid #E2E8F0', background: 'white', color: '#475569', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={confirmarEditarHora} style={{ flex: 2, padding: '0.7rem', borderRadius: '0.7rem', border: 'none', background: '#2563EB', color: 'white', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Guardar hora</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: nuevo hueco personalizado */}
      {customModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '1.1rem', width: '100%', maxWidth: 380, padding: '1.4rem', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>🕐 Nuevo hueco — {customModal.courtName}</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: '#64748B' }}>
              Ej.: tras una clase de 20:00 a 21:00, ofrece de 21:00 a 22:30. ⚠️ Un hueco de madrugada (00:00) pertenece al día <strong>siguiente</strong>.
            </p>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '0.75rem' }}>Día
              <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)} min={serverToday()}
                style={{ width: '100%', marginTop: 4, padding: '0.55rem', borderRadius: '0.6rem', border: '1.5px solid #CBD5E1', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </label>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
              <label style={{ flex: 1, fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Desde
                <input type="time" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ width: '100%', marginTop: 4, padding: '0.55rem', borderRadius: '0.6rem', border: '1.5px solid #CBD5E1', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </label>
              <label style={{ flex: 1, fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Hasta
                <input type="time" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ width: '100%', marginTop: 4, padding: '0.55rem', borderRadius: '0.6rem', border: '1.5px solid #CBD5E1', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.1rem' }}>
              <button onClick={() => setCustomModal(null)} style={{ flex: 1, padding: '0.7rem', borderRadius: '0.7rem', border: '1.5px solid #E2E8F0', background: 'white', color: '#475569', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={crearCustomSlot} style={{ flex: 2, padding: '0.7rem', borderRadius: '0.7rem', border: 'none', background: '#16A34A', color: 'white', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Crear hueco</button>
            </div>
          </div>
        </div>
      )}

      <div className="admin-layout">
        {/* Sidebar */}
        <aside className={`admin-sidebar ${isSidebarOpen ? 'open' : ''}`}>
          <div style={{
            padding: '1.25rem 1.25rem 1rem',
            borderBottom: '1px solid var(--color-border)',
            background: 'white',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.5rem',
            position: 'relative',
          }}>
            {/* Close button (mobile only) */}
            <button className="desktop-hide" onClick={() => setIsSidebarOpen(false)} style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', background: '#F1F5F9', border: 'none', cursor: 'pointer', padding: '0.4rem', borderRadius: '0.5rem', color: '#64748B', display: 'flex' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>

            {/* Logo a tamaño completo, sin recortar */}
            <img src="/logo.png" alt="Padel Medina" style={{ width: '140px', objectFit: 'contain', display: 'block' }} />

            {/* Badge Panel Admin */}
            <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'white', background: '#1B3A6E', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0.2rem 0.6rem', borderRadius: '999px' }}>Panel Admin</span>
          </div>

          <div style={{ padding: '1.25rem 1rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ margin: '0 0 0.5rem 0.5rem', fontSize: '0.75rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Menú Principal</p>
            
            {menuItems.map(item => {
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  className={`admin-nav-item${isActive ? ' active' : ''}`}
                  onClick={() => { setActiveTab(item.key); localStorage.setItem('adminActiveTab', item.key); setIsSidebarOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%',
                    padding: '0.875rem 1rem', borderRadius: '0.75rem', border: 'none',
                    backgroundColor: isActive ? '#F0FDF4' : 'transparent',
                    color: isActive ? '#16A34A' : '#475569',
                    fontFamily: 'inherit', fontWeight: isActive ? 800 : 600, fontSize: '0.95rem',
                    cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    textAlign: 'left'
                  }}
                >
                  <span style={{ display: 'flex', color: isActive ? '#16A34A' : '#94A3B8' }}>{item.icon}</span>
                  {item.label}
                </button>
              );
            })}
          </div>

          <div style={{ padding: '1.25rem', borderTop: '1px solid var(--color-border)' }}>
            <button onClick={logout} className="admin-logout" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.875rem', border: '1.5px solid #E2E8F0', borderRadius: '0.75rem', background: 'white', color: '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              Cerrar Sesión
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <div className="admin-main">
          {/* Header (hidden on desktop) */}
          <div className="admin-header desktop-hide">
            <button aria-label="Abrir panel" onClick={() => setIsSidebarOpen(true)} className="admin-burger">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <span className="admin-header-title">
              {menuItems.find(m => m.key === activeTab)?.label.split(' (')[0]}
            </span>
            <div style={{ width: '44px', flexShrink: 0 }} />
          </div>

          <div className="admin-body">
          {/* Stats toggle header */}
          <button
            onClick={() => setShowStats(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0.5rem', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'inherit' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.2s', transform: showStats ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
            Dashboard
          </button>
          {/* Stats */}
          {showStats && (
          <div className="stats-grid">
            {[
              { label: 'Reservas hoy', value: allBookings.length, color: '#16A34A', bg: '#F0FDF4', border: '#86EFAC' },
              { label: 'Pistas activas', value: activeCourts, color: '#0EA5E9', bg: '#F0F9FF', border: '#BAE6FD' },
              { label: 'Bloqueados', value: totalBlocked, color: '#94A3B8', bg: '#F8FAFC', border: '#E2E8F0' },
            ].map(s => (
              <div key={s.label} style={{ backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: '0.875rem', padding: '0.875rem 0.625rem', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</p>
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.58rem', fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.75 }}>{s.label}</p>
              </div>
            ))}
          </div>
          )}

          {/* Tabs removed in favor of sidebar */}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem 0' }}>
              <div style={{ width: '32px', height: '32px', border: '3px solid #DCFCE7', borderTopColor: '#16A34A', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
            </div>
          ) : (
            <>
              {/* ── TAB: HORARIO ── */}
              {activeTab === 'schedule' && (
                <div>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <p className="section-label">Selecciona fecha</p>
                    <input type="date" value={selectedDate} onChange={handleDateChange}
                      style={{ padding: '0.75rem 1rem', borderRadius: '0.75rem', border: '1.5px solid #E2E8F0', backgroundColor: 'white', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', width: '100%' }} />
                    <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: '#94A3B8', textTransform: 'capitalize' }}>{formatDate(selectedDate)}</p>
                  </div>

                  {/* ── Horario de la parrilla: editable por el admin cuando quiera ── */}
                  <div style={{ backgroundColor: 'white', borderRadius: '1rem', border: '1px solid #E2E8F0', padding: '1rem 1.25rem', marginBottom: '1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    {schedDraft === null ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div>
                          <p style={{ margin: 0, fontWeight: 800, color: '#0F172A', fontSize: '0.9rem' }}>🕐 Horario de la parrilla</p>
                          <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                            {scheduleCfgView.periods.map(p => `${p.start}–${p.end}`).join(' · ')} · sesiones de {scheduleCfgView.slot_minutes} min
                          </p>
                        </div>
                        <button
                          onClick={() => setSchedDraft(JSON.parse(JSON.stringify(scheduleCfgView)))}
                          style={{ padding: '0.5rem 1rem', borderRadius: '0.625rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', color: '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                          ✎ Modificar horas
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <p style={{ margin: 0, fontWeight: 800, color: '#0F172A', fontSize: '0.9rem' }}>🕐 Modificar horario de la parrilla</p>
                          <button onClick={() => setSchedDraft(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '1.1rem', lineHeight: 1, padding: '0.2rem' }}>✕</button>
                        </div>
                        <p style={{ margin: '0 0 0.875rem', fontSize: '0.78rem', color: '#64748B', lineHeight: 1.45 }}>
                          Cada tramo (mañana / tarde) se rellena con sesiones seguidas y acaba en seco a su hora tope: la mañana llega como mucho a las 14:00 y no aparecen pistas hasta el tramo de las 16:00. Las horas NO se mueven solas: si un entreno pisa un hueco, ese hueco queda ocupado; para ofrecer otra hora usa "+ Hueco" en la pista.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.875rem' }}>
                          {schedDraft.periods.map((p, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-end', gap: '0.6rem', flexWrap: 'wrap', padding: '0.6rem 0.75rem', borderRadius: '0.75rem', border: '1.5px solid #E2E8F0', background: '#F8FAFC' }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#475569', alignSelf: 'center', minWidth: '58px' }}>Tramo {i + 1}</span>
                              <label style={{ flex: 1, minWidth: '110px', fontSize: '0.7rem', fontWeight: 700, color: '#475569' }}>Desde
                                <input type="time" value={p.start}
                                  onChange={e => { const v = e.target.value; setSchedDraft(d => ({ ...d, periods: d.periods.map((q, j) => j === i ? { ...q, start: v } : q) })); }}
                                  style={{ width: '100%', marginTop: 4, padding: '0.45rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', fontFamily: 'inherit', boxSizing: 'border-box', background: 'white' }} />
                              </label>
                              <label style={{ flex: 1, minWidth: '110px', fontSize: '0.7rem', fontWeight: 700, color: '#475569' }}>Hasta (tope)
                                <input type="time" value={p.end}
                                  onChange={e => { const v = e.target.value; setSchedDraft(d => ({ ...d, periods: d.periods.map((q, j) => j === i ? { ...q, end: v } : q) })); }}
                                  style={{ width: '100%', marginTop: 4, padding: '0.45rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', fontFamily: 'inherit', boxSizing: 'border-box', background: 'white' }} />
                              </label>
                              {schedDraft.periods.length > 1 && (
                                <button onClick={() => setSchedDraft(d => ({ ...d, periods: d.periods.filter((_, j) => j !== i) }))} title="Quitar este tramo"
                                  style={{ padding: '0.45rem 0.6rem', borderRadius: '0.5rem', border: '1.5px solid #FECACA', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.75rem', alignSelf: 'center' }}>
                                  🗑
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.875rem' }}>
                          <button onClick={() => setSchedDraft(d => ({ ...d, periods: [...d.periods, { start: '', end: '' }] }))}
                            style={{ padding: '0.5rem 0.875rem', borderRadius: '0.625rem', border: '1.5px dashed #CBD5E1', backgroundColor: 'white', color: '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                            + Añadir tramo
                          </button>
                          <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569' }}>Duración de cada sesión (min)
                            <input type="number" min="30" max="240" step="15" value={schedDraft.slot_minutes}
                              onChange={e => { const v = e.target.value; setSchedDraft(d => ({ ...d, slot_minutes: v })); }}
                              style={{ display: 'block', width: '110px', marginTop: 4, padding: '0.45rem 0.6rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', fontFamily: 'inherit', boxSizing: 'border-box', fontWeight: 700 }} />
                          </label>
                        </div>
                        {(() => {
                          // La preview usa la MISMA validación que Guardar: si
                          // algo impide guardar, aquí se ve el motivo exacto.
                          const { error: draftError, clean } = validarBorradorHorario(schedDraft);
                          return (
                            <div style={{ marginBottom: '0.875rem' }}>
                              <p style={{ margin: '0 0 0.4rem', fontSize: '0.7rem', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Así quedará la parrilla</p>
                              {draftError ? (
                                <p style={{ margin: 0, fontSize: '0.78rem', color: '#DC2626', fontWeight: 600 }}>{draftError}</p>
                              ) : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                  {buildScheduleTimes(clean).map(t => (
                                    <span key={t} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#15803D', background: '#F0FDF4', border: '1px solid #BBF7D0', padding: '0.25rem 0.55rem', borderRadius: '999px' }}>{t}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        <div style={{ display: 'flex', gap: '0.6rem' }}>
                          <button onClick={() => setSchedDraft(null)} disabled={savingSched}
                            style={{ flex: 1, padding: '0.7rem', borderRadius: '0.7rem', border: '1.5px solid #E2E8F0', background: 'white', color: '#475569', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            Cancelar
                          </button>
                          <button onClick={guardarHorario} disabled={savingSched}
                            style={{ flex: 2, padding: '0.7rem', borderRadius: '0.7rem', border: 'none', background: savingSched ? '#94A3B8' : '#16A34A', color: 'white', fontWeight: 800, cursor: savingSched ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                            {savingSched ? 'Guardando…' : '✓ Guardar horario'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                    {[
                      { label: 'Libre', s: slotColors.available },
                      { label: '💳 Tarjeta/Bizum', s: slotColors.online },
                      { label: '🏪 Club / ✍️ Manual', s: slotColors.booked },
                      { label: '🔒 Bloqueada', s: slotColors.blocked },
                      { label: '🏋️ Entreno', s: slotColors.entreno },
                    ].map(({ label, s }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: s.backgroundColor, border: `1.5px solid ${s.borderColor}` }} />
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>{label}</span>
                      </div>
                    ))}
                  </div>

                  <div className="courts-list">
                    {courts.map(court => {
                      const isCourtActive = activeSlot?.courtId === court.id;
                      const selectedSlotData = isCourtActive ? slots[court.id]?.[activeSlot.time] : null;
                      return (
                        <div key={court.id} style={{ backgroundColor: 'white', borderRadius: '1rem', border: '1px solid #E2E8F0', overflow: 'hidden', opacity: court.active ? 1 : 0.5, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                          <div style={{ background: court.gradient, padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ minWidth: 0 }}>
                              <span style={{ fontWeight: 800, color: 'white', fontSize: '0.95rem' }}>{court.name}</span>
                              <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>· {court.sport} · {court.location}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                              {court.active && (
                                <button onClick={() => { setCustomModal({ courtId: court.id, courtName: court.name }); setCustomStart(''); setCustomEnd(''); setCustomDate(selectedDate); }}
                                  title="Añadir un hueco a medida (ej: 21:00 - 22:30)"
                                  style={{ fontSize: '0.68rem', fontWeight: 800, backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.45)', padding: '0.25rem 0.6rem', borderRadius: '999px', cursor: 'pointer', fontFamily: 'inherit' }}>
                                  + Hueco
                                </button>
                              )}
                              {!court.active && <span style={{ fontSize: '0.65rem', fontWeight: 700, backgroundColor: 'rgba(0,0,0,0.25)', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '999px' }}>INACTIVA</span>}
                            </div>
                          </div>

                          <div style={{ padding: '0.875rem' }}>
                            <div className="slots-grid">
                              {/* La rejilla ya viene RECOLOCADA de loadSlots (misma lógica que
                                  la vista del jugador): se pinta exactamente lo que existe */}
                              {Object.keys(slots[court.id] || {})
                                .sort((a, b) => a.slice(0, 5).localeCompare(b.slice(0, 5)))
                                .map(time => {
                                const slot = slots[court.id]?.[time];
                                const esCustom = (customByCourt[court.id] || []).some(cs => cs.time === time);
                                const isSelected = activeSlot?.courtId === court.id && activeSlot?.time === time;
                                const c = isSelected ? slotColors.selected
                                  : slot?.status === 'booked' ? metodoColor(slot.metodo)
                                  : slot?.status === 'blocked' ? (slot.tipo === 'entreno' ? slotColors.entreno : slotColors.blocked)
                                  : slotColors[slot?.status] || slotColors.available;
                                return (
                                  <button key={time} disabled={!court.active}
                                    onClick={() => setActiveSlot(prev => prev?.courtId === court.id && prev?.time === time ? null : { courtId: court.id, time })}
                                    style={{ padding: '0.5rem 0.2rem', borderRadius: '0.5rem', border: `1.5px ${esCustom ? 'dashed' : 'solid'} ${c.borderColor}`, backgroundColor: c.backgroundColor, color: c.color, fontFamily: 'inherit', fontWeight: 700, fontSize: '0.68rem', textAlign: 'center', cursor: court.active ? 'pointer' : 'not-allowed', transition: 'all 0.15s', lineHeight: 1.3 }}
                                  >
                                    <div>{esCustom ? '🕐 ' : ''}{time.split(' - ')[0]}</div>
                                    <div style={{ fontSize: '0.58rem', fontWeight: 500, marginTop: '0.15rem', opacity: 0.85 }}>
                                      {slot?.status === 'booked' ? slot.client.split(' ')[0] : slot?.status === 'blocked' ? (slot.tipo === 'entreno' ? '🏋️ Entreno' : '🔒 Bloqueada') : 'Libre'}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>

                            {isCourtActive && selectedSlotData && (
                              <div style={{ backgroundColor: '#F8FAFC', borderRadius: '0.75rem', border: '1.5px solid #E2E8F0', padding: '0.875rem', marginTop: '0.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                  <div>
                                    <p style={{ margin: 0, fontWeight: 800, color: '#0F172A', fontSize: '0.875rem' }}>{activeSlot.time}</p>
                                    <p style={{ margin: '0.15rem 0 0', fontSize: '0.775rem', color: '#64748B' }}>
                                      {selectedSlotData.status === 'booked' ? `Cliente: ${selectedSlotData.client}` : selectedSlotData.status === 'blocked' ? (selectedSlotData.tipo === 'entreno' ? '🏋️ Bloqueada para entrenos' : '🔒 Bloqueada por administrador') : 'Franja disponible'}
                                    </p>
                                    {selectedSlotData.status === 'booked' && (
                                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.775rem', fontWeight: 700, color: '#1B3A6E' }}>
                                        Pago: {formatMetodoPago(selectedSlotData.metodo, selectedSlotData.isFree)}
                                      </p>
                                    )}
                                  </div>
                                  <button onClick={() => { setActiveSlot(null); setBookObs(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '0.2rem', fontSize: '1rem', lineHeight: 1 }}>✕</button>
                                </div>
                                {selectedSlotData.status === 'booked' && selectedSlotData.paymentType === 'split' && (
                                  <SplitAdmin bookingId={selectedSlotData.bookingId} />
                                )}
                                {selectedSlotData.status === 'booked' && (
                                  <PagosPistaAdmin
                                    key={selectedSlotData.bookingId}
                                    bookingId={selectedSlotData.bookingId}
                                    initPagos={selectedSlotData.pagosJugadores}
                                    initCobro={selectedSlotData.cobroConfirmado}
                                    initIsFree={selectedSlotData.isFree}
                                    initMetodo={selectedSlotData.metodo}
                                    onSaved={(patch) => {
                                      // Mantener fresco el mapa de slots del padre
                                      const { courtId, time } = activeSlot;
                                      setSlots(prev => {
                                        const c = prev[courtId];
                                        if (!c?.[time]) return prev;
                                        return { ...prev, [courtId]: { ...c, [time]: { ...c[time], ...patch } } };
                                      });
                                    }}
                                  />
                                )}
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  {selectedSlotData.status === 'available' && (
                                    <>
                                      {showUserPicker ? (
                                        <div style={{ width: '100%', backgroundColor: 'white', border: '1.5px solid #E2E8F0', borderRadius: '0.75rem', padding: '0.875rem', marginBottom: '0.5rem' }}>
                                          <p style={{ margin: '0 0 0.5rem', fontWeight: 700, fontSize: '0.85rem', color: '#0F172A' }}>Selecciona el jugador para esta reserva:</p>
                                          <input
                                            autoFocus
                                            type="text"
                                            placeholder="Buscar por nombre o email..."
                                            value={userSearch}
                                            onChange={e => setUserSearch(e.target.value)}
                                            style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', fontSize: '0.85rem', marginBottom: '0.5rem', boxSizing: 'border-box' }}
                                          />
                                          <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                            {allUsers
                                              .filter(u => (u.name || '').toLowerCase().includes(userSearch.toLowerCase()) || (u.email || '').toLowerCase().includes(userSearch.toLowerCase()))
                                              .map(u => (
                                                <button key={u.id} onClick={() => { setSelectedUserId(u.id); setShowUserPicker(false); setUserSearch(''); }}
                                                  style={{ textAlign: 'left', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: selectedUserId === u.id ? '2px solid #16A34A' : '1px solid #E2E8F0', backgroundColor: selectedUserId === u.id ? '#F0FDF4' : 'white', cursor: 'pointer', fontSize: '0.82rem' }}>
                                                  <span style={{ fontWeight: 700, color: '#0F172A', display: 'block' }}>{u.name || 'Sin nombre'}</span>
                                                  <span style={{ color: '#64748B' }}>{u.email}</span>
                                                </button>
                                              ))}
                                          </div>
                                          <button onClick={() => { setShowUserPicker(false); setSelectedUserId(null); }} style={{ marginTop: '0.5rem', background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.8rem' }}>Cancelar</button>
                                        </div>
                                      ) : (
                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                          <input
                                            value={bookObs}
                                            onChange={e => setBookObs(e.target.value)}
                                            placeholder="Nombre / observaciones (si no está registrado)"
                                            style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', fontSize: '0.82rem', boxSizing: 'border-box', fontFamily: 'inherit' }}
                                          />
                                          {selectedUserId && (
                                            <span style={{ fontSize: '0.78rem', backgroundColor: '#F0FDF4', color: '#16A34A', padding: '0.25rem 0.6rem', borderRadius: '999px', fontWeight: 700, border: '1px solid #86EFAC' }}>
                                              ✓ {allUsers.find(u => u.id === selectedUserId)?.name || 'Jugador seleccionado'}
                                            </span>
                                          )}
                                          <button onClick={() => {
                                            if (allUsers.length === 0) {
                                              supabase.from('profiles').select('id, name, email, phone, role').order('name')
                                                .then(({data}) => setAllUsers(data || []));
                                            }
                                            setShowUserPicker(true);
                                          }} style={{ padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', color: '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                                            👤 {selectedUserId ? 'Cambiar jugador' : 'Elegir jugador'}
                                          </button>
                                          <button disabled={isProcessing} onClick={() => handleAction('reserve')} style={{ padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: 'none', backgroundColor: isProcessing ? '#94A3B8' : '#16A34A', color: 'white', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: isProcessing ? 'not-allowed' : 'pointer' }}>
                                            {isProcessing ? 'Procesando...' : '✓ Reservar (gratis)'}
                                          </button>
                                          <button disabled={isProcessing} onClick={() => handleAction('block', { tipo: 'bloqueado' })} style={{ padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', color: '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: isProcessing ? 'not-allowed' : 'pointer' }}>
                                            🔒 Bloquear
                                          </button>
                                          {/* Entreno: el admin solo marca QUE hay clase y su horario; de cuántas
                                              personas es lo confirma el monitor al acabar el día */}
                                          <button disabled={isProcessing}
                                            onClick={() => {
                                              const [ini, fin] = activeSlot.time.split(' - ');
                                              setEntrenoModal({ courtId: court.id, courtName: court.name });
                                              setEntrenoStart(ini);
                                              setEntrenoEnd(fin);
                                            }}
                                            style={{ padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #D8B4FE', backgroundColor: '#FAF5FF', color: '#7E22CE', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: isProcessing ? 'not-allowed' : 'pointer' }}>
                                            🏋️ Entreno
                                          </button>
                                          {/* Editar hora: mueve este hueco a otra hora SOLO este día */}
                                          <button disabled={isProcessing}
                                            onClick={() => {
                                              const cs = (customByCourt[court.id] || []).find(c => c.time === activeSlot.time);
                                              const [ini, fin] = activeSlot.time.split(' - ');
                                              setEditHourModal({ courtId: court.id, courtName: court.name, originalTime: activeSlot.time, customId: cs?.id || null, hides: cs?.hides || null });
                                              setEditHourStart(ini);
                                              setEditHourEnd(fin);
                                            }}
                                            style={{ padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #93C5FD', backgroundColor: '#EFF6FF', color: '#1D4ED8', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: isProcessing ? 'not-allowed' : 'pointer' }}>
                                            🕐 Editar hora
                                          </button>
                                          {(customByCourt[court.id] || []).some(cs => cs.time === activeSlot.time) && (
                                            <button disabled={isProcessing} onClick={eliminarCustomSlot} style={{ padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #FECACA', backgroundColor: '#FEF2F2', color: '#DC2626', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: isProcessing ? 'not-allowed' : 'pointer' }}>
                                              🗑️ Quitar hueco
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </>
                                  )}
                                  {selectedSlotData.status === 'booked' && (
                                    <>
                                      <button onClick={() => {
                                        const court = courts.find(c => c.id === activeSlot.courtId);
                                        setMoveBooking({ id: selectedSlotData.bookingId, courtId: activeSlot.courtId, courtName: court?.name || 'Pista', date: selectedDate, time: activeSlot.time, client: selectedSlotData.client });
                                        setMoveTargetDate(selectedDate);
                                        setMoveTargetCourtId(activeSlot.courtId);
                                        setMoveTargetTime(activeSlot.time);
                                        setMoveSlotInfo(null);
                                      }} style={{ padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #2563EB', backgroundColor: '#EFF6FF', color: '#2563EB', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                                        ↔ Mover reserva
                                      </button>
                                      <button onClick={() => handleAction('cancel')} style={{ padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: 'none', backgroundColor: '#DC2626', color: 'white', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                                        ✕ Cancelar reserva
                                      </button>
                                    </>
                                  )}
                                  {selectedSlotData.status === 'blocked' && (
                                    <button onClick={() => handleAction('unblock')} style={{ padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: 'none', backgroundColor: '#0EA5E9', color: 'white', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                                      🔓 Desbloquear
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── TAB: RESERVAS ── */}
              {activeTab === 'bookings' && (() => {
                const today = serverToday();
                const maxDate = new Date(); maxDate.setDate(maxDate.getDate() + 60);
                const maxDateStr = maxDate.getFullYear() + '-' + String(maxDate.getMonth()+1).padStart(2,'0') + '-' + String(maxDate.getDate()).padStart(2,'0');
                const startDate = new Date(); startDate.setDate(startDate.getDate() - 30);
                const startDateStr = startDate.getFullYear() + '-' + String(startDate.getMonth()+1).padStart(2,'0') + '-' + String(startDate.getDate()).padStart(2,'0');
                const fmtDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
                const cancelDbBooking = async (id) => {
                  await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id);
                  setAllDbBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'cancelled' } : b));
                };
                return (
                  <div>
                    <div style={{ marginBottom: '1.25rem' }}>
                      <DateSelector
                        selectedDate={bookingsDate}
                        maxValidDate={maxDateStr}
                        startDate={startDateStr}
                        onSelectDate={setBookingsDate}
                      />
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: '#94A3B8', textTransform: 'capitalize', textAlign: 'center' }}>
                        {fmtDate(bookingsDate)} · {allDbBookings.length} reserva{allDbBookings.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    {loadingAllBookings ? (
                      <div style={{ textAlign: 'center', padding: '3rem', color: '#94A3B8' }}>
                        <div style={{ width: '28px', height: '28px', border: '3px solid #DCFCE7', borderTopColor: '#16A34A', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
                      </div>
                    ) : allDbBookings.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#94A3B8' }}>
                        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 0.875rem', display: 'block' }}>
                          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        <p style={{ fontWeight: 700, margin: 0, color: '#64748B' }}>No hay reservas este día</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {allDbBookings.map(b => (
                                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', backgroundColor: b.status === 'cancelled' ? '#FFF7F7' : 'white', borderRadius: '0.875rem', padding: '0.875rem', border: `1px solid ${b.status === 'cancelled' ? '#FECACA' : '#E2E8F0'}`, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', opacity: b.status === 'cancelled' ? 0.7 : 1 }}>
                                  <div style={{ width: '40px', height: '40px', borderRadius: '0.625rem', background: b.courts?.gradient || 'linear-gradient(135deg,#16A34A,#059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <span style={{ fontSize: '1rem' }}>{b.courts?.sport === 'Pádel' ? '🎾' : '🏓'}</span>
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ margin: 0, fontWeight: 700, color: '#0F172A', fontSize: '0.875rem' }}>{b.courts?.name || 'Pista'}</p>
                                    <p style={{ margin: '0.1rem 0 0', fontSize: '0.775rem', color: '#64748B' }}>
                                      {b.time_slot} · {b.profiles?.name || b.profiles?.email?.split('@')[0] || 'Cliente'}
                                      {b.is_free && <span style={{ marginLeft: '0.4rem', backgroundColor: '#F0FDF4', color: '#15803D', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>GRATIS</span>}
                                      {b.status === 'cancelled' && <span style={{ marginLeft: '0.4rem', backgroundColor: '#FEF2F2', color: '#DC2626', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>CANCELADA</span>}
                                    </p>
                                  </div>
                                  {b.status !== 'cancelled' && <>
                                    <button onClick={() => {
                                      setMoveBooking({ id: b.id, courtId: b.court_id, courtName: b.courts?.name || 'Pista', date: b.date, time: b.time_slot, client: b.profiles?.name || b.profiles?.email?.split('@')[0] || 'Cliente' });
                                      setMoveTargetDate(b.date);
                                      setMoveTargetCourtId(b.court_id);
                                      setMoveTargetTime(b.time_slot);
                                      setMoveSlotInfo(null);
                                    }} style={{ padding: '0.4rem 0.75rem', borderRadius: '0.5rem', border: '1.5px solid #2563EB', backgroundColor: '#EFF6FF', color: '#2563EB', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', flexShrink: 0 }}>
                                      Mover
                                    </button>
                                    <button onClick={() => cancelDbBooking(b.id)}
                                      style={{ padding: '0.4rem 0.75rem', borderRadius: '0.5rem', border: 'none', backgroundColor: '#FEF2F2', color: '#DC2626', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', flexShrink: 0 }}>
                                      Cancelar
                                    </button>
                                  </>}
                                </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── TAB: FINANZAS ── */}
              {activeTab === 'finance' && <FinanceManager />}

              {/* ── TAB: CONTROL HORARIO ── */}
              {activeTab === 'timeclock' && <TimeClockManager />}

              {/* ── TAB: CONFIGURACIÓN ── */}
              {activeTab === 'settings' && (
                <div style={{ maxWidth: '600px' }}>
                  <p className="section-label" style={{ marginBottom: '1.5rem' }}>Ajustes Generales del Club</p>
                  
                  <div style={{ backgroundColor: 'white', padding: '1.75rem', borderRadius: '1.25rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: '#1E293B', fontSize: '0.9rem' }}>
                        Días de antelación permitidos para reservar
                      </label>
                      <p style={{ margin: '0 0 0.8rem', fontSize: '0.8rem', color: '#64748B', lineHeight: '1.4' }}>
                        Controla hasta qué día pueden ver y reservar los clientes. Por ejemplo, si pones "2" y hoy es Lunes, solo podrán ver pistas hasta el Miércoles. Si pones "7", verán una semana justa.
                      </p>
                      <input 
                        type="number" 
                        min="1" max="90"
                        value={siteSettings.booking_window_days}
                        onChange={(e) => setSiteSettings({...siteSettings, booking_window_days: e.target.value})}
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '1rem', fontWeight: 600, color: '#0F172A' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: '#1E293B', fontSize: '0.9rem' }}>
                        Precio por reserva de pista (€)
                      </label>
                      <p style={{ margin: '0 0 0.8rem', fontSize: '0.8rem', color: '#64748B' }}>El precio que se cobrará a los clientes tanto por tarjeta como en efectivo en el club.</p>
                      <input 
                        type="number" 
                        step="0.5" min="0"
                        value={siteSettings.court_price}
                        onChange={(e) => setSiteSettings({...siteSettings, court_price: e.target.value})}
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '1rem', fontWeight: 600, color: '#0F172A' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: '#1E293B', fontSize: '0.9rem' }}>
                        🔓 Hora de apertura de reservas
                      </label>
                      <p style={{ margin: '0 0 0.8rem', fontSize: '0.8rem', color: '#64748B', lineHeight: '1.4' }}>
                        Las pistas de cada día se abren a esta hora, <strong>tantos días antes como marquen los "Días de antelación"</strong>. Por ejemplo, con antelación <strong>2</strong> y hora <strong>09:00</strong>: el jueves a las 9:00 se abre el sábado, el viernes a las 9:00 se abre el domingo, y así cada día. Los días ya abiertos siguen abiertos.
                      </p>
                      <input
                        type="time"
                        value={siteSettings.slots_release_time || '00:00'}
                        onChange={(e) => setSiteSettings({...siteSettings, slots_release_time: e.target.value})}
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '1rem', fontWeight: 600, color: '#0F172A' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: '#1E293B', fontSize: '0.9rem' }}>
                        🏪 Horario de Pago en Recepción por día
                      </label>
                      <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: '#64748B', lineHeight: '1.4' }}>
                        Configura para cada día si el "Pago en el Club" está disponible y a partir de qué hora. Si desactivas un día, los clientes solo podrán pagar con tarjeta o Bizum ese día.
                      </p>
                      <style>{`
                        .ch-row {
                          display: flex;
                          align-items: center;
                          gap: 0.75rem;
                          padding: 0.7rem 0.875rem;
                          border-radius: 0.75rem;
                          border: 1.5px solid;
                          flex-wrap: wrap;
                        }
                        .ch-row-head {
                          display: flex;
                          align-items: center;
                          gap: 0.75rem;
                          flex: 0 0 auto;
                        }
                        .ch-day-label {
                          width: 88px;
                          font-weight: 700;
                          font-size: 0.9rem;
                          color: #0F172A;
                        }
                        .ch-toggle {
                          flex-shrink: 0;
                          width: 44px;
                          height: 26px;
                          border-radius: 13px;
                          border: none;
                          position: relative;
                          cursor: pointer;
                          transition: background .2s;
                          padding: 0;
                        }
                        .ch-toggle-dot {
                          position: absolute;
                          width: 20px;
                          height: 20px;
                          border-radius: 50%;
                          background: white;
                          top: 3px;
                          transition: left .2s;
                          box-shadow: 0 1px 3px rgba(0,0,0,.25);
                        }
                        .ch-time-wrap {
                          display: flex;
                          align-items: center;
                          gap: 0.4rem;
                          flex: 1 1 160px;
                          min-width: 0;
                        }
                        .ch-time-input {
                          flex: 1;
                          min-width: 0;
                          min-height: 40px;
                          padding: 0.4rem 0.6rem;
                          border-radius: 0.5rem;
                          border: 1.5px solid #CBD5E1;
                          background-color: white;
                          color: #0F172A;
                          font-weight: 600;
                        }
                        @media (max-width: 480px) {
                          .ch-row { gap: 0.6rem; padding: 0.65rem 0.75rem; }
                          .ch-row-head { flex: 1 1 100%; justify-content: space-between; }
                          .ch-day-label { width: auto; }
                          .ch-time-wrap { flex: 1 1 100%; }
                        }
                      `}</style>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {[
                          { key: 1, label: 'Lunes' },
                          { key: 2, label: 'Martes' },
                          { key: 3, label: 'Miércoles' },
                          { key: 4, label: 'Jueves' },
                          { key: 5, label: 'Viernes' },
                          { key: 6, label: 'Sábado' },
                          { key: 0, label: 'Domingo' },
                        ].map(({ key, label }) => {
                          const val = siteSettings.club_hours?.[key];
                          const enabled = val !== null && val !== undefined;
                          const updateHours = (newVal) => setSiteSettings(s => ({ ...s, club_hours: { ...s.club_hours, [key]: newVal } }));
                          return (
                            <div key={key} className="ch-row" style={{ borderColor: enabled ? '#BBF7D0' : '#E2E8F0', background: enabled ? '#F0FDF4' : '#F8FAFC' }}>
                              <div className="ch-row-head">
                                <span className="ch-day-label">{label}</span>
                                <button
                                  type="button"
                                  aria-label={`Pago en club ${enabled ? 'activado' : 'desactivado'} el ${label}`}
                                  onClick={() => updateHours(enabled ? null : '07:00')}
                                  className="ch-toggle"
                                  style={{ background: enabled ? '#16A34A' : '#CBD5E1' }}
                                >
                                  <span className="ch-toggle-dot" style={{ left: enabled ? '21px' : '3px' }} />
                                </button>
                              </div>
                              {enabled ? (
                                <div className="ch-time-wrap">
                                  <span style={{ fontSize: '0.78rem', color: '#64748B', whiteSpace: 'nowrap', fontWeight: 600 }}>A partir de</span>
                                  <input
                                    type="time"
                                    value={val || '00:00'}
                                    onChange={(e) => updateHours(e.target.value)}
                                    className="ch-time-input"
                                  />
                                  {val === '00:00' && <span style={{ fontSize: '0.72rem', color: '#16A34A', fontWeight: 700, whiteSpace: 'nowrap' }}>siempre</span>}
                                </div>
                              ) : (
                                <span style={{ fontSize: '0.78rem', color: '#94A3B8', fontWeight: 600, flex: '1 1 auto' }}>No disponible</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: '#1E293B', fontSize: '0.9rem' }}>
                        ❌ Cancelación de reservas por el cliente
                      </label>
                      <p style={{ margin: '0 0 0.8rem', fontSize: '0.8rem', color: '#64748B', lineHeight: '1.4' }}>
                        Permite o bloquea que los clientes cancelen sus propias reservas desde "Mis Reservas". Si lo activas, puedes exigir un mínimo de antelación.
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0.875rem', borderRadius: '0.75rem', border: '1.5px solid', borderColor: siteSettings.cancellation_enabled ? '#BBF7D0' : '#E2E8F0', background: siteSettings.cancellation_enabled ? '#F0FDF4' : '#F8FAFC' }}>
                        <button
                          type="button"
                          onClick={() => setSiteSettings(s => ({ ...s, cancellation_enabled: !s.cancellation_enabled }))}
                          style={{ flexShrink: 0, width: '40px', height: '22px', borderRadius: '11px', border: 'none', background: siteSettings.cancellation_enabled ? '#16A34A' : '#CBD5E1', position: 'relative', cursor: 'pointer', transition: 'background .2s' }}
                        >
                          <span style={{ position: 'absolute', width: '16px', height: '16px', borderRadius: '50%', background: 'white', top: '3px', left: siteSettings.cancellation_enabled ? '21px' : '3px', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
                        </button>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0F172A' }}>
                          {siteSettings.cancellation_enabled ? 'Permitida' : 'No permitida'}
                        </span>
                      </div>

                      {siteSettings.cancellation_enabled && (
                        <div style={{ marginTop: '0.875rem' }}>
                          <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 700, color: '#1E293B', fontSize: '0.85rem' }}>
                            Antelación mínima para cancelar (horas)
                          </label>
                          <p style={{ margin: '0 0 0.6rem', fontSize: '0.78rem', color: '#64748B', lineHeight: '1.4' }}>
                            A partir de cuántas horas antes del inicio de la reserva se puede cancelar. Por ejemplo, <strong>24</strong> significa que el cliente podrá cancelar si faltan 24h o más. Pon <strong>0</strong> para permitir cancelar hasta el último momento.
                          </p>
                          <input
                            type="number"
                            min="0" max="168"
                            value={siteSettings.cancellation_hours}
                            onChange={(e) => setSiteSettings({ ...siteSettings, cancellation_hours: e.target.value })}
                            style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '1rem', fontWeight: 600, color: '#0F172A' }}
                          />
                        </div>
                      )}
                    </div>

                    {settingsMsg && (
                      <div style={{
                        padding: '0.875rem 1rem', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        backgroundColor: settingsMsg.type === 'ok' ? '#F0FDF4' : '#FEF2F2',
                        color: settingsMsg.type === 'ok' ? '#15803D' : '#DC2626',
                        border: `1px solid ${settingsMsg.type === 'ok' ? '#86EFAC' : '#FECACA'}`,
                        animation: 'fadeIn 0.2s ease',
                      }}>
                        {settingsMsg.type === 'ok'
                          ? <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                          : <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        }
                        {settingsMsg.text}
                      </div>
                    )}
                    <button 
                      onClick={handleSaveSettings}
                      disabled={savingSettings}
                      style={{ marginTop: '0.5rem', padding: '0.875rem', borderRadius: '0.75rem', border: 'none', backgroundColor: '#16A34A', color: 'white', fontWeight: 700, fontSize: '1rem', cursor: savingSettings ? 'not-allowed' : 'pointer', transition: 'background-color 0.2s' }}
                    >
                      {savingSettings ? 'Guardando cambios...' : 'Guardar Ajustes'}
                    </button>

                  </div>
                </div>
              )}

              {/* ── TAB: PISTAS ── */}
              {activeTab === 'courts' && (
                <div>
                  <p className="section-label" style={{ marginBottom: '1rem' }}>Gestión de pistas</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {courts.map(court => {
                      const editedPrice = courtPriceEdits[court.id];
                      const displayPrice = editedPrice !== undefined ? editedPrice : (court.price != null ? court.price : siteSettings.court_price);
                      const isDirty = editedPrice !== undefined && parseFloat(editedPrice) !== (court.price != null ? court.price : siteSettings.court_price);
                      const msg = courtPriceMsg[court.id];
                      return (
                        <div key={court.id} style={{ backgroundColor: 'white', borderRadius: '1rem', padding: '1rem', border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '0.75rem', background: court.gradient, opacity: court.active ? 1 : 0.35, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'opacity 0.2s' }}>
                              <span style={{ fontSize: '1.25rem' }}>{court.sport === 'Pádel' ? '🎾' : '🏓'}</span>
                            </div>
                            <div style={{ flex: 1 }}>
                              <p style={{ margin: 0, fontWeight: 700, color: court.active ? '#0F172A' : '#94A3B8', fontSize: '0.95rem', transition: 'color 0.2s' }}>{court.name}</p>
                              <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: '#94A3B8' }}>{court.sport} · {court.location}</p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: court.active ? '#16A34A' : '#94A3B8', transition: 'color 0.2s' }}>{court.active ? 'Activa' : 'Inactiva'}</span>
                              <button onClick={() => toggleCourt(court.id)} aria-label={court.active ? 'Desactivar' : 'Activar'}
                                style={{ width: '48px', height: '26px', borderRadius: '999px', border: 'none', backgroundColor: court.active ? '#16A34A' : '#CBD5E1', cursor: 'pointer', position: 'relative', transition: 'background-color 0.2s', flexShrink: 0 }}>
                                <span style={{ position: 'absolute', top: '3px', left: court.active ? '25px' : '3px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                              </button>
                            </div>
                          </div>

                          {/* Precio por pista */}
                          <div style={{ marginTop: '0.875rem', paddingTop: '0.875rem', borderTop: '1px dashed #E2E8F0', display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B' }}>Precio:</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={displayPrice}
                                onChange={e => setCourtPriceEdits(prev => ({ ...prev, [court.id]: e.target.value }))}
                                style={{ width: '80px', padding: '0.35rem 0.6rem', borderRadius: '0.5rem', border: `1.5px solid ${isDirty ? '#2563EB' : '#CBD5E1'}`, fontSize: '0.9rem', fontWeight: 700, color: '#0F172A', textAlign: 'right' }}
                              />
                              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748B' }}>€</span>
                            </div>
                            {isDirty && (
                              <button
                                onClick={() => saveCourtPrice(court.id)}
                                disabled={savingCourtPrice === court.id}
                                style={{ padding: '0.35rem 0.75rem', borderRadius: '0.5rem', border: 'none', backgroundColor: savingCourtPrice === court.id ? '#94A3B8' : '#2563EB', color: 'white', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
                              >
                                {savingCourtPrice === court.id ? '...' : 'Guardar'}
                              </button>
                            )}
                            {msg?.type === 'ok' && <span style={{ fontSize: '0.78rem', color: '#16A34A', fontWeight: 700 }}>✓ Guardado</span>}
                            {msg?.type === 'error' && <span style={{ fontSize: '0.78rem', color: '#DC2626', fontWeight: 700 }}>Error: {msg.text}</span>}
                            {court.price == null && !isDirty && (
                              <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>(precio global: {siteSettings.court_price} €)</span>
                            )}
                          </div>

                          {/* Métodos de pago por franja */}
                          <div style={{ marginTop: '0.875rem', paddingTop: '0.875rem', borderTop: '1px dashed #E2E8F0' }}>
                            <button
                              onClick={() => setExpandedPaymentCourt(expandedPaymentCourt === court.id ? null : court.id)}
                              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.75rem', borderRadius: '0.5rem', background: expandedPaymentCourt === court.id ? '#EFF6FF' : '#F8FAFC', border: `1.5px solid ${expandedPaymentCourt === court.id ? '#BFDBFE' : '#E2E8F0'}`, color: expandedPaymentCourt === court.id ? '#1D4ED8' : '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
                              </svg>
                              Métodos de pago por franja
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expandedPaymentCourt === court.id ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                                <polyline points="6 9 12 15 18 9"/>
                              </svg>
                            </button>

                            {expandedPaymentCourt === court.id && (
                              <div style={{ marginTop: '0.75rem', background: '#F8FAFC', borderRadius: '0.75rem', padding: '0.75rem', border: '1px solid #E2E8F0' }}>
                                <p style={{ margin: '0 0 0.625rem', fontSize: '0.72rem', color: '#64748B', lineHeight: 1.45 }}>
                                  Marca qué métodos quedan disponibles en cada franja. Selecciona un día para configurarlo solo para ese día (por defecto la regla de "Todos los días" se aplica a los días sin regla específica). Sin marcas en una franja, los clientes no podrán pagar.
                                </p>

                                {/* Selector de día */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.75rem' }}>
                                  {DAY_OPTIONS.map(opt => {
                                    const active = paymentDayFilter === opt.key;
                                    const isAll = opt.key === -1;
                                    return (
                                      <button
                                        key={opt.key}
                                        type="button"
                                        onClick={() => setPaymentDayFilter(opt.key)}
                                        style={{
                                          padding: '0.35rem 0.7rem',
                                          borderRadius: '999px',
                                          border: `1.5px solid ${active ? (isAll ? '#1D4ED8' : '#16A34A') : '#CBD5E1'}`,
                                          background: active ? (isAll ? '#1D4ED8' : '#16A34A') : 'white',
                                          color: active ? 'white' : '#475569',
                                          fontFamily: 'inherit',
                                          fontWeight: 700,
                                          fontSize: '0.72rem',
                                          cursor: 'pointer',
                                          minHeight: '34px',
                                        }}
                                      >
                                        {opt.short}
                                      </button>
                                    );
                                  })}
                                </div>
                                <p style={{ margin: '0 0 0.625rem', fontSize: '0.7rem', color: paymentDayFilter === -1 ? '#1D4ED8' : '#15803D', fontWeight: 700 }}>
                                  {paymentDayFilter === -1
                                    ? 'Editando regla por defecto (todos los días)'
                                    : `Editando solo ${DAY_OPTIONS.find(o => o.key === paymentDayFilter)?.label}`}
                                </p>

                                <div style={{ overflowX: 'auto' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', minWidth: '360px' }}>
                                    <thead>
                                      <tr>
                                        <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', fontWeight: 700, color: '#64748B', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Franja</th>
                                        {ALL_METHODS.map(m => (
                                          <th key={m} style={{ textAlign: 'center', padding: '0.4rem 0.5rem', fontWeight: 700, color: '#64748B', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{METHOD_LABELS[m]}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {scheduleTimes.map(slot => {
                                        const allowed = getAllowedMethods(court.id, slot, paymentDayFilter);
                                        // Si la celda actual hereda de "Todos los días" (no hay regla propia),
                                        // la marcamos en gris claro para hacerlo visible.
                                        const isInherited = paymentDayFilter !== -1 && paymentRules[court.id]?.[paymentDayFilter]?.[slot] === undefined;
                                        return (
                                          <tr key={slot} style={{ borderTop: '1px solid #E2E8F0', opacity: isInherited ? 0.7 : 1 }}>
                                            <td style={{ padding: '0.45rem 0.5rem', color: '#0F172A', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                              {slot}
                                              {isInherited && <span style={{ marginLeft: '0.4rem', fontSize: '0.62rem', color: '#94A3B8', fontWeight: 600 }}>(heredado)</span>}
                                            </td>
                                            {ALL_METHODS.map(m => {
                                              const checked = allowed.includes(m);
                                              const saving = savingPaymentCell === `${court.id}-${paymentDayFilter}-${slot}-${m}`;
                                              return (
                                                <td key={m} style={{ padding: '0.3rem 0.5rem', textAlign: 'center' }}>
                                                  <button
                                                    onClick={() => !saving && togglePaymentMethod(court.id, slot, m)}
                                                    disabled={saving}
                                                    aria-label={`${checked ? 'Desactivar' : 'Activar'} ${METHOD_LABELS[m]} en ${slot}`}
                                                    style={{
                                                      width: '26px', height: '26px', borderRadius: '0.5rem',
                                                      border: `1.5px solid ${checked ? '#16A34A' : '#CBD5E1'}`,
                                                      background: checked ? '#16A34A' : 'white',
                                                      cursor: saving ? 'wait' : 'pointer',
                                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                      transition: 'all 0.15s',
                                                      opacity: saving ? 0.6 : 1,
                                                    }}
                                                  >
                                                    {checked && (
                                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="20 6 9 17 4 12"/>
                                                      </svg>
                                                    )}
                                                  </button>
                                                </td>
                                              );
                                            })}
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#F0FDF4', borderRadius: '0.875rem', border: '1px solid #86EFAC' }}>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#15803D', fontWeight: 500, lineHeight: 1.55 }}>
                      Las pistas desactivadas no aceptan nuevas reservas. Puedes poner el precio a <strong>0 €</strong> para que una pista sea gratuita. Si no se asigna precio individual, se usa el precio global de Configuración.
                    </p>
                  </div>
                </div>
              )}
              {/* ── TAB: JUGADORES ── */}
              {activeTab === 'users' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <p className="section-label" style={{ margin: 0 }}>Directorio de Jugadores</p>
                    <button onClick={async () => {
                      const { data } = await supabase.from('profiles').select('id, name, email, phone, role').order('name');
                      setAllUsers(data || []);
                    }} style={{ padding: '0.5rem 1rem', borderRadius: '0.625rem', border: '1.5px solid #E2E8F0', backgroundColor: 'white', color: '#475569', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                      ↻ Actualizar lista
                    </button>
                  </div>
                  <UserDirectoryTab supabase={supabase} allUsers={allUsers} setAllUsers={setAllUsers} />
                </div>
              )}
              {/* ── TAB: TORNEOS ── */}
              {activeTab === 'tournaments' && <TournamentManager />}

              {/* ── TAB: EVENTOS ── */}
              {activeTab === 'events' && <EventsManager />}

              {/* ── TAB: TIENDA (catálogo) ── */}
              {activeTab === 'tienda' && <ProductsManager />}

              {/* ── TAB: PEDIDOS ── */}
              {activeTab === 'pedidos' && <OrdersManager />}

            </>
          )}
        </div>
      </div>
    </div>

    {/* ── MODAL: MOVER RESERVA ── */}
    {moveBooking && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={e => { if (e.target === e.currentTarget) setMoveBooking(null); }}>
        <div style={{ background: 'white', borderRadius: '1.25rem', width: '100%', maxWidth: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
          <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563EB 100%)', padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontWeight: 800, color: 'white', fontSize: '1.05rem' }}>Mover reserva</p>
              <p style={{ margin: '0.2rem 0 0', color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem' }}>{moveBooking.client} · {moveBooking.courtName}</p>
            </div>
            <button onClick={() => setMoveBooking(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '0.5rem', padding: '0.4rem 0.6rem', cursor: 'pointer', color: 'white', fontSize: '1rem', lineHeight: 1 }}>✕</button>
          </div>

          <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '0.75rem', padding: '0.75rem 1rem' }}>
              <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reserva actual</p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#0F172A', fontWeight: 600 }}>
                {moveBooking.courtName} · {formatDate(moveBooking.date)} · {moveBooking.time}
              </p>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 700, color: '#0F172A', fontSize: '0.875rem' }}>Nueva fecha</label>
              <input type="date" value={moveTargetDate} onChange={e => setMoveTargetDate(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '0.95rem', fontWeight: 600, boxSizing: 'border-box' }} />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 700, color: '#0F172A', fontSize: '0.875rem' }}>Nueva pista</label>
              <select value={moveTargetCourtId} onChange={e => setMoveTargetCourtId(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '0.95rem', fontWeight: 600, backgroundColor: 'white', boxSizing: 'border-box' }}>
                {courts.filter(c => c.active).map(c => (
                  <option key={c.id} value={c.id}>{c.name} · {c.sport}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 700, color: '#0F172A', fontSize: '0.875rem' }}>Nueva franja horaria</label>
              <select value={moveTargetTime} onChange={e => setMoveTargetTime(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '0.95rem', fontWeight: 600, backgroundColor: 'white', boxSizing: 'border-box' }}>
                <option value="">— Selecciona franja —</option>
                {scheduleTimes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {moveSlotInfo === 'checking' && (
              <p style={{ margin: 0, color: '#94A3B8', fontSize: '0.85rem', textAlign: 'center' }}>Comprobando disponibilidad...</p>
            )}
            {moveSlotInfo === 'available' && (
              <div style={{ padding: '0.75rem 1rem', borderRadius: '0.75rem', backgroundColor: '#F0FDF4', border: '1px solid #86EFAC', color: '#15803D', fontWeight: 700, fontSize: '0.875rem' }}>
                ✓ Franja disponible
              </div>
            )}
            {moveSlotInfo === 'conflict' && (
              <div style={{ padding: '0.75rem 1rem', borderRadius: '0.75rem', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontWeight: 700, fontSize: '0.875rem' }}>
                ✕ Franja ocupada o bloqueada — elige otra
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setMoveBooking(null)} style={{ flex: 1, padding: '0.875rem', borderRadius: '0.75rem', border: '1.5px solid #E2E8F0', background: 'white', color: '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                disabled={moveSlotInfo !== 'available' || isProcessing}
                onClick={handleMoveBooking}
                style={{ flex: 2, padding: '0.875rem', borderRadius: '0.75rem', border: 'none', background: moveSlotInfo === 'available' && !isProcessing ? '#16A34A' : '#CBD5E1', color: 'white', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9rem', cursor: moveSlotInfo === 'available' && !isProcessing ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }}>
                {isProcessing ? 'Moviendo...' : '↔ Confirmar traslado'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
  </>
);
};

export default AdminDashboard;
