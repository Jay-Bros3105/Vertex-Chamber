// fcm_register.js — Register device for push notifications (FCM)
// ============================================================
// HOW TO USE:
//   1. Include this script AFTER firebase.js (which initializes firebase app)
//      and AFTER push_config.js (which sets window.VERTEX_VAPID_KEY).
//   2. Call window.registerForPushNotifications(userId) once the user
//      is logged in (e.g. inside profile.js after loadUserProfile()).
//   3. The token is saved to Firestore: users/{userId}.fcmToken
// ============================================================

(function () {
  async function registerForPushNotifications(userId) {
    if (!userId) {
      console.warn('[FCM] No userId provided, skipping push registration.');
      return null;
    }

    if (!('serviceWorker' in navigator) || !('Notification' in window)) {
      console.warn('[FCM] Push notifications not supported in this browser.');
      return null;
    }

    try {
      // 1. Ask permission
      let permission = Notification.permission;
      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }

      if (permission !== 'granted') {
        console.warn('[FCM] Notification permission not granted:', permission);
        return null;
      }

      // 2. Ensure the FCM service worker is registered
      //    (firebase-messaging-sw.js handles background messages + caching)
      const registration = await navigator.serviceWorker.register('firebase-messaging-sw.js');
      await navigator.serviceWorker.ready;

      // 3. Get FCM token using the messaging instance from firebase.js
      const messaging = firebase.messaging();
      const vapidKey = window.VERTEX_VAPID_KEY;

      if (!vapidKey) {
        console.error('[FCM] Missing VAPID key. Check push_config.js.');
        return null;
      }

      const token = await messaging.getToken({
        vapidKey,
        serviceWorkerRegistration: registration,
      });

      if (!token) {
        console.warn('[FCM] No registration token returned.');
        return null;
      }

      console.log('[FCM] Token obtained:', token);

      // 4. Save token to Firestore under users/{userId}
      await firebase.firestore().collection('users').doc(userId).set(
        {
          fcmToken: token,
          fcmTokenUpdatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      console.log('[FCM] Token saved to Firestore for user:', userId);

      // 5. Listen for token refresh (rotates periodically)
      messaging.onTokenRefresh(async () => {
        try {
          const newToken = await messaging.getToken({
            vapidKey,
            serviceWorkerRegistration: registration,
          });
          await firebase.firestore().collection('users').doc(userId).set(
            { fcmToken: newToken, fcmTokenUpdatedAt: new Date().toISOString() },
            { merge: true }
          );
          console.log('[FCM] Token refreshed and saved.');
        } catch (err) {
          console.error('[FCM] Token refresh error:', err);
        }
      });

      // 6. Handle foreground messages (app open & focused)
      messaging.onMessage((payload) => {
        const d = payload?.data || {};
        const isCall = d.type === 'call';
        const title = isCall ? 'Incoming Call' : 'Vertex Chamber';
        const body = isCall
          ? `${d.callerName || 'Member'} is calling you now.`
          : `${d.senderName || 'Someone'} sent you a message`;

        if (window.showToast) {
          window.showToast(body, 'info');
        } else if (Notification.permission === 'granted') {
          new Notification(title, { body, icon: 'favicon.png' });
        }
      });

      return token;
    } catch (err) {
      console.error('[FCM] registerForPushNotifications error:', err);
      return null;
    }
  }

  window.registerForPushNotifications = registerForPushNotifications;
})();
