import {
  collection,
  doc,
  getDocs,
  getFirestore,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Firestore
} from 'firebase/firestore';
import { colors } from '../theme';
import type { Candidate, UserProfile, VoiceRoom } from '../types';
import { shouldUseSupabase, supabaseMissingConfigMessage } from './backendConfig';
import { getConfiguredFirebaseApp, getCurrentFirebaseUserId } from './firebaseAuthService';

export const LIVE_PROFILE_COLLECTION = 'liveProfiles';
export const LIVE_BLOCK_COLLECTION = 'liveBlocks';

export type PublicMemberProfile = {
  uid: string;
  nickname: string;
  dateOfBirth: string;
  gender: string;
  preference: string;
  ageRange: string;
  interests: string[];
  comfort: UserProfile['comfort'];
  prompt: string;
  photoUrl?: string;
  updatedAtMs?: number;
};

type SupabasePublicProfileRow = {
  id: string;
  nickname?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  preference?: string | null;
  age_range?: string | null;
  interests?: unknown;
  comfort?: UserProfile['comfort'] | null;
  prompt?: string | null;
  photo_url?: string | null;
  updated_at_ms?: number | null;
};

type SupabaseBlockRow = {
  blocker_id?: string | null;
  blocked_id?: string | null;
};

const avatarPalette = [
  colors.accent,
  '#8B6AF2',
  '#2EB872',
  '#E2A52E',
  '#2B8A8A',
  '#E35D7A',
  '#5267D9'
];

function normalizedInterests(interests: string[] | undefined) {
  const cleanedInterests = Array.isArray(interests)
    ? interests.map((interest) => interest.trim()).filter(Boolean)
    : [];

  return cleanedInterests.length > 0 ? cleanedInterests : ['Quiet conversations'];
}

function getRegisteredDb() {
  const app = getConfiguredFirebaseApp();
  return app ? getFirestore(app) : null;
}

function publicProfileFromSupabaseRow(row: SupabasePublicProfileRow): PublicMemberProfile {
  const interests = Array.isArray(row.interests) ? row.interests.map(String) : ['Quiet conversations'];

  return {
    uid: row.id,
    nickname: row.nickname || 'KaTalk member',
    dateOfBirth: row.date_of_birth || '2000-01-01',
    gender: row.gender || 'Prefer not to say',
    preference: row.preference || 'Everyone',
    ageRange: row.age_range || '18-99',
    interests,
    comfort: row.comfort ?? 'balanced',
    prompt: row.prompt || `Registered KaTalk member who likes ${interests.slice(0, 2).join(' and ')}.`,
    photoUrl: row.photo_url ?? undefined,
    updatedAtMs: row.updated_at_ms ?? undefined
  };
}

function supabasePublicProfileRowFromProfile(profile: UserProfile, uid: string) {
  const interests = normalizedInterests(profile.interests);

  return {
    id: uid,
    legacy_firebase_uid: profile.id !== uid && !profile.id.startsWith('local-') ? profile.id : null,
    nickname: profile.nickname || 'KaTalk member',
    photo_url: profile.avatarUrl ?? null,
    date_of_birth: profile.dateOfBirth || '2000-01-01',
    gender: profile.gender || 'Prefer not to say',
    preference: profile.preference || 'Everyone',
    age_range: profile.ageRange || '18-99',
    interests,
    comfort: profile.comfort ?? 'balanced',
    prompt: `Registered KaTalk member who likes ${interests.slice(0, 2).join(' and ')}.`,
    updated_at_ms: Date.now(),
    updated_at: new Date().toISOString()
  };
}

export function ageFromDateOfBirth(dateOfBirth: string) {
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

export function avatarColorForId(id: string) {
  let total = 0;

  for (let index = 0; index < id.length; index += 1) {
    total += id.charCodeAt(index);
  }

  return avatarPalette[total % avatarPalette.length];
}

export function publicProfileFromUserProfile(profile: UserProfile, uid: string): PublicMemberProfile {
  const interests = normalizedInterests(profile.interests);

  return {
    uid,
    nickname: profile.nickname || 'KaTalk member',
    dateOfBirth: profile.dateOfBirth || '2000-01-01',
    gender: profile.gender || 'Prefer not to say',
    preference: profile.preference || 'Everyone',
    ageRange: profile.ageRange || '18-99',
    interests,
    comfort: profile.comfort ?? 'balanced',
    prompt: `Registered KaTalk member who likes ${interests.slice(0, 2).join(' and ')}.`,
    photoUrl: profile.avatarUrl,
    updatedAtMs: Date.now()
  };
}

export function candidateFromPublicProfile(profile: PublicMemberProfile, distanceMiles = 0): Candidate {
  const interests = normalizedInterests(profile.interests);

  return {
    id: profile.uid,
    nickname: profile.nickname || 'KaTalk member',
    age: ageFromDateOfBirth(profile.dateOfBirth),
    distanceMiles,
    interests,
    prompt: profile.prompt,
    avatarColor: avatarColorForId(profile.uid),
    photoUrl: profile.photoUrl
  };
}

export function parseAgeRange(ageRange: string) {
  const [min, max] = ageRange.split('-').map((value) => Number(value.trim()));

  return {
    min: Number.isFinite(min) ? min : 18,
    max: Number.isFinite(max) ? max : 99
  };
}

export function preferenceAllowsGender(preference: string, gender: string) {
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

export function profilesAreCompatible(current: PublicMemberProfile, other: PublicMemberProfile) {
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

function isPublicMemberProfile(value: unknown): value is PublicMemberProfile {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const profile = value as Partial<PublicMemberProfile>;

  return Boolean(
    profile.uid &&
      profile.nickname &&
      profile.dateOfBirth &&
      profile.gender &&
      profile.preference &&
      profile.ageRange &&
      Array.isArray(profile.interests)
  );
}

export async function blockedUserIdsFor(db: Firestore, currentUid: string) {
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

export async function publishRegisteredUserProfile(profile: UserProfile) {
  if (shouldUseSupabase()) {
    const { getCurrentSupabaseUser, getSupabaseClient } = await import('./supabaseClient');
    const supabase = getSupabaseClient();
    const user = await getCurrentSupabaseUser();

    if (!supabase || !user) {
      return;
    }

    const { error } = await supabase
      .from('public_profiles')
      .upsert(supabasePublicProfileRowFromProfile(profile, user.id));

    if (error) {
      throw new Error(error.message || supabaseMissingConfigMessage());
    }

    return;
  }

  const db = getRegisteredDb();
  const uid = getCurrentFirebaseUserId();

  if (!db || !uid || uid.startsWith('local-')) {
    return;
  }

  const publicProfile = publicProfileFromUserProfile(profile, uid);

  await setDoc(
    doc(db, LIVE_PROFILE_COLLECTION, uid),
    {
      ...publicProfile,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function listRegisteredMemberProfiles(profile: UserProfile, maxCount = 40) {
  if (shouldUseSupabase()) {
    const { getCurrentSupabaseUser, getSupabaseClient } = await import('./supabaseClient');
    const supabase = getSupabaseClient();
    const user = await getCurrentSupabaseUser();

    if (!supabase || !user) {
      return [];
    }

    await publishRegisteredUserProfile(profile).catch(() => undefined);

    const currentPublicProfile = publicProfileFromUserProfile(profile, user.id);
    const { data: blockRows } = await supabase
      .from('blocks')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`)
      .limit(200);
    const blockedIds = new Set<string>();

    ((blockRows ?? []) as SupabaseBlockRow[]).forEach((row) => {
      const blockerId = row.blocker_id ?? '';
      const blockedId = row.blocked_id ?? '';

      if (blockerId === user.id && blockedId) {
        blockedIds.add(blockedId);
      }

      if (blockedId === user.id && blockerId) {
        blockedIds.add(blockerId);
      }
    });

    const { data, error } = await supabase
      .from('public_profiles')
      .select('*')
      .limit(maxCount + 20);

    if (error) {
      throw new Error(error.message || supabaseMissingConfigMessage());
    }

    return ((data ?? []) as SupabasePublicProfileRow[])
      .map(publicProfileFromSupabaseRow)
      .filter((member) => member.uid !== user.id)
      .filter((member) => !blockedIds.has(member.uid))
      .filter((member) => profilesAreCompatible(currentPublicProfile, member))
      .slice(0, maxCount);
  }

  const db = getRegisteredDb();
  const currentUid = getCurrentFirebaseUserId() ?? profile.id;

  if (!db || !currentUid || currentUid.startsWith('local-')) {
    return [];
  }

  await publishRegisteredUserProfile(profile).catch(() => undefined);

  const currentPublicProfile = publicProfileFromUserProfile(profile, currentUid);
  const blockedIds = await blockedUserIdsFor(db, currentUid).catch(() => new Set<string>());
  const snapshot = await getDocs(query(collection(db, LIVE_PROFILE_COLLECTION), limit(maxCount + 20)));

  return snapshot.docs
    .map((item) => item.data())
    .filter(isPublicMemberProfile)
    .filter((member) => member.uid !== currentUid)
    .filter((member) => !blockedIds.has(member.uid))
    .filter((member) => profilesAreCompatible(currentPublicProfile, member))
    .slice(0, maxCount);
}

export async function listRegisteredMemberCandidates(profile: UserProfile, maxCount = 40) {
  const members = await listRegisteredMemberProfiles(profile, maxCount);
  return members.map((member) => candidateFromPublicProfile(member));
}

export function registeredMemberErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();

  if (normalized.includes('permission') || normalized.includes('row-level security')) {
    return 'Supabase blocked registered members. Run supabase/fix-visible-members-rls.sql in the Supabase SQL Editor.';
  }

  if (normalized.includes('does not exist') || normalized.includes('schema cache')) {
    return 'Supabase member tables are missing. Run supabase/schema.sql, then run supabase/fix-visible-members-rls.sql.';
  }

  if (normalized.includes('network') || normalized.includes('fetch')) {
    return 'Registered members could not load yet. Check your connection, then try again.';
  }

  return 'Registered members could not load yet. Check your Supabase setup and connection.';
}

export async function listRegisteredVoiceRooms(profile: UserProfile, maxCount = 20): Promise<VoiceRoom[]> {
  const members = await listRegisteredMemberCandidates(profile, maxCount);

  return members.map((member) => ({
    id: `member-room-${member.id}`,
    hostId: member.id,
    title: `${member.nickname}'s Voice Room`,
    mood: member.interests[0] ?? 'Member',
    topic: member.prompt,
    participants: 1,
    isJoined: false,
    host: member.nickname,
    speakers: [member.nickname]
  }));
}
