// bottom_nav.js — Mobile bottom tab bar (Home / Feed / Chamber / Workspace / Messages / Profile)
// Plain script (no imports) so it can be included everywhere (including messages.html).

(function () {
  const NAV_ID = "vcBottomNav";
  const STYLE_ID = "vcBottomNavStyle";

  function currentFile() {
    const p = window.location.pathname.split("/").pop() || "";
    return p || "splash.html";
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
      :root { --vc-bottom-nav-h: 72px; }
      body.vc-has-bottom-nav { padding-bottom: calc(var(--vc-bottom-nav-h) + env(safe-area-inset-bottom, 0px)); }
      @media (min-width: 769px) { body.vc-has-bottom-nav { padding-bottom: 0; } }
      #${NAV_ID} {
        position: fixed;
        left: 0; right: 0;
        bottom: 0;
        height: var(--vc-bottom-nav-h);
        padding-bottom: env(safe-area-inset-bottom, 0px);
        display: none;
        align-items: center;
        justify-content: space-around;
        background: rgba(11, 15, 26, 0.92);
        border-top: 1px solid rgba(255,255,255,0.08);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        z-index: 9999;
      }
      @media (max-width: 768px) { #${NAV_ID} { display: flex; } }
      #${NAV_ID} a {
        flex: 1;
        text-decoration: none;
        color: rgba(176, 183, 195, 0.92);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 10px 6px;
        font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      #${NAV_ID} a i { font-size: 18px; }
      #${NAV_ID} a { position: relative; }
      #${NAV_ID} .vc-nav-dot {
        position: absolute;
        top: 10px;
        right: calc(50% - 18px);
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: #ff2e55;
        box-shadow: 0 0 0 2px rgba(11, 15, 26, 0.92), 0 8px 18px rgba(255, 46, 85, 0.25);
        display: none;
      }
      #${NAV_ID} a.active {
        color: #fff;
      }
      #${NAV_ID} a.active i {
        color: #00D4FF;
        filter: drop-shadow(0 0 10px rgba(0,212,255,0.28));
      }
    `;
    document.head.appendChild(s);
  }

  function buildNav() {
    if (document.getElementById(NAV_ID)) return;
    ensureStyles();

    const nav = document.createElement("nav");
    nav.id = NAV_ID;
    nav.setAttribute("aria-label", "Bottom navigation");

    nav.innerHTML = `
      <a href="splash.html" data-page="splash.html"><i class="fas fa-house"></i><span>Home</span></a>
      <a href="feed.html" data-page="feed.html"><i class="fas fa-stream"></i><span>Feed</span></a>
      <a href="chambers.html" data-page="chambers.html"><i class="fas fa-door-closed"></i><span>Chamber</span></a>
      <a href="workspace.html" data-page="workspace.html"><i class="fas fa-code"></i><span>Workspace</span></a>
      <a href="messages.html" data-page="messages.html" data-nav="messages">
        <i class="fas fa-comments"></i>
        <span class="vc-nav-dot" aria-hidden="true"></span>
        <span>Messages</span>
      </a>
      <a href="profile.html" data-page="profile.html"><i class="fas fa-user"></i><span>Profile</span></a>
    `;

    document.body.appendChild(nav);
    document.body.classList.add("vc-has-bottom-nav");

    const file = currentFile();
    nav.querySelectorAll("a").forEach((a) => {
      if (a.getAttribute("data-page") === file) a.classList.add("active");
    });

    function updateDot() {
      try {
        const n = parseInt(localStorage.getItem("vertex_unread_messages_count") || "0", 10) || 0;
        const dot = nav.querySelector('[data-nav="messages"] .vc-nav-dot');
        const onMessages = file === "messages.html";
        if (dot) dot.style.display = (!onMessages && n > 0) ? "block" : "none";
      } catch {}
    }
    updateDot();
    window.addEventListener("storage", updateDot);
    document.addEventListener("visibilitychange", updateDot);
    window.addEventListener("vc:unreadMessages", updateDot);
  }

  // Do not show on login page
  if (currentFile() === "login.html") return;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildNav);
  } else {
    buildNav();
  }
})();

