import { db, getSessionEmail, emailToId } from "./firebase.js";
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ────────────── Helpers ────────────── */

let ADMIN_ID = null;
let ADMIN_EMAIL = null;
let ALL_USERS = [];
let ALL_CHAMBERS = [];
let ALL_REQUESTS = [];
let ALL_AUDIT = [];

function toast(msg, type = "info") {
  const container = document.getElementById("toastContainer");
  const icons = { success: "fa-check-circle", error: "fa-exclamation-circle", info: "fa-info-circle" };
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateX(40px)"; setTimeout(() => el.remove(), 300); }, 3500);
}

function timeAgo(ts) {
  if (!ts) return "—";
  const seconds = Math.floor((Date.now() - (ts.toMillis?.() || new Date(ts).getTime())) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(ts.toMillis?.() || ts).toLocaleDateString();
}

function initials(name) {
  return (name || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

/* ────────────── Navigation ────────────── */

const pageTitles = {
  dashboard: ["Dashboard", "Platform overview and quick stats"],
  users: ["User Management", "View, search, and moderate all users"],
  requests: ["Pending Requests", "Approve or reject chamber join requests"],
  chambers: ["Chambers", "Manage all innovation chambers"],
  announcements: ["Announcements", "Send platform-wide messages"],
  audit: ["Audit Log", "Complete history of admin actions"],
  settings: ["Settings", "Platform configuration and tools"],
};

function navigateTo(page) {
  document.querySelectorAll(".page-view").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.add("active");
  const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navItem) navItem.classList.add("active");
  const [title, subtitle] = pageTitles[page] || ["", ""];
  document.getElementById("pageTitle").textContent = title;
  document.getElementById("pageSubtitle").textContent = subtitle;
  // Close sidebar on mobile
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarOverlay").classList.remove("active");
}

function updateClock() {
  const el = document.getElementById("topbarTime");
  if (el) el.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
setInterval(updateClock, 30000);
updateClock();

/* ────────────── Modals ────────────── */

function openModal(id) { document.getElementById(id).classList.add("active"); }
function closeModal(id) { document.getElementById(id).classList.remove("active"); }

function showUserModal(user) {
  const body = document.getElementById("userModalBody");
  const footer = document.getElementById("userModalFooter");
  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
      <div style="width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,rgba(0,212,255,.2),rgba(127,92,255,.2));display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:var(--cyan);">${initials(user.username || user.email)}</div>
      <div>
        <div style="font-size:16px;font-weight:700;">${user.username || "No username"}</div>
        <div style="font-size:12px;color:var(--text-muted);">${user.email || user.id}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div style="padding:12px;border-radius:10px;background:var(--bg-secondary);">
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;">Status</div>
        <div style="margin-top:4px;">${user.isBanned ? '<span class="badge badge-banned"><span class="badge-dot"></span>Banned</span>' : '<span class="badge badge-active"><span class="badge-dot"></span>Active</span>'}</div>
      </div>
      <div style="padding:12px;border-radius:10px;background:var(--bg-secondary);">
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;">Role</div>
        <div style="margin-top:4px;">${user.isPlatformAdmin || user.role === "admin" ? '<span class="badge badge-admin"><i class="fas fa-shield" style="font-size:10px;"></i>Admin</span>' : '<span class="badge badge-user">User</span>'}</div>
      </div>
      <div style="padding:12px;border-radius:10px;background:var(--bg-secondary);">
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;">User ID</div>
        <div style="margin-top:4px;font-size:12px;font-family:monospace;color:var(--text-secondary);">${user.id}</div>
      </div>
      <div style="padding:12px;border-radius:10px;background:var(--bg-secondary);">
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;">Joined</div>
        <div style="margin-top:4px;font-size:13px;">${user.createdAt ? timeAgo(user.createdAt) : "Unknown"}</div>
      </div>
    </div>
    ${user.title ? `<div style="margin-top:14px;padding:12px;border-radius:10px;background:var(--bg-secondary);"><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;">Title</div><div style="margin-top:4px;font-size:13px;">${user.title}</div></div>` : ""}
    ${user.bio ? `<div style="margin-top:10px;padding:12px;border-radius:10px;background:var(--bg-secondary);"><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;">Bio</div><div style="margin-top:4px;font-size:13px;color:var(--text-secondary);line-height:1.5;">${user.bio}</div></div>` : ""}
  `;
  footer.innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal('userModal')">Close</button>
    ${user.id !== ADMIN_ID ? `<button class="btn ${user.isBanned ? 'btn-success' : 'btn-danger'}" id="modalBanBtn">${user.isBanned ? "Unban User" : "Ban User"}</button>` : ""}
  `;
  const modalBanBtn = document.getElementById("modalBanBtn");
  if (modalBanBtn) {
    modalBanBtn.addEventListener("click", () => {
      closeModal("userModal");
      showBanModal(user.id, user.username || user.email, user.isBanned);
    });
  }
  openModal("userModal");
}

function showBanModal(userId, userName, isCurrentlyBanned) {
  const action = isCurrentlyBanned ? "Unban" : "Ban";
  document.getElementById("banModalTitle").textContent = `${action} User`;
  document.getElementById("banModalLabel").textContent = `Reason to ${action.toLowerCase()} @${userName}`;
  document.getElementById("banModalHint").textContent = isCurrentlyBanned
    ? "Removing the ban will restore this user's access immediately."
    : "Banning this user will remove them from all chambers and block access.";
  document.getElementById("banReasonInput").value = "";
  const confirmBtn = document.getElementById("banConfirmBtn");
  confirmBtn.textContent = `${action} User`;
  confirmBtn.className = isCurrentlyBanned ? "btn btn-success" : "btn btn-danger";
  confirmBtn.onclick = async () => {
    const reason = document.getElementById("banReasonInput").value.trim();
    if (!reason) { toast("Please provide a reason.", "error"); return; }
    await executeBanAction(userId, !isCurrentlyBanned, reason);
    closeModal("banModal");
  };
  openModal("banModal");
}

async function executeBanAction(userId, shouldBan, reason) {
  try {
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, {
      isBanned: shouldBan,
      bannedAt: shouldBan ? new Date().toISOString() : null,
      bannedBy: ADMIN_ID,
      banReason: shouldBan ? reason : null,
    });

    if (shouldBan) {
      const memberSnap = await getDocs(
        query(collectionGroup(db, "members"), where("userId", "==", userId), limit(500))
      ).catch(() => null);
      if (memberSnap && !memberSnap.empty) {
        const batch = writeBatch(db);
        memberSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    }

    await logModeration({
      action: shouldBan ? "ban_user" : "unban_user",
      actorId: ADMIN_ID,
      targetUserId: userId,
      reason,
    });

    toast(shouldBan ? "User banned successfully" : "User unbanned successfully", shouldBan ? "error" : "success");
  } catch (err) {
    console.error(err);
    toast("Action failed. Check console.", "error");
  }
}

/* ────────────── Audit Logging ────────────── */

async function logModeration({ action, actorId, targetUserId, reason, chamberId = null, meta = {} }) {
  await addDoc(collection(db, "moderationLogs"), {
    action,
    actorId,
    targetUserId,
    reason: String(reason || "").trim() || "No reason provided",
    chamberId: chamberId || null,
    meta,
    createdAt: serverTimestamp(),
  });
}

/* ────────────── Rendering ────────────── */

function renderUsersTable(users) {
  const tbody = document.getElementById("usersTableBody");
  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i class="fas fa-users-slash"></i><p>No users found</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = users.map(u => {
    const joined = u.createdAt ? timeAgo(u.createdAt) : "—";
    const isAdm = u.isPlatformAdmin === true || u.role === "admin";
    return `
      <tr>
        <td>
          <div class="user-cell">
            <div class="user-avatar-sm">${initials(u.username || u.email)}</div>
            <div>
              <div class="user-info-name">${u.username ? `@${u.username}` : "—"}</div>
              <div class="user-info-email">${u.email || u.id}</div>
            </div>
          </div>
        </td>
        <td class="hide-mobile">${isAdm ? '<span class="badge badge-admin"><i class="fas fa-shield" style="font-size:10px;"></i>Admin</span>' : '<span class="badge badge-user">User</span>'}</td>
        <td>${u.isBanned ? '<span class="badge badge-banned"><span class="badge-dot"></span>Banned</span>' : '<span class="badge badge-active"><span class="badge-dot"></span>Active</span>'}</td>
        <td class="hide-mobile">${joined}</td>
        <td>
          <div class="actions-cell">
            <button class="btn-icon" title="View Details" data-view="${u.id}"><i class="fas fa-eye"></i></button>
            ${u.id !== ADMIN_ID ? `<button class="btn-icon" title="${u.isBanned ? 'Unban' : 'Ban'}" data-ban="${u.id}"><i class="fas fa-${u.isBanned ? 'unlock' : 'ban'}"></i></button>` : ""}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function renderChambersTable(chambers) {
  const tbody = document.getElementById("chambersTableBody");
  if (!chambers.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i class="fas fa-door-closed"></i><p>No chambers found</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = chambers.map(c => {
    const cat = c.category ? c.category.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase()) : "—";
    const vis = c.visibility || "public";
    return `
      <tr>
        <td>
          <div class="user-cell">
            <div class="user-avatar-sm" style="background:linear-gradient(135deg,rgba(127,92,255,.2),rgba(0,212,255,.2));color:var(--violet);"><i class="fas ${c.icon || 'fa-cube'}"></i></div>
            <div>
              <div class="user-info-name">${c.name || "Unnamed"}</div>
              <div class="user-info-email">${c.description ? c.description.slice(0, 50) + (c.description.length > 50 ? "..." : "") : ""}</div>
            </div>
          </div>
        </td>
        <td class="hide-mobile">${cat}</td>
        <td>${c.memberCount || c.stats?.memberCount || 0}</td>
        <td class="hide-mobile"><span class="badge badge-active">${vis}</span></td>
        <td>
          <div class="actions-cell">
            <button class="btn-icon" title="Toggle Visibility" data-toggle-vis="${c.id}"><i class="fas fa-${vis === 'public' ? 'eye' : 'eye-slash'}"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function renderRequestsList(requests, filter = "pending") {
  const list = document.getElementById("requestsList");
  let filtered = filter === "all" ? requests : requests.filter(r => r.status === filter);
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>No ${filter === "all" ? "" : filter + " "}requests</p></div>`;
    return;
  }
  list.innerHTML = filtered.map(r => `
    <div class="request-card" data-req-id="${r.id}">
      <div class="user-avatar-sm">${initials(r.username || r.userId)}</div>
      <div class="request-info">
        <h4>${r.username || "Unknown User"}</h4>
        <p>${r.chamberName || r.chamberId || "Unknown Chamber"}</p>
        <div class="request-meta">
          <span><i class="fas fa-clock"></i> ${timeAgo(r.createdAt)}</span>
          ${r.message ? `<span><i class="fas fa-comment"></i> ${r.message.slice(0, 60)}${r.message.length > 60 ? "..." : ""}</span>` : ""}
        </div>
      </div>
      <div class="request-actions">
        ${r.status === "pending" ? `
          <button class="btn btn-sm btn-success" data-approve="${r.id}"><i class="fas fa-check"></i> Approve</button>
          <button class="btn btn-sm btn-danger" data-reject="${r.id}"><i class="fas fa-times"></i> Reject</button>
        ` : `
          <span class="badge badge-${r.status}">${r.status}</span>
        `}
      </div>
    </div>
  `).join("");
}

function renderAuditLog(logs, filter = "all") {
  const list = document.getElementById("auditList");
  let filtered = filter === "all" ? logs : logs.filter(l => l.action === filter);
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><i class="fas fa-clipboard"></i><p>No audit entries</p></div>`;
    return;
  }
  list.innerHTML = filtered.slice(0, 100).map(l => {
    const dotClass = l.action.includes("ban") && !l.action.includes("unban") ? "ban" :
                     l.action.includes("unban") ? "unban" :
                     l.action.includes("approve") ? "approve" :
                     l.action.includes("reject") ? "reject" :
                     l.action.includes("announce") ? "announce" : "update";
    const actionLabel = l.action.replace(/_/g, " ");
    return `
      <div class="audit-item">
        <div class="audit-dot ${dotClass}"></div>
        <div class="audit-content">
          <strong>${actionLabel}</strong>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">
            Target: ${l.targetUserId || "—"} · Reason: ${l.reason || "—"}
          </div>
        </div>
        <div class="audit-time">${timeAgo(l.createdAt)}</div>
      </div>
    `;
  }).join("");
}

function renderAnnouncements(list) {
  const el = document.getElementById("announcementsList");
  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-bullhorn"></i><p>No announcements yet</p></div>`;
    return;
  }
  el.innerHTML = list.slice(0, 20).map(a => `
    <div style="padding:14px 0;border-bottom:1px solid var(--border);">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span class="badge badge-${a.priority === 'urgent' ? 'banned' : a.priority === 'important' ? 'pending' : 'active'}">${a.priority || 'normal'}</span>
        <span style="font-size:12px;color:var(--text-muted);">${timeAgo(a.createdAt)}</span>
      </div>
      <div style="font-size:14px;font-weight:600;margin-bottom:3px;">${a.title}</div>
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;">${a.message}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Audience: ${a.audience || 'all'}</div>
    </div>
  `).join("");
}

function renderRecentRequests(requests) {
  const el = document.getElementById("dashRecentRequests");
  const pending = requests.filter(r => r.status === "pending").slice(0, 5);
  if (!pending.length) {
    el.innerHTML = `<div class="empty-state" style="padding:24px;"><i class="fas fa-check-circle" style="color:var(--green);"></i><p>All caught up — no pending requests</p></div>`;
    return;
  }
  el.innerHTML = pending.map(r => `
    <div style="padding:10px 0;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;">
      <div class="user-avatar-sm" style="width:32px;height:32px;font-size:11px;border-radius:8px;">${initials(r.username || r.userId)}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;">${r.username || "Unknown"}</div>
        <div style="font-size:11px;color:var(--text-muted);">${r.chamberName || r.chamberId}</div>
      </div>
      <div style="display:flex;gap:4px;">
        <button class="btn-icon" style="width:28px;height:28px;font-size:11px;" data-approve="${r.id}"><i class="fas fa-check" style="color:var(--green);"></i></button>
        <button class="btn-icon" style="width:28px;height:28px;font-size:11px;" data-reject="${r.id}"><i class="fas fa-times" style="color:var(--red);"></i></button>
      </div>
    </div>
  `).join("");
}

function renderRecentAudit(logs) {
  const el = document.getElementById("dashRecentAudit");
  const recent = logs.slice(0, 5);
  if (!recent.length) {
    el.innerHTML = `<div class="empty-state" style="padding:24px;"><i class="fas fa-clipboard"></i><p>No recent activity</p></div>`;
    return;
  }
  el.innerHTML = recent.map(l => `
    <div style="padding:10px 0;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;">
      <div class="audit-dot ${l.action.includes('ban') && !l.action.includes('unban') ? 'ban' : l.action.includes('unban') ? 'unban' : l.action.includes('approve') ? 'approve' : 'update'}" style="margin:0;"></div>
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:500;">${l.action.replace(/_/g, " ")}</div>
        <div style="font-size:11px;color:var(--text-muted);">${timeAgo(l.createdAt)}</div>
      </div>
    </div>
  `).join("");
}

/* ────────────── Action Handlers ────────────── */

async function handleRequestAction(requestId, action) {
  try {
    // Find the request in Firestore - it could be in any chamber's joinRequests subcollection
    // We store request docs with the requestId, so we need to find and update it
    // Since we used collectionGroup to query, we need the actual ref
    const reqDoc = ALL_REQUESTS.find(r => r.id === requestId);
    if (!reqDoc || !reqDoc._ref) { toast("Request not found", "error"); return; }

    await updateDoc(reqDoc._ref, {
      status: action,
      reviewedBy: ADMIN_ID,
      reviewedAt: serverTimestamp(),
    });

    // If approved, add user to chamber members
    if (action === "approved" && reqDoc.chamberId && reqDoc.userId) {
      const memberRef = doc(db, "chambers", reqDoc.chamberId, "members", reqDoc.userId);
      await updateDoc(memberRef, {
        status: "active",
        approvedAt: serverTimestamp(),
        approvedBy: ADMIN_ID,
      }).catch(() => {
        // Member doc might not exist yet, create it
        addDoc(collection(db, "chambers", reqDoc.chamberId, "members"), {
          userId: reqDoc.userId,
          status: "active",
          role: "member",
          joinedAt: serverTimestamp(),
          approvedAt: serverTimestamp(),
          approvedBy: ADMIN_ID,
        });
      });
    }

    await logModeration({
      action: action === "approved" ? "approve_request" : "reject_request",
      actorId: ADMIN_ID,
      targetUserId: reqDoc.userId,
      reason: `Request ${action} for ${reqDoc.chamberName || reqDoc.chamberId}`,
      chamberId: reqDoc.chamberId,
    });

    toast(`Request ${action}`, action === "approved" ? "success" : "info");
  } catch (err) {
    console.error(err);
    toast("Failed to process request", "error");
  }
}

async function toggleChamberVisibility(chamberId) {
  try {
    const chamber = ALL_CHAMBERS.find(c => c.id === chamberId);
    if (!chamber) return;
    const currentVis = chamber.visibility || "public";
    const nextVis = currentVis === "public" ? "private" : "public";
    await updateDoc(doc(db, "chambers", chamberId), { visibility: nextVis });
    toast(`Chamber visibility set to ${nextVis}`, "success");
  } catch (err) {
    console.error(err);
    toast("Failed to update visibility", "error");
  }
}

/* ────────────── Filter Handlers ────────────── */

function getFilteredUsers() {
  const search = document.getElementById("userSearch")?.value?.toLowerCase() || "";
  const filter = document.getElementById("userFilter")?.value || "all";
  let filtered = ALL_USERS;
  if (search) {
    filtered = filtered.filter(u =>
      (u.username || "").toLowerCase().includes(search) ||
      (u.email || "").toLowerCase().includes(search) ||
      u.id.toLowerCase().includes(search)
    );
  }
  if (filter === "active") filtered = filtered.filter(u => !u.isBanned);
  if (filter === "banned") filtered = filtered.filter(u => u.isBanned);
  return filtered;
}

/* ────────────── Announcement Form ────────────── */

document.getElementById("announceForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("announceTitle").value.trim();
  const message = document.getElementById("announceMessage").value.trim();
  const audience = document.getElementById("announceAudience").value;
  const priority = document.getElementById("announcePriority").value;
  if (!title || !message) { toast("Please fill in all fields", "error"); return; }

  try {
    await addDoc(collection(db, "announcements"), {
      title,
      message,
      audience,
      priority,
      createdBy: ADMIN_ID,
      createdAt: serverTimestamp(),
    });
    await logModeration({
      action: "announcement",
      actorId: ADMIN_ID,
      targetUserId: null,
      reason: title,
      meta: { audience, priority },
    });
    toast("Announcement sent!", "success");
    document.getElementById("announceForm").reset();
  } catch (err) {
    console.error(err);
    toast("Failed to send announcement", "error");
  }
});

/* ────────────── Event Delegation ────────────── */

document.addEventListener("click", async (e) => {
  // User view
  const viewBtn = e.target.closest("[data-view]");
  if (viewBtn) {
    const user = ALL_USERS.find(u => u.id === viewBtn.dataset.view);
    if (user) showUserModal(user);
    return;
  }

  // Ban/Unban from table
  const banBtn = e.target.closest("[data-ban]");
  if (banBtn) {
    const user = ALL_USERS.find(u => u.id === banBtn.dataset.ban);
    if (user) showBanModal(user.id, user.username || user.email, user.isBanned);
    return;
  }

  // Approve request
  const approveBtn = e.target.closest("[data-approve]");
  if (approveBtn) {
    await handleRequestAction(approveBtn.dataset.approve, "approved");
    return;
  }

  // Reject request
  const rejectBtn = e.target.closest("[data-reject]");
  if (rejectBtn) {
    await handleRequestAction(rejectBtn.dataset.reject, "rejected");
    return;
  }

  // Toggle chamber visibility
  const visBtn = e.target.closest("[data-toggle-vis]");
  if (visBtn) {
    await toggleChamberVisibility(visBtn.dataset.toggleVis);
    return;
  }
});

/* ────────────── Filter Event Listeners ────────────── */

document.getElementById("userSearch")?.addEventListener("input", () => renderUsersTable(getFilteredUsers()));
document.getElementById("userFilter")?.addEventListener("change", () => renderUsersTable(getFilteredUsers()));
document.getElementById("requestFilter")?.addEventListener("change", (e) => renderRequestsList(ALL_REQUESTS, e.target.value));
document.getElementById("auditFilter")?.addEventListener("change", (e) => renderAuditLog(ALL_AUDIT, e.target.value));

/* ────────────── Sidebar ────────────── */

document.querySelectorAll(".nav-item").forEach(item => {
  item.addEventListener("click", () => navigateTo(item.dataset.page));
});

document.getElementById("topbarToggle")?.addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebarOverlay").classList.toggle("active");
});

document.getElementById("sidebarOverlay")?.addEventListener("click", () => {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarOverlay").classList.remove("active");
});

document.getElementById("sidebarLogout")?.addEventListener("click", () => {
  localStorage.removeItem("vertex_session_email");
  localStorage.removeItem("vertex_session_expiry");
  window.location.href = "login.html";
});

document.getElementById("clearCacheBtn")?.addEventListener("click", () => {
  if (confirm("Clear all cached data? This will not affect the database.")) {
    caches.keys().then(names => names.forEach(n => caches.delete(n)));
    toast("Cache cleared", "success");
  }
});

document.getElementById("exportDataBtn")?.addEventListener("click", () => {
  const data = {
    users: ALL_USERS,
    chambers: ALL_CHAMBERS,
    exportedAt: new Date().toISOString(),
    exportedBy: ADMIN_EMAIL,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vertex-chamber-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Data exported", "success");
});

/* ────────────── Initialization ────────────── */

document.addEventListener("DOMContentLoaded", async () => {
  const email = getSessionEmail();
  if (!email) { window.location.href = "login.html"; return; }

  ADMIN_EMAIL = email;
  ADMIN_ID = emailToId(email);

  const userSnap = await getDoc(doc(db, "users", ADMIN_ID)).catch(() => null);
  if (!userSnap || !userSnap.exists()) {
    document.getElementById("accessDenied").classList.add("active");
    document.getElementById("adminLoader").classList.add("hidden");
    return;
  }
  const userData = userSnap.data() || {};
  const isAdmin = userData.isPlatformAdmin === true || userData.role === "admin";
  if (!isAdmin) {
    document.getElementById("accessDenied").classList.add("active");
    document.getElementById("adminLoader").classList.add("hidden");
    return;
  }

  // Set admin info in sidebar
  document.getElementById("sidebarAvatar").textContent = initials(userData.username || email);
  document.getElementById("sidebarUserName").textContent = userData.username || "Admin";
  document.getElementById("settingsAdminEmail").value = email;

  document.getElementById("adminApp").classList.add("active");
  document.getElementById("adminLoader").classList.add("hidden");

  // ── Users Collection ──
  onSnapshot(collection(db, "users"), (snap) => {
    ALL_USERS = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
    document.getElementById("statUsers").textContent = ALL_USERS.length;
    document.getElementById("statBanned").textContent = ALL_USERS.filter(u => u.isBanned).length;
    renderUsersTable(getFilteredUsers());
  });

  // ── Chambers Collection ──
  onSnapshot(collection(db, "chambers"), (snap) => {
    ALL_CHAMBERS = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
    document.getElementById("statChambers").textContent = ALL_CHAMBERS.length;
    renderChambersTable(ALL_CHAMBERS);
  });

  // ── Join Requests (collectionGroup across all chambers) ──
  const requestsQ = query(collectionGroup(db, "joinRequests"), orderBy("createdAt", "desc"), limit(500));
  onSnapshot(requestsQ, (snap) => {
    ALL_REQUESTS = snap.docs.map(d => {
      const data = d.data() || {};
      // Store the reference for later updates
      data._ref = d.ref;
      return data;
    });
    const pending = ALL_REQUESTS.filter(r => r.status === "pending");
    document.getElementById("statPending").textContent = pending.length;
    const badge = document.getElementById("reqBadge");
    badge.textContent = pending.length;
    badge.style.display = pending.length > 0 ? "inline-flex" : "none";
    renderRequestsList(ALL_REQUESTS, document.getElementById("requestFilter")?.value || "pending");
    renderRecentRequests(ALL_REQUESTS);
  });

  // ── Audit Logs ──
  const auditQ = query(collection(db, "moderationLogs"), orderBy("createdAt", "desc"), limit(200));
  onSnapshot(auditQ, (snap) => {
    ALL_AUDIT = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
    renderAuditLog(ALL_AUDIT, document.getElementById("auditFilter")?.value || "all");
    renderRecentAudit(ALL_AUDIT);
  });

  // ── Announcements ──
  const announceQ = query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(50));
  onSnapshot(announceQ, (snap) => {
    const announcements = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
    renderAnnouncements(announcements);
  });

  // Settings
  const expiry = localStorage.getItem("vertex_session_expiry");
  if (expiry) {
    document.getElementById("settingsSessionExpiry").value = new Date(parseInt(expiry)).toLocaleString();
  }
});
