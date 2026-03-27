import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const HOURS = [
  '00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', 
  '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'
];

export default function TournamentRegistration() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Form State
  const [cat, setCat] = useState('');
  const [p1Name, setP1Name] = useState('');
  const [p1Email, setP1Email] = useState('');
  const [p1Phone, setP1Phone] = useState('');
  const [p2Name, setP2Name] = useState('');
  const [p2Email, setP2Email] = useState('');
  const [p2Phone, setP2Phone] = useState('');
  
  // Unavailable blocks
  const [unavailableTimes, setUnavailableTimes] = useState([]);
  const [selectedDay, setSelectedDay] = useState('');
  const [startHour, setStartHour] = useState('');
  const [endHour, setEndHour] = useState('');

  useEffect(() => {
    const fetchTournament = async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', id)
        .eq('status', 'open')
        .single();
      
      if (error || !data) {
        setError("Este torneo no existe o ya ha cerrado inscripciones.");
      } else {
        setTournament(data);
        const categories = data.config?.categories?.split(',').map(c => c.trim()).filter(Boolean) || [];
        setCat(categories[0] || '');
        setSelectedDay(data.config?.startDay || '');
        setStartHour(data.config?.startHour || '');
        setEndHour(HOURS[HOURS.indexOf(data.config?.startHour || '09:00') + 1] || '22:00');
      }
      setLoading(false);
    };
    fetchTournament();
  }, [id]);

  const activeDays = (() => {
    if (!tournament) return DAYS;
    const tConfig = tournament.config;
    const sIdx = DAYS.indexOf(tConfig.startDay);
    const eIdx = DAYS.indexOf(tConfig.endDay);
    if (sIdx <= eIdx) return DAYS.slice(sIdx, eIdx + 1);
    return [...DAYS.slice(sIdx), ...DAYS.slice(0, eIdx + 1)];
  })();

  const activeHours = (() => {
    if (!tournament) return HOURS;
    const tConfig = tournament.config;
    const isFirstDay = selectedDay === tConfig.startDay;
    const startHourStr = isFirstDay && tConfig.firstDayStartHour ? tConfig.firstDayStartHour : tConfig.startHour;
    const sIdx = HOURS.indexOf(startHourStr);
    const eIdx = HOURS.indexOf(tConfig.endHour);
    if (sIdx <= eIdx) return HOURS.slice(sIdx, eIdx + 1);
    return HOURS;
  })();

  const addUnavailableTime = () => {
    if (!selectedDay || !startHour || !endHour) return;
    const startIndex = HOURS.indexOf(startHour);
    const endIndex = HOURS.indexOf(endHour);
    
    if (startIndex >= endIndex) {
      alert("La hora de fin debe ser posterior a la de inicio.");
      return;
    }

    const rangeSlots = HOURS.slice(startIndex, endIndex).map(h => `${selectedDay} ${h}`);
    
    setUnavailableTimes([
      ...unavailableTimes, 
      { id: Date.now().toString(), day: selectedDay, label: `${selectedDay} de ${startHour} a ${endHour}`, slots: rangeSlots }
    ]);
  };

  const removeUnavailableTime = (tid) => {
    setUnavailableTimes(prev => prev.filter(p => p.id !== tid));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!p1Name || !p2Name || !cat) {
      alert("Introduce el nombre de ambos jugadores y la categoría.");
      return;
    }
    
    setLoading(true);
    const { error: insError } = await supabase
      .from('tournament_registrations')
      .insert({
        tournament_id: id,
        category: cat,
        player1_name: p1Name,
        player1_email: p1Email,
        player1_phone: p1Phone,
        player2_name: p2Name,
        player2_email: p2Email,
        player2_phone: p2Phone,
        unavailable_times: unavailableTimes
      });
      
    if (insError) {
      alert("Hubo un error al registrarte. Vuelve a intentarlo.");
      console.error(insError);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid #E2E8F0', borderTopColor: '#0F172A', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' }}>
         <div style={{ backgroundColor: 'white', padding: '3rem', borderRadius: '1.5rem', textAlign: 'center', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
            <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>😢</span>
            <h1 style={{ margin: '0 0 1rem', fontSize: '1.5rem', fontWeight: 800 }}>Ups...</h1>
            <p style={{ color: '#64748B' }}>{error}</p>
            <button onClick={() => navigate('/')} style={{ marginTop: '1.5rem', padding: '0.75rem 1.5rem', backgroundColor: '#0F172A', color: 'white', border: 'none', borderRadius: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
                Volver a Padel Medina
            </button>
         </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0FDF4' }}>
         <div style={{ backgroundColor: 'white', padding: '3rem', borderRadius: '1.5rem', textAlign: 'center', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', maxWidth: '400px' }}>
            <div style={{ width: '64px', height: '64px', backgroundColor: '#DCFCE7', color: '#16A34A', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', fontSize: '2rem' }}>
              ✓
            </div>
            <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', fontWeight: 900, color: '#0F172A' }}>¡Inscripción Confirmada!</h1>
            <p style={{ color: '#475569', marginBottom: '2rem', lineHeight: '1.5' }}>
              Nos vemos en el pista. El club se pondrá en contacto contigo para los horarios del cuadro.
            </p>
            <button onClick={() => navigate('/')} style={{ width: '100%', padding: '0.875rem', backgroundColor: '#16A34A', color: 'white', border: 'none', borderRadius: '0.75rem', fontWeight: 700, cursor: 'pointer', fontSize: '1rem' }}>
                Ir a Padel Medina
            </button>
         </div>
      </div>
    );
  }

  const categories = tournament.config.categories.split(',').map(c => c.trim()).filter(Boolean);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', padding: '2rem 1rem' }}>
      <main style={{ maxWidth: '600px', margin: '0 auto', backgroundColor: 'white', padding: '2rem', borderRadius: '1.5rem', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)' }}>
        
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ display: 'inline-block', padding: '0.5rem 1rem', backgroundColor: '#EFF6FF', color: '#2563EB', fontWeight: 800, borderRadius: '2rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Inscripción Abierta
          </div>
          <h1 style={{ margin: '0 0 0.5rem', fontSize: '2rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.03em' }}>
            {tournament.name}
          </h1>
          <p style={{ margin: 0, color: '#64748B', fontWeight: 500 }}>
            Rellena los datos de tu pareja para apuntaros al torneo.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Categoría */}
          <section>
            <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: '24px', height: '24px', backgroundColor: '#0F172A', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>1</span>
              Categoría
            </h2>
            <select 
              value={cat} 
              onChange={e => setCat(e.target.value)}
              style={{ width: '100%', padding: '1rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', fontSize: '1rem', outline: 'none', backgroundColor: '#F8FAFC', cursor: 'pointer' }}
              required
            >
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </section>

          {/* Jugador 1 */}
          <section>
             <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: '24px', height: '24px', backgroundColor: '#0F172A', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>2</span>
              Jugador 1
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <input type="text" required placeholder="Nombre Completo" value={p1Name} onChange={e => setP1Name(e.target.value)} style={{ padding: '0.875rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', width: '100%', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <input type="email" placeholder="Correo (Opcional)" value={p1Email} onChange={e => setP1Email(e.target.value)} style={{ flex: '1 1 150px', padding: '0.875rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', boxSizing: 'border-box' }} />
                <input type="tel" placeholder="Teléfono" value={p1Phone} onChange={e => setP1Phone(e.target.value)} style={{ flex: '1 1 150px', padding: '0.875rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', boxSizing: 'border-box' }} />
              </div>
            </div>
          </section>

          {/* Jugador 2 */}
          <section>
             <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: '24px', height: '24px', backgroundColor: '#0F172A', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>3</span>
              Jugador 2
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <input type="text" required placeholder="Nombre Completo" value={p2Name} onChange={e => setP2Name(e.target.value)} style={{ padding: '0.875rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', width: '100%', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <input type="email" placeholder="Correo (Opcional)" value={p2Email} onChange={e => setP2Email(e.target.value)} style={{ flex: '1 1 150px', padding: '0.875rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', boxSizing: 'border-box' }} />
                <input type="tel" placeholder="Teléfono" value={p2Phone} onChange={e => setP2Phone(e.target.value)} style={{ flex: '1 1 150px', padding: '0.875rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', boxSizing: 'border-box' }} />
              </div>
            </div>
          </section>

          {/* Restricciones horarias */}
          <section>
             <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: '24px', height: '24px', backgroundColor: '#0F172A', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>4</span>
              Horas de NO disponibilidad
            </h2>
            <div style={{ backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: '1rem', border: '1px solid #E2E8F0' }}>
              <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#64748B' }}>Añade qué días y a qué horas <strong>NO podéis jugar</strong> por trabajo u otros motivos.</p>
              
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <select value={selectedDay} onChange={e => setSelectedDay(e.target.value)} style={{ flex: '1 1 120px', padding: '0.6rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', fontSize: '0.85rem', cursor: 'pointer', boxSizing: 'border-box' }}>
                  <option value="">-- Día --</option>
                  {activeDays.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flex: '2 1 200px' }}>
                  <span style={{ fontSize: '0.85rem', color: '#64748B' }}>de</span>
                  <select value={startHour} onChange={e => setStartHour(e.target.value)} style={{ flex: 1, padding: '0.6rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', fontSize: '0.85rem', cursor: 'pointer', boxSizing: 'border-box' }}>
                    <option value="">-- H --</option>
                    {activeHours.slice(0, activeHours.length - 1).map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <span style={{ fontSize: '0.85rem', color: '#64748B' }}>a</span>
                  <select value={endHour} onChange={e => setEndHour(e.target.value)} style={{ flex: 1, padding: '0.6rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', fontSize: '0.85rem', cursor: 'pointer', boxSizing: 'border-box' }}>
                    <option value="">-- H --</option>
                    {activeHours.slice(activeHours.indexOf(startHour) + 1).map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <button type="button" onClick={addUnavailableTime} style={{ flex: '1 1 100%', padding: '0.75rem', backgroundColor: '#3B82F6', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 600, cursor: 'pointer', marginTop: '0.5rem' }}>
                  Añadir Horario
                </button>
              </div>

              {unavailableTimes.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {unavailableTimes.map(pref => (
                     <div key={pref.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', backgroundColor: '#FFF0F2', border: '1px solid #FFE4E6', borderRadius: '0.5rem', fontSize: '0.85rem', color: '#BE123C', fontWeight: 600 }}>
                       <span>🚫 No disponible {pref.label}</span>
                       <button type="button" onClick={() => removeUnavailableTime(pref.id)} style={{ background: 'none', border: 'none', color: '#BE123C', cursor: 'pointer', fontSize: '1rem', padding: 0 }}>×</button>
                     </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <button type="submit" disabled={loading} style={{ width: '100%', padding: '1rem', borderRadius: '1rem', border: 'none', backgroundColor: '#0F172A', color: 'white', fontWeight: 800, fontSize: '1.1rem', cursor: loading ? 'not-allowed' : 'pointer', marginTop: '1rem' }}>
            {loading ? 'Procesando...' : 'Inscribirse al Torneo'}
          </button>
        </form>
      </main>
    </div>
  );
}
