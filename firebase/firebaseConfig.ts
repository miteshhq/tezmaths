// firebase/firebaseConfig.ts
import { initializeApp } from "firebase/app";
import { initializeAuth, getAuth } from "firebase/auth";
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

// Set up persistent auth
let auth;

try {
  // Create a custom persistence implementation
  const customPersistence = {
    type: 'customImplementation',
    async _get(key) {
      const value = await AsyncStorage.getItem(key);
      return value;
    },
    async _set(key, value) {
      await AsyncStorage.setItem(key, value);
    },
    async _remove(key) {
      await AsyncStorage.removeItem(key);
    }
  };

  // Initialize auth with custom persistence
  auth = initializeAuth(app, {
    persistence: customPersistence
  });
} catch (error) {
  // Fallback to standard auth if custom persistence fails
  console.warn("Custom auth persistence failed, using standard auth:", error);
  auth = getAuth(app);
}

// Initialize other Firebase services
const database = getDatabase(app);
const storage = getStorage(app);

// Export Firebase services
export { auth, database, storage, app };