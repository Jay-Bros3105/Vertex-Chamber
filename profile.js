// profile.js — Email-Linked Profile (stored by email, works across all devices)
// ============================================================
// HOW IT WORKS:
//  1. login.html verifies the user via OTP and saves their email to localStorage
//  2. This page reads that email as the identity key
//  3. All profile data (username, bio, avatar) is stored in Firestore under "users/{emailId}"
//  4. Usernames are still globally unique — checked in "usernames" collection
//  5. When a user opens the app on a new device, they just log in with their email
//     and all their data (profile pic, username, bio) loads automatically
// ============================================================

import { db } from "./firebase.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ── Session helpers ──────────────────────────────────────────
const SESSION_EMAIL_KEY  = "vertex_session_email";
const SESSION_EXPIRY_KEY = "vertex_session_expiry";

function getSessionEmail() {
  const email  = localStorage.getItem(SESSION_EMAIL_KEY);
  const expiry = parseInt(localStorage.getItem(SESSION_EXPIRY_KEY) || "0");
  if (email && Date.now() < expiry) return email;
  return null;
}

// Convert email → safe Firestore document ID (same logic as login.html)
function emailToId(email) {
  return email.toLowerCase().replace(/[^a-z0-9]/g, "_");
}

// ── Global state ─────────────────────────────────────────────
let usernameAvailable  = false;
let checkTimer         = null;
let isSaving           = false;
let isProfileActivated = false;
let currentUsername    = null;
let currentEmail       = null;
let userId             = null;   // emailToId(currentEmail)

// ── DOM Elements ─────────────────────────────────────────────
const usernameInput  = document.getElementById("username");
const bioInput       = document.getElementById("bio");
const saveBtn        = document.getElementById("saveBtn");
const saveBtnText    = document.querySelector("#saveBtn .btn-text");
const saveBtnSpinner = document.querySelector("#saveBtn .spinner");
const bioCount       = document.getElementById("bioCount");
const statusPill     = document.getElementById("statusPill");
const usernameIcon   = document.getElementById("usernameIcon");

// ── Verify session ───────────────────────────────────────────
currentEmail = getSessionEmail();

if (!currentEmail) {
  // Not logged in — send back to login
  console.warn("No active session. Redirecting to login.");
  window.location.href = "login.html";
} else {
  userId = emailToId(currentEmail);
  console.log("✅ Logged in as:", currentEmail, "→ userId:", userId);

  // Show email hint on page if element exists
  const emailHintEl = document.getElementById("loggedInEmail");
  if (emailHintEl) emailHintEl.textContent = currentEmail;

  loadUserProfile();
}

// ── Load profile for this email ──────────────────────────────
async function loadUserProfile() {
  try {
    console.log("📂 Loading profile for user:", userId);
    const userRef  = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const data = userSnap.data();
      console.log("✅ Existing profile found:", data);
      isProfileActivated = true;

      if (data.username) {
        currentUsername      = data.username;
        usernameInput.value  = data.username;
        usernameAvailable    = true;
        setStatus("available", `✓ Your chamber name: @${data.username} — you can change it`);
        updateSaveButtonUI();
      }

      if (data.bio) {
        bioInput.value       = data.bio;
        bioCount.textContent = data.bio.length;
      }

      // Restore avatar across devices
      if (data.avatarBase64) {
        const avatarEl = document.getElementById("avatar");
        if (avatarEl) avatarEl.src = data.avatarBase64;
        // Cache locally for fast load
        try { localStorage.setItem("vertex_avatar", data.avatarBase64); } catch {}
      }

    } else {
      console.log("📝 New user — no profile yet");
      isProfileActivated = false;
      currentUsername    = null;
      usernameInput.value = "";
      bioInput.value      = "";
      bioCount.textContent = "0";
      updateSaveButtonUI();
    }
  } catch (err) {
    console.error("❌ Error loading user profile:", err);
    if (window.showToast) window.showToast("Could not load profile data", "error");
  }
}

// ── Update save button ────────────────────────────────────────
function updateSaveButtonUI() {
  if (!saveBtn || !saveBtnText) return;

  if (isProfileActivated) {
    saveBtnText.innerHTML = `<i class="fa-solid fa-pen-to-square" style="margin-right:8px"></i>Update Profile`;
  } else {
    saveBtnText.innerHTML = `<i class="fa-solid fa-bolt" style="margin-right:8px"></i>Activate Profile`;
  }

  saveBtn.disabled     = !usernameAvailable;
  saveBtn.style.opacity = usernameAvailable ? "1" : "0.6";
}

// ── Status pill helpers ───────────────────────────────────────
function setStatus(type, message) {
  if (!statusPill) return;
  statusPill.className = `status-pill ${type} show`;
  statusPill.innerHTML = message;
  usernameInput.classList.remove("valid", "invalid");

  if (type === "available") {
    usernameInput.classList.add("valid");
    if (usernameIcon) usernameIcon.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--success)"></i>`;
  } else if (type === "taken") {
    usernameInput.classList.add("invalid");
    if (usernameIcon) usernameIcon.innerHTML = `<i class="fa-solid fa-circle-xmark" style="color:var(--error)"></i>`;
  } else if (type === "checking") {
    if (usernameIcon) usernameIcon.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="color:var(--warning)"></i>`;
  } else {
    if (usernameIcon) usernameIcon.innerHTML = `<i class="fa-solid fa-user"></i>`;
  }
}

function clearStatus() {
  if (!statusPill) return;
  statusPill.className = "status-pill";
  usernameInput.classList.remove("valid", "invalid");
  if (usernameIcon) usernameIcon.innerHTML = `<i class="fa-solid fa-user"></i>`;
}

function setSaveLoading(loading) {
  if (!saveBtn) return;
  isSaving = loading;
  if (loading) {
    saveBtn.classList.add("loading");
    saveBtn.disabled = true;
    if (saveBtnText) saveBtnText.style.display = "none";
    if (saveBtnSpinner) saveBtnSpinner.style.display = "block";
  } else {
    saveBtn.classList.remove("loading");
    if (saveBtnText) saveBtnText.style.display = "flex";
    if (saveBtnSpinner) saveBtnSpinner.style.display = "none";
    if (usernameAvailable) saveBtn.disabled = false;
  }
}

// ── Username availability check ───────────────────────────────
async function isUsernameTakenGlobally(username) {
  try {
    const ref  = doc(db, "usernames", username);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      // If this username belongs to THIS user, it's not "taken"
      return data.userId !== userId;
    }
    return false;
  } catch (err) {
    console.error("Error checking username:", err);
    return true;
  }
}

function validateUsernameFormat(username) {
  if (username.length < 3)  return { valid: false, reason: "short", message: "At least 3 characters needed" };
  if (username.length > 20) return { valid: false, reason: "short", message: "Maximum 20 characters allowed" };
  if (!/^[a-zA-Z0-9_]+$/.test(username))
    return { valid: false, reason: "taken", message: "Only letters, numbers, and underscores allowed" };
  return { valid: true };
}

usernameInput.addEventListener("input", () => {
  const username = usernameInput.value.trim().toLowerCase();
  usernameAvailable = false;
  updateSaveButtonUI();

  if (checkTimer) clearTimeout(checkTimer);
  if (username.length === 0) { clearStatus(); return; }

  const fmt = validateUsernameFormat(username);
  if (!fmt.valid) { setStatus(fmt.reason, fmt.message); return; }

  setStatus("checking", `<i class="fa-solid fa-spinner fa-spin"></i> Checking availability…`);

  checkTimer = setTimeout(async () => {
    try {
      const taken = await isUsernameTakenGlobally(username);
      if (taken) {
        usernameAvailable = false;
        setStatus("taken", `<i class="fa-solid fa-circle-xmark"></i> @${username} is already taken — choose another`);
      } else {
        usernameAvailable = true;
        setStatus("available", `<i class="fa-solid fa-circle-check"></i> @${username} is available — ready to claim`);
      }
      updateSaveButtonUI();
    } catch (err) {
      setStatus("short", `<i class="fa-solid fa-wifi"></i> Connection issue — please try again`);
      usernameAvailable = false;
      updateSaveButtonUI();
    }
  }, 500);
});

// ── Bio counter ───────────────────────────────────────────────
if (bioInput && bioCount) {
  bioInput.addEventListener("input", function () {
    const len = this.value.length;
    bioCount.textContent = len;
    bioCount.style.color = len > 150 ? "var(--error)" : len > 140 ? "var(--warning)" : "var(--muted)";
  });
}

// ── Save / Update profile ─────────────────────────────────────
window.saveProfile = async function () {
  if (isSaving) return;
  if (!currentEmail || !userId) {
    if (window.showToast) window.showToast("Session expired. Please log in again.", "error");
    setTimeout(() => { window.location.href = "login.html"; }, 1500);
    return;
  }

  const username = usernameInput.value.trim().toLowerCase();
  const bio      = bioInput.value.trim();

  if (!username) {
    if (window.showToast) window.showToast("Please enter a username", "error");
    usernameInput.focus(); return;
  }

  const fmt = validateUsernameFormat(username);
  if (!fmt.valid) {
    if (window.showToast) window.showToast(fmt.message, "error");
    usernameInput.focus(); return;
  }

  if (!usernameAvailable) {
    if (window.showToast) window.showToast("Please choose an available username", "error");
    usernameInput.focus(); return;
  }

  setSaveLoading(true);

  try {
    // Final race-condition check
    const usernameRef  = doc(db, "usernames", username);
    const finalCheck   = await getDoc(usernameRef);

    if (finalCheck.exists() && finalCheck.data().userId !== userId) {
      usernameAvailable = false;
      setStatus("taken", `<i class="fa-solid fa-circle-xmark"></i> @${username} was just taken — choose another`);
      updateSaveButtonUI();
      setSaveLoading(false);
      if (window.showToast) window.showToast("Username just taken. Please try another.", "error");
      return;
    }

    // Reserve username globally (linked to this user's email id, not a device)
    await setDoc(usernameRef, {
      userId:    userId,
      email:     currentEmail,
      username:  username,
      claimedAt: new Date().toISOString(),
      status:    "active"
    });

    // Free old username if changed
    if (currentUsername && currentUsername !== username) {
      const oldRef = doc(db, "usernames", currentUsername);
      await setDoc(oldRef, {
        status:           "available",
        freedAt:          new Date().toISOString(),
        previousUserId:   userId
      }, { merge: true });
    }

    // Get current avatar (may have been updated this session)
    let avatarBase64 = null;
    try { avatarBase64 = localStorage.getItem("vertex_avatar"); } catch {}

    // Build user document
    const userData = {
      userId:           userId,
      email:            currentEmail,
      username:         username,
      bio:              bio || "",
      profileCompleted: true,
      updatedAt:        new Date().toISOString(),
      ...(avatarBase64 ? { avatarBase64 } : {})
    };

    if (!isProfileActivated) {
      userData.createdAt = new Date().toISOString();
    }

    await setDoc(doc(db, "users", userId), userData, { merge: true });

    // Cache username locally for quick reads in other pages
    localStorage.setItem("vertex_username", username);
    localStorage.setItem("vertex_profile_completed", "true");

    currentUsername    = username;
    isProfileActivated = true;

    setSaveLoading(false);
    updateSaveButtonUI();

    const action = userData.createdAt ? "activated" : "updated";
    if (window.showToast) window.showToast(`Profile ${action}! Welcome, @${username}`, "success");
    setStatus("available", `<i class="fa-solid fa-circle-check"></i> Profile ${action}! @${username}`);

    // Redirect to chamber after short delay
    setTimeout(() => { window.location.href = "splash.html"; }, 1800);

  } catch (err) {
    console.error("❌ Save failed:", err);
    setSaveLoading(false);

    let msg = "Save failed — please try again";
    if (err.code === "permission-denied") msg = "Permission denied. Check Firebase security rules.";
    else if (err.code === "unavailable")  msg = "Service unavailable. Check your internet.";
    else if (err.message)                 msg = err.message.substring(0, 100);

    if (window.showToast) window.showToast(msg, "error");
  }
};

// ── Enter key in username field ───────────────────────────────
if (usernameInput) {
  usernameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && usernameAvailable && !saveBtn.disabled && !isSaving) {
      e.preventDefault();
      window.saveProfile();
    }
  });
}

// ── Sign out ──────────────────────────────────────────────────
window.signOutVertex = function () {
  if (!confirm("Sign out of Vertex Chamber on this device?")) return;
  localStorage.removeItem("vertex_session_email");
  localStorage.removeItem("vertex_session_expiry");
  localStorage.removeItem("vertex_username");
  localStorage.removeItem("vertex_profile_completed");
  localStorage.removeItem("vertex_avatar");
  window.location.href = "login.html";
};

// ── Immediate avatar save to Firestore ───────────────────────
// Called from profile.html avatarInput change handler
window.saveAvatarToFirestore = async function (base64) {
  if (!userId) return;
  try {
    await setDoc(doc(db, "users", userId), {
      avatarBase64: base64,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log("✅ Avatar saved to Firestore for", userId);
    if (window.showToast) window.showToast("Profile photo saved to cloud ✓", "success");
  } catch (err) {
    console.error("❌ Avatar save failed:", err);
    if (window.showToast) window.showToast("Photo saved locally — will sync on next profile save", "success");
  }
};

console.log("🚀 Profile module loaded — Email-linked identity");
console.log("   Logged in as:", currentEmail);
