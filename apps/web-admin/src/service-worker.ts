/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `isra-${version}`;
const OFFLINE_URL = '/offline.html';
const ASSETS = [...build, ...files.filter((f) => !f.endsWith('.map')), OFFLINE_URL];

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => sw.skipWaiting())
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim())
  );
});

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // فقط همین origin؛ درخواست‌های API (دامنهٔ دیگر) و داده‌های لحظه‌ای کش نمی‌شوند
  if (url.origin !== location.origin) return;

  // صفحات: اول شبکه، در قطعی صفحهٔ آفلاین
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) ?? Response.error())
    );
    return;
  }

  // دارایی‌های ایستا (build/فونت/آیکون): اول کش
  if (ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((hit) => hit ?? fetch(request))
    );
  }
});
