import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
import { toast, confirmDialog } from '../../utils/notify';

const fmt = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
};

export default function EventsManager() {
  const { user } = useAuth();
  const fileRef = useRef(null);

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notifying, setNotifying] = useState(null);
  const [publishedTournaments, setPublishedTournaments] = useState([]);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [registrationUrl, setRegistrationUrl] = useState('');
  const [linkedTournamentId, setLinkedTournamentId] = useState('');
  const [posterFile, setPosterFile] = useState(null);
  const [posterPreview, setPosterPreview] = useState(null);
  // Encuadre del cartel: focal point (X/Y en %) + zoom (1 = sin zoom).
  // Se persisten en la fila del evento y se aplican como object-position +
  // transform: scale en todas las superficies donde se muestra el cartel.
  const [posterPosX, setPosterPosX] = useState(50);
  const [posterPosY, setPosterPosY] = useState(50);
  const [posterZoom, setPosterZoom] = useState(1);
  const dragStateRef = useRef(null);
  const previewRef = useRef(null);

  useEffect(() => {
    loadEvents();
    supabase.from('tournaments').select('id, name').eq('status', 'open').order('created_at', { ascending: false })
      .then(({ data }) => setPublishedTournaments(data || []));
  }, []);

  const loadEvents = async () => {
    const { data } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false });
    setEvents(data || []);
    setLoading(false);
  };

  const resetForm = () => {
    setTitle(''); setDescription(''); setEventDate(''); setEndDate('');
    setRegistrationUrl(''); setLinkedTournamentId('');
    setPosterFile(null); setPosterPreview(null); setEditingEvent(null);
    setPosterPosX(50); setPosterPosY(50); setPosterZoom(1);
  };

  const openCreate = () => { resetForm(); setShowForm(true); };

  const openEdit = (ev) => {
    setTitle(ev.title); setDescription(ev.description || '');
    setEventDate(ev.event_date || ''); setEndDate(ev.end_date || '');
    setRegistrationUrl(ev.registration_url || '');
    const match = ev.registration_url?.match(/\/torneos\/([^/?]+)/);
    setLinkedTournamentId(match ? match[1] : '');
    setPosterPreview(ev.poster_url || null); setPosterFile(null);
    setPosterPosX(ev.poster_pos_x ?? 50);
    setPosterPosY(ev.poster_pos_y ?? 50);
    setPosterZoom(ev.poster_zoom ?? 1);
    setEditingEvent(ev); setShowForm(true);
  };

  const handleTournamentSelect = (tid) => {
    setLinkedTournamentId(tid);
    setRegistrationUrl(tid ? `/torneos/${tid}` : '');
  };

  const handlePosterChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPosterFile(file);
    setPosterPreview(URL.createObjectURL(file));
    // Reset encuadre al cambiar de imagen — la posición de la anterior no
    // tiene sentido sobre una foto nueva.
    setPosterPosX(50); setPosterPosY(50); setPosterZoom(1);
  };

  // Arrastre del cartel: el admin "agarra" la foto y la mueve para elegir el
  // encuadre. La traducción se convierte a porcentaje del recuadro y se
  // suma/resta al focal point (X/Y) que luego usa object-position. El signo
  // es invertido — arrastrar a la derecha mueve la foto a la derecha → foco
  // se desplaza a la izquierda.
  const handlePosterPointerDown = (e) => {
    if (!posterPreview) return;
    e.preventDefault();
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: posterPosX,
      startPosY: posterPosY,
      width: rect.width,
      height: rect.height,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handlePosterPointerMove = (e) => {
    const st = dragStateRef.current;
    if (!st) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    // Sensibilidad: el rango útil de pos depende del zoom. A mayor zoom,
    // un pixel de drag mueve menos % de la imagen visible.
    const zoom = Math.max(1, posterZoom);
    const sensitivity = 100 / (zoom * Math.max(st.width, 1));
    const sensitivityY = 100 / (zoom * Math.max(st.height, 1));
    const nextX = Math.max(0, Math.min(100, st.startPosX - dx * sensitivity));
    const nextY = Math.max(0, Math.min(100, st.startPosY - dy * sensitivityY));
    setPosterPosX(nextX);
    setPosterPosY(nextY);
  };

  const handlePosterPointerUp = (e) => {
    dragStateRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const uploadPoster = async (eventId) => {
    if (!posterFile) return null;
    const ext = posterFile.name.split('.').pop().toLowerCase();
    const path = `${eventId}.${ext}`;
    const { error } = await supabase.storage
      .from('event-posters')
      .upload(path, posterFile, { upsert: true, contentType: posterFile.type });
    if (error) { console.error('Poster upload error:', error); return null; }
    const { data: { publicUrl } } = supabase.storage.from('event-posters').getPublicUrl(path);
    return publicUrl;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);

    const payload = {
      title: title.trim(),
      description: description.trim(),
      event_date: eventDate || null,
      end_date: endDate || null,
      registration_url: registrationUrl.trim() || null,
      poster_pos_x: Number(posterPosX.toFixed(2)),
      poster_pos_y: Number(posterPosY.toFixed(2)),
      poster_zoom:  Number(posterZoom.toFixed(3)),
    };

    if (editingEvent) {
      const { data, error } = await supabase
        .from('events').update(payload).eq('id', editingEvent.id).select().single();
      if (error) { console.error(error); setSaving(false); return; }
      let posterUrl = editingEvent.poster_url;
      if (posterFile) {
        const up = await uploadPoster(editingEvent.id);
        if (up) {
          posterUrl = up;
          await supabase.from('events').update({ poster_url: posterUrl }).eq('id', editingEvent.id);
        }
      }
      setEvents(prev => prev.map(ev => ev.id === editingEvent.id ? { ...data, poster_url: posterUrl } : ev));
    } else {
      const { data, error } = await supabase
        .from('events').insert({ ...payload, admin_id: user.id, published: false }).select().single();
      if (error) { console.error(error); setSaving(false); return; }
      let posterUrl = null;
      if (posterFile) {
        posterUrl = await uploadPoster(data.id);
        if (posterUrl) await supabase.from('events').update({ poster_url: posterUrl }).eq('id', data.id);
      }
      setEvents(prev => [{ ...data, poster_url: posterUrl }, ...prev]);
    }

    setSaving(false);
    setShowForm(false);
    resetForm();
  };

  const togglePublish = async (ev) => {
    const { data, error } = await supabase
      .from('events').update({ published: !ev.published }).eq('id', ev.id).select().single();
    if (error || !data) {
      console.error('togglePublish error:', error);
      toast('No se pudo actualizar el evento. Verifica que estás logeado como admin y que la migración RLS de events está aplicada en Supabase.', 'error');
      return;
    }
    setEvents(prev => prev.map(e => e.id === data.id ? data : e));
  };

  const notifyPlayers = async (ev) => {
    setNotifying(ev.id);
    try {
      await supabase.functions.invoke('send-push', {
        body: {
          title: `Nuevo evento: ${ev.title}`,
          body: ev.description || '¡Hay un nuevo evento en Padel Medina!',
          url: ev.registration_url || '/perfil',
        },
      });
      toast('Notificación push enviada a todos los jugadores suscritos.');
    } catch (err) {
      console.error(err);
      toast('Error al enviar la notificación.', 'error');
    }
    setNotifying(null);
  };

  const deleteEvent = async (evId) => {
    const ok = await confirmDialog('¿Eliminar este evento? No se puede deshacer.', { title: 'Eliminar evento', okText: 'Eliminar', danger: true });
    if (!ok) return;
    const ev = events.find(e => e.id === evId);

    const { error, count } = await supabase
      .from('events')
      .delete({ count: 'exact' })
      .eq('id', evId);
    if (error) {
      toast('Error al eliminar el evento: ' + error.message);
      return;
    }
    if (count === 0) {
      toast('No se pudo eliminar el evento. Posiblemente lo creó otra sesión de admin y la política RLS lo bloquea. Aplica la migración 20260422_events_admin_full.sql en Supabase.', 'error');
      return;
    }

    // Cartel: borrar solo si la fila se eliminó de verdad
    if (ev?.poster_url) {
      const path = ev.poster_url.split('/event-posters/').pop();
      if (path) await supabase.storage.from('event-posters').remove([decodeURIComponent(path)]);
    }
    setEvents(prev => prev.filter(e => e.id !== evId));
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <p className="section-label" style={{ margin: 0 }}>Eventos y Torneos</p>
        <button
          onClick={openCreate}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.1rem', backgroundColor: '#16A34A', color: 'white', border: 'none', borderRadius: '0.75rem', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo evento
        </button>
      </div>

      {/* ── Form modal ── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '1.25rem', width: '100%', maxWidth: '560px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', marginTop: '2rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid #E2E8F0' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
                {editingEvent ? 'Editar evento' : 'Nuevo evento'}
              </h3>
              <button onClick={() => { setShowForm(false); resetForm(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '1.4rem', lineHeight: 1, padding: '0.2rem' }}>✕</button>
            </div>

            <form onSubmit={handleSave} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>

              {/* Poster upload + encuadre (drag para mover, slider para zoom) */}
              <div>
                <label style={labelStyle}>Cartel / Imagen</label>
                {!posterPreview ? (
                  <div
                    onClick={() => fileRef.current?.click()}
                    style={{
                      border: '2px dashed #CBD5E1',
                      borderRadius: '1rem',
                      cursor: 'pointer',
                      backgroundColor: '#F8FAFC',
                      minHeight: '120px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94A3B8' }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 0.5rem', display: 'block' }}>
                        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                      </svg>
                      <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>Subir cartel del evento</p>
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem' }}>JPG, PNG, WebP — máx. 5 MB</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      ref={previewRef}
                      onPointerDown={handlePosterPointerDown}
                      onPointerMove={handlePosterPointerMove}
                      onPointerUp={handlePosterPointerUp}
                      onPointerCancel={handlePosterPointerUp}
                      style={{
                        position: 'relative',
                        width: '100%',
                        aspectRatio: '220 / 130',
                        borderRadius: '1rem',
                        overflow: 'hidden',
                        backgroundColor: '#0F172A',
                        cursor: dragStateRef.current ? 'grabbing' : 'grab',
                        touchAction: 'none',
                        userSelect: 'none',
                        border: '2px solid #16A34A',
                      }}
                    >
                      <img
                        src={posterPreview}
                        alt="Cartel"
                        draggable={false}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          objectPosition: `${posterPosX}% ${posterPosY}%`,
                          transform: `scale(${posterZoom})`,
                          transformOrigin: `${posterPosX}% ${posterPosY}%`,
                          pointerEvents: 'none',
                          display: 'block',
                        }}
                      />
                      <div style={{ position: 'absolute', top: '0.5rem', left: '0.5rem', background: 'rgba(15,23,42,0.7)', color: 'white', fontSize: '0.65rem', fontWeight: 700, padding: '0.25rem 0.55rem', borderRadius: '0.4rem', pointerEvents: 'none' }}>
                        Arrastra para encuadrar
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.6rem' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', minWidth: '46px' }}>Zoom</span>
                      <input
                        type="range"
                        min="1"
                        max="3"
                        step="0.05"
                        value={posterZoom}
                        onChange={e => setPosterZoom(parseFloat(e.target.value))}
                        style={{ flex: 1 }}
                      />
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', minWidth: '38px', textAlign: 'right' }}>{Math.round(posterZoom * 100)}%</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        style={{ padding: '0.4rem 0.9rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', background: 'white', color: '#475569', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}
                      >
                        ✎ Cambiar imagen
                      </button>
                      <button
                        type="button"
                        onClick={() => { setPosterPosX(50); setPosterPosY(50); setPosterZoom(1); }}
                        style={{ padding: '0.4rem 0.9rem', borderRadius: '0.5rem', border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#64748B', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}
                      >
                        ↺ Restablecer encuadre
                      </button>
                    </div>
                  </>
                )}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }} onChange={handlePosterChange} />
              </div>

              <div>
                <label style={labelStyle}>Título *</label>
                <input
                  type="text" required value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="Ej: Torneo Primavera 2026"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Descripción</label>
                <textarea
                  value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Detalles del evento, categorías, premios…"
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={labelStyle}>Fecha inicio</label>
                  <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Fecha fin</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Inscripción — torneo vinculado</label>
                {publishedTournaments.length > 0 ? (
                  <select
                    value={linkedTournamentId}
                    onChange={e => handleTournamentSelect(e.target.value)}
                    style={{ ...inputStyle, cursor: 'pointer', backgroundColor: '#F8FAFC' }}
                  >
                    <option value="">— Sin inscripción (solo informativo) —</option>
                    {publishedTournaments.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                ) : (
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#94A3B8', padding: '0.75rem', border: '1.5px dashed #E2E8F0', borderRadius: '0.625rem' }}>
                    No hay torneos publicados. Publícalos primero desde la pestaña <strong>Torneos</strong>.
                  </p>
                )}
                {registrationUrl && (
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.72rem', color: '#16A34A', fontWeight: 600 }}>
                    ✓ Link: {window.location.origin}{registrationUrl}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                <button type="button" onClick={() => { setShowForm(false); resetForm(); }} style={{ padding: '0.7rem 1.25rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', background: 'white', color: '#475569', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving} style={{ padding: '0.7rem 1.5rem', borderRadius: '0.75rem', border: 'none', backgroundColor: '#16A34A', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Guardando…' : (editingEvent ? 'Guardar cambios' : 'Crear evento')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Event list ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94A3B8' }}>Cargando eventos…</div>
      ) : events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94A3B8', border: '2px dashed #E2E8F0', borderRadius: '1.25rem' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 1rem', display: 'block' }}>
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
          </svg>
          <p style={{ fontWeight: 700, color: '#64748B', margin: '0 0 0.25rem' }}>Sin eventos todavía</p>
          <p style={{ fontSize: '0.85rem', margin: 0 }}>Crea el primer evento con el botón de arriba.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {events.map(ev => (
            <div key={ev.id} style={{ backgroundColor: 'white', borderRadius: '1.25rem', border: `1.5px solid ${ev.published ? '#BBF7D0' : '#E2E8F0'}`, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', gap: 0 }}>
                {/* Poster thumbnail (respeta encuadre del admin) */}
                <div style={{ width: '110px', flexShrink: 0, position: 'relative', overflow: 'hidden', background: ev.poster_url ? '#0F172A' : 'linear-gradient(135deg,#16A34A,#059669)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {ev.poster_url ? (
                    <img
                      src={ev.poster_url}
                      alt={ev.title}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        objectPosition: `${ev.poster_pos_x ?? 50}% ${ev.poster_pos_y ?? 50}%`,
                        transform: `scale(${ev.poster_zoom ?? 1})`,
                        transformOrigin: `${ev.poster_pos_x ?? 50}% ${ev.poster_pos_y ?? 50}%`,
                        display: 'block',
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: '2.5rem' }}>🎾</span>
                  )}
                </div>
                {/* Content */}
                <div style={{ flex: 1, padding: '1rem 1.1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.3 }}>{ev.title}</h4>
                    <span style={{ flexShrink: 0, fontSize: '0.65rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '999px', backgroundColor: ev.published ? '#DCFCE7' : '#F1F5F9', color: ev.published ? '#15803D' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {ev.published ? 'Publicado' : 'Borrador'}
                    </span>
                  </div>
                  {(ev.event_date || ev.end_date) && (
                    <p style={{ margin: '0 0 0.35rem', fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>
                      📅 {fmt(ev.event_date)}{ev.end_date && ev.end_date !== ev.event_date ? ` — ${fmt(ev.end_date)}` : ''}
                    </p>
                  )}
                  {ev.description && (
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', color: '#64748B', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {ev.description}
                    </p>
                  )}
                  {ev.registration_url && (
                    <a href={ev.registration_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.72rem', color: '#2563EB', fontWeight: 600, wordBreak: 'break-all' }}>
                      🔗 {ev.registration_url}
                    </a>
                  )}
                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => togglePublish(ev)}
                      style={{ padding: '0.35rem 0.8rem', borderRadius: '0.5rem', border: `1.5px solid ${ev.published ? '#FED7AA' : '#BBF7D0'}`, backgroundColor: ev.published ? '#FFF7ED' : '#F0FDF4', color: ev.published ? '#9A3412' : '#15803D', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}
                    >
                      {ev.published ? 'Despublicar' : '✓ Publicar'}
                    </button>
                    {ev.published && (
                      <button
                        onClick={() => notifyPlayers(ev)}
                        disabled={notifying === ev.id}
                        style={{ padding: '0.35rem 0.8rem', borderRadius: '0.5rem', border: '1.5px solid #BFDBFE', backgroundColor: '#EFF6FF', color: '#1D4ED8', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', opacity: notifying === ev.id ? 0.6 : 1 }}
                      >
                        {notifying === ev.id ? 'Enviando…' : '🔔 Notificar jugadores'}
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(ev)}
                      style={{ padding: '0.35rem 0.8rem', borderRadius: '0.5rem', border: '1.5px solid #E2E8F0', backgroundColor: 'white', color: '#475569', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}
                    >
                      ✎ Editar
                    </button>
                    <button
                      onClick={() => deleteEvent(ev.id)}
                      style={{ padding: '0.35rem 0.8rem', borderRadius: '0.5rem', border: '1.5px solid #FECACA', backgroundColor: '#FEF2F2', color: '#DC2626', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' };
const inputStyle = { width: '100%', padding: '0.75rem 0.875rem', borderRadius: '0.625rem', border: '1.5px solid #CBD5E1', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none' };
