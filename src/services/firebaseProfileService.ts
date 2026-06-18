import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';
import type { UserProfile } from '../types';
import { getConfiguredFirebaseApp, getCurrentFirebaseUserId } from './firebaseAuthService';

const USER_PROFILE_COLLECTION = 'userProfiles';
const PROFILE_LOAD_TIMEOUT_ERROR = 'KATALK_PROFILE_LOAD_TIMEOUT';

function withProfileTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(PROFILE_LOAD_TIMEOUT_ERROR)), timeoutMs);
    })
  ]);
}

function getProfileDb() {
  const app = getConfiguredFirebaseApp();
  return app ? getFirestore(app) : null;
}

function isUserProfile(value: unknown): value is UserProfile {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const profile = value as Partial<UserProfile>;

  return Boolean(
    profile.id &&
      profile.nickname &&
      profile.dateOfBirth &&
      profile.gender &&
      profile.preference &&
      profile.ageRange &&
      Array.isArray(profile.interests) &&
      profile.acceptedTerms &&
      profile.acceptedPrivacy &&
      profile.acceptedRules
  );
}

export async function saveFirebaseUserProfile(profile: UserProfile) {
  const db = getProfileDb();
  const uid = getCurrentFirebaseUserId();

  if (!db || !uid) {
    return;
  }

  await setDoc(
    doc(db, USER_PROFILE_COLLECTION, uid),
    {
      ...profile,
      id: uid,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function loadCurrentFirebaseUserProfile(timeoutMs = 6000) {
  const db = getProfileDb();
  const uid = getCurrentFirebaseUserId();

  if (!db || !uid) {
    return null;
  }

  const snapshot = await withProfileTimeout(getDoc(doc(db, USER_PROFILE_COLLECTION, uid)), timeoutMs);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  const profile = {
    ...data,
    id: uid
  };

  return isUserProfile(profile) ? profile : null;
}
