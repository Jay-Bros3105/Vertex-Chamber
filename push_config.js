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

/*
READY-TO-PASTE TURN BLOCKS (pick one provider)
Exact format used by this project: window.VERTEX_ICE_SERVERS = [ ... ];

1) Twilio Network Traversal Service
-----------------------------------
Server-side (recommended): fetch ICE servers from Twilio API and inject dynamically.
Static example shape:
window.VERTEX_ICE_SERVERS = [
  { urls: ["stun:global.stun.twilio.com:3478"] },
  {
    urls: ["turn:global.turn.twilio.com:3478?transport=udp", "turn:global.turn.twilio.com:3478?transport=tcp"],
    username: "TWILIO_GENERATED_USERNAME",
    credential: "TWILIO_GENERATED_CREDENTIAL"
  },
  {
    urls: ["turns:global.turn.twilio.com:443?transport=tcp"],
    username: "TWILIO_GENERATED_USERNAME",
    credential: "TWILIO_GENERATED_CREDENTIAL"
  }
];

2) Nym TURN
-----------
window.VERTEX_ICE_SERVERS = [
  { urls: ["stun:stun.nymtech.net:3478"] },
  {
    urls: ["turn:turn.nymtech.net:3478?transport=udp", "turn:turn.nymtech.net:3478?transport=tcp"],
    username: "YOUR_NYM_USERNAME",
    credential: "YOUR_NYM_PASSWORD"
  },
  {
    urls: ["turns:turn.nymtech.net:5349?transport=tcp"],
    username: "YOUR_NYM_USERNAME",
    credential: "YOUR_NYM_PASSWORD"
  }
];

3) Cloudflare Realtime TURN
---------------------------
window.VERTEX_ICE_SERVERS = [
  { urls: ["stun:stun.cloudflare.com:3478"] },
  {
    urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:3478?transport=tcp"],
    username: "YOUR_CF_TURN_USERNAME",
    credential: "YOUR_CF_TURN_CREDENTIAL"
  },
  {
    urls: ["turns:turn.cloudflare.com:5349?transport=tcp"],
    username: "YOUR_CF_TURN_USERNAME",
    credential: "YOUR_CF_TURN_CREDENTIAL"
  }
];
*/

