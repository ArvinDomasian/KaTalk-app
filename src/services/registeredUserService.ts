import { colors } from '../theme';
import type { Candidate, UserProfile, VoiceRoom } from '../types';
import { supabaseMissingConfigMessage } from './backendConfig';
import { getCurrentSupabaseUser, getSupabaseClient } from './supabaseClient';

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

const PREVIEW_MEMBER_STORAGE_KEY = 'katalk.previewMembers.v1';

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

function previewMembersAreEnabled() {
  try {
    const browserScope = globalThis as typeof globalThis & {
      location?: { search?: string };
    };

    return browserScope.location?.search?.includes('katalkPreviewMembers=1') ?? false;
  } catch {
    return false;
  }
}

function loadPreviewMemberProfiles(profile: UserProfile, maxCount: number): PublicMemberProfile[] {
  if (!previewMembersAreEnabled()) {
    return [];
  }

  try {
    const browserScope = globalThis as typeof globalThis & {
      localStorage?: { getItem: (key: string) => string | null };
    };
    const rawMembers = browserScope.localStorage?.getItem(PREVIEW_MEMBER_STORAGE_KEY);

    if (!rawMembers) {
      return [];
    }

    const parsedMembers = JSON.parse(rawMembers);

    if (!Array.isArray(parsedMembers)) {
      return [];
    }

    const currentPublicProfile = publicProfileFromUserProfile(profile, profile.id);

    return parsedMembers
      .map((member): PublicMemberProfile | null => {
        if (!member || typeof member !== 'object') {
          return null;
        }

        const candidate = member as Partial<PublicMemberProfile>;

        if (!candidate.uid || !candidate.nickname) {
          return null;
        }

        const interests = normalizedInterests(candidate.interests);

        return {
          uid: candidate.uid,
          nickname: candidate.nickname,
          dateOfBirth: candidate.dateOfBirth || '2000-01-01',
          gender: candidate.gender || 'Prefer not to say',
          preference: candidate.preference || 'Everyone',
          ageRange: candidate.ageRange || '18-99',
          interests,
          comfort: candidate.comfort ?? 'balanced',
          prompt: candidate.prompt || `Registered KaTalk member who likes ${interests.slice(0, 2).join(' and ')}.`,
          photoUrl: candidate.photoUrl,
          updatedAtMs: candidate.updatedAtMs ?? Date.now()
        };
      })
      .filter((member): member is PublicMemberProfile => Boolean(member))
      .filter((member) => member.uid !== profile.id)
      .filter((member) => profilesAreCompatible(currentPublicProfile, member))
      .slice(0, maxCount);
  } catch {
    return [];
  }
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

export async function publishRegisteredUserProfile(profile: UserProfile) {
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
}

export async function listRegisteredMemberProfiles(profile: UserProfile, maxCount = 40) {
  const previewMembers = loadPreviewMemberProfiles(profile, maxCount);

  if (previewMembers.length > 0) {
    return previewMembers;
  }

  const supabase = getSupabaseClient();
  const user = await getCurrentSupabaseUser();

  if (!supabase || !user) {
    return [];
  }

  await publishRegisteredUserProfile(profile).catch(() => undefined);

  const currentPublicProfile = publicProfileFromUserProfile(profile, user.id);
  const { data: blockRows, error: blockError } = await supabase
    .from('blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`)
    .limit(200);

  if (blockError) {
    throw new Error(blockError.message || supabaseMissingConfigMessage());
  }

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
