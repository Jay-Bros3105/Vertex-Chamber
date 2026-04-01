/* firebase-messaging-sw.js — FCM service worker (background push)
   Must be served from site root.
*/

importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

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

messaging.onBackgroundMessage((payload) => {
  try {
    const d = payload?.data || {};
    const username = d.username || "Vertex Chamber Member";
    const senderName = d.senderName || "a member";
    const title = "Vertex Chamber";
    const body = `Hello Vertex Chamber Member (${username}), Youve received a message from (${senderName})`;
    const url = d.url || "/messages.html";

    self.registration.showNotification(title, {
      body,
      icon: "/favicon.png",
      badge: "/favicon.png",
      data: { url },
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

