// firebase.js
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
