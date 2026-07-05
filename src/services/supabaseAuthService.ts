import type { Subscription } from '@supabase/supabase-js';
import { supabaseMissingConfigMessage } from './backendConfig';
import { getCurrentSupabaseAccessToken, getCurrentSupabaseUser, getSupabaseClient } from './supabaseClient';

type VerificationResult = {
  ok: boolean;
  message: string;
  displayName?: string;
  contact?: string;
};

let cachedUserId: string | null = null;
let pendingEmail = '';
let pendingPassword = '';
let pendingDisplayName = '';

function cleanEmail(email: string) {
  return email.trim().toLowerCase();
}

function supabaseAuthErrorMessage(error: unknown) {
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';
  const normalized = message.toLowerCase();

  if (normalized.includes('already registered') || normalized.includes('already exists')) {
    return 'This email is already registered. Use Log in at the bottom of the page.';
  }

  if (normalized.includes('invalid login') || normalized.includes('invalid credentials')) {
    return 'Email or password is incorrect.';
  }

  if (normalized.includes('email not confirmed')) {
    return 'Email is not verified yet. Check Gmail, then try again.';
  }

  if (normalized.includes('password')) {
    return 'Password must be at least 6 characters.';
  }

  if (normalized.includes('network') || normalized.includes('fetch')) {
    return 'Network connection failed. Please try again when you are online.';
  }

  return message || 'Supabase verification could not start yet. Check your Supabase setup and try again.';
}

function isEmailVerified(user: { email_confirmed_at?: string | null; confirmed_at?: string | null } | null) {
  return Boolean(user?.email_confirmed_at || user?.confirmed_at);
}

export function getCurrentSupabaseUserId() {
  void getCurrentSupabaseUser().then((user) => {
    cachedUserId = user?.id ?? cachedUserId;
  });

  return cachedUserId;
}

export function subscribeSupabaseAuthUser(onChange: (uid: string | null) => void) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    cachedUserId = null;
    onChange(null);
    return () => undefined;
  }

  void supabase.auth.getUser().then(({ data }) => {
    cachedUserId = data.user?.id ?? null;
    onChange(cachedUserId);
  });

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cachedUserId = session?.user?.id ?? null;
    onChange(cachedUserId);
  });

  return () => {
    const subscription: Subscription = data.subscription;
    subscription.unsubscribe();
  };
}

export async function getCurrentSupabaseIdToken() {
  return getCurrentSupabaseAccessToken();
}

export async function signOutCurrentSupabaseUser() {
  const supabase = getSupabaseClient();

  pendingEmail = '';
  pendingPassword = '';
  pendingDisplayName = '';
  cachedUserId = null;

  if (!supabase) {
    return;
  }

  await supabase.auth.signOut();
}

export async function startSupabaseEmailVerification(
  email: string,
  displayName: string | undefined,
  password: string
): Promise<VerificationResult> {
  const supabase = getSupabaseClient();
  const cleanPassword = password.trim();
  const cleanName = displayName?.trim() ?? '';
  const cleanContact = cleanEmail(email);

  if (!supabase) {
    return { ok: false, message: supabaseMissingConfigMessage() };
  }

  if (cleanPassword.length < 6) {
    return { ok: false, message: 'Password must be at least 6 characters.' };
  }

  const { data, error } = await supabase.auth.signUp({
    email: cleanContact,
    password: cleanPassword,
    options: {
      data: {
        display_name: cleanName
      }
    }
  });

  if (error) {
    return { ok: false, message: supabaseAuthErrorMessage(error) };
  }

  pendingEmail = cleanContact;
  pendingPassword = cleanPassword;
  pendingDisplayName = cleanName;
  cachedUserId = data.user?.id ?? cachedUserId;

  return {
    ok: true,
    message:
      isEmailVerified(data.user)
        ? 'Email verified. You can finish creating your KaTalk profile.'
        : 'Verification email sent. Check Gmail inbox, spam, and Promotions, then tap Confirm Verification after opening the link.'
  };
}

export async function signInWithSupabaseEmail(email: string, password: string): Promise<VerificationResult> {
  const supabase = getSupabaseClient();
  const cleanContact = cleanEmail(email);

  if (!supabase) {
    return { ok: false, message: supabaseMissingConfigMessage() };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanContact,
    password
  });

  if (error) {
    return { ok: false, message: supabaseAuthErrorMessage(error) };
  }

  if (!isEmailVerified(data.user)) {
    await supabase.auth.resend({ type: 'signup', email: cleanContact }).catch(() => undefined);

    return {
      ok: false,
      message: 'Email is not verified yet. I sent another verification email to your Gmail.'
    };
  }

  cachedUserId = data.user.id;

  return {
    ok: true,
    message: 'Signed in.',
    displayName: String(data.user.user_metadata?.display_name ?? ''),
    contact: data.user.email ?? cleanContact
  };
}

export async function sendSupabaseEmailPasswordReset(email: string): Promise<VerificationResult> {
  const supabase = getSupabaseClient();
  const cleanContact = cleanEmail(email);

  if (!supabase) {
    return { ok: false, message: supabaseMissingConfigMessage() };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(cleanContact);

  if (error) {
    return { ok: false, message: supabaseAuthErrorMessage(error) };
  }

  return { ok: true, message: 'Password reset email sent. Check Gmail inbox, spam, and Promotions.' };
}

export async function resendSupabaseEmailVerification(): Promise<VerificationResult> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return { ok: false, message: supabaseMissingConfigMessage() };
  }

  if (!pendingEmail) {
    return {
      ok: false,
      message: 'This app session has no pending verification. Enter the email again, then send verification.'
    };
  }

  const { error } = await supabase.auth.resend({ type: 'signup', email: pendingEmail });

  if (error) {
    return { ok: false, message: supabaseAuthErrorMessage(error) };
  }

  return { ok: true, message: 'Verification email resent. Check Gmail inbox, spam, and Promotions.' };
}

export async function confirmSupabaseEmailVerification(): Promise<VerificationResult> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return { ok: false, message: supabaseMissingConfigMessage() };
  }

  if (!pendingEmail || !pendingPassword) {
    const user = await getCurrentSupabaseUser();

    if (isEmailVerified(user)) {
      cachedUserId = user?.id ?? cachedUserId;
      return { ok: true, message: 'Email verified. You can finish creating your KaTalk profile.' };
    }

    return { ok: false, message: 'Send a verification email first.' };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: pendingEmail,
    password: pendingPassword
  });

  if (error) {
    return { ok: false, message: supabaseAuthErrorMessage(error) };
  }

  if (!isEmailVerified(data.user)) {
    return {
      ok: false,
      message: 'Email is not verified yet. Open Gmail, finish verification, then tap Confirm Verification again.'
    };
  }

  cachedUserId = data.user.id;

  return {
    ok: true,
    message: 'Email verified. You can finish creating your KaTalk profile.',
    displayName: pendingDisplayName,
    contact: pendingEmail
  };
}
