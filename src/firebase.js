import { initializeApp } from "firebase/app";

import { getAuth, GoogleAuthProvider } from "firebase/auth";

import { getFirestore } from "firebase/firestore";

const firebaseConfig = {

  apiKey: "AIzaSyA8VWtclweSA58JllCxrEsmUAFzRqyxRJ4",

  authDomain: "babi-baba.firebaseapp.com",

  projectId: "babi-baba",

  storageBucket: "babi-baba.firebasestorage.app",

  messagingSenderId: "1016891124973",

  appId: "1:1016891124973:web:2206bb7ce3633711d7b0e4"

};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();

export { app, auth, googleProvider, db };

