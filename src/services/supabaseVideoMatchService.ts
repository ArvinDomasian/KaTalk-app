import type { Candidate, UserProfile } from '../types';
import { supabaseMissingConfigMessage } from './backendConfig';
import {
  candidateFromPublicProfile,
  profilesAreCompatible,
  publicProfileFromUserProfile,
  publishRegisteredUserProfile,
  type PublicMemberProfile
} from './registeredUserService';
import { submitSafetyReport } from './reportService';
import { getCurrentSupabaseAccessToken, getCurrentSupabaseUser, getSupabaseClient } from './supabaseClient';

declare const process: {
  env: Record<string, string | undefined>;
};

const QUEUE_STALE_MS = 3 * 60 * 1000;

export type SupabaseLiveVideoSession = {
  id: string;
  candidate: Candidate;
  agoraChannelName: string;
};

export type SupabaseLiveVideoMatchState = {
  status: 'active' | 'ended' | 'blocked';
  endedBy?: string;
};

export type SupabaseAgoraJoinCredentials = {
  appId: string;
  token: string;
  uid: number;
};

type VideoMatchCallbacks = {
  onSearching: (message: string) => void;
  onMatched: (session: SupabaseLiveVideoSession) => void;
  onError: (message: string) => void;
};

type QueueRow = {
  user_id: string;
  public_profile: unknown;
  status: string;
  match_id?: string | null;
  created_at_ms?: number | null;
};

type VideoMatchRow = {
  id: string;
  participant_ids?: string[] | null;
  participants?: Record<string, unknown> | null;
  status?: string | null;
  agora_channel_name?: string | null;
  reported_by?: string[] | null;
  blocked_by?: string[] | null;
  ended_by?: string | null;
};

function cleanEnvValue(value?: string) {
  return value?.trim().replace(/,$/, '').replace(/^["']|["']$/g, '') ?? '';
}

function pickRandom<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function videoMatchErrorMessage(error: unknown) {
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';

  if (message.toLowerCase().includes('permission')) {
    return 'Supabase blocked video matching. Run supabase/fix-live-matching-rls.sql in the Supabase SQL Editor, then try again.';
  }

  return message || 'Supabase video matching could not start.';
}

function publicProfileFromUnknown(value: unknown): PublicMemberProfile | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const profile = value as Partial<PublicMemberProfile> & {
    id?: string;
    uid?: string;
    date_of_birth?: string;
    age_range?: string;
    photo_url?: string;
  };
  const uid = profile.uid ?? profile.id;

  if (!uid) {
    return null;
  }

  return {
    uid,
    nickname: String(profile.nickname ?? 'KaTalk member'),
    dateOfBirth: String(profile.dateOfBirth ?? profile.date_of_birth ?? '2000-01-01'),
    gender: String(profile.gender ?? 'Prefer not to say'),
    preference: String(profile.preference ?? 'Everyone'),
    ageRange: String(profile.ageRange ?? profile.age_range ?? '18-99'),
    interests: Array.isArray(profile.interests) ? profile.interests.map(String) : ['Quiet conversations'],
    comfort: (profile.comfort ?? 'balanced') as UserProfile['comfort'],
    prompt: String(profile.prompt ?? 'Registered KaTalk member.'),
    photoUrl: profile.photoUrl ?? profile.photo_url,
    updatedAtMs: typeof profile.updatedAtMs === 'number' ? profile.updatedAtMs : undefined
  };
}

async function blockedUserIdsFor(currentUid: string) {
  const supabase = getSupabaseClient();
  const blockedIds = new Set<string>();

  if (!supabase) {
    return blockedIds;
  }

  const { data } = await supabase
    .from('blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${currentUid},blocked_id.eq.${currentUid}`)
    .limit(200);

  ((data ?? []) as Array<{ blocker_id?: string | null; blocked_id?: string | null }>).forEach((row) => {
    if (row.blocker_id === currentUid && row.blocked_id) {
      blockedIds.add(row.blocked_id);
    }

    if (row.blocked_id === currentUid && row.blocker_id) {
      blockedIds.add(row.blocker_id);
    }
  });

  return blockedIds;
}

async function sessionFromVideoMatch(matchId: string, currentUid: string): Promise<SupabaseLiveVideoSession> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error(supabaseMissingConfigMessage());
  }

  const { data, error } = await supabase.from('video_matches').select('*').eq('id', matchId).single();

  if (error || !data) {
    throw new Error(error?.message || 'Video match was not found.');
  }

  const match = data as VideoMatchRow;
  const participantIds = Array.isArray(match.participant_ids) ? match.participant_ids : [];
  const otherUid = participantIds.find((id) => id !== currentUid);
  const participantProfile = otherUid ? match.participants?.[otherUid] : null;
  const publicProfile = publicProfileFromUnknown(participantProfile);

  if (!otherUid || !publicProfile) {
    throw new Error('Video match participant was not found.');
  }

  return {
    id: matchId,
    candidate: candidateFromPublicProfile(publicProfile),
    agoraChannelName: String(match.agora_channel_name ?? `katalk-video-${matchId}`)
  };
}

async function tryClaimWaitingVideoUser(currentUid: string, publicProfile: PublicMemberProfile) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error(supabaseMissingConfigMessage());
  }

  const blockedIds = await blockedUserIdsFor(currentUid);
  const { data, error } = await supabase
    .from('video_match_queue')
    .select('*')
    .eq('status', 'waiting')
    .limit(20);

  if (error) {
    throw new Error(error.message);
  }

  const cutoffMs = Date.now() - QUEUE_STALE_MS;
  const eligibleRows = ((data ?? []) as QueueRow[]).filter((row) => {
    const otherProfile = publicProfileFromUnknown(row.public_profile);

    return (
      row.user_id !== currentUid &&
      Boolean(otherProfile) &&
      Number(row.created_at_ms ?? 0) >= cutoffMs &&
      !blockedIds.has(String(otherProfile?.uid)) &&
      profilesAreCompatible(publicProfile, otherProfile as PublicMemberProfile)
    );
  });
  const selectedRow = eligibleRows.length > 0 ? pickRandom(eligibleRows) : null;

  if (!selectedRow) {
    return null;
  }

  const channelName = `katalk-video-${Date.now()}-${currentUid.slice(0, 8)}`;
  const { data: matchId, error: claimError } = await supabase.rpc('create_video_match', {
    p_other_uid: selectedRow.user_id,
    p_current_profile: publicProfile,
    p_agora_channel_name: channelName
  });

  if (claimError) {
    throw new Error(claimError.message);
  }

  if (!matchId) {
    return null;
  }

  return sessionFromVideoMatch(String(matchId), currentUid);
}

export function startSupabaseVideoMatching(profile: UserProfile, callbacks: VideoMatchCallbacks) {
  const supabase = getSupabaseClient();
  let isCancelled = false;
  let isWaiting = false;
  let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;

  if (!supabase) {
    callbacks.onError(supabaseMissingConfigMessage());
    return () => undefined;
  }

  void (async () => {
    const user = await getCurrentSupabaseUser();

    if (!user) {
      callbacks.onError('Real video matching needs a verified Supabase account.');
      return;
    }

    const currentUid = user.id;
    const publicProfile = publicProfileFromUserProfile(profile, currentUid);

    await publishRegisteredUserProfile(profile);

    const claimedSession = await tryClaimWaitingVideoUser(currentUid, publicProfile);

    if (claimedSession && !isCancelled) {
      callbacks.onMatched(claimedSession);
      return;
    }

    if (isCancelled) {
      return;
    }

    isWaiting = true;
    const now = Date.now();
    const { error } = await supabase.from('video_match_queue').upsert({
      user_id: currentUid,
      public_profile: publicProfile,
      status: 'waiting',
      match_id: null,
      created_at_ms: now,
      expires_at_ms: now + QUEUE_STALE_MS,
      updated_at: new Date(now).toISOString()
    });

    if (error) {
      callbacks.onError(videoMatchErrorMessage(error));
      return;
    }

    callbacks.onSearching('Waiting for another real KaTalk member to start video matching.');

    channel = supabase
      .channel(`video-queue-${currentUid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'video_match_queue', filter: `user_id=eq.${currentUid}` },
        (payload) => {
          const queue = payload.new as QueueRow | null;

          if (!queue || queue.status !== 'matched' || !queue.match_id || isCancelled) {
            return;
          }

          isWaiting = false;
          void sessionFromVideoMatch(String(queue.match_id), currentUid)
            .then(callbacks.onMatched)
            .catch((error) => callbacks.onError(videoMatchErrorMessage(error)));
        }
      )
      .subscribe();
  })().catch((error) => callbacks.onError(videoMatchErrorMessage(error)));

  return () => {
    isCancelled = true;

    if (channel) {
      void supabase.removeChannel(channel);
    }

    void getCurrentSupabaseUser().then((user) => {
      if (user && isWaiting) {
        void supabase
          .from('video_match_queue')
          .update({
            status: 'cancelled',
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id);
      }
    });
  };
}

export function subscribeSupabaseLiveVideoMatchState(
  matchId: string,
  onState: (state: SupabaseLiveVideoMatchState) => void,
  onError: (message: string) => void
) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    onError(supabaseMissingConfigMessage());
    return () => undefined;
  }

  const supabaseClient = supabase;

  async function loadState() {
    const { data, error } = await supabaseClient.from('video_matches').select('*').eq('id', matchId).single();

    if (error || !data) {
      onError(videoMatchErrorMessage(error));
      return;
    }

    const match = data as VideoMatchRow;
    onState({
      status: String(match.status ?? 'active') as SupabaseLiveVideoMatchState['status'],
      endedBy: match.ended_by ?? undefined
    });
  }

  void loadState();

  const channel = supabaseClient
    .channel(`video-match-${matchId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'video_matches', filter: `id=eq.${matchId}` }, () => {
      void loadState();
    })
    .subscribe();

  return () => {
    void supabaseClient.removeChannel(channel);
  };
}

export async function leaveSupabaseLiveVideoMatch(matchId: string) {
  const supabase = getSupabaseClient();
  const user = await getCurrentSupabaseUser();

  if (!supabase || !user) {
    return;
  }

  await supabase
    .from('video_matches')
    .update({
      status: 'ended',
      ended_by: user.id,
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', matchId);
}

export async function recordSupabaseLiveVideoSafety(matchId: string, action: 'report' | 'block') {
  const supabase = getSupabaseClient();
  const user = await getCurrentSupabaseUser();

  if (!supabase || !user) {
    throw new Error('Video safety needs Supabase sign-in.');
  }

  const { data } = await supabase.from('video_matches').select('*').eq('id', matchId).single();
  const match = data as VideoMatchRow | null;
  const participantIds = Array.isArray(match?.participant_ids) ? match?.participant_ids : [];
  const otherUid = participantIds.find((id) => id !== user.id) ?? '';
  const otherProfile = publicProfileFromUnknown(otherUid ? match?.participants?.[otherUid] : null);
  const arrayKey = action === 'report' ? 'reported_by' : 'blocked_by';
  const existing = Array.isArray(match?.[arrayKey]) ? (match?.[arrayKey] as string[]) : [];

  await supabase
    .from('video_matches')
    .update({
      [arrayKey]: existing.includes(user.id) ? existing : [...existing, user.id],
      status: action === 'block' ? 'blocked' : 'ended',
      ended_by: user.id,
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', matchId);

  if (action === 'block' && otherUid) {
    await supabase.from('blocks').upsert({
      id: `${user.id}_${otherUid}`,
      blocker_id: user.id,
      blocked_id: otherUid,
      match_id: matchId,
      source: 'video',
      created_at: new Date().toISOString()
    });
  }

  if (action === 'report' && otherUid) {
    await submitSafetyReport({
      source: 'video',
      action: 'report',
      actorId: user.id,
      targetId: otherUid,
      targetNickname: otherProfile?.nickname,
      matchId,
      reason: 'Reported from video match'
    });
  }
}

export function supabaseAgoraUidFor(userId: string) {
  let hash = 2166136261;

  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) || 1;
}

export async function getSupabaseAgoraJoinCredentials(channelName: string): Promise<SupabaseAgoraJoinCredentials> {
  const appId = cleanEnvValue(process.env.EXPO_PUBLIC_AGORA_APP_ID);
  const tokenEndpoint = cleanEnvValue(process.env.EXPO_PUBLIC_AGORA_TOKEN_ENDPOINT);
  const user = await getCurrentSupabaseUser();

  if (!appId) {
    throw new Error('Agora is not configured. Add EXPO_PUBLIC_AGORA_APP_ID to .env and rebuild the app.');
  }

  if (!user) {
    throw new Error('Agora video calls need a signed-in Supabase account.');
  }

  const uid = supabaseAgoraUidFor(user.id);

  if (!tokenEndpoint) {
    return { appId, token: '', uid };
  }

  const accessToken = await getCurrentSupabaseAccessToken();
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
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
