import {
  addDoc,
  collection,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  doc,
  type Unsubscribe
} from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import type { ProfilePost, UserProfile } from '../types';
import { getConfiguredFirebaseApp } from './firebaseAuthService';

const USER_PROFILE_COLLECTION = 'userProfiles';
const localPosts: ProfilePost[] = [];

function getPostDb() {
  const app = getConfiguredFirebaseApp();
  return app ? getFirestore(app) : null;
}

function getPostStorage() {
  const app = getConfiguredFirebaseApp();
  return app ? getStorage(app) : null;
}

function profilePostsCollection(profileId: string) {
  const db = getPostDb();
  return db ? collection(db, USER_PROFILE_COLLECTION, profileId, 'posts') : null;
}

function postFromSnapshot(id: string, data: Record<string, unknown>): ProfilePost {
  return {
    id,
    profileId: String(data.profileId ?? ''),
    authorNickname: String(data.authorNickname ?? 'KaTalk member'),
    body: String(data.body ?? ''),
    photoUrl: data.photoUrl ? String(data.photoUrl) : undefined,
    createdAt: new Date(typeof data.createdAtMs === 'number' ? data.createdAtMs : Date.now())
  };
}

function postErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';

  if (code.includes('permission-denied')) {
    return 'Firebase blocked profile posts. Check Firestore/Storage rules for authenticated users.';
  }

  if (code.includes('storage')) {
    return 'Firebase Storage could not upload this photo. Make sure Storage is enabled.';
  }

  return code ? `Profile post failed because Firebase returned ${code}.` : 'Profile post failed.';
}

export function subscribeProfilePosts(
  profileId: string,
  onPosts: (posts: ProfilePost[]) => void,
  onError: (message: string) => void
) {
  const postsCollection = profilePostsCollection(profileId);

  if (!postsCollection) {
    onPosts(
      localPosts
        .filter((post) => post.profileId === profileId)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    );
    return (() => undefined) as Unsubscribe;
  }

  return onSnapshot(
    query(postsCollection, orderBy('createdAtMs', 'desc')),
    (snapshot) => {
      onPosts(snapshot.docs.map((item) => postFromSnapshot(item.id, item.data())));
    },
    (error) => onError(postErrorMessage(error))
  );
}

export async function createProfilePost(profile: UserProfile, body: string, photoUrl?: string) {
  const cleanBody = body.trim();

  if (!cleanBody && !photoUrl) {
    throw new Error('Write something or add a photo first.');
  }

  const createdAtMs = Date.now();
  const post = {
    profileId: profile.id,
    authorNickname: profile.nickname,
    body: cleanBody,
    photoUrl: photoUrl?.trim() || null,
    createdAtMs,
    createdAt: serverTimestamp()
  };
  const postsCollection = profilePostsCollection(profile.id);

  if (!postsCollection) {
    localPosts.unshift({
      id: `local-post-${createdAtMs}`,
      profileId: profile.id,
      authorNickname: profile.nickname,
      body: cleanBody,
      photoUrl,
      createdAt: new Date(createdAtMs)
    });
    return;
  }

  const db = getPostDb();

  if (db) {
    await setDoc(
      doc(db, USER_PROFILE_COLLECTION, profile.id),
      {
        nickname: profile.nickname,
        interests: profile.interests,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  }

  await addDoc(postsCollection, post);
}

export async function uploadProfilePostPhoto(profileId: string, file: Blob) {
  const storage = getPostStorage();

  if (!storage) {
    throw new Error('Firebase Storage is not configured yet.');
  }

  const path = `profile-posts/${profileId}/${Date.now()}`;
  const imageRef = ref(storage, path);

  await uploadBytes(imageRef, file);
  return getDownloadURL(imageRef);
}

export async function uploadProfileAvatar(profileId: string, file: Blob) {
  const storage = getPostStorage();

  if (!storage) {
    throw new Error('Firebase Storage is not configured yet.');
  }

  const path = `profile-avatars/${profileId}/${Date.now()}`;
  const imageRef = ref(storage, path);

  await uploadBytes(imageRef, file);
  return getDownloadURL(imageRef);
}

export function profilePostErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return postErrorMessage(error);
}
