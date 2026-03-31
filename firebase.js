// firebase.js — Vertex Chamber Shared Firebase Module
// =====================================================
// Imported by: profile.js, messages.html
// All pages derive the userId from the logged-in email
// using the same emailToId() function below.
// =====================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyC3HO1BY4rw1uVlZnRn4qG3XpxipFzDs0M",
  authDomain:        "vertex-chamber-993f6.firebaseapp.com",
  databaseURL:       "https://vertex-chamber-993f6-default-rtdb.firebaseio.com",
  projectId:         "vertex-chamber-993f6",
  storageBucket:     "vertex-chamber-993f6.firebasestorage.app",
  messagingSenderId: "950688239086",
  appId:             "1:950688239086:web:13b11f2581e908dabed2ff",
  measurementId:     "G-4HBWZ7432G"
};

const app = initializeApp(firebaseConfig);

export const db   = getFirestore(app);
export const auth = getAuth(app);

// ── Shared session helpers (used by all pages) ──────────
export const SESSION_EMAIL_KEY   = "vertex_session_email";
export const SESSION_EXPIRY_KEY  = "vertex_session_expiry";

/**
 * Convert an email address to a safe Firestore document ID.
 * Must match the same function in login.html and profile.js.
 * e.g.  "hello@world.com" → "hello_world_com"
 */
export function emailToId(email) {
  return email.toLowerCase().replace(/[^a-z0-9]/g, "_");
}

/**
 * Read the current session email from localStorage.
 * Returns null if there is no valid session.
 */
export function getSessionEmail() {
  const email  = localStorage.getItem(SESSION_EMAIL_KEY);
  const expiry = parseInt(localStorage.getItem(SESSION_EXPIRY_KEY) || "0");
  if (email && Date.now() < expiry) return email;
  localStorage.removeItem(SESSION_EMAIL_KEY);
  localStorage.removeItem(SESSION_EXPIRY_KEY);
  return null;
}
