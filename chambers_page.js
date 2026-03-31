// chambers_page.js — Firestore-backed chambers + join requests
import { db, getSessionEmail, emailToId } from "./firebase.js";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const DEFAULT_CHAMBERS = [
  {
    id: "ai_ml",
    name: "AI & Machine Learning",
    subtitle: "Advanced Intelligence Hub",
    description:
      "From neural networks to generative AI, build the future of intelligent systems. Collaborate on research and practical AI applications.",
    iconClass: "fas fa-robot",
    tags: ["Neural Networks", "Computer Vision", "NLP", "RL", "Generative AI"],
  },
  {
    id: "web_mobile",
    name: "Web & Mobile",
    subtitle: "Digital Experience Lab",
    description:
      "Build responsive web apps, cross-platform mobile solutions, and PWAs. Modern frameworks, best practices, and performance optimization.",
    iconClass: "fas fa-code",
    tags: ["React", "Vue", "React Native", "Flutter", "Node.js"],
  },
  {
    id: "hardware_iot",
    name: "Hardware & IoT",
    subtitle: "Physical–Digital Bridge",
    description:
      "From smart devices to embedded systems, connect the physical and digital worlds. Build innovative hardware + software solutions.",
    iconClass: "fas fa-microchip",
    tags: ["Arduino", "Raspberry Pi", "Embedded", "Robotics", "Smart Devices"],
  },
  {
    id: "social_impact",
    name: "Social Impact",
    subtitle: "Technology for Good",
    description:
      "Build solutions for social, environmental, and humanitarian challenges. Make measurable impact through innovation.",
    iconClass: "fas fa-globe-americas",
    tags: ["Sustainability", "Education", "Healthcare", "Accessibility", "Climate Tech"],
  },
];

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toast(msg) {
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText =
    "position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:rgba(18,24,38,0.95);border:1px solid rgba(255,255,255,0.12);color:#fff;padding:12px 18px;border-radius:12px;z-index:9999;box-shadow:0 18px 60px rgba(0,0,0,0.55);backdrop-filter:blur(10px);max-width:92vw;";
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 250);
  }, 2500);
}

function chamberStatsFallback(chamber) {
  // If you don’t store stats yet, keep UI consistent with safe defaults
  return {
    memberCount: chamber.memberCount ?? 0,
    activeProjects: chamber.activeProjects ?? 0,
    launchedCount: chamber.launchedCount ?? 0,
  };
}

async function ensureSeedChambers() {
  const snap = await getDocs(query(collection(db, "chambers"), limit(1)));
  if (!snap.empty) return;
  await Promise.all(
    DEFAULT_CHAMBERS.map((c) =>
      setDoc(
        doc(db, "chambers", c.id),
        {
          name: c.name,
          subtitle: c.subtitle,
          description: c.description,
          iconClass: c.iconClass,
          tags: c.tags,
          requiresApproval: true,
          visibility: "public",
          memberCount: 0,
          activeProjects: 0,
          launchedCount: 0,
          createdAt: serverTimestamp(),
        },
        { merge: true },
      ),
    ),
  );
}

function renderChambers(container, chambers, myStateByChamberId) {
  container.innerHTML = "";

  chambers.forEach((ch) => {
    const stats = chamberStatsFallback(ch);
    const mine = myStateByChamberId[ch.id] || { status: "none" };
    const statusPill =
      mine.status === "member"
        ? `<span style="display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;background:rgba(0,255,179,0.10);border:1px solid rgba(0,255,179,0.25);color:#00ffb3;font-weight:700;font-size:12px;">
             <i class="fas fa-check"></i> Member
           </span>`
        : mine.status === "pending"
          ? `<span style="display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;background:rgba(255,193,7,0.10);border:1px solid rgba(255,193,7,0.25);color:#ffc107;font-weight:700;font-size:12px;">
               <i class="fas fa-hourglass-half"></i> Pending approval
             </span>`
          : mine.status === "rejected"
            ? `<span style="display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;background:rgba(255,77,109,0.10);border:1px solid rgba(255,77,109,0.25);color:#ff4d6d;font-weight:700;font-size:12px;">
                 <i class="fas fa-xmark"></i> Request denied
               </span>`
            : "";

    const joinBtn =
      mine.status === "member"
        ? `<button class="btn btn-secondary" disabled style="opacity:0.55"><i class="fas fa-check"></i> Joined</button>
           <button class="btn btn-primary" data-teamchat="${ch.id}">
             <i class="fas fa-comments"></i> Open Team Chat
           </button>`
        : mine.status === "pending"
          ? `<button class="btn btn-secondary" disabled style="opacity:0.55"><i class="fas fa-hourglass-half"></i> Pending</button>`
          : `<button class="btn btn-primary" data-join="${ch.id}"><i class="fas fa-door-open"></i> Request to Join</button>`;

    const card = document.createElement("div");
    card.className = "glass-card chamber-card-large";
    card.setAttribute("data-chamber", ch.id);
    card.innerHTML = `
      <div class="chamber-header">
        <div class="chamber-icon-large gradient-bg">
          <i class="${escapeHtml(ch.iconClass || "fas fa-door-open")}"></i>
        </div>
        <div class="chamber-title" style="flex:1;min-width:0">
          <h3 style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <span style="min-width:0;overflow:hidden;text-overflow:ellipsis">${escapeHtml(ch.name || "Chamber")}</span>
            ${statusPill}
          </h3>
          <p>${escapeHtml(ch.subtitle || "Innovation Chamber")}</p>
        </div>
      </div>

      <div class="chamber-description">${escapeHtml(ch.description || "")}</div>

      <div class="chamber-stats-detailed">
        <div class="stat-item">
          <div class="stat-number">${Number(stats.memberCount || 0).toLocaleString()}</div>
          <div class="stat-label">Members</div>
        </div>
        <div class="stat-item">
          <div class="stat-number">${Number(stats.activeProjects || 0).toLocaleString()}</div>
          <div class="stat-label">Active Projects</div>
        </div>
        <div class="stat-item">
          <div class="stat-number">${Number(stats.launchedCount || 0).toLocaleString()}</div>
          <div class="stat-label">Launched</div>
        </div>
      </div>

      <div class="chamber-tags">
        ${(ch.tags || []).slice(0, 8).map((t) => `<span class="chamber-tag">${escapeHtml(t)}</span>`).join("")}
      </div>

      <div class="chamber-actions" style="flex-wrap:wrap">
        ${joinBtn}
        <a href="feed.html?chamber=${encodeURIComponent(ch.id)}" class="btn btn-secondary">
          <i class="fas fa-eye"></i> View Projects
        </a>
      </div>
    `;
    container.appendChild(card);
  });
}

async function openChamberTeamChat(chamberId, chamberName, myUserId) {
  // Deterministic conversation id so the chamber has one shared chat.
  const convDocId = `chamber_${chamberId}`;
  const convRef = doc(db, "conversations", convDocId);

  // Load members (soft limit to keep participants array reasonable).
  const membersSnap = await getDocs(
    query(collection(db, "chambers", chamberId, "members"), limit(200)),
  ).catch(() => null);
  const memberIds = [];
  if (membersSnap && !membersSnap.empty) {
    membersSnap.forEach((d) => memberIds.push(d.id));
  }
  if (!memberIds.includes(myUserId)) memberIds.push(myUserId);

  await setDoc(
    convRef,
    {
      type: "chamber",
      chamberId,
      name: chamberName || "Chamber Team Chat",
      participants: memberIds,
      updatedAt: serverTimestamp(),
      lastMessage: "",
      lastMessageTime: serverTimestamp(),
    },
    { merge: true },
  );

  // Open messages and auto-open this group conversation
  window.location.href = `messages.html?open=${encodeURIComponent("g_" + convDocId)}`;
}

async function getMyChamberState(userId) {
  const out = {};
  // pending requests
  const pendingSnap = await getDocs(
    query(collectionGroup(db, "joinRequests"), where("userId", "==", userId)),
  ).catch(() => null);
  if (pendingSnap && !pendingSnap.empty) {
    pendingSnap.forEach((d) => {
      const chamberId = d.ref.parent.parent?.id;
      if (chamberId) out[chamberId] = { status: d.data().status || "pending" };
    });
  }
  // memberships (fast path): check a small list of chambers we render (we’ll refine after chambers load)
  return out;
}

async function requestJoin(chamberId, userId) {
  const reqRef = doc(db, "chambers", chamberId, "joinRequests", userId);
  const existing = await getDoc(reqRef);
  if (existing.exists()) {
    const st = existing.data().status || "pending";
    toast(st === "pending" ? "Request already pending." : `Request status: ${st}`);
    return;
  }
  await setDoc(
    reqRef,
    {
      userId,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await setDoc(
    doc(collection(db, "notifications")),
    {
      userId,
      read: false,
      type: "chamber_request",
      title: "Join request submitted",
      body: `Your request to join "${chamberId}" is pending review.`,
      createdAt: serverTimestamp(),
      meta: { chamberId, status: "pending" },
    },
    { merge: true },
  );
  toast("Join request sent. Waiting for approval.");
}

// Admin panel (only shows if you are admin in that chamber)
async function isAdmin(chamberId, userId) {
  const memRef = doc(db, "chambers", chamberId, "members", userId);
  const snap = await getDoc(memRef).catch(() => null);
  return !!(snap && snap.exists() && (snap.data().role === "admin"));
}

async function decideRequest(chamberId, targetUserId, decisionUserId, decision) {
  const reqRef = doc(db, "chambers", chamberId, "joinRequests", targetUserId);
  await updateDoc(reqRef, {
    status: decision,
    updatedAt: serverTimestamp(),
    decidedBy: decisionUserId,
  });

  if (decision === "approved") {
    await setDoc(
      doc(db, "chambers", chamberId, "members", targetUserId),
      { userId: targetUserId, role: "member", joinedAt: serverTimestamp() },
      { merge: true },
    );
  }

  await setDoc(
    doc(collection(db, "notifications")),
    {
      userId: targetUserId,
      read: false,
      type: "chamber_request_decision",
      title: decision === "approved" ? "Chamber request approved" : "Chamber request denied",
      body:
        decision === "approved"
          ? `You’ve been approved to join "${chamberId}". Welcome in.`
          : `Your request to join "${chamberId}" was denied.`,
      createdAt: serverTimestamp(),
      meta: { chamberId, status: decision },
    },
    { merge: true },
  );
}

function ensureAdminPanel() {
  if (document.getElementById("adminPanel")) return;
  const joinSection = document.getElementById("join-chamber");
  if (!joinSection) return;

  const wrap = document.createElement("div");
  wrap.id = "adminPanel";
  wrap.className = "glass-card";
  wrap.style.cssText =
    "margin-top:28px;padding:20px;border:1px solid rgba(255,255,255,0.10);display:none;";
  wrap.innerHTML = `
    <h3 style="margin-bottom:14px;display:flex;align-items:center;gap:10px;">
      <i class="fas fa-shield-halved" style="color:var(--accent-primary)"></i>
      Chamber Admin · Pending Requests
    </h3>
    <div id="adminRequests" style="display:flex;flex-direction:column;gap:10px;"></div>
  `;
  joinSection.querySelector(".join-content")?.appendChild(wrap);
}

function renderAdminRequests(container, items) {
  if (!items.length) {
    container.innerHTML = `<div style="color:var(--text-secondary);font-size:14px;">No pending requests.</div>`;
    return;
  }
  container.innerHTML = items
    .map(
      (r) => `
    <div class="glass-card" style="padding:14px;display:flex;gap:12px;align-items:center;justify-content:space-between;">
      <div style="min-width:0">
        <div style="font-weight:800">${escapeHtml(r.userLabel || r.userId)}</div>
        <div style="color:var(--text-secondary);font-size:12px;">${escapeHtml(r.userId)}</div>
      </div>
      <div style="display:flex;gap:10px;flex-shrink:0">
        <button class="btn btn-secondary btn-sm" data-deny="${escapeHtml(r.userId)}" style="border-color:rgba(255,77,109,0.35);color:#ff4d6d;">
          <i class="fas fa-xmark"></i> Deny
        </button>
        <button class="btn btn-primary btn-sm" data-approve="${escapeHtml(r.userId)}">
          <i class="fas fa-check"></i> Approve
        </button>
      </div>
    </div>
  `,
    )
    .join("");
}

async function loadUserLabel(userId) {
  const u = await getDoc(doc(db, "users", userId)).catch(() => null);
  if (!u || !u.exists()) return userId;
  const d = u.data();
  return d.username ? `@${d.username}` : (d.email || userId);
}

document.addEventListener("DOMContentLoaded", async () => {
  const email = getSessionEmail();
  if (!email) return; // app_shell will redirect
  const myUserId = emailToId(email);

  const grid = document.querySelector(".chambers-grid-page");
  if (!grid) return;

  // Replace static cards with a loading state
  grid.innerHTML = `
    <div class="glass-card" style="padding:24px;grid-column:1/-1;">
      <div style="display:flex;align-items:center;gap:12px;">
        <i class="fas fa-spinner fa-pulse" style="color:var(--accent-primary)"></i>
        <div>
          <div style="font-weight:800">Loading chambers…</div>
          <div style="color:var(--text-secondary);font-size:13px;">Syncing the directory from the Chamber Core.</div>
        </div>
      </div>
    </div>
  `;

  ensureAdminPanel();

  await ensureSeedChambers();

  let selectedChamberId = null;
  const joinNowBtn = document.getElementById("joinNowBtn");
  const adminPanel = document.getElementById("adminPanel");
  const adminRequests = document.getElementById("adminRequests");

  const chambersQ = query(collection(db, "chambers"), orderBy("name", "asc"));
  onSnapshot(chambersQ, async (snap) => {
    const chambers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Determine selected chamber (keep previous if exists)
    if (!selectedChamberId || !chambers.find((c) => c.id === selectedChamberId)) {
      selectedChamberId = chambers[0]?.id || null;
    }

    // Load my state per chamber (pending/approved/denied/member)
    const state = {};
    await Promise.all(
      chambers.map(async (c) => {
        const mem = await getDoc(doc(db, "chambers", c.id, "members", myUserId)).catch(() => null);
        if (mem && mem.exists()) {
          state[c.id] = { status: "member" };
          return;
        }
        const req = await getDoc(doc(db, "chambers", c.id, "joinRequests", myUserId)).catch(() => null);
        if (req && req.exists()) {
          state[c.id] = { status: req.data().status || "pending" };
        }
      }),
    );

    renderChambers(grid, chambers, state);

    // Highlight selected + update join section CTA
    if (selectedChamberId) {
      grid.querySelectorAll("[data-chamber]").forEach((el) => el.classList.remove("chamber-highlight"));
      const sel = grid.querySelector(`[data-chamber="${CSS.escape(selectedChamberId)}"]`);
      sel?.classList.add("chamber-highlight");
      const name = chambers.find((c) => c.id === selectedChamberId)?.name || "Selected Chamber";
      if (joinNowBtn) joinNowBtn.innerHTML = `<i class="fas fa-door-open"></i> Request to Join ${escapeHtml(name)}`;
    }

    // Admin panel: show only if current user is admin for selected chamber
    if (adminPanel && adminRequests && selectedChamberId) {
      const admin = await isAdmin(selectedChamberId, myUserId);
      adminPanel.style.display = admin ? "block" : "none";
      if (admin) {
        const pendingQ = query(
          collection(db, "chambers", selectedChamberId, "joinRequests"),
          where("status", "==", "pending"),
        );
        onSnapshot(pendingQ, async (reqSnap) => {
          const rows = await Promise.all(
            reqSnap.docs.map(async (d) => {
              const userId = d.id;
              return { userId, userLabel: await loadUserLabel(userId) };
            }),
          );
          renderAdminRequests(adminRequests, rows);
        });
      }
    }
  });

  // Click handling (select + join)
  grid.addEventListener("click", async (e) => {
    const joinBtn = e.target.closest("[data-join]");
    if (joinBtn) {
      const chamberId = joinBtn.getAttribute("data-join");
      await requestJoin(chamberId, myUserId);
      return;
    }
    const teamChatBtn = e.target.closest("[data-teamchat]");
    if (teamChatBtn) {
      const chamberId = teamChatBtn.getAttribute("data-teamchat");
      const chamber = (chambers || []).find((c) => c.id === chamberId);
      await openChamberTeamChat(chamberId, chamber?.name || "Chamber Team Chat", myUserId);
      return;
    }
    const card = e.target.closest("[data-chamber]");
    if (card) {
      selectedChamberId = card.getAttribute("data-chamber");
      document.getElementById("join-chamber")?.scrollIntoView({ behavior: "smooth" });
    }
  });

  // Join section primary CTA uses selected chamber
  joinNowBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!selectedChamberId) return;
    await requestJoin(selectedChamberId, myUserId);
  });

  // Admin approve/deny actions
  adminRequests?.addEventListener("click", async (e) => {
    const approve = e.target.closest("[data-approve]");
    const deny = e.target.closest("[data-deny]");
    if (!selectedChamberId) return;
    if (approve) {
      const target = approve.getAttribute("data-approve");
      await decideRequest(selectedChamberId, target, myUserId, "approved");
      toast("Approved.");
    }
    if (deny) {
      const target = deny.getAttribute("data-deny");
      await decideRequest(selectedChamberId, target, myUserId, "rejected");
      toast("Denied.");
    }
  });
});

