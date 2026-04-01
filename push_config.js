// push_config.js
// Put your Firebase Cloud Messaging Web Push certificate key pair (VAPID key) here.
// Firebase Console → Project Settings → Cloud Messaging → Web configuration → Web Push certificates.
//
// Example:
// window.VERTEX_VAPID_KEY = "BExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
window.VERTEX_VAPID_KEY = "BJT9eL3aF6ZduqPtf4PnlMg7VdaU6P-sj1uVvtXyKy1theLKn8cDv4Oy1f7_dpvmKMocPgMvr9HbJE9j3SzdrnI";

// Optional but strongly recommended for long-distance WebRTC calls:
// provide TURN + STUN servers so calls work beyond local/NAT-restricted networks.
// Example:
// window.VERTEX_ICE_SERVERS = [
//   { urls: ["stun:stun.l.google.com:19302"] },
//   { urls: ["turn:YOUR_TURN_HOST:3478"], username: "YOUR_USER", credential: "YOUR_PASS" }
// ];
window.VERTEX_ICE_SERVERS = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }
];

