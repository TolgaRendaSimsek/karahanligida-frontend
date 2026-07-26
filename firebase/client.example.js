// Firebase geçişi onaylandığında config değerlerini Firebase Console'dan alın.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  collection,
  getDocs,
  getFirestore,
  orderBy,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "FIREBASE_API_KEY",
  authDomain: "FIREBASE_PROJECT_ID.firebaseapp.com",
  projectId: "FIREBASE_PROJECT_ID",
  storageBucket: "FIREBASE_PROJECT_ID.firebasestorage.app",
  appId: "FIREBASE_APP_ID",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function fetchPublishedFamilies() {
  const productsQuery = query(
    collection(db, "productFamilies"),
    where("status", "==", "published"),
    orderBy("name"),
  );
  const snapshot = await getDocs(productsQuery);
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
}
