// firebase/firebaseConfig.ts
import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Firebase configuration object
const firebaseConfig = {
  apiKey: "AIzaSyBNPhBdMMwUdBqIq_kR8UxOnmul8Z2rMPY",
  authDomain: "trivia-61b3f.firebaseapp.com",
  projectId: "trivia-61b3f",
  storageBucket: "trivia-61b3f.appspot.com",
  messagingSenderId: "377343706461",
  appId: "1:377343706461:web:a03abae69320c1065f94b4",
  measurementId: "G-KMW8464M3V",
};

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth with AsyncStorage persistence for React Native
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Initialize other Firebase services
const database = getDatabase(app);
const storage = getStorage(app);

// Export Firebase services
export { auth, database, storage, app };
