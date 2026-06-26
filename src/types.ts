export type ActiveTab = 'message' | 'rooms' | 'video' | 'profile';

export type ThemeMode = 'light' | 'dark';

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
  subscription?: SubscriptionAccess;
};

export type SubscriptionAccess = {
  tier: 'free' | 'plus';
  isActive: boolean;
  entitlementId: string;
  productId?: string;
  store?: string;
  expiresAt?: string | null;
  updatedAt: string;
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
  topic: string;
  participants: number;
  isJoined: boolean;
  host: string;
  speakers: string[];
};

export type ProfilePost = {
  id: string;
  profileId: string;
  authorNickname: string;
  body: string;
  photoUrl?: string;
  emoji?: string;
  voiceUrl?: string;
  musicUrl?: string;
  musicTitle?: string;
  visibility: 'public' | 'private';
  createdAt: Date;
};
