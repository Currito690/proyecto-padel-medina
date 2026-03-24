import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import TournamentManager from '../components/admin/TournamentManager';

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

const UserDirectoryTab = ({ supabase, allUsers, setAllUsers }) => {
  const [search, setSearch] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    async function load() {
      setLoadingUsers(true);
      const { data } = await supabase.from('profiles').select('id, name, email, phone, role').order('name');
      setAllUsers(data || []);
      setLoadingUsers(false);
    }
    if (allUsers.length === 0) load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr 0.5fr', gap: '0.5rem', padding: '0.4rem 1rem', borderRadius: '0.5rem', backgroundColor: '#F8FAFC' }}>
            {['Nombre', 'Email', 'Teléfono', 'Rol'].map(h => (
              <span key={h} style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
            ))}
          </div>
          {filtered.map(u => (
            <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr 0.5fr', gap: '0.5rem', padding: '0.75rem 1rem', backgroundColor: 'white', borderRadius: '0.75rem', border: '1px solid #E2E8F0', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name || '—'}</span>
              <span style={{ color: '#475569', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email || '—'}</span>
              <span style={{ color: '#475569', fontSize: '0.8rem' }}>{u.phone || '—'}</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '999px', backgroundColor: u.role === 'admin' ? '#FEF9C3' : '#F0FDF4', color: u.role === 'admin' ? '#92400E' : '#15803D', textAlign: 'center', textTransform: 'uppercase' }}>{u.role || 'cliente'}</span>
            </div>
          ))}
          <p style={{ color: '#94A3B8', fontSize: '0.78rem', textAlign: 'right', marginTop: '0.25rem' }}>{filtered.length} jugadores</p>
        </div>
      )}
    </div>
  );
};

const AdminDashboard = () => {

  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('schedule');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [siteSettings, setSiteSettings] = useState({ booking_window_days: 7, court_price: 18.00 });
  const [financialStats, setFinancialStats] = useState({ total: 0, month: 0, today: 0, totalBookings: 0 });
  const [savingSettings, setSavingSettings] = useState(false);
  // slots_release_time default from DB, fallback 00:00
  if (!siteSettings.slots_release_time) siteSettings.slots_release_time = '00:00';
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [courts, setCourts] = useState([]);
  const [slots, setSlots] = useState({});
  const [activeSlot, setActiveSlot] = useState(null);
  const [loading, setLoading] = useState(true);
  const courtsRef = useRef([]);
  const [allUsers, setAllUsers] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [showUserPicker, setShowUserPicker] = useState(false);

  const loadSlots = useCallback(async (date) => {
    const [resBookings, resBlocked] = await Promise.all([
      supabase.from('bookings').select('*').eq('date', date).eq('status', 'confirmed'),
      supabase.from('blocked_slots').select('*').eq('date', date),
    ]);

    if (resBookings.error) {
      console.error('Error cargando reservas:', resBookings.error);
      alert('Error cargando reservas de BD: ' + resBookings.error.message);
    }

    let bookings = resBookings.data || [];
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
  }, []);

  // Carga inicial: siempre llama a setLoading(false) pase lo que pase
  useEffect(() => {
    async function init() {
      try {
        // Cargar ajustes globales
        const { data: settingsData } = await supabase.from('site_settings').select('*').single();
        if (settingsData) {
          setSiteSettings({
            booking_window_days: settingsData.booking_window_days,
            court_price: parseFloat(settingsData.court_price)
          });
        }

        const currentPrice = settingsData ? parseFloat(settingsData.court_price) : 18;

        // Cargar datos financieros (todas las reservas de pago)
        const now = new Date();
        const yyyyMm = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        const todayStr = yyyyMm + '-' + String(now.getDate()).padStart(2, '0');
        
        const { data: allConfirmed } = await supabase.from('bookings').select('date, is_free').eq('status', 'confirmed');
        if (allConfirmed) {
          const paidBookings = allConfirmed.filter(b => !b.is_free);
          let monthCount = 0;
          let todayCount = 0;
          paidBookings.forEach(b => {
            if (b.date === todayStr) todayCount++;
            if (b.date.startsWith(yyyyMm)) monthCount++;
          });
          setFinancialStats({
            total: paidBookings.length * currentPrice,
            month: monthCount * currentPrice,
            today: todayCount * currentPrice,
            totalBookings: paidBookings.length
          });
        }

        const { data } = await supabase.from('courts').select('*').order('name');
        const loaded = data || [];
        courtsRef.current = loaded;
        setCourts(loaded);
        if (loaded.length > 0) await loadSlots(selectedDate);
      } finally {
        setLoading(false);
      }
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recarga slots cuando cambia la fecha
  useEffect(() => {
    if (courtsRef.current.length > 0) loadSlots(selectedDate);
  }, [selectedDate, loadSlots]);

  const [isProcessing, setIsProcessing] = useState(false);

  const handleAction = async (action) => {
    if (isProcessing) return;
    setIsProcessing(true);
    const { courtId, time } = activeSlot;
    const slot = slots[courtId]?.[time];
    let actionError = null;

    if (action === 'reserve') {
      const bookUserId = selectedUserId || user.id;
      const { error } = await supabase.from('bookings').insert({ court_id: courtId, user_id: bookUserId, date: selectedDate, time_slot: time, status: 'confirmed', is_free: true });
      actionError = error;
      setSelectedUserId(null);
      setShowUserPicker(false);
    } else if (action === 'block') {
      const { error } = await supabase.from('blocked_slots').insert({ court_id: courtId, date: selectedDate, time_slot: time, created_by: user.id });
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
      alert('Error en base de datos: ' + actionError.message + (actionError.details ? ' - ' + actionError.details : ''));
    }

    setActiveSlot(null);
    await loadSlots(selectedDate);
    setIsProcessing(false);
  };

  const cancelBooking = async (bookingId) => {
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId);
    await loadSlots(selectedDate);
  };

  const toggleCourt = async (courtId) => {
    const court = courts.find(c => c.id === courtId);
    await supabase.from('courts').update({ active: !court.active }).eq('id', courtId);
    const updated = courts.map(c => c.id === courtId ? { ...c, active: !c.active } : c);
    courtsRef.current = updated;
    setCourts(updated);
  };

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
    setActiveSlot(null);
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    const { error } = await supabase.from('site_settings').update({
      booking_window_days: parseInt(siteSettings.booking_window_days, 10),
      court_price: parseFloat(siteSettings.court_price),
      slots_release_time: siteSettings.slots_release_time || '00:00'
    }).eq('id', 1);
    
    setSavingSettings(false);
    if (error) {
      console.error(error);
      alert('Error al guardar configuración: ' + error.message);
    } else {
      alert('Ajustes guardados correctamente. Los cambios ya son visibles para los clientes.');
    }
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

  const menuItems = [
    { key: 'schedule', label: 'Horario', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { key: 'bookings', label: `Reservas (${allBookings.length})`, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> },
    { key: 'courts', label: 'Pistas', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="10"/><path d="M12 2 Q16 6 16 12 Q16 18 12 22"/><path d="M12 2 Q8 6 8 12 Q8 18 12 22"/><line x1="2" y1="12" x2="22" y2="12"/></svg> },
    { key: 'users', label: 'Jugadores', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { key: 'tournaments', label: 'Torneos', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg> },
    { key: 'finance', label: 'Finanzas', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
    { key: 'settings', label: 'Configuración', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/><circle cx="12" cy="12" r="3"/></svg> },
  ];

  return (
    <>
      <style>{`
        .admin-layout { display: flex; min-height: 100vh; background: var(--color-bg-secondary); }
        .admin-sidebar { 
          width: 280px; background: white; border-right: 1px solid var(--color-border);
          display: flex; flex-direction: column; position: fixed; top: 0; bottom: 0; left: 0; z-index: 50;
          transform: translateX(-100%); transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .admin-sidebar.open { transform: translateX(0); }
        .sidebar-overlay { 
          position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 40;
          opacity: 0; pointer-events: none; transition: opacity 0.3s;
        }
        .sidebar-overlay.open { opacity: 1; pointer-events: auto; }
        
        .admin-main { flex: 1; display: flex; flex-direction: column; width: 100%; min-height: 100vh; }
        .admin-header { background: white; border-bottom: 1px solid var(--color-border); padding: 0.875rem 1.25rem; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 10; box-shadow: var(--shadow-sm); }
        .admin-body { flex: 1; padding: 1.5rem 1.25rem; max-width: 1060px; margin: 0 auto; width: 100%; }
        
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
        .slots-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.4rem; margin-bottom: 0.625rem; }
        
        @media (min-width: 480px) { .slots-grid { grid-template-columns: repeat(7, 1fr); } }
        @media (min-width: 1024px) { 
          .admin-sidebar { transform: translateX(0); position: sticky; height: 100vh; }
          .sidebar-overlay { display: none; }
          .menu-toggle { display: none; }
          .admin-header { padding: 1.25rem 2rem; }
          .admin-body { padding: 2rem; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      
      <div className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} onClick={() => setIsSidebarOpen(false)} />

      <div className="admin-layout">
        {/* Sidebar */}
        <aside className={`admin-sidebar ${isSidebarOpen ? 'open' : ''}`}>
          <div style={{ padding: '1.5rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '0.75rem', background: 'linear-gradient(135deg, #16A34A, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
              </svg>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '0.65rem', fontWeight: 800, color: '#16A34A', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Panel Admin</p>
              <p style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>Padel Medina</p>
            </div>
            {/* Close button on mobile */}
            <button className="menu-toggle" onClick={() => setIsSidebarOpen(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', color: '#64748B' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          <div style={{ padding: '1.25rem 1rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ margin: '0 0 0.5rem 0.5rem', fontSize: '0.75rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Menú Principal</p>
            
            {menuItems.map(item => {
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => { setActiveTab(item.key); setIsSidebarOpen(false); }}
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
            <button onClick={logout} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.875rem', border: '1.5px solid #E2E8F0', borderRadius: '0.75rem', background: 'white', color: '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              Cerrar Sesión
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <div className="admin-main">
          {/* Header Only on Mobile/Tablet */}
          <div className="admin-header menu-toggle">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button aria-label="Abrir panel" onClick={() => setIsSidebarOpen(true)} style={{ padding: '0.5rem', border: '1.5px solid #E2E8F0', borderRadius: '0.5rem', background: 'white', color: '#0F172A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
              </button>
              <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '1.1rem', letterSpacing: '-0.02em' }}>
                {menuItems.find(m => m.key === activeTab)?.label.split(' (')[0]}
              </span>
            </div>
            <div style={{ width: '32px', height: '32px', borderRadius: '0.5rem', background: 'linear-gradient(135deg, #16A34A, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></svg>
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
                                          <button onClick={() => handleAction('block')} style={{ padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', backgroundColor: 'white', color: '#475569', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                                            🔒 Bloquear
                                          </button>
                                        </div>
                                      )}
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

              {/* ── TAB: FINANZAS ── */}
              {activeTab === 'finance' && (
                <div>
                  <p className="section-label" style={{ marginBottom: '1.5rem' }}>Resumen Financiero</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                    <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '1.25rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                      <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ingresos Hoy</p>
                      <p style={{ margin: 0, fontSize: '2.5rem', fontWeight: 900, color: '#16A34A', letterSpacing: '-0.03em' }}>{financialStats.today.toFixed(2)} €</p>
                    </div>
                    <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '1.25rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                      <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ingresos Este Mes</p>
                      <p style={{ margin: 0, fontSize: '2.5rem', fontWeight: 900, color: '#0EA5E9', letterSpacing: '-0.03em' }}>{financialStats.month.toFixed(2)} €</p>
                    </div>
                    <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '1.25rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                      <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ingresos Totales (Histórico)</p>
                      <p style={{ margin: 0, fontSize: '2.5rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.03em' }}>{financialStats.total.toFixed(2)} €</p>
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#94A3B8' }}>En {financialStats.totalBookings} reservas de pago</p>
                    </div>
                  </div>
                </div>
              )}

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
                        Los clientes no podrán ver ni reservar pistas hasta que llegue esta hora cada día. Por ejemplo, <strong>08:00</strong> significa que las pistas se desbloquean a las 8 de la mañana. Pon <strong>00:00</strong> para que siempre estén disponibles.
                      </p>
                      <input
                        type="time"
                        value={siteSettings.slots_release_time || '00:00'}
                        onChange={(e) => setSiteSettings({...siteSettings, slots_release_time: e.target.value})}
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '1rem', fontWeight: 600, color: '#0F172A' }}
                      />
                    </div>

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

            </>
          )}
        </div>
      </div>
    </div>
  </>
);
};

export default AdminDashboard;
