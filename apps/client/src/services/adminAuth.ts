import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { firebaseAuth, googleProvider } from "../config/firebase";

function parseAllowedAdminEmails() {
  const raw = String(import.meta.env.VITE_ADMIN_ALLOWED_EMAILS ?? "");
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmailAllowed(email: string) {
  const allowed = parseAllowedAdminEmails();
  if (allowed.length === 0) return false;
  return allowed.includes(email.trim().toLowerCase());
}

export function observeAdminAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(firebaseAuth, callback);
}

export async function signInAdminWithGoogle() {
  const cred = await signInWithPopup(firebaseAuth, googleProvider);
  const email = cred.user.email;
  if (!email || !isAdminEmailAllowed(email)) {
    await signOut(firebaseAuth);
    throw new Error("허용된 교사 계정만 관리자 화면에 접근할 수 있습니다.");
  }
}

export async function signOutAdmin() {
  await signOut(firebaseAuth);
}
