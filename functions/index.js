const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();

exports.notifyOnNewMessage = onDocumentCreated(
  "conversations/{convId}/messages/{msgId}",
  async (event) => {
    const convId = event.params.convId;
    const msg = event.data?.data() || {};

    const senderId = msg.senderId || null;
    const receiverId = msg.receiverId || null; // null for group

    if (!senderId) return;

    // Load sender name
    let senderName = "Member";
    try {
      const s = await admin.firestore().collection("users").doc(senderId).get();
      if (s.exists) senderName = s.data().username || senderName;
    } catch {}

    // Determine targets
    let targetUserIds = [];
    if (receiverId) {
      targetUserIds = [receiverId];
    } else {
      // group: send to all participants except sender (soft limit)
      try {
        const convSnap = await admin.firestore().collection("conversations").doc(convId).get();
        const conv = convSnap.exists ? (convSnap.data() || {}) : {};
        const participants = Array.isArray(conv.participants) ? conv.participants : [];
        targetUserIds = participants.filter((u) => u && u !== senderId).slice(0, 200);
      } catch {
        targetUserIds = [];
      }
    }
    if (targetUserIds.length === 0) return;

    // Load tokens for targets
    const tokens = [];
    const userInfos = {}; // userId -> username
    await Promise.all(
      targetUserIds.map(async (uid) => {
        try {
          const u = await admin.firestore().collection("users").doc(uid).get();
          if (!u.exists) return;
          const d = u.data() || {};
          userInfos[uid] = d.username || "Vertex Chamber Member";
          const tMap = d.fcmTokens || {};
          Object.keys(tMap).forEach((t) => tokens.push({ token: t, uid }));
        } catch {}
      }),
    );
    if (tokens.length === 0) return;

    // Send push
    const sends = tokens.map(({ token, uid }) =>
      admin.messaging().send({
        token,
        notification: {
          title: "Vertex Chamber",
          body: `Hello Vertex Chamber Member (${userInfos[uid] || "Vertex Chamber Member"}), Youve received a message from (${senderName})`,
        },
        data: {
          username: userInfos[uid] || "Vertex Chamber Member",
          senderName,
          url: `/messages.html`,
          convId,
          click_action: "/messages.html",
        },
      }),
    );

    const results = await Promise.allSettled(sends);

    // Clean invalid tokens
    const invalid = [];
    results.forEach((r, i) => {
      if (r.status !== "rejected") return;
      const code = r.reason?.errorInfo?.code || r.reason?.code || "";
      if (code.includes("registration-token-not-registered") || code.includes("invalid-argument")) {
        invalid.push(tokens[i]);
      }
    });
    if (invalid.length) {
      await Promise.all(
        invalid.map(async ({ token, uid }) => {
          try {
            await admin.firestore().collection("users").doc(uid).set(
              { fcmTokens: { [token]: admin.firestore.FieldValue.delete() } },
              { merge: true },
            );
          } catch {}
        }),
      );
    }
  },
);

