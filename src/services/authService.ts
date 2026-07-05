import { shouldUseSupabase } from './backendConfig';
import {
  confirmEmailVerification as confirmFirebaseEmailVerification,
  getCurrentFirebaseIdToken,
  getCurrentFirebaseUserId,
  resendEmailVerification as resendFirebaseEmailVerification,
  sendEmailPasswordReset as sendFirebaseEmailPasswordReset,
  signInWithEmail as signInWithFirebaseEmail,
  signOutCurrentUser as signOutCurrentFirebaseUser,
  startEmailVerification as startFirebaseEmailVerification,
  subscribeFirebaseAuthUser
} from './firebaseAuthService';

let cachedSupabaseUserId: string | null = null;

async function refreshSupabaseUserId() {
  const { getCurrentSupabaseUserId } = await import('./supabaseAuthService');
  cachedSupabaseUserId = getCurrentSupabaseUserId();
  return cachedSupabaseUserId;
}

export function getCurrentAuthUserId() {
  if (!shouldUseSupabase()) {
    return getCurrentFirebaseUserId();
  }

  void refreshSupabaseUserId();
  return cachedSupabaseUserId;
}

export function subscribeAuthUser(onChange: (uid: string | null) => void) {
  if (!shouldUseSupabase()) {
    return subscribeFirebaseAuthUser(onChange);
  }

  let unsubscribe: () => void = () => undefined;
  let disposed = false;

  void import('./supabaseAuthService').then(({ subscribeSupabaseAuthUser }) => {
    if (disposed) {
      return;
    }

    unsubscribe = subscribeSupabaseAuthUser((uid) => {
      cachedSupabaseUserId = uid;
      onChange(uid);
    });
  });

  return () => {
    disposed = true;
    unsubscribe();
  };
}

export async function getCurrentAuthToken() {
  if (!shouldUseSupabase()) {
    return getCurrentFirebaseIdToken();
  }

  const { getCurrentSupabaseIdToken } = await import('./supabaseAuthService');
  return getCurrentSupabaseIdToken();
}

export async function signOutCurrentUser() {
  if (!shouldUseSupabase()) {
    return signOutCurrentFirebaseUser();
  }

  const { signOutCurrentSupabaseUser } = await import('./supabaseAuthService');
  cachedSupabaseUserId = null;
  return signOutCurrentSupabaseUser();
}

export async function startEmailVerification(email: string, displayName: string | undefined, password: string) {
  if (!shouldUseSupabase()) {
    return startFirebaseEmailVerification(email, displayName, password);
  }

  const { startSupabaseEmailVerification } = await import('./supabaseAuthService');
  const result = await startSupabaseEmailVerification(email, displayName, password);
  void refreshSupabaseUserId();
  return result;
}

export async function signInWithEmail(email: string, password: string) {
  if (!shouldUseSupabase()) {
    return signInWithFirebaseEmail(email, password);
  }

  const { signInWithSupabaseEmail } = await import('./supabaseAuthService');
  const result = await signInWithSupabaseEmail(email, password);
  void refreshSupabaseUserId();
  return result;
}

export async function sendEmailPasswordReset(email: string) {
  if (!shouldUseSupabase()) {
    return sendFirebaseEmailPasswordReset(email);
  }

  const { sendSupabaseEmailPasswordReset } = await import('./supabaseAuthService');
  return sendSupabaseEmailPasswordReset(email);
}

export async function resendEmailVerification() {
  if (!shouldUseSupabase()) {
    return resendFirebaseEmailVerification();
  }

  const { resendSupabaseEmailVerification } = await import('./supabaseAuthService');
  return resendSupabaseEmailVerification();
}

export async function confirmEmailVerification() {
  if (!shouldUseSupabase()) {
    return confirmFirebaseEmailVerification();
  }

  const { confirmSupabaseEmailVerification } = await import('./supabaseAuthService');
  const result = await confirmSupabaseEmailVerification();
  void refreshSupabaseUserId();
  return result;
}
