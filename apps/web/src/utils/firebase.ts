import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  FacebookAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  TwitterAuthProvider,
  onAuthStateChanged,
  signInWithRedirect,
  signInWithPopup,
  getRedirectResult,
  type User,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const firebaseEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId);

function getFirebaseAuth() {
  if (!firebaseEnabled) return null;
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return getAuth(app);
}

function isIOSDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOSDevice = /iPhone|iPad|iPod/i.test(ua);
  const iPadDesktop = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadDesktop;
}

export function isFirebaseEnabled() {
  return firebaseEnabled;
}

export function onFirebaseUser(callback: (user: User | null) => void) {
  const auth = getFirebaseAuth();
  if (!auth) return () => undefined;
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle() {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(auth, provider);
}

export async function signInWithFacebook() {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  const provider = new FacebookAuthProvider();
  provider.addScope("email");
  if (isIOSDevice()) {
    return signInWithRedirect(auth, provider);
  }
  return signInWithPopup(auth, provider);
}

export async function signInWithApple() {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  if (isIOSDevice()) {
    return signInWithRedirect(auth, provider);
  }
  return signInWithPopup(auth, provider);
}

export async function signInWithTwitter() {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  const provider = new TwitterAuthProvider();
  if (isIOSDevice()) {
    return signInWithRedirect(auth, provider);
  }
  return signInWithPopup(auth, provider);
}

export async function handleAppleRedirectResult() {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  return getRedirectResult(auth);
}
