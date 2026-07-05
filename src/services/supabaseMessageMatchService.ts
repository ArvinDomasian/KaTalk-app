import { openingMessages } from '../data/mockData';
import type { Message, UserProfile } from '../types';
import type { MessageMatchSession } from './contracts';
import { supabaseMissingConfigMessage } from './backendConfig';
import {
  candidateFromPublicProfile,
  profilesAreCompatible,
  publicProfileFromUserProfile,
  publishRegisteredUserProfile,
  type PublicMemberProfile
} from './registeredUserService';
import { submitSafetyReport } from './reportService';
import { getCurrentSupabaseUser, getSupabaseClient } from './supabaseClient';

const MATCH_SECONDS = 120;
const QUEUE_STALE_MS = 2 * 60 * 1000;
const QUEUE_POLL_MS = 2000;
const LIVE_CHAT_POLL_MS = 2000;

type LiveMatchCallbacks = {
  onWaiting: (message: string) => void;
  onMatched: (session: MessageMatchSession) => void;
  onError: (message: string) => void;
};

export type SupabaseLiveMatchState = {
  savedByMe: boolean;
  savedByMatch: boolean;
  status: 'active' | 'expired' | 'saved' | 'blocked';
  endsAtMs: number;
};

type QueueRow = {
  user_id: string;
  public_profile: unknown;
  status: string;
  match_id?: string | null;
  created_at_ms?: number | null;
};

type MatchRow = {
  id: string;
  participant_ids?: string[] | null;
  participants?: Record<string, unknown> | null;
  status?: string | null;
  opening_prompt?: string | null;
  starts_at_ms?: number | null;
  ends_at_ms?: number | null;
  saved_by?: string[] | null;
  reported_by?: string[] | null;
  blocked_by?: string[] | null;
  agora_channel_name?: string | null;
};

function pickRandom<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function messageMatchErrorMessage(error: unknown) {
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';

  if (message.toLowerCase().includes('permission')) {
    return 'Supabase blocked live matching. Run supabase/fix-live-matching-rls.sql in the Supabase SQL Editor, then try again.';
  }

  if (message.toLowerCase().includes('does not exist') || message.toLowerCase().includes('schema cache')) {
    return 'Supabase live matching tables are missing. Run supabase/schema.sql, then run supabase/fix-live-matching-rls.sql.';
  }

  if (message.toLowerCase().includes('not authenticated') || message.toLowerCase().includes('jwt')) {
    return 'Please log in again before using real matching.';
  }

  if (message.toLowerCase().includes('network') || message.toLowerCase().includes('fetch')) {
    return 'KaTalk cannot reach Supabase right now. Check your connection, then try again.';
  }

  return message || 'Supabase live matching could not start yet.';
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

async function sessionFromMatch(matchId: string, currentUid: string): Promise<MessageMatchSession> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error(supabaseMissingConfigMessage());
  }

  const { data, error } = await supabase
    .from('message_matches')
    .select('*')
    .eq('id', matchId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Match was not found.');
  }

  const match = data as MatchRow;
  const participantIds = Array.isArray(match.participant_ids) ? match.participant_ids : [];
  const otherUid = participantIds.find((id) => id !== currentUid);
  const participantProfile = otherUid ? match.participants?.[otherUid] : null;
  const publicProfile = publicProfileFromUnknown(participantProfile);

  if (!otherUid || !publicProfile) {
    throw new Error('Match participant was not found.');
  }

  const startsAtMs = Number(match.starts_at_ms ?? Date.now());
  const endsAtMs = Number(match.ends_at_ms ?? startsAtMs + MATCH_SECONDS * 1000);

  return {
    id: matchId,
    candidate: candidateFromPublicProfile(publicProfile),
    openingPrompt: String(match.opening_prompt ?? pickRandom(openingMessages)),
    durationSeconds: MATCH_SECONDS,
    startsAt: new Date(startsAtMs),
    endsAt: new Date(endsAtMs)
  };
}

async function tryClaimWaitingUser(currentUid: string, publicProfile: PublicMemberProfile) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error(supabaseMissingConfigMessage());
  }

  const blockedIds = await blockedUserIdsFor(currentUid);
  const { data, error } = await supabase
    .from('message_match_queue')
    .select('*')
    .eq('status', 'waiting')
    .gt('expires_at_ms', Date.now())
    .neq('user_id', currentUid)
    .limit(30);

  if (error) {
    throw new Error(error.message);
  }

  const queueCutoffMs = Date.now() - QUEUE_STALE_MS;
  const eligibleRows = ((data ?? []) as QueueRow[]).filter((row) => {
    const otherProfile = publicProfileFromUnknown(row.public_profile);

    return (
      row.user_id !== currentUid &&
      Boolean(otherProfile) &&
      Number(row.created_at_ms ?? 0) >= queueCutoffMs &&
      !blockedIds.has(String(otherProfile?.uid)) &&
      profilesAreCompatible(publicProfile, otherProfile as PublicMemberProfile)
    );
  });
  const selectedRow = eligibleRows.length > 0 ? pickRandom(eligibleRows) : null;

  if (!selectedRow) {
    return null;
  }

  const startsAtMs = Date.now();
  const openingPrompt = pickRandom(openingMessages);
  const { data: matchId, error: claimError } = await supabase.rpc('create_message_match', {
    p_other_uid: selectedRow.user_id,
    p_current_profile: publicProfile,
    p_opening_prompt: openingPrompt,
    p_starts_at_ms: startsAtMs,
    p_ends_at_ms: startsAtMs + MATCH_SECONDS * 1000
  });

  if (claimError) {
    throw new Error(claimError.message);
  }

  if (!matchId) {
    return null;
  }

  return sessionFromMatch(String(matchId), currentUid);
}

export function startSupabaseMessageMatching(profile: UserProfile, callbacks: LiveMatchCallbacks) {
  const supabase = getSupabaseClient();
  let isCancelled = false;
  let isWaiting = false;
  let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let matchHandled = false;

  if (!supabase) {
    callbacks.onError(supabaseMissingConfigMessage());
    return () => undefined;
  }

  function stopWatchingQueue() {
    if (channel) {
      void supabase.removeChannel(channel);
      channel = null;
    }

    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  void (async () => {
    const user = await getCurrentSupabaseUser();

    if (!user) {
      callbacks.onError('Real person matching needs verified Supabase registration first.');
      return;
    }

    const currentUid = user.id;
    const publicProfile = publicProfileFromUserProfile(profile, currentUid);

    await publishRegisteredUserProfile(profile);

    const claimedSession = await tryClaimWaitingUser(currentUid, publicProfile);

    if (claimedSession && !isCancelled) {
      callbacks.onMatched(claimedSession);
      return;
    }

    if (isCancelled) {
      return;
    }

    isWaiting = true;
    const now = Date.now();
    const { error } = await supabase.from('message_match_queue').upsert({
      user_id: currentUid,
      public_profile: publicProfile,
      status: 'waiting',
      match_id: null,
      created_at_ms: now,
      expires_at_ms: now + QUEUE_STALE_MS,
      updated_at: new Date(now).toISOString()
    });

    if (error) {
      callbacks.onError(messageMatchErrorMessage(error));
      return;
    }

    callbacks.onWaiting('Waiting for another real KaTalk member to tap Find Chat.');

    async function openMatchedQueue(queue: QueueRow) {
      if (matchHandled || !queue.match_id || isCancelled) {
        return;
      }

      matchHandled = true;
      isWaiting = false;
      stopWatchingQueue();

      try {
        callbacks.onMatched(await sessionFromMatch(String(queue.match_id), currentUid));
      } catch (error) {
        callbacks.onError(messageMatchErrorMessage(error));
      }
    }

    async function pollOwnQueue() {
      if (matchHandled || isCancelled) {
        return;
      }

      const { data, error } = await supabase
        .from('message_match_queue')
        .select('*')
        .eq('user_id', currentUid)
        .maybeSingle();

      if (error) {
        callbacks.onError(messageMatchErrorMessage(error));
        return;
      }

      const queue = data as QueueRow | null;

      if (queue?.status === 'matched' && queue.match_id) {
        await openMatchedQueue(queue);
      }
    }

    pollTimer = setInterval(() => {
      void pollOwnQueue();
    }, QUEUE_POLL_MS);

    channel = supabase
      .channel(`message-queue-${currentUid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_match_queue', filter: `user_id=eq.${currentUid}` },
        (payload) => {
          const queue = payload.new as QueueRow | null;

          if (!queue || queue.status !== 'matched' || !queue.match_id || isCancelled) {
            return;
          }

          void openMatchedQueue(queue);
        }
      )
      .subscribe();
  })().catch((error) => callbacks.onError(messageMatchErrorMessage(error)));

  return () => {
    isCancelled = true;
    stopWatchingQueue();

    void getCurrentSupabaseUser().then((user) => {
      if (user && isWaiting && !matchHandled) {
        void supabase
          .from('message_match_queue')
          .update({
            status: 'cancelled',
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id);
      }
    });
  };
}

export function subscribeSupabaseMessages(
  matchId: string,
  onMessages: (messages: Message[]) => void,
  onError: (message: string) => void
) {
  const supabase = getSupabaseClient();
  let currentUid = '';

  if (!supabase) {
    onError(supabaseMissingConfigMessage());
    return () => undefined;
  }

  const supabaseClient = supabase;

  async function loadMessages() {
    const user = await getCurrentSupabaseUser();
    currentUid = user?.id ?? currentUid;
    const { data, error } = await supabaseClient
      .from('messages')
      .select('*')
      .eq('match_id', matchId)
      .order('sent_at_ms', { ascending: true });

    if (error) {
      onError(messageMatchErrorMessage(error));
      return;
    }

    onMessages(
      ((data ?? []) as Array<{ id: string; sender_id?: string; body?: string; sent_at_ms?: number }>).map((item) => {
        const senderId = String(item.sender_id ?? 'system');

        return {
          id: item.id,
          sender: senderId === 'system' ? 'system' : senderId === currentUid ? 'me' : 'match',
          body: String(item.body ?? ''),
          sentAt: new Date(Number(item.sent_at_ms ?? Date.now()))
        };
      })
    );
  }

  void loadMessages();

  const channel = supabaseClient
    .channel(`message-list-${matchId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` }, () => {
      void loadMessages();
    })
    .subscribe();

  return () => {
    void supabaseClient.removeChannel(channel);
  };
}

export function subscribeSupabaseMatchState(
  matchId: string,
  onState: (state: SupabaseLiveMatchState) => void,
  onError: (message: string) => void
) {
  const supabase = getSupabaseClient();
  let currentUid = '';

  if (!supabase) {
    onError(supabaseMissingConfigMessage());
    return () => undefined;
  }

  const supabaseClient = supabase;

  async function loadState() {
    const user = await getCurrentSupabaseUser();
    currentUid = user?.id ?? currentUid;
    const { data, error } = await supabaseClient
      .from('message_matches')
      .select('*')
      .eq('id', matchId)
      .single();

    if (error || !data) {
      onError(messageMatchErrorMessage(error));
      return;
    }

    const match = data as MatchRow;
    const savedBy = Array.isArray(match.saved_by) ? match.saved_by : [];

    onState({
      savedByMe: savedBy.includes(currentUid),
      savedByMatch: savedBy.some((id) => id !== currentUid),
      status: String(match.status ?? 'active') as SupabaseLiveMatchState['status'],
      endsAtMs: Number(match.ends_at_ms ?? Date.now() + MATCH_SECONDS * 1000)
    });
  }

  void loadState();

  const channel = supabaseClient
    .channel(`message-match-${matchId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_matches', filter: `id=eq.${matchId}` }, () => {
      void loadState();
    })
    .subscribe();

  return () => {
    void supabaseClient.removeChannel(channel);
  };
}

export async function sendSupabaseLiveMessage(matchId: string, body: string) {
  const supabase = getSupabaseClient();
  const user = await getCurrentSupabaseUser();

  if (!supabase || !user) {
    throw new Error('Live chat needs Supabase sign-in.');
  }

  const { data: match, error: matchError } = await supabase
    .from('message_matches')
    .select('status, ends_at_ms')
    .eq('id', matchId)
    .single();

  if (matchError || !match || match.status !== 'active') {
    throw new Error('This live chat has already ended.');
  }

  if (Date.now() >= Number(match.ends_at_ms ?? 0)) {
    throw new Error('This live chat timer already ended.');
  }

  const sentAtMs = Date.now();
  const { error } = await supabase.from('messages').insert({
    match_id: matchId,
    sender_id: user.id,
    body,
    sent_at_ms: sentAtMs,
    sent_at: new Date(sentAtMs).toISOString()
  });

  if (error) {
    throw new Error(error.message || 'Live chat could not send this message yet.');
  }

  await supabase
    .from('message_matches')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', matchId);
}

export async function saveSupabaseLiveMessageMatch(matchId: string) {
  const supabase = getSupabaseClient();
  const user = await getCurrentSupabaseUser();

  if (!supabase || !user) {
    throw new Error('Live match needs Supabase sign-in.');
  }

  const { data } = await supabase.from('message_matches').select('saved_by').eq('id', matchId).single();
  const savedBy = Array.isArray(data?.saved_by) ? data.saved_by.map(String) : [];
  const nextSavedBy = savedBy.includes(user.id) ? savedBy : [...savedBy, user.id];

  const { error } = await supabase
    .from('message_matches')
    .update({ saved_by: nextSavedBy, updated_at: new Date().toISOString() })
    .eq('id', matchId);

  if (error) {
    throw new Error(error.message || 'Live match could not be saved.');
  }
}

export async function recordSupabaseLiveMessageSafety(matchId: string, action: 'report' | 'block') {
  const supabase = getSupabaseClient();
  const user = await getCurrentSupabaseUser();

  if (!supabase || !user) {
    throw new Error('Live safety needs Supabase sign-in.');
  }

  const { data } = await supabase.from('message_matches').select('*').eq('id', matchId).single();
  const match = data as MatchRow | null;
  const participantIds = Array.isArray(match?.participant_ids) ? match?.participant_ids : [];
  const otherUid = participantIds.find((id) => id !== user.id) ?? '';
  const otherProfile = publicProfileFromUnknown(otherUid ? match?.participants?.[otherUid] : null);
  const arrayKey = action === 'report' ? 'reported_by' : 'blocked_by';
  const existing = Array.isArray(match?.[arrayKey]) ? (match?.[arrayKey] as string[]) : [];

  await supabase
    .from('message_matches')
    .update({
      [arrayKey]: existing.includes(user.id) ? existing : [...existing, user.id],
      status: action === 'block' ? 'blocked' : match?.status ?? 'active',
      updated_at: new Date().toISOString()
    })
    .eq('id', matchId);

  if (action === 'block' && otherUid) {
    await supabase.from('blocks').upsert({
      id: `${user.id}_${otherUid}`,
      blocker_id: user.id,
      blocked_id: otherUid,
      match_id: matchId,
      source: 'message_match',
      created_at: new Date().toISOString()
    });
  }

  if (action === 'report' && otherUid) {
    await submitSafetyReport({
      source: 'message_match',
      action: 'report',
      actorId: user.id,
      targetId: otherUid,
      targetNickname: otherProfile?.nickname,
      matchId,
      reason: 'Reported from 2-minute message match'
    });
  }
}

export async function closeSupabaseLiveMessageMatch(matchId: string, status: 'expired' | 'saved') {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return;
  }

  await supabase
    .from('message_matches')
    .update({
      status,
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', matchId)
    .eq('status', 'active');
}
