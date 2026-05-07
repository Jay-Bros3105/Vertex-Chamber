// pwa.js — registers service worker + proper PWA install prompt
(function () {
  if (!("serviceWorker" in navigator)) return;

  let deferredPrompt = null;
  let installDismissed = false;
  const INSTALL_STORAGE_KEY = "vc_install_dismissed_until";
  const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  function isIOS() {
    const ua = navigator.userAgent || "";
    return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function isAndroid() {
    return /Android/.test(navigator.userAgent || "");
  }

  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      window.navigator.standalone === true
    );
  }

  function swRegistrationUrl() {
    const el = document.querySelector('script[src*="pwa.js"]');
    if (el && el.src) {
      return new URL("firebase-messaging-sw.js", el.src).href;
    }
    return new URL("firebase-messaging-sw.js", window.location.href).href;
  }

  // Register service worker on load
  window.addEventListener("load", async () => {
    try {
      const swUrl = swRegistrationUrl();
      const reg = await navigator.serviceWorker.register(swUrl, { scope: "./" });
      console.log("✅ Service Worker registered:", reg.scope);

      // Force update check so new SW activates immediately
      if (reg.installing || reg.waiting) {
        console.log("SW is installing or waiting...");
      }
    } catch (e) {
      console.warn("⚠️ Service Worker registration failed:", e);
    }
  });

  function isInstallDismissed() {
    try {
      const until = parseInt(localStorage.getItem(INSTALL_STORAGE_KEY) || "0");
      return Date.now() < until;
    } catch {
      return false;
    }
  }

  function dismissInstall() {
    try {
      localStorage.setItem(INSTALL_STORAGE_KEY, Date.now() + DISMISS_DURATION_MS);
    } catch {}
  }

  function ensureInstallButton() {
    // Don't show if already installed as PWA
    if (isStandalone()) return null;

    const existing = document.getElementById("vcInstallBtn");
    if (existing) return existing;

    const btn = document.createElement("button");
    btn.id = "vcInstallBtn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Install Vertex Chamber app");
    btn.innerHTML = '<i class="fas fa-download"></i><span>Install App</span>';
    btn.style.cssText = `
      position: fixed;
      right: 14px;
      bottom: 92px;
      z-index: 2147483647;
      display: none;
      align-items: center;
      gap: 8px;
      border: none;
      border-radius: 999px;
      padding: 10px 16px;
      color: #fff;
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 0.02em;
      background: linear-gradient(135deg, #00d4ff, #7f5cff);
      box-shadow: 0 8px 24px rgba(0, 212, 255, 0.35), 0 0 0 1px rgba(255,255,255,0.1) inset;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    `;
    btn.addEventListener("mouseenter", () => {
      btn.style.transform = "translateY(-2px) scale(1.03)";
      btn.style.boxShadow = "0 12px 32px rgba(0, 212, 255, 0.5), 0 0 0 1px rgba(255,255,255,0.15) inset";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "";
      btn.style.boxShadow = "0 8px 24px rgba(0, 212, 255, 0.35), 0 0 0 1px rgba(255,255,255,0.1) inset";
    });
    btn.addEventListener("touchstart", () => {
      btn.style.transform = "scale(0.95)";
    }, { passive: true });
    btn.addEventListener("touchend", () => {
      btn.style.transform = "";
    }, { passive: true });

    btn.addEventListener("click", handleInstallClick);
    document.body.appendChild(btn);
    return btn;
  }

  async function handleInstallClick() {
    const btn = document.getElementById("vcInstallBtn");

    // If we have the native install prompt (Android Chrome, desktop Chrome, Edge)
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`Install prompt outcome: ${outcome}`);
        if (outcome === "accepted") {
          if (btn) btn.style.display = "none";
        }
      } catch (e) {
        console.warn("Install prompt failed:", e);
        showInstallHelp();
      }
      deferredPrompt = null;
      return;
    }

    // If already installed as PWA
    if (isStandalone()) {
      if (btn) btn.style.display = "none";
      return;
    }

    // iOS or browsers without native install — show platform-specific instructions
    showInstallHelp();
  }

  function showInstallHelp() {
    const existing = document.getElementById("vcInstallHelp");
    if (existing) {
      existing.style.display = "flex";
      return;
    }

    let title, instructions;
    if (isIOS()) {
      title = "Install on iPhone/iPad";
      instructions = `
        <ol style="margin:12px 0;padding-left:20px;line-height:1.8;">
          <li>Tap the <strong>Share</strong> button <span style="font-size:18px;">⎋</span> in Safari</li>
          <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
          <li>Tap <strong>Add</strong> — the app will appear on your home screen</li>
        </ol>
        <p style="font-size:12px;color:#9ca3af;margin-top:8px;">Once added, it opens as a full-screen app with no browser bars.</p>
      `;
    } else if (isAndroid()) {
      title = "Install on Android";
      instructions = `
        <ol style="margin:12px 0;padding-left:20px;line-height:1.8;">
          <li>Tap the <strong>⋮</strong> menu in your browser</li>
          <li>Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong></li>
          <li>Confirm by tapping <strong>Install</strong></li>
        </ol>
        <p style="font-size:12px;color:#9ca3af;margin-top:8px;">The app will be added to your home screen and app drawer.</p>
      `;
    } else {
      title = "Install Vertex Chamber";
      instructions = `
        <ol style="margin:12px 0;padding-left:20px;line-height:1.8;">
          <li>Click the <strong>⋮</strong> or <strong>≡</strong> menu in your browser</li>
          <li>Select <strong>"Install Vertex Chamber"</strong> or <strong>"Install as app"</strong></li>
          <li>Click <strong>Install</strong> when prompted</li>
        </ol>
        <p style="font-size:12px;color:#9ca3af;margin-top:8px;">Works in Chrome, Edge, and other Chromium browsers.</p>
      `;
    }

    const modal = document.createElement("div");
    modal.id = "vcInstallHelp";
    modal.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);";
    modal.innerHTML = `
      <div style="width:min(92vw,400px);background:linear-gradient(135deg,#111827,#1a1a2e);border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:24px;color:#fff;box-shadow:0 24px 64px rgba(0,0,0,.5);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div style="font-weight:800;font-size:18px;display:flex;align-items:center;gap:10px;">
            <i class="fas fa-mobile-alt" style="color:#00d4ff;"></i>
            ${title}
          </div>
          <button id="vcInstallHelpClose" style="background:none;border:none;color:#9ca3af;font-size:20px;cursor:pointer;padding:4px 8px;border-radius:8px;transition:all 0.2s;">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div style="font-size:14px;color:#d1d5db;line-height:1.6;">
          ${instructions}
        </div>
        <div style="display:flex;gap:10px;margin-top:20px;">
          <button id="vcInstallHelpDismiss" style="flex:1;border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:12px;background:rgba(255,255,255,.05);color:#d1d5db;font-weight:600;cursor:pointer;font-size:13px;transition:all 0.2s;">
            Maybe later
          </button>
        </div>
      </div>
    `;

    const closeBtn = modal.querySelector("#vcInstallHelpClose");
    const dismissBtn = modal.querySelector("#vcInstallHelpDismiss");

    const close = () => { modal.style.display = "none"; };
    const dismiss = () => { dismissInstall(); close(); };

    closeBtn.addEventListener("click", close);
    dismissBtn.addEventListener("click", dismiss);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });

    // Style the close/dismiss buttons on hover
    [closeBtn, dismissBtn].forEach(btn => {
      btn.addEventListener("mouseenter", () => { btn.style.background = "rgba(255,255,255,.1)"; });
      btn.addEventListener("mouseleave", () => { btn.style.background = ""; });
    });

    document.body.appendChild(modal);
  }

  function updateInstallButtonVisibility() {
    // Don't show if installed as PWA
    if (isStandalone()) {
      const btn = document.getElementById("vcInstallBtn");
      if (btn) btn.style.display = "none";
      return;
    }

    // Don't show if dismissed recently
    if (isInstallDismissed()) return;

    // Show button — it will display if we have deferredPrompt, or always as a helper
    const btn = ensureInstallButton();
    if (!btn) return;

    // On Android with native prompt, only show if prompt is available
    if (isAndroid() && !deferredPrompt) {
      btn.style.display = "none";
    } else {
      btn.style.display = "inline-flex";
    }
  }

  // Listen for native install prompt (Android Chrome, desktop Chrome/Edge)
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log("✅ beforeinstallprompt fired — app is installable");
    updateInstallButtonVisibility();
  });

  // Hide button after successful install
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    const btn = document.getElementById("vcInstallBtn");
    if (btn) btn.style.display = "none";
    console.log("✅ App installed successfully");
  });

  // Check on DOMContentLoaded
  window.addEventListener("DOMContentLoaded", () => {
    const btn = ensureInstallButton();
    if (btn) {
      btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        dismissInstall();
        btn.style.display = "none";
      });
    }
    updateInstallButtonVisibility();

    // Re-check after a short delay (sometimes beforeinstallprompt fires late)
    setTimeout(updateInstallButtonVisibility, 2000);
    setTimeout(updateInstallButtonVisibility, 5000);
  });
})();
