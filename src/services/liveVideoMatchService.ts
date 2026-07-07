import type { UserProfile } from '../types';
import {
  getSupabaseAgoraJoinCredentials,
  leaveSupabaseLiveVideoMatch,
  recordSupabaseLiveVideoSafety,
  startSupabaseVideoMatching,
  subscribeSupabaseLiveVideoMatchState,
  supabaseAgoraUidFor,
  type SupabaseAgoraJoinCredentials,
  type SupabaseLiveVideoMatchState,
  type SupabaseLiveVideoSession
} from './supabaseVideoMatchService';

declare const process: {
  env: Record<string, string | undefined>;
};

type VideoMatchCallbacks = {
  onSearching: (message: string) => void;
  onMatched: (session: LiveVideoSession) => void;
  onError: (message: string) => void;
};

function cleanEnvValue(value?: string) {
  return value?.trim().replace(/,$/, '').replace(/^["']|["']$/g, '') ?? '';
}

export type LiveVideoSession = SupabaseLiveVideoSession;
export type LiveVideoMatchState = SupabaseLiveVideoMatchState;
export type AgoraJoinCredentials = SupabaseAgoraJoinCredentials;

export function startLiveVideoMatching(profile: UserProfile, callbacks: VideoMatchCallbacks) {
  return startSupabaseVideoMatching(profile, callbacks);
}

export function subscribeLiveVideoMatchState(
  matchId: string,
  onState: (state: LiveVideoMatchState) => void,
  onError: (message: string) => void
) {
  return subscribeSupabaseLiveVideoMatchState(matchId, onState, onError);
}

export function leaveLiveVideoMatch(matchId: string) {
  return leaveSupabaseLiveVideoMatch(matchId);
}

export function recordLiveVideoSafety(matchId: string, action: 'report' | 'block') {
  return recordSupabaseLiveVideoSafety(matchId, action);
}

export function agoraUidFor(userId: string) {
  return supabaseAgoraUidFor(userId);
}

export function getAgoraSetupError() {
  return cleanEnvValue(process.env.EXPO_PUBLIC_AGORA_APP_ID)
    ? null
    : 'Agora is not configured yet. Add EXPO_PUBLIC_AGORA_APP_ID to .env, then rebuild the installed app.';
}

export function getAgoraJoinCredentials(channelName: string) {
  return getSupabaseAgoraJoinCredentials(channelName);
}
