import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import Constants from 'expo-constants';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  signInWithEmailAndPassword,
  updateProfile,
  type User
} from 'firebase/auth';

declare const process: {
  env: Record<string, string | undefined>;
};

type VerificationResult = {
  ok: boolean;
  message: string;
  displayName?: string;
  contact?: string;
};

let pendingVerificationUser: User | null = null;
const FIREBASE_TIMEOUT_ERROR = 'KATALK_FIREBASE_TIMEOUT';

function withFirebaseTimeout<T>(promise: Promise<T>, timeoutMs = 10000) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(FIREBASE_TIMEOUT_ERROR)), timeoutMs);
    })
  ]);
}

function cleanEnvValue(value?: string) {
  return value?.trim().replace(/,$/, '').replace(/^["']|["']$/g, '');
}

type FirebasePublicConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
};

const firebaseFallbackConfig: FirebasePublicConfig = {
  apiKey: 'AIzaSyBKJXkyKBo2Oyo4LzfhcdFKAHneYlH9VoQ',
  authDomain: 'katalk-fbaf6.firebaseapp.com',
  projectId: 'katalk-fbaf6',
  storageBucket: 'katalk-fbaf6.firebasestorage.app',
  messagingSenderId: '621528799120',
  appId: '1:621528799120:web:5c3486122c4d10bf190515'
};

function getExtraFirebaseConfig(): FirebasePublicConfig {
  const extra = Constants.expoConfig?.extra ?? Constants.manifest2?.extra ?? {};
  const firebase = (extra as { firebase?: FirebasePublicConfig }).firebase;

  return firebase ?? {};
}

function getFirebaseConfig(): FirebasePublicConfig {
  const extraConfig = getExtraFirebaseConfig();

  return {
    apiKey: cleanEnvValue(process.env.EXPO_PUBLIC_FIREBASE_API_KEY) || cleanEnvValue(extraConfig.apiKey) || firebaseFallbackConfig.apiKey,
    authDomain: cleanEnvValue(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN) || cleanEnvValue(extraConfig.authDomain) || firebaseFallbackConfig.authDomain,
    projectId: cleanEnvValue(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID) || cleanEnvValue(extraConfig.projectId) || firebaseFallbackConfig.projectId,
    storageBucket: cleanEnvValue(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET) || cleanEnvValue(extraConfig.storageBucket) || firebaseFallbackConfig.storageBucket,
    messagingSenderId: cleanEnvValue(process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID) || cleanEnvValue(extraConfig.messagingSenderId) || firebaseFallbackConfig.messagingSenderId,
    appId: cleanEnvValue(process.env.EXPO_PUBLIC_FIREBASE_APP_ID) || cleanEnvValue(extraConfig.appId) || firebaseFallbackConfig.appId
  };
}

function getRequiredFirebaseKeys() {
  const firebaseConfig = getFirebaseConfig();

  return [
    ['EXPO_PUBLIC_FIREBASE_API_KEY', firebaseConfig.apiKey],
    ['EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', firebaseConfig.authDomain],
    ['EXPO_PUBLIC_FIREBASE_PROJECT_ID', firebaseConfig.projectId],
    ['EXPO_PUBLIC_FIREBASE_APP_ID', firebaseConfig.appId]
  ] as const;
}

function getMissingFirebaseKeys() {
  return getRequiredFirebaseKeys().filter(([, value]) => !value).map(([key]) => key);
}

export function isFirebaseEmailVerificationConfigured() {
  return getMissingFirebaseKeys().length === 0;
}

export function getConfiguredFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseEmailVerificationConfigured()) {
    return null;
  }

  const firebaseConfig = getFirebaseConfig();

  return getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
}

function getFirebaseAuth() {
  const app = getConfiguredFirebaseApp();

  if (!app) {
    return null;
  }

  return getAuth(app);
}

export function getCurrentFirebaseUserId() {
  return getFirebaseAuth()?.currentUser?.uid ?? null;
}

export function subscribeFirebaseAuthUser(onChange: (uid: string | null) => void) {
  const auth = getFirebaseAuth();

  if (!auth) {
    onChange(null);
    return () => undefined;
  }

  return onAuthStateChanged(
    auth,
    (user) => onChange(user?.uid ?? null),
    () => onChange(null)
  );
}

export async function getCurrentFirebaseIdToken() {
  const user = getFirebaseAuth()?.currentUser;

  if (!user) {
    return null;
  }

  return user.getIdToken();
}

export async function signOutCurrentUser() {
  const auth = getFirebaseAuth();

  if (!auth) {
    return;
  }

  pendingVerificationUser = null;
  await signOut(auth);
}

function getFirebaseErrorMessage(error: unknown) {
  if (error instanceof Error && error.message === FIREBASE_TIMEOUT_ERROR) {
    return 'Firebase is taking too long to respond. Check your connection, then try again.';
  }

  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';

  if (code === 'auth/email-already-in-use') {
    return 'This email is already registered. Use Log in at the bottom of the page.';
  }

  if (code === 'auth/invalid-email') {
    return 'Please enter a valid email address.';
  }

  if (code === 'auth/weak-password') {
    return 'Password must be at least 6 characters.';
  }

  if (code === 'auth/missing-password') {
    return 'Please enter your password.';
  }

  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/user-not-found' ||
    code === 'auth/wrong-password'
  ) {
    return 'Email or password is incorrect.';
  }

  if (code === 'auth/network-request-failed') {
    return 'Network connection failed. Please try again when you are online.';
  }

  if (code === 'auth/too-many-requests') {
    return 'Firebase is temporarily blocking more emails to this address. Wait a few minutes, then try again.';
  }

  if (code === 'auth/operation-not-allowed') {
    return 'Email registration is not enabled in Firebase yet. Turn on Authentication > Sign-in method > Email/Password.';
  }

  if (code === 'auth/invalid-api-key' || code.includes('api-key')) {
    return 'Firebase rejected the API key. Check that .env uses the Web app config values with no quotes or commas.';
  }

  if (code === 'auth/app-deleted' || code === 'auth/invalid-app-credential') {
    return 'Firebase rejected this app config. Re-copy the Web app firebaseConfig values into .env.';
  }

  return code
    ? `Firebase returned ${code}.`
    : 'Verification could not start. Please check Firebase setup and try again.';
}

export async function startEmailVerification(
  email: string,
  displayName: string | undefined,
  password: string
): Promise<VerificationResult> {
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

  if (password.length < 6) {
    return {
      ok: false,
      message: 'Password must be at least 6 characters.'
    };
  }

  try {
    const credential = await withFirebaseTimeout(createUserWithEmailAndPassword(auth, email, password));

    if (displayName?.trim()) {
      await withFirebaseTimeout(updateProfile(credential.user, { displayName: displayName.trim() }), 7000);
    }

    await withFirebaseTimeout(sendEmailVerification(credential.user), 10000);
    pendingVerificationUser = credential.user;

    return {
      ok: true,
      message:
        'Verification email sent. Check Gmail inbox, spam, and Promotions, then tap Confirm Verification after opening the link.'
    };
  } catch (error) {
    return {
      ok: false,
      message: getFirebaseErrorMessage(error)
    };
  }
}

export async function signInWithEmail(email: string, password: string): Promise<VerificationResult> {
  const auth = getFirebaseAuth();

  if (!auth) {
    return {
      ok: false,
      message: 'KaTalk cannot reach Firebase yet. Check your Firebase values, then fully restart Expo.'
    };
  }

  try {
    const credential = await withFirebaseTimeout(signInWithEmailAndPassword(auth, email, password), 10000);
    await withFirebaseTimeout(reload(credential.user), 6000);

    if (!credential.user.emailVerified) {
      pendingVerificationUser = credential.user;
      await withFirebaseTimeout(sendEmailVerification(credential.user), 10000);

      return {
        ok: false,
        message: 'Email is not verified yet. I sent another verification email to your Gmail.'
      };
    }

    return {
      ok: true,
      message: 'Signed in.',
      displayName: credential.user.displayName ?? undefined,
      contact: credential.user.email ?? email
    };
  } catch (error) {
    return {
      ok: false,
      message: getFirebaseErrorMessage(error)
    };
  }
}

export async function sendEmailPasswordReset(email: string): Promise<VerificationResult> {
  const auth = getFirebaseAuth();

  if (!auth) {
    return {
      ok: false,
      message: 'KaTalk cannot reach Firebase yet. Check your Firebase values, then fully restart Expo.'
    };
  }

  try {
    await withFirebaseTimeout(sendPasswordResetEmail(auth, email), 10000);

    return {
      ok: true,
      message: 'Password reset email sent. Check Gmail inbox, spam, and Promotions.'
    };
  } catch (error) {
    return {
      ok: false,
      message: getFirebaseErrorMessage(error)
    };
  }
}

export async function resendEmailVerification(): Promise<VerificationResult> {
  const auth = getFirebaseAuth();
  const user = pendingVerificationUser ?? auth?.currentUser ?? null;

  if (!auth) {
    return {
      ok: false,
      message: 'KaTalk cannot reach Firebase yet. Check your Firebase values, then fully restart Expo.'
    };
  }

  if (!user) {
    return {
      ok: false,
      message: 'This app session has no pending verification. Enter the email again, then send verification.'
    };
  }

  try {
    await withFirebaseTimeout(reload(user), 6000);

    if (user.emailVerified) {
      return {
        ok: true,
        message: 'Email is already verified. Tap Confirm Verification to continue.'
      };
    }

    await withFirebaseTimeout(sendEmailVerification(user), 10000);
    pendingVerificationUser = user;

    return {
      ok: true,
      message: 'Verification email resent. Check Gmail inbox, spam, and Promotions.'
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
    await withFirebaseTimeout(reload(pendingVerificationUser), 6000);

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
