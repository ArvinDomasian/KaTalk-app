import {
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
const PROFILE_POST_COLLECTION = 'profilePosts';
const localPosts: ProfilePost[] = [];

type CreateProfilePostOptions = {
  photoUrl?: string;
  emoji?: string;
  voiceUrl?: string;
  musicUrl?: string;
  musicTitle?: string;
  visibility?: ProfilePost['visibility'];
};

function getPostDb() {
  const app = getConfiguredFirebaseApp();
  return app ? getFirestore(app) : null;
}

function getPostStorage() {
  const app = getConfiguredFirebaseApp();
  return app ? getStorage(app) : null;
}

function profilePostsCollection() {
  const db = getPostDb();
  return db ? collection(db, PROFILE_POST_COLLECTION) : null;
}

function visibleLocalPostsFor(profileId: string) {
  return localPosts.filter((post) => post.visibility === 'public' || post.profileId === profileId);
}

function postFromSnapshot(id: string, data: Record<string, unknown>): ProfilePost {
  const visibility = data.visibility === 'private' ? 'private' : 'public';

  return {
    id,
    profileId: String(data.profileId ?? ''),
    authorNickname: String(data.authorNickname ?? 'KaTalk member'),
    body: String(data.body ?? ''),
    photoUrl: data.photoUrl ? String(data.photoUrl) : undefined,
    emoji: data.emoji ? String(data.emoji) : undefined,
    voiceUrl: data.voiceUrl ? String(data.voiceUrl) : undefined,
    musicUrl: data.musicUrl ? String(data.musicUrl) : undefined,
    musicTitle: data.musicTitle ? String(data.musicTitle) : undefined,
    visibility,
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
  const postsCollection = profilePostsCollection();

  if (!postsCollection) {
    onPosts(
      visibleLocalPostsFor(profileId)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    );
    return (() => undefined) as Unsubscribe;
  }

  return onSnapshot(
    query(postsCollection, orderBy('createdAtMs', 'desc')),
    (snapshot) => {
      const remotePosts = snapshot.docs
        .map((item) => postFromSnapshot(item.id, item.data()))
        .filter((post) => post.visibility === 'public' || post.profileId === profileId);
      const remotePostIds = new Set(remotePosts.map((post) => post.id));
      const localOnlyPosts = visibleLocalPostsFor(profileId).filter((post) => !remotePostIds.has(post.id));

      onPosts(
        [...localOnlyPosts, ...remotePosts].sort(
          (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
        )
      );
    },
    (error) => onError(postErrorMessage(error))
  );
}

export async function createProfilePost(
  profile: UserProfile,
  body: string,
  options: CreateProfilePostOptions = {}
) {
  const cleanBody = body.trim();
  const photoUrl = options.photoUrl?.trim();
  const emoji = options.emoji?.trim();
  const voiceUrl = options.voiceUrl?.trim();
  const musicUrl = options.musicUrl?.trim();
  const musicTitle = options.musicTitle?.trim();
  const visibility = options.visibility ?? 'public';

  if (!cleanBody && !photoUrl && !emoji && !voiceUrl && !musicUrl) {
    throw new Error('Write something, add a photo, or attach something first.');
  }

  const createdAtMs = Date.now();
  const createdAt = new Date(createdAtMs);
  const postId = `profile-post-${profile.id}-${createdAtMs}`;
  const localPost: ProfilePost = {
    id: postId,
    profileId: profile.id,
    authorNickname: profile.nickname,
    body: cleanBody,
    photoUrl: photoUrl || undefined,
    emoji: emoji || undefined,
    voiceUrl: voiceUrl || undefined,
    musicUrl: musicUrl || undefined,
    musicTitle: musicTitle || undefined,
    visibility,
    createdAt
  };
  const post = {
    profileId: profile.id,
    authorNickname: profile.nickname,
    body: cleanBody,
    photoUrl: photoUrl || null,
    emoji: emoji || null,
    voiceUrl: voiceUrl || null,
    musicUrl: musicUrl || null,
    musicTitle: musicTitle || null,
    visibility,
    createdAtMs,
    createdAt: serverTimestamp()
  };
  const postsCollection = profilePostsCollection();

  localPosts.unshift(localPost);

  if (!postsCollection) {
    return localPost;
  }

  const db = getPostDb();

  if (db) {
    void Promise.all([
      setDoc(
        doc(db, USER_PROFILE_COLLECTION, profile.id),
        {
          nickname: profile.nickname,
          interests: profile.interests,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      ),
      setDoc(doc(db, PROFILE_POST_COLLECTION, postId), post)
    ]).catch(() => undefined);
  }

  return localPost;
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

export async function uploadProfileVoiceClip(profileId: string, file: Blob) {
  const storage = getPostStorage();

  if (!storage) {
    throw new Error('Firebase Storage is not configured yet.');
  }

  const path = `profile-voice-posts/${profileId}/${Date.now()}`;
  const voiceRef = ref(storage, path);

  await uploadBytes(voiceRef, file);
  return getDownloadURL(voiceRef);
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
