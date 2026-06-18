import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
  type Unsubscribe
} from 'firebase/firestore';
import { candidates, openingMessages } from '../data/mockData';
import type { Candidate, Message, UserProfile } from '../types';
import type { MessageMatchSession } from './contracts';
import { getConfiguredFirebaseApp, getCurrentFirebaseUserId } from './firebaseAuthService';

const LIVE_QUEUE_COLLECTION = 'liveMessageMatchQueue';
const LIVE_MATCH_COLLECTION = 'liveMessageMatches';
const LIVE_PROFILE_COLLECTION = 'liveProfiles';
const LIVE_BLOCK_COLLECTION = 'liveBlocks';
const MATCH_SECONDS = 120;
const QUEUE_STALE_MS = 2 * 60 * 1000;

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

type LiveMatchCallbacks = {
  onWaiting: (message: string) => void;
  onMatched: (session: MessageMatchSession) => void;
  onError: (message: string) => void;
};

export type LiveMatchState = {
  savedByMe: boolean;
  savedByMatch: boolean;
  status: 'active' | 'expired' | 'saved' | 'blocked';
  endsAtMs: number;
};

function getLiveDb() {
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
  const hasBirthdayPassed =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());

  if (!hasBirthdayPassed) {
    age -= 1;
  }

  return Math.max(18, age);
}

function publicProfileFor(profile: UserProfile, uid: string): PublicProfile {
  const fallbackCandidate = candidates[uid.length % candidates.length];
  const interests = profile.interests.length > 0 ? profile.interests : ['Quiet chats'];

  return {
    uid,
    nickname: profile.nickname,
    dateOfBirth: profile.dateOfBirth,
    gender: profile.gender,
    preference: profile.preference,
    ageRange: profile.ageRange,
    interests,
    comfort: profile.comfort,
    prompt: `A real KaTalk member who likes ${interests.slice(0, 2).join(' and ')}.`,
    photoUrl: profile.avatarUrl ?? fallbackCandidate.photoUrl
  };
}

function candidateFromPublicProfile(profile: PublicProfile): Candidate {
  return {
    id: profile.uid,
    nickname: profile.nickname || 'KaTalk member',
    age: ageFromDateOfBirth(profile.dateOfBirth),
    distanceMiles: 0,
    interests: profile.interests,
    prompt: profile.prompt,
    avatarColor: candidates[profile.uid.length % candidates.length].avatarColor,
    photoUrl: profile.photoUrl
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

function liveMatchErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';

  if (code.includes('permission-denied')) {
    return 'Firestore blocked live matching. Enable Firestore and allow authenticated users to read/write live match data.';
  }

  if (code.includes('unavailable')) {
    return 'Live matching cannot reach Firestore right now. Check your network and try again.';
  }

  if (code.includes('failed-precondition')) {
    return 'Firestore needs an index or setup change for live matching. Check the Firebase Console error link.';
  }

  return code ? `Live matching failed because Firebase returned ${code}.` : 'Live matching could not start yet.';
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
    getDocs(
      query(collection(db, LIVE_BLOCK_COLLECTION), where('blockerId', '==', currentUid), limit(100))
    ),
    getDocs(
      query(collection(db, LIVE_BLOCK_COLLECTION), where('blockedId', '==', currentUid), limit(100))
    )
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
  const snapshot = await getDoc(doc(db, LIVE_MATCH_COLLECTION, matchId));

  if (!snapshot.exists()) {
    throw new Error('Match was not found.');
  }

  const data = snapshot.data();
  const participantIds = Array.isArray(data.participantIds) ? data.participantIds : [];
  const otherUid = participantIds.find((id) => id !== currentUid);
  const participantProfile = otherUid ? data.participants?.[otherUid] : null;

  if (!otherUid || !participantProfile) {
    throw new Error('Match participant was not found.');
  }

  const startsAtMs = typeof data.startsAtMs === 'number' ? data.startsAtMs : Date.now();
  const endsAtMs =
    typeof data.endsAtMs === 'number' ? data.endsAtMs : startsAtMs + MATCH_SECONDS * 1000;

  return {
    id: matchId,
    candidate: candidateFromPublicProfile(participantProfile as PublicProfile),
    openingPrompt: String(data.openingPrompt ?? pickRandom(openingMessages)),
    durationSeconds: MATCH_SECONDS,
    startsAt: new Date(startsAtMs),
    endsAt: new Date(endsAtMs)
  };
}

async function tryClaimWaitingUser(
  db: Firestore,
  currentUid: string,
  publicProfile: PublicProfile,
  blockedIds: Set<string>
) {
  const waitingSnapshot = await getDocs(
    query(collection(db, LIVE_QUEUE_COLLECTION), where('status', '==', 'waiting'), limit(20))
  );
  const queueCutoffMs = Date.now() - QUEUE_STALE_MS;
  const eligibleQueueDocs = waitingSnapshot.docs.filter((item) => {
    const data = item.data();
    const createdAtMs = Number(data.createdAtMs ?? 0);
    const otherProfile = data.publicProfile as PublicProfile | undefined;

    return (
      item.id !== currentUid &&
      data.userId !== currentUid &&
      Boolean(otherProfile?.uid) &&
      createdAtMs >= queueCutoffMs &&
      !blockedIds.has(String(otherProfile?.uid)) &&
      profilesAreCompatible(publicProfile, otherProfile as PublicProfile)
    );
  });
  const otherQueueDoc = eligibleQueueDocs.length > 0 ? pickRandom(eligibleQueueDocs) : null;

  if (!otherQueueDoc) {
    return null;
  }

  const matchRef = doc(collection(db, LIVE_MATCH_COLLECTION));
  const myQueueRef = doc(db, LIVE_QUEUE_COLLECTION, currentUid);
  const openerRef = doc(collection(matchRef, 'messages'));
  const startsAtMs = Date.now();
  const openingPrompt = pickRandom(openingMessages);

  await runTransaction(db, async (transaction) => {
    const otherQueueSnapshot = await transaction.get(otherQueueDoc.ref);

    if (!otherQueueSnapshot.exists()) {
      throw new Error('Waiting user left the queue.');
    }

    const otherQueue = otherQueueSnapshot.data();
    const createdAtMs = Number(otherQueue.createdAtMs ?? 0);

    if (
      otherQueue.status !== 'waiting' ||
      otherQueue.userId === currentUid ||
      createdAtMs < Date.now() - QUEUE_STALE_MS
    ) {
      throw new Error('Waiting user is no longer available.');
    }

    const otherProfile = otherQueue.publicProfile as PublicProfile;

    if (blockedIds.has(otherProfile.uid) || !profilesAreCompatible(publicProfile, otherProfile)) {
      throw new Error('Waiting user is not compatible.');
    }

    transaction.set(matchRef, {
      participantIds: [currentUid, otherProfile.uid],
      participants: {
        [currentUid]: publicProfile,
        [otherProfile.uid]: otherProfile
      },
      status: 'active',
      openingPrompt,
      startsAtMs,
      endsAtMs: startsAtMs + MATCH_SECONDS * 1000,
      savedBy: [],
      reportedBy: [],
      blockedBy: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    transaction.set(openerRef, {
      senderId: 'system',
      body: `Prompt: ${openingPrompt}`,
      sentAtMs: startsAtMs,
      sentAt: serverTimestamp()
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

export function startLiveMessageMatching(profile: UserProfile, callbacks: LiveMatchCallbacks) {
  const db = getLiveDb();
  const currentUid = getCurrentFirebaseUserId() ?? profile.id;
  let queueUnsubscribe: Unsubscribe | null = null;
  let isCancelled = false;
  let isWaiting = false;

  if (!db || currentUid.startsWith('local-')) {
    callbacks.onError('Real person matching needs verified Firebase registration first.');
    return () => undefined;
  }

  const publicProfile = publicProfileFor(profile, currentUid);
  const queueRef = doc(db, LIVE_QUEUE_COLLECTION, currentUid);

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
      // If a waiting user was claimed by someone else, this user simply enters the queue.
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
    callbacks.onWaiting('Waiting for another real KaTalk member to tap Find Chat.');

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
          callbacks.onMatched(await sessionFromMatch(db as Firestore, String(queue.matchId), currentUid));
        } catch (error) {
          callbacks.onError(liveMatchErrorMessage(error));
        }
      },
      (error) => callbacks.onError(liveMatchErrorMessage(error))
    );
  }

  void waitForMatch().catch((error) => callbacks.onError(liveMatchErrorMessage(error)));

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

export function subscribeLiveMessages(
  matchId: string,
  onMessages: (messages: Message[]) => void,
  onError: (message: string) => void
) {
  const db = getLiveDb();
  const currentUid = getCurrentFirebaseUserId();

  if (!db || !currentUid) {
    onError('Live chat needs Firebase sign-in.');
    return () => undefined;
  }

  return onSnapshot(
    query(collection(db, LIVE_MATCH_COLLECTION, matchId, 'messages'), orderBy('sentAtMs', 'asc')),
    (snapshot) => {
      onMessages(
        snapshot.docs.map((item) => {
          const data = item.data();
          const senderId = String(data.senderId ?? 'system');

          return {
            id: item.id,
            sender: senderId === 'system' ? 'system' : senderId === currentUid ? 'me' : 'match',
            body: String(data.body ?? ''),
            sentAt: new Date(typeof data.sentAtMs === 'number' ? data.sentAtMs : Date.now())
          };
        })
      );
    },
    (error) => onError(liveMatchErrorMessage(error))
  );
}

export function subscribeLiveMatchState(
  matchId: string,
  onState: (state: LiveMatchState) => void,
  onError: (message: string) => void
) {
  const db = getLiveDb();
  const currentUid = getCurrentFirebaseUserId();

  if (!db || !currentUid) {
    onError('Live match state needs Firebase sign-in.');
    return () => undefined;
  }

  return onSnapshot(
    doc(db, LIVE_MATCH_COLLECTION, matchId),
    (snapshot) => {
      const data = snapshot.data();
      const savedBy = Array.isArray(data?.savedBy) ? data?.savedBy : [];
      const status = String(data?.status ?? 'active') as LiveMatchState['status'];
      const endsAtMs =
        typeof data?.endsAtMs === 'number' ? data.endsAtMs : Date.now() + MATCH_SECONDS * 1000;

      onState({
        savedByMe: savedBy.includes(currentUid),
        savedByMatch: savedBy.some((id) => id !== currentUid),
        status,
        endsAtMs
      });
    },
    (error) => onError(liveMatchErrorMessage(error))
  );
}

export async function sendLiveMessage(matchId: string, body: string) {
  const db = getLiveDb();
  const currentUid = getCurrentFirebaseUserId();

  if (!db || !currentUid) {
    throw new Error('Live chat needs Firebase sign-in.');
  }

  const sentAtMs = Date.now();
  const matchSnapshot = await getDoc(doc(db, LIVE_MATCH_COLLECTION, matchId));
  const match = matchSnapshot.data();

  if (!matchSnapshot.exists() || match?.status !== 'active') {
    throw new Error('This live chat has already ended.');
  }

  if (typeof match.endsAtMs === 'number' && Date.now() >= match.endsAtMs) {
    throw new Error('This live chat timer already ended.');
  }

  await addDoc(collection(db, LIVE_MATCH_COLLECTION, matchId, 'messages'), {
    senderId: currentUid,
    body,
    sentAtMs,
    sentAt: serverTimestamp()
  });
  await updateDoc(doc(db, LIVE_MATCH_COLLECTION, matchId), {
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function saveLiveMessageMatch(matchId: string) {
  const db = getLiveDb();
  const currentUid = getCurrentFirebaseUserId();

  if (!db || !currentUid) {
    throw new Error('Live match needs Firebase sign-in.');
  }

  await updateDoc(doc(db, LIVE_MATCH_COLLECTION, matchId), {
    savedBy: arrayUnion(currentUid),
    updatedAt: serverTimestamp()
  });
}

export async function recordLiveMessageSafety(matchId: string, action: 'report' | 'block') {
  const db = getLiveDb();
  const currentUid = getCurrentFirebaseUserId();

  if (!db || !currentUid) {
    throw new Error('Live safety needs Firebase sign-in.');
  }

  await runTransaction(db, async (transaction) => {
    const matchRef = doc(db, LIVE_MATCH_COLLECTION, matchId);
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
      status: action === 'block' ? 'blocked' : 'active',
      updatedAt: serverTimestamp()
    });

    if (action === 'block' && otherUid) {
      transaction.set(doc(db, LIVE_BLOCK_COLLECTION, `${currentUid}_${otherUid}`), {
        blockerId: currentUid,
        blockedId: otherUid,
        matchId,
        createdAt: serverTimestamp()
      });
    }
  });
}

export async function closeLiveMessageMatch(matchId: string, status: 'expired' | 'saved') {
  const db = getLiveDb();

  if (!db) {
    return;
  }

  await runTransaction(db, async (transaction) => {
    const matchRef = doc(db, LIVE_MATCH_COLLECTION, matchId);
    const snapshot = await transaction.get(matchRef);
    const currentStatus = snapshot.data()?.status;

    if (!snapshot.exists() || (currentStatus !== 'active' && currentStatus !== status)) {
      return;
    }

    transaction.update(matchRef, {
      status,
      endedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
}
