// pwa.js — Universal PWA Install (Desktop, Mobile, Tablet)
(function () {
  if (!("serviceWorker" in navigator)) return;

  let deferredPrompt = null;
  const INSTALL_STORAGE_KEY = "vc_install_dismissed_until";
  const DISMISS_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

  function isIOS() {
    const ua = navigator.userAgent || "";
    return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function isAndroid() {
    return /Android/.test(navigator.userAgent || "");
  }

  function isMobile() {
    return isIOS() || isAndroid() || /Mobi|Android/i.test(navigator.userAgent || "");
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

      // Check for updates periodically
      setInterval(() => reg.update(), 60 * 60 * 1000);
    } catch (e) {
      console.warn("⚠️ Service Worker registration failed:", e);
    }
  });

  function isInstallDismissed() {
    try {
      const until = parseInt(localStorage.getItem(INSTALL_STORAGE_KEY) || "0");
      return Date.now() < until;
    } catch { return false; }
  }

  function dismissInstall() {
    try { localStorage.setItem(INSTALL_STORAGE_KEY, Date.now() + DISMISS_DURATION_MS); } catch {}
  }

  function createInstallButton() {
    if (isStandalone()) return null;
    const existing = document.getElementById("vcInstallBtn");
    if (existing) return existing;

    const btn = document.createElement("button");
    btn.id = "vcInstallBtn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Install Vertex Chamber app");
    btn.innerHTML = '<i class="fas fa-download"></i><span>Install App</span>';

    const isTouchDevice = isMobile();
    const topOffset = isTouchDevice ? "calc(16px + env(safe-area-inset-top, 0px))" : "16px";
    const fontSize = isTouchDevice ? "12px" : "13px";
    const padding = isTouchDevice ? "10px 14px" : "10px 18px";

    btn.style.cssText = `
      position: fixed;
      left: 50%;
      transform: translateX(-50%);
      top: ${topOffset};
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 8px;
      border: none;
      border-radius: 999px;
      padding: ${padding};
      color: #fff;
      font-family: 'Inter', 'Segoe UI', sans-serif;
      font-weight: 700;
      font-size: ${fontSize};
      letter-spacing: 0.01em;
      background: linear-gradient(135deg, #00d4ff 0%, #7f5cff 50%, #00d4ff 100%);
      background-size: 200% auto;
      box-shadow: 0 6px 20px rgba(0, 212, 255, 0.4), 0 0 0 1px rgba(255,255,255,0.15) inset, 0 0 30px rgba(127, 92, 255, 0.2);
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      animation: gradientSlide 3s linear infinite, btnPulse 2s ease-in-out infinite;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      white-space: nowrap;
      flex-shrink: 0;
    `;

    // Inject animation keyframes
    if (!document.getElementById("vcInstallBtnStyles")) {
      const style = document.createElement("style");
      style.id = "vcInstallBtnStyles";
      style.textContent = `
        @keyframes gradientSlide {
          0% { background-position: 0% center; }
          100% { background-position: 200% center; }
        }
        @keyframes btnPulse {
          0%, 100% { box-shadow: 0 6px 20px rgba(0, 212, 255, 0.4), 0 0 0 1px rgba(255,255,255,0.15) inset, 0 0 30px rgba(127, 92, 255, 0.2); }
          50% { box-shadow: 0 8px 28px rgba(0, 212, 255, 0.5), 0 0 0 1px rgba(255,255,255,0.2) inset, 0 0 40px rgba(127, 92, 255, 0.35); }
        }
      `;
      document.head.appendChild(style);
    }

    if (isTouchDevice) {
      btn.addEventListener("touchstart", () => {
        btn.style.transform = "translateX(-50%) scale(0.95)";
        btn.style.animation = "none";
      }, { passive: true });
      btn.addEventListener("touchend", () => {
        btn.style.transform = "translateX(-50%)";
        btn.style.animation = "";
      }, { passive: true });
    } else {
      btn.addEventListener("mouseenter", () => {
        btn.style.transform = "translateX(-50%) translateY(-2px) scale(1.04)";
        btn.style.boxShadow = "0 12px 36px rgba(0, 212, 255, 0.5), 0 0 0 1px rgba(255,255,255,0.2) inset, 0 0 50px rgba(127, 92, 255, 0.3)";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.transform = "translateX(-50%)";
        btn.style.boxShadow = "";
      });
    }

    btn.addEventListener("click", handleInstallClick);
    document.body.appendChild(btn);
    return btn;
  }

  async function handleInstallClick() {
    const btn = document.getElementById("vcInstallBtn");

    // Native install prompt available (Android Chrome, desktop Chrome/Edge, Samsung Internet)
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log("Install outcome:", outcome);
        if (outcome === "accepted") {
          // Show confirmation instead of hiding
          if (btn) {
            btn.innerHTML = '<i class="fas fa-check-circle"></i><span>Installed!</span>';
            btn.disabled = true;
            btn.style.opacity = "0.7";
            btn.style.cursor = "default";
            btn.style.animation = "none";
          }
          showToast("🎉 App installed successfully! Check your home screen.");
        } else {
          showToast("Install cancelled. You can always install later.");
        }
      } catch (e) {
        console.warn("Install prompt error:", e);
        showInstallGuide();
      }
      deferredPrompt = null;
      return;
    }

    // Already installed
    if (isStandalone()) {
      if (btn) btn.style.display = "none";
      return;
    }

    // No native prompt (iOS Safari, iOS Chrome, Firefox) — show visual guide
    showInstallGuide();
  }

  function showInstallGuide() {
    const existing = document.getElementById("vcInstallGuide");
    if (existing) { existing.style.display = "flex"; return; }

    const isIOSDevice = isIOS();
    const isAndroidDevice = isAndroid();

    let steps, browserIcon, browserName;

    if (isIOSDevice) {
      const isChromeOnIOS = /CriOS/.test(navigator.userAgent);
      if (isChromeOnIOS) {
        browserIcon = '<i class="fab fa-chrome" style="font-size:22px;"></i>';
        browserName = "Chrome on iPhone";
        steps = [
          { icon: "share-from-app", text: "Tap the <strong>Share</strong> icon at the top of Chrome" },
          { icon: "fas fa-plus-square", text: "Scroll down and tap <strong>Add to Home Screen</strong>" },
          { icon: "fas fa-check-circle", text: "Tap <strong>Add</strong> — the app icon appears on your home screen" },
        ];
      } else {
        browserIcon = '<i class="fab fa-safari" style="font-size:22px;"></i>';
        browserName = "Safari";
        steps = [
          { icon: "share-from-app", text: "Tap the <strong>Share</strong> button at the bottom of Safari" },
          { icon: "fas fa-plus-square", text: "Scroll down and tap <strong>Add to Home Screen</strong>" },
          { icon: "fas fa-check-circle", text: "Tap <strong>Add</strong> in the top-right corner" },
        ];
      }
    } else if (isAndroidDevice) {
      const isSamsungBrowser = /SamsungBrowser/i.test(navigator.userAgent);
      const isFirefox = /Firefox/i.test(navigator.userAgent);
      if (isSamsungBrowser) {
        browserIcon = '<i class="fas fa-globe" style="font-size:22px;"></i>';
        browserName = "Samsung Internet";
        steps = [
          { icon: "fas fa-bars", text: "Tap the <strong>☰</strong> menu button" },
          { icon: "fas fa-plus-square", text: "Tap <strong>Add page to</strong> → <strong>Home screen</strong>" },
          { icon: "fas fa-check-circle", text: "Tap <strong>Add</strong> — done!" },
        ];
      } else if (isFirefox) {
        browserIcon = '<i class="fab fa-firefox-browser" style="font-size:22px;"></i>';
        browserName = "Firefox";
        steps = [
          { icon: "fas fa-ellipsis-v", text: "Tap the <strong>⋮</strong> menu button" },
          { icon: "fas fa-plus-square", text: "Tap <strong>Install</strong> or <strong>Add to Home screen</strong>" },
          { icon: "fas fa-check-circle", text: "Confirm by tapping <strong>Add</strong>" },
        ];
      } else {
        browserIcon = '<i class="fab fa-chrome" style="font-size:22px;"></i>';
        browserName = "Chrome";
        steps = [
          { icon: "fas fa-ellipsis-v", text: "Tap the <strong>⋮</strong> menu at the top-right" },
          { icon: "fas fa-mobile-alt", text: "Tap <strong>Install app</strong> in the menu" },
          { icon: "fas fa-check-circle", text: "Tap <strong>Install</strong> on the confirmation dialog" },
        ];
      }
    } else {
      browserIcon = '<i class="fas fa-desktop" style="font-size:22px;"></i>';
      browserName = "your browser";
      steps = [
        { icon: "fas fa-ellipsis-v", text: "Click the browser menu (⋮ or ≡)" },
        { icon: "fas fa-download", text: "Select <strong>Install Vertex Chamber</strong>" },
        { icon: "fas fa-check-circle", text: "Click <strong>Install</strong>" },
      ];
    }

    const shareIconSVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;

    const stepsHTML = steps.map((step, i) => {
      const iconHTML = step.icon === "share-from-app" ? shareIconSVG : `<i class="${step.icon}" style="font-size:20px;"></i>`;
      return `
        <div style="display:flex;align-items:flex-start;gap:16px;padding:16px 0;border-bottom:${i < steps.length - 1 ? '1px solid rgba(255,255,255,.08)' : 'none'};opacity:0;animation:stepFadeIn 0.4s ease forwards;animation-delay:${i * 0.2}s;">
          <div style="width:42px;height:42px;min-width:42px;border-radius:12px;background:linear-gradient(135deg,rgba(0,212,255,.15),rgba(127,92,255,.15));display:flex;align-items:center;justify-content:center;color:#00d4ff;border:1px solid rgba(0,212,255,.2);">
            ${iconHTML}
          </div>
          <div style="flex:1;padding-top:4px;">
            <div style="font-size:13px;color:#d1d5db;line-height:1.5;">
              <span style="color:#00d4ff;font-weight:700;">Step ${i + 1}:</span> ${step.text}
            </div>
          </div>
        </div>
      `;
    }).join("");

    const overlay = document.createElement("div");
    overlay.id = "vcInstallGuide";
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 2147483647;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
      padding: 20px;
      animation: overlayFadeIn 0.3s ease;
    `;

    overlay.innerHTML = `
      <style>
        @keyframes overlayFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalSlideUp { from { opacity: 0; transform: translateY(40px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes stepFadeIn { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
      </style>
      <div style="width:100%;max-width:420px;background:linear-gradient(160deg,#111827 0%,#1a1a2e 50%,#0f172a 100%);border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:28px;color:#fff;box-shadow:0 32px 64px rgba(0,0,0,.5),0 0 60px rgba(0,212,255,.08);animation:modalSlideUp 0.4s cubic-bezier(0.22,1,0.36,1) forwards;position:relative;overflow:hidden;">
        <!-- Shimmer bar at top -->
        <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,#00d4ff,#7f5cff,transparent);background-size:200% auto;animation:shimmer 2s linear infinite;"></div>

        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
          <div style="display:flex;align-items:center;gap:14px;">
            <div style="width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#00d4ff,#7f5cff);display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 4px 16px rgba(0,212,255,.3);">
              <i class="fas fa-mobile-alt"></i>
            </div>
            <div>
              <div style="font-weight:800;font-size:18px;">Install Vertex Chamber</div>
              <div style="font-size:12px;color:#9ca3af;display:flex;align-items:center;gap:6px;margin-top:2px;">
                ${browserIcon}
                <span>Works on ${browserName}</span>
              </div>
            </div>
          </div>
          <button id="vcGuideClose" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:16px;cursor:pointer;transition:all .2s;">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <!-- Steps -->
        <div style="padding:0 4px;">
          ${stepsHTML}
        </div>

        <!-- Info box -->
        <div style="margin-top:20px;padding:14px 16px;background:rgba(0,212,255,.06);border:1px solid rgba(0,212,255,.15);border-radius:14px;display:flex;align-items:flex-start;gap:10px;">
          <i class="fas fa-lightbulb" style="color:#00d4ff;font-size:16px;margin-top:2px;"></i>
          <div style="font-size:12px;color:#9ca3af;line-height:1.5;">
            Once installed, Vertex Chamber opens as a <strong style="color:#fff;">full-screen app</strong> with no browser bars — just like a native app from the store.
          </div>
        </div>

        <!-- Footer -->
        <div style="display:flex;gap:10px;margin-top:20px;">
          <button id="vcGuideDismiss" style="flex:1;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:14px;background:rgba(255,255,255,.04);color:#d1d5db;font-weight:600;cursor:pointer;font-size:13px;transition:all .2s;font-family:inherit;">
            I'll do it later
          </button>
          <button id="vcGuideGotIt" style="flex:1;border:none;border-radius:14px;padding:14px;background:linear-gradient(135deg,#00d4ff,#7f5cff);color:#fff;font-weight:700;cursor:pointer;font-size:13px;transition:all .2s;font-family:inherit;box-shadow:0 4px 16px rgba(0,212,255,.3);">
            Got it!
          </button>
        </div>
      </div>
    `;

    // Event handlers
    const close = () => { overlay.style.animation = "overlayFadeIn 0.2s ease reverse forwards"; setTimeout(() => overlay.remove(), 200); };
    const dismiss = () => { dismissInstall(); close(); };

    overlay.querySelector("#vcGuideClose").addEventListener("click", close);
    overlay.querySelector("#vcGuideDismiss").addEventListener("click", dismiss);
    overlay.querySelector("#vcGuideGotIt").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    document.body.appendChild(overlay);
  }

  function showToast(message) {
    const existing = document.querySelector(".vc-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "vc-toast";
    toast.style.cssText = `
      position: fixed; bottom: calc(100px + env(safe-area-inset-bottom, 0px)); left: 50%; transform: translateX(-50%) translateY(20px);
      background: rgba(17, 24, 39, 0.95); border: 1px solid rgba(0, 212, 255, 0.3);
      color: #fff; padding: 12px 24px; border-radius: 14px; font-size: 14px;
      font-family: 'Inter', sans-serif; font-weight: 500; z-index: 2147483647;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4); backdrop-filter: blur(10px);
      max-width: 90vw; text-align: center; opacity: 0;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateX(-50%) translateY(0)";
    });

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(20px)";
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function updateButtonVisibility() {
    if (isStandalone()) {
      const btn = document.getElementById("vcInstallBtn");
      if (btn) { btn.style.display = "none"; btn.style.animation = "none"; }
      return;
    }
    if (isInstallDismissed()) {
      const btn = document.getElementById("vcInstallBtn");
      if (btn) btn.style.display = "none";
      return;
    }
    // Check if app is already installed via getInstalledRelatedApps API
    if (navigator.getInstalledRelatedApps) {
      navigator.getInstalledRelatedApps().then(apps => {
        if (apps.length > 0) {
          const btn = document.getElementById("vcInstallBtn");
          if (btn) btn.style.display = "none";
          return;
        }
        const btn = createInstallButton();
        if (btn) btn.style.display = "flex";
      });
    } else {
      const btn = createInstallButton();
      if (btn) btn.style.display = "flex";
    }
  }

  // Capture native install prompt
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log("✅ beforeinstallprompt fired — installable");
    updateButtonVisibility();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    const btn = document.getElementById("vcInstallBtn");
    if (btn) btn.style.display = "none";
    showToast("🎉 App installed successfully!");
  });

  // Initialize
  window.addEventListener("DOMContentLoaded", () => {
    const btn = createInstallButton();
    if (btn) {
      btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        dismissInstall();
        btn.style.display = "none";
      });
    }
    updateButtonVisibility();
    // Delayed checks for late-firing beforeinstallprompt
    setTimeout(updateButtonVisibility, 3000);
    setTimeout(updateButtonVisibility, 8000);
  });
})();
