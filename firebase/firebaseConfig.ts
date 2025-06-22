// firebase/firebaseConfig.ts
import { initializeApp } from "firebase/app";
// import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { initializeAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
  
const firebaseConfig = {
    apiKey: "AIzaSyBGfk9QuJ7MIwtO3N0dUVUl8J9fHHxtx0Q",
    authDomain: "tezmathsinnovations.firebaseapp.com",
    databaseURL: "https://tezmathsinnovations-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "tezmathsinnovations",
    storageBucket: "tezmathsinnovations.firebasestorage.app",
    messagingSenderId: "235143806197",
    appId: "1:235143806197:web:83038f294f00e2f85a19bc",
    measurementId: "G-GZQ990NRV3"
};

const app = initializeApp(firebaseConfig);

const auth = initializeAuth(app);
// const auth = initializeAuth(app, {
//     persistence: getReactNativePersistence(AsyncStorage),
// });

const database = getDatabase(app);
const storage = getStorage(app);

export { auth, database, storage, app };