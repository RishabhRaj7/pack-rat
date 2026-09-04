/**
 * Firebase adapter. The app is fully functional in local-only mode (IndexedDB) when no
 * VITE_FIREBASE_* env vars are provided. Add them to `.env.local` to enable Auth + Firestore + Storage sync.
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged, type Auth, type User } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(cfg.apiKey && cfg.projectId && cfg.appId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestore: Firestore | null = null;
let storage: FirebaseStorage | null = null;

export function getFirebase() {
  if (!isFirebaseConfigured) return null;
  if (!app) {
    app = getApps()[0] ?? initializeApp(cfg);
    auth = getAuth(app);
    firestore = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
    storage = getStorage(app);
  }
  return { app, auth: auth!, firestore: firestore!, storage: storage! };
}

export async function signInWithGoogle() {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await signInWithPopup(fb.auth, new GoogleAuthProvider());
}
export async function signOut() {
  const fb = getFirebase();
  if (fb) await fbSignOut(fb.auth);
}
export function watchAuth(cb: (u: User | null) => void) {
  const fb = getFirebase();
  if (!fb) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(fb.auth, cb);
}
export type { User };
