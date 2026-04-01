/* firebase-messaging-sw.js — FCM service worker (background push)
   Must be served from site root.
*/

importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

const CACHE_VERSION = "vc-pwa-v1";
const APP_SHELL_ASSETS = [
  "/",
  "/splash.html",
  "/feed.html",
  "/chambers.html",
  "/workspace.html",
  "/messages.html",
  "/profile.html",
  "/login.html",
  "/styles.css",
  "/main.js",
  "/bottom_nav.js",
  "/app_shell.js",
  "/firebase.js",
  "/feed_page.js",
  "/chambers_page.js",
  "/workspace_page.js",
  "/manifest.json",
  "/favicon.png"
];

// Keep in sync with firebase.js / messages.html config
firebase.initializeApp({
  apiKey:            "AIzaSyC3HO1BY4rw1uVlZnRn4qG3XpxipFzDs0M",
  authDomain:        "vertex-chamber-993f6.firebaseapp.com",
  databaseURL:       "https://vertex-chamber-993f6-default-rtdb.firebaseio.com",
  projectId:         "vertex-chamber-993f6",
  storageBucket:     "vertex-chamber-993f6.firebasestorage.app",
  messagingSenderId: "950688239086",
  appId:             "1:950688239086:web:13b11f2581e908dabed2ff",
});

const messaging = firebase.messaging();

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await cache.addAll(APP_SHELL_ASSETS);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n !== CACHE_VERSION)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML: network-first, fallback to cache.
  if (req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_VERSION);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(req);
          return cached || caches.match("/splash.html");
        }
      })(),
    );
    return;
  }

  // Static assets: cache-first, fallback to network.
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE_VERSION);
      cache.put(req, fresh.clone());
      return fresh;
    })(),
  );
});

messaging.onBackgroundMessage((payload) => {
  try {
    const d = payload?.data || {};
    const isCall = d.type === "call";
    const username = d.username || "Vertex Chamber Member";
    const senderName = d.senderName || "a member";
    const title = isCall
      ? ((d.kind === "video") ? "Incoming Video Call" : "Incoming Voice Call")
      : "Vertex Chamber";
    const body = isCall
      ? `${d.callerName || "Member"} is calling you now.`
      : `Hello Vertex Chamber Member (${username}), Youve received a message from (${senderName})`;
    const url = d.url || "/messages.html";

    self.registration.showNotification(title, {
      body,
      icon: "/favicon.png",
      badge: "/favicon.png",
      data: { url, type: d.type || "message", callId: d.callId || "" },
      requireInteraction: !!isCall,
      tag: isCall ? `call_${d.callId || "incoming"}` : undefined,
    });
  } catch {
    // ignore
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/messages.html";
  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of allClients) {
        if (c.url && c.url.includes("/messages.html")) {
          await c.focus();
          return;
        }
      }
      await clients.openWindow(url);
    })(),
  );
});

