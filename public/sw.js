// Version 2026-10-14 — tocar un aviso con la app abierta lleva a su pantalla.
// (2026-10-02b: modo offline, guarda la app para poder abrirla sin internet.)
// Las apps abiertas se recargan solas al detectar esta versión (lo controla main.jsx).
// Service Worker — Padel Medina PWA

const CACHE = 'padelmedina-2026-10-14';
// Lo mínimo para que la app arranque sin conexión. Los JS/CSS (con hash en el
// nombre) se van guardando solos según se usan, más abajo.
const SHELL = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/logo.png', '/offline.html'];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => { /* algún recurso falló: no pasa nada */ }))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        // Borrar cachés de versiones anteriores
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return; // solo lecturas
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return; // Supabase, Redsys, etc.: no tocar

    // Abrir la app o navegar por ella: intentamos la red (para traer la última
    // versión) y, si no hay internet, servimos la app guardada.
    if (req.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const res = await fetch(req);
                const copy = res.clone();
                caches.open(CACHE).then((c) => c.put('/index.html', copy)).catch(() => {});
                return res;
            } catch {
                return (await caches.match('/index.html')) || (await caches.match('/')) || (await caches.match('/offline.html')) || Response.error();
            }
        })());
        return;
    }

    // Recursos estáticos (JS, CSS, imágenes, fuentes): primero la copia guardada
    // (llevan hash en el nombre, así que no cambian), y si no, la red guardándolos.
    if (/\.(js|css|woff2?|ttf|eot|svg|png|jpe?g|gif|webp|avif|ico|json)$/.test(url.pathname)) {
        event.respondWith((async () => {
            const cached = await caches.match(req);
            if (cached) return cached;
            try {
                const res = await fetch(req);
                if (res.ok) {
                    const copy = res.clone();
                    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
                }
                return res;
            } catch {
                return cached || Response.error();
            }
        })());
        return;
    }
    // El resto (llamadas a la API, etc.) van normales por la red.
});

self.addEventListener('push', function (event) {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'Padel Medina';
    const options = {
        body: data.body || 'Nueva notificación',
        icon: '/icon-192.png',
        badge: '/badge-96.png',
        vibrate: [200, 100, 200],
        requireInteraction: true,
        data: {
            url: data.url || '/'
        }
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    let url = event.notification.data?.url || '/';
    let destino;
    try { destino = new URL(url, self.location.origin); } catch { url = '/'; destino = new URL(url, self.location.origin); }
    const abrir = () => (self.clients.openWindow ? self.clients.openWindow(url) : undefined);

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            // Un enlace de fuera (p. ej. la inscripción de un evento) se abre
            // aparte, sin sacar a la app de su pantalla.
            if (destino.origin !== self.location.origin) return abrir();
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    // App ya abierta: al frente y a la pantalla del aviso (p. ej.
                    // Mis reservas); antes solo se traía al frente.
                    return client.focus()
                        .then((c) => (c && 'navigate' in c && c.url !== destino.href
                            ? c.navigate(destino.href).catch(() => c)
                            : c))
                        .catch(abrir);
                }
            }
            return abrir();
        })
    );
});
