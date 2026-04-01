// pwa.js — registers service worker + install prompt UI
(function () {
  if (!("serviceWorker" in navigator)) return;
  let deferredPrompt = null;

  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    } catch (e) {
      console.warn("PWA service worker registration failed:", e);
    }
  });

  function ensureInstallButton() {
    if (document.getElementById("vcInstallBtn")) return;
    const btn = document.createElement("button");
    btn.id = "vcInstallBtn";
    btn.type = "button";
    btn.innerHTML = '<i class="fas fa-download"></i><span>Install App</span>';
    btn.style.cssText = `
      position: fixed;
      right: 14px;
      bottom: 92px;
      z-index: 10000;
      display: none;
      align-items: center;
      gap: 8px;
      border: none;
      border-radius: 999px;
      padding: 10px 14px;
      color: #fff;
      font-weight: 800;
      letter-spacing: 0.02em;
      background: linear-gradient(135deg, #00d4ff, #7f5cff);
      box-shadow: 0 12px 28px rgba(0, 212, 255, 0.28);
      cursor: pointer;
    `;
    btn.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch {}
      deferredPrompt = null;
      btn.style.display = "none";
    });
    document.body.appendChild(btn);
    return btn;
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = ensureInstallButton();
    if (btn) btn.style.display = "inline-flex";
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    const btn = document.getElementById("vcInstallBtn");
    if (btn) btn.style.display = "none";
  });
})();

