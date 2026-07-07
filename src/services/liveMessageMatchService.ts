import type { Message, UserProfile } from '../types';
import type { MessageMatchSession } from './contracts';
import {
  closeSupabaseLiveMessageMatch,
  recordSupabaseLiveMessageSafety,
  saveSupabaseLiveMessageMatch,
  sendSupabaseLiveMessage,
  sendSupabaseSavedMatchMessage,
  startSupabaseMessageMatching,
  subscribeSupabaseMatchState,
  subscribeSupabaseMessages,
  type SupabaseLiveMatchState
} from './supabaseMessageMatchService';

type LiveMatchCallbacks = {
  onWaiting: (message: string) => void;
  onMatched: (session: MessageMatchSession) => void;
  onError: (message: string) => void;
};

export type LiveMatchState = SupabaseLiveMatchState;

export function startLiveMessageMatching(profile: UserProfile, callbacks: LiveMatchCallbacks) {
  return startSupabaseMessageMatching(profile, callbacks);
}

export function subscribeLiveMessages(
  matchId: string,
  onMessages: (messages: Message[]) => void,
  onError: (message: string) => void
) {
  return subscribeSupabaseMessages(matchId, onMessages, onError);
}

export function subscribeSavedMatchMessages(
  matchId: string,
  onMessages: (messages: Message[]) => void,
  onError: (message: string) => void
) {
  return subscribeSupabaseMessages(matchId, onMessages, onError);
}

export function subscribeLiveMatchState(
  matchId: string,
  onState: (state: LiveMatchState) => void,
  onError: (message: string) => void
) {
  return subscribeSupabaseMatchState(matchId, onState, onError);
}

export function sendLiveMessage(matchId: string, body: string) {
  return sendSupabaseLiveMessage(matchId, body);
}

export function sendSavedMatchMessage(matchId: string, body: string) {
  return sendSupabaseSavedMatchMessage(matchId, body);
}

export function saveLiveMessageMatch(matchId: string) {
  return saveSupabaseLiveMessageMatch(matchId);
}

export function recordLiveMessageSafety(matchId: string, action: 'report' | 'block') {
  return recordSupabaseLiveMessageSafety(matchId, action);
}

export function closeLiveMessageMatch(matchId: string, status: 'expired' | 'saved') {
  return closeSupabaseLiveMessageMatch(matchId, status);
}
