// app_shell.js — Shared “logged-in shell” for Vertex pages
// - Enforces session login (redirects to login.html)
// - Loads current user profile from Firestore
// - Sets default avatar until user uploads one
// - Wires the top-right avatar dropdown (Profile / Edit photo / Sign out)

import { db, getSessionEmail, emailToId } from "./firebase.js";
import { doc, getDoc, setDoc, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const DEFAULT_AVATAR_SVG = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#00D4FF"/>
      <stop offset="1" stop-color="#8A2BE2"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="128" fill="#0B0F1A"/>
  <circle cx="128" cy="98" r="42" fill="url(#g)" opacity="0.95"/>
  <path d="M48 222c12-44 46-66 80-66s68 22 80 66" fill="url(#g)" opacity="0.55"/>
  <circle cx="128" cy="128" r="106" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
</svg>
`);

const DEFAULT_AVATAR = `data:image/svg+xml,${DEFAULT_AVATAR_SVG}`;

function signOut() {
  localStorage.removeItem("vertex_session_email");
  localStorage.removeItem("vertex_session_expiry");
  localStorage.removeItem("vertex_username");
  localStorage.removeItem("vertex_profile_completed");
  localStorage.removeItem("vertex_avatar");
  window.location.href = "login.html";
}

function ensureAvatarDefaults() {
  try {
    const existing = localStorage.getItem("vertex_avatar");
    if (!existing) localStorage.setItem("vertex_avatar", DEFAULT_AVATAR);
  } catch {}
}

function buildAvatarMenu() {
  if (document.getElementById("vcAvatarMenu")) return;

  const menu = document.createElement("div");
  menu.id = "vcAvatarMenu";
  menu.style.cssText = `
    position: absolute;
    top: 52px;
    right: 0;
    min-width: 210px;
    background: rgba(18, 24, 38, 0.95);
    border: 1px solid rgba(255,255,255,0.10);
    border-radius: 14px;
    backdrop-filter: blur(14px);
    box-shadow: 0 18px 60px rgba(0,0,0,0.55);
    overflow: hidden;
    z-index: 9999;
    display: none;
  `;
  menu.innerHTML = `
    <button class="vc-menu-item" data-action="profile" style="width:100%;background:none;border:none;color:#fff;padding:12px 14px;text-align:left;cursor:pointer;display:flex;align-items:center;gap:10px;">
      <i class="fas fa-user" style="color:#00D4FF;width:18px;"></i> My Profile
    </button>
    <button class="vc-menu-item" data-action="avatar" style="width:100%;background:none;border:none;color:#fff;padding:12px 14px;text-align:left;cursor:pointer;display:flex;align-items:center;gap:10px;">
      <i class="fas fa-camera" style="color:#8A2BE2;width:18px;"></i> Edit Photo
    </button>
    <div style="height:1px;background:rgba(255,255,255,0.08);"></div>
    <button class="vc-menu-item" data-action="signout" style="width:100%;background:none;border:none;color:#fff;padding:12px 14px;text-align:left;cursor:pointer;display:flex;align-items:center;gap:10px;">
      <i class="fas fa-right-from-bracket" style="color:#ff4d6d;width:18px;"></i> Sign out
    </button>
  `;

  menu.addEventListener("click", (e) => {
    const btn = e.target.closest(".vc-menu-item");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    closeAvatarMenu();
    if (action === "profile") window.location.href = "profile.html";
    if (action === "avatar") window.location.href = "profile.html#avatar";
    if (action === "signout") signOut();
  });

  const userMenu = document.querySelector(".user-menu");
  if (userMenu) userMenu.appendChild(menu);

  document.addEventListener("click", (e) => {
    const within = e.target.closest(".user-menu");
    if (!within) closeAvatarMenu();
  });
}

function openAvatarMenu() {
  const m = document.getElementById("vcAvatarMenu");
  if (m) m.style.display = "block";
}

function closeAvatarMenu() {
  const m = document.getElementById("vcAvatarMenu");
  if (m) m.style.display = "none";
}

function toggleAvatarMenu() {
  const m = document.getElementById("vcAvatarMenu");
  if (!m) return;
  m.style.display = m.style.display === "block" ? "none" : "block";
}

async function loadAndApplyUser() {
  const email = getSessionEmail();
  if (!email) {
    window.location.href = "login.html";
    return;
  }

  ensureAvatarDefaults();

  const userId = emailToId(email);
  const userRef = doc(db, "users", userId);
  let avatar = null;
  let username = null;

  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const d = snap.data();
      avatar = d.avatarBase64 || null;
      username = d.username || null;
    } else {
      // create minimal doc so user appears in user lists until profile completion
      await setDoc(userRef, { userId, email, profileCompleted: false, createdAt: new Date().toISOString() }, { merge: true });
    }
  } catch {
    // best-effort; still render local cached avatar
  }

  // Cache + render avatar
  try {
    if (avatar) localStorage.setItem("vertex_avatar", avatar);
  } catch {}
  const finalAvatar = avatar || localStorage.getItem("vertex_avatar") || DEFAULT_AVATAR;

  const img = document.getElementById("userAvatarImg") || document.querySelector(".user-avatar img");
  if (img) img.src = finalAvatar;

  // Optional: set tooltip / aria label
  const btn = document.getElementById("userAvatarBtn") || document.querySelector(".user-avatar");
  if (btn) {
    btn.setAttribute("title", username ? `@${username}` : email);
    btn.setAttribute("aria-label", "Open profile menu");
  }

  // Notifications badge: count unread "notifications" docs for this user
  const badge = document.getElementById("notificationBadge") || document.querySelector(".notification-badge");
  if (badge) {
    try {
      const qRef = query(
        collection(db, "notifications"),
        where("userId", "==", userId),
        where("read", "==", false),
      );
      onSnapshot(qRef, (snap) => {
        const n = snap.size || 0;
        badge.textContent = String(n);
        badge.style.display = n > 0 ? "flex" : "none";

        // Unread messages red dot (bottom nav)
        try {
          let msgN = 0;
          snap.forEach((d) => {
            const data = d.data() || {};
            if (data.type === "message") msgN++;
          });
          localStorage.setItem("vertex_unread_messages_count", String(msgN));
          window.dispatchEvent(new CustomEvent("vc:unreadMessages", { detail: { count: msgN } }));
        } catch {}
      });
    } catch {
      badge.style.display = "none";
    }
  }
}

function wireAvatarButton() {
  const btn = document.getElementById("userAvatarBtn") || document.querySelector(".user-avatar");
  if (!btn) return;

  // If it’s a div in existing markup, make it keyboard accessible
  if (btn.tagName !== "BUTTON") {
    btn.setAttribute("role", "button");
    btn.setAttribute("tabindex", "0");
  }

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleAvatarMenu();
  });
  btn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleAvatarMenu();
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  buildAvatarMenu();
  wireAvatarButton();
  await loadAndApplyUser();
});

