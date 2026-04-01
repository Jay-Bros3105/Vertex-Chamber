// pwa.js — registers the app service worker for install/offline support
(function () {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    } catch (e) {
      console.warn("PWA service worker registration failed:", e);
    }
  });
})();

