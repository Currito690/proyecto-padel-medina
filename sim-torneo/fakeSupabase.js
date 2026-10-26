// Supabase de MENTIRA para el simulador de torneos (sim-torneo/). Guarda las
// tablas en memoria y responde a las mismas llamadas que hace el panel
// (from().select().eq()…, insert, update, delete). Así el panel de torneos
// corre en local con datos de prueba, sin tocar la base de datos del club.
//
// Datos iniciales: window.__SIM_DATOS = { tournaments: [...], tournament_registrations: [...],
// courts: [...], bookings: [...], blocked_slots: [...] }. Las escrituras se
// aplican en memoria y quedan en window.__sim.log para leerlas desde fuera.

const clon = (v) => JSON.parse(JSON.stringify(v));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

// Los datos se leen la primera vez que se usan (window.__SIM_DATOS lo pone
// datos.js, un script clásico que carga antes que los módulos).
let db = null;
const log = [];
const asegurar = () => { if (!db) db = clon(window.__SIM_DATOS || {}); return db; };
const tabla = (nombre) => { const d = asegurar(); return (d[nombre] = d[nombre] || []); };

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

class Consulta {
  constructor(nombre) {
    this.nombre = nombre;
    this.op = 'select';
    this.filtros = [];
    this.ordenes = [];
    this.limite = null;
    this.unico = null;
    this.carga = null;
    this.devolver = false;
  }
  select() { if (this.op !== 'select') this.devolver = true; return this; }
  insert(filas) { this.op = 'insert'; this.carga = Array.isArray(filas) ? filas : [filas]; return this; }
  upsert(filas) { this.op = 'upsert'; this.carga = Array.isArray(filas) ? filas : [filas]; return this; }
  update(obj) { this.op = 'update'; this.carga = obj; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.filtros.push((r) => r[c] === v); return this; }
  neq(c, v) { this.filtros.push((r) => r[c] !== v); return this; }
  gt(c, v) { this.filtros.push((r) => r[c] > v); return this; }
  gte(c, v) { this.filtros.push((r) => r[c] >= v); return this; }
  lt(c, v) { this.filtros.push((r) => r[c] < v); return this; }
  lte(c, v) { this.filtros.push((r) => r[c] <= v); return this; }
  in(c, lista) { this.filtros.push((r) => (lista || []).includes(r[c])); return this; }
  is(c, v) { this.filtros.push((r) => r[c] === v); return this; }
  match(obj) { Object.entries(obj || {}).forEach(([c, v]) => this.eq(c, v)); return this; }
  order(c, { ascending = true } = {}) { this.ordenes.push([c, ascending ? 1 : -1]); return this; }
  limit(n) { this.limite = n; return this; }
  range(a, b) { this.limite = b - a + 1; return this; }
  single() { this.unico = 'single'; return this; }
  maybeSingle() { this.unico = 'maybe'; return this; }
  abortSignal() { return this; }

  _filas() { return tabla(this.nombre).filter((r) => this.filtros.every((f) => f(r))); }

  _resultado(filas) {
    let data = clon(filas);
    if (this.unico) {
      if (data.length > 1) return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
      if (data.length === 0) {
        return this.unico === 'maybe' ? { data: null, error: null } : { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
      }
      data = data[0];
    }
    return { data, error: null, count: null, status: 200 };
  }

  ejecutar() {
    const t = tabla(this.nombre);
    if (this.op === 'select') {
      let filas = this._filas();
      for (const [c, dir] of [...this.ordenes].reverse()) filas = [...filas].sort((a, b) => dir * cmp(a[c], b[c]));
      if (this.limite != null) filas = filas.slice(0, this.limite);
      return this._resultado(filas);
    }
    if (this.op === 'insert' || this.op === 'upsert') {
      const nuevas = this.carga.map((f) => ({ id: uuid(), created_at: new Date().toISOString(), ...clon(f) }));
      nuevas.forEach((n) => {
        const i = this.op === 'upsert' ? t.findIndex((r) => r.id === n.id) : -1;
        if (i >= 0) t[i] = { ...t[i], ...n }; else t.push(n);
      });
      log.push({ op: this.op, tabla: this.nombre, filas: clon(nuevas) });
      return this.devolver ? this._resultado(nuevas) : { data: null, error: null };
    }
    if (this.op === 'update') {
      const filas = this._filas();
      filas.forEach((r) => Object.assign(r, clon(this.carga)));
      log.push({ op: 'update', tabla: this.nombre, n: filas.length, cambios: Object.keys(this.carga || {}) });
      return this.devolver ? this._resultado(filas) : { data: null, error: null };
    }
    if (this.op === 'delete') {
      const filas = this._filas();
      const ids = new Set(filas.map((r) => r.id));
      asegurar()[this.nombre] = t.filter((r) => !ids.has(r.id));
      log.push({ op: 'delete', tabla: this.nombre, n: filas.length });
      return this.devolver ? this._resultado(filas) : { data: null, error: null };
    }
    return { data: null, error: { message: `operación no soportada: ${this.op}` } };
  }

  then(ok, ko) { return Promise.resolve().then(() => this.ejecutar()).then(ok, ko); }
  catch(ko) { return this.then((x) => x, ko); }
  finally(fn) { return this.then((x) => { fn(); return x; }, (e) => { fn(); throw e; }); }
}

const canal = { on() { return canal; }, subscribe() { return canal; }, unsubscribe() { return Promise.resolve('ok'); } };

export const supabase = {
  from: (nombre) => new Consulta(nombre),
  rpc: async () => ({ data: null, error: null }),
  channel: () => canal,
  removeChannel: async () => 'ok',
  functions: { invoke: async () => ({ data: { ok: true }, error: null }) },
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({ error: null }),
  },
};

window.__sim = {
  get db() { return asegurar(); },
  log,
  torneo: (id) => clon(tabla('tournaments').find((t) => !id || t.id === id) || null),
  torneos: () => clon(tabla('tournaments')),
};
