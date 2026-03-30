/**
 * ============================================================
 * message_controller.js — Firebase-Integrated Message Controller
 * Vertex Chamber | Real-time Chat Backend Logic
 * ============================================================
 *
 * SETUP INSTRUCTIONS:
 * 1. Replace the Firebase config in messages.html with your actual project config
 *    (found in Firebase Console → Project Settings → Your Apps → SDK Setup)
 * 2. Enable Firebase Authentication (Email/Password or Google Sign-In)
 * 3. Create a Firestore database in your Firebase console
 * 4. Set Firestore rules to allow authenticated reads/writes:
 *      rules_version = '2';
 *      service cloud.firestore.rules {
 *        match /databases/{database}/documents {
 *          match /messages/{messageId} {
 *            allow read, write: if request.auth != null;
 *          }
 *          match /conversations/{convId} {
 *            allow read, write: if request.auth != null;
 *          }
 *        }
 *      }
 * 5. Enable Firebase Storage for file/audio uploads
 * ============================================================
 */

// ─────────────────────────────────────────────────────────────
// MESSAGE CONTROLLER — Firebase Firestore Operations
// This module handles all message CRUD + real-time operations
// ─────────────────────────────────────────────────────────────

const MessageController = (() => {

  // ─── Firestore Collection References ─────────────────────────
  // These are lazily resolved so Firebase is initialized first
  const getMessagesRef = (conversationId) =>
    firebase.firestore().collection('conversations').doc(conversationId).collection('messages');

  const getConversationsRef = () =>
    firebase.firestore().collection('conversations');

  // ─── Active Listeners Registry (to unsubscribe on cleanup) ───
  const activeListeners = {};

  // ============================================================
  // SEND A MESSAGE
  // Writes a new message document to Firestore
  // ============================================================
  const sendMessage = async ({
    conversationId,
    senderId,
    receiverId,
    content,
    type = 'text',         // 'text' | 'audio' | 'file' | 'image' | 'code'
    attachmentURL = null,  // Firebase Storage download URL
    attachmentName = null, // Original filename
    attachmentSize = null, // File size in bytes
    replyTo = null,        // Message ID being replied to
    codeSnippet = null,    // { language: String, code: String }
  }) => {
    try {
      const messagesRef = getMessagesRef(conversationId);

      // Build the message document
      const messageData = {
        conversationId,
        senderId,
        receiverId,
        content,
        type,
        attachmentURL,
        attachmentName,
        attachmentSize,
        replyTo,             // Reference to parent message ID (for reply threads)
        codeSnippet,
        reactions: {},       // { emoji: [userId, ...] }
        readBy: [senderId],  // Sender has already "read" their own message
        deleted: false,
        edited: false,
        editedAt: null,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      };

      // Add the message to Firestore
      const docRef = await messagesRef.add(messageData);

      // Update the conversation's last message preview
      await updateConversationPreview(conversationId, {
        lastMessage: type === 'text' ? content : `[${type}]`,
        lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
        lastSenderId: senderId,
      });

      console.log('[MessageController] Message sent:', docRef.id);
      return docRef.id;
    } catch (error) {
      console.error('[MessageController] sendMessage error:', error);
      throw error;
    }
  };

  // ============================================================
  // LISTEN FOR REAL-TIME MESSAGES
  // Attaches a Firestore onSnapshot listener for live updates
  // Call unsubscribeMessages(conversationId) to stop listening
  // ============================================================
  const listenForMessages = (conversationId, callback) => {
    // Unsubscribe from previous listener if switching conversations
    if (activeListeners[conversationId]) {
      activeListeners[conversationId]();
    }

    const messagesRef = getMessagesRef(conversationId)
      .orderBy('timestamp', 'asc')   // Chronological order
      .limit(100);                    // Load last 100 messages

    const unsubscribe = messagesRef.onSnapshot((snapshot) => {
      const changes = snapshot.docChanges();

      changes.forEach((change) => {
        const message = { id: change.doc.id, ...change.doc.data() };

        if (change.type === 'added') {
          callback({ type: 'added', message });
        } else if (change.type === 'modified') {
          callback({ type: 'modified', message });
        } else if (change.type === 'removed') {
          callback({ type: 'removed', message });
        }
      });
    }, (error) => {
      console.error('[MessageController] listenForMessages error:', error);
    });

    // Store reference for later cleanup
    activeListeners[conversationId] = unsubscribe;
    return unsubscribe;
  };

  // ============================================================
  // UNSUBSCRIBE FROM MESSAGE LISTENER
  // ============================================================
  const unsubscribeMessages = (conversationId) => {
    if (activeListeners[conversationId]) {
      activeListeners[conversationId]();
      delete activeListeners[conversationId];
      console.log('[MessageController] Unsubscribed from:', conversationId);
    }
  };

  // ============================================================
  // MARK MESSAGE AS READ
  // Adds the currentUser's ID to the message's readBy array
  // ============================================================
  const markAsRead = async (conversationId, messageId, userId) => {
    try {
      const msgRef = getMessagesRef(conversationId).doc(messageId);
      await msgRef.update({
        readBy: firebase.firestore.FieldValue.arrayUnion(userId),
      });
    } catch (error) {
      console.error('[MessageController] markAsRead error:', error);
    }
  };

  // ============================================================
  // ADD / TOGGLE REACTION
  // Adds or removes a reaction emoji from a message
  // Reactions stored as: { "❤️": ["uid1", "uid2"], "👍": ["uid3"] }
  // ============================================================
  const toggleReaction = async (conversationId, messageId, userId, emoji) => {
    try {
      const msgRef = getMessagesRef(conversationId).doc(messageId);
      const msgSnap = await msgRef.get();
      const reactions = msgSnap.data().reactions || {};
      const usersWhoReacted = reactions[emoji] || [];

      if (usersWhoReacted.includes(userId)) {
        // Remove reaction — user already reacted with this emoji
        reactions[emoji] = usersWhoReacted.filter(uid => uid !== userId);
        if (reactions[emoji].length === 0) delete reactions[emoji];
      } else {
        // Add reaction
        reactions[emoji] = [...usersWhoReacted, userId];
      }

      await msgRef.update({ reactions });
      return reactions;
    } catch (error) {
      console.error('[MessageController] toggleReaction error:', error);
      throw error;
    }
  };

  // ============================================================
  // EDIT A MESSAGE
  // Only the original sender should be allowed to edit
  // ============================================================
  const editMessage = async (conversationId, messageId, senderId, newContent) => {
    try {
      const msgRef = getMessagesRef(conversationId).doc(messageId);
      const msgSnap = await msgRef.get();
      const msgData = msgSnap.data();

      // Security check — only sender can edit
      if (msgData.senderId !== senderId) {
        throw new Error('Unauthorized: Only the sender can edit this message.');
      }

      if (msgData.deleted) {
        throw new Error('Cannot edit a deleted message.');
      }

      await msgRef.update({
        content: newContent,
        edited: true,
        editedAt: firebase.firestore.FieldValue.serverTimestamp(),
        previousContent: msgData.content, // Keep edit history
      });

      console.log('[MessageController] Message edited:', messageId);
    } catch (error) {
      console.error('[MessageController] editMessage error:', error);
      throw error;
    }
  };

  // ============================================================
  // SOFT DELETE A MESSAGE
  // Sets deleted: true, replaces content with placeholder
  // ============================================================
  const deleteMessage = async (conversationId, messageId, userId) => {
    try {
      const msgRef = getMessagesRef(conversationId).doc(messageId);
      const msgSnap = await msgRef.get();
      const msgData = msgSnap.data();

      // Only sender or receiver can delete
      if (msgData.senderId !== userId && msgData.receiverId !== userId) {
        throw new Error('Unauthorized: You cannot delete this message.');
      }

      await msgRef.update({
        deleted: true,
        deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
        deletedBy: userId,
        content: 'This message was deleted',
      });

      console.log('[MessageController] Message soft-deleted:', messageId);
    } catch (error) {
      console.error('[MessageController] deleteMessage error:', error);
      throw error;
    }
  };

  // ============================================================
  // UPLOAD FILE TO FIREBASE STORAGE
  // Returns a download URL after upload completes
  // progressCallback(percent) is called during upload
  // ============================================================
  const uploadFile = async (file, conversationId, senderId, progressCallback) => {
    try {
      const extension = file.name.split('.').pop();
      const uniqueName = `${Date.now()}_${senderId}.${extension}`;
      const storagePath = `chat_files/${conversationId}/${uniqueName}`;
      const storageRef = firebase.storage().ref(storagePath);

      const uploadTask = storageRef.put(file);

      return new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            // Progress percentage
            const percent = Math.round(
              (snapshot.bytesTransferred / snapshot.totalBytes) * 100
            );
            if (progressCallback) progressCallback(percent);
          },
          (error) => {
            console.error('[MessageController] uploadFile error:', error);
            reject(error);
          },
          async () => {
            // Upload complete — get download URL
            const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
            resolve({ downloadURL, storagePath, uniqueName });
          }
        );
      });
    } catch (error) {
      console.error('[MessageController] uploadFile error:', error);
      throw error;
    }
  };

  // ============================================================
  // UPLOAD AUDIO BLOB (voice messages)
  // ============================================================
  const uploadAudio = async (audioBlob, conversationId, senderId) => {
    try {
      const uniqueName = `voice_${Date.now()}_${senderId}.webm`;
      const storagePath = `chat_audio/${conversationId}/${uniqueName}`;
      const storageRef = firebase.storage().ref(storagePath);

      await storageRef.put(audioBlob, { contentType: 'audio/webm' });
      const downloadURL = await storageRef.getDownloadURL();

      return { downloadURL, storagePath, uniqueName };
    } catch (error) {
      console.error('[MessageController] uploadAudio error:', error);
      throw error;
    }
  };

  // ============================================================
  // GET OR CREATE CONVERSATION
  // Creates a conversation document if it doesn't exist
  // conversationId is typically sorted userIds joined: "uid1_uid2"
  // ============================================================
  const getOrCreateConversation = async (userId1, userId2) => {
    try {
      // Deterministic conversation ID from two user IDs
      const conversationId = [userId1, userId2].sort().join('_');
      const convRef = getConversationsRef().doc(conversationId);
      const convSnap = await convRef.get();

      if (!convSnap.exists) {
        await convRef.set({
          participants: [userId1, userId2],
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          lastMessage: '',
          lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
          lastSenderId: null,
        });
        console.log('[MessageController] Conversation created:', conversationId);
      }

      return conversationId;
    } catch (error) {
      console.error('[MessageController] getOrCreateConversation error:', error);
      throw error;
    }
  };

  // ============================================================
  // LISTEN FOR CONVERSATIONS (sidebar list)
  // Returns all conversations the current user is part of
  // ============================================================
  const listenForConversations = (userId, callback) => {
    const unsubscribe = getConversationsRef()
      .where('participants', 'array-contains', userId)
      .orderBy('lastMessageTime', 'desc')
      .onSnapshot((snapshot) => {
        const conversations = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));
        callback(conversations);
      }, (error) => {
        console.error('[MessageController] listenForConversations error:', error);
      });

    return unsubscribe;
  };

  // ─── Private Helper: Update Conversation Preview ─────────────
  const updateConversationPreview = async (conversationId, data) => {
    try {
      await getConversationsRef().doc(conversationId).update(data);
    } catch (error) {
      // Conversation may not exist yet — ignore
      console.warn('[MessageController] updateConversationPreview:', error);
    }
  };

  // ─── Public API ───────────────────────────────────────────────
  return {
    sendMessage,
    listenForMessages,
    unsubscribeMessages,
    markAsRead,
    toggleReaction,
    editMessage,
    deleteMessage,
    uploadFile,
    uploadAudio,
    getOrCreateConversation,
    listenForConversations,
  };

})();

// Export for use in messages.html script block
// (No module system needed — included via <script> tag)
window.MessageController = MessageController;
