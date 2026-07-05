import type { UserProfile } from '../types';
import { supabaseMissingConfigMessage } from './backendConfig';
import { getCurrentSupabaseUser, getSupabaseClient } from './supabaseClient';

const PROFILE_TABLE = 'profiles';
const PUBLIC_PROFILE_TABLE = 'public_profiles';

function profileRowFromUserProfile(profile: UserProfile, uid: string) {
  return {
    id: uid,
    legacy_firebase_uid: profile.id !== uid && !profile.id.startsWith('local-') ? profile.id : null,
    nickname: profile.nickname,
    avatar_url: profile.avatarUrl ?? null,
    date_of_birth: profile.dateOfBirth,
    gender: profile.gender,
    preference: profile.preference,
    age_range: profile.ageRange,
    interests: profile.interests,
    comfort: profile.comfort,
    auth_method: profile.authMethod ?? 'google',
    auth_contact: profile.authContact ?? null,
    accepted_terms: profile.acceptedTerms,
    accepted_privacy: profile.acceptedPrivacy,
    accepted_rules: profile.acceptedRules,
    subscription: profile.subscription ?? null,
    economy: profile.economy ?? null,
    verification: profile.verification ?? { status: 'not_started', badgeVisible: false },
    moderation: profile.moderation ?? { isBanned: false },
    updated_at_ms: Date.now(),
    updated_at: new Date().toISOString()
  };
}

function publicProfileRowFromUserProfile(profile: UserProfile, uid: string) {
  const interests = profile.interests.length > 0 ? profile.interests : ['Quiet conversations'];

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

function userProfileFromRow(row: Record<string, unknown>, uid: string): UserProfile {
  const interests = Array.isArray(row.interests) ? row.interests.map(String) : ['Coffee', 'Music', 'Deep talks'];
  const subscription = row.subscription && typeof row.subscription === 'object' ? row.subscription : undefined;
  const economy = row.economy && typeof row.economy === 'object' ? row.economy : undefined;
  const verification = row.verification && typeof row.verification === 'object' ? row.verification : undefined;
  const moderation = row.moderation && typeof row.moderation === 'object' ? row.moderation : undefined;

  return {
    id: uid,
    nickname: String(row.nickname ?? 'KaTalk member'),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : undefined,
    dateOfBirth: String(row.date_of_birth ?? '2000-01-01'),
    gender: String(row.gender ?? 'Prefer not to say'),
    preference: String(row.preference ?? 'Everyone'),
    ageRange: String(row.age_range ?? '21-35'),
    interests,
    comfort: String(row.comfort ?? 'balanced') as UserProfile['comfort'],
    authMethod: String(row.auth_method ?? 'google') as UserProfile['authMethod'],
    authContact: row.auth_contact ? String(row.auth_contact) : undefined,
    acceptedTerms: row.accepted_terms !== false,
    acceptedPrivacy: row.accepted_privacy !== false,
    acceptedRules: row.accepted_rules !== false,
    subscription: subscription as UserProfile['subscription'],
    economy: economy as UserProfile['economy'],
    verification: verification as UserProfile['verification'],
    moderation: moderation as UserProfile['moderation']
  };
}

export async function saveSupabaseUserProfile(profile: UserProfile) {
  const supabase = getSupabaseClient();
  const user = await getCurrentSupabaseUser();

  if (!supabase || !user) {
    return;
  }

  const uid = user.id;
  const { error: profileError } = await supabase
    .from(PROFILE_TABLE)
    .upsert(profileRowFromUserProfile(profile, uid));

  if (profileError) {
    throw new Error(profileError.message || supabaseMissingConfigMessage());
  }

  const { error: publicProfileError } = await supabase
    .from(PUBLIC_PROFILE_TABLE)
    .upsert(publicProfileRowFromUserProfile(profile, uid));

  if (publicProfileError) {
    throw new Error(publicProfileError.message || supabaseMissingConfigMessage());
  }
}

export async function loadCurrentSupabaseUserProfile(timeoutMs = 6000) {
  const supabase = getSupabaseClient();
  const user = await getCurrentSupabaseUser();

  if (!supabase || !user) {
    return null;
  }

  const loadPromise = supabase.from(PROFILE_TABLE).select('*').eq('id', user.id).maybeSingle();
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('KATALK_SUPABASE_PROFILE_LOAD_TIMEOUT')), timeoutMs);
  });
  const { data, error } = await Promise.race([loadPromise, timeoutPromise]);

  if (error || !data) {
    return null;
  }

  return userProfileFromRow(data as Record<string, unknown>, user.id);
}
