import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { firebaseAuth, googleProvider } from "../config/firebase";

export function observeAdminAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(firebaseAuth, callback);
}

export async function signInAdminWithGoogle() {
  await signInWithPopup(firebaseAuth, googleProvider);
}

export async function signOutAdmin() {
  await signOut(firebaseAuth);
}
