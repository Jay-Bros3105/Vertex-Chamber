// firebaseConfig.js
// 🔥 Firebase Initialization for JSL FastLine

import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";

// CONFIG yako (ipo sawa 👍)
const firebaseConfig = {
  apiKey: "AIzaSyC3HO1BY4rw1uVlZnRn4qG3XpxipFzDs0M",
  authDomain: "vertex-chamber-993f6.firebaseapp.com",
  databaseURL: "https://vertex-chamber-993f6-default-rtdb.firebaseio.com",
  projectId: "vertex-chamber-993f6",
  storageBucket: "vertex-chamber-993f6.firebasestorage.app",
  messagingSenderId: "950688239086",
  appId: "1:950688239086:web:13b11f2581e908dabed2ff",
  measurementId: "G-4HBWZ7432G"
};

// Initialize app
export const app = initializeApp(firebaseConfig);

// ✅ ADD THIS (IMPORTANT)
export const storage = getStorage(app);