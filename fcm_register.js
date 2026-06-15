// fcm_register.js — Register device for push notifications (FCM)
// ES MODULE VERSION — matches firebase.js (modular SDK, v10.7.1)
// ============================================================
// HOW IT WORKS:
//   1. Exposes window.registerForPushNotifications(userId)
//   2. profile.js calls this after the user's identity (userId) is known
//   3. Saves the FCM token to Firestore: users/{userId}.fcmToken
// ============================================================

import { app } from "./firebase.js";
import {
  getFirestore,
  doc,
  setDoc,
} from "firebase/firestore";
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
} from "firebase/messaging";

const db = getFirestore(app);

window.registerForPushNotifications = async function (userId) {
  if (!userId) {
    console.warn("[FCM] No userId provided, skipping push registration.");
    return null;
  }

  if (!("serviceWorker" in navigator) || !("Notification" in window)) {
    console.warn("[FCM] Push notifications not supported in this browser.");
    return null;
  }

  try {
    const supported = await isSupported();
    if (!supported) {
      console.warn("[FCM] Firebase Messaging not supported in this browser/context.");
      return null;
    }

    // 1. Ask permission
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") {
      console.warn("[FCM] Notification permission not granted:", permission);
      return null;
    }

    // 2. Register the FCM service worker (handles background messages + PWA caching)
    const registration = await navigator.serviceWorker.register(
      "firebase-messaging-sw.js"
    );
    await navigator.serviceWorker.ready;

    // 3. Get FCM token
    const messaging = getMessaging(app);
    const vapidKey = window.VERTEX_VAPID_KEY;

    if (!vapidKey) {
      console.error("[FCM] Missing VAPID key. Check push_config.js load order.");
      return null;
    }

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      console.warn("[FCM] No registration token returned.");
      return null;
    }

    console.log("[FCM] Token obtained:", token);

    // 4. Save token to Firestore under users/{userId}
    await setDoc(
      doc(db, "users", userId),
      {
        fcmToken: token,
        fcmTokenUpdatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    console.log("[FCM] ✅ Token saved to Firestore for user:", userId);

    // 5. Handle foreground messages (app open & focused)
    onMessage(messaging, (payload) => {
      const d = payload?.data || {};
      const isCall = d.type === "call";
      const title = isCall ? "Incoming Call" : "Vertex Chamber";
      const body = isCall
        ? `${d.callerName || "Member"} is calling you now.`
        : `${d.senderName || "Someone"} sent you a message`;

      if (window.showToast) {
        window.showToast(body, "info");
      } else if (Notification.permission === "granted") {
        new Notification(title, { body, icon: "favicon.png" });
      }
    });

    return token;
  } catch (err) {
    console.error("[FCM] registerForPushNotifications error:", err);
    return null;
  }
};
