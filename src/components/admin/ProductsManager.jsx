import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../../services/supabase';
import { toast, confirmDialog } from '../../utils/notify';

// Gestión de catálogo de la tienda: productos, variantes (talla/color con
// stock propio), categorías e imágenes. Sigue el patrón de EventsManager
// (CRUD contra Supabase, estilos inline, toast/confirmDialog). Las imágenes
// se optimizan en el cliente (resize + WebP) antes de subir al bucket
// 'product-images', así no dependemos de la transformación de Supabase (Pro).

const BUCKET = 'product-images';
const LOW_STOCK = 5;

// ── helpers ──────────────────────────────────────────────────────────────────
const slugify = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const eurToCents = (str) => {
  if (str === '' || str === null || str === undefined) return null;
  const n = Number(String(str).replace(',', '.').trim());
  if (!isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};

const centsToEur = (c) =>
  c === null || c === undefined ? '' : (c / 100).toFixed(2).replace('.', ',');

const fmtEur = (c) =>
  c === null || c === undefined
    ? '—'
    : (c / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const imgUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
};

const totalStockOf = (p) => (p.product_variants || []).reduce((s, v) => s + (v.stock || 0), 0);

// Redimensiona a maxW y convierte a WebP en el navegador (sin plan Pro).
async function optimizeImage(file, maxW = 1280, quality = 0.82) {
  const dataUrl = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img = await new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = dataUrl;
  });
  const scale = Math.min(1, maxW / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return await new Promise((res) => canvas.toBlob(res, 'image/webp', quality));
}

const emptyVariant = () => ({
  _key: crypto.randomUUID(),
  id: null,
  nombre: '',
  talla: '',
  color: '',
  sku: '',
  precioEur: '',
  stock: '0',
  activo: true,
});

export default function ProductsManager() {
  const fileRef = useRef(null);

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // filtros
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'); // all | active | inactive | agotado | low | oferta | destacado
  const [sortBy, setSortBy] = useState('orden'); // orden | nombre | precio-asc | precio-desc | stock

  // form
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showCats, setShowCats] = useState(false);

  // form fields
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [precioEur, setPrecioEur] = useState('');
  const [ofertaEur, setOfertaEur] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [activo, setActivo] = useState(true);
  const [destacado, setDestacado] = useState(false);
  const [hasVariants, setHasVariants] = useState(false);
  const [variants, setVariants] = useState([emptyVariant()]);
  const [existingImages, setExistingImages] = useState([]); // {id, ruta_imagen, _delete}
  const [newImages, setNewImages] = useState([]); // {key, file, preview}
  const [principalKey, setPrincipalKey] = useState(null); // image id | `new:<key>`

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    const [{ data: prods }, { data: cats }] = await Promise.all([
      supabase
        .from('products')
        .select('*, categoria:categories(id,nombre), product_variants(id,nombre,talla,color,sku,precio_centimos,stock,activo,orden), product_images(id,ruta_imagen,es_principal,orden)')
        .order('orden', { ascending: true })
        .order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('orden', { ascending: true }).order('nombre'),
    ]);
    setProducts(prods || []);
    setCategories(cats || []);
    setLoading(false);
  };

  const resetForm = () => {
    setNombre(''); setDescripcion(''); setPrecioEur(''); setOfertaEur('');
    setCategoriaId(''); setActivo(true); setDestacado(false);
    setHasVariants(false); setVariants([emptyVariant()]);
    setExistingImages([]); setNewImages([]); setPrincipalKey(null);
    setEditing(null);
  };

  const openCreate = () => { resetForm(); setShowForm(true); };

  const openEdit = (p) => {
    setEditing(p);
    setNombre(p.nombre || '');
    setDescripcion(p.descripcion || '');
    setPrecioEur(centsToEur(p.precio_centimos));
    setOfertaEur(centsToEur(p.precio_oferta_centimos));
    setCategoriaId(p.categoria_id || '');
    setActivo(p.activo);
    setDestacado(p.destacado);

    const vs = (p.product_variants || []).slice().sort((a, b) => (a.orden || 0) - (b.orden || 0));
    const multi = vs.length > 1 || vs.some(v => v.talla || v.color || (v.nombre && v.nombre !== 'Única'));
    setHasVariants(multi);
    setVariants(
      vs.length
        ? vs.map(v => ({
            _key: crypto.randomUUID(), id: v.id, nombre: v.nombre || '', talla: v.talla || '',
            color: v.color || '', sku: v.sku || '', precioEur: centsToEur(v.precio_centimos),
            stock: String(v.stock ?? 0), activo: v.activo,
          }))
        : [emptyVariant()]
    );

    const imgs = (p.product_images || []).slice().sort((a, b) => (a.orden || 0) - (b.orden || 0));
    setExistingImages(imgs.map(i => ({ ...i, _delete: false })));
    setNewImages([]);
    const principal = imgs.find(i => i.es_principal) || imgs[0];
    setPrincipalKey(principal ? principal.id : null);

    setShowForm(true);
  };

  // ── variants ───────────────────────────────────────────────────────────────
  const updateVariant = (key, patch) =>
    setVariants(prev => prev.map(v => (v._key === key ? { ...v, ...patch } : v)));
  const addVariant = () => setVariants(prev => [...prev, emptyVariant()]);
  const removeVariant = (key) =>
    setVariants(prev => (prev.length <= 1 ? prev : prev.filter(v => v._key !== key)));

  // ── images ───────────────────────────────────────────────────────────────
  const addFiles = (fileList) => {
    const files = Array.from(fileList || []);
    const accepted = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const valid = [];
    for (const f of files) {
      if (!accepted.includes(f.type)) { toast(`"${f.name}" no es JPG/PNG/WebP`, 'error'); continue; }
      if (f.size > 8 * 1024 * 1024) { toast(`"${f.name}" supera 8 MB`, 'error'); continue; }
      valid.push({ key: crypto.randomUUID(), file: f, preview: URL.createObjectURL(f) });
    }
    if (!valid.length) return;
    setNewImages(prev => [...prev, ...valid]);
    // si no hay principal aún, el primero nuevo lo es
    setPrincipalKey(prev => prev || `new:${valid[0].key}`);
  };

  const toggleDeleteImage = (id) => {
    setExistingImages(prev => prev.map(i => (i.id === id ? { ...i, _delete: !i._delete } : i)));
    if (principalKey === id) setPrincipalKey(null);
  };
  const removeNewImage = (key) => {
    setNewImages(prev => prev.filter(i => i.key !== key));
    if (principalKey === `new:${key}`) setPrincipalKey(null);
  };

  // ── save ───────────────────────────────────────────────────────────────────
  const buildVariantRows = (productId) =>
    // Producto simple = 1 sola variante ("Única"); con variantes = todas las filas.
    (hasVariants ? variants : variants.slice(0, 1))
      .map((v, idx) => {
        const nombre = hasVariants
          ? (v.nombre || [v.talla, v.color].filter(Boolean).join(' / ') || `Variante ${idx + 1}`)
          : 'Única';
        return {
          id: v.id,
          product_id: productId,
          nombre,
          talla: hasVariants ? (v.talla || null) : null,
          color: hasVariants ? (v.color || null) : null,
          sku: v.sku || null,
          precio_centimos: hasVariants ? eurToCents(v.precioEur) : null,
          stock: Math.max(0, parseInt(v.stock, 10) || 0),
          activo: v.activo !== false,
          orden: idx,
        };
      });

  const uploadImages = async (productId) => {
    const rows = [];
    let order = existingImages.filter(i => !i._delete).length;
    for (const ni of newImages) {
      try {
        const blob = await optimizeImage(ni.file);
        const path = `products/${productId}/${crypto.randomUUID()}.webp`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/webp', upsert: false });
        if (error) { console.error('upload', error); toast('Error subiendo una imagen', 'error'); continue; }
        rows.push({
          product_id: productId,
          ruta_imagen: path,
          orden: order++,
          es_principal: principalKey === `new:${ni.key}`,
          _key: ni.key,
        });
      } catch (e) { console.error(e); }
    }
    return rows;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) { toast('El nombre es obligatorio', 'error'); return; }
    const precio = eurToCents(precioEur);
    if (precio === null) { toast('Precio inválido', 'error'); return; }
    const oferta = eurToCents(ofertaEur);
    if (ofertaEur && (oferta === null || oferta >= precio)) {
      toast('El precio de oferta debe ser menor que el precio', 'error'); return;
    }
    setSaving(true);

    const payload = {
      nombre: nombre.trim(),
      slug: slugify(nombre) || `producto-${Date.now()}`,
      descripcion: descripcion.trim(),
      precio_centimos: precio,
      precio_oferta_centimos: oferta,
      categoria_id: categoriaId || null,
      activo,
      destacado,
    };

    try {
      let productId = editing?.id;

      if (editing) {
        const { error } = await supabase.from('products').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        // insertar con reintento si el slug ya existe
        let insErr, data;
        ({ data, error: insErr } = await supabase.from('products').insert(payload).select('id').single());
        if (insErr && insErr.code === '23505') {
          payload.slug = `${payload.slug}-${Math.random().toString(36).slice(2, 6)}`;
          ({ data, error: insErr } = await supabase.from('products').insert(payload).select('id').single());
        }
        if (insErr) throw insErr;
        productId = data.id;
      }

      // ── variantes ──
      const rows = buildVariantRows(productId);
      const keepIds = rows.filter(r => r.id).map(r => r.id);
      // borrar variantes que ya no están (solo en edición)
      if (editing) {
        const origIds = (editing.product_variants || []).map(v => v.id);
        const toDelete = origIds.filter(id => !keepIds.includes(id));
        if (toDelete.length) await supabase.from('product_variants').delete().in('id', toDelete);
      }
      for (const r of rows) {
        const { id, ...vals } = r;
        if (id) await supabase.from('product_variants').update(vals).eq('id', id);
        else await supabase.from('product_variants').insert(vals);
      }

      // ── imágenes: borrados ──
      const toDeleteImgs = existingImages.filter(i => i._delete);
      if (toDeleteImgs.length) {
        await supabase.from('product_images').delete().in('id', toDeleteImgs.map(i => i.id));
        const paths = toDeleteImgs.map(i => i.ruta_imagen).filter(p => p && !p.startsWith('http'));
        if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
      }
      // ── imágenes: nuevas ──
      const newRows = await uploadImages(productId);
      if (newRows.length) {
        await supabase.from('product_images').insert(newRows.map(({ _key, ...r }) => r));
      }
      // ── principal entre las existentes que quedan ──
      const remaining = existingImages.filter(i => !i._delete);
      for (const i of remaining) {
        const shouldBe = principalKey === i.id;
        if (shouldBe !== i.es_principal) {
          await supabase.from('product_images').update({ es_principal: shouldBe }).eq('id', i.id);
        }
      }

      toast(editing ? 'Producto actualizado' : 'Producto creado', 'success');
      setShowForm(false);
      resetForm();
      await loadAll();
    } catch (err) {
      console.error(err);
      toast('Error al guardar: ' + (err.message || err), 'error');
    }
    setSaving(false);
  };

  const toggleActive = async (p) => {
    const { error } = await supabase.from('products').update({ activo: !p.activo }).eq('id', p.id);
    if (error) { toast('No se pudo actualizar', 'error'); return; }
    setProducts(prev => prev.map(x => (x.id === p.id ? { ...x, activo: !p.activo } : x)));
  };

  const toggleDestacado = async (p) => {
    const { error } = await supabase.from('products').update({ destacado: !p.destacado }).eq('id', p.id);
    if (error) { toast('No se pudo actualizar', 'error'); return; }
    setProducts(prev => prev.map(x => (x.id === p.id ? { ...x, destacado: !p.destacado } : x)));
  };

  const deleteProduct = async (p) => {
    const ok = await confirmDialog(
      `¿Eliminar "${p.nombre}"? Se borrarán sus variantes e imágenes. Esta acción no se puede deshacer.\n\nConsejo: si solo quieres ocultarlo, usa "Desactivar".`,
      { title: 'Eliminar producto', okText: 'Eliminar', danger: true }
    );
    if (!ok) return;
    const paths = (p.product_images || []).map(i => i.ruta_imagen).filter(x => x && !x.startsWith('http'));
    const { error, count } = await supabase.from('products').delete({ count: 'exact' }).eq('id', p.id);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    if (count === 0) { toast('No se pudo eliminar (¿permisos RLS?)', 'error'); return; }
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    setProducts(prev => prev.filter(x => x.id !== p.id));
    toast('Producto eliminado', 'success');
  };

  // ── KPIs del catálogo (clicables: filtran la lista) ──
  const stats = useMemo(() => {
    let activos = 0, agotados = 0, low = 0, oferta = 0, destacados = 0;
    for (const p of products) {
      const st = totalStockOf(p);
      if (p.activo) activos++;
      if (st <= 0) agotados++;
      else if (st <= LOW_STOCK) low++;
      if (p.precio_oferta_centimos != null) oferta++;
      if (p.destacado) destacados++;
    }
    return { total: products.length, activos, agotados, low, oferta, destacados };
  }, [products]);

  // ── filtrado + ordenación ──
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const priceOf = (p) => p.precio_oferta_centimos ?? p.precio_centimos ?? 0;
    let list = products.filter(p => {
      const st = totalStockOf(p);
      if (catFilter !== 'all' && p.categoria_id !== catFilter) return false;
      if (statusFilter === 'active' && !p.activo) return false;
      if (statusFilter === 'inactive' && p.activo) return false;
      if (statusFilter === 'agotado' && st > 0) return false;
      if (statusFilter === 'low' && (st <= 0 || st > LOW_STOCK)) return false;
      if (statusFilter === 'oferta' && p.precio_oferta_centimos == null) return false;
      if (statusFilter === 'destacado' && !p.destacado) return false;
      if (q && !(`${p.nombre} ${p.descripcion || ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
    if (sortBy === 'nombre') list = [...list].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    if (sortBy === 'precio-asc') list = [...list].sort((a, b) => priceOf(a) - priceOf(b));
    if (sortBy === 'precio-desc') list = [...list].sort((a, b) => priceOf(b) - priceOf(a));
    if (sortBy === 'stock') list = [...list].sort((a, b) => totalStockOf(a) - totalStockOf(b));
    return list;
  }, [products, search, catFilter, statusFilter, sortBy]);

  const totalStock = totalStockOf;
  const principalImg = (p) => {
    const imgs = p.product_images || [];
    const pr = imgs.find(i => i.es_principal) || imgs[0];
    return pr ? imgUrl(pr.ruta_imagen) : null;
  };

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '0.75rem', flexWrap: 'wrap' }}>
        <p className="section-label" style={{ margin: 0 }}>Catálogo de la tienda</p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setShowCats(true)} style={btnSecondary}>Categorías</button>
          <button onClick={openCreate} style={btnPrimary}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Nuevo producto
          </button>
        </div>
      </div>

      {/* KPIs del catálogo (clic = filtrar) */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.6rem', marginBottom: '1.25rem' }}>
          {[
            { label: 'Productos', value: stats.total, color: '#0F172A', f: 'all' },
            { label: 'Activos', value: stats.activos, color: '#16A34A', f: 'active' },
            { label: 'Agotados', value: stats.agotados, color: stats.agotados > 0 ? '#DC2626' : '#94A3B8', f: 'agotado' },
            { label: 'Stock bajo', value: stats.low, color: stats.low > 0 ? '#D97706' : '#94A3B8', f: 'low' },
            { label: 'En oferta', value: stats.oferta, color: '#7C3AED', f: 'oferta' },
            { label: 'Destacados', value: stats.destacados, color: '#B45309', f: 'destacado' },
          ].map(k => (
            <button key={k.f} onClick={() => setStatusFilter(prev => prev === k.f ? 'all' : k.f)}
              style={{ background: 'white', border: `1.5px solid ${statusFilter === k.f ? '#16A34A' : '#E2E8F0'}`, borderRadius: '0.875rem', padding: '0.7rem 0.6rem', cursor: 'pointer', textAlign: 'center' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 900, color: k.color, lineHeight: 1.1 }}>{k.value}</div>
              <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '0.15rem' }}>{k.label}</div>
            </button>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <input placeholder="Buscar producto…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, flex: '1 1 200px', maxWidth: '320px' }} />
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Todas las categorías</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="agotado">Agotados</option>
          <option value="low">Stock bajo</option>
          <option value="oferta">En oferta</option>
          <option value="destacado">Destacados</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
          <option value="orden">Orden del catálogo</option>
          <option value="nombre">Nombre A-Z</option>
          <option value="precio-asc">Precio ↑</option>
          <option value="precio-desc">Precio ↓</option>
          <option value="stock">Menos stock primero</option>
        </select>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94A3B8' }}>Cargando catálogo…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94A3B8', border: '2px dashed #E2E8F0', borderRadius: '1.25rem' }}>
          <p style={{ fontWeight: 700, color: '#64748B', margin: '0 0 0.25rem' }}>Sin productos</p>
          <p style={{ fontSize: '0.85rem', margin: 0 }}>Crea el primero con el botón de arriba.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {filtered.map(p => {
            const stock = totalStock(p);
            const img = principalImg(p);
            return (
              <div key={p.id} style={{ backgroundColor: 'white', borderRadius: '1rem', border: `1.5px solid ${p.activo ? '#E2E8F0' : '#FECACA'}`, overflow: 'hidden', display: 'flex', gap: 0 }}>
                <div style={{ width: '88px', flexShrink: 0, background: img ? '#0F172A' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {img ? <img src={img} alt={p.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: '1.8rem' }}>🛍️</span>}
                </div>
                <div style={{ flex: 1, padding: '0.85rem 1rem', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>{p.nombre}</h4>
                    <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                      {p.destacado && <span style={badge('#FEF3C7', '#92400E')}>★ Destacado</span>}
                      <span style={badge(p.activo ? '#DCFCE7' : '#FEE2E2', p.activo ? '#15803D' : '#B91C1C')}>{p.activo ? 'Activo' : 'Inactivo'}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: '#16A34A' }}>
                      {fmtEur(p.precio_oferta_centimos ?? p.precio_centimos)}
                      {p.precio_oferta_centimos != null && (
                        <span style={{ fontSize: '0.78rem', color: '#94A3B8', fontWeight: 600, textDecoration: 'line-through', marginLeft: '0.4rem' }}>{fmtEur(p.precio_centimos)}</span>
                      )}
                    </span>
                    {p.categoria?.nombre && <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>· {p.categoria.nombre}</span>}
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: stock <= 0 ? '#DC2626' : stock <= LOW_STOCK ? '#D97706' : '#64748B' }}>
                      · Stock: {stock}{stock <= LOW_STOCK && stock > 0 ? ' (bajo)' : ''}{stock <= 0 ? ' (agotado)' : ''}
                    </span>
                    {(p.product_variants || []).length > 1 && <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>· {p.product_variants.length} variantes</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.7rem', flexWrap: 'wrap' }}>
                    <button onClick={() => openEdit(p)} style={pillBtn('#E2E8F0', 'white', '#475569')}>✎ Editar</button>
                    <button onClick={() => toggleDestacado(p)} title={p.destacado ? 'Quitar de destacados' : 'Marcar como destacado'}
                      style={pillBtn(p.destacado ? '#FDE68A' : '#E2E8F0', p.destacado ? '#FEF3C7' : 'white', p.destacado ? '#B45309' : '#94A3B8')}>
                      {p.destacado ? '★ Destacado' : '☆ Destacar'}
                    </button>
                    <button onClick={() => toggleActive(p)} style={pillBtn(p.activo ? '#FED7AA' : '#BBF7D0', p.activo ? '#FFF7ED' : '#F0FDF4', p.activo ? '#9A3412' : '#15803D')}>
                      {p.activo ? 'Desactivar' : 'Activar'}
                    </button>
                    <button onClick={() => deleteProduct(p)} style={pillBtn('#FECACA', '#FEF2F2', '#DC2626')}>Eliminar</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <ProductFormModal
          {...{ editing, saving, nombre, setNombre, descripcion, setDescripcion, precioEur, setPrecioEur,
            ofertaEur, setOfertaEur, categoriaId, setCategoriaId, categories, activo, setActivo,
            destacado, setDestacado, hasVariants, setHasVariants, variants, updateVariant, addVariant,
            removeVariant, existingImages, newImages, principalKey, setPrincipalKey, addFiles,
            toggleDeleteImage, removeNewImage, handleSave, fileRef,
            onClose: () => { setShowForm(false); resetForm(); } }}
        />
      )}

      {showCats && (
        <CategoriesModal categories={categories} onClose={() => setShowCats(false)} onChanged={loadAll} />
      )}
    </div>
  );
}

// ── Modal de formulario de producto ──────────────────────────────────────────
function ProductFormModal(props) {
  const {
    editing, saving, nombre, setNombre, descripcion, setDescripcion, precioEur, setPrecioEur,
    ofertaEur, setOfertaEur, categoriaId, setCategoriaId, categories, activo, setActivo,
    destacado, setDestacado, hasVariants, setHasVariants, variants, updateVariant, addVariant,
    removeVariant, existingImages, newImages, principalKey, setPrincipalKey, addFiles,
    toggleDeleteImage, removeNewImage, handleSave, fileRef, onClose,
  } = props;
  const [dragOver, setDragOver] = useState(false);

  return (
    <div style={overlay}>
      <div style={{ ...modalCard, maxWidth: '640px' }}>
        <div style={modalHeader}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>{editing ? 'Editar producto' : 'Nuevo producto'}</h3>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        <form onSubmit={handleSave} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {/* Imágenes */}
          <div>
            <label style={labelStyle}>Imágenes</label>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
              style={{ border: `2px dashed ${dragOver ? '#16A34A' : '#CBD5E1'}`, borderRadius: '1rem', cursor: 'pointer', backgroundColor: dragOver ? '#F0FDF4' : '#F8FAFC', padding: '1.1rem', textAlign: 'center', color: '#94A3B8' }}
            >
              <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>Arrastra imágenes aquí o haz clic para subir</p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.72rem' }}>JPG, PNG, WebP — se optimizan automáticamente</p>
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: 'none' }} onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />

            {(existingImages.some(i => !i._delete) || newImages.length > 0) && (
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                {existingImages.filter(i => !i._delete).map(i => (
                  <ImageThumb key={i.id} src={imgUrl(i.ruta_imagen)} isPrincipal={principalKey === i.id}
                    onPrincipal={() => setPrincipalKey(i.id)} onDelete={() => toggleDeleteImage(i.id)} />
                ))}
                {newImages.map(i => (
                  <ImageThumb key={i.key} src={i.preview} isNew isPrincipal={principalKey === `new:${i.key}`}
                    onPrincipal={() => setPrincipalKey(`new:${i.key}`)} onDelete={() => removeNewImage(i.key)} />
                ))}
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Nombre *</label>
            <input type="text" required value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Pala Nox AT10" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Descripción</label>
            <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={3} placeholder="Detalles, material, características…" style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Precio (€) *</label>
              <input type="text" inputMode="decimal" required value={precioEur} onChange={e => setPrecioEur(e.target.value)} placeholder="29,90" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Precio oferta (€)</label>
              <input type="text" inputMode="decimal" value={ofertaEur} onChange={e => setOfertaEur(e.target.value)} placeholder="opcional" style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Categoría</label>
            <select value={categoriaId} onChange={e => setCategoriaId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer', backgroundColor: '#F8FAFC' }}>
              <option value="">— Sin categoría —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>

          {/* Variantes / stock */}
          <div style={{ border: '1.5px solid #E2E8F0', borderRadius: '0.875rem', padding: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: hasVariants ? '0.85rem' : 0 }}>
              <input type="checkbox" checked={hasVariants} onChange={e => setHasVariants(e.target.checked)} />
              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#475569' }}>Producto con variantes (talla / color)</span>
            </label>

            {!hasVariants ? (
              <div style={{ marginTop: '0.85rem' }}>
                <label style={labelStyle}>Stock</label>
                <input type="number" min="0" value={variants[0]?.stock ?? '0'}
                  onChange={e => updateVariant(variants[0]._key, { stock: e.target.value })}
                  style={{ ...inputStyle, maxWidth: '140px' }} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {variants.map((v, idx) => (
                  <div key={v._key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 70px 1fr 28px', gap: '0.4rem', alignItems: 'center' }}>
                    <input placeholder="Talla" value={v.talla} onChange={e => updateVariant(v._key, { talla: e.target.value })} style={miniInput} />
                    <input placeholder="Color" value={v.color} onChange={e => updateVariant(v._key, { color: e.target.value })} style={miniInput} />
                    <input type="number" min="0" placeholder="Stock" value={v.stock} onChange={e => updateVariant(v._key, { stock: e.target.value })} style={miniInput} />
                    <input placeholder="Precio € (opc.)" inputMode="decimal" value={v.precioEur} onChange={e => updateVariant(v._key, { precioEur: e.target.value })} style={miniInput} />
                    <button type="button" onClick={() => removeVariant(v._key)} title="Quitar" style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
                  </div>
                ))}
                <button type="button" onClick={addVariant} style={{ ...btnSecondary, alignSelf: 'flex-start' }}>+ Añadir variante</button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} />
              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#475569' }}>Activo (visible en la tienda)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={destacado} onChange={e => setDestacado(e.target.checked)} />
              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#475569' }}>Destacado</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={cancelBtn}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Guardando…' : (editing ? 'Guardar cambios' : 'Crear producto')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImageThumb({ src, isPrincipal, isNew, onPrincipal, onDelete }) {
  return (
    <div style={{ position: 'relative', width: '84px', height: '84px', borderRadius: '0.6rem', overflow: 'hidden', border: `2px solid ${isPrincipal ? '#16A34A' : '#E2E8F0'}` }}>
      <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <button type="button" onClick={onDelete} title="Quitar" style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'rgba(220,38,38,0.92)', color: 'white', fontSize: '0.7rem', cursor: 'pointer', lineHeight: 1 }}>✕</button>
      <button type="button" onClick={onPrincipal} title="Marcar como principal"
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, border: 'none', background: isPrincipal ? '#16A34A' : 'rgba(15,23,42,0.6)', color: 'white', fontSize: '0.6rem', fontWeight: 700, padding: '2px', cursor: 'pointer' }}>
        {isPrincipal ? '★ Principal' : 'Hacer principal'}
      </button>
      {isNew && <span style={{ position: 'absolute', top: 2, left: 2, background: '#2563EB', color: 'white', fontSize: '0.55rem', fontWeight: 700, padding: '1px 4px', borderRadius: '0.3rem' }}>nueva</span>}
    </div>
  );
}

// ── Modal de categorías ──────────────────────────────────────────────────────
function CategoriesModal({ categories, onClose, onChanged }) {
  const [nombre, setNombre] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!nombre.trim()) return;
    setBusy(true);
    const slug = slugify(nombre) || `cat-${Date.now()}`;
    const { error } = await supabase.from('categories').insert({ nombre: nombre.trim(), slug, orden: categories.length });
    if (error) toast('Error: ' + error.message, 'error');
    else { setNombre(''); await onChanged(); }
    setBusy(false);
  };

  const rename = async (c) => {
    const nuevo = window.prompt('Nuevo nombre de la categoría:', c.nombre);
    if (!nuevo || !nuevo.trim() || nuevo === c.nombre) return;
    const { error } = await supabase.from('categories').update({ nombre: nuevo.trim() }).eq('id', c.id);
    if (error) toast('Error: ' + error.message, 'error'); else onChanged();
  };

  const del = async (c) => {
    const ok = await confirmDialog(`¿Eliminar la categoría "${c.nombre}"? Los productos quedarán sin categoría.`, { danger: true, okText: 'Eliminar', title: 'Eliminar categoría' });
    if (!ok) return;
    const { error } = await supabase.from('categories').delete().eq('id', c.id);
    if (error) toast('Error: ' + error.message, 'error'); else onChanged();
  };

  return (
    <div style={overlay}>
      <div style={{ ...modalCard, maxWidth: '440px' }}>
        <div style={modalHeader}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Categorías</h3>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>
        <div style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nueva categoría" style={{ ...inputStyle, flex: 1 }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
            <button onClick={add} disabled={busy} style={btnPrimary}>Añadir</button>
          </div>
          {categories.length === 0 ? (
            <p style={{ color: '#94A3B8', fontSize: '0.85rem', textAlign: 'center', margin: 0 }}>Aún no hay categorías.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {categories.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.75rem', border: '1.5px solid #E2E8F0', borderRadius: '0.625rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{c.nombre}</span>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button onClick={() => rename(c)} style={pillBtn('#E2E8F0', 'white', '#475569')}>Renombrar</button>
                    <button onClick={() => del(c)} style={pillBtn('#FECACA', '#FEF2F2', '#DC2626')}>Eliminar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── estilos compartidos ──────────────────────────────────────────────────────
const labelStyle = { display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' };
const inputStyle = { width: '100%', padding: '0.7rem 0.85rem', borderRadius: '0.625rem', border: '1.5px solid #CBD5E1', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none' };
const miniInput = { width: '100%', padding: '0.5rem 0.6rem', borderRadius: '0.5rem', border: '1.5px solid #CBD5E1', fontSize: '0.82rem', boxSizing: 'border-box', outline: 'none' };
const btnPrimary = { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.1rem', backgroundColor: '#16A34A', color: 'white', border: 'none', borderRadius: '0.75rem', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' };
const btnSecondary = { padding: '0.6rem 1rem', backgroundColor: 'white', color: '#475569', border: '1.5px solid #CBD5E1', borderRadius: '0.75rem', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' };
const cancelBtn = { padding: '0.7rem 1.25rem', borderRadius: '0.75rem', border: '1.5px solid #CBD5E1', background: 'white', color: '#475569', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' };
const overlay = { position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' };
const modalCard = { backgroundColor: 'white', borderRadius: '1.25rem', width: '100%', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', marginTop: '2rem', marginBottom: '2rem' };
const modalHeader = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid #E2E8F0' };
const closeBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '1.4rem', lineHeight: 1, padding: '0.2rem' };
const badge = (bg, color) => ({ fontSize: '0.62rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '999px', backgroundColor: bg, color, textTransform: 'uppercase', letterSpacing: '0.04em' });
const pillBtn = (border, bg, color) => ({ padding: '0.35rem 0.8rem', borderRadius: '0.5rem', border: `1.5px solid ${border}`, backgroundColor: bg, color, fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' });
