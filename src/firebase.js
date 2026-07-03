import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAQno73ZNnmCFl_JnZrt3Acj6IsPIftjqY",
  authDomain: "healthcare-assistant-app-3c14a.firebaseapp.com",
  databaseURL: "https://healthcare-assistant-app-3c14a-default-rtdb.firebaseio.com",
  projectId: "healthcare-assistant-app-3c14a",
  storageBucket: "healthcare-assistant-app-3c14a.appspot.com",
  messagingSenderId: "584545978354",
  appId: "1:584545978354:web:1fd48dc48eb7e4ee3c4d6b",
};

const app = initializeApp(firebaseConfig);

export const database = getDatabase(app);
export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const storage = getStorage(app);
export default app;
