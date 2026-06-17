import { initializeApp, getApps } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  reload,
  sendEmailVerification,
  updateProfile,
  type User
} from 'firebase/auth';

declare const process: {
  env: Record<string, string | undefined>;
};

type VerificationResult = {
  ok: boolean;
  message: string;
};

let pendingVerificationUser: User | null = null;

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim(),
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim(),
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim(),
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim(),
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID?.trim()
};

const requiredFirebaseKeys = [
  ['EXPO_PUBLIC_FIREBASE_API_KEY', firebaseConfig.apiKey],
  ['EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', firebaseConfig.authDomain],
  ['EXPO_PUBLIC_FIREBASE_PROJECT_ID', firebaseConfig.projectId],
  ['EXPO_PUBLIC_FIREBASE_APP_ID', firebaseConfig.appId]
] as const;

function getMissingFirebaseKeys() {
  return requiredFirebaseKeys.filter(([, value]) => !value).map(([key]) => key);
}

export function isFirebaseEmailVerificationConfigured() {
  return getMissingFirebaseKeys().length === 0;
}

function getFirebaseAuth() {
  if (!isFirebaseEmailVerificationConfigured()) {
    return null;
  }

  const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  return getAuth(app);
}

function createTemporaryPassword() {
  return `KaTalk-${Date.now()}-${Math.random().toString(36).slice(2)}!`;
}

function getFirebaseErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';

  if (code === 'auth/email-already-in-use') {
    return 'This email is already registered. Sign-in support will be connected next.';
  }

  if (code === 'auth/invalid-email') {
    return 'Please enter a valid email address.';
  }

  if (code === 'auth/network-request-failed') {
    return 'Network connection failed. Please try again when you are online.';
  }

  return 'Verification could not start. Please check Firebase setup and try again.';
}

export async function startEmailVerification(email: string, displayName?: string): Promise<VerificationResult> {
  const auth = getFirebaseAuth();

  if (!auth) {
    const missingKeys = getMissingFirebaseKeys();

    return {
      ok: false,
      message:
        missingKeys.length > 0
          ? 'KaTalk is not connected to Firebase yet. Paste your Firebase Web App config into the .env file, then fully restart Expo.'
          : 'KaTalk cannot reach Firebase yet. Check your Firebase values, then fully restart Expo.'
    };
  }

  try {
    const credential = await createUserWithEmailAndPassword(auth, email, createTemporaryPassword());

    if (displayName?.trim()) {
      await updateProfile(credential.user, { displayName: displayName.trim() });
    }

    await sendEmailVerification(credential.user);
    pendingVerificationUser = credential.user;

    return {
      ok: true,
      message: 'Verification email sent. Open Gmail, verify the email, then tap Confirm Verification.'
    };
  } catch (error) {
    return {
      ok: false,
      message: getFirebaseErrorMessage(error)
    };
  }
}

export async function confirmEmailVerification(): Promise<VerificationResult> {
  if (!pendingVerificationUser) {
    return {
      ok: false,
      message: 'Send a verification email first.'
    };
  }

  try {
    await reload(pendingVerificationUser);

    if (!pendingVerificationUser.emailVerified) {
      return {
        ok: false,
        message: 'Email is not verified yet. Open Gmail, finish verification, then tap Confirm Verification again.'
      };
    }

    return {
      ok: true,
      message: 'Email verified. You can finish creating your KaTalk profile.'
    };
  } catch {
    return {
      ok: false,
      message: 'Could not confirm verification yet. Please try again.'
    };
  }
}
