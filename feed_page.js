// feed_page.js — Firestore-backed feed (projects/posts) with likes & saves
import { db, getSessionEmail, emailToId } from "./firebase.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

const DEFAULT_POSTS = [
  {
    title: "AI-Powered Code Review Assistant",
    body:
      "Building an intelligent code review system that learns from your codebase and provides contextual suggestions, security detection, and performance tips.",
    tags: ["AI/ML", "Python", "React", "Node.js", "TensorFlow"],
  },
  {
    title: "AR Interior Design App",
    body:
      "Developing an AR app that lets users visualize furniture and decor in their home before purchasing. Looking for AR specialists and 3D modelers.",
    tags: ["AR/VR", "Swift", "Kotlin", "3D Modeling", "UI/UX"],
  },
];

async function ensureSeedFeed(userId) {
  const snap = await getDocs(query(collection(db, "feedPosts"), limit(1)));
  if (!snap.empty) return;

  const me = await getDoc(doc(db, "users", userId)).catch(() => null);
  const username = me && me.exists() ? me.data().username || null : null;
  const avatar = me && me.exists() ? me.data().avatarBase64 || null : null;

  await Promise.all(
    DEFAULT_POSTS.map((p) =>
      addDoc(collection(db, "feedPosts"), {
        title: p.title,
        body: p.body,
        tags: p.tags,
        authorId: userId,
        authorName: username ? `@${username}` : "Member",
        authorAvatar: avatar || null,
        createdAt: serverTimestamp(),
        likeCount: 0,
        commentCount: 0,
      }),
    ),
  );
}

function renderPostCard(post, myUserId, myLikes, mySaves) {
  const liked = myLikes.has(post.id);
  const saved = mySaves.has(post.id);
  const createdAt = post.createdAt?.toDate?.() ? post.createdAt.toDate() : null;
  const when = createdAt
    ? createdAt.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "Just now";

  const wrap = document.createElement("div");
  wrap.className = "glass-card feed-card";
  wrap.setAttribute("data-post", post.id);
  wrap.innerHTML = `
    <div class="feed-user">
      <div class="feed-user-avatar">
        ${post.authorAvatar ? `<img src="${post.authorAvatar}" alt="User" />` : `<img src="favicon.png" alt="User" />`}
      </div>
      <div class="feed-user-info">
        <h4>${escapeHtml(post.authorName || "Member")}</h4>
        <p>Posted ${escapeHtml(when)}</p>
      </div>
    </div>

    <div class="feed-content">
      <h3>${escapeHtml(post.title || "Post")}</h3>
      <p>${escapeHtml(post.body || "")}</p>
      <div class="skill-tags">
        ${(post.tags || []).slice(0, 8).map((t) => `<span class="skill-tag">${escapeHtml(t)}</span>`).join("")}
      </div>
    </div>

    <div class="feed-actions">
      <button class="action-btn ${liked ? "active" : ""}" data-like="${escapeHtml(post.id)}">
        <i class="${liked ? "fas" : "far"} fa-heart"></i> ${Number(post.likeCount || 0)}
      </button>
      <button class="action-btn" data-comment="${escapeHtml(post.id)}">
        <i class="far fa-comment"></i> ${Number(post.commentCount || 0)}
      </button>
      <button class="action-btn ${saved ? "active" : ""}" data-save="${escapeHtml(post.id)}">
        <i class="${saved ? "fas" : "far"} fa-bookmark"></i> ${saved ? "Saved" : "Save"}
      </button>
      <a href="workspace.html" class="btn btn-primary btn-sm" style="margin-left:auto">
        <i class="fas fa-eye"></i> Open Workspace
      </a>
    </div>
  `;
  return wrap;
}

document.addEventListener("DOMContentLoaded", async () => {
  const email = getSessionEmail();
  if (!email) return; // app_shell will redirect
  const myUserId = emailToId(email);

  const feedEl = document.querySelector("main.feed");
  if (!feedEl) return;

  // Remove static demo cards and create a real list container
  let list = document.getElementById("vcFeedList");
  if (!list) {
    // keep existing header, replace the cards below it
    const existingCards = feedEl.querySelectorAll(".feed-card");
    existingCards.forEach((c) => c.remove());
    list = document.createElement("div");
    list.id = "vcFeedList";
    list.className = "feed";
    feedEl.appendChild(list);
  }

  await ensureSeedFeed(myUserId);

  const likesSet = new Set();
  const savesSet = new Set();

  // My likes
  onSnapshot(collection(db, "users", myUserId, "likes"), (snap) => {
    likesSet.clear();
    snap.docs.forEach((d) => likesSet.add(d.id));
  });
  // My saves
  onSnapshot(collection(db, "users", myUserId, "saves"), (snap) => {
    savesSet.clear();
    snap.docs.forEach((d) => savesSet.add(d.id));
  });

  const qPosts = query(collection(db, "feedPosts"), orderBy("createdAt", "desc"));
  onSnapshot(qPosts, (snap) => {
    list.innerHTML = "";
    const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    posts.forEach((p) => list.appendChild(renderPostCard(p, myUserId, likesSet, savesSet)));
  });

  // Click handlers
  feedEl.addEventListener("click", async (e) => {
    const likeBtn = e.target.closest("[data-like]");
    const saveBtn = e.target.closest("[data-save]");
    const commentBtn = e.target.closest("[data-comment]");

    if (commentBtn) {
      toast("Comments are coming next — the feed is now database-backed.");
      return;
    }

    if (likeBtn) {
      const postId = likeBtn.getAttribute("data-like");
      const likeRef = doc(db, "users", myUserId, "likes", postId);
      const postRef = doc(db, "feedPosts", postId);
      const has = likesSet.has(postId);
      if (has) {
        // Unlike
        await setDoc(likeRef, { removedAt: serverTimestamp() }, { merge: true });
        await updateDoc(postRef, { likeCount: Math.max(0, (Number(likeBtn.textContent.trim()) || 1) - 1) }).catch(() => {});
        likesSet.delete(postId);
      } else {
        await setDoc(likeRef, { createdAt: serverTimestamp() }, { merge: true });
        await updateDoc(postRef, { likeCount: (Number(likeBtn.textContent.trim()) || 0) + 1 }).catch(() => {});
        likesSet.add(postId);
      }
      return;
    }

    if (saveBtn) {
      const postId = saveBtn.getAttribute("data-save");
      const saveRef = doc(db, "users", myUserId, "saves", postId);
      const has = savesSet.has(postId);
      if (has) {
        await setDoc(saveRef, { removedAt: serverTimestamp() }, { merge: true });
        savesSet.delete(postId);
      } else {
        await setDoc(saveRef, { createdAt: serverTimestamp() }, { merge: true });
        savesSet.add(postId);
      }
    }
  });
});

