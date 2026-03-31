// workspace_page.js — Firestore-backed project workspace (projects + tasks)
import { db, getSessionEmail, emailToId } from "./firebase.js";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
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

function getProjectId(userId) {
  const u = new URL(window.location.href);
  return u.searchParams.get("project") || `project_${userId}_default`;
}

async function ensureProject(projectId, userId) {
  const ref = doc(db, "projects", projectId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(
      ref,
      {
        name: "Vertex Project",
        description: "Your workspace powered by Vertex Chamber.",
        status: "building", // idea | building | launched
        visibility: "private", // private | public
        ownerId: userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    await setDoc(
      doc(db, "projects", projectId, "members", userId),
      { userId, role: "owner", joinedAt: serverTimestamp() },
      { merge: true },
    );
  }
  return ref;
}

function setProjectHeader(project) {
  const title = document.getElementById("projectName");
  const desc = document.getElementById("projectDesc");
  if (title) title.textContent = project.name || "Vertex Project";
  if (desc) desc.textContent = project.description || "";

  const statusEl = document.getElementById("projectStatusBadge");
  if (statusEl) {
    const st = (project.status || "building").toLowerCase();
    statusEl.className = `status-badge ${st === "idea" ? "status-idea" : st === "launched" ? "status-launched" : "status-building"}`;
    statusEl.innerHTML =
      st === "idea"
        ? `<i class="fas fa-lightbulb"></i> Idea`
        : st === "launched"
          ? `<i class="fas fa-rocket"></i> Launched`
          : `<i class="fas fa-hammer"></i> Building`;
  }

  const visEl = document.getElementById("projectVisibilityBadge");
  if (visEl) {
    const vis = (project.visibility || "private").toLowerCase();
    visEl.innerHTML =
      vis === "public"
        ? `<i class="fas fa-globe"></i> Public`
        : `<i class="fas fa-lock"></i> Private`;
  }
}

function taskPriorityClass(p) {
  const v = (p || "medium").toLowerCase();
  return v === "high" ? "priority-high" : v === "low" ? "priority-low" : "priority-medium";
}

function taskPriorityLabel(p) {
  const v = (p || "medium").toLowerCase();
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function renderTaskCard(task) {
  const due = task.dueDate ? new Date(task.dueDate).toLocaleDateString([], { month: "short", day: "numeric" }) : null;
  const el = document.createElement("div");
  el.className = "task-card";
  el.draggable = true;
  el.setAttribute("data-task-id", task.id);
  el.innerHTML = `
    <div class="task-header">
      <div style="min-width:0">
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="task-priority ${taskPriorityClass(task.priority)}">${taskPriorityLabel(task.priority)}</div>
      </div>
      <div class="task-actions">
        <button class="task-action-btn" data-edit="${escapeHtml(task.id)}" title="Edit">
          <i class="fas fa-edit"></i>
        </button>
      </div>
    </div>
    <div class="task-description">${escapeHtml(task.description || "No description")}</div>
    <div class="task-footer">
      <div class="task-assignees"></div>
      <div class="task-date">${due ? `Due: ${escapeHtml(due)}` : ""}</div>
    </div>
  `;
  return el;
}

function updateCounts() {
  document.querySelectorAll(".kanban-column").forEach((col) => {
    const list = col.querySelector(".task-list");
    const count = col.querySelector(".task-count");
    if (list && count) count.textContent = String(list.querySelectorAll(".task-card").length);
  });
}

function ensureModal() {
  if (document.getElementById("vcTaskModal")) return;
  const modal = document.createElement("div");
  modal.id = "vcTaskModal";
  modal.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.72);display:none;align-items:center;justify-content:center;z-index:10000;backdrop-filter:blur(10px);";
  modal.innerHTML = `
    <div class="glass-card" style="padding:26px;max-width:560px;width:92%;margin:20px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
        <div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,var(--accent-primary),var(--accent-secondary));display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-tasks"></i>
        </div>
        <div style="flex:1">
          <div style="font-size:18px;font-weight:800;">Create Task</div>
          <div style="color:var(--text-secondary);font-size:13px;">Tasks are saved to the Vertex database instantly.</div>
        </div>
        <button class="btn btn-secondary btn-sm" id="vcCloseTaskModal"><i class="fas fa-times"></i></button>
      </div>

      <div style="display:flex;flex-direction:column;gap:14px;">
        <div>
          <label style="display:block;margin-bottom:8px;color:var(--text-secondary);font-size:13px;">Title</label>
          <input id="vcTaskTitle" class="glass-card" style="width:100%;padding:12px 14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.10);border-radius:10px;color:#fff;" placeholder="What needs to be done?">
        </div>
        <div>
          <label style="display:block;margin-bottom:8px;color:var(--text-secondary);font-size:13px;">Description</label>
          <textarea id="vcTaskDesc" class="glass-card" style="width:100%;padding:12px 14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.10);border-radius:10px;color:#fff;min-height:90px;" placeholder="Add details (optional)"></textarea>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <label style="display:block;margin-bottom:8px;color:var(--text-secondary);font-size:13px;">Priority</label>
            <select id="vcTaskPriority" class="glass-card" style="width:100%;padding:12px 14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.10);border-radius:10px;color:#fff;">
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label style="display:block;margin-bottom:8px;color:var(--text-secondary);font-size:13px;">Due date</label>
            <input id="vcTaskDue" type="date" class="glass-card" style="width:100%;padding:12px 14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.10);border-radius:10px;color:#fff;">
          </div>
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
          <button class="btn btn-secondary" id="vcCancelTask">Cancel</button>
          <button class="btn btn-primary" id="vcCreateTask"><i class="fas fa-plus"></i> Create</button>
        </div>
      </div>
    </div>
  `;
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });
  document.body.appendChild(modal);
}

function openModal() {
  ensureModal();
  const modal = document.getElementById("vcTaskModal");
  if (!modal) return;
  // default due date tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const due = document.getElementById("vcTaskDue");
  if (due) due.value = tomorrow.toISOString().split("T")[0];
  modal.style.display = "flex";
  document.getElementById("vcTaskTitle")?.focus();
}

function closeModal() {
  const modal = document.getElementById("vcTaskModal");
  if (modal) modal.style.display = "none";
}

document.addEventListener("DOMContentLoaded", async () => {
  const email = getSessionEmail();
  if (!email) return; // app_shell will redirect
  const userId = emailToId(email);

  // tabs (keep existing UI behavior)
  const tabs = document.querySelectorAll(".workspace-tab");
  const tabContents = document.querySelectorAll(".tab-content");
  tabs.forEach((tab) => {
    tab.addEventListener("click", function () {
      const tabId = this.getAttribute("data-tab");
      tabs.forEach((t) => t.classList.remove("active"));
      this.classList.add("active");
      tabContents.forEach((content) => {
        content.classList.remove("active");
        if (content.id === `${tabId}-tab`) content.classList.add("active");
      });
    });
  });

  // Ensure project exists
  const projectId = getProjectId(userId);
  const projectRef = await ensureProject(projectId, userId);

  // Live project header
  onSnapshot(projectRef, (snap) => {
    if (snap.exists()) setProjectHeader(snap.data());
  });

  // Hook create task
  document.getElementById("createTaskBtn")?.addEventListener("click", openModal);
  ensureModal();
  document.getElementById("vcCloseTaskModal")?.addEventListener("click", closeModal);
  document.getElementById("vcCancelTask")?.addEventListener("click", closeModal);

  document.getElementById("vcCreateTask")?.addEventListener("click", async () => {
    const title = document.getElementById("vcTaskTitle")?.value?.trim() || "";
    const description = document.getElementById("vcTaskDesc")?.value?.trim() || "";
    const priority = document.getElementById("vcTaskPriority")?.value || "medium";
    const dueDate = document.getElementById("vcTaskDue")?.value || "";
    if (!title) {
      toast("Please enter a task title.");
      return;
    }
    await addDoc(collection(db, "projects", projectId, "tasks"), {
      title,
      description,
      priority,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      status: "todo",
      createdAt: serverTimestamp(),
      createdBy: userId,
      updatedAt: serverTimestamp(),
    });
    closeModal();
    toast("Task created.");
  });

  // Kanban drag/drop + live rendering
  const lists = {
    todo: document.getElementById("todo-list"),
    progress: document.getElementById("progress-list"),
    review: document.getElementById("review-list"),
    done: document.getElementById("done-list"),
  };

  function clearLists() {
    Object.values(lists).forEach((l) => {
      if (l) l.innerHTML = "";
    });
  }

  function attachDragHandlers(cardEl) {
    cardEl.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", cardEl.getAttribute("data-task-id") || "");
      cardEl.classList.add("dragging");
    });
    cardEl.addEventListener("dragend", () => cardEl.classList.remove("dragging"));
  }

  document.querySelectorAll(".kanban-column").forEach((col) => {
    col.addEventListener("dragover", (e) => {
      e.preventDefault();
      col.classList.add("drag-over");
    });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", async (e) => {
      e.preventDefault();
      col.classList.remove("drag-over");
      const taskId = e.dataTransfer.getData("text/plain");
      const status = col.getAttribute("data-status");
      if (!taskId || !status) return;
      await updateDoc(doc(db, "projects", projectId, "tasks", taskId), {
        status,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      toast("Task updated.");
    });
  });

  const tasksQ = query(collection(db, "projects", projectId, "tasks"), orderBy("createdAt", "desc"));
  onSnapshot(tasksQ, (snap) => {
    clearLists();
    const tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    tasks.forEach((t) => {
      const st = (t.status || "todo").toLowerCase();
      const target =
        st === "progress" ? lists.progress : st === "review" ? lists.review : st === "done" ? lists.done : lists.todo;
      if (!target) return;
      const el = renderTaskCard(t);
      attachDragHandlers(el);
      target.appendChild(el);
    });
    updateCounts();
  });

  // Workspace chat tab: route to messages for now (real chat lives there)
  document.getElementById("sendMessage")?.addEventListener("click", () => {
    toast("Project chat is powered by Messages. Redirecting…");
    setTimeout(() => (window.location.href = "messages.html"), 500);
  });
});

