import {
  confirmSupabaseEmailVerification,
  getCurrentSupabaseIdToken,
  getCurrentSupabaseUserId,
  resendSupabaseEmailVerification,
  sendSupabaseEmailPasswordReset,
  signInWithSupabaseEmail,
  signOutCurrentSupabaseUser,
  startSupabaseEmailVerification,
  subscribeSupabaseAuthUser
} from './supabaseAuthService';

let cachedSupabaseUserId: string | null = null;

async function refreshSupabaseUserId() {
  cachedSupabaseUserId = getCurrentSupabaseUserId();
  return cachedSupabaseUserId;
}

export function getCurrentAuthUserId() {
  void refreshSupabaseUserId();
  return cachedSupabaseUserId;
}

export function subscribeAuthUser(onChange: (uid: string | null) => void) {
  return subscribeSupabaseAuthUser((uid) => {
    cachedSupabaseUserId = uid;
    onChange(uid);
  });
}

export function getCurrentAuthToken() {
  return getCurrentSupabaseIdToken();
}

export async function signOutCurrentUser() {
  cachedSupabaseUserId = null;
  return signOutCurrentSupabaseUser();
}

export async function startEmailVerification(email: string, displayName: string | undefined, password: string) {
  const result = await startSupabaseEmailVerification(email, displayName, password);
  void refreshSupabaseUserId();
  return result;
}

export async function signInWithEmail(email: string, password: string) {
  const result = await signInWithSupabaseEmail(email, password);
  void refreshSupabaseUserId();
  return result;
}

export function sendEmailPasswordReset(email: string) {
  return sendSupabaseEmailPasswordReset(email);
}

export function resendEmailVerification() {
  return resendSupabaseEmailVerification();
}

export async function confirmEmailVerification() {
  const result = await confirmSupabaseEmailVerification();
  void refreshSupabaseUserId();
  return result;
}
