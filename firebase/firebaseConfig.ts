// firebase/firebaseConfig.ts
import { initializeApp } from "firebase/app";
import { initializeAuth, getAuth, getReactNativePersistence } from "firebase/auth";
// import { initializeAuth, getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Firebase configuration object
// const firebaseConfig = {
//   apiKey: "AIzaSyBNPhBdMMwUdBqIq_kR8UxOnmul8Z2rMPY",
//   authDomain: "trivia-61b3f.firebaseapp.com",
//   projectId: "trivia-61b3f",
//   storageBucket: "trivia-61b3f.appspot.com",
//   messagingSenderId: "377343706461",
//   appId: "1:377343706461:web:a03abae69320c1065f94b4",
//   measurementId: "G-KMW8464M3V",
// };
  
const firebaseConfig = {
    apiKey: "AIzaSyAaMWEBerw_jCWtkhD5ELmtE3ZQAq5RiVc",
    authDomain: "tezmaths-56cc1.firebaseapp.com",
    projectId: "tezmaths-56cc1",
    storageBucket: "tezmaths-56cc1.firebasestorage.app",
    databaseURL: "https://tezmaths-56cc1-default-rtdb.asia-southeast1.firebasedatabase.app",
    messagingSenderId: "416608871397",
    appId: "1:416608871397:web:fd3531478835e13957c50c",
    measurementId: "G-49W66LH5M8"
  };

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// Initialize auth with React Native persistence
const auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
});

// Initialize other Firebase services
const database = getDatabase(app);
const storage = getStorage(app);

// Export Firebase services
export { auth, database, storage, app };