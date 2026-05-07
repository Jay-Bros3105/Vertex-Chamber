import { db, getSessionEmail, emailToId } from "./firebase.js";
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
  where,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

function toast(msg) {
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText = "position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#111827;border:1px solid rgba(255,255,255,.2);color:#fff;padding:10px 14px;border-radius:12px;z-index:99999;";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

async function isPlatformAdmin(userId) {
  const snap = await getDoc(doc(db, "users", userId)).catch(() => null);
  if (!snap || !snap.exists()) return false;
  const d = snap.data() || {};
  return d.isPlatformAdmin === true || d.role === "admin";
}

function renderUsers(listEl, rows, meId) {
  if (!rows.length) {
    listEl.innerHTML = `<div class="admin-meta">No users found.</div>`;
    return;
  }
  listEl.innerHTML = rows.map((u) => `
    <div class="admin-row">
      <div style="min-width:0;">
        <div class="admin-name">${u.username ? `@${u.username}` : u.id}</div>
        <div class="admin-meta">${u.email || u.id}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <span class="pill-ban ${u.isBanned ? "bad" : "ok"}">${u.isBanned ? "BANNED" : "ACTIVE"}</span>
        <button class="btn btn-secondary btn-sm" data-ban="${u.id}" ${u.id === meId ? "disabled" : ""} style="${u.id===meId?"opacity:.5;cursor:not-allowed":""}">
          ${u.isBanned ? "Unban" : "Ban"}
        </button>
      </div>
    </div>
  `).join("");
}

function renderAuditLogs(listEl, rows) {
  if (!rows.length) {
    listEl.innerHTML = `<div class="admin-meta">No audit logs yet.</div>`;
    return;
  }
  listEl.innerHTML = rows.map((r) => {
    const when = r.createdAt?.toDate?.() ? r.createdAt.toDate().toLocaleString() : "—";
    return `
      <div class="admin-row">
        <div style="min-width:0;">
          <div class="admin-name">${r.action || "moderation_action"}</div>
          <div class="admin-meta">By: ${r.actorId || "—"} · Target: ${r.targetUserId || "—"} · ${when}</div>
          <div class="admin-meta" style="margin-top:4px;">Reason: ${r.reason || "—"}${r.chamberId ? ` · Chamber: ${r.chamberId}` : ""}</div>
        </div>
      </div>
    `;
  }).join("");
}

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

document.addEventListener("DOMContentLoaded", async () => {
  const email = getSessionEmail();
  if (!email) {
    window.location.href = "login.html";
    return;
  }
  const myId = emailToId(email);
  const allowed = await isPlatformAdmin(myId);
  if (!allowed) {
    document.getElementById("adminDenied").style.display = "block";
    return;
  }
  document.getElementById("adminMain").style.display = "block";

  const usersList = document.getElementById("usersList");
  const auditList = document.getElementById("auditList");
  const banReasonInput = document.getElementById("banReasonInput");
  const usersQ = query(collection(db, "users"), limit(200));
  onSnapshot(usersQ, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    document.getElementById("mUsers").textContent = String(rows.length);
    document.getElementById("mBanned").textContent = String(rows.filter((u) => u.isBanned === true).length);
    renderUsers(usersList, rows, myId);
  });

  const logsQ = query(collection(db, "moderationLogs"), limit(200));
  onSnapshot(logsQ, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    rows.sort((a, b) => {
      const aT = a.createdAt?.toMillis?.() || 0;
      const bT = b.createdAt?.toMillis?.() || 0;
      return bT - aT;
    });
    renderAuditLogs(auditList, rows.slice(0, 80));
  });

  const chambersSnap = await getDocs(query(collection(db, "chambers"), limit(200))).catch(() => null);
  document.getElementById("mChambers").textContent = String(chambersSnap?.size || 0);

  const pendingSnap = await getDocs(query(collectionGroup(db, "joinRequests"), where("status", "==", "pending"), limit(500))).catch(() => null);
  document.getElementById("mPending").textContent = String(pendingSnap?.size || 0);

  usersList.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-ban]");
    if (!btn) return;
    const uid = btn.getAttribute("data-ban");
    if (!uid || uid === myId) return;
    try {
      const userRef = doc(db, "users", uid);
      const snap = await getDoc(userRef);
      const data = snap.exists() ? (snap.data() || {}) : {};
      const next = !(data.isBanned === true);
      const reason = String(banReasonInput?.value || "").trim();
      if (next && !reason) {
        toast("Enter a reason before banning.");
        return;
      }
      await updateDoc(userRef, { isBanned: next, bannedAt: next ? new Date().toISOString() : null });

      if (next) {
        // Auto-kick banned user from all chamber member lists.
        const memberSnap = await getDocs(
          query(collectionGroup(db, "members"), where("userId", "==", uid), limit(500)),
        ).catch(() => null);
        if (memberSnap && !memberSnap.empty) {
          const batch = writeBatch(db);
          memberSnap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }

      await logModeration({
        action: next ? "ban_user" : "unban_user",
        actorId: myId,
        targetUserId: uid,
        reason: next ? reason : (reason || "Ban removed"),
      });

      if (banReasonInput) banReasonInput.value = "";
      toast(next ? "User banned" : "User unbanned");
    } catch {
      toast("Action failed");
    }
  });
});

