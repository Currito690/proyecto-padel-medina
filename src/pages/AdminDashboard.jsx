import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';

const TIMES = ['09:00 - 10:30', '10:30 - 12:00', '12:00 - 13:30', '16:00 - 17:30', '17:30 - 19:00', '19:00 - 20:30', '20:30 - 22:00'];

const formatDate = (dateStr) => {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
};

const slotColors = {
  available: { borderColor: '#86EFAC', backgroundColor: '#F0FDF4', color: '#15803D' },
  booked:    { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', color: '#DC2626' },
  blocked:   { borderColor: '#CBD5E1', backgroundColor: '#F1F5F9', color: '#94A3B8' },
  selected:  { borderColor: '#0F172A', backgroundColor: '#0F172A', color: 'white' },
};

const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('schedule');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [courts, setCourts] = useState([]);
  const [slots, setSlots] = useState({});
  const [activeSlot, setActiveSlot] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadCourts = useCallback(async () => {
    const { data } = await supabase.from('courts').select('*').order('name');
    if (data) setCourts(data);
  }, []);

  const loadSlots = useCallback(async (date) => {
    const [{ data: bookings }, { data: blocked }] = await Promise.all([
      supabase.from('bookings').select('*, profiles(name)').eq('date', date).eq('status', 'confirmed'),
      supabase.from('blocked_slots').select('*').eq('date', date),
    ]);
    const newSlots = {};
    courts.forEach(court => {
      newSlots[court.id] = {};
      TIMES.forEach(time => { newSlots[court.id][time] = { status: 'available' }; });
    });
    bookings?.forEach(b => {
      if (newSlots[b.court_id]) {
        newSlots[b.court_id][b.time_slot] = { status: 'booked', client: b.profiles?.name || 'Cliente', bookingId: b.id };
      }
    });
    blocked?.forEach(b => {
      if (newSlots[b.court_id]) {
        newSlots[b.court_id][b.time_slot] = { status: 'blocked', blockedId: b.id };
      }
    });
    setSlots(newSlots);
  }, [courts]);

  useEffect(() => {
    loadCourts();
  }, [loadCourts]);

  useEffect(() => {
    if (courts.length > 0) {
      loadSlots(selectedDate).finally(() => setLoading(false));
    }
  }, [courts, selectedDate, loadSlots]);

  const handleAction = async (action) => {
    const { courtId, time } = activeSlot;
    const slot = slots[courtId]?.[time];
    if (action === 'reserve') {
      await supabase.from('bookings').insert({ court_id: courtId, user_id: user.id, date: selectedDate, time_slot: time, status: 'confirmed', is_free: true });
    } else if (action === 'block') {
      await supabase.from('blocked_slots').insert({ court_id: courtId, date: selectedDate, time_slot: time, created_by: user.id });
    } else if (action === 'cancel') {
      await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', slot.bookingId);
    } else if (action === 'unblock') {
      await supabase.from('blocked_slots').delete().eq('id', slot.blockedId);
    }
    setActiveSlot(null);
    await loadSlots(selectedDate);
  };

  const cancelBooking = async (bookingId) => {
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId);
    await loadSlots(selectedDate);
  };

  const toggleCourt = async (courtId) => {
    const court = courts.find(c => c.id === courtId);
    await supabase.from('courts').update({ active: !court.active }).eq('id', courtId);
    setCourts(prev => prev.map(c => c.id === courtId ? { ...c, active: !c.active } : c));
  };

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
    setActiveSlot(null);
  };

  const allBookings = [];
  courts.forEach(court => {
    TIMES.forEach(time => {
      const slot = slots[court.id]?.[time];
      if (slot?.status === 'booked') {
        allBookings.push({ ...court, time, client: slot.client, bookingId: slot.bookingId });
      }
    });
  });

  const totalBlocked = Object.values(slots).flatMap(c => Object.values(c)).filter(s => s.status === 'blocked').length;
  const activeCourts = courts.filter(c => c.active).length;

  const tabStyle = (key) => ({
    flex: 1, padding: '0.625rem 0.375rem',
    border: 'none', borderRadius: '0.5rem',
    fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
    transition: 'all 0.2s',
    backgroundColor: activeTab === key ? 'white' : 'transparent',
    color: activeTab === key ? '#0F172A' : '#94A3B8',
    boxShadow: activeTab === key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
  });

  return (
    <>
      <style>{`
        .admin-wrap { min-height: 100vh; background: var(--color-bg-secondary); }
        .admin-header { background: white; border-bottom: 1px solid var(--color-border); padding: 0.875rem 1.25rem; position: sticky; top: 0; z-index: 10; box-shadow: var(--shadow-sm); }
        .admin-body { max-width: 960px; margin: 0 auto; padding: 1.25rem 1rem 3rem; }
        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1.5rem; }
        .slots-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.4rem; margin-bottom: 0.625rem; }
        @media (min-width: 480px) { .slots-grid { grid-template-columns: repeat(7, 1fr); } }
        @media (min-width: 640px) { .admin-body { padding: 1.75rem 1.5rem 3rem; } }
        @media (min-width: 1024px) { .admin-body { padding: 2rem 2rem 3rem; max-width: 1060px; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="admin-wrap">
        {/* Header */}
        <div className="admin-header">
          <div style={{ maxWidth: '1060px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '0.625rem', background: 'linear-gradient(135deg, #16A34A, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
                </svg>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '0.62rem', fontWeight: 700, color: '#16A34A', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Panel Admin</p>
                <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>Padel Medina</p>
              </div>
            </div>
            <button onClick={logout} style={{ padding: '0.5rem 1rem', border: '1.5px solid #E2E8F0', borderRadius: '0.625rem', background: 'white', color: '#475569', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
              Salir
            </button>
          </div>
        </div>

        <div className="admin-body">
          {/* Stats */}
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

          {/* Tabs */}
          <div style={{ display: 'flex', backgroundColor: '#F1F5F9', borderRadius: '0.875rem', padding: '0.25rem', marginBottom: '1.5rem', gap: '0.25rem' }}>
            {[
              { key: 'schedule', label: 'Horario' },
              { key: 'bookings', label: `Reservas (${allBookings.length})` },
              { key: 'courts', label: 'Pistas' },
            ].map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)} style={tabStyle(t.key)}>{t.label}</button>
            ))}
          </div>

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

                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                    {[
                      { label: 'Libre', s: slotColors.available },
                      { label: 'Reservado', s: slotColors.booked },
                      { label: 'Bloqueado', s: slotColors.blocked },
                    ].map(({ label, s }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: s.backgroundColor, border: `1.5px solid ${s.borderColor}` }} />
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>{label}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {courts.map(court => {
                      const isCourtActive = activeSlot?.courtId === court.id;
                      const selectedSlotData = isCourtActive ? slots[court.id]?.[activeSlot.time] : null;
                      return (
                        <div key={court.id} style={{ backgroundColor: 'white', borderRadius: '1rem', border: '1px solid #E2E8F0', overflow: 'hidden', opacity: court.active ? 1 : 0.5, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                          <div style={{ background: court.gradient, padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <span style={{ fontWeight: 800, color: 'white', fontSize: '0.95rem' }}>{court.name}</span>
                              <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>· {court.sport} · {court.location}</span>
                            </div>
                            {!court.active && <span style={{ fontSize: '0.65rem', fontWeight: 700, backgroundColor: 'rgba(0,0,0,0.25)', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '999px' }}>INACTIVA</span>}
                          </div>

                          <div style={{ padding: '0.875rem' }}>
                            <div className="slots-grid">
                              {TIMES.map(time => {
                                const slot = slots[court.id]?.[time];
                                const isSelected = activeSlot?.courtId === court.id && activeSlot?.time === time;
                                const c = isSelected ? slotColors.selected : slotColors[slot?.status] || slotColors.available;
                                return (
                                  <button key={time} disabled={!court.active}
                                    onClick={() => setActiveSlot(prev => prev?.courtId === court.id && prev?.time === time ? null : { courtId: court.id, time })}
                                    style={{ padding: '0.5rem 0.2rem', borderRadius: '0.5rem', border: `1.5px solid ${c.borderColor}`, backgroundColor: c.backgroundColor, color: c.color, fontFamily: 'inherit', fontWeight: 700, fontSize: '0.68rem', textAlign: 'center', cursor: court.active ? 'pointer' : 'not-allowed', transition: 'all 0.15s', lineHeight: 1.3 }}
                                  >
                                    <div>{time.split(' - ')[0]}</div>
                                    <div style={{ fontSize: '0.58rem', fontWeight: 500, marginTop: '0.15rem', opacity: 0.85 }}>
                                      {slot?.status === 'booked' ? slot.client.split(' ')[0] : slot?.status === 'blocked' ? '🔒' : 'Libre'}
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
                                      {selectedSlotData.status === 'booked' ? `Cliente: ${selectedSlotData.client}` : selectedSlotData.status === 'blocked' ? 'Bloqueado por administrador' : 'Franja disponible'}
                                    </p>
                                  </div>
                                  <button onClick={() => setActiveSlot(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '0.2rem', fontSize: '1rem', lineHeight: 1 }}>✕</button>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  {selectedSlotData.status === 'available' && (
                                    <>
                                      <button onClick={() => handleAction('reserve')} style={{ padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: 'none', backgroundColor: '#16A34A', color: 'white', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                                        ✓ Reservar (gratis)
                                      </button>
                                      <button onClick={() => handleAction('block')} style={{ padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', color: '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                                        🔒 Bloquear
                                      </button>
                                    </>
                                  )}
                                  {selectedSlotData.status === 'booked' && (
                                    <button onClick={() => handleAction('cancel')} style={{ padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: 'none', backgroundColor: '#DC2626', color: 'white', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                                      ✕ Cancelar reserva
                                    </button>
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
              {activeTab === 'bookings' && (
                <div>
                  <p className="section-label" style={{ marginBottom: '1rem' }}>Reservas activas — {formatDate(selectedDate)}</p>
                  {allBookings.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#94A3B8' }}>
                      <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 0.875rem', display: 'block' }}>
                        <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      <p style={{ fontWeight: 700, margin: 0, color: '#64748B' }}>Sin reservas para esta fecha</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                      {allBookings.map(b => (
                        <div key={`${b.id}-${b.time}`} style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', backgroundColor: 'white', borderRadius: '0.875rem', padding: '0.875rem', border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                          <div style={{ width: '42px', height: '42px', borderRadius: '0.625rem', background: b.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: '1.1rem' }}>{b.sport === 'Pádel' ? '🎾' : '🏓'}</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontWeight: 700, color: '#0F172A', fontSize: '0.875rem' }}>{b.name}</p>
                            <p style={{ margin: '0.1rem 0 0', fontSize: '0.775rem', color: '#64748B' }}>{b.time} · {b.client}</p>
                          </div>
                          <button onClick={() => cancelBooking(b.bookingId)}
                            style={{ padding: '0.4rem 0.75rem', borderRadius: '0.5rem', border: 'none', backgroundColor: '#FEF2F2', color: '#DC2626', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', flexShrink: 0 }}>
                            Cancelar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB: PISTAS ── */}
              {activeTab === 'courts' && (
                <div>
                  <p className="section-label" style={{ marginBottom: '1rem' }}>Gestión de pistas</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {courts.map(court => (
                      <div key={court.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: 'white', borderRadius: '1rem', padding: '1rem', border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
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
                    ))}
                  </div>
                  <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#F0FDF4', borderRadius: '0.875rem', border: '1px solid #86EFAC' }}>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#15803D', fontWeight: 500, lineHeight: 1.55 }}>
                      Las pistas desactivadas no aceptan nuevas reservas. Las reservas existentes se mantienen activas.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default AdminDashboard;
