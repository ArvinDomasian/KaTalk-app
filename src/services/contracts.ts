import type { Candidate, UserProfile, VoiceRoom } from '../types';

export type MessageMatchSession = {
  id: string;
  candidate: Candidate;
  openingPrompt: string;
  durationSeconds: number;
  startsAt: Date;
  endsAt: Date;
};

export type SafetyEvent = {
  source: 'message_match' | 'voice_room' | 'video' | 'nearby_profile';
  action: 'report' | 'block';
  targetId: string;
  actorId: string;
  createdAt: Date;
};

export type VideoSession = {
  id: string;
  candidate: Candidate;
  agoraChannelName: string;
  cameraStartsEnabled: false;
  microphoneStartsMuted: true;
};

export type SavedMatch = {
  id: string;
  userId: string;
  candidate: Candidate;
  createdAt: Date;
  revealState: 'anonymous' | 'mutual_reveal';
};

export type AppServices = {
  messageMatches: {
    start(profile: UserProfile): Promise<MessageMatchSession>;
  };
  savedMatches: {
    list(profile: UserProfile): Promise<SavedMatch[]>;
    save(profile: UserProfile, candidate: Candidate): Promise<SavedMatch>;
  };
  rooms: {
    list(profile: UserProfile): Promise<VoiceRoom[]>;
  };
  nearby: {
    list(profile: UserProfile): Promise<Candidate[]>;
  };
  video: {
    start(profile: UserProfile): Promise<VideoSession>;
  };
  safety: {
    record(event: Omit<SafetyEvent, 'createdAt'>): Promise<SafetyEvent>;
  };
};
