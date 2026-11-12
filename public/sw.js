// Golden Vault: network-only Service Worker.
// Do not cache authentication, HTML, API responses, coins or role assignments.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // Browser performs the request normally; no sensitive data is stored offline.
});
