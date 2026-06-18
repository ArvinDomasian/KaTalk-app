export type ActiveTab = 'message' | 'rooms' | 'video' | 'profile';

export type UserProfile = {
  id: string;
  nickname: string;
  avatarUrl?: string;
  dateOfBirth: string;
  gender: string;
  preference: string;
  ageRange: string;
  interests: string[];
  comfort: 'shy' | 'balanced' | 'open';
  authMethod?: 'apple' | 'google' | 'phone';
  authContact?: string;
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
  acceptedRules: boolean;
};

export type MatchStatus = 'idle' | 'searching' | 'active' | 'expired' | 'saved';

export type Message = {
  id: string;
  sender: 'me' | 'match' | 'system';
  body: string;
  sentAt: Date;
};

export type Candidate = {
  id: string;
  nickname: string;
  age: number;
  distanceMiles: number;
  interests: string[];
  prompt: string;
  avatarColor: string;
  photoUrl: string;
};

export type VoiceRoom = {
  id: string;
  title: string;
  mood: string;
  participants: number;
  isJoined: boolean;
  host: string;
};

export type ProfilePost = {
  id: string;
  profileId: string;
  authorNickname: string;
  body: string;
  photoUrl?: string;
  createdAt: Date;
};
