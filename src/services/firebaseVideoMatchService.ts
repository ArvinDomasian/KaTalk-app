import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
  type Unsubscribe
} from 'firebase/firestore';
import { candidates } from '../data/mockData';
import type { Candidate, UserProfile } from '../types';
import {
  getConfiguredFirebaseApp,
  getCurrentFirebaseIdToken,
  getCurrentFirebaseUserId
} from './firebaseAuthService';

declare const process: {
  env: Record<string, string | undefined>;
};

const VIDEO_QUEUE_COLLECTION = 'liveVideoMatchQueue';
const VIDEO_MATCH_COLLECTION = 'liveVideoMatches';
const LIVE_PROFILE_COLLECTION = 'liveProfiles';
const LIVE_BLOCK_COLLECTION = 'liveBlocks';
const QUEUE_STALE_MS = 3 * 60 * 1000;

type PublicProfile = {
  uid: string;
  nickname: string;
  dateOfBirth: string;
  gender: string;
  preference: string;
  ageRange: string;
  interests: string[];
  comfort: UserProfile['comfort'];
  prompt: string;
  photoUrl: string;
};

export type LiveVideoSession = {
  id: string;
  candidate: Candidate;
  agoraChannelName: string;
};

type VideoMatchCallbacks = {
  onSearching: (message: string) => void;
  onMatched: (session: LiveVideoSession) => void;
  onError: (message: string) => void;
};

export type LiveVideoMatchState = {
  status: 'active' | 'ended' | 'blocked';
  endedBy?: string;
};

export type AgoraJoinCredentials = {
  appId: string;
  token: string;
  uid: number;
};

function cleanEnvValue(value?: string) {
  return value?.trim().replace(/,$/, '').replace(/^["']|["']$/g, '') ?? '';
}

function getVideoDb() {
  const app = getConfiguredFirebaseApp();
  return app ? getFirestore(app) : null;
}

function pickRandom<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function parseAgeRange(ageRange: string) {
  const [min, max] = ageRange.split('-').map((value) => Number(value.trim()));

  return {
    min: Number.isFinite(min) ? min : 18,
    max: Number.isFinite(max) ? max : 99
  };
}

function ageFromDateOfBirth(dateOfBirth: string) {
  const birthDate = new Date(dateOfBirth);

  if (Number.isNaN(birthDate.getTime())) {
    return 25;
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const birthdayPassed =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());

  if (!birthdayPassed) {
    age -= 1;
  }

  return Math.max(18, age);
}

function publicProfileFor(profile: UserProfile, uid: string): PublicProfile {
  const fallbackCandidate = candidates[uid.length % candidates.length];
  const interests = profile.interests.length > 0 ? profile.interests : ['Quiet conversations'];

  return {
    uid,
    nickname: profile.nickname,
    dateOfBirth: profile.dateOfBirth,
    gender: profile.gender,
    preference: profile.preference,
    ageRange: profile.ageRange,
    interests,
    comfort: profile.comfort,
    prompt: `Likes ${interests.slice(0, 2).join(' and ')}.`,
    photoUrl: profile.avatarUrl ?? fallbackCandidate.photoUrl
  };
}

function candidateFromPublicProfile(profile: PublicProfile): Candidate {
  const fallbackCandidate = candidates[profile.uid.length % candidates.length];

  return {
    id: profile.uid,
    nickname: profile.nickname || 'KaTalk member',
    age: ageFromDateOfBirth(profile.dateOfBirth),
    distanceMiles: 0,
    interests: profile.interests,
    prompt: profile.prompt,
    avatarColor: fallbackCandidate.avatarColor,
    photoUrl: profile.photoUrl || fallbackCandidate.photoUrl
  };
}

function preferenceAllowsGender(preference: string, gender: string) {
  const normalizedPreference = preference.toLowerCase();
  const normalizedGender = gender.toLowerCase();

  if (
    normalizedPreference.includes('everyone') ||
    normalizedPreference.includes('exploring') ||
    normalizedGender.includes('prefer not')
  ) {
    return true;
  }

  if (normalizedPreference.includes('women')) {
    return normalizedGender.includes('woman');
  }

  if (normalizedPreference.includes('men')) {
    return normalizedGender.includes('man');
  }

  if (normalizedPreference.includes('non-binary')) {
    return normalizedGender.includes('non-binary');
  }

  return true;
}

function profilesAreCompatible(current: PublicProfile, other: PublicProfile) {
  const currentAgeRange = parseAgeRange(current.ageRange);
  const otherAgeRange = parseAgeRange(other.ageRange);
  const currentAge = ageFromDateOfBirth(current.dateOfBirth);
  const otherAge = ageFromDateOfBirth(other.dateOfBirth);

  return (
    otherAge >= currentAgeRange.min &&
    otherAge <= currentAgeRange.max &&
    currentAge >= otherAgeRange.min &&
    currentAge <= otherAgeRange.max &&
    preferenceAllowsGender(current.preference, other.gender) &&
    preferenceAllowsGender(other.preference, current.gender)
  );
}

function videoMatchErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';

  if (code.includes('permission-denied')) {
    return 'Firebase blocked video matching. Update Firestore rules for authenticated video queue and call records.';
  }

  if (code.includes('unavailable')) {
    return 'Video matching cannot reach Firebase right now. Check your connection and try again.';
  }

  if (code.includes('failed-precondition')) {
    return 'Firestore needs an index for video matching. Open the Firebase Console link in the error log.';
  }

  return code ? `Video matching failed because Firebase returned ${code}.` : 'Video matching could not start.';
}

async function upsertLiveProfile(db: Firestore, publicProfile: PublicProfile) {
  await setDoc(
    doc(db, LIVE_PROFILE_COLLECTION, publicProfile.uid),
    {
      ...publicProfile,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

async function blockedUserIdsFor(db: Firestore, currentUid: string) {
  const blockedIds = new Set<string>();
  const [blockedByMe, blockingMe] = await Promise.all([
    getDocs(query(collection(db, LIVE_BLOCK_COLLECTION), where('blockerId', '==', currentUid), limit(100))),
    getDocs(query(collection(db, LIVE_BLOCK_COLLECTION), where('blockedId', '==', currentUid), limit(100)))
  ]);

  blockedByMe.docs.forEach((item) => {
    const blockedId = String(item.data().blockedId ?? '');

    if (blockedId) {
      blockedIds.add(blockedId);
    }
  });
  blockingMe.docs.forEach((item) => {
    const blockerId = String(item.data().blockerId ?? '');

    if (blockerId) {
      blockedIds.add(blockerId);
    }
  });

  return blockedIds;
}

async function sessionFromMatch(db: Firestore, matchId: string, currentUid: string) {
  const snapshot = await getDoc(doc(db, VIDEO_MATCH_COLLECTION, matchId));

  if (!snapshot.exists()) {
    throw new Error('Video match was not found.');
  }

  const data = snapshot.data();
  const participantIds = Array.isArray(data.participantIds) ? data.participantIds : [];
  const otherUid = participantIds.find((id) => id !== currentUid);
  const participantProfile = otherUid ? data.participants?.[otherUid] : null;

  if (!otherUid || !participantProfile) {
    throw new Error('Video match participant was not found.');
  }

  return {
    id: matchId,
    candidate: candidateFromPublicProfile(participantProfile as PublicProfile),
    agoraChannelName: String(data.agoraChannelName ?? `katalk-video-${matchId}`)
  };
}

async function tryClaimWaitingUser(
  db: Firestore,
  currentUid: string,
  publicProfile: PublicProfile,
  blockedIds: Set<string>
) {
  const waitingSnapshot = await getDocs(
    query(collection(db, VIDEO_QUEUE_COLLECTION), where('status', '==', 'waiting'), limit(20))
  );
  const cutoffMs = Date.now() - QUEUE_STALE_MS;
  const eligibleQueueDocs = waitingSnapshot.docs.filter((item) => {
    const data = item.data();
    const otherProfile = data.publicProfile as PublicProfile | undefined;

    return (
      item.id !== currentUid &&
      data.userId !== currentUid &&
      Number(data.createdAtMs ?? 0) >= cutoffMs &&
      Boolean(otherProfile?.uid) &&
      !blockedIds.has(String(otherProfile?.uid)) &&
      profilesAreCompatible(publicProfile, otherProfile as PublicProfile)
    );
  });
  const otherQueueDoc = eligibleQueueDocs.length > 0 ? pickRandom(eligibleQueueDocs) : null;

  if (!otherQueueDoc) {
    return null;
  }

  const matchRef = doc(collection(db, VIDEO_MATCH_COLLECTION));
  const myQueueRef = doc(db, VIDEO_QUEUE_COLLECTION, currentUid);
  const agoraChannelName = `katalk-video-${matchRef.id}`;

  await runTransaction(db, async (transaction) => {
    const otherQueueSnapshot = await transaction.get(otherQueueDoc.ref);

    if (!otherQueueSnapshot.exists()) {
      throw new Error('Waiting member left the video queue.');
    }

    const otherQueue = otherQueueSnapshot.data();
    const otherProfile = otherQueue.publicProfile as PublicProfile;

    if (
      otherQueue.status !== 'waiting' ||
      otherQueue.userId === currentUid ||
      Number(otherQueue.createdAtMs ?? 0) < Date.now() - QUEUE_STALE_MS ||
      blockedIds.has(otherProfile.uid) ||
      !profilesAreCompatible(publicProfile, otherProfile)
    ) {
      throw new Error('Waiting member is no longer available.');
    }

    transaction.set(matchRef, {
      participantIds: [currentUid, otherProfile.uid],
      participants: {
        [currentUid]: publicProfile,
        [otherProfile.uid]: otherProfile
      },
      agoraChannelName,
      status: 'active',
      reportedBy: [],
      blockedBy: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    transaction.set(
      myQueueRef,
      {
        userId: currentUid,
        publicProfile,
        status: 'matched',
        matchId: matchRef.id,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
    transaction.update(otherQueueDoc.ref, {
      status: 'matched',
      matchId: matchRef.id,
      matchedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });

  return sessionFromMatch(db, matchRef.id, currentUid);
}

export function startLiveVideoMatching(profile: UserProfile, callbacks: VideoMatchCallbacks) {
  const db = getVideoDb();
  const currentUid = getCurrentFirebaseUserId() ?? profile.id;
  let queueUnsubscribe: Unsubscribe | null = null;
  let isCancelled = false;
  let isWaiting = false;

  if (!db || currentUid.startsWith('local-')) {
    callbacks.onError('Real video matching needs a verified Firebase account.');
    return () => undefined;
  }

  const publicProfile = publicProfileFor(profile, currentUid);
  const queueRef = doc(db, VIDEO_QUEUE_COLLECTION, currentUid);

  async function waitForMatch() {
    await upsertLiveProfile(db as Firestore, publicProfile);

    try {
      const blockedIds = await blockedUserIdsFor(db as Firestore, currentUid);
      const claimedSession = await tryClaimWaitingUser(
        db as Firestore,
        currentUid,
        publicProfile,
        blockedIds
      );

      if (claimedSession && !isCancelled) {
        callbacks.onMatched(claimedSession);
        return;
      }
    } catch {
      // Another member may claim the same waiting user first. Enter the queue normally.
    }

    if (isCancelled) {
      return;
    }

    isWaiting = true;
    await setDoc(
      queueRef,
      {
        userId: currentUid,
        publicProfile,
        status: 'waiting',
        matchId: null,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
        expiresAtMs: Date.now() + QUEUE_STALE_MS,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
    callbacks.onSearching('Waiting for another real KaTalk member to start video matching.');

    queueUnsubscribe = onSnapshot(
      queueRef,
      async (snapshot) => {
        const queue = snapshot.data();

        if (!queue || queue.status !== 'matched' || !queue.matchId || isCancelled) {
          return;
        }

        queueUnsubscribe?.();
        isWaiting = false;

        try {
          callbacks.onMatched(
            await sessionFromMatch(db as Firestore, String(queue.matchId), currentUid)
          );
        } catch (error) {
          callbacks.onError(videoMatchErrorMessage(error));
        }
      },
      (error) => callbacks.onError(videoMatchErrorMessage(error))
    );
  }

  void waitForMatch().catch((error) => callbacks.onError(videoMatchErrorMessage(error)));

  return () => {
    isCancelled = true;
    queueUnsubscribe?.();

    if (isWaiting) {
      void updateDoc(queueRef, {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }).catch(() => undefined);
    }
  };
}

export function subscribeLiveVideoMatchState(
  matchId: string,
  onState: (state: LiveVideoMatchState) => void,
  onError: (message: string) => void
) {
  const db = getVideoDb();

  if (!db) {
    onError('Video call state needs Firebase.');
    return () => undefined;
  }

  return onSnapshot(
    doc(db, VIDEO_MATCH_COLLECTION, matchId),
    (snapshot) => {
      const data = snapshot.data();

      if (!data) {
        return;
      }

      onState({
        status: String(data.status ?? 'active') as LiveVideoMatchState['status'],
        endedBy: typeof data.endedBy === 'string' ? data.endedBy : undefined
      });
    },
    (error) => onError(videoMatchErrorMessage(error))
  );
}

export async function leaveLiveVideoMatch(matchId: string) {
  const db = getVideoDb();
  const currentUid = getCurrentFirebaseUserId();

  if (!db || !currentUid) {
    return;
  }

  await updateDoc(doc(db, VIDEO_MATCH_COLLECTION, matchId), {
    status: 'ended',
    endedBy: currentUid,
    endedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }).catch(() => undefined);
}

export async function recordLiveVideoSafety(matchId: string, action: 'report' | 'block') {
  const db = getVideoDb();
  const currentUid = getCurrentFirebaseUserId();

  if (!db || !currentUid) {
    throw new Error('Video safety needs Firebase sign-in.');
  }

  await runTransaction(db, async (transaction) => {
    const matchRef = doc(db, VIDEO_MATCH_COLLECTION, matchId);
    const snapshot = await transaction.get(matchRef);

    if (!snapshot.exists()) {
      return;
    }

    const participantIds = Array.isArray(snapshot.data()?.participantIds)
      ? (snapshot.data()?.participantIds as string[])
      : [];
    const otherUid = participantIds.find((id) => id !== currentUid);

    transaction.update(matchRef, {
      [action === 'report' ? 'reportedBy' : 'blockedBy']: arrayUnion(currentUid),
      status: action === 'block' ? 'blocked' : 'ended',
      endedBy: currentUid,
      endedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    if (action === 'block' && otherUid) {
      transaction.set(doc(db, LIVE_BLOCK_COLLECTION, `${currentUid}_${otherUid}`), {
        blockerId: currentUid,
        blockedId: otherUid,
        videoMatchId: matchId,
        createdAt: serverTimestamp()
      });
    }
  });
}

export function agoraUidFor(userId: string) {
  let hash = 2166136261;

  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) || 1;
}

export function getAgoraSetupError() {
  return cleanEnvValue(process.env.EXPO_PUBLIC_AGORA_APP_ID)
    ? null
    : 'Agora is not configured yet. Add EXPO_PUBLIC_AGORA_APP_ID to .env, then rebuild the installed app.';
}

export async function getAgoraJoinCredentials(channelName: string) {
  const appId = cleanEnvValue(process.env.EXPO_PUBLIC_AGORA_APP_ID);
  const tokenEndpoint = cleanEnvValue(process.env.EXPO_PUBLIC_AGORA_TOKEN_ENDPOINT);
  const currentUid = getCurrentFirebaseUserId();

  if (!appId) {
    throw new Error('Agora is not configured. Add EXPO_PUBLIC_AGORA_APP_ID to .env and rebuild the app.');
  }

  if (!currentUid) {
    throw new Error('Agora video calls need a signed-in Firebase account.');
  }

  const uid = agoraUidFor(currentUid);

  if (!tokenEndpoint) {
    return { appId, token: '', uid };
  }

  const firebaseToken = await getCurrentFirebaseIdToken();
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(firebaseToken ? { Authorization: `Bearer ${firebaseToken}` } : {})
    },
    body: JSON.stringify({
      channelName,
      uid,
      role: 'publisher'
    })
  });

  if (!response.ok) {
    throw new Error(`Agora token server returned ${response.status}.`);
  }

  const payload = (await response.json()) as { token?: unknown };
  const token = typeof payload.token === 'string' ? payload.token : '';

  if (!token) {
    throw new Error('Agora token server did not return a token.');
  }

  return { appId, token, uid };
}
