// Generated with the exact assets of this build. Installation is all-or-nothing.
const CACHE = 'asqueel-app-' + BUILD_VERSION;
const urls = new Set(ASSETS);
self.addEventListener('install', event => event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try { await cache.addAll(ASSETS); }
    catch (error) { await caches.delete(CACHE); throw error; }
})()));
// No skipWaiting: an open app keeps its own version until all its tabs close.
self.addEventListener('activate', event => event.waitUntil((async () => {
    for (const key of await caches.keys())
        if (key.startsWith('asqueel-app-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
    const path = event.request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')
        ? '/index.html' : url.pathname;
    if (!urls.has(path)) return;
    event.respondWith((async () => {
        const response = await (await caches.open(CACHE)).match(path);
        // A cached response carries its original URL. Strip it so Worker.location
        // retains ?page/embedded/compact instead of booting the default page.
        return response ? new Response(response.body, {status:response.status, headers:response.headers}) : fetch(event.request);
    })());
});
