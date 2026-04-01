// pwa.js — registers service worker + install prompt UI
(function () {
  if (!("serviceWorker" in navigator)) return;
  let deferredPrompt = null;
  let installDismissed = false;

  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    } catch (e) {
      console.warn("PWA service worker registration failed:", e);
    }
  });

  function ensureInstallButton() {
    const existing = document.getElementById("vcInstallBtn");
    if (existing) return existing;
    const btn = document.createElement("button");
    btn.id = "vcInstallBtn";
    btn.type = "button";
    btn.innerHTML = '<i class="fas fa-download"></i><span>Install App</span>';
    btn.style.cssText = `
      position: fixed;
      right: 14px;
      bottom: 92px;
      z-index: 2147483647;
      display: inline-flex;
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
      if (deferredPrompt) {
        deferredPrompt.prompt();
        try { await deferredPrompt.userChoice; } catch {}
        deferredPrompt = null;
        if (isInstalled()) btn.style.display = "none";
        return;
      }
      // Fallback for browsers that suppress beforeinstallprompt.
      showInstallHelp();
    });
    document.body.appendChild(btn);
    return btn;
  }

  function isInstalled() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function showInstallHelp() {
    const existing = document.getElementById("vcInstallHelp");
    if (existing) { existing.style.display = "flex"; return; }
    const ua = navigator.userAgent || "";
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const msg = isIOS
      ? "On iPhone/iPad: tap Share, then Add to Home Screen."
      : "Use your browser menu and choose Install App / Add to Home screen.";
    const modal = document.createElement("div");
    modal.id = "vcInstallHelp";
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px;";
    modal.innerHTML = `
      <div style="width:min(92vw,420px);background:#111827;border:1px solid rgba(255,255,255,.18);border-radius:16px;padding:16px;color:#fff;">
        <div style="font-weight:900;margin-bottom:8px;">Install Vertex Chamber</div>
        <div style="font-size:14px;color:#d1d5db;line-height:1.5;">${msg}</div>
        <div style="display:flex;justify-content:flex-end;margin-top:14px;">
          <button id="vcInstallHelpClose" style="border:none;border-radius:999px;padding:9px 14px;background:linear-gradient(135deg,#00d4ff,#7f5cff);color:#fff;font-weight:800;cursor:pointer;">Got it</button>
        </div>
      </div>
    `;
    modal.addEventListener("click", (e) => {
      if (e.target === modal || e.target.id === "vcInstallHelpClose") modal.style.display = "none";
    });
    document.body.appendChild(modal);
  }

  function updateInstallButtonVisibility() {
    const btn = ensureInstallButton();
    if (!btn) return;
    if (isInstalled() || installDismissed) {
      btn.style.display = "none";
      return;
    }
    btn.style.display = "inline-flex";
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    updateInstallButtonVisibility();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    const btn = document.getElementById("vcInstallBtn");
    if (btn) btn.style.display = "none";
  });

  window.addEventListener("DOMContentLoaded", () => {
    const btn = ensureInstallButton();
    if (btn) {
      btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        installDismissed = true;
        btn.style.display = "none";
      });
    }
    updateInstallButtonVisibility();
  });
})();

